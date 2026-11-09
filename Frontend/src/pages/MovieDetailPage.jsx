import { useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { getMovie } from "../api/movies.js";
import AgeRatingBadge from "../components/AgeRatingBadge.jsx";
import MovieDetailSkeleton from "../components/MovieDetailSkeleton.jsx";
import Poster from "../components/Poster.jsx";
import ScreeningList from "../components/ScreeningList.jsx";
import StateMessage from "../components/StateMessage.jsx";
import { THEATRES, findTheatre } from "../config/theatres.js";
import { formatDuration } from "../utils/format.js";

const DEFAULT_TITLE = "Rio Theatres";
const NOT_FOUND_CODES = new Set(["MOVIE_NOT_FOUND", "INVALID_ID"]);
const CONTAINER_CLASSES = "mx-auto max-w-7xl px-4 py-10 sm:px-6";
const TEXT_LINK_CLASSES =
  "rounded-sm font-semibold text-rio-gold underline-offset-4 hover:underline";

function MovieDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const theatre = findTheatre(searchParams.get("city"));
  const city = theatre?.city;

  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, movie: null, error: null });
  const requestKey = `${id}:${city}#${attempt}`;
  const isLoading = result.key !== requestKey;
  const movieTitle = isLoading ? undefined : result.movie?.title;

  useEffect(() => {
    if (!city) return;
    const controller = new AbortController();
    getMovie(id, city, { signal: controller.signal })
      .then((movie) => setResult({ key: requestKey, movie, error: null }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, movie: null, error });
        }
      });
    return () => controller.abort();
  }, [id, city, requestKey]);

  useEffect(() => {
    if (!movieTitle) return;
    document.title = `${movieTitle} — ${DEFAULT_TITLE}`;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [movieTitle]);

  if (!theatre) return <Navigate to="/" replace />;

  const otherTheatre = THEATRES.find((other) => other.city !== theatre.city);
  const backLink = (
    <Link to={`/movies?city=${theatre.city}`} className={`text-sm ${TEXT_LINK_CLASSES}`}>
      ← All movies in {theatre.label}
    </Link>
  );

  if (isLoading) {
    return (
      <div className={CONTAINER_CLASSES}>
        {backLink}
        <p role="status" className="sr-only">
          Loading movie…
        </p>
        <div className="mt-6">
          <MovieDetailSkeleton />
        </div>
      </div>
    );
  }

  if (result.error) {
    const isNotFound =
      result.error instanceof ApiError && NOT_FOUND_CODES.has(result.error.code);
    return (
      <div className={CONTAINER_CLASSES}>
        {backLink}
        {isNotFound ? (
          <StateMessage title="Movie not found" headingAs="h1">
            <p className="text-white/75">
              This movie is not available. It may have been removed from the
              programme.
            </p>
            <Link to={`/movies?city=${theatre.city}`} className={TEXT_LINK_CLASSES}>
              See all movies in {theatre.label} →
            </Link>
          </StateMessage>
        ) : (
          <StateMessage title="We couldn’t load this movie" headingAs="h1" role="alert">
            <p className="text-white/75">
              Something went wrong on our side or your connection dropped.
              Please try again in a moment.
            </p>
            <button
              type="button"
              onClick={() => setAttempt((count) => count + 1)}
              className="rounded-full bg-rio-gold px-6 py-2 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light"
            >
              Try again
            </button>
          </StateMessage>
        )}
      </div>
    );
  }

  const { movie } = result;

  return (
    <>
      <section
        aria-labelledby="movie-title"
        className="relative isolate overflow-hidden border-b border-rio-gold/20 bg-rio-surface"
      >
        {movie.posterUrl && (
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 scale-110 bg-cover bg-center opacity-60 blur-3xl"
            style={{ backgroundImage: `url(${JSON.stringify(movie.posterUrl)})` }}
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-linear-to-b from-rio-black/70 via-rio-black/80 to-rio-black"
        />
        <div className={CONTAINER_CLASSES}>
          {backLink}
          <div className="mt-6 grid items-start gap-8 sm:grid-cols-[14rem_1fr] md:grid-cols-[18rem_1fr]">
            <Poster
              key={movie.id}
              src={movie.posterUrl}
              title={movie.title}
              className="mx-auto w-full max-w-60 sm:max-w-none"
            />
            <div>
              <h1
                id="movie-title"
                className="font-display text-3xl font-bold text-rio-gold sm:text-4xl lg:text-5xl"
              >
                {movie.title}
              </h1>
              <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-rio-gold-light">
                <span>{formatDuration(movie.durationMinutes)}</span>
                {movie.ageRating && <AgeRatingBadge rating={movie.ageRating} />}
                <span className="text-white/75">{movie.genre}</span>
              </p>
              {movie.description && (
                <p className="mt-6 max-w-prose leading-relaxed text-white/85">
                  {movie.description}
                </p>
              )}
              {movie.trailerUrl && (
                <a
                  href={movie.trailerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-8 inline-block rounded-full border border-rio-gold px-6 py-2 font-semibold text-rio-gold transition-colors hover:bg-rio-gold hover:text-rio-black"
                >
                  Watch trailer
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="screenings-title" className={CONTAINER_CLASSES}>
        <h2
          id="screenings-title"
          className="font-display text-2xl font-bold text-rio-gold sm:text-3xl"
        >
          Screenings in {theatre.label}
        </h2>
        {movie.screenings.length === 0 ? (
          <div className="mt-6 space-y-3">
            <p className="text-white/85">
              No upcoming screenings in {theatre.label}.
            </p>
            <Link
              to={`/movies/${movie.id}?city=${otherTheatre.city}`}
              className={TEXT_LINK_CLASSES}
            >
              See screenings in {otherTheatre.label} →
            </Link>
          </div>
        ) : (
          <div className="mt-6">
            <ScreeningList screenings={movie.screenings} city={theatre.city} />
          </div>
        )}
      </section>
    </>
  );
}

export default MovieDetailPage;
