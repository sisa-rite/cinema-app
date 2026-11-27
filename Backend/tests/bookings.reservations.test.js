import "dotenv/config";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import request from "supertest";

process.env.JWT_SECRET = "fr015-reservations-test-secret";

const { default: app } = await import("../src/app.js");
const { default: pool } = await import("../src/db.js");
const hasDatabase = Boolean(process.env.DATABASE_URL);
const createdEmails = [];
const createdReferences = [];
const createdScreeningIds = [];
const createdMovieIds = [];

after(async () => {
  if (!hasDatabase) return;
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
  if (createdMovieIds.length > 0) {
    await pool.query("DELETE FROM movies WHERE id = ANY($1::integer[])", [
      createdMovieIds,
    ]);
  }
  if (createdEmails.length > 0) {
    await pool.query("DELETE FROM users WHERE email = ANY($1::text[])", [
      createdEmails,
    ]);
  }
  await pool.end();
});

async function registerCustomer() {
  const email = `fr015-${randomUUID()}@example.test`;
  const response = await request(app).post("/api/auth/register").send({
    name: "FR-015 Customer",
    email,
    password: "customer-password",
  });
  assert.equal(response.status, 201);
  createdEmails.push(email);
  return { ...response.body.user, token: response.body.token };
}

async function createScreening({
  dayOffset = 20,
  minuteOffset = 0,
  movieId,
  requiresWheelchairSpaces = false,
} = {}) {
  const { rows } = await pool.query(
    `INSERT INTO screenings
       (movie_id, hall_id, starts_at, base_price, is_premiere, published)
     SELECT COALESCE($3::integer, source.movie_id), source.hall_id,
            NOW() + ($1::integer * INTERVAL '1 day')
              + ($2::integer * INTERVAL '1 minute'),
            source.base_price, source.is_premiere, true
     FROM screenings AS source
     JOIN movies AS movie ON movie.id = source.movie_id
     WHERE source.published = true AND movie.published = true
       AND source.starts_at > NOW()
       AND (
         NOT $4::boolean
         OR EXISTS (
           SELECT 1 FROM halls
           WHERE halls.id = source.hall_id AND halls.wheelchair_spaces > 0
         )
       )
     ORDER BY source.starts_at
     LIMIT 1
     RETURNING id, hall_id, movie_id, base_price`,
    [dayOffset, minuteOffset, movieId ?? null, requiresWheelchairSpaces],
  );
  assert.equal(rows.length, 1, "expected a published screening to copy");
  createdScreeningIds.push(rows[0].id);
  return rows[0];
}

