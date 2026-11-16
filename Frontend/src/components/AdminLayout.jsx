import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";

const NAV_ITEMS = [
  { to: "/admin/screenings", label: "Screenings" },
  { to: "/admin/movies", label: "Movies" },
];

function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-rio-gold/20 bg-rio-black">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link to="/admin" className="rounded-sm font-display text-lg font-bold text-rio-gold">
            Rio Theatres — Admin
          </Link>
          <nav aria-label="Admin">
            <ul className="flex gap-2">
              {NAV_ITEMS.map(({ to, label }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className="block rounded-full border border-rio-gold/40 px-4 py-1.5 text-sm font-semibold text-rio-gold-light transition-colors hover:border-rio-gold hover:text-rio-gold aria-[current=page]:border-rio-gold aria-[current=page]:bg-rio-gold aria-[current=page]:text-rio-black"
                  >
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-white/75">{user.name}</span>
            <button
              type="button"
              onClick={logout}
              className="rounded-sm font-semibold text-rio-gold underline-offset-4 hover:underline"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
