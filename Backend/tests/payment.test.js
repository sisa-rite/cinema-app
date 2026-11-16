import "dotenv/config";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/db.js";
import { expireHolds } from "../src/jobs/expiry.js";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const createdReferences = [];
const createdScreeningIds = [];

after(async () => {
  if (createdReferences.length > 0) {
    await pool.query(
      `DELETE FROM payments
       WHERE booking_id IN (
         SELECT id FROM bookings WHERE reference = ANY($1::varchar[])
       )`,
      [createdReferences],
    );
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
    `SELECT id, hall_id, base_price
     FROM screenings
     WHERE published = true AND starts_at > now()
     ORDER BY starts_at
     LIMIT 1`,
  );
  assert.ok(rows.length > 0, "expected an upcoming published screening");
  return rows[0];
}

async function findAvailableSeat(screeningId) {
  const { rows } = await pool.query(
    `SELECT seat.id
     FROM seats AS seat
     WHERE seat.hall_id = (
       SELECT hall_id FROM screenings WHERE id = $1
     )
       AND seat.type = 'normal'
       AND NOT EXISTS (
         SELECT 1
         FROM tickets
         WHERE tickets.screening_id = $1 AND tickets.seat_id = seat.id
       )
     ORDER BY seat.id
     LIMIT 1`,
    [screeningId],
  );
  assert.ok(rows.length > 0, "expected an available seat");
  return rows[0].id;
}

function uniqueEmail() {
  return `payment-${randomUUID()}@test.rio`;
}

async function holdSeat(screeningId, seatId, email = uniqueEmail()) {
  const response = await request(app)
    .post("/api/bookings")
    .send({ screeningId, seatIds: [seatId], email });
  if (response.status === 201) createdReferences.push(response.body.reference);
  return response;
}

async function pay(reference, email, acceptNoRefund = true) {
  return request(app)
    .post(`/api/bookings/${reference}/pay`)
    .send({ email, acceptNoRefund });
}

async function paymentRows(reference) {
  const { rows } = await pool.query(
    `SELECT payment.method, payment.amount, booking.total_price
     FROM payments AS payment
     JOIN bookings AS booking ON booking.id = payment.booking_id
     WHERE booking.reference = $1`,
    [reference],
  );
  return rows;
}

test(
  "payment pays a hold and returns its paid booking",
  { skip: !hasDatabase },
  async () => {
    const screening = await findScreening();
    const seatId = await findAvailableSeat(screening.id);
    const email = uniqueEmail();
    const hold = await holdSeat(screening.id, seatId, email);
    assert.equal(hold.status, 201);

    const response = await pay(hold.body.reference, email);
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "paid");
    assert.ok(Number.isFinite(Date.parse(response.body.paidAt)));
    assert.equal(response.body.totalPrice, hold.body.totalPrice);

    const payments = await paymentRows(hold.body.reference);
    assert.equal(payments.length, 1);
    assert.equal(payments[0].method, "online");
    assert.equal(Number(payments[0].amount), Number(payments[0].total_price));
  },
);

test(
  "paying the same booking again does not create another payment",
  { skip: !hasDatabase },
  async () => {
    const screening = await findScreening();
    const seatId = await findAvailableSeat(screening.id);
    const email = uniqueEmail();
    const hold = await holdSeat(screening.id, seatId, email);
    assert.equal(hold.status, 201);

    const firstPayment = await pay(hold.body.reference, email);
    const secondPayment = await pay(hold.body.reference, email);

    assert.equal(firstPayment.status, 200);
    assert.equal(secondPayment.status, 200);
    assert.equal(secondPayment.body.status, "paid");
    assert.equal(secondPayment.body.paidAt, firstPayment.body.paidAt);
    assert.equal((await paymentRows(hold.body.reference)).length, 1);
  },
);

test(
  "parallel payment requests create exactly one payment",
  { skip: !hasDatabase },
  async () => {
    const screening = await findScreening();
    const seatId = await findAvailableSeat(screening.id);
    const email = uniqueEmail();
    const hold = await holdSeat(screening.id, seatId, email);
    assert.equal(hold.status, 201);

    const responses = await Promise.all([
      pay(hold.body.reference, email),
      pay(hold.body.reference, email),
    ]);

    assert.deepEqual(
      responses.map(({ status }) => status),
      [200, 200],
    );
    assert.ok(responses.every(({ body }) => body.status === "paid"));
    assert.equal((await paymentRows(hold.body.reference)).length, 1);
  },
);

