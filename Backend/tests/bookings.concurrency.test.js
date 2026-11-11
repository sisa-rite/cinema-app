import "dotenv/config";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/db.js";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const usedSeatIds = new Set();
let emailSequence = 0;

after(async () => {
  if (!hasDatabase) return;

  const testEmailPattern = "concurrency-%@test.rio";
  await pool.query(
    `DELETE FROM tickets
     WHERE booking_id IN (
       SELECT id FROM bookings WHERE guest_email LIKE $1
     )`,
    [testEmailPattern],
  );
  await pool.query(
    "DELETE FROM bookings WHERE guest_email LIKE $1",
    [testEmailPattern],
  );
  await pool.end();
});

async function findAvailableSeats(count) {
  const { rows } = await pool.query(
    `SELECT id
     FROM screenings
     WHERE published = true
       AND starts_at >= NOW() + INTERVAL '1 hour'
     ORDER BY starts_at
     LIMIT 1`,
  );
  assert.ok(
    rows.length > 0,
    "expected an upcoming published screening starting at least one hour from now",
  );

  const screeningId = rows[0].id;
  const response = await request(app).get(
    `/api/screenings/${screeningId}/seats`,
  );
  assert.equal(response.status, 200);

  const availableSeats = response.body.seats
    .filter(
      ({ id, state }) => state === "available" && !usedSeatIds.has(id),
    )
    .slice(0, count);
  assert.equal(
    availableSeats.length,
    count,
    `expected ${count} different available seats`,
  );

  const seatIds = availableSeats.map(({ id }) => id);
  for (const seatId of seatIds) usedSeatIds.add(seatId);
  return { screeningId, seatIds };
}

function nextEmail() {
  return `concurrency-${emailSequence++}@test.rio`;
}

function createBookingRequest(screeningId, seatIds) {
  return request(app)
    .post("/api/bookings")
    .send({ screeningId, seatIds, email: nextEmail() });
}

async function countTickets(screeningId, seatId) {
  const { rows } = await pool.query(
    `SELECT count(*)
     FROM tickets
     WHERE screening_id = $1 AND seat_id = $2`,
    [screeningId, seatId],
  );
  return Number(rows[0].count);
}

function assertUnavailable(response, seatId) {
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, "SEATS_UNAVAILABLE");
  assert.ok(response.body.error.details.seatIds.includes(seatId));
}

test(
  "parallel booking requests for the same seat create only one hold",
  { skip: !hasDatabase },
  async () => {
    const { screeningId, seatIds } = await findAvailableSeats(1);
    const [seatId] = seatIds;
    const responses = await Promise.all([
      createBookingRequest(screeningId, seatIds),
      createBookingRequest(screeningId, seatIds),
    ]);
    const ticketCount = await countTickets(screeningId, seatId);

    assert.equal(responses.filter(({ status }) => status === 201).length, 1);
    const conflicts = responses.filter(({ status }) => status === 409);
    assert.equal(conflicts.length, 1);
    assertUnavailable(conflicts[0], seatId);
    assert.equal(ticketCount, 1);
  },
);

test(
  "ten parallel booking requests for the same seat create only one hold",
  { skip: !hasDatabase },
  async () => {
    const { screeningId, seatIds } = await findAvailableSeats(1);
    const [seatId] = seatIds;
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        createBookingRequest(screeningId, seatIds),
      ),
    );
    const ticketCount = await countTickets(screeningId, seatId);
    const conflicts = responses.filter(({ status }) => status === 409);

    assert.equal(responses.filter(({ status }) => status === 201).length, 1);
    assert.equal(conflicts.length, 9);
    for (const conflict of conflicts) assertUnavailable(conflict, seatId);
    assert.equal(ticketCount, 1);
  },
);

test(
  "overlapping parallel requests cannot both hold the shared seat",
  { skip: !hasDatabase },
  async () => {
    const { screeningId, seatIds } = await findAvailableSeats(3);
    const [seatX, seatY, seatZ] = seatIds;
    const responses = await Promise.all([
      createBookingRequest(screeningId, [seatX, seatY]),
      createBookingRequest(screeningId, [seatY, seatZ]),
    ]);
    const ticketCounts = await Promise.all(
      seatIds.map((seatId) => countTickets(screeningId, seatId)),
    );
    const conflicts = responses.filter(({ status }) => status === 409);
    const expectedTicketCounts =
      responses[0].status === 201 ? [1, 1, 0] : [0, 1, 1];

    assert.equal(responses.filter(({ status }) => status === 201).length, 1);
    assert.equal(conflicts.length, 1);
    assertUnavailable(conflicts[0], seatY);
    assert.deepEqual(ticketCounts, expectedTicketCounts);
  },
);
