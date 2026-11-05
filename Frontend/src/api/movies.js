import { apiGet } from "./client.js";

export function getMovies(city, { signal } = {}) {
  return apiGet(`/api/movies?city=${encodeURIComponent(city)}`, { signal });
}
