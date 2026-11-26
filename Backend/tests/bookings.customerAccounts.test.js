import "dotenv/config";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import request from "supertest";

process.env.JWT_SECRET = "fr014-customer-bookings-test-secret";

const { default: app } = await import("../src/app.js");
const { default: pool } = await import("../src/db.js");
const hasDatabase = Boolean(process.env.DATABASE_URL);
const createdEmails = [];
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
  if (createdEmails.length > 0) {
    await pool.query("DELETE FROM users WHERE email = ANY($1::text[])", [
      createdEmails,
    ]);
  }
  await pool.end();
});

async function registerCustomer() {
  const email = `fr014-${randomUUID()}@example.test`;
  const response = await request(app).post("/api/auth/register").send({
    name: "FR-014 Customer",
    email,
    password: "customer-password",
  });
  assert.equal(response.status, 201);
  createdEmails.push(email);
  return { ...response.body.user, token: response.body.token };
}

async function createScreening(dayOffset) {
  const { rows } = await pool.query(
    `INSERT INTO screenings
       (movie_id, hall_id, starts_at, base_price, is_premiere, published)
     SELECT source.movie_id, source.hall_id,
            NOW() + ($1::integer * INTERVAL '1 day'),
            source.base_price, source.is_premiere, true
     FROM screenings AS source
     JOIN movies AS movie ON movie.id = source.movie_id
     WHERE source.published = true AND movie.published = true
       AND source.starts_at > NOW()
     ORDER BY source.starts_at
     LIMIT 1
     RETURNING id, hall_id, movie_id, base_price`,
    [dayOffset],
  );
  assert.equal(rows.length, 1, "expected a published screening to copy");
  createdScreeningIds.push(rows[0].id);
  return rows[0];
}

async function findSeat(screeningId) {
  const { rows } = await pool.query(
    `SELECT id
     FROM seats
     WHERE hall_id = (SELECT hall_id FROM screenings WHERE id = $1)
       AND type = 'normal'
     ORDER BY row_number, seat_number
     LIMIT 1`,
    [screeningId],
  );
  assert.equal(rows.length, 1, "expected a normal seat");
  return rows[0].id;
}

