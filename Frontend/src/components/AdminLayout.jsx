import { NavLink, Outlet } from "react-router-dom";
import StaffHeader from "./StaffHeader.jsx";

const NAV_ITEMS = [
  { to: "/admin/screenings", label: "Screenings" },
  { to: "/admin/movies", label: "Movies" },
];

function AdminLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <StaffHeader homePath="/admin" title="Rio Theatres — Admin">
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
      </StaffHeader>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
