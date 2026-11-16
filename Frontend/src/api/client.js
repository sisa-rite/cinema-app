import { loadToken } from "../auth/token.js";

const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let unauthorizedHandler = null;

// Called when the server rejects a stored token (expired, or the user was deactivated).
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

async function request(path, { headers, ...options } = {}) {
  const token = loadToken();
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "The server could not be reached.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = new ApiError(
      response.status,
      body?.error?.code ?? "UNKNOWN_ERROR",
      body?.error?.message ?? "The server returned an unexpected response.",
      body?.error?.details ?? null,
    );
    if (token && error.status === 401 && error.code === "UNAUTHORIZED") unauthorizedHandler?.();
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

function jsonRequest(method, body, signal) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  };
}

export function apiGet(path, { signal } = {}) {
  return request(path, { signal });
}

export function apiPost(path, body, { signal } = {}) {
  return request(path, jsonRequest("POST", body, signal));
}

export function apiPatch(path, body, { signal } = {}) {
  return request(path, jsonRequest("PATCH", body, signal));
}

export function apiDelete(path, { signal } = {}) {
  return request(path, { method: "DELETE", signal });
}
