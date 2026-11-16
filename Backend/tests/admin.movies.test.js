import "dotenv/config";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import pool from "../src/db.js";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const createdMovieIds = [];
const createdScreeningIds = [];
let customerEmail;

after(async () => {
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
  if (customerEmail) {
    await pool.query("DELETE FROM users WHERE email = $1", [customerEmail]);
  }
  await pool.end();
});

function uniqueTitle() {
  return `FR-011 ${crypto.randomUUID()}`;
}

function futureStartsAt(days, hour, minute) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

async function createMovie(token, body) {
  const response = await request(app)
    .post("/api/admin/movies")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
  if (response.status === 201) createdMovieIds.push(response.body.id);
  return response;
}

test(
  "admin movie API",
  { skip: !hasDatabase },
  async (t) => {
    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "admin@rio.test",
      password: process.env.SEED_PASSWORD ?? "Rio-demo-2026",
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.body.token;

    customerEmail = `fr011-${crypto.randomUUID()}@example.test`;
    const customerRegistration = await request(app)
      .post("/api/auth/register")
      .send({
        name: "FR-011 Customer",
        email: customerEmail,
        password: "customer-password",
      });
    assert.equal(customerRegistration.status, 201);
    const customerToken = customerRegistration.body.token;

    const title = uniqueTitle();
    let movie;
    let city;
    let hallId;
    let startsAt;

    await t.test("protects the movie routes by role", async () => {
      const routes = [
        () => request(app).get("/api/admin/movies"),
        () => request(app).get("/api/admin/movies/1"),
        () => request(app).post("/api/admin/movies").send({}),
        () => request(app).patch("/api/admin/movies/1").send({}),
      ];
      for (const call of routes) {
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

    await t.test("creates unpublished movies and validates fields", async () => {
      const created = await createMovie(adminToken, {
        title: `  ${title}  `,
        description: "  Test description  ",
        durationMinutes: 100,
        genre: "  Drama  ",
        ageRating: "K-12",
        posterUrl: " https://example.test/poster.jpg ",
      });
      assert.equal(created.status, 201);
      movie = created.body;
      assert.equal(movie.title, title);
      assert.equal(movie.description, "Test description");
      assert.equal(movie.genre, "Drama");
      assert.equal(movie.published, false);
      assert.equal(movie.upcomingScreenings, 0);

      const details = await request(app)
        .get(`/api/admin/movies/${movie.id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(details.status, 200);
      assert.equal(details.body.id, movie.id);

      const invalidId = await request(app)
        .get("/api/admin/movies/0")
        .set("Authorization", `Bearer ${adminToken}`);
      assert.equal(invalidId.status, 400);
      assert.equal(invalidId.body.error.code, "INVALID_ID");

      const publicMovies = await request(app).get("/api/movies?city=oulu");
      assert.equal(publicMovies.status, 200);
      assert.ok(
        !publicMovies.body.some(({ title: itemTitle }) => itemTitle === title),
      );

      const invalid = await request(app)
        .post("/api/admin/movies")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title: "   ",
          durationMinutes: 0,
          ageRating: "PG-13",
          trailerUrl: "ftp://example.test/trailer",
        });
      assert.equal(invalid.status, 400);
      assert.equal(invalid.body.error.code, "VALIDATION_ERROR");
      assert.deepEqual(Object.keys(invalid.body.error.details.fields).sort(), [
        "ageRating",
        "durationMinutes",
        "title",
        "trailerUrl",
      ]);
    });

    await t.test("PATCH changes only supplied fields", async () => {
      const updatedTitle = `${title} updated`;
      const response = await request(app)
        .patch(`/api/admin/movies/${movie.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ title: updatedTitle, imdbId: "tt0000000", ignored: true });
      assert.equal(response.status, 200);
      assert.equal(response.body.title, updatedTitle);
      assert.equal(response.body.description, movie.description);
      assert.equal(response.body.durationMinutes, movie.durationMinutes);
      assert.equal(response.body.genre, movie.genre);
      assert.equal(response.body.ageRating, movie.ageRating);
      assert.equal(response.body.posterUrl, movie.posterUrl);
      assert.equal(response.body.trailerUrl, movie.trailerUrl);
      assert.equal(response.body.published, false);
      movie = response.body;
    });

    await t.test(
      "publishes with one upcoming customer-visible screening",
      async () => {
        const halls = await pool.query(
          `SELECT hall.id, LOWER(theatre.city) AS city
           FROM halls AS hall
           JOIN theatres AS theatre ON theatre.id = hall.theatre_id
           WHERE LOWER(theatre.city) = 'oulu'
           ORDER BY hall.id`,
        );
        assert.ok(halls.rows.length > 0);
        city = halls.rows[0].city;
        hallId = halls.rows[0].id;

        let screeningStart;
        for (let days = 120; days <= 365; days += 1) {
          const candidate = futureStartsAt(days, 18, 0);
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
            [hallId, candidate, movie.durationMinutes],
          );
          if (rows.length === 0) {
            screeningStart = candidate;
            break;
          }
        }
        assert.ok(screeningStart, "expected to find an unused Oulu hall time");
        startsAt = screeningStart;

        const publishedMovie = await request(app)
          .patch(`/api/admin/movies/${movie.id}`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ published: true });
        assert.equal(publishedMovie.status, 200);
        movie = publishedMovie.body;

        const screening = await request(app)
          .post("/api/admin/screenings")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            movieId: movie.id,
            hallId,
            startsAt,
            basePrice: 12.5,
            published: true,
          });
        assert.equal(screening.status, 201);
        createdScreeningIds.push(screening.body.id);

        const customerMovies = await request(app).get(
          `/api/movies?city=${encodeURIComponent(city)}`,
        );
        assert.equal(customerMovies.status, 200);
        assert.ok(
          customerMovies.body.some(
            ({ title: itemTitle }) => itemTitle === movie.title,
          ),
        );

        const adminMovies = await request(app)
          .get("/api/admin/movies")
          .set("Authorization", `Bearer ${adminToken}`);
        assert.equal(adminMovies.status, 200);
        const current = adminMovies.body.find(({ id }) => id === movie.id);
        assert.ok(current);
        assert.equal(current.upcomingScreenings, 1);
        assert.deepEqual(
          adminMovies.body.map(({ title: itemTitle }) => itemTitle),
          [...adminMovies.body.map(({ title: itemTitle }) => itemTitle)].sort(
            (left, right) => left.localeCompare(right),
          ),
        );
      },
    );
  },
);
