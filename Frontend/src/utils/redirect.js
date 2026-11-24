const ROLE_HOMES = { admin: "/admin", cashier: "/cashier", customer: "/my-bookings" };

export function homeForRole(role) {
  return ROLE_HOMES[role] ?? "/";
}

// Only internal paths, so ?redirect= cannot send anyone to another site.
export function safeRedirect(path) {
  if (!path?.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  return path;
}

// Customers may follow ?redirect=; staff always start in their own area.
export function customerLoginTarget(user, redirect) {
  if (user.role !== "customer") return homeForRole(user.role);
  return safeRedirect(redirect) ?? homeForRole(user.role);
}

// Keeps ?redirect= when switching between the log in and sign up pages.
export function withRedirect(path, redirect) {
  const target = safeRedirect(redirect);
  return target ? `${path}?${new URLSearchParams({ redirect: target })}` : path;
}
