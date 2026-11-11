import "dotenv/config";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/db.js";

const hasDatabase = Boolean(process.env.DATABASE_URL);

async function findSeededScreening() {
  const { rows } = await pool.query(
    `SELECT s.id
     FROM screenings AS s
     JOIN halls AS h ON h.id = s.hall_id
     WHERE s.published = true
       AND h.total_rows = 10
       AND h.seats_per_row = 10
     ORDER BY s.starts_at
     LIMIT 1`,
  );
  assert.ok(rows.length > 0, "expected a seeded screening in a 100-seat hall");
  return rows[0].id;
}

test("GET /api/screenings/:id/seats rejects invalid ids", async () => {
  const response = await request(app).get("/api/screenings/abc/seats");

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_ID");
});

test(
  "GET /api/screenings/:id/seats returns 404 for an unknown screening",
  { skip: !hasDatabase },
  async () => {
    const response = await request(app).get(
      "/api/screenings/999999/seats",
    );

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "SCREENING_NOT_FOUND");
  },
);

test(
  "seat map matches the contract and includes sorted seats",
  { skip: !hasDatabase },
  async () => {
    const screeningId = await findSeededScreening();
    const response = await request(app).get(
      `/api/screenings/${screeningId}/seats`,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body).sort(), ["screening", "seats"]);
    assert.deepEqual(
      Object.keys(response.body.screening).sort(),
      ["id", "startsAt", "basePrice", "isPremiere", "movie", "theatre", "hall"].sort(),
    );
    assert.deepEqual(
      Object.keys(response.body.screening.movie).sort(),
      ["id", "title", "durationMinutes", "ageRating", "posterUrl"].sort(),
    );
    assert.deepEqual(Object.keys(response.body.screening.theatre).sort(), [
      "city",
      "name",
    ]);
    assert.deepEqual(
      Object.keys(response.body.screening.hall).sort(),
      ["id", "name", "totalRows", "seatsPerRow"].sort(),
    );
    assert.equal(typeof response.body.screening.basePrice, "number");
    assert.ok(["oulu", "tampere"].includes(response.body.screening.theatre.city));

    const seats = response.body.seats;
    assert.equal(seats.length, 100);
    assert.deepEqual(
      seats.map(({ posY, posX }) => [posY, posX]),
      [...seats]
        .sort((a, b) => a.posY - b.posY || a.posX - b.posX)
        .map(({ posY, posX }) => [posY, posX]),
    );
    assert.equal(seats.filter(({ state }) => state === "owner").length, 1);
    assert.equal(
      seats.find(({ state }) => state === "owner").seatNumber,
      1,
    );
    assert.equal(
      seats.some(({ rowNumber, seatNumber }) =>
        rowNumber === 13 || seatNumber === 13,
      ),
      false,
    );
    for (const seat of seats) {
      assert.deepEqual(
        Object.keys(seat).sort(),
        ["id", "rowNumber", "seatNumber", "posX", "posY", "state"].sort(),
      );
    }
  },
);

test(
  "seat map calculates active and expired booking states",
  { skip: !hasDatabase },
  async () => {
    const screeningId = await findSeededScreening();
    const { rows: availableSeats } = await pool.query(
      `SELECT seat.id
       FROM seats AS seat
       LEFT JOIN tickets AS ticket
         ON ticket.screening_id = $1 AND ticket.seat_id = seat.id
       WHERE seat.hall_id = (
         SELECT hall_id FROM screenings WHERE id = $1
       )
         AND seat.type = 'normal'
         AND ticket.id IS NULL
       ORDER BY seat.pos_y, seat.pos_x
       LIMIT 5`,
      [screeningId],
    );
    assert.equal(availableSeats.length, 5);

    const states = [
      {
        status: "held",
        holdExpiresAt: new Date(Date.now() + 60_000),
        expected: "held",
      },
      {
        status: "held",
        holdExpiresAt: new Date(Date.now() - 60_000),
        expected: "available",
      },
      { status: "paid", expected: "sold" },
      {
        status: "reserved",
        paymentDeadline: new Date(Date.now() + 60_000),
        expected: "sold",
      },
      {
        status: "reserved",
        paymentDeadline: new Date(Date.now() - 60_000),
        expected: "available",
      },
    ];
    const references = [];

    try {
      for (let index = 0; index < states.length; index += 1) {
        const state = states[index];
        const reference = `FR003-${randomUUID()}`;
        references.push(reference);
        const { rows } = await pool.query(
          `INSERT INTO bookings
             (reference, guest_email, screening_id, status,
              hold_expires_at, payment_deadline, total_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            reference,
            "seat-map-test@example.com",
            screeningId,
            state.status,
            state.holdExpiresAt ?? null,
            state.paymentDeadline ?? null,
            1,
          ],
        );
        await pool.query(
          `INSERT INTO tickets
             (booking_id, screening_id, seat_id, ticket_type, price)
           VALUES ($1, $2, $3, 'adult', $4)`,
          [rows[0].id, screeningId, availableSeats[index].id, 1],
        );
      }

      const response = await request(app).get(
        `/api/screenings/${screeningId}/seats`,
      );
      assert.equal(response.status, 200);

      for (let index = 0; index < states.length; index += 1) {
        const seat = response.body.seats.find(
          ({ id }) => id === availableSeats[index].id,
        );
        assert.equal(seat.state, states[index].expected);
      }
    } finally {
      await pool.query(
        `DELETE FROM tickets
         WHERE booking_id IN (
           SELECT id FROM bookings WHERE reference = ANY($1::varchar[])
         )`,
        [references],
      );
      await pool.query(
        "DELETE FROM bookings WHERE reference = ANY($1::varchar[])",
        [references],
      );
    }
  },
);
