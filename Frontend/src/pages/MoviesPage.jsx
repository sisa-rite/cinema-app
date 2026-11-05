import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { getMovies } from "../api/movies.js";
import MovieCard from "../components/MovieCard.jsx";
import MovieCardSkeleton from "../components/MovieCardSkeleton.jsx";
import StateMessage from "../components/StateMessage.jsx";
import { THEATRES, findTheatre } from "../config/theatres.js";

const SKELETON_COUNT = 10;
const GRID_CLASSES =
  "grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-x-6";

function MoviesPage() {
  const [searchParams] = useSearchParams();
  const theatre = findTheatre(searchParams.get("city"));
  const city = theatre?.city;

  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, movies: [], failed: false });
  const requestKey = `${city}#${attempt}`;

  useEffect(() => {
    if (!city) return;
    const controller = new AbortController();
    getMovies(city, { signal: controller.signal })
      .then((movies) => setResult({ key: requestKey, movies, failed: false }))
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, movies: [], failed: true });
        }
      });
    return () => controller.abort();
  }, [city, requestKey]);

  if (!theatre) return <Navigate to="/" replace />;

  const isLoading = result.key !== requestKey;
  const otherTheatre = THEATRES.find((other) => other.city !== theatre.city);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-bold text-rio-gold sm:text-4xl">
        Now showing in {theatre.label}
      </h1>

      <div className="mt-8">
        {isLoading ? (
          <>
            <p role="status" className="sr-only">
              Loading movies…
            </p>
            <ul className={GRID_CLASSES}>
              {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                <MovieCardSkeleton key={index} />
              ))}
            </ul>
          </>
        ) : result.failed ? (
          <StateMessage title="We couldn’t load the movies" role="alert">
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
        ) : result.movies.length === 0 ? (
          <StateMessage
            title={`No screenings in ${theatre.label} at the moment.`}
            role="status"
          >
            <Link
              to={`/movies?city=${otherTheatre.city}`}
              className="rounded-sm text-rio-gold underline-offset-4 hover:underline"
            >
              See what’s on in {otherTheatre.label} →
            </Link>
          </StateMessage>
        ) : (
          <ul className={GRID_CLASSES}>
            {result.movies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} city={theatre.city} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default MoviesPage;