async function createListedBooking(customer, screening, status, deadline) {
  const reference = `FR014-${randomUUID()}`;
  const { rows } = await pool.query(
    `INSERT INTO bookings
       (reference, user_id, screening_id, status, payment_deadline, total_price)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [reference, customer.id, screening.id, status, deadline, screening.base_price],
  );
  createdReferences.push(reference);
  if (
    status === "reserved" ||
    status === "paid" ||
    status === "cancelled" ||
    status === "expired"
  ) {
    const seatId = await findSeat(screening.id);
    await pool.query(
      `INSERT INTO tickets
         (booking_id, screening_id, seat_id, ticket_type, price)
       VALUES ($1, $2, $3, 'adult', $4)`,
      [rows[0].id, screening.id, seatId, screening.base_price],
    );
  }
  return reference;
}

async function createDirectBooking(
  customer,
  screening,
  { status, holdExpiresAt = null, paymentDeadline = null, wheelchair = false },
) {
  const reference = `FR018-${randomUUID()}`;
  const { rows } = await pool.query(
    `INSERT INTO bookings
       (reference, user_id, screening_id, status, hold_expires_at,
        payment_deadline, total_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      reference,
      customer.id,
      screening.id,
      status,
      holdExpiresAt,
      paymentDeadline,
      screening.base_price,
    ],
  );
  createdReferences.push(reference);
  if (wheelchair) {
    await pool.query(
      `INSERT INTO tickets
         (booking_id, screening_id, seat_id, is_wheelchair, ticket_type, price)
       VALUES ($1, $2, NULL, true, 'adult', $3)`,
      [rows[0].id, screening.id, screening.base_price],
    );
  } else {
    await pool.query(
      `INSERT INTO tickets
         (booking_id, screening_id, seat_id, ticket_type, price)
       VALUES ($1, $2, $3, 'adult', $4)`,
      [rows[0].id, screening.id, await findSeat(screening.id), screening.base_price],
    );
  }
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
  "customer-owned bookings use account identity and optional auth enforces access",
  { skip: !hasDatabase },
  async () => {
    const customer = await registerCustomer();
    const otherCustomer = await registerCustomer();
    const screening = await createScreening(30);
    const seatId = await findSeat(screening.id);

    const customerBooking = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({
        screeningId: screening.id,
        seatIds: [seatId],
        email: "ignored-invalid-email",
      });

    assert.equal(customerBooking.status, 201);
    createdReferences.push(customerBooking.body.reference);
    assert.equal(customerBooking.body.email, customer.email);
    assert.equal(customerBooking.body.paymentDeadline, null);
    const { rows: savedBooking } = await pool.query(
      `SELECT user_id, guest_email FROM bookings WHERE reference = $1`,
      [customerBooking.body.reference],
    );
    assert.equal(savedBooking[0].user_id, customer.id);
    assert.equal(savedBooking[0].guest_email, null);

    const ownerRead = await request(app)
      .get(`/api/bookings/${customerBooking.body.reference}`)
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(ownerRead.status, 200);
    assert.equal(ownerRead.body.email, customer.email);

    const ownerPayment = await request(app)
      .post(`/api/bookings/${customerBooking.body.reference}/pay`)
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ acceptNoRefund: true });
    assert.equal(ownerPayment.status, 200);
    assert.equal(ownerPayment.body.status, "paid");
    assert.ok(ownerPayment.body.paidAt);

    const anotherCustomerRead = await request(app)
      .get(`/api/bookings/${customerBooking.body.reference}`)
      .set("Authorization", `Bearer ${otherCustomer.token}`);
    assert.equal(anotherCustomerRead.status, 404);
    assert.equal(anotherCustomerRead.body.error.code, "BOOKING_NOT_FOUND");
    const anotherCustomerPayment = await request(app)
      .post(`/api/bookings/${customerBooking.body.reference}/pay`)
      .set("Authorization", `Bearer ${otherCustomer.token}`)
      .send({ acceptNoRefund: true });
    assert.equal(anotherCustomerPayment.status, 404);
    assert.equal(
      anotherCustomerPayment.body.error.code,
      "BOOKING_NOT_FOUND",
    );

    const invalidToken = await request(app)
      .post("/api/bookings")
      .set("Authorization", "Bearer invalid-token")
      .send({ screeningId: screening.id, seatIds: [seatId] });
    assert.equal(invalidToken.status, 401);
    assert.equal(invalidToken.body.error.code, "UNAUTHORIZED");

    const cashier = cashierToken();
    const cashierWithoutEmail = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${cashier}`)
      .send({ screeningId: screening.id, seatIds: [seatId] });
    assert.equal(cashierWithoutEmail.status, 400);
    assert.equal(
      typeof cashierWithoutEmail.body.error.details.fields.email,
      "string",
    );

    const staffScreening = await createScreening(31);
    const staffBooking = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${cashier}`)
      .send({
        screeningId: staffScreening.id,
        seatIds: [await findSeat(staffScreening.id)],
        email: "staff-guest@example.test",
      });
    assert.equal(staffBooking.status, 201);
    createdReferences.push(staffBooking.body.reference);
    assert.equal(staffBooking.body.email, "staff-guest@example.test");
    const { rows: savedStaffBooking } = await pool.query(
      "SELECT user_id FROM bookings WHERE reference = $1",
      [staffBooking.body.reference],
    );
    assert.equal(savedStaffBooking[0].user_id, null);
  },
);