test(
  "payment requires e-mail and no-refund confirmation",
  { skip: !hasDatabase },
  async () => {
    const reference = "RIO-invalid-payment";
    for (const acceptNoRefund of [undefined, false]) {
      const response = await request(app)
        .post(`/api/bookings/${reference}/pay`)
        .send({ email: "guest@example.com", acceptNoRefund });

      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "VALIDATION_ERROR");
      assert.equal(
        typeof response.body.error.details.fields.acceptNoRefund,
        "string",
      );
    }

    const missingEmail = await request(app)
      .post(`/api/bookings/${reference}/pay`)
      .send({ acceptNoRefund: true });
    assert.equal(missingEmail.status, 400);
    assert.equal(missingEmail.body.error.code, "VALIDATION_ERROR");
    assert.equal(typeof missingEmail.body.error.details.fields.email, "string");
  },
);

test(
  "payment does not reveal a booking for the wrong e-mail",
  { skip: !hasDatabase },
  async () => {
    const screening = await findScreening();
    const seatId = await findAvailableSeat(screening.id);
    const email = uniqueEmail();
    const hold = await holdSeat(screening.id, seatId, email);
    assert.equal(hold.status, 201);

    const response = await pay(hold.body.reference, "wrong@example.com");
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "BOOKING_NOT_FOUND");
  },
);

test(
  "payment rejects an expired hold",
  { skip: !hasDatabase },
  async () => {
    const screening = await findScreening();
    const seatId = await findAvailableSeat(screening.id);
    const email = uniqueEmail();
    const hold = await holdSeat(screening.id, seatId, email);
    assert.equal(hold.status, 201);

    await pool.query(
      `UPDATE bookings
       SET hold_expires_at = now() - interval '1 minute'
       WHERE reference = $1`,
      [hold.body.reference],
    );

    const response = await pay(hold.body.reference, email);
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "HOLD_EXPIRED");
  },
);

test(
  "payment rejects a hold for a screening that has started",
  { skip: !hasDatabase },
  async () => {
    const sourceScreening = await findScreening();
    const { rows } = await pool.query(
      `INSERT INTO screenings
         (movie_id, hall_id, starts_at, base_price, is_premiere, published)
       SELECT movie_id, hall_id, now() - interval '1 hour',
              base_price, is_premiere, true
       FROM screenings
       WHERE id = $1
       RETURNING id, hall_id, base_price`,
      [sourceScreening.id],
    );
    const screening = rows[0];
    createdScreeningIds.push(screening.id);

    const seatId = await findAvailableSeat(screening.id);
    const email = uniqueEmail();
    const reference = `FR007-${randomUUID()}`;
    createdReferences.push(reference);
    const { rows: bookings } = await pool.query(
      `INSERT INTO bookings
         (reference, guest_email, screening_id, status, hold_expires_at, total_price)
       VALUES ($1, $2, $3, 'held', now() + interval '15 minutes', $4)
       RETURNING id`,
      [reference, email, screening.id, screening.base_price],
    );
    await pool.query(
      `INSERT INTO tickets
         (booking_id, screening_id, seat_id, ticket_type, price)
       VALUES ($1, $2, $3, 'adult', $4)`,
      [bookings[0].id, screening.id, seatId, screening.base_price],
    );

    const response = await pay(reference, email);
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "SALES_CLOSED");
  },
);

test(
  "payment marks seats sold and paid bookings are not expired",
  { skip: !hasDatabase },
  async () => {
    const screening = await findScreening();
    const seatId = await findAvailableSeat(screening.id);
    const email = uniqueEmail();
    const hold = await holdSeat(screening.id, seatId, email);
    assert.equal(hold.status, 201);

    const payment = await pay(hold.body.reference, email);
    assert.equal(payment.status, 200);
    const seatMap = await request(app).get(
      `/api/screenings/${screening.id}/seats`,
    );
    assert.equal(seatMap.status, 200);
    assert.equal(
      seatMap.body.seats.find(({ id }) => id === seatId).state,
      "sold",
    );

    const booking = await request(app)
      .get(`/api/bookings/${hold.body.reference}`)
      .query({ email });
    assert.equal(booking.status, 200);
    assert.equal(booking.body.status, "paid");
    assert.equal(booking.body.paidAt, payment.body.paidAt);

    await pool.query(
      `UPDATE bookings
       SET hold_expires_at = now() - interval '1 minute'
       WHERE reference = $1`,
      [hold.body.reference],
    );
    await expireHolds();

    const { rows: bookingRows } = await pool.query(
      "SELECT status FROM bookings WHERE reference = $1",
      [hold.body.reference],
    );
    const { rows: ticketRows } = await pool.query(
      `SELECT ticket.id
       FROM tickets AS ticket
       JOIN bookings AS booking ON booking.id = ticket.booking_id
       WHERE booking.reference = $1`,
      [hold.body.reference],
    );
    assert.equal(bookingRows[0].status, "paid");
    assert.equal(ticketRows.length, 1);
  },
);
