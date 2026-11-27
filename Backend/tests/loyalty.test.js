import "dotenv/config";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import request from "supertest";

process.env.JWT_SECRET = "oq005-loyalty-test-secret";

const { default: app } = await import("../src/app.js");
const { default: pool } = await import("../src/db.js");
const hasDatabase = Boolean(process.env.DATABASE_URL);
const createdEmails = [];
const createdReferences = [];
const createdScreeningIds = [];
const LOYALTY_NOTE = "Every 10th ticket −50 %";

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
  if (createdEmails.length > 0) {
    await pool.query("DELETE FROM users WHERE email = ANY($1::text[])", [
      createdEmails,
    ]);
  }
  await pool.end();
});

async function registerCustomer() {
  const email = `oq005-${randomUUID()}@example.test`;
  const response = await request(app).post("/api/auth/register").send({
    name: "OQ-005 Customer",
    email,
    password: "customer-password",
  });
  assert.equal(response.status, 201);
  createdEmails.push(email);
  return { ...response.body.user, token: response.body.token };
}

async function createScreening(dayOffset, requiresWheelchairSpaces = false) {
  const { rows } = await pool.query(
    `INSERT INTO screenings
       (movie_id, hall_id, starts_at, base_price, is_premiere, published)
     SELECT source.movie_id, source.hall_id,
            NOW() + ($1::integer * INTERVAL '1 day'),
            12.50, false, true
     FROM screenings AS source
     JOIN movies AS movie ON movie.id = source.movie_id
     WHERE source.published = true AND movie.published = true
       AND source.starts_at > NOW()
       AND (
         NOT $2::boolean
         OR EXISTS (
           SELECT 1 FROM halls
           WHERE halls.id = source.hall_id AND halls.wheelchair_spaces > 0
         )
       )
     ORDER BY source.starts_at
     LIMIT 1
     RETURNING id, hall_id, base_price`,
    [dayOffset, requiresWheelchairSpaces],
  );
  assert.equal(rows.length, 1, "expected a published screening to copy");
  createdScreeningIds.push(rows[0].id);
  return rows[0];
}

async function findSeats(screeningId, count) {
  const { rows } = await pool.query(
    `SELECT seat.id
     FROM seats AS seat
     WHERE seat.hall_id = (SELECT hall_id FROM screenings WHERE id = $1)
       AND seat.type = 'normal'
       AND NOT EXISTS (
         SELECT 1 FROM tickets
         WHERE tickets.screening_id = $1 AND tickets.seat_id = seat.id
       )
     ORDER BY seat.row_number, seat.seat_number
     LIMIT $2`,
    [screeningId, count],
  );
  assert.equal(rows.length, count, "expected enough available seats");
  return rows.map(({ id }) => id);
}

async function bookCustomer(customer, screeningId, seatIds) {
  const response = await request(app)
    .post("/api/bookings")
    .set("Authorization", `Bearer ${customer.token}`)
    .send({ screeningId, seatIds });
  if (response.status === 201) createdReferences.push(response.body.reference);
  return response;
}

async function insertHistory(customer, screeningId, status, ticketCount, expired = false) {
  const reference = `OQ005-${randomUUID()}`;
  const { rows } = await pool.query(
    `INSERT INTO bookings
       (reference, user_id, screening_id, status, hold_expires_at,
        payment_deadline, total_price)
     VALUES (
       $1, $2, $3, $4::booking_status,
       CASE WHEN $4 = 'held' AND $5
         THEN NOW() - INTERVAL '1 minute'
         WHEN $4 = 'held'
         THEN NOW() + INTERVAL '15 minutes'
       END,
       CASE WHEN $4 = 'reserved' AND $5
         THEN NOW() - INTERVAL '1 minute'
         WHEN $4 = 'reserved'
         THEN NOW() + INTERVAL '1 day'
       END,
       $6
     )
     RETURNING id`,
    [reference, customer.id, screeningId, status, expired, 12.5 * ticketCount],
  );
  createdReferences.push(reference);
  await pool.query(
    `INSERT INTO tickets
       (booking_id, screening_id, is_wheelchair, ticket_type, price)
     SELECT $1, $2, true, 'adult', 12.5
     FROM generate_series(1, $3)`,
    [rows[0].id, screeningId, ticketCount],
  );
  return reference;
}

