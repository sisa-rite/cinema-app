import {
  findPublishedMovie,
  listPublishedMovies,
  listUpcomingScreenings,
} from "./movies.db.js";

const CITIES = new Set(["oulu", "tampere"]);

export class MoviesServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function validateCity(city) {
  if (typeof city !== "string" || !CITIES.has(city.toLowerCase())) {
    throw new MoviesServiceError(
      400,
      "INVALID_CITY",
      "City is required and must be either oulu or tampere.",
    );
  }
  return city.toLowerCase();
}

export async function getMovies(city) {
  return listPublishedMovies(validateCity(city));
}

export async function getMovie(id, city) {
  if (typeof id !== "string" || !/^[1-9]\d*$/.test(id)) {
    throw new MoviesServiceError(
      400,
      "INVALID_ID",
      "Movie id must be a positive integer.",
    );
  }

  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId)) {
    throw new MoviesServiceError(
      400,
      "INVALID_ID",
      "Movie id must be a positive integer.",
    );
  }

  const normalizedCity = validateCity(city);
  const movie = await findPublishedMovie(numericId);
  if (!movie) {
    throw new MoviesServiceError(
      404,
      "MOVIE_NOT_FOUND",
      "The requested movie was not found.",
    );
  }

  const screenings = await listUpcomingScreenings(numericId, normalizedCity);
  return {
    ...movie,
    screenings: screenings.map((screening) => ({
      id: screening.id,
      starts_at: screening.starts_at,
      theatre_name: screening.theatre_name,
      hall_name: screening.hall_name,
      base_price: screening.base_price,
      is_premiere: screening.is_premiere,
    })),
  };
}
