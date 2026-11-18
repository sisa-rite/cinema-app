import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  deleteScreening,
  getAdminHalls,
  getAdminScreenings,
  updateScreening,
} from "../api/adminScreenings.js";
import DeleteScreeningDialog from "../components/DeleteScreeningDialog.jsx";
import StateMessage from "../components/StateMessage.jsx";
import Toast from "../components/Toast.jsx";
import {
  LOCKED_ROW_MESSAGE,
  formatHall,
  formatTickets,
  formatTimeRange,
  hasTickets,
  theatresFromHalls,
} from "../utils/adminScreenings.js";
import {
  addDays,
  formatDayLabel,
  formatPrice,
  formatShortDate,
  formatTime,
  getDayKey,
  isoToHelsinkiParts,
  todayKey,
} from "../utils/format.js";

const PAGE_TITLE = "Screenings — Admin — Rio Theatres";
const DEFAULT_TITLE = "Rio Theatres";
const RANGE_DAYS = 14;
const SKELETON_COUNT = 6;
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DELETE_CONFLICT_MESSAGE =
  "Someone has just bought or is holding a ticket for this screening, so it cannot be deleted.";
const GOLD_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light disabled:cursor-not-allowed disabled:opacity-50";
const PILL_CLASSES =
  "rounded-full border border-rio-gold/40 px-4 py-1.5 text-sm font-semibold text-rio-gold-light transition-colors hover:border-rio-gold hover:text-rio-gold";
const ACTION_CLASSES =
  "rounded-full border border-rio-gold/50 px-3 py-1 text-sm font-semibold text-rio-gold-light transition-colors hover:border-rio-gold hover:text-rio-gold disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-rio-gold/50 disabled:hover:text-rio-gold-light";
const TEXT_LINK_CLASSES =
  "rounded-sm font-semibold text-rio-gold underline-offset-4 hover:underline";

function parseFrom(value) {
  return DAY_KEY_PATTERN.test(value ?? "") ? value : todayKey();
}

function parseTheatreId(value) {
  return /^\d+$/.test(value ?? "") ? value : "";
}

function groupByDay(screenings) {
  const days = [];
  for (const screening of screenings) {
    const key = getDayKey(screening.startsAt);
    const last = days.at(-1);
    if (last?.key === key) last.screenings.push(screening);
    else days.push({ key, screenings: [screening] });
  }
  return days;
}

function rowError(error, screening) {
  if (error.code === "MOVIE_NOT_PUBLISHED") {
    return { text: "Publish the movie first.", movieId: screening.movie.id };
  }
  if (error.code === "VALIDATION_ERROR" && error.details?.fields?.basePrice) {
    return { text: "Set a price greater than 0 € before publishing." };
  }
  if (error.code === "SCREENING_HAS_BOOKINGS") return { text: LOCKED_ROW_MESSAGE };
  return { text: "The change could not be saved. Please try again." };
}

function screeningLabel(screening) {
  return `${screening.movie.title}, ${formatDayLabel(screening.startsAt)} ${formatTime(screening.startsAt)}`;
}

function Badge({ tone, children }) {
  const tones = {
    gold: "border-rio-gold/60 bg-rio-gold/15 text-rio-gold",
    muted: "border-white/30 text-white/70",
    red: "border-red-300/60 bg-rio-red/40 text-red-100",
  };
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

function MovieCell({ screening }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-semibold break-words text-rio-gold-light">{screening.movie.title}</span>
      {!screening.movie.published && <Badge tone="muted">Hidden movie</Badge>}
    </span>
  );
}

function StatusBadges({ screening }) {
  return (
    <span className="flex flex-wrap gap-2">
      {screening.isPremiere && <Badge tone="red">Premiere</Badge>}
      {screening.published ? <Badge tone="gold">Published</Badge> : <Badge tone="muted">Hidden</Badge>}
    </span>
  );
}

function RowMessage({ status }) {
  if (!status?.error) return null;
  return (
    <p role="alert" className="text-sm text-red-300">
      {status.error.text}{" "}
      {status.error.movieId && (
        <Link to={`/admin/movies/${status.error.movieId}`} className={TEXT_LINK_CLASSES}>
          Go to the movie
        </Link>
      )}
    </p>
  );
}