function cashierToken() {
  return jwt.sign(
    { sub: "1", role: "cashier", theatreId: 1 },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: "1h" },
  );
}

test(
  "GET /api/me/loyalty reports progress and enforces the customer role",
  { skip: !hasDatabase },
  async () => {
    const customer = await registerCustomer();
    const screening = await createScreening(70);
    const [seatId] = await findSeats(screening.id, 1);

    const anonymous = await request(app).get("/api/me/loyalty");
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.error.code, "UNAUTHORIZED");
    const cashier = await request(app)
      .get("/api/me/loyalty")
      .set("Authorization", `Bearer ${cashierToken()}`);
    assert.equal(cashier.status, 403);
    assert.equal(cashier.body.error.code, "FORBIDDEN");

    const before = await request(app)
      .get("/api/me/loyalty")
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(before.status, 200);
    assert.deepEqual(before.body, {
      ticketsCounted: 0,
      ticketsUntilDiscount: 10,
    });

    const booking = await bookCustomer(customer, screening.id, [seatId]);
    assert.equal(booking.status, 201);
    assert.equal(booking.body.seats[0].discountNote, null);
    assert.equal(booking.body.wheelchairDiscounts, 0);

    const afterBooking = await request(app)
      .get("/api/me/loyalty")
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(afterBooking.status, 200);
    assert.deepEqual(afterBooking.body, {
      ticketsCounted: 1,
      ticketsUntilDiscount: 9,
    });
  },
);

test(
  "the 10th ticket across bookings is discounted and its stored price survives reserve and pay",
  { skip: !hasDatabase },
  async () => {
    const customer = await registerCustomer();
    const screening = await createScreening(71);
    const seatIds = await findSeats(screening.id, 10);

    const first = await bookCustomer(customer, screening.id, seatIds.slice(0, 8));
    assert.equal(first.status, 201);
    assert.equal(first.body.totalPrice, 100);

    const second = await bookCustomer(customer, screening.id, seatIds.slice(8));
    assert.equal(second.status, 201);
    assert.equal(second.body.seats.length, 2);
    assert.equal(second.body.seats[0].price, 6.25);
    assert.equal(second.body.seats[0].discountNote, LOYALTY_NOTE);
    assert.equal(second.body.seats[1].price, 12.5);
    assert.equal(second.body.seats[1].discountNote, null);
    assert.equal(second.body.totalPrice, 18.75);

    const { rows: savedTickets } = await pool.query(
      `SELECT ticket.price, ticket.discount_note
       FROM tickets AS ticket
       JOIN bookings AS booking ON booking.id = ticket.booking_id
       WHERE booking.reference = $1
       ORDER BY ticket.discount_note DESC NULLS LAST`,
      [second.body.reference],
    );
    assert.equal(Number(savedTickets[0].price), 6.25);
    assert.equal(savedTickets[0].discount_note, LOYALTY_NOTE);
    assert.equal(savedTickets.filter(({ discount_note }) => discount_note !== null).length, 1);

    const reservation = await request(app)
      .post(`/api/bookings/${second.body.reference}/reserve`)
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(reservation.status, 200);
    assert.deepEqual(reservation.body.seats, second.body.seats);
    assert.equal(reservation.body.totalPrice, second.body.totalPrice);

    const payment = await request(app)
      .post(`/api/bookings/${second.body.reference}/pay`)
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ acceptNoRefund: true });
    assert.equal(payment.status, 200);
    assert.deepEqual(payment.body.seats, second.body.seats);
    assert.equal(payment.body.totalPrice, second.body.totalPrice);

    const loyalty = await request(app)
      .get("/api/me/loyalty")
      .set("Authorization", `Bearer ${customer.token}`);
    assert.deepEqual(loyalty.body, {
      ticketsCounted: 10,
      ticketsUntilDiscount: 10,
    });

    const myBookings = await request(app)
      .get("/api/me/bookings")
      .set("Authorization", `Bearer ${customer.token}`);
    const listed = myBookings.body.upcoming.find(
      ({ reference }) => reference === second.body.reference,
    );
    assert.ok(listed);
    assert.equal(listed.seats[0].discountNote, LOYALTY_NOTE);
    assert.equal(listed.wheelchairDiscounts, 0);
  },
);

