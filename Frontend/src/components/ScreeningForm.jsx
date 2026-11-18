import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createScreening, getAdminScreening, updateScreening } from "../api/adminScreenings.js";
import {
  ADS_MINUTES,
  formatHall,
  formatTimeRange,
  hasTickets,
  lockedFormMessage,
  theatresFromHalls,
} from "../utils/adminScreenings.js";
import {
  formatDayLabel,
  formatTime,
  helsinkiDateTimeToIso,
  isoToHelsinkiParts,
} from "../utils/format.js";
import Toast from "./Toast.jsx";

// Order of the fields on the page: the first invalid one gets focus.
const FIELD_ORDER = [
  "movieId",
  "hallId",
  "dayKey",
  "time",
  "startsAt",
  "basePrice",
  "isPremiere",
  "published",
];
// startsAt has no input of its own; its errors belong to the date and time fields.
const STARTS_AT_FIELDS = ["dayKey", "time"];
const FOCUS_TARGETS = { startsAt: "dayKey" };
const PRICE_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;
const PRICE_BEFORE_PUBLISHING = "Set a price greater than 0 € before publishing";
const OVERLAP_MESSAGE =
  "This time overlaps another screening in the same hall (including 12 minutes of ads).";
const GOLD_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light disabled:cursor-not-allowed disabled:opacity-50";
const INPUT_CLASSES =
  "w-full rounded-lg border border-rio-gold/40 bg-rio-black px-3 py-2 text-white scheme-dark focus:border-rio-gold disabled:opacity-70 aria-invalid:border-red-400";
const LABEL_CLASSES = "block text-sm font-semibold text-rio-gold-light";
const TEXT_LINK_CLASSES =
  "rounded-sm font-semibold text-rio-gold underline-offset-4 hover:underline";

function toValues(screening, duplicate) {
  if (screening) {
    const { dayKey, time } = isoToHelsinkiParts(screening.startsAt);
    return {
      movieId: String(screening.movie.id),
      hallId: String(screening.hall.id),
      dayKey,
      time,
      basePrice: String(screening.basePrice),
      isPremiere: screening.isPremiere,
      published: screening.published,
    };
  }
  return {
    movieId: duplicate ? String(duplicate.movieId) : "",
    hallId: duplicate ? String(duplicate.hallId) : "",
    dayKey: duplicate?.dayKey ?? "",
    time: duplicate?.time ?? "",
    basePrice: duplicate ? String(duplicate.basePrice) : "",
    isPremiere: duplicate?.isPremiere ?? false,
    published: false,
  };
}

function toPayload(values) {
  return {
    movieId: Number(values.movieId),
    hallId: Number(values.hallId),
    startsAt:
      values.dayKey && values.time ? helsinkiDateTimeToIso(values.dayKey, values.time) : null,
    basePrice: Number(values.basePrice),
    isPremiere: values.isPremiere,
    published: values.published,
  };
}

function changedFields(payload, screening) {
  const saved = {
    movieId: screening.movie.id,
    hallId: screening.hall.id,
    startsAt: screening.startsAt,
    basePrice: screening.basePrice,
    isPremiere: screening.isPremiere,
    published: screening.published,
  };
  return Object.fromEntries(
    Object.entries(payload).filter(([field, value]) =>
      field === "startsAt"
        ? Date.parse(value) !== Date.parse(saved.startsAt)
        : value !== saved[field],
    ),
  );
}

// Mirrors the rules in docs/api.md; the server stays the real check.
function validate(values, payload, { checkFuture }) {
  const errors = {};
  if (!values.movieId) errors.movieId = "Choose a movie";
  if (!values.hallId) errors.hallId = "Choose a hall";
  if (!values.dayKey) errors.dayKey = "Choose a date";
  if (!values.time) errors.time = "Choose a start time";
  if (payload.startsAt && checkFuture && Date.parse(payload.startsAt) <= Date.now()) {
    errors.startsAt = "Choose a start time in the future";
  }
  if (!PRICE_PATTERN.test(values.basePrice.trim()) || payload.basePrice > 100) {
    errors.basePrice = "Enter a price from 0 to 100 € with at most 2 decimals";
  } else if (values.published && payload.basePrice === 0) {
    errors.basePrice = PRICE_BEFORE_PUBLISHING;
  }
  return errors;
}

function fieldId(name) {
  return `screening-${name}`;
}

function errorId(name) {
  return `${fieldId(name)}-error`;
}

function focusFirstInvalid(errors) {
  const first = FIELD_ORDER.find((field) => errors[field]);
  if (first) document.getElementById(fieldId(FOCUS_TARGETS[first] ?? first))?.focus();
}

function FieldError({ name, errors }) {
  if (!errors[name]) return null;
  return (
    <p id={errorId(name)} className="text-sm text-red-300">
      {errors[name]}
    </p>
  );
}