function Actions({ screening, status, listSearch, onToggle, onDelete }) {
  const locked = hasTickets(screening);
  const label = screeningLabel(screening);
  const { dayKey, time } = isoToHelsinkiParts(screening.startsAt);
  const duplicate = {
    movieId: screening.movie.id,
    hallId: screening.hall.id,
    dayKey: addDays(dayKey, 1),
    time,
    basePrice: screening.basePrice,
    isPremiere: screening.isPremiere,
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <Link
          to={`/admin/screenings/${screening.id}`}
          state={{ listSearch }}
          aria-label={`Edit ${label}`}
          className={ACTION_CLASSES}
        >
          Edit
        </Link>
        <button
          type="button"
          onClick={() => onToggle(screening)}
          disabled={locked || status?.pending}
          aria-label={`${screening.published ? "Hide" : "Publish"} ${label}`}
          className={ACTION_CLASSES}
        >
          {screening.published ? "Hide" : "Publish"}
        </button>
        <Link
          to="/admin/screenings/new"
          state={{ duplicate, listSearch }}
          aria-label={`Duplicate ${label}`}
          className={ACTION_CLASSES}
        >
          Duplicate
        </Link>
        <button
          type="button"
          onClick={() => onDelete(screening)}
          disabled={locked || status?.pending}
          aria-label={`Delete ${label}`}
          className={ACTION_CLASSES}
        >
          Delete
        </button>
      </div>
      {locked && <p className="text-sm text-white/70 lg:text-right">{LOCKED_ROW_MESSAGE}</p>}
    </div>
  );
}