async function createPublishedMovie() {
  const { rows } = await pool.query(
    `INSERT INTO movies (title, duration_minutes, published)
     VALUES ($1, 100, true)
     RETURNING id`,
    [`FR-015 ${randomUUID()}`],
  );
  createdMovieIds.push(rows[0].id);
  return rows[0].id;
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
         FROM tickets AS ticket
         WHERE ticket.screening_id = $1 AND ticket.seat_id = seat.id
       )
     ORDER BY seat.row_number, seat.seat_number
     LIMIT 1`,
    [screeningId],
  );
  assert.equal(rows.length, 1, "expected an available normal seat");
  return rows[0].id;
}

async function createCustomerHold(customer, screeningId, seatId) {
  const response = await request(app)
    .post("/api/bookings")
    .set("Authorization", `Bearer ${customer.token}`)
    .send({ screeningId, seatIds: [seatId] });
  if (response.status === 201) createdReferences.push(response.body.reference);
  return response;
}

async function reserve(customer, reference) {
  return request(app)
    .post(`/api/bookings/${reference}/reserve`)
    .set("Authorization", `Bearer ${customer.token}`);
}

async function pay(customer, reference) {
  return request(app)
    .post(`/api/bookings/${reference}/pay`)
    .set("Authorization", `Bearer ${customer.token}`)
    .send({ acceptNoRefund: true });
}

function cashierToken() {
  return jwt.sign(
    { sub: "1", role: "cashier", theatreId: 1 },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: "1h" },
  );
}

test(
  "reservation ownership, role checks, deadline, and idempotency",
  { skip: !hasDatabase },
  async () => {
    const customer = await registerCustomer();
    const otherCustomer = await registerCustomer();
    const screening = await createScreening();
    const seatId = await findAvailableSeat(screening.id);
    const hold = await createCustomerHold(customer, screening.id, seatId);
    assert.equal(hold.status, 201);

    const unauthenticated = await request(app).post(
      `/api/bookings/${hold.body.reference}/reserve`,
    );
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.body.error.code, "UNAUTHORIZED");

    const staff = await request(app)
      .post(`/api/bookings/${hold.body.reference}/reserve`)
      .set("Authorization", `Bearer ${cashierToken()}`);
    assert.equal(staff.status, 403);
    assert.equal(staff.body.error.code, "FORBIDDEN");

    const wrongOwner = await reserve(otherCustomer, hold.body.reference);
    assert.equal(wrongOwner.status, 404);
    assert.equal(wrongOwner.body.error.code, "BOOKING_NOT_FOUND");

    const guestHold = await request(app)
      .post("/api/bookings")
      .send({
        screeningId: screening.id,
        seatIds: [await findAvailableSeat(screening.id)],
        email: `guest-${randomUUID()}@example.test`,
      });
    assert.equal(guestHold.status, 201);
    createdReferences.push(guestHold.body.reference);
    const guestBooking = await reserve(customer, guestHold.body.reference);
    assert.equal(guestBooking.status, 404);
    assert.equal(guestBooking.body.error.code, "BOOKING_NOT_FOUND");

    const first = await reserve(customer, hold.body.reference);
    assert.equal(first.status, 200);
    assert.equal(first.body.status, "reserved");
    const { rows: deadlines } = await pool.query(
      `SELECT FLOOR(
               EXTRACT(EPOCH FROM starts_at - INTERVAL '2 hours') * 1000
             )::bigint AS deadline_ms
       FROM screenings WHERE id = $1`,
      [screening.id],
    );
    assert.equal(Date.parse(first.body.paymentDeadline), Number(deadlines[0].deadline_ms));
    assert.ok(first.body.holdExpiresAt);
    assert.equal(first.body.paidAt, null);

    const second = await reserve(customer, hold.body.reference);
    assert.equal(second.status, 200);
    assert.deepEqual(second.body, first.body);
  },
);

test(
  "reservation rejects late reservations, expired holds, and paid bookings",
  { skip: !hasDatabase },
  async () => {
    const customer = await registerCustomer();
    const lateScreening = await createScreening({
      dayOffset: 0,
      minuteOffset: 90,
    });
    const lateHold = await createCustomerHold(
      customer,
      lateScreening.id,
      await findAvailableSeat(lateScreening.id),
    );
    assert.equal(lateHold.status, 201);
    const tooLate = await reserve(customer, lateHold.body.reference);
    assert.equal(tooLate.status, 409);
    assert.equal(tooLate.body.error.code, "RESERVATION_CLOSED");
    assert.equal(
      tooLate.body.error.message,
      "Reservations close 2 hours before the screening. Pay now instead.",
    );

    const expiredScreening = await createScreening();
    const expiredHold = await createCustomerHold(
      customer,
      expiredScreening.id,
      await findAvailableSeat(expiredScreening.id),
    );
    assert.equal(expiredHold.status, 201);
    await pool.query(
      `UPDATE bookings SET hold_expires_at = now() - INTERVAL '1 minute'
       WHERE reference = $1`,
      [expiredHold.body.reference],
    );
    const expired = await reserve(customer, expiredHold.body.reference);
    assert.equal(expired.status, 409);
    assert.equal(expired.body.error.code, "HOLD_EXPIRED");

    const paidScreening = await createScreening();
    const paidHold = await createCustomerHold(
      customer,
      paidScreening.id,
      await findAvailableSeat(paidScreening.id),
    );
    assert.equal(paidHold.status, 201);
    const payment = await pay(customer, paidHold.body.reference);
    assert.equal(payment.status, 200);
    const paidReservation = await reserve(customer, paidHold.body.reference);
    assert.equal(paidReservation.status, 409);
    assert.equal(paidReservation.body.error.code, "BOOKING_ALREADY_PAID");
  },
);

test(
  "reserved bookings can be paid before deadline and expire after it",
  { skip: !hasDatabase },
  async () => {
    const customer = await registerCustomer();
    const payableScreening = await createScreening();
    const payableHold = await createCustomerHold(
      customer,
      payableScreening.id,
      await findAvailableSeat(payableScreening.id),
    );
    assert.equal(payableHold.status, 201);
    const reservation = await reserve(customer, payableHold.body.reference);
    assert.equal(reservation.status, 200);
    const payment = await pay(customer, payableHold.body.reference);
    assert.equal(payment.status, 200);
    assert.equal(payment.body.status, "paid");
    assert.ok(payment.body.paidAt);

    const expiredScreening = await createScreening();
    const expiredHold = await createCustomerHold(
      customer,
      expiredScreening.id,
      await findAvailableSeat(expiredScreening.id),
    );
    assert.equal(expiredHold.status, 201);
    const expiredReservation = await reserve(customer, expiredHold.body.reference);
    assert.equal(expiredReservation.status, 200);
    await pool.query(
      `UPDATE bookings SET payment_deadline = now() - INTERVAL '1 minute'
       WHERE reference = $1`,
      [expiredHold.body.reference],
    );

    const booking = await request(app)
      .get(`/api/bookings/${expiredHold.body.reference}`)
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(booking.status, 200);
    assert.equal(booking.body.status, "expired");

    const latePayment = await pay(customer, expiredHold.body.reference);
    assert.equal(latePayment.status, 409);
    assert.equal(latePayment.body.error.code, "RESERVATION_EXPIRED");

    const repeatedReservation = await reserve(
      customer,
      expiredHold.body.reference,
    );
    assert.equal(repeatedReservation.status, 409);
    assert.equal(
      repeatedReservation.body.error.code,
      "RESERVATION_EXPIRED",
    );
  },
);

test(
  "reserved seats are sold, expired reservations are cleaned before a new hold, and concurrent customers have one winner",
  { skip: !hasDatabase },
  async () => {
    const customer = await registerCustomer();
    const otherCustomer = await registerCustomer();
    const screening = await createScreening();
    const seatId = await findAvailableSeat(screening.id);
    const hold = await createCustomerHold(customer, screening.id, seatId);
    assert.equal(hold.status, 201);
    const reservation = await reserve(customer, hold.body.reference);
    assert.equal(reservation.status, 200);

    const seatMap = await request(app).get(
      `/api/screenings/${screening.id}/seats`,
    );
    assert.equal(seatMap.status, 200);
    assert.equal(
      seatMap.body.seats.find(({ id }) => id === seatId).state,
      "sold",
    );

    await pool.query(
      `UPDATE bookings SET payment_deadline = now() - INTERVAL '1 minute'
       WHERE reference = $1`,
      [hold.body.reference],
    );
    const newHold = await createCustomerHold(otherCustomer, screening.id, seatId);
    assert.equal(newHold.status, 201);
    const { rows: expiredTickets } = await pool.query(
      `SELECT ticket.id
       FROM tickets AS ticket
       JOIN bookings AS booking ON booking.id = ticket.booking_id
       WHERE booking.reference = $1`,
      [hold.body.reference],
    );
    assert.equal(expiredTickets.length, 0);

    const concurrentScreening = await createScreening();
    const concurrentSeat = await findAvailableSeat(concurrentScreening.id);
    const concurrent = await Promise.all([
      createCustomerHold(customer, concurrentScreening.id, concurrentSeat),
      createCustomerHold(otherCustomer, concurrentScreening.id, concurrentSeat),
    ]);
    assert.equal(concurrent.filter(({ status }) => status === 201).length, 1);
    assert.equal(concurrent.filter(({ status }) => status === 409).length, 1);
    const conflict = concurrent.find(({ status }) => status === 409);
    assert.equal(conflict.body.error.code, "SEATS_UNAVAILABLE");
    assert.ok(conflict.body.error.details.seatIds.includes(concurrentSeat));
  },
);

test(
  "reserved wheelchair tickets reduce the available space count",
  { skip: !hasDatabase },
  async () => {
    const customer = await registerCustomer();
    const screening = await createScreening({ requiresWheelchairSpaces: true });
    const hold = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ screeningId: screening.id, seatIds: [], wheelchairSpaces: 1 });
    assert.equal(hold.status, 201);
    createdReferences.push(hold.body.reference);
    assert.equal(hold.body.wheelchairSpaces, 1);

    const reservation = await reserve(customer, hold.body.reference);
    assert.equal(reservation.status, 200);

    const seatMap = await request(app).get(
      `/api/screenings/${screening.id}/seats`,
    );
    assert.equal(seatMap.status, 200);
    assert.equal(
      seatMap.body.screening.wheelchairSpaces.available,
      seatMap.body.screening.wheelchairSpaces.total - 1,
    );
  },
);

test(
  "admin counts and locks screenings and movies with valid reservations",
  { skip: !hasDatabase },
  async () => {
    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "admin@rio.test",
      password: process.env.SEED_PASSWORD ?? "Rio-demo-2026",
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.body.token;
    const customer = await registerCustomer();
    const movieId = await createPublishedMovie();
    const screening = await createScreening({ movieId });
    const hold = await createCustomerHold(
      customer,
      screening.id,
      await findAvailableSeat(screening.id),
    );
    assert.equal(hold.status, 201);
    const reservation = await reserve(customer, hold.body.reference);
    assert.equal(reservation.status, 200);

    const details = await request(app)
      .get(`/api/admin/screenings/${screening.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    assert.equal(details.status, 200);
    assert.equal(details.body.ticketsSold, 0);
    assert.equal(details.body.ticketsHeld, 0);
    assert.equal(details.body.ticketsReserved, 1);

    const updateScreening = await request(app)
      .patch(`/api/admin/screenings/${screening.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ published: false });
    assert.equal(updateScreening.status, 409);
    assert.equal(updateScreening.body.error.code, "SCREENING_HAS_BOOKINGS");

    const hideMovie = await request(app)
      .patch(`/api/admin/movies/${movieId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ published: false });
    assert.equal(hideMovie.status, 409);
    assert.equal(hideMovie.body.error.code, "MOVIE_HAS_BOOKINGS");
  },
);

