import "dotenv/config";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/db.js";
import { expireHolds } from "../src/jobs/expiry.js";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const references = ["expired", "active", "paid"].map(
  (label) => `FR005-${label}-${randomUUID()}`,
);

after(async () => {
  if (!hasDatabase) return;

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
});

test(
  "expiry job expires only old holds and releases their seats",
  { skip: !hasDatabase },
  async () => {
    const { rows: seats } = await pool.query(
      `WITH eligible_screenings AS (
         SELECT screening.id
         FROM screenings AS screening
         WHERE screening.published = true
           AND screening.starts_at > now()
           AND (
             SELECT count(*)
             FROM seats AS seat
             WHERE seat.hall_id = screening.hall_id
               AND seat.type = 'normal'
               AND NOT EXISTS (
                 SELECT 1
                 FROM tickets AS ticket
                 WHERE ticket.screening_id = screening.id
                   AND ticket.seat_id = seat.id
               )
           ) >= 3
         ORDER BY screening.starts_at
         LIMIT 1
       )
       SELECT screening.id AS screening_id, seat.id AS seat_id
       FROM eligible_screenings AS eligible
       JOIN screenings AS screening ON screening.id = eligible.id
       JOIN seats AS seat ON seat.hall_id = screening.hall_id
       WHERE seat.type = 'normal'
         AND NOT EXISTS (
           SELECT 1
           FROM tickets AS ticket
           WHERE ticket.screening_id = screening.id
             AND ticket.seat_id = seat.id
         )
       ORDER BY seat.pos_y, seat.pos_x
       LIMIT 3`,
    );
    assert.equal(
      seats.length,
      3,
      "expected three free seats in an upcoming screening",
    );

    const screeningId = seats[0].screening_id;
    const bookingIds = [];
    const statuses = ["held", "held", "paid"];
    const expirations = [
      new Date(Date.now() - 60_000),
      new Date(Date.now() + 10 * 60_000),
      new Date(Date.now() - 60_000),
    ];

    for (let index = 0; index < references.length; index += 1) {
      const { rows } = await pool.query(
        `INSERT INTO bookings
           (reference, guest_email, screening_id, status, hold_expires_at, total_price)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          references[index],
          "expiry-test@example.com",
          screeningId,
          statuses[index],
          expirations[index],
          1,
        ],
      );
      bookingIds.push(rows[0].id);

      await pool.query(
        `INSERT INTO tickets
           (booking_id, screening_id, seat_id, ticket_type, price)
         VALUES ($1, $2, $3, 'adult', $4)`,
        [rows[0].id, screeningId, seats[index].seat_id, 1],
      );
    }

    const expiredCount = await expireHolds();
    assert.ok(expiredCount >= 1);

    const { rows: bookingStates } = await pool.query(
      `SELECT id, status
       FROM bookings
       WHERE id = ANY($1::integer[])
       ORDER BY id`,
      [bookingIds],
    );
    assert.deepEqual(
      bookingStates.map(({ status }) => status),
      ["expired", "held", "paid"],
    );

    const { rows: ticketStates } = await pool.query(
      `SELECT booking_id
       FROM tickets
       WHERE booking_id = ANY($1::integer[])
       ORDER BY booking_id`,
      [bookingIds],
    );
    assert.deepEqual(
      ticketStates.map(({ booking_id }) => booking_id),
      bookingIds.slice(1).sort((a, b) => a - b),
    );

    const response = await request(app).get(
      `/api/screenings/${screeningId}/seats`,
    );
    assert.equal(response.status, 200);
    assert.equal(
      response.body.seats.find(({ id }) => id === seats[0].seat_id).state,
      "available",
    );
    assert.equal(
      response.body.seats.find(({ id }) => id === seats[1].seat_id).state,
      "held",
    );

    await expireHolds();
    const { rows: unchangedBookings } = await pool.query(
      `SELECT id, status
       FROM bookings
       WHERE id = ANY($1::integer[])
       ORDER BY id`,
      [bookingIds],
    );
    const { rows: unchangedTickets } = await pool.query(
      `SELECT booking_id
       FROM tickets
       WHERE booking_id = ANY($1::integer[])
       ORDER BY booking_id`,
      [bookingIds],
    );
    assert.deepEqual(unchangedBookings, bookingStates);
    assert.deepEqual(unchangedTickets, ticketStates);
  },
);