function DayTable({ screenings, rowStatus, actionProps }) {
  return (
    <table className="hidden w-full text-left text-sm lg:table">
      <thead className="text-xs tracking-wide text-white/60 uppercase">
        <tr>
          <th scope="col" className="py-2 pr-4 font-semibold">Time</th>
          <th scope="col" className="py-2 pr-4 font-semibold">Movie</th>
          <th scope="col" className="py-2 pr-4 font-semibold">Hall</th>
          <th scope="col" className="py-2 pr-4 text-right font-semibold">Price</th>
          <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
          <th scope="col" className="py-2 pr-4 font-semibold">Tickets</th>
          <th scope="col" className="py-2 font-semibold">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {screenings.map((screening) => (
          <tr key={screening.id} data-testid="screening-row" className="border-t border-rio-gold/15 align-top">
            <th scope="row" className="py-3 pr-4 font-semibold whitespace-nowrap text-white tabular-nums">
              {formatTimeRange(screening)}
            </th>
            <td className="py-3 pr-4">
              <MovieCell screening={screening} />
              <RowMessage status={rowStatus[screening.id]} />
            </td>
            <td className="py-3 pr-4 text-white/75">{formatHall(screening)}</td>
            <td className="py-3 pr-4 text-right whitespace-nowrap text-white/75">
              {formatPrice(screening.basePrice)}
            </td>
            <td className="py-3 pr-4">
              <StatusBadges screening={screening} />
            </td>
            <td className="py-3 pr-4 whitespace-nowrap text-white/75">{formatTickets(screening)}</td>
            <td className="py-3">
              <Actions screening={screening} status={rowStatus[screening.id]} {...actionProps} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DayCards({ screenings, rowStatus, actionProps }) {
  return (
    <ul className="space-y-3 lg:hidden">
      {screenings.map((screening) => (
        <li
          key={screening.id}
          className="space-y-2 rounded-2xl border border-rio-gold/20 bg-rio-surface p-4"
        >
          <h3 className="text-base">
            <span className="block font-semibold text-white tabular-nums">
              {formatTimeRange(screening)}
            </span>
            <MovieCell screening={screening} />
          </h3>
          <p className="text-sm text-white/75">
            {formatHall(screening)} · {formatPrice(screening.basePrice)}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/75">
            <StatusBadges screening={screening} />
            <span>{formatTickets(screening)}</span>
          </div>
          <Actions screening={screening} status={rowStatus[screening.id]} {...actionProps} />
          <RowMessage status={rowStatus[screening.id]} />
        </li>
      ))}
    </ul>
  );
}

function AdminScreeningsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { search } = useLocation();
  const from = parseFrom(searchParams.get("from"));
  const to = addDays(from, RANGE_DAYS - 1);
  const theatreId = parseTheatreId(searchParams.get("theatreId"));

  const [halls, setHalls] = useState([]);
  const [attempt, setAttempt] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState({ filterKey: null, screenings: [], failed: false });
  const [rowStatus, setRowStatus] = useState({});
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState("");
  const dismissToast = useCallback(() => setToast(""), []);
  // A refresh keeps the current rows on screen; a new filter shows the skeleton.
  const filterKey = `${from}#${theatreId}#${attempt}`;
  const isLoading = result.filterKey !== filterKey;
  const theatres = theatresFromHalls(halls);

  useEffect(() => {
    document.title = PAGE_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getAdminHalls({ signal: controller.signal })
      .then(setHalls)
      // Without halls only the "All" theatre pill is shown; the list still works.
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getAdminScreenings({ from, to, theatreId }, { signal: controller.signal })
      .then((screenings) => setResult({ filterKey, screenings, failed: false }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ filterKey, screenings: [], failed: true });
      });
    return () => controller.abort();
  }, [from, to, theatreId, filterKey, refresh]);

  function updateParams(changes) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [name, value] of Object.entries(changes)) {
          if (value) next.set(name, value);
          else next.delete(name);
        }
        return next;
      },
      { replace: true },
    );
  }

  function setFrom(dayKey) {
    if (DAY_KEY_PATTERN.test(dayKey)) updateParams({ from: dayKey === todayKey() ? "" : dayKey });
  }

  function setRow(id, status) {
    setRowStatus((current) => ({ ...current, [id]: status }));
  }

  function replaceScreening(updated) {
    setResult((current) => ({
      ...current,
      screenings: current.screenings.map((item) => (item.id === updated.id ? updated : item)),
    }));
  }

  async function toggleScreening(screening) {
    setRow(screening.id, { pending: true, error: null });
    try {
      replaceScreening(await updateScreening(screening.id, { published: !screening.published }));
      setRow(screening.id, { pending: false, error: null });
    } catch (error) {
      setRow(screening.id, { pending: false, error: rowError(error, screening) });
      if (error.code === "SCREENING_HAS_BOOKINGS") setRefresh((count) => count + 1);
    }
  }

  async function removeScreening(screening) {
    setDeleting(null);
    setRow(screening.id, { pending: true, error: null });
    try {
      await deleteScreening(screening.id);
      setResult((current) => ({
        ...current,
        screenings: current.screenings.filter((item) => item.id !== screening.id),
      }));
      setToast("Screening deleted");
    } catch (error) {
      const text =
        error.code === "SCREENING_HAS_BOOKINGS"
          ? DELETE_CONFLICT_MESSAGE
          : "The screening could not be deleted. Please try again.";
      setRow(screening.id, { pending: false, error: { text } });
      if (error.code === "SCREENING_HAS_BOOKINGS") setRefresh((count) => count + 1);
    }
  }

  const actionProps = {
    listSearch: search,
    onToggle: toggleScreening,
    onDelete: setDeleting,
  };
  const days = groupByDay(result.screenings);

  let content;
  if (isLoading) {
    content = (
      <>
        <p role="status" className="sr-only">
          Loading screenings…
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
      <StateMessage title="We couldn’t load the screenings" role="alert">
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
  } else if (days.length === 0) {
    content = (
      <StateMessage
        title={`No screenings between ${formatShortDate(from)} and ${formatShortDate(to)}.`}
        role="status"
      >
        <Link to="/admin/screenings/new" state={{ listSearch: search }} className={GOLD_BUTTON_CLASSES}>
          Add screening
        </Link>
      </StateMessage>
    );
  } else {
    content = (
      <div className="space-y-10">
        {days.map((day) => (
          <section key={day.key} aria-labelledby={`day-${day.key}`} className="space-y-3">
            <h2
              id={`day-${day.key}`}
              className="font-display text-2xl font-bold text-rio-gold-light"
            >
              {formatDayLabel(day.screenings[0].startsAt)}
            </h2>
            <DayTable screenings={day.screenings} rowStatus={rowStatus} actionProps={actionProps} />
            <DayCards screenings={day.screenings} rowStatus={rowStatus} actionProps={actionProps} />
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-bold text-rio-gold sm:text-4xl">Screenings</h1>
        <Link to="/admin/screenings/new" state={{ listSearch: search }} className={GOLD_BUTTON_CLASSES}>
          Add screening
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div role="group" aria-label="Filter by theatre" className="flex flex-wrap gap-2">
          {[{ id: "", label: "All" }, ...theatres].map((theatre) => (
            <button
              key={theatre.id}
              type="button"
              aria-pressed={theatreId === String(theatre.id)}
              onClick={() => updateParams({ theatreId: String(theatre.id) })}
              className={`${PILL_CLASSES} aria-pressed:border-rio-gold aria-pressed:bg-rio-gold aria-pressed:text-rio-black`}
            >
              {theatre.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="screenings-from" className="block text-sm font-semibold text-rio-gold-light">
              From
            </label>
            <input
              id="screenings-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="rounded-lg border border-rio-gold/40 bg-rio-black px-3 py-2 text-white scheme-dark focus:border-rio-gold"
            />
          </div>
          <button type="button" onClick={() => setFrom(addDays(from, -RANGE_DAYS))} className={PILL_CLASSES}>
            ← Previous 14 days
          </button>
          <button type="button" onClick={() => setFrom(addDays(from, RANGE_DAYS))} className={PILL_CLASSES}>
            Next 14 days →
          </button>
        </div>
      </div>
      <p className="mt-3 text-sm text-white/70">
        Showing {formatShortDate(from)} – {formatShortDate(to)} (Helsinki time)
      </p>

      <div className="mt-8">{content}</div>

      <DeleteScreeningDialog
        screening={deleting}
        onConfirm={removeScreening}
        onCancel={() => setDeleting(null)}
      />
      <Toast message={toast} onDismiss={dismissToast} />
    </div>
  );
}

export default AdminScreeningsPage;
