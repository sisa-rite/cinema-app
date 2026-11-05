import { Link } from "react-router-dom";
import StateMessage from "../components/StateMessage.jsx";

function NotFoundPage() {
  return (
    <StateMessage title="404 — Page not found" headingAs="h1">
      <p className="text-white/75">
        The page you are looking for does not exist.
      </p>
      <Link
        to="/"
        className="rounded-sm text-rio-gold underline-offset-4 hover:underline"
      >
        ← Back to home
      </Link>
    </StateMessage>
  );
}

export default NotFoundPage;