test(
  "customers cancel reservations and cannot cancel reservations past their deadline",
  { skip: !hasDatabase },
  async () => {
    const customer = await registerCustomer();
    const screening = await createScreening();
    const seatId = await findAvailableSeat(screening.id);
    const hold = await createCustomerHold(customer, screening.id, seatId);
    assert.equal(hold.status, 201);

    const reservation = await reserve(customer, hold.body.reference);
    assert.equal(reservation.status, 200);
    assert.equal(reservation.body.status, "reserved");

    const cancelled = await request(app)
      .post(`/api/bookings/${hold.body.reference}/cancel`)
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.status, "cancelled");
    assert.deepEqual(cancelled.body.seats, []);

    const { rows: cancelledTickets } = await pool.query(
      `SELECT id FROM tickets
       WHERE booking_id = (
         SELECT id FROM bookings WHERE reference = $1
       )`,
      [hold.body.reference],
    );
    assert.equal(cancelledTickets.length, 0);

    const replacementHold = await createCustomerHold(
      customer,
      screening.id,
      seatId,
    );
    assert.equal(replacementHold.status, 201);

    const expiredScreening = await createScreening();
    const expiredSeatId = await findAvailableSeat(expiredScreening.id);
    const expiringHold = await createCustomerHold(
      customer,
      expiredScreening.id,
      expiredSeatId,
    );
    assert.equal(expiringHold.status, 201);
    const expiredReservation = await reserve(
      customer,
      expiringHold.body.reference,
    );
    assert.equal(expiredReservation.status, 200);
    await pool.query(
      `UPDATE bookings
       SET payment_deadline = now() - INTERVAL '1 minute'
       WHERE reference = $1`,
      [expiringHold.body.reference],
    );

    const expiredCancellation = await request(app)
      .post(`/api/bookings/${expiringHold.body.reference}/cancel`)
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(expiredCancellation.status, 409);
    assert.equal(
      expiredCancellation.body.error.code,
      "BOOKING_NOT_CANCELLABLE",
    );
    assert.equal(expiredCancellation.body.error.details.status, "expired");
  },
);
