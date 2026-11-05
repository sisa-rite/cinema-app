import { Link, useSearchParams } from "react-router-dom";
import StateMessage from "../components/StateMessage.jsx";
import { findTheatre } from "../config/theatres.js";

function MovieDetailPage() {
  const [searchParams] = useSearchParams();
  const theatre = findTheatre(searchParams.get("city"));

  return (
    <StateMessage title="Movie details coming soon" headingAs="h1">
      <Link
        to={theatre ? `/movies?city=${theatre.city}` : "/"}
        className="rounded-sm text-rio-gold underline-offset-4 hover:underline"
      >
        {theatre ? `← Back to movies in ${theatre.label}` : "← Back to home"}
      </Link>
    </StateMessage>
  );
}

export default MovieDetailPage;
