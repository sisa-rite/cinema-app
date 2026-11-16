import {
  findAdminMovie,
  insertAdminMovie,
  listAdminMovies,
  updateAdminMovie,
} from "./adminMovies.db.js";

const AGE_RATINGS = new Set(["S", "K-7", "K-12", "K-16", "K-18"]);

export class AdminMoviesServiceError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

function validationError(fields) {
  return new AdminMoviesServiceError(
    400,
    "VALIDATION_ERROR",
    "Request validation failed.",
    { fields },
  );
}

function validateMovieFields(body, { creating = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw validationError({ body: "Must be an object" });
  }
  const fields = {};
  const values = {};

  if (creating || Object.hasOwn(body, "title")) {
    if (typeof body.title !== "string") {
      fields.title = "Must be text with 1 to 200 characters";
    } else {
      const title = body.title.trim();
      if (title.length < 1 || title.length > 200) {
        fields.title = "Must be text with 1 to 200 characters";
      } else {
        values.title = title;
      }
    }
  }

  if (creating || Object.hasOwn(body, "durationMinutes")) {
    if (
      !Number.isInteger(body.durationMinutes) ||
      body.durationMinutes < 1 ||
      body.durationMinutes > 600
    ) {
      fields.durationMinutes = "Must be an integer from 1 to 600";
    } else {
      values.durationMinutes = body.durationMinutes;
    }
  }

  for (const [field, maxLength] of [
    ["description", 2000],
    ["genre", 100],
  ]) {
    if (!Object.hasOwn(body, field)) continue;
    const value = body[field];
    if (value === null) {
      values[field] = null;
    } else if (typeof value !== "string") {
      fields[field] = `Must be text of at most ${maxLength} characters or null`;
    } else if (value.trim().length > maxLength) {
      fields[field] = `Must be text of at most ${maxLength} characters or null`;
    } else {
      values[field] = value.trim();
    }
  }

  if (Object.hasOwn(body, "ageRating")) {
    const value =
      typeof body.ageRating === "string"
        ? body.ageRating.trim()
        : body.ageRating;
    if (
      value === null ||
      (typeof value === "string" && AGE_RATINGS.has(value))
    ) {
      values.ageRating = value;
    } else {
      fields.ageRating = "Must be S, K-7, K-12, K-16, K-18, or null";
    }
  }

  for (const field of ["posterUrl", "trailerUrl"]) {
    if (!Object.hasOwn(body, field)) continue;
    const value = body[field];
    if (value === null) {
      values[field] = null;
      continue;
    }
    if (typeof value !== "string") {
      fields[field] =
        "Must be an absolute http or https URL of at most 500 characters, or null";
      continue;
    }
    const url = value.trim();
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      fields[field] =
        "Must be an absolute http or https URL of at most 500 characters, or null";
      continue;
    }
    if (
      url.length > 500 ||
      !/^https?:\/\//i.test(url) ||
      !["http:", "https:"].includes(parsed.protocol) ||
      !parsed.hostname
    ) {
      fields[field] =
        "Must be an absolute http or https URL of at most 500 characters, or null";
    } else {
      values[field] = url;
    }
  }

  if (Object.hasOwn(body, "published")) {
    if (typeof body.published !== "boolean") {
      fields.published = "Must be a boolean";
    } else {
      values.published = body.published;
    }
  }

  if (Object.keys(fields).length > 0) throw validationError(fields);

  if (creating) {
    for (const field of [
      "description",
      "genre",
      "ageRating",
      "posterUrl",
      "trailerUrl",
    ]) {
      values[field] ??= null;
    }
    values.published ??= false;
  }
  return values;
}

function parsePathId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > 2_147_483_647
  ) {
    throw new AdminMoviesServiceError(
      400,
      "INVALID_ID",
      "Movie id must be a positive integer.",
    );
  }
  return Number(value);
}

function toMovieResponse(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    durationMinutes: row.duration_minutes,
    genre: row.genre,
    ageRating: row.age_rating,
    posterUrl: row.poster_url,
    trailerUrl: row.trailer_url,
    published: row.published,
    upcomingScreenings: row.upcoming_screenings,
  };
}

function movieNotFound() {
  return new AdminMoviesServiceError(
    404,
    "MOVIE_NOT_FOUND",
    "The requested movie was not found.",
  );
}

export async function listMovies() {
  return (await listAdminMovies()).map(toMovieResponse);
}

export async function getMovie(pathId) {
  const id = parsePathId(pathId);
  const movie = await findAdminMovie(id);
  if (!movie) throw movieNotFound();
  return toMovieResponse(movie);
}

export async function createMovie(body) {
  const values = validateMovieFields(body, { creating: true });
  const id = await insertAdminMovie(values);
  return toMovieResponse(await findAdminMovie(id));
}

export async function updateMovie(pathId, body) {
  const id = parsePathId(pathId);
  const changes = validateMovieFields(body);
  if (
    Object.keys(changes).length > 0 &&
    !(await updateAdminMovie(id, changes))
  ) {
    throw movieNotFound();
  }
  const movie = await findAdminMovie(id);
  if (!movie) throw movieNotFound();
  return toMovieResponse(movie);
}
