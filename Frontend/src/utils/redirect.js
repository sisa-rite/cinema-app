const ROLE_HOMES = { admin: "/admin", cashier: "/cashier" };

export function homeForRole(role) {
  return ROLE_HOMES[role] ?? "/";
}

// Only internal paths, so ?redirect= cannot send anyone to another site.
export function safeRedirect(path) {
  if (!path?.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  return path;
}
