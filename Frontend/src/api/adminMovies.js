import { apiGet, apiPatch, apiPost } from "./client.js";

export function getAdminMovies({ signal } = {}) {
  return apiGet("/api/admin/movies", { signal });
}

export function getAdminMovie(id, { signal } = {}) {
  return apiGet(`/api/admin/movies/${encodeURIComponent(id)}`, { signal });
}

export function createMovie(data) {
  return apiPost("/api/admin/movies", data);
}

export function updateMovie(id, changes) {
  return apiPatch(`/api/admin/movies/${encodeURIComponent(id)}`, changes);
}
