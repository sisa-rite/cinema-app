import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { getAdminMovies, updateMovie } from "../api/adminMovies.js";
import AgeRatingBadge from "../components/AgeRatingBadge.jsx";
import Poster from "../components/Poster.jsx";
import StateMessage from "../components/StateMessage.jsx";
import { HAS_BOOKINGS_MESSAGE } from "../utils/adminMovies.js";
import { formatDuration } from "../utils/format.js";

const PAGE_TITLE = "Movies — Admin — Rio Theatres";
const DEFAULT_TITLE = "Rio Theatres";
const SKELETON_COUNT = 6;
const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "hidden", label: "Hidden" },
];
const GOLD_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light disabled:cursor-not-allowed disabled:opacity-50";
const OUTLINE_BUTTON_CLASSES =
  "rounded-full border border-rio-gold/50 px-4 py-1.5 text-sm font-semibold text-rio-gold-light transition-colors hover:border-rio-gold hover:text-rio-gold disabled:cursor-wait disabled:opacity-50";
const TITLE_LINK_CLASSES =
  "rounded-sm font-semibold text-rio-gold-light underline-offset-4 hover:text-rio-gold hover:underline";

function parseStatus(value) {
  return STATUS_FILTERS.some((filter) => filter.value === value) ? value : "all";
}

function matchesFilter(movie, status, query) {
  if (status === "published" && !movie.published) return false;
  if (status === "hidden" && movie.published) return false;
  return movie.title.toLowerCase().includes(query);
}

function StatusBadge({ published }) {
  return published ? (
    <span className="rounded-full border border-rio-gold/60 bg-rio-gold/15 px-2.5 py-0.5 text-xs font-semibold text-rio-gold">
      Published
    </span>
  ) : (
    <span className="rounded-full border border-white/30 px-2.5 py-0.5 text-xs font-semibold text-white/70">
      Hidden
    </span>
  );
}

function AgeRating({ rating }) {
  if (rating) return <AgeRatingBadge rating={rating} />;
  return (
    <>
      <span aria-hidden="true" className="text-white/60">—</span>
      <span className="sr-only">No rating</span>
    </>
  );
}

function ToggleButton({ movie, status, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(movie)}
      disabled={status?.pending}
      aria-label={`${movie.published ? "Hide" : "Publish"} ${movie.title}`}
      className={OUTLINE_BUTTON_CLASSES}
    >
      {movie.published ? "Hide" : "Publish"}
    </button>
  );
}

function RowError({ status }) {
  if (!status?.error) return null;
  return (
    <p role="alert" className="text-sm text-red-300">
      {status.error}
    </p>
  );
}

function MovieTitleLink({ movie, listSearch }) {
  return (
    <Link
      to={`/admin/movies/${movie.id}`}
      state={{ listSearch }}
      className={`break-words ${TITLE_LINK_CLASSES}`}
    >
      {movie.title}
    </Link>
  );
}