test(
  "GET /api/me/bookings returns only owned, eligible bookings in contract order",
  { skip: !hasDatabase },
  async () => {
    const customer = await registerCustomer();
    const otherCustomer = await registerCustomer();
    const upcomingSoon = await createScreening(2);
    const upcomingLater = await createScreening(5);
    const pastRecent = await createScreening(-1);
    const pastOlder = await createScreening(-4);
    const heldScreening = await createScreening(8);

    const soonReference = await createListedBooking(
      customer,
      upcomingSoon,
      "reserved",
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    const laterReference = await createListedBooking(
      customer,
      upcomingLater,
      "paid",
      null,
    );
    const recentReference = await createListedBooking(
      customer,
      pastRecent,
      "cancelled",
      null,
    );
    const olderReference = await createListedBooking(
      customer,
      pastOlder,
      "expired",
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );
    const otherScreening = await createScreening(6);
    const otherReference = await createListedBooking(
      otherCustomer,
      otherScreening,
      "paid",
      null,
    );

    const guestReference = `FR014-${randomUUID()}`;
    await pool.query(
      `INSERT INTO bookings
         (reference, guest_email, screening_id, status, total_price)
       VALUES ($1, $2, $3, 'paid', $4)`,
      [guestReference, customer.email, upcomingLater.id, upcomingLater.base_price],
    );
    createdReferences.push(guestReference);

    const holdSeatId = await findSeat(heldScreening.id);
    const held = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ screeningId: heldScreening.id, seatIds: [holdSeatId] });
    assert.equal(held.status, 201);
    createdReferences.push(held.body.reference);

    const noToken = await request(app).get("/api/me/bookings");
    assert.equal(noToken.status, 401);
    assert.equal(noToken.body.error.code, "UNAUTHORIZED");
    const cashier = await request(app)
      .get("/api/me/bookings")
      .set("Authorization", `Bearer ${cashierToken()}`);
    assert.equal(cashier.status, 403);
    assert.equal(cashier.body.error.code, "FORBIDDEN");

    const response = await request(app)
      .get("/api/me/bookings")
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body).sort(), ["past", "upcoming"]);
    assert.deepEqual(
      response.body.upcoming.map(({ reference }) => reference),
      [soonReference, laterReference],
    );
    assert.deepEqual(
      response.body.past.map(({ reference }) => reference),
      [recentReference, olderReference],
    );
    assert.equal(response.body.upcoming[0].status, "reserved");
    assert.equal(response.body.past[1].status, "expired");
    assert.deepEqual(response.body.past[0].seats, []);
    assert.equal(response.body.past[0].wheelchairSpaces, 0);
    assert.deepEqual(response.body.past[1].seats, []);
    assert.equal(response.body.past[1].wheelchairSpaces, 0);
    assert.deepEqual(
      Object.keys(response.body.upcoming[0]).sort(),
      [
        "paidAt",
        "paymentDeadline",
        "reference",
        "screening",
        "seats",
        "status",
        "totalPrice",
        "wheelchairSpaces",
      ],
    );
    assert.equal(response.body.upcoming[0].seats.length, 1);
    assert.equal(response.body.upcoming[0].screening.movie.id, upcomingSoon.movie_id);
    assert.equal(response.body.upcoming[0].screening.theatre.city,
      response.body.upcoming[0].screening.theatre.city.toLowerCase());
    assert.ok(
      !response.body.upcoming.some(({ reference }) =>
        [otherReference, guestReference, held.body.reference].includes(reference),
      ),
    );

    const cappedCustomer = await registerCustomer();
    const capScreening = await createScreening(-10);
    const cappedReferences = Array.from(
      { length: 51 },
      () => `FR014-${randomUUID()}`,
    );
    const { rows: cappedRows } = await pool.query(
      `INSERT INTO bookings
         (reference, user_id, screening_id, status, total_price)
       SELECT reference, $1, $2, 'cancelled', $3
       FROM unnest($4::varchar[]) AS booking_refs(reference)
       RETURNING reference`,
      [cappedCustomer.id, capScreening.id, capScreening.base_price, cappedReferences],
    );
    createdReferences.push(...cappedRows.map(({ reference }) => reference));
    const capped = await request(app)
      .get("/api/me/bookings")
      .set("Authorization", `Bearer ${cappedCustomer.token}`);
    assert.equal(capped.status, 200);
    assert.equal(capped.body.past.length, 50);
    assert.ok(
      capped.body.past.every(({ reference }) =>
        cappedReferences.includes(reference),
      ),
    );
  },
);

test(
  "customers cancel their own holds and immediately release seats",
  { skip: !hasDatabase },
  async () => {
    const customer = await registerCustomer();
    const otherCustomer = await registerCustomer();
    const screening = await createScreening(32);
    const seatId = await findSeat(screening.id);
    const hold = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ screeningId: screening.id, seatIds: [seatId] });
    assert.equal(hold.status, 201);
    createdReferences.push(hold.body.reference);

    const noToken = await request(app).post(
      `/api/bookings/${hold.body.reference}/cancel`,
    );
    assert.equal(noToken.status, 401);
    assert.equal(noToken.body.error.code, "UNAUTHORIZED");

    const cashier = await request(app)
      .post(`/api/bookings/${hold.body.reference}/cancel`)
      .set("Authorization", `Bearer ${cashierToken()}`);
    assert.equal(cashier.status, 403);
    assert.equal(cashier.body.error.code, "FORBIDDEN");

    const otherCustomerCancel = await request(app)
      .post(`/api/bookings/${hold.body.reference}/cancel`)
      .set("Authorization", `Bearer ${otherCustomer.token}`);
    assert.equal(otherCustomerCancel.status, 404);
    assert.equal(otherCustomerCancel.body.error.code, "BOOKING_NOT_FOUND");

    const cancelled = await request(app)
      .post(`/api/bookings/${hold.body.reference}/cancel`)
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.status, "cancelled");
    assert.deepEqual(cancelled.body.seats, []);
    assert.equal(cancelled.body.wheelchairSpaces, 0);
    assert.equal(cancelled.body.wheelchairDiscounts, 0);
    assert.equal(cancelled.body.totalPrice, hold.body.totalPrice);

    const rebooked = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ screeningId: screening.id, seatIds: [seatId] });
    assert.equal(rebooked.status, 201);
    createdReferences.push(rebooked.body.reference);

    const secondCancel = await request(app)
      .post(`/api/bookings/${hold.body.reference}/cancel`)
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(secondCancel.status, 200);
    assert.equal(secondCancel.body.status, "cancelled");
    assert.deepEqual(secondCancel.body.seats, []);

    const guestScreening = await createScreening(33);
    const guestBooking = await request(app).post("/api/bookings").send({
      screeningId: guestScreening.id,
      seatIds: [await findSeat(guestScreening.id)],
      email: `guest-${randomUUID()}@example.test`,
    });
    assert.equal(guestBooking.status, 201);
    createdReferences.push(guestBooking.body.reference);
    const guestCancel = await request(app)
      .post(`/api/bookings/${guestBooking.body.reference}/cancel`)
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(guestCancel.status, 404);
    assert.equal(guestCancel.body.error.code, "BOOKING_NOT_FOUND");
  },
);

