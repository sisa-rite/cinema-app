import { useCallback, useRef, useState } from "react";
import { createMovie, updateMovie } from "../api/adminMovies.js";
import { HAS_BOOKINGS_MESSAGE } from "../utils/adminMovies.js";
import Poster from "./Poster.jsx";
import Toast from "./Toast.jsx";

const AGE_RATINGS = ["S", "K-7", "K-12", "K-16", "K-18"];
// Order of the fields on the page: the first invalid one gets focus.
const FIELD_ORDER = [
  "title",
  "durationMinutes",
  "genre",
  "ageRating",
  "description",
  "posterUrl",
  "trailerUrl",
  "published",
];
const OPTIONAL_TEXT_FIELDS = ["genre", "description", "posterUrl", "trailerUrl"];
const DESCRIPTION_MAX = 2000;
const URL_PATTERN = /^https?:\/\/\S+$/i;
const URL_ERROR = "Enter a URL starting with http:// or https:// (max 500 characters)";
const GOLD_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light disabled:cursor-not-allowed disabled:opacity-50";
const INPUT_CLASSES =
  "w-full rounded-lg border border-rio-gold/40 bg-rio-black px-3 py-2 text-white focus:border-rio-gold aria-invalid:border-red-400";
const LABEL_CLASSES = "block text-sm font-semibold text-rio-gold-light";

function toValues(movie) {
  return {
    title: movie?.title ?? "",
    durationMinutes: movie ? String(movie.durationMinutes) : "",
    genre: movie?.genre ?? "",
    ageRating: movie?.ageRating ?? "",
    description: movie?.description ?? "",
    posterUrl: movie?.posterUrl ?? "",
    trailerUrl: movie?.trailerUrl ?? "",
    published: movie?.published ?? false,
  };
}

function toPayload(values) {
  const payload = {
    title: values.title.trim(),
    durationMinutes: Number(values.durationMinutes),
    ageRating: values.ageRating || null,
    published: values.published,
  };
  for (const field of OPTIONAL_TEXT_FIELDS) {
    payload[field] = values[field].trim() || null;
  }
  return payload;
}

function changedFields(payload, movie) {
  return Object.fromEntries(
    Object.entries(payload).filter(([field, value]) => value !== movie[field]),
  );
}

function isHttpUrl(value) {
  return URL_PATTERN.test(value) && URL.canParse(value);
}

// Mirrors the validation table in docs/api.md; the server stays the real check.
function validate(payload, values) {
  const errors = {};
  if (payload.title.length < 1) errors.title = "Enter a title";
  else if (payload.title.length > 200) errors.title = "Use at most 200 characters";

  const duration = values.durationMinutes.trim();
  if (!/^\d+$/.test(duration) || payload.durationMinutes < 1 || payload.durationMinutes > 600) {
    errors.durationMinutes = "Enter whole minutes from 1 to 600";
  }
  if (payload.genre && payload.genre.length > 100) errors.genre = "Use at most 100 characters";
  if (payload.description && payload.description.length > DESCRIPTION_MAX) {
    errors.description = `Use at most ${DESCRIPTION_MAX} characters`;
  }
  for (const field of ["posterUrl", "trailerUrl"]) {
    const url = payload[field];
    if (url && (url.length > 500 || !isHttpUrl(url))) errors[field] = URL_ERROR;
  }
  return errors;
}

function fieldId(name) {
  return `movie-${name}`;
}

function focusFirstInvalid(errors) {
  const first = FIELD_ORDER.find((field) => errors[field]);
  if (first) document.getElementById(fieldId(first))?.focus();
}

function FieldError({ name, errors }) {
  if (!errors[name]) return null;
  return (
    <p id={`${fieldId(name)}-error`} className="text-sm text-red-300">
      {errors[name]}
    </p>
  );
}

function errorProps(name, errors, extraDescribedBy) {
  const describedBy = [errors[name] && `${fieldId(name)}-error`, extraDescribedBy]
    .filter(Boolean)
    .join(" ");
  return {
    id: fieldId(name),
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": describedBy || undefined,
  };
}

