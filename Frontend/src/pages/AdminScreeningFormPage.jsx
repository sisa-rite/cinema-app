import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { getAdminMovies } from "../api/adminMovies.js";
import { getAdminHalls, getAdminScreening } from "../api/adminScreenings.js";
import ScreeningForm from "../components/ScreeningForm.jsx";
import StateMessage from "../components/StateMessage.jsx";
import {
  formatHall,
  formatTickets,
  formatTimeRange,
} from "../utils/adminScreenings.js";
import { formatDayLabel, formatTime } from "../utils/format.js";

const ADMIN_TITLE_SUFFIX = "Admin — Rio Theatres";
const DEFAULT_TITLE = "Rio Theatres";
const NOT_FOUND_CODES = ["SCREENING_NOT_FOUND", "INVALID_ID"];
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

function screeningTitle(screening) {
  return `${screening.movie.title}, ${formatDayLabel(screening.startsAt)} ${formatTime(screening.startsAt)}`;
}

function ScreeningEditor({ id, listSearch, backLink }) {
  const location = useLocation();
  const navigate = useNavigate();
  const creating = id === undefined;
  const [initialStatus] = useState(() => (location.state?.created ? "Screening created" : ""));
  const [duplicate] = useState(() => location.state?.duplicate ?? null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const isLoading = result.key !== attempt;
  const screening = result.data?.screening ?? null;
  useDocumentTitle(creating ? "New screening" : screening && screeningTitle(screening));

  // Show "Screening created" once, not again after a reload.
  useEffect(() => {
    if (location.state?.created) {
      navigate(location.pathname, { replace: true, state: { listSearch } });
    }
  }, [location.state, location.pathname, listSearch, navigate]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      getAdminMovies({ signal }),
      getAdminHalls({ signal }),
      creating ? null : getAdminScreening(id, { signal }),
    ])
      .then(([movies, halls, loaded]) =>
        setResult({ key: attempt, data: { movies, halls, screening: loaded }, error: null }),
      )
      .catch((error) => {
        if (!signal.aborted) setResult({ key: attempt, data: null, error });
      });
    return () => controller.abort();
  }, [id, creating, attempt]);

  function setScreening(updated) {
    setResult((current) => ({ ...current, data: { ...current.data, screening: updated } }));
  }

  // Someone bought a ticket meanwhile: reload quietly so the form switches to read-only.
  function reloadScreening() {
    getAdminScreening(id)
      .then(setScreening)
      .catch(() => {});
  }

  if (isLoading) {
    return (
      <div className={CONTAINER_CLASSES}>
        <p role="status" className="sr-only">
          Loading screening…
        </p>
        <div aria-hidden="true" className="h-96 max-w-3xl rounded-2xl bg-white/10 motion-safe:animate-pulse" />
      </div>
    );
  }

  if (result.error) {
    if (NOT_FOUND_CODES.includes(result.error.code)) {
      return (
        <StateMessage title="Screening not found" headingAs="h1">
          {backLink}
        </StateMessage>
      );
    }
    return (
      <StateMessage title="We couldn’t load the screening form" headingAs="h1" role="alert">
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

  const { movies, halls } = result.data;

  return (
    <div className={CONTAINER_CLASSES}>
      {backLink}
      <h1 className={`mt-4 ${H1_CLASSES}`}>{creating ? "New screening" : "Edit screening"}</h1>
      {screening && (
        <p className="mt-2 text-white/75">
          {screening.movie.title} · {formatDayLabel(screening.startsAt)}{" "}
          {formatTimeRange(screening)} · {formatHall(screening)} · {formatTickets(screening)}
        </p>
      )}
      <div className="mt-8">
        <ScreeningForm
          screening={screening}
          duplicate={duplicate}
          movies={movies}
          halls={halls}
          listSearch={listSearch}
          initialStatus={initialStatus}
          onCreated={(created) =>
            navigate(`/admin/screenings/${created.id}`, { state: { created: true, listSearch } })
          }
          onSaved={setScreening}
          onLocked={reloadScreening}
        />
      </div>
    </div>
  );
}

function AdminScreeningFormPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const listSearch = state?.listSearch ?? "";
  const backLink = (
    <Link to={`/admin/screenings${listSearch}`} className={TEXT_LINK_CLASSES}>
      ← All screenings
    </Link>
  );

  return <ScreeningEditor key={id ?? "new"} id={id} listSearch={listSearch} backLink={backLink} />;
}

export default AdminScreeningFormPage;
