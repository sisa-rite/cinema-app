// localStorage is a documented simplification (docs/api.md); production would use an httpOnly cookie.
const TOKEN_KEY = "rio-token";

export function loadToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage can be blocked; the session then lasts until the page is reloaded.
  }
}

export function removeToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored, nothing to remove.
  }
}