function MoviesTable({ movies, rowStatus, listSearch, onToggle }) {
  return (
    <table className="hidden w-full text-left text-sm md:table">
      <thead className="text-xs uppercase tracking-wide text-white/60">
        <tr>
          <th scope="col" className="w-16 py-3 pr-4 font-semibold">
            <span className="sr-only">Poster</span>
          </th>
          <th scope="col" className="py-3 pr-4 font-semibold">Title</th>
          <th scope="col" className="py-3 pr-4 font-semibold">Duration</th>
          <th scope="col" className="py-3 pr-4 font-semibold">Age rating</th>
          <th scope="col" className="py-3 pr-4 text-right font-semibold">Upcoming screenings</th>
          <th scope="col" className="py-3 pr-4 font-semibold">Status</th>
          <th scope="col" className="py-3 font-semibold">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {movies.map((movie) => (
          <tr key={movie.id} data-testid="movie-row" className="border-t border-rio-gold/15 align-middle">
            <td className="py-3 pr-4">
              <Poster src={movie.posterUrl} title="" className="w-12" />
            </td>
            <th scope="row" className="py-3 pr-4 font-normal">
              <MovieTitleLink movie={movie} listSearch={listSearch} />
              <RowError status={rowStatus[movie.id]} />
            </th>
            <td className="py-3 pr-4 whitespace-nowrap text-white/75">
              {formatDuration(movie.durationMinutes)}
            </td>
            <td className="py-3 pr-4">
              <AgeRating rating={movie.ageRating} />
            </td>
            <td className="py-3 pr-4 text-right tabular-nums text-white/75">
              {movie.upcomingScreenings}
            </td>
            <td className="py-3 pr-4">
              <StatusBadge published={movie.published} />
            </td>
            <td className="py-3 text-right">
              <ToggleButton movie={movie} status={rowStatus[movie.id]} onToggle={onToggle} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MoviesCards({ movies, rowStatus, listSearch, onToggle }) {
  return (
    <ul className="space-y-3 md:hidden">
      {movies.map((movie) => (
        <li
          key={movie.id}
          className="flex gap-4 rounded-2xl border border-rio-gold/20 bg-rio-surface p-4"
        >
          <Poster src={movie.posterUrl} title="" className="w-16 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="text-base">
              <MovieTitleLink movie={movie} listSearch={listSearch} />
            </h2>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/75">
              <span>{formatDuration(movie.durationMinutes)}</span>
              <AgeRating rating={movie.ageRating} />
              <span>{movie.upcomingScreenings} upcoming screenings</span>
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge published={movie.published} />
              <ToggleButton movie={movie} status={rowStatus[movie.id]} onToggle={onToggle} />
            </div>
            <RowError status={rowStatus[movie.id]} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function AdminMoviesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { search } = useLocation();
  const status = parseStatus(searchParams.get("status"));
  const query = searchParams.get("q") ?? "";

  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, movies: [], failed: false });
  const [rowStatus, setRowStatus] = useState({});
  const isLoading = result.key !== attempt;

  useEffect(() => {
    document.title = PAGE_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getAdminMovies({ signal: controller.signal })
      .then((movies) => setResult({ key: attempt, movies, failed: false }))
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ key: attempt, movies: [], failed: true });
        }
      });
    return () => controller.abort();
  }, [attempt]);

  function updateParam(name, value, defaultValue) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === defaultValue) next.delete(name);
        else next.set(name, value);
        return next;
      },
      { replace: true },
    );
  }

  async function toggleMovie(movie) {
    setRowStatus((current) => ({ ...current, [movie.id]: { pending: true, error: "" } }));
    try {
      const updated = await updateMovie(movie.id, { published: !movie.published });
      setResult((current) => ({
        ...current,
        movies: current.movies.map((item) => (item.id === updated.id ? updated : item)),
      }));
      setRowStatus((current) => ({ ...current, [movie.id]: { pending: false, error: "" } }));
    } catch (error) {
      const message =
        error.code === "MOVIE_HAS_BOOKINGS"
          ? HAS_BOOKINGS_MESSAGE
          : "The change could not be saved. Please try again.";
      setRowStatus((current) => ({ ...current, [movie.id]: { pending: false, error: message } }));
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleMovies = result.movies.filter((movie) =>
    matchesFilter(movie, status, normalizedQuery),
  );

  let content;
  if (isLoading) {
    content = (
      <>
        <p role="status" className="sr-only">
          Loading movies…
        </p>
        <div aria-hidden="true" className="space-y-3">
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <div key={index} className="h-20 rounded-xl bg-white/10 motion-safe:animate-pulse" />
          ))}
        </div>
      </>
    );
  } else if (result.failed) {
    content = (
      <StateMessage title="We couldn’t load the movies" role="alert">
        <p className="text-white/75">
          Something went wrong on our side or your connection dropped. Please try again in a
          moment.
        </p>
        <button
          type="button"
          onClick={() => setAttempt((count) => count + 1)}
          className={GOLD_BUTTON_CLASSES}
        >
          Try again
        </button>
      </StateMessage>
    );
  } else if (result.movies.length === 0) {
    content = (
      <StateMessage title="No movies yet." role="status">
        <Link to="/admin/movies/new" className={GOLD_BUTTON_CLASSES}>
          Add movie
        </Link>
      </StateMessage>
    );
  } else if (visibleMovies.length === 0) {
    content = <StateMessage title="No movies match your filter." role="status" />;
  } else {
    content = (
      <>
        <MoviesTable
          movies={visibleMovies}
          rowStatus={rowStatus}
          listSearch={search}
          onToggle={toggleMovie}
        />
        <MoviesCards
          movies={visibleMovies}
          rowStatus={rowStatus}
          listSearch={search}
          onToggle={toggleMovie}
        />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-bold text-rio-gold sm:text-4xl">Movies</h1>
        <Link to="/admin/movies/new" className={GOLD_BUTTON_CLASSES}>
          Add movie
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={status === filter.value}
              onClick={() => updateParam("status", filter.value, "all")}
              className="rounded-full border border-rio-gold/40 px-4 py-1.5 text-sm font-semibold text-rio-gold-light transition-colors hover:border-rio-gold hover:text-rio-gold aria-pressed:border-rio-gold aria-pressed:bg-rio-gold aria-pressed:text-rio-black"
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="w-full space-y-1 sm:w-72">
          <label htmlFor="movie-search" className="block text-sm font-semibold text-rio-gold-light">
            Search by title
          </label>
          <input
            id="movie-search"
            type="search"
            value={query}
            onChange={(event) => updateParam("q", event.target.value, "")}
            className="w-full rounded-lg border border-rio-gold/40 bg-rio-black px-3 py-2 text-white focus:border-rio-gold"
          />
        </div>
      </div>

      <div className="mt-8">{content}</div>
    </div>
  );
}

export default AdminMoviesPage;
