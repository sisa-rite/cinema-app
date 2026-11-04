import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "../src/db.js";
import { generateSeatLayout } from "../src/modules/halls/seatLayout.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOVIES_FILE = path.join(SCRIPT_DIR, "..", "seed", "movies.json");
const SEED_DAYS = 14;
const SHOWTIMES = [
  { hour: 14, minute: 0 },
  { hour: 17, minute: 30 },
  { hour: 21, minute: 0 },
];

function getLocalDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return Object.fromEntries(
    parts.map(({ type, value }) => [type, Number(value)]),
  );
}

function getHelsinkiTimestamp(year, month, day, hour, minute) {
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offset = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Helsinki",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(localAsUtc))
    .find(({ type }) => type === "timeZoneName").value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match)
    throw new Error(`Could not determine Helsinki time-zone offset: ${offset}`);

  const offsetMinutes =
    (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3]));
  return new Date(localAsUtc - offsetMinutes * 60_000).toISOString();
}

function getScreeningDates() {
  const today = getLocalDateParts(new Date());
  const firstDay = new Date(Date.UTC(today.year, today.month - 1, today.day));

  return Array.from({ length: SEED_DAYS }, (_, index) => {
    const date = new Date(firstDay);
    date.setUTCDate(date.getUTCDate() + index + 1);
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  });
}

function validateMovies(movies) {
  if (!Array.isArray(movies) || movies.length < 8 || movies.length > 10) {
    throw new Error("seed/movies.json must contain between 8 and 10 movies.");
  }

  for (const movie of movies) {
    if (
      !/^tt\d+$/.test(movie.imdb_id ?? "") ||
      !movie.title ||
      !Number.isInteger(movie.duration_minutes) ||
      movie.duration_minutes < 1 ||
      !movie.genre
    ) {
      throw new Error(
        `Movie data is incomplete for ${movie.imdb_id ?? "an unknown IMDb ID"}; run npm run fetch-movies.`,
      );
    }
  }
}

async function insertMovie(client, movie) {
  const { rows } = await client.query(
    `INSERT INTO movies
      (imdb_id, title, description, duration_minutes, genre, age_rating, poster_url, trailer_url, published)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
     RETURNING id`,
    [
      movie.imdb_id,
      movie.title,
      movie.description,
      movie.duration_minutes,
      movie.genre,
      movie.age_rating,
      movie.poster_url,
      movie.trailer_url,
    ],
  );
  return rows[0].id;
}

