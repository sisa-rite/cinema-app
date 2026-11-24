import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";

// Staff pages link only within the staff area: no customer site, city switcher or account menu.
function StaffHeader({ homePath, title, children }) {
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-rio-gold/20 bg-rio-black">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link to={homePath} className="rounded-sm font-display text-lg font-bold text-rio-gold">
          {title}
        </Link>
        {children}
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
  );
}

export default StaffHeader;
