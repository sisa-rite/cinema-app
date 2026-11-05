import { apiGet } from "./client.js";

export function getMovies(city, { signal } = {}) {
  return apiGet(`/api/movies?city=${encodeURIComponent(city)}`, { signal });
}

export function getMovie(id, city, { signal } = {}) {
  return apiGet(
    `/api/movies/${encodeURIComponent(id)}?city=${encodeURIComponent(city)}`,
    { signal },
  );
}
