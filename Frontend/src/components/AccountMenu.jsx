import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";
import { withRedirect } from "../utils/redirect.js";

const PILL_CLASSES =
  "flex items-center gap-2 rounded-full border border-rio-gold/40 px-4 py-1.5 text-sm font-semibold text-rio-gold-light transition-colors hover:border-rio-gold hover:text-rio-gold";
const MENU_ITEM_CLASSES =
  "block w-full px-4 py-2 text-left text-sm font-semibold text-rio-gold-light transition-colors hover:bg-rio-gold/10 hover:text-rio-gold";
// Coming back from these pages after login makes no sense.
const NO_REDIRECT_PATHS = ["/", "/login", "/signup"];

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function CustomerMenu({ user, logout }) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!containerRef.current.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Tabbing out of the menu closes it, so it never hides content behind it.
  function handleBlur(event) {
    if (!containerRef.current.contains(event.relatedTarget)) setOpen(false);
  }

  return (
    <div ref={containerRef} onBlur={handleBlur} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={PILL_CLASSES}
      >
        <UserIcon />
        <span className="sr-only sm:not-sr-only sm:max-w-40 sm:truncate">{user.name}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl border border-rio-gold/30 bg-rio-surface py-1 shadow-lg"
        >
          <p className="truncate border-b border-rio-gold/20 px-4 py-2 text-xs text-white/70">
            {user.name}
          </p>
          <ul>
            <li>
              <Link to="/my-bookings" onClick={() => setOpen(false)} className={MENU_ITEM_CLASSES}>
                My bookings
              </Link>
            </li>
            <li>
              <button type="button" onClick={logout} className={MENU_ITEM_CLASSES}>
                Log out
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

// Customer account entry; staff have their own area and never see it.
function AccountMenu() {
  const { user, status, logout } = useAuth();
  const { pathname, search } = useLocation();

  if (status === "loading") return null;

  if (status === "anonymous") {
    const loginPath = NO_REDIRECT_PATHS.includes(pathname)
      ? "/login"
      : withRedirect("/login", `${pathname}${search}`);
    return (
      <Link to={loginPath} className={PILL_CLASSES}>
        Log in
      </Link>
    );
  }

  if (user.role !== "customer") return null;

  return <CustomerMenu user={user} logout={logout} />;
}

export default AccountMenu;