test(
  "customers cancel reservations, release wheelchair spaces, and see empty cancelled bookings",
  { skip: !hasDatabase },
  async () => {
    const customer = await registerCustomer();
    const screening = await createScreening(34);
    const { rows: halls } = await pool.query(
      "SELECT wheelchair_spaces FROM halls WHERE id = $1",
      [screening.hall_id],
    );
    assert.ok(halls[0].wheelchair_spaces > 0);

    const reference = await createDirectBooking(customer, screening, {
      status: "reserved",
      paymentDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      wheelchair: true,
    });
    const cancellation = await request(app)
      .post(`/api/bookings/${reference}/cancel`)
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(cancellation.status, 200);
    assert.equal(cancellation.body.status, "cancelled");
    assert.deepEqual(cancellation.body.seats, []);
    assert.equal(cancellation.body.wheelchairSpaces, 0);
    assert.equal(cancellation.body.totalPrice, Number(screening.base_price));

    const myBookings = await request(app)
      .get("/api/me/bookings")
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(myBookings.status, 200);
    const listed = myBookings.body.upcoming.find(
      (booking) => booking.reference === reference,
    );
    assert.ok(listed);
    assert.equal(listed.status, "cancelled");
    assert.deepEqual(listed.seats, []);
    assert.equal(listed.wheelchairSpaces, 0);

    const wheelchairHold = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({
        screeningId: screening.id,
        seatIds: [],
        wheelchairSpaces: 1,
      });
    assert.equal(wheelchairHold.status, 201);
    createdReferences.push(wheelchairHold.body.reference);
  },
);

test(
  "cancellation rejects paid and effectively expired bookings with their status",
  { skip: !hasDatabase },
  async () => {
    const customer = await registerCustomer();
    const paidScreening = await createScreening(35);
    const paidReference = await createDirectBooking(customer, paidScreening, {
      status: "paid",
    });
    const paid = await request(app)
      .post(`/api/bookings/${paidReference}/cancel`)
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(paid.status, 409);
    assert.equal(paid.body.error.code, "BOOKING_NOT_CANCELLABLE");
    assert.equal(paid.body.error.details.status, "paid");

    const expiredHoldScreening = await createScreening(36);
    const expiredHoldReference = await createDirectBooking(
      customer,
      expiredHoldScreening,
      {
        status: "held",
        holdExpiresAt: new Date(Date.now() - 60_000),
      },
    );
    const expiredHold = await request(app)
      .post(`/api/bookings/${expiredHoldReference}/cancel`)
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(expiredHold.status, 409);
    assert.equal(expiredHold.body.error.code, "BOOKING_NOT_CANCELLABLE");
    assert.equal(expiredHold.body.error.details.status, "expired");

    const expiredReservationScreening = await createScreening(37);
    const expiredReservationReference = await createDirectBooking(
      customer,
      expiredReservationScreening,
      {
        status: "reserved",
        paymentDeadline: new Date(Date.now() - 60_000),
      },
    );
    const expiredReservation = await request(app)
      .post(`/api/bookings/${expiredReservationReference}/cancel`)
      .set("Authorization", `Bearer ${customer.token}`);
    assert.equal(expiredReservation.status, 409);
    assert.equal(
      expiredReservation.body.error.code,
      "BOOKING_NOT_CANCELLABLE",
    );
    assert.equal(expiredReservation.body.error.details.status, "expired");
  },
);
