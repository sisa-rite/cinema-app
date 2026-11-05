import { Link } from "react-router-dom";
import { formatDuration } from "../utils/format.js";
import AgeRatingBadge from "./AgeRatingBadge.jsx";
import Poster from "./Poster.jsx";

function MovieCard({ movie, city }) {
  return (
    <li>
      <Link
        to={`/movies/${movie.id}?city=${city}`}
        className="group flex h-full flex-col gap-3 rounded-xl"
      >
        <Poster
          src={movie.posterUrl}
          title={movie.title}
          className="transition group-hover:border-rio-gold group-hover:shadow-rio-glow"
        />
        <div className="space-y-1">
          <h2 className="font-semibold leading-snug text-white group-hover:text-rio-gold">
            {movie.title}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-rio-gold-light">
            <span>{formatDuration(movie.durationMinutes)}</span>
            {movie.ageRating && <AgeRatingBadge rating={movie.ageRating} />}
          </p>
          <p className="text-xs text-white/65">{movie.genre}</p>
        </div>
      </Link>
    </li>
  );
}

export default MovieCard;
