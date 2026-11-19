import "dotenv/config";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/db.js";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const createdScreeningIds = [];

after(async () => {
  if (createdScreeningIds.length > 0) {
    const bookingIds = `SELECT id FROM bookings WHERE screening_id = ANY($1::integer[])`;
    await pool.query(
      `DELETE FROM payments WHERE booking_id IN (${bookingIds})`,
      [createdScreeningIds],
    );
    await pool.query(
      "DELETE FROM tickets WHERE screening_id = ANY($1::integer[])",
      [createdScreeningIds],
    );
    await pool.query(
      "DELETE FROM bookings WHERE screening_id = ANY($1::integer[])",
      [createdScreeningIds],
    );
    await pool.query(
      "DELETE FROM screenings WHERE id = ANY($1::integer[])",
      [createdScreeningIds],
    );
  }
  await pool.end();
});

// A screening of its own, so the wheelchair capacity is not shared with other tests.
async function createScreening({ basePrice, isPremiere }) {
  const { rows } = await pool.query(
    `INSERT INTO screenings
       (movie_id, hall_id, starts_at, base_price, is_premiere, published)
     SELECT movie_id, hall_id, starts_at, $1, $2, true
     FROM screenings AS screening
     WHERE screening.published = true AND screening.starts_at > NOW()
       AND EXISTS (SELECT 1 FROM movies WHERE id = screening.movie_id AND published)
     ORDER BY screening.starts_at
     LIMIT 1
     RETURNING id, hall_id`,
    [basePrice, isPremiere],
  );
  assert.equal(rows.length, 1, "expected a future published screening to copy");
  createdScreeningIds.push(rows[0].id);
  return rows[0];
}

async function findSeats(hallId, limit) {
  const { rows } = await pool.query(
    `SELECT id FROM seats
     WHERE hall_id = $1 AND type = 'normal'
     ORDER BY row_number, seat_number
     LIMIT $2`,
    [hallId, limit],
  );
  return rows.map(({ id }) => id);
}

function book(body) {
  return request(app)
    .post("/api/bookings")
    .send({ email: "guest@example.com", ...body });
}

test(
  "POST /api/bookings validates ticket types and wheelchair spaces",
  { skip: !hasDatabase },
  async () => {
    const invalidRequests = [
      { body: { seatIds: [1, 2], childTickets: 3 }, field: "childTickets" },
      { body: { seatIds: [1], childTickets: -1 }, field: "childTickets" },
      { body: { seatIds: [1], childTickets: 0.5 }, field: "childTickets" },
      { body: { seatIds: [], wheelchairSpaces: 11 }, field: "wheelchairSpaces" },
      { body: { seatIds: [1], wheelchairSpaces: "2" }, field: "wheelchairSpaces" },
      {
        body: { seatIds: [1, 2, 3, 4, 5, 6, 7, 8], wheelchairSpaces: 3 },
        field: "seatIds",
      },
      { body: { seatIds: [], wheelchairSpaces: 0 }, field: "seatIds" },
    ];

    for (const invalid of invalidRequests) {
      const response = await book({ screeningId: 1, ...invalid.body });
      assert.equal(response.status, 400, JSON.stringify(invalid.body));
      assert.equal(response.body.error.code, "VALIDATION_ERROR");
      assert.equal(
        typeof response.body.error.details.fields[invalid.field],
        "string",
        JSON.stringify(invalid.body),
      );
    }
  },
);

test(
  "POST /api/bookings prices adult, child and wheelchair tickets (BR-012, BR-014)",
  { skip: !hasDatabase },
  async () => {
    const screening = await createScreening({ basePrice: 10, isPremiere: true });
    const seatIds = await findSeats(screening.hall_id, 2);

    const response = await book({
      screeningId: screening.id,
      seatIds,
      childTickets: 1,
      wheelchairSpaces: 1,
    });

    assert.equal(response.status, 201);
    assert.deepEqual(
      response.body.seats.map(({ ticketType, price }) => ({ ticketType, price })),
      [
        { ticketType: "adult", price: 11.5 },
        { ticketType: "child", price: 5.75 },
      ],
    );
    assert.equal(response.body.wheelchairSpaces, 1);
    assert.equal(response.body.totalPrice, 28.75);

    const fetched = await request(app)
      .get(`/api/bookings/${response.body.reference}`)
      .query({ email: "guest@example.com" });
    assert.deepEqual(fetched.body, { ...response.body, paidAt: null });

    const seatMap = await request(app).get(`/api/screenings/${screening.id}/seats`);
    assert.deepEqual(seatMap.body.screening.prices, { adult: 11.5, child: 5.75 });
    assert.deepEqual(seatMap.body.screening.wheelchairSpaces, {
      total: 10,
      available: 9,
    });
  },
);

test(
  "POST /api/bookings allows wheelchair spaces without seats up to the hall capacity",
  { skip: !hasDatabase },
  async () => {
    const screening = await createScreening({ basePrice: 12.5, isPremiere: false });

    const all = await book({ screeningId: screening.id, seatIds: [], wheelchairSpaces: 10 });
    assert.equal(all.status, 201);
    assert.deepEqual(all.body.seats, []);
    assert.equal(all.body.wheelchairSpaces, 10);
    assert.equal(all.body.totalPrice, 125);

    const eleventh = await book({ screeningId: screening.id, seatIds: [], wheelchairSpaces: 1 });
    assert.equal(eleventh.status, 409);
    assert.equal(eleventh.body.error.code, "WHEELCHAIR_SPACES_UNAVAILABLE");
    assert.deepEqual(eleventh.body.error.details, { available: 0 });

    // An expired hold gives its wheelchair spaces back.
    await pool.query(
      "UPDATE bookings SET hold_expires_at = NOW() - INTERVAL '1 minute' WHERE reference = $1",
      [all.body.reference],
    );
    const afterExpiry = await book({ screeningId: screening.id, seatIds: [], wheelchairSpaces: 1 });
    assert.equal(afterExpiry.status, 201);
  },
);

test(
  "concurrent wheelchair bookings never exceed the capacity",
  { skip: !hasDatabase },
  async () => {
    const screening = await createScreening({ basePrice: 12.5, isPremiere: false });

    const responses = await Promise.all([
      book({ screeningId: screening.id, seatIds: [], wheelchairSpaces: 6 }),
      book({ screeningId: screening.id, seatIds: [], wheelchairSpaces: 6 }),
    ]);

    assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 409]);
    const { rows } = await pool.query(
      "SELECT COUNT(*)::integer AS count FROM tickets WHERE screening_id = $1 AND is_wheelchair",
      [screening.id],
    );
    assert.equal(rows[0].count, 6);
  },
);