function fieldProps(name, errors, ...extraDescribedBy) {
  const startsAtError = STARTS_AT_FIELDS.includes(name) && errors.startsAt;
  const describedBy = [
    errors[name] && errorId(name),
    startsAtError && errorId("startsAt"),
    ...extraDescribedBy,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    id: fieldId(name),
    "aria-invalid": errors[name] || startsAtError ? true : undefined,
    "aria-describedby": describedBy || undefined,
  };
}

function busyHint(values, payload, movies) {
  const movie = movies.find((item) => String(item.id) === values.movieId);
  const start = Date.parse(payload.startsAt);
  if (!movie || Number.isNaN(start)) return null;
  const busyFrom = formatTime(start - ADS_MINUTES * 60_000);
  const endsAt = formatTime(start + movie.durationMinutes * 60_000);
  return { busy: `${busyFrom}–${endsAt}`, endsAt };
}

function OverlapList({ overlap, listSearch }) {
  if (overlap.screenings) {
    return (
      <ul className="mt-2 list-disc space-y-1 pl-5 font-normal">
        {overlap.screenings.map((other) => (
          <li key={other.id}>
            <Link to={`/admin/screenings/${other.id}`} state={{ listSearch }} className={TEXT_LINK_CLASSES}>
              {other.movie.title}
            </Link>{" "}
            · {formatDayLabel(other.startsAt)} {formatTimeRange(other)} · {formatHall(other)}
          </li>
        ))}
      </ul>
    );
  }
  if (!overlap.failed) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-3 font-normal">
      {overlap.ids.map((id) => (
        <li key={id}>
          <Link to={`/admin/screenings/${id}`} state={{ listSearch }} className={TEXT_LINK_CLASSES}>
            Screening {id}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ScreeningForm({
  screening = null,
  duplicate = null,
  movies,
  halls,
  listSearch,
  initialStatus = "",
  onCreated,
  onSaved,
  onLocked,
}) {
  const creating = screening === null;
  const locked = !creating && hasTickets(screening);
  const [values, setValues] = useState(() => toValues(screening, duplicate));
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState(null);
  const [overlap, setOverlap] = useState(null);
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dismissStatus = useCallback(() => setStatus(""), []);

  const shown = locked ? toValues(screening) : values;
  const payload = toPayload(shown);
  const changes = creating ? payload : changedFields(payload, screening);
  const hasChanges = Object.keys(changes).length > 0;
  const hint = busyHint(shown, payload, movies);
  const sortedMovies = [...movies].sort((a, b) => a.title.localeCompare(b.title));
  const theatres = theatresFromHalls(halls);

  function setField(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
    setStatus("");
  }

  function showOverlap(ids) {
    setOverlap({ ids, screenings: null, failed: false });
    Promise.all(ids.map((id) => getAdminScreening(id)))
      .then((screenings) => setOverlap({ ids, screenings, failed: false }))
      .catch(() => setOverlap({ ids, screenings: null, failed: true }));
  }

  function handleError(error) {
    const fields = error.code === "VALIDATION_ERROR" ? error.details?.fields : null;
    if (fields) {
      setErrors(fields);
      const unknownField = Object.keys(fields).find((field) => !FIELD_ORDER.includes(field));
      if (unknownField) setAlert({ text: fields[unknownField] });
      focusFirstInvalid(fields);
    } else if (error.code === "SCREENING_OVERLAP") {
      setAlert({ text: OVERLAP_MESSAGE });
      showOverlap(error.details?.screeningIds ?? []);
    } else if (error.code === "MOVIE_NOT_PUBLISHED") {
      setAlert({
        text: "The movie is hidden, so this screening cannot be published. Publish the movie first.",
        movieId: payload.movieId,
      });
    } else if (error.code === "SCREENING_HAS_BOOKINGS") {
      setAlert({ text: "This screening has tickets, so it cannot be changed, hidden or deleted." });
      onLocked();
    } else if (error.code === "MOVIE_NOT_FOUND" || error.code === "NOT_FOUND") {
      setAlert({ text: "The movie or hall no longer exists." });
    } else {
      setAlert({ text: "The screening could not be saved. Please try again in a moment." });
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (savingRef.current || locked || !hasChanges) return;

    setAlert(null);
    setOverlap(null);
    setStatus("");
    const clientErrors = validate(values, payload, {
      checkFuture: creating || "startsAt" in changes,
    });
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      focusFirstInvalid(clientErrors);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      if (creating) {
        onCreated(await createScreening(payload));
        return;
      }
      const updated = await updateScreening(screening.id, changes);
      setValues(toValues(updated));
      setStatus("Changes saved");
      onSaved(updated);
    } catch (error) {
      handleError(error);
    }
    savingRef.current = false;
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-3xl space-y-5">
      <Toast message={status} onDismiss={dismissStatus} />
      {locked && (
        <p className="rounded-lg border border-rio-gold/40 bg-rio-gold/10 px-4 py-3 text-sm font-semibold text-rio-gold-light">
          {lockedFormMessage(screening)}
        </p>
      )}
      {alert && (
        <div
          role="alert"
          className="rounded-lg border border-red-400 bg-rio-red/30 px-4 py-3 text-sm font-semibold text-red-200"
        >
          <p>
            {alert.text}{" "}
            {alert.movieId && (
              <Link to={`/admin/movies/${alert.movieId}`} className={TEXT_LINK_CLASSES}>
                Go to the movie
              </Link>
            )}
          </p>
          {overlap && <OverlapList overlap={overlap} listSearch={listSearch} />}
        </div>
      )}

      <fieldset disabled={locked} className="space-y-5">
        <div className="space-y-1">
          <label htmlFor={fieldId("movieId")} className={LABEL_CLASSES}>
            Movie
          </label>
          <select
            value={shown.movieId}
            onChange={(event) => setField("movieId", event.target.value)}
            className={INPUT_CLASSES}
            {...fieldProps("movieId", errors)}
          >
            <option value="">Choose a movie</option>
            {sortedMovies.map((movie) => (
              <option key={movie.id} value={movie.id}>
                {movie.title}
                {movie.published ? "" : " (hidden)"}
              </option>
            ))}
          </select>
          <FieldError name="movieId" errors={errors} />
        </div>

        <div className="space-y-1">
          <label htmlFor={fieldId("hallId")} className={LABEL_CLASSES}>
            Hall
          </label>
          <select
            value={shown.hallId}
            onChange={(event) => setField("hallId", event.target.value)}
            className={INPUT_CLASSES}
            {...fieldProps("hallId", errors)}
          >
            <option value="">Choose a hall</option>
            {theatres.map((theatre) => (
              <optgroup key={theatre.id} label={theatre.name}>
                {halls
                  .filter((hall) => hall.theatre.id === theatre.id)
                  .map((hall) => (
                    <option key={hall.id} value={hall.id}>
                      {hall.name} · {hall.seats} seats
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <FieldError name="hallId" errors={errors} />
        </div>

        <div className="space-y-1">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={fieldId("dayKey")} className={LABEL_CLASSES}>
                Date (Helsinki time)
              </label>
              <input
                type="date"
                required
                value={shown.dayKey}
                onChange={(event) => setField("dayKey", event.target.value)}
                className={INPUT_CLASSES}
                {...fieldProps("dayKey", errors)}
              />
              <FieldError name="dayKey" errors={errors} />
            </div>
            <div className="space-y-1">
              <label htmlFor={fieldId("time")} className={LABEL_CLASSES}>
                Start time (Helsinki time)
              </label>
              <input
                type="time"
                required
                step="300"
                value={shown.time}
                onChange={(event) => setField("time", event.target.value)}
                className={INPUT_CLASSES}
                {...fieldProps("time", errors, hint && "screening-time-hint")}
              />
              <FieldError name="time" errors={errors} />
            </div>
          </div>
          <FieldError name="startsAt" errors={errors} />
          {hint && (
            <div id="screening-time-hint" className="text-sm text-white/70">
              <p>Hall busy {hint.busy} (ads start {ADS_MINUTES} minutes before)</p>
              <p>Ends at {hint.endsAt}</p>
            </div>
          )}
        </div>

        <div className="space-y-1 sm:w-1/2 sm:pr-2.5">
          <label htmlFor={fieldId("basePrice")} className={LABEL_CLASSES}>
            Base price (€)
          </label>
          <input
            type="number"
            inputMode="decimal"
            required
            min="0"
            max="100"
            step="0.01"
            value={shown.basePrice}
            onChange={(event) => setField("basePrice", event.target.value)}
            className={INPUT_CLASSES}
            {...fieldProps("basePrice", errors)}
          />
          <FieldError name="basePrice" errors={errors} />
        </div>

        <div className="space-y-1">
          <label className="flex items-center gap-2 text-white/85">
            <input
              type="checkbox"
              checked={shown.isPremiere}
              onChange={(event) => setField("isPremiere", event.target.checked)}
              className="accent-rio-gold"
              {...fieldProps("isPremiere", errors)}
            />
            Mark as premiere
          </label>
          <FieldError name="isPremiere" errors={errors} />
        </div>

        <div className="space-y-1">
          <label className="flex items-center gap-2 text-white/85">
            <input
              type="checkbox"
              checked={shown.published}
              onChange={(event) => setField("published", event.target.checked)}
              className="accent-rio-gold"
              {...fieldProps("published", errors)}
            />
            Visible to customers
          </label>
          <FieldError name="published" errors={errors} />
        </div>
      </fieldset>

      {!locked && (
        <button
          type="submit"
          disabled={saving || !hasChanges}
          className={`${GOLD_BUTTON_CLASSES} ${saving ? "disabled:cursor-wait" : ""}`}
        >
          {saving ? "Saving…" : creating ? "Create screening" : "Save changes"}
        </button>
      )}
    </form>
  );
}

export default ScreeningForm;
