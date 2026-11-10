import { apiGet, apiPost } from "./client.js";

export function createBooking({ screeningId, seatIds, email }) {
  return apiPost("/api/bookings", { screeningId, seatIds, email });
}

export function getBooking(reference, email, { signal } = {}) {
  const params = new URLSearchParams({ email });
  return apiGet(`/api/bookings/${encodeURIComponent(reference)}?${params}`, { signal });
}
