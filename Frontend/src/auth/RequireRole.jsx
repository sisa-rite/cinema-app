import { Link, Navigate, useLocation } from "react-router-dom";
import StateMessage from "../components/StateMessage.jsx";
import { useAuth } from "./useAuth.js";

// Navigation guard only: the server still checks the role on every protected API call.
function RequireRole({ roles, loginPath = "/staff/login", children }) {
  const { user, status } = useAuth();
  const { pathname, search } = useLocation();

  if (status === "loading") {
    return <StateMessage title="Checking your login…" role="status" />;
  }

  if (status === "anonymous") {
    const params = new URLSearchParams({ redirect: `${pathname}${search}` });
    return <Navigate to={`${loginPath}?${params}`} replace />;
  }

  if (!roles.includes(user.role)) {
    return (
      <StateMessage title="You don't have access to this page" headingAs="h1">
        <Link to="/" className="rounded-sm text-rio-gold underline-offset-4 hover:underline">
          ← Back to home
        </Link>
      </StateMessage>
    );
  }

  return children;
}

export default RequireRole;
