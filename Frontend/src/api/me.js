import { apiGet } from "./client.js";

export function getMyBookings({ signal } = {}) {
  return apiGet("/api/me/bookings", { signal });
}