test(
  "only active customer tickets count; guests and staff never receive the discount",
  { skip: !hasDatabase },
  async () => {
    const customer = await registerCustomer();
    const historyScreening = await createScreening(72);
    const bookingScreening = await createScreening(73, true);

    await insertHistory(customer, historyScreening.id, "paid", 3);
    await insertHistory(customer, historyScreening.id, "held", 2);
    await insertHistory(customer, historyScreening.id, "reserved", 4);
    await insertHistory(customer, historyScreening.id, "cancelled", 2);
    await insertHistory(customer, historyScreening.id, "expired", 2);
    await insertHistory(customer, historyScreening.id, "held", 2, true);
    await insertHistory(customer, historyScreening.id, "reserved", 2, true);

    const progress = await request(app)
      .get("/api/me/loyalty")
      .set("Authorization", `Bearer ${customer.token}`);
    assert.deepEqual(progress.body, {
      ticketsCounted: 9,
      ticketsUntilDiscount: 1,
    });

    const seatIds = await findSeats(bookingScreening.id, 2);
    const guest = await request(app).post("/api/bookings").send({
      screeningId: bookingScreening.id,
      seatIds: [seatIds[0]],
      email: `guest-${randomUUID()}@example.test`,
    });
    assert.equal(guest.status, 201);
    createdReferences.push(guest.body.reference);
    assert.equal(guest.body.seats[0].discountNote, null);

    const staff = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${cashierToken()}`)
      .send({
        screeningId: bookingScreening.id,
        seatIds: [seatIds[1]],
        email: `staff-${randomUUID()}@example.test`,
      });
    assert.equal(staff.status, 201);
    createdReferences.push(staff.body.reference);
    assert.equal(staff.body.seats[0].discountNote, null);

    const tenth = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({
        screeningId: bookingScreening.id,
        seatIds: [],
        wheelchairSpaces: 1,
      });
    assert.equal(tenth.status, 201);
    createdReferences.push(tenth.body.reference);
    assert.deepEqual(tenth.body.seats, []);
    assert.equal(tenth.body.wheelchairSpaces, 1);
    assert.equal(tenth.body.wheelchairDiscounts, 1);
    assert.equal(tenth.body.totalPrice, 6.25);
  },
);

test(
  "parallel bookings by one customer allocate the 10th-ticket discount only once",
  { skip: !hasDatabase },
  async () => {
    const customer = await registerCustomer();
    const historyScreening = await createScreening(74);
    const bookingScreening = await createScreening(75);
    await insertHistory(customer, historyScreening.id, "paid", 9);
    const seatIds = await findSeats(bookingScreening.id, 2);

    const responses = await Promise.all([
      bookCustomer(customer, bookingScreening.id, [seatIds[0]]),
      bookCustomer(customer, bookingScreening.id, [seatIds[1]]),
    ]);
    assert.ok(responses.every(({ status }) => status === 201));
    const discounted = responses.filter(
      ({ body }) => body.seats[0].discountNote === LOYALTY_NOTE,
    );
    assert.equal(discounted.length, 1);
    assert.equal(
      responses.filter(({ body }) => body.seats[0].discountNote === null).length,
      1,
    );

    const { rows } = await pool.query(
      `SELECT COUNT(ticket.id)::integer AS discount_count
       FROM tickets AS ticket
       JOIN bookings AS booking ON booking.id = ticket.booking_id
       WHERE booking.reference = ANY($1::varchar[])
         AND ticket.discount_note = $2`,
      [
        responses.map(({ body }) => body.reference),
        LOYALTY_NOTE,
      ],
    );
    assert.equal(rows[0].discount_count, 1);
  },
);
