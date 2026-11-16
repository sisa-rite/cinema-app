import "dotenv/config";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/db.js";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const createdMovieIds = [];
const createdScreeningIds = [];
const createdReferences = [];

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
    await pool.query("DELETE FROM screenings WHERE id = ANY($1::integer[])", [
      createdScreeningIds,
    ]);
  }
  if (createdMovieIds.length > 0) {
    await pool.query("DELETE FROM movies WHERE id = ANY($1::integer[])", [
      createdMovieIds,
    ]);
  }
  await pool.end();
});

function futureStartsAt(days, hour, minute) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

async function findFreeSlot(durationMinutes) {
  const { rows: halls } = await pool.query(
    `SELECT hall.id
     FROM halls AS hall
     WHERE EXISTS (
       SELECT 1 FROM seats
       WHERE seats.hall_id = hall.id AND seats.type = 'normal'
     )
     ORDER BY hall.id
     LIMIT 1`,
  );
  assert.equal(halls.length, 1);
  const hallId = halls[0].id;
  for (let days = 60; days <= 365; days += 1) {
    const startsAt = futureStartsAt(days, 9, 0);
    const { rows } = await pool.query(
      `SELECT screening.id
       FROM screenings AS screening
       JOIN movies AS existing_movie ON existing_movie.id = screening.movie_id
       WHERE screening.hall_id = $1
         AND tstzrange(
               screening.starts_at - INTERVAL '12 minutes',
               screening.starts_at
                 + (existing_movie.duration_minutes * INTERVAL '1 minute')
             )
             &&
             tstzrange(
               $2::timestamptz - INTERVAL '12 minutes',
               $2::timestamptz + ($3::integer * INTERVAL '1 minute')
             )
       LIMIT 1`,
      [hallId, startsAt, durationMinutes],
    );
    if (rows.length === 0) return { hallId, startsAt };
  }
  assert.fail("expected to find an unused hall time");
}

async function findNormalSeats(hallId, limit) {
  const { rows } = await pool.query(
    `SELECT id FROM seats
     WHERE hall_id = $1 AND type = 'normal'
     ORDER BY id
     LIMIT $2`,
    [hallId, limit],
  );
  assert.equal(rows.length, limit);
  return rows.map(({ id }) => id);
}

test(
  "screenings of unpublished movies are not for sale",
  { skip: !hasDatabase },
  async (t) => {
    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "admin@rio.test",
      password: process.env.SEED_PASSWORD ?? "Rio-demo-2026",
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.body.token;

    const movie = await request(app)
      .post("/api/admin/movies")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: `Unpublished sales ${crypto.randomUUID()}`,
        durationMinutes: 90,
        published: true,
      });
    assert.equal(movie.status, 201);
    createdMovieIds.push(movie.body.id);
    const movieId = movie.body.id;

    const { hallId, startsAt } = await findFreeSlot(90);
    const screening = await request(app)
      .post("/api/admin/screenings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ movieId, hallId, startsAt, basePrice: 10, published: true });
    assert.equal(screening.status, 201);
    createdScreeningIds.push(screening.body.id);
    const screeningId = screening.body.id;
    const [firstSeatId, secondSeatId] = await findNormalSeats(hallId, 2);

    await t.test("hidden movie closes seat map and booking", async () => {
      const hidden = await request(app)
        .patch(`/api/admin/movies/${movieId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ published: false });
      assert.equal(hidden.status, 200);

      try {
        const seats = await request(app).get(
          `/api/screenings/${screeningId}/seats`,
        );
        assert.equal(seats.status, 404);
        assert.equal(seats.body.error.code, "SCREENING_NOT_FOUND");

        const booking = await request(app)
          .post("/api/bookings")
          .send({
            screeningId,
            seatIds: [firstSeatId],
            email: "unpublished-guest@example.test",
          });
        if (booking.status === 201) {
          createdReferences.push(booking.body.reference);
        }
        assert.equal(booking.status, 404);
        assert.equal(booking.body.error.code, "SCREENING_NOT_FOUND");
      } finally {
        const restored = await request(app)
          .patch(`/api/admin/movies/${movieId}`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ published: true });
        assert.equal(restored.status, 200);
      }

      const seats = await request(app).get(
        `/api/screenings/${screeningId}/seats`,
      );
      assert.equal(seats.status, 200);
    });

    await t.test("a booking made before hiding stays readable", async () => {
      const email = "unpublished-guest@example.test";
      const booking = await request(app)
        .post("/api/bookings")
        .send({ screeningId, seatIds: [secondSeatId], email });
      assert.equal(booking.status, 201);
      createdReferences.push(booking.body.reference);

      // The API refuses to hide a movie with tickets, so simulate a movie
      // that was hidden directly in the database.
      await pool.query("UPDATE movies SET published = false WHERE id = $1", [
        movieId,
      ]);
      try {
        const details = await request(app).get(
          `/api/bookings/${booking.body.reference}?email=${encodeURIComponent(email)}`,
        );
        assert.equal(details.status, 200);
        assert.equal(details.body.reference, booking.body.reference);
      } finally {
        await pool.query("UPDATE movies SET published = true WHERE id = $1", [
          movieId,
        ]);
      }
    });
  },
);
