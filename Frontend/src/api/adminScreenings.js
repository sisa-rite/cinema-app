import { apiDelete, apiGet, apiPatch, apiPost } from "./client.js";

export function getAdminScreenings({ from, to, theatreId }, { signal } = {}) {
  const params = new URLSearchParams({ from, to });
  if (theatreId) params.set("theatreId", theatreId);
  return apiGet(`/api/admin/screenings?${params}`, { signal });
}

export function getAdminScreening(id, { signal } = {}) {
  return apiGet(`/api/admin/screenings/${encodeURIComponent(id)}`, { signal });
}

export function createScreening(data) {
  return apiPost("/api/admin/screenings", data);
}

export function updateScreening(id, changes) {
  return apiPatch(`/api/admin/screenings/${encodeURIComponent(id)}`, changes);
}

export function deleteScreening(id) {
  return apiDelete(`/api/admin/screenings/${encodeURIComponent(id)}`);
}

export function getAdminHalls({ signal } = {}) {
  return apiGet("/api/admin/halls", { signal });
}
