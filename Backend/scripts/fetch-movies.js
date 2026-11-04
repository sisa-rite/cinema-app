import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOVIES_FILE = path.join(SCRIPT_DIR, "..", "seed", "movies.json");
const IMDB_IDS = [
  "tt15239678",
  "tt22022452",
  "tt15398776",
  "tt1517268",
  "tt1877830",
  "tt1630029",
  "tt1745960",
  "tt0816692",
  "tt6751668",
];

async function fetchMovie(imdbId, ageRating) {
  const url = new URL("https://www.omdbapi.com/");
  url.search = new URLSearchParams({
    i: imdbId,
    plot: "short",
    apikey: process.env.OMDB_API_KEY,
  });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `OMDb request for ${imdbId} failed with HTTP ${response.status}`,
    );
  }

  const movie = await response.json();
  if (movie.Response === "False") {
    throw new Error(`OMDb could not fetch ${imdbId}: ${movie.Error}`);
  }
  if (movie.imdbID !== imdbId) {
    throw new Error(`OMDb returned an unexpected movie for ${imdbId}`);
  }

  const runtime = /^(\d+)\s+min$/i.exec(movie.Runtime ?? "");
  if (!runtime) {
    throw new Error(
      `OMDb returned an invalid runtime for ${imdbId}: ${movie.Runtime}`,
    );
  }

  return {
    imdb_id: movie.imdbID,
    title: movie.Title,
    description: movie.Plot === "N/A" ? null : movie.Plot,
    duration_minutes: Number(runtime[1]),
    genre: movie.Genre === "N/A" ? null : movie.Genre,
    age_rating: ageRating ?? null,
    poster_url: movie.Poster === "N/A" ? null : movie.Poster,
    trailer_url: null,
  };
}

async function fetchMovies() {
  if (!process.env.OMDB_API_KEY) {
    throw new Error(
      "OMDB_API_KEY is missing. Add your own key to Backend/.env before fetching movies.",
    );
  }

  let previousMovies = [];
  try {
    previousMovies = JSON.parse(await fs.readFile(MOVIES_FILE, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const ageRatings = new Map(
    previousMovies.map(({ imdb_id, age_rating }) => [imdb_id, age_rating]),
  );

  const movies = [];
  for (const imdbId of IMDB_IDS) {
    movies.push(await fetchMovie(imdbId, ageRatings.get(imdbId)));
  }

  await fs.mkdir(path.dirname(MOVIES_FILE), { recursive: true });
  await fs.writeFile(MOVIES_FILE, `${JSON.stringify(movies, null, 2)}\n`);
  console.log(
    `Fetched ${movies.length} movies from OMDb into Backend/seed/movies.json`,
  );
}

try {
  await fetchMovies();
} catch (error) {
  console.error(`Movie fetch failed: ${error.message}`);
  process.exitCode = 1;
}
