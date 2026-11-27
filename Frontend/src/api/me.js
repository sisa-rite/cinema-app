import { apiGet } from "./client.js";

export function getMyBookings({ signal } = {}) {
  return apiGet("/api/me/bookings", { signal });
}

export function getMyLoyalty({ signal } = {}) {
  return apiGet("/api/me/loyalty", { signal });
}
