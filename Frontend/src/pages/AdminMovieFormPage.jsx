import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { getAdminMovie } from "../api/adminMovies.js";
import MovieForm from "../components/MovieForm.jsx";
import StateMessage from "../components/StateMessage.jsx";

const ADMIN_TITLE_SUFFIX = "Admin — Rio Theatres";
const DEFAULT_TITLE = "Rio Theatres";
const NOT_FOUND_CODES = ["MOVIE_NOT_FOUND", "INVALID_ID"];
const CONTAINER_CLASSES = "mx-auto max-w-7xl px-4 py-8 sm:px-6";
const H1_CLASSES = "font-display text-3xl font-bold text-rio-gold sm:text-4xl";
const TEXT_LINK_CLASSES =
  "rounded-sm text-sm font-semibold text-rio-gold underline-offset-4 hover:underline";
const GOLD_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light";

function useDocumentTitle(title) {
  useEffect(() => {
    if (!title) return undefined;
    document.title = `${title} — ${ADMIN_TITLE_SUFFIX}`;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}

function NewMovie({ listSearch, backLink }) {
  const navigate = useNavigate();
  useDocumentTitle("New movie");

  return (
    <div className={CONTAINER_CLASSES}>
      {backLink}
      <h1 className={`mt-4 ${H1_CLASSES}`}>New movie</h1>
      <div className="mt-8">
        <MovieForm
          onCreated={(movie) =>
            navigate(`/admin/movies/${movie.id}`, { state: { created: true, listSearch } })
          }
        />
      </div>
    </div>
  );
}

function EditMovie({ id, listSearch, backLink }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [initialStatus] = useState(() => (location.state?.created ? "Movie created" : ""));
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, movie: null, error: null });
  const isLoading = result.key !== attempt;
  useDocumentTitle(isLoading ? null : result.movie?.title);

  // Show "Movie created" once, not again after a reload.
  useEffect(() => {
    if (location.state?.created) {
      navigate(location.pathname, { replace: true, state: { listSearch } });
    }
  }, [location.state, location.pathname, listSearch, navigate]);

  useEffect(() => {
    const controller = new AbortController();
    getAdminMovie(id, { signal: controller.signal })
      .then((movie) => setResult({ key: attempt, movie, error: null }))
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ key: attempt, movie: null, error });
      });
    return () => controller.abort();
  }, [id, attempt]);

  if (isLoading) {
    return (
      <div className={CONTAINER_CLASSES}>
        <p role="status" className="sr-only">
          Loading movie…
        </p>
        <div aria-hidden="true" className="h-96 max-w-3xl rounded-2xl bg-white/10 motion-safe:animate-pulse" />
      </div>
    );
  }

  if (result.error) {
    if (NOT_FOUND_CODES.includes(result.error.code)) {
      return (
        <StateMessage title="Movie not found" headingAs="h1">
          {backLink}
        </StateMessage>
      );
    }
    return (
      <StateMessage title="We couldn’t load the movie" headingAs="h1" role="alert">
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
        {backLink}
      </StateMessage>
    );
  }

  const { movie } = result;

  return (
    <div className={CONTAINER_CLASSES}>
      {backLink}
      <h1 className={`mt-4 break-words ${H1_CLASSES}`}>{movie.title}</h1>
      <p className="mt-2 text-white/75">Upcoming screenings: {movie.upcomingScreenings}</p>
      <div className="mt-8">
        <MovieForm
          movie={movie}
          initialStatus={initialStatus}
          onSaved={(updated) => setResult((current) => ({ ...current, movie: updated }))}
        />
      </div>
    </div>
  );
}

function AdminMovieFormPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const listSearch = state?.listSearch ?? "";
  const backLink = (
    <Link to={`/admin/movies${listSearch}`} className={TEXT_LINK_CLASSES}>
      ← All movies
    </Link>
  );

  if (id === undefined) return <NewMovie listSearch={listSearch} backLink={backLink} />;
  return <EditMovie key={id} id={id} listSearch={listSearch} backLink={backLink} />;
}

export default AdminMovieFormPage;
