import { apiGet } from "./client.js";

export function getScreeningSeats(id, { signal } = {}) {
  return apiGet(`/api/screenings/${encodeURIComponent(id)}/seats`, { signal });
}
