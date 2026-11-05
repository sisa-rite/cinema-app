import { useState } from "react";
import { Link } from "react-router-dom";
import { formatDuration } from "../utils/format.js";

function MovieCard({ movie, city }) {
  const [posterFailed, setPosterFailed] = useState(false);
  const showPoster = movie.posterUrl && !posterFailed;

  return (
    <li>
      <Link
        to={`/movies/${movie.id}?city=${city}`}
        className="group flex h-full flex-col gap-3 rounded-xl"
      >
        <div className="aspect-2/3 overflow-hidden rounded-xl border border-rio-gold/30 bg-rio-surface transition group-hover:border-rio-gold group-hover:shadow-rio-glow">
          {showPoster ? (
            <img
              src={movie.posterUrl}
              alt=""
              loading="lazy"
              onError={() => setPosterFailed(true)}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div
              aria-hidden="true"
              className="m-2 flex h-[calc(100%-1rem)] items-center justify-center rounded-lg border-2 border-double border-rio-gold/60 bg-linear-to-b from-rio-red-dark to-rio-black p-4 text-center font-display text-lg font-bold text-rio-gold-light"
            >
              {movie.title}
            </div>
          )}
        </div>
        <div className="space-y-1">
          <h2 className="font-semibold leading-snug text-white group-hover:text-rio-gold">
            {movie.title}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-rio-gold-light">
            <span>{formatDuration(movie.durationMinutes)}</span>
            {movie.ageRating && (
              <span className="rounded-sm bg-rio-red px-1.5 py-0.5 text-xs font-bold text-white">
                <span className="sr-only">Age rating </span>
                {movie.ageRating}
              </span>
            )}
          </p>
          <p className="text-xs text-white/65">{movie.genre}</p>
        </div>
      </Link>
    </li>
  );
}

export default MovieCard;
