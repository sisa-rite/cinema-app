import { apiGet, apiPost } from "./client.js";

export function createBooking({ screeningId, seatIds, childTickets, wheelchairSpaces, email }) {
  return apiPost("/api/bookings", { screeningId, seatIds, childTickets, wheelchairSpaces, email });
}

export function getBooking(reference, email, { signal } = {}) {
  const params = new URLSearchParams({ email });
  return apiGet(`/api/bookings/${encodeURIComponent(reference)}?${params}`, { signal });
}

export function payBooking(reference, { email, acceptNoRefund }) {
  return apiPost(`/api/bookings/${encodeURIComponent(reference)}/pay`, { email, acceptNoRefund });
}

// Customer only; the client sends the token. No body: the server decides everything.
export function reserveBooking(reference) {
  return apiPost(`/api/bookings/${encodeURIComponent(reference)}/reserve`, {});
}

export function cancelBooking(reference) {
  return apiPost(`/api/bookings/${encodeURIComponent(reference)}/cancel`, {});
}
