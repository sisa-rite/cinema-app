import "dotenv/config";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/db.js";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const createdScreeningIds = [];
const unpublishedMovies = new Map();
let customerEmail;

after(async () => {
  if (createdScreeningIds.length > 0) {
    await pool.query(
      `DELETE FROM tickets WHERE screening_id = ANY($1::integer[])`,
      [createdScreeningIds],
    );
    await pool.query(
      `DELETE FROM bookings WHERE screening_id = ANY($1::integer[])`,
      [createdScreeningIds],
    );
    await pool.query(
      "DELETE FROM screenings WHERE id = ANY($1::integer[])",
      [createdScreeningIds],
    );
  }
  for (const [movieId, published] of unpublishedMovies) {
    await pool.query("UPDATE movies SET published = $2 WHERE id = $1", [
      movieId,
      published,
    ]);
  }
  if (customerEmail) {
    await pool.query("DELETE FROM users WHERE email = $1", [customerEmail]);
  }
  await pool.end();
});

function futureStartsAt(days = 22, hour = 17, minute = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

function iso(date) {
  return date.toISOString();
}

function helsinkiDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function screeningBody(movieId, hallId, startsAt, overrides = {}) {
  return {
    movieId,
    hallId,
    startsAt: startsAt instanceof Date ? iso(startsAt) : startsAt,
    basePrice: 12.5,
    ...overrides,
  };
}

async function recordScreening(response) {
  if (response.status === 201 || response.status === 200) {
    createdScreeningIds.push(response.body.id);
  }
  return response;
}

test(
  "admin screening and hall API",
  { skip: !hasDatabase },
  async (t) => {
    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "admin@rio.test",
      password: process.env.SEED_PASSWORD ?? "Rio-demo-2026",
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.body.token;

    customerEmail = `fr012-${crypto.randomUUID()}@example.test`;
    const customerRegistration = await request(app)
      .post("/api/auth/register")
      .send({
        name: "FR-012 Customer",
        email: customerEmail,
        password: "customer-password",
      });
    assert.equal(customerRegistration.status, 201);
    const customerToken = customerRegistration.body.token;

    const { rows: refs } = await pool.query(
      `SELECT movie.id AS movie_id, movie.published, movie.duration_minutes,
              hall.id AS hall_id, theatre.id AS theatre_id,
              LOWER(theatre.city) AS city
       FROM movies AS movie
       CROSS JOIN halls AS hall
       JOIN theatres AS theatre ON theatre.id = hall.theatre_id
       WHERE movie.published = true
       ORDER BY movie.id, hall.id
       LIMIT 1`,
    );
    assert.equal(refs.length, 1);
    const {
      movie_id: movieId,
      hall_id: hallId,
      theatre_id: theatreId,
      city,
    } = refs[0];
    const otherHall = await pool.query(
      "SELECT id FROM halls WHERE id <> $1 ORDER BY id LIMIT 1",
      [hallId],
    );
    assert.equal(otherHall.rows.length, 1);

    const { rows: seededScreenings } = await pool.query(
      "SELECT id FROM screenings ORDER BY id LIMIT 1",
    );
    assert.equal(seededScreenings.length, 1);

    await t.test("protects the entire admin router by role", async () => {
      const endpointCalls = [
        () => request(app).get("/api/admin/halls"),
        () => request(app).get("/api/admin/screenings"),
        () => request(app).get("/api/admin/screenings/1"),
        () => request(app).post("/api/admin/screenings").send({}),
        () => request(app).patch("/api/admin/screenings/1").send({}),
        () => request(app).delete("/api/admin/screenings/1"),
      ];
      for (const call of endpointCalls) {
        const anonymous = await call();
        assert.equal(anonymous.status, 401);
        assert.equal(anonymous.body.error.code, "UNAUTHORIZED");
        const customer = await call().set(
          "Authorization",
          `Bearer ${customerToken}`,
        );
        assert.equal(customer.status, 403);
        assert.equal(customer.body.error.code, "FORBIDDEN");
      }
    });

    await t.test("lists halls with seat totals and theatre names", async () => {
      const response = await request(app)
        .get("/api/admin/halls")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(response.status, 200);
      assert.equal(response.body.length, 4);
      assert.deepEqual(
        response.body.map(({ seats }) => seats).sort((a, b) => a - b),
        [100, 100, 200, 200],
      );
      assert.ok(response.body.every((hall) => hall.theatre.name));
      assert.ok(response.body.every((hall) => hall.theatre.city));
    });

    await t.test("creates, validates, then publishes a screening", async () => {
      const body = screeningBody(movieId, hallId, futureStartsAt());
      const created = await recordScreening(
        await request(app)
          .post("/api/admin/screenings")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ ...body, basePrice: 0 }),
      );
      assert.equal(created.status, 201);
      assert.equal(created.body.basePrice, 0);
      assert.equal(created.body.published, false);
      assert.deepEqual(Object.keys(created.body).sort(), [
        "basePrice",
        "endsAt",
        "hall",
        "id",
        "isPremiere",
        "movie",
        "published",
        "startsAt",
        "theatre",
        "ticketsHeld",
        "ticketsSold",
      ]);
      assert.equal(typeof created.body.startsAt, "string");
      assert.equal(typeof created.body.endsAt, "string");
      assert.equal(created.body.ticketsSold, 0);
      assert.equal(created.body.ticketsHeld, 0);

      const details = await request(app)
        .get(`/api/admin/screenings/${created.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(details.status, 200);
      assert.equal(details.body.id, created.body.id);

      const localDate = helsinkiDate(new Date(created.body.startsAt));
      const list = await request(app)
        .get(
          `/api/admin/screenings?from=${localDate}&to=${localDate}&theatreId=${theatreId}`,
        )
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(list.status, 200);
      assert.ok(list.body.some(({ id }) => id === created.body.id));

      const priceError = await request(app)
        .patch(`/api/admin/screenings/${created.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ published: true });
      assert.equal(priceError.status, 400);
      assert.equal(priceError.body.error.code, "VALIDATION_ERROR");
      assert.equal(
        priceError.body.error.details.fields.basePrice,
        "Set a price greater than 0 € before publishing",
      );

      const published = await request(app)
        .patch(`/api/admin/screenings/${created.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ basePrice: 12.5, published: true });
      assert.equal(published.status, 200);
      assert.equal(published.body.basePrice, 12.5);
      assert.equal(published.body.published, true);

      const customerMovie = await request(app).get(
        `/api/movies/${movieId}?city=${city}`,
      );
      assert.equal(customerMovie.status, 200);
      assert.ok(
        customerMovie.body.screenings.some(
          ({ id }) => id === created.body.id,
        ),
      );
    });

    await t.test("requires a published movie when publishing", async () => {
      const { rows } = await pool.query(
        "SELECT id, published FROM movies WHERE id = $1",
        [movieId],
      );
      unpublishedMovies.set(movieId, rows[0].published);
      await pool.query("UPDATE movies SET published = false WHERE id = $1", [
        movieId,
      ]);
      try {
        const response = await request(app)
          .post("/api/admin/screenings")
          .set("Authorization", `Bearer ${adminToken}`)
          .send(
            screeningBody(movieId, hallId, futureStartsAt(23), {
              published: true,
            }),
          );
        assert.equal(response.status, 409);
        assert.equal(response.body.error.code, "MOVIE_NOT_PUBLISHED");
      } finally {
        await pool.query("UPDATE movies SET published = $2 WHERE id = $1", [
          movieId,
          rows[0].published,
        ]);
        unpublishedMovies.delete(movieId);
      }
    });

    await t.test("rejects overlapping screenings and allows another hall", async () => {
      const startsAt = futureStartsAt(24);
      const first = await recordScreening(
        await request(app)
          .post("/api/admin/screenings")
          .set("Authorization", `Bearer ${adminToken}`)
          .send(screeningBody(movieId, hallId, startsAt)),
      );
      assert.equal(first.status, 201);

      const overlapping = await request(app)
        .post("/api/admin/screenings")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(screeningBody(movieId, hallId, new Date(startsAt.getTime() + 30 * 60_000)));
      assert.equal(overlapping.status, 409);
      assert.equal(overlapping.body.error.code, "SCREENING_OVERLAP");
      assert.ok(overlapping.body.error.details.screeningIds.includes(first.body.id));

      const otherHallResponse = await recordScreening(
        await request(app)
          .post("/api/admin/screenings")
          .set("Authorization", `Bearer ${adminToken}`)
          .send(
            screeningBody(
              movieId,
              otherHall.rows[0].id,
              new Date(startsAt.getTime() + 30 * 60_000),
            ),
          ),
      );
      assert.equal(otherHallResponse.status, 201);
    });

    await t.test("reserves twelve minutes before each screening for ads", async () => {
      const { duration_minutes: durationMinutes } = refs[0];
      for (const [dayOffset, minutesBefore, expectedStatus] of [
        [25, Number(durationMinutes) + 11, 409],
        [26, Number(durationMinutes) + 13, 201],
      ]) {
        const nextStartsAt = futureStartsAt(dayOffset, 20);
        const candidateStartsAt = new Date(
          nextStartsAt.getTime() - minutesBefore * 60_000,
        );
        const next = await recordScreening(
          await request(app)
            .post("/api/admin/screenings")
            .set("Authorization", `Bearer ${adminToken}`)
            .send(screeningBody(movieId, hallId, nextStartsAt)),
        );
        assert.equal(next.status, 201);

        const candidate = await request(app)
          .post("/api/admin/screenings")
          .set("Authorization", `Bearer ${adminToken}`)
          .send(screeningBody(movieId, hallId, candidateStartsAt));
        assert.equal(candidate.status, expectedStatus);
        if (candidate.status === 201) createdScreeningIds.push(candidate.body.id);
        if (candidate.status === 409) {
          assert.ok(candidate.body.error.details.screeningIds.includes(next.body.id));
        }
      }
    });

    await t.test("validates zoned and future start times", async () => {
      for (const startsAt of [
        "2035-01-01T10:00:00",
        "2000-01-01T10:00:00Z",
        "2035-02-31T10:00:00Z",
        "2035-01-01T24:00:00Z",
      ]) {
        const response = await request(app)
          .post("/api/admin/screenings")
          .set("Authorization", `Bearer ${adminToken}`)
          .send(screeningBody(movieId, hallId, startsAt));
        assert.equal(response.status, 400);
        assert.equal(response.body.error.code, "VALIDATION_ERROR");
        assert.equal(typeof response.body.error.details.fields.startsAt, "string");
      }

      for (const basePrice of [-0.01, 100.01, 1.234]) {
        const response = await request(app)
          .post("/api/admin/screenings")
          .set("Authorization", `Bearer ${adminToken}`)
          .send(
            screeningBody(movieId, hallId, futureStartsAt(28), {
              basePrice,
            }),
          );
        assert.equal(response.status, 400);
        assert.equal(response.body.error.code, "VALIDATION_ERROR");
        assert.equal(typeof response.body.error.details.fields.basePrice, "string");
      }

      const invalidRange = await request(app)
        .get("/api/admin/screenings?from=2030-01-01&to=2030-03-04")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(invalidRange.status, 400);
      assert.equal(invalidRange.body.error.code, "VALIDATION_ERROR");
      assert.equal(typeof invalidRange.body.error.details.fields.to, "string");
    });

    await t.test("ticket holds lock every screening change and deletion", async () => {
      const created = await recordScreening(
        await request(app)
          .post("/api/admin/screenings")
          .set("Authorization", `Bearer ${adminToken}`)
          .send(
            screeningBody(movieId, hallId, futureStartsAt(30), {
              published: true,
            }),
          ),
      );
      assert.equal(created.status, 201);
      const { rows: seatRows } = await pool.query(
        `SELECT id FROM seats
         WHERE hall_id = $1 AND type = 'normal'
         ORDER BY id LIMIT 1`,
        [hallId],
      );
      assert.equal(seatRows.length, 1);
      const hold = await request(app)
        .post("/api/bookings")
        .send({
          screeningId: created.body.id,
          seatIds: [seatRows[0].id],
          email: customerEmail,
        });
      assert.equal(hold.status, 201);

      const details = await request(app)
        .get(`/api/admin/screenings/${created.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(details.status, 200);
      assert.equal(details.body.ticketsHeld, 1);

      const patch = await request(app)
        .patch(`/api/admin/screenings/${created.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ published: false });
      assert.equal(patch.status, 409);
      assert.equal(patch.body.error.code, "SCREENING_HAS_BOOKINGS");

      const deletion = await request(app)
        .delete(`/api/admin/screenings/${created.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(deletion.status, 409);
      assert.equal(deletion.body.error.code, "SCREENING_HAS_BOOKINGS");
    });

    await t.test("deletes a screening without tickets", async () => {
      const created = await recordScreening(
        await request(app)
          .post("/api/admin/screenings")
          .set("Authorization", `Bearer ${adminToken}`)
          .send(screeningBody(movieId, hallId, futureStartsAt(27))),
      );
      assert.equal(created.status, 201);
      const deletion = await request(app)
        .delete(`/api/admin/screenings/${created.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(deletion.status, 204);

      const missing = await request(app)
        .get(`/api/admin/screenings/${created.body.id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(missing.status, 404);
      assert.equal(missing.body.error.code, "SCREENING_NOT_FOUND");
    });
  },
);
