import { apiGet, apiPost } from "./client.js";

export function register({ name, email, password }) {
  return apiPost("/api/auth/register", { name, email, password });
}

export function login({ email, password }) {
  return apiPost("/api/auth/login", { email, password });
}

export function getMe({ signal } = {}) {
  return apiGet("/api/auth/me", { signal });
}