function MovieForm({ movie = null, initialStatus = "", onCreated, onSaved }) {
  const creating = movie === null;
  const [values, setValues] = useState(() => toValues(movie));
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dismissStatus = useCallback(() => setStatus(""), []);

  const payload = toPayload(values);
  const changes = creating ? payload : changedFields(payload, movie);
  const hasChanges = Object.keys(changes).length > 0;
  const posterPreviewUrl = isHttpUrl(payload.posterUrl ?? "") ? payload.posterUrl : null;

  function setField(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
    setStatus("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (savingRef.current || !hasChanges) return;

    setAlert("");
    setStatus("");
    const clientErrors = validate(payload, values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      focusFirstInvalid(clientErrors);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      if (creating) {
        onCreated(await createMovie(payload));
        return;
      }
      const updated = await updateMovie(movie.id, changes);
      setValues(toValues(updated));
      setStatus("Changes saved");
      onSaved(updated);
    } catch (error) {
      const fields = error.code === "VALIDATION_ERROR" ? error.details?.fields : null;
      if (fields) {
        setErrors(fields);
        const unknownField = Object.keys(fields).find((field) => !FIELD_ORDER.includes(field));
        if (unknownField) setAlert(fields[unknownField]);
        focusFirstInvalid(fields);
      } else if (error.code === "MOVIE_HAS_BOOKINGS") {
        setAlert(
          `${HAS_BOOKINGS_MESSAGE} Nothing was saved — keep it published and save again.`,
        );
      } else {
        setAlert("The movie could not be saved. Please try again in a moment.");
      }
    }
    savingRef.current = false;
    setSaving(false);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,48rem)_14rem] lg:items-start">
      <Toast message={status} onDismiss={dismissStatus} />
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {alert && (
          <p
            role="alert"
            className="rounded-lg border border-red-400 bg-rio-red/30 px-4 py-3 text-sm font-semibold text-red-200"
          >
            {alert}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor={fieldId("title")} className={LABEL_CLASSES}>
            Title
          </label>
          <input
            type="text"
            required
            value={values.title}
            onChange={(event) => setField("title", event.target.value)}
            className={INPUT_CLASSES}
            {...errorProps("title", errors)}
          />
          <FieldError name="title" errors={errors} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={fieldId("durationMinutes")} className={LABEL_CLASSES}>
              Duration (minutes)
            </label>
            <input
              type="number"
              inputMode="numeric"
              required
              min="1"
              max="600"
              step="1"
              value={values.durationMinutes}
              onChange={(event) => setField("durationMinutes", event.target.value)}
              className={INPUT_CLASSES}
              {...errorProps("durationMinutes", errors)}
            />
            <FieldError name="durationMinutes" errors={errors} />
          </div>

          <div className="space-y-1">
            <label htmlFor={fieldId("ageRating")} className={LABEL_CLASSES}>
              Age rating
            </label>
            <div className="relative">
              <select
                value={values.ageRating}
                onChange={(event) => setField("ageRating", event.target.value)}
                className={`appearance-none pr-10 ${INPUT_CLASSES}`}
                {...errorProps("ageRating", errors)}
              >
                <option value="">No rating</option>
                {AGE_RATINGS.map((rating) => (
                  <option key={rating} value={rating}>
                    {rating}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-rio-gold-light"
              >
                <path d="M5 7.5l5 5 5-5" />
              </svg>
            </div>
            <FieldError name="ageRating" errors={errors} />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor={fieldId("genre")} className={LABEL_CLASSES}>
            Genre
          </label>
          <input
            type="text"
            value={values.genre}
            onChange={(event) => setField("genre", event.target.value)}
            className={INPUT_CLASSES}
            {...errorProps("genre", errors)}
          />
          <FieldError name="genre" errors={errors} />
        </div>

        <div className="space-y-1">
          <label htmlFor={fieldId("description")} className={LABEL_CLASSES}>
            Description
          </label>
          <textarea
            rows={6}
            value={values.description}
            onChange={(event) => setField("description", event.target.value)}
            className={INPUT_CLASSES}
            {...errorProps("description", errors, "movie-description-count")}
          />
          <p
            id="movie-description-count"
            className={`text-right text-xs ${
              values.description.length > DESCRIPTION_MAX ? "text-red-300" : "text-white/60"
            }`}
          >
            {values.description.length}/{DESCRIPTION_MAX}
          </p>
          <FieldError name="description" errors={errors} />
        </div>

        <div className="space-y-1">
          <label htmlFor={fieldId("posterUrl")} className={LABEL_CLASSES}>
            Poster URL
          </label>
          <input
            type="url"
            inputMode="url"
            value={values.posterUrl}
            onChange={(event) => setField("posterUrl", event.target.value)}
            className={INPUT_CLASSES}
            {...errorProps("posterUrl", errors)}
          />
          <FieldError name="posterUrl" errors={errors} />
        </div>

        <div className="space-y-1">
          <label htmlFor={fieldId("trailerUrl")} className={LABEL_CLASSES}>
            Trailer URL
          </label>
          <input
            type="url"
            inputMode="url"
            value={values.trailerUrl}
            onChange={(event) => setField("trailerUrl", event.target.value)}
            className={INPUT_CLASSES}
            {...errorProps("trailerUrl", errors)}
          />
          <FieldError name="trailerUrl" errors={errors} />
        </div>

        <div className="space-y-1">
          <label className="flex items-center gap-2 text-white/85">
            <input
              type="checkbox"
              checked={values.published}
              onChange={(event) => setField("published", event.target.checked)}
              className="accent-rio-gold"
              {...errorProps("published", errors)}
            />
            Visible to customers
          </label>
          <FieldError name="published" errors={errors} />
          {!values.published && (
            <p className="text-sm text-white/60">
              Hidden movies and their screenings are not shown to customers.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving || !hasChanges}
          className={`${GOLD_BUTTON_CLASSES} ${saving ? "disabled:cursor-wait" : ""}`}
        >
          {saving ? "Saving…" : creating ? "Create movie" : "Save changes"}
        </button>
      </form>

      {posterPreviewUrl && (
        <figure className="w-40 space-y-2 lg:w-full">
          <Poster key={posterPreviewUrl} src={posterPreviewUrl} title={payload.title} />
          <figcaption className="text-sm text-white/60">Poster preview</figcaption>
        </figure>
      )}
    </div>
  );
}

export default MovieForm;