async function addScreenings(client, halls, movies) {
  const premieredMovies = new Set();
  let screeningCount = 0;
  let movieCursor = 0;

  for (const date of getScreeningDates()) {
    for (const hall of halls) {
      for (
        let showtimeIndex = 0;
        showtimeIndex < SHOWTIMES.length;
        showtimeIndex += 1
      ) {
        const nextShowtime = SHOWTIMES[showtimeIndex + 1];
        const maxDuration = nextShowtime
          ? nextShowtime.hour * 60 +
            nextShowtime.minute -
            (SHOWTIMES[showtimeIndex].hour * 60 +
              SHOWTIMES[showtimeIndex].minute) -
            15
          : Number.POSITIVE_INFINITY;
        let movie;
        let examinedMovies = 0;

        do {
          movie = movies[movieCursor % movies.length];
          movieCursor += 1;
          examinedMovies += 1;
          if (examinedMovies > movies.length) {
            throw new Error(
              `No movie fits the ${SHOWTIMES[showtimeIndex].hour}:${String(SHOWTIMES[showtimeIndex].minute).padStart(2, "0")} timeslot in ${hall.name}.`,
            );
          }
        } while (movie.duration_minutes > maxDuration);

        const showtime = SHOWTIMES[showtimeIndex];
        const startsAt = getHelsinkiTimestamp(
          date.year,
          date.month,
          date.day,
          showtime.hour,
          showtime.minute,
        );
        const isPremiere = !premieredMovies.has(movie.id);

        await client.query(
          `INSERT INTO screenings
            (movie_id, hall_id, starts_at, base_price, is_premiere, published)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [
            movie.id,
            hall.id,
            startsAt,
            hall.name === "Hall 1" ? 12.5 : 13.5,
            isPremiere,
          ],
        );
        premieredMovies.add(movie.id);
        screeningCount += 1;
      }
    }
  }

  return screeningCount;
}

async function seed() {
  const reset = process.argv.includes("--reset");
  if (reset && process.env.NODE_ENV === "production") {
    throw new Error("--reset is disabled when NODE_ENV=production.");
  }
  if (!process.env.SEED_PASSWORD && process.env.NODE_ENV === "production") {
    throw new Error("SEED_PASSWORD must be set in production.");
  }

  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;

    if (reset) {
      await client.query(
        "TRUNCATE theatres, halls, seats, movies, screenings, users, bookings, tickets, payments RESTART IDENTITY CASCADE",
      );
    } else {
      const { rows } = await client.query(
        "SELECT EXISTS (SELECT 1 FROM theatres)",
      );
      if (rows[0].exists) {
        await client.query("COMMIT");
        transactionOpen = false;
        console.log("Seed skipped: data exists");
        return;
      }
    }

    const movies = JSON.parse(await fs.readFile(MOVIES_FILE, "utf8"));
    validateMovies(movies);

    const theatres = [];
    for (const theatre of [
      {
        name: "Rio Oulu",
        city: "Oulu",
        address: "Demo address 1, Oulu",
        phone: "+358 40 000 0001 (demo)",
      },
      {
        name: "Rio Tampere",
        city: "Tampere",
        address: "Demo address 2, Tampere",
        phone: "+358 40 000 0002 (demo)",
      },
    ]) {
      const { rows } = await client.query(
        `INSERT INTO theatres (name, city, address, phone)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [theatre.name, theatre.city, theatre.address, theatre.phone],
      );
      theatres.push({ ...theatre, id: rows[0].id });
    }

    const halls = [];
    for (const theatre of theatres) {
      for (const hall of [
        { name: "Hall 1", totalRows: 10, seatsPerRow: 10 },
        { name: "Hall 2", totalRows: 20, seatsPerRow: 10 },
      ]) {
        const { rows } = await client.query(
          `INSERT INTO halls (theatre_id, name, total_rows, seats_per_row, wheelchair_spaces)
           VALUES ($1, $2, $3, $4, 10)
           RETURNING id`,
          [theatre.id, hall.name, hall.totalRows, hall.seatsPerRow],
        );
        halls.push({ ...hall, id: rows[0].id });
      }
    }

    let seatCount = 0;
    for (const hall of halls) {
      const layout = generateSeatLayout(hall.totalRows, hall.seatsPerRow);
      for (const seat of layout) {
        await client.query(
          `INSERT INTO seats (hall_id, row_number, seat_number, pos_x, pos_y, type)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            hall.id,
            seat.rowNumber,
            seat.seatNumber,
            seat.posX,
            seat.posY,
            seat.type,
          ],
        );
      }
      seatCount += layout.length;
    }

    const moviesWithIds = [];
    for (const movie of movies) {
      moviesWithIds.push({ ...movie, id: await insertMovie(client, movie) });
    }

    const screeningCount = await addScreenings(client, halls, moviesWithIds);
    const passwords = {
      admin: process.env.SEED_PASSWORD ?? "Rio-demo-2026",
      cashierOulu: process.env.SEED_PASSWORD ?? "Rio-demo-2026",
      cashierTampere: process.env.SEED_PASSWORD ?? "Rio-demo-2026",
    };
    const passwordHashes = {
      admin: await bcrypt.hash(passwords.admin, 10),
      cashierOulu: await bcrypt.hash(passwords.cashierOulu, 10),
      cashierTampere: await bcrypt.hash(passwords.cashierTampere, 10),
    };
    const users = [
      {
        name: "Rio Admin",
        email: "admin@rio.test",
        role: "admin",
        theatreId: null,
        passwordHash: passwordHashes.admin,
      },
      {
        name: "Oulu Cashier",
        email: "cashier.oulu@rio.test",
        role: "cashier",
        theatreId: theatres.find(({ city }) => city === "Oulu").id,
        passwordHash: passwordHashes.cashierOulu,
      },
      {
        name: "Tampere Cashier",
        email: "cashier.tampere@rio.test",
        role: "cashier",
        theatreId: theatres.find(({ city }) => city === "Tampere").id,
        passwordHash: passwordHashes.cashierTampere,
      },
    ];

    for (const user of users) {
      await client.query(
        `INSERT INTO users (name, email, password_hash, role, theatre_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.name, user.email, user.passwordHash, user.role, user.theatreId],
      );
    }

    await client.query("COMMIT");
    transactionOpen = false;
    console.log("Seed complete:");
    console.log(`  Theatres: ${theatres.length}`);
    console.log(`  Halls: ${halls.length}`);
    console.log(`  Seats: ${seatCount}`);
    console.log(`  Movies: ${movies.length}`);
    console.log(`  Screenings: ${screeningCount}`);
    console.log(`  Users: ${users.length}`);
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

try {
  await seed();
} catch (error) {
  console.error(`Seed failed: ${error.message || error.code || error}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
