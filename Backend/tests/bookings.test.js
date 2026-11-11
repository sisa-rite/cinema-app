import "dotenv/config";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/db.js";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const createdReferences = [];
const createdScreeningIds = [];

after(async () => {
  if (createdReferences.length > 0) {
    await pool.query(
      `DELETE FROM tickets
       WHERE booking_id IN (
         SELECT id FROM bookings WHERE reference = ANY($1::varchar[])
       )`,
      [createdReferences],
    );
    await pool.query(
      "DELETE FROM bookings WHERE reference = ANY($1::varchar[])",
      [createdReferences],
    );
  }
  if (createdScreeningIds.length > 0) {
    await pool.query(
      "DELETE FROM screenings WHERE id = ANY($1::integer[])",
      [createdScreeningIds],
    );
  }
  await pool.end();
});

async function findScreening() {
  const { rows } = await pool.query(
    `SELECT screening.id, screening.hall_id, screening.base_price
     FROM screenings AS screening
     WHERE screening.published = true
       AND screening.starts_at > NOW()
       AND EXISTS (
         SELECT 1 FROM seats
         WHERE seats.hall_id = screening.hall_id
           AND seats.type = 'normal'
       )
     ORDER BY RANDOM()
     LIMIT 1`,
  );
  assert.ok(rows.length > 0, "expected a future published screening");
  return rows[0];
}

async function findAvailableSeats(screeningId, limit) {
  const { rows } = await pool.query(
    `SELECT seat.id
     FROM seats AS seat
     WHERE seat.hall_id = (
       SELECT hall_id FROM screenings WHERE id = $1
     )
       AND seat.type = 'normal'
       AND NOT EXISTS (
         SELECT 1 FROM tickets
         WHERE tickets.screening_id = $1 AND tickets.seat_id = seat.id
       )
     ORDER BY RANDOM()
     LIMIT $2`,
    [screeningId, limit],
  );
  assert.equal(rows.length, limit, "expected enough available seats");
  return rows.map(({ id }) => id);
}

async function holdSeats(screeningId, seatIds, email = "guest@example.com") {
  const response = await request(app)
    .post("/api/bookings")
    .send({ screeningId, seatIds, email });
  if (response.status === 201) {
    createdReferences.push(response.body.reference);
  }
  return response;
}

test(
  "POST /api/bookings validates the request body",
  { skip: !hasDatabase },
  async () => {
    const invalidRequests = [
      { seatIds: [], email: "guest@example.com", field: "seatIds" },
      {
        seatIds: Array.from({ length: 11 }, (_, index) => index + 1),
        email: "guest@example.com",
        field: "seatIds",
      },
      { seatIds: [1, 1], email: "guest@example.com", field: "seatIds" },
      { seatIds: [1], email: "not-an-email", field: "email" },
      {
        seatIds: [1],
        email: `${"a".repeat(243)}@example.com`,
        field: "email",
      },
    ];

    for (const invalid of invalidRequests) {
      const response = await request(app)
        .post("/api/bookings")
        .send({
          screeningId: 1,
          seatIds: invalid.seatIds,
          email: invalid.email,
        });

      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "VALIDATION_ERROR");
      assert.equal(
        typeof response.body.error.details.fields[invalid.field],
        "string",
      );
    }
  },
);

