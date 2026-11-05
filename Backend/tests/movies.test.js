import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const expectedMovieFields = [
  "id",
  "title",
  "description",
  "durationMinutes",
  "genre",
  "ageRating",
  "posterUrl",
];

test("GET /api/movies requires a valid city", async () => {
  for (const city of [undefined, "helsinki", ""]) {
    const url = city === undefined ? "/api/movies" : `/api/movies?city=${city}`;
    const response = await request(app).get(url);
    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys(response.body), ["error"]);
    assert.equal(response.body.error.code, "INVALID_CITY");
  }
});

test("GET /api/movies/:id rejects invalid ids", async () => {
  for (const id of ["0", "-1", "1.5", "abc", "9007199254740992"]) {
    const response = await request(app).get(`/api/movies/${id}?city=oulu`);
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "INVALID_ID");
  }
});

test("GET /api/movies/:id validates city", async () => {
  const response = await request(app).get("/api/movies/1?city=helsinki");
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_CITY");
});

test(
  "GET /api/movies/:id returns 404 for an unknown movie",
  { skip: !hasDatabase },
  async () => {
    const response = await request(app).get(
      "/api/movies/2147483647?city=oulu",
    );
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "MOVIE_NOT_FOUND");
  },
);

test(
  "Oulu movie list contains only movies with upcoming Oulu screenings",
  { skip: !hasDatabase },
  async () => {
    const response = await request(app).get("/api/movies?city=OuLu");
    assert.equal(response.status, 200);
    assert.ok(response.body.length > 0);
    assert.deepEqual(
      response.body.map((movie) => movie.title),
      [...response.body.map((movie) => movie.title)].sort((a, b) =>
        a.localeCompare(b),
      ),
    );

    for (const movie of response.body) {
      assert.deepEqual(
        Object.keys(movie).sort(),
        [...expectedMovieFields].sort(),
      );
      const detail = await request(app).get(`/api/movies/${movie.id}?city=oulu`);
      assert.equal(detail.status, 200);
      assert.ok(detail.body.screenings.length > 0);
      assert.ok(
        detail.body.screenings.every(
          (screening) =>
            screening.theatreName.toLowerCase().includes("oulu") &&
            Date.parse(screening.startsAt) > Date.now(),
        ),
      );
    }
  },
);

test(
  "movie details return sorted future screenings with typed prices",
  { skip: !hasDatabase },
  async () => {
    const movies = await request(app).get("/api/movies?city=oulu");
    assert.equal(movies.status, 200);
    assert.ok(movies.body.length > 0);

    const response = await request(app).get(
      `/api/movies/${movies.body[0].id}?city=oulu`,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      Object.keys(response.body).sort(),
      [...expectedMovieFields, "trailerUrl", "screenings"].sort(),
    );
    const screenings = response.body.screenings;
    assert.ok(screenings.length > 0);
    assert.deepEqual(
      screenings.map(({ startsAt }) => startsAt),
      screenings.map(({ startsAt }) => startsAt).sort(),
    );
    for (const screening of screenings) {
      assert.ok(Number.isFinite(Date.parse(screening.startsAt)));
      assert.ok(Date.parse(screening.startsAt) > Date.now());
      assert.equal(typeof screening.basePrice, "number");
      assert.ok(screening.theatreName.toLowerCase().includes("oulu"));
      assert.deepEqual(
        Object.keys(screening).sort(),
        [
          "id",
          "startsAt",
          "theatreName",
          "hallName",
          "basePrice",
          "isPremiere",
        ].sort(),
      );
    }
  },
);