test(
  "POST /api/bookings creates a 15-minute hold and updates the seat map",
  { skip: !hasDatabase },
  async () => {
    const screening = await findScreening();
    const [seatId, secondSeatId] = await findAvailableSeats(screening.id, 2);
    const response = await holdSeats(
      screening.id,
      [secondSeatId, seatId],
      "Guest@Example.com",
    );

    assert.equal(response.status, 201);
    assert.deepEqual(Object.keys(response.body).sort(), [
      "email",
      "holdExpiresAt",
      "id",
      "reference",
      "screeningId",
      "seats",
      "status",
      "totalPrice",
    ]);
    assert.match(response.body.reference, /^RIO-[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(response.body.status, "held");
    assert.equal(response.body.screeningId, screening.id);
    assert.equal(response.body.email, "guest@example.com");
    assert.equal(
      response.body.totalPrice,
      Number(screening.base_price) * 2,
    );
    const holdTimeRemaining =
      Date.parse(response.body.holdExpiresAt) - Date.now();
    assert.ok(holdTimeRemaining >= 14.5 * 60_000);
    assert.ok(holdTimeRemaining <= 15.5 * 60_000);
    const { rows: seatOrder } = await pool.query(
      `SELECT id, row_number, seat_number
       FROM seats
       WHERE id = ANY($1::integer[])
       ORDER BY row_number, seat_number`,
      [[seatId, secondSeatId]],
    );
    assert.deepEqual(
      response.body.seats.map(({ id }) => id),
      seatOrder.map(({ id }) => id),
    );

    const seatMap = await request(app).get(
      `/api/screenings/${screening.id}/seats`,
    );
    assert.equal(seatMap.status, 200);
    for (const seatIdToCheck of [seatId, secondSeatId]) {
      assert.equal(
        seatMap.body.seats.find(({ id }) => id === seatIdToCheck).state,
        "held",
      );
    }
  },
);

test(
  "POST /api/bookings reports owner and held seats as unavailable",
  { skip: !hasDatabase },
  async () => {
    const screening = await findScreening();
    const { rows: ownerRows } = await pool.query(
      `SELECT seat.id
       FROM seats AS seat
       WHERE seat.hall_id = $1 AND seat.type = 'owner' AND seat.seat_number = 1`,
      [screening.hall_id],
    );
    assert.equal(ownerRows.length, 1);
    const { rows: otherHallSeats } = await pool.query(
      `SELECT id
       FROM seats
       WHERE hall_id <> $1 AND type = 'normal'
       ORDER BY RANDOM()
       LIMIT 1`,
      [screening.hall_id],
    );
    assert.equal(otherHallSeats.length, 1);
    const [heldSeatId, otherSeatId] = await findAvailableSeats(screening.id, 2);
    const held = await holdSeats(screening.id, [heldSeatId]);
    assert.equal(held.status, 201);

    const response = await request(app)
      .post("/api/bookings")
      .send({
        screeningId: screening.id,
        seatIds: [
          ownerRows[0].id,
          heldSeatId,
          otherSeatId,
          otherHallSeats[0].id,
        ],
        email: "guest@example.com",
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "SEATS_UNAVAILABLE");
    assert.deepEqual(
      response.body.error.details.seatIds.sort((a, b) => a - b),
      [ownerRows[0].id, heldSeatId, otherHallSeats[0].id].sort(
        (a, b) => a - b,
      ),
    );
  },
);

test(
  "POST /api/bookings rejects screenings that have already started",
  { skip: !hasDatabase },
  async () => {
    const screening = await findScreening();
    const { rows } = await pool.query(
      `INSERT INTO screenings
         (movie_id, hall_id, starts_at, base_price, is_premiere, published)
       SELECT movie_id, hall_id, NOW() - INTERVAL '1 hour',
              base_price, is_premiere, true
       FROM screenings
       WHERE id = $1
       RETURNING id`,
      [screening.id],
    );
    const pastScreeningId = rows[0].id;
    createdScreeningIds.push(pastScreeningId);
    const [seatId] = await findAvailableSeats(pastScreeningId, 1);

    const response = await request(app)
      .post("/api/bookings")
      .send({
        screeningId: pastScreeningId,
        seatIds: [seatId],
        email: "guest@example.com",
      });

    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "SALES_CLOSED");
  },
);

test(
  "expired holds are cleaned up and no longer block a new hold",
  { skip: !hasDatabase },
  async () => {
    const screening = await findScreening();
    const [seatId] = await findAvailableSeats(screening.id, 1);
    const oldHold = await holdSeats(screening.id, [seatId]);
    assert.equal(oldHold.status, 201);

    await pool.query(
      `UPDATE bookings
       SET hold_expires_at = NOW() - INTERVAL '1 minute'
       WHERE reference = $1`,
      [oldHold.body.reference],
    );

    const newHold = await holdSeats(screening.id, [seatId], "new@example.com");
    assert.equal(newHold.status, 201);
    const { rows } = await pool.query(
      "SELECT status FROM bookings WHERE reference = $1",
      [oldHold.body.reference],
    );
    assert.equal(rows[0].status, "expired");

    const { rows: tickets } = await pool.query(
      `SELECT ticket.id
       FROM tickets AS ticket
       JOIN bookings AS booking ON booking.id = ticket.booking_id
       WHERE booking.reference = $1`,
      [oldHold.body.reference],
    );
    assert.equal(tickets.length, 0);
  },
);

test(
  "GET /api/bookings/:reference requires the matching e-mail and reports expired holds",
  { skip: !hasDatabase },
  async () => {
    const screening = await findScreening();
    const [seatId] = await findAvailableSeats(screening.id, 1);
    const hold = await holdSeats(screening.id, [seatId], "Guest@Example.com");
    assert.equal(hold.status, 201);

    const correctEmail = await request(app)
      .get(`/api/bookings/${hold.body.reference}`)
      .query({ email: "GUEST@example.com" });
    assert.equal(correctEmail.status, 200);
    assert.deepEqual(correctEmail.body, hold.body);

    const wrongEmail = await request(app)
      .get(`/api/bookings/${hold.body.reference}`)
      .query({ email: "wrong@example.com" });
    assert.equal(wrongEmail.status, 404);
    assert.equal(wrongEmail.body.error.code, "BOOKING_NOT_FOUND");

    await pool.query(
      `UPDATE bookings
       SET hold_expires_at = NOW() - INTERVAL '1 minute'
       WHERE reference = $1`,
      [hold.body.reference],
    );
    const expired = await request(app)
      .get(`/api/bookings/${hold.body.reference}`)
      .query({ email: "guest@example.com" });
    assert.equal(expired.status, 200);
    assert.equal(expired.body.status, "expired");
  },
);
