import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getBooking } from "../api/bookings.js";
import { ApiError } from "../api/client.js";
import { getScreeningSeats } from "../api/screenings.js";
import Poster from "../components/Poster.jsx";
import StateMessage from "../components/StateMessage.jsx";
import { loadBookingEmail, saveBookingEmail } from "../utils/bookingStorage.js";
import { formatDayLabel, formatPrice, formatTime } from "../utils/format.js";

const PAGE_TITLE = "Checkout — Rio Theatres";
const DEFAULT_TITLE = "Rio Theatres";
const WARNING_SECONDS = 2 * 60;
const CONTAINER_CLASSES = "mx-auto max-w-5xl px-4 py-8 sm:px-6";
const TEXT_LINK_CLASSES =
  "rounded-sm font-semibold text-rio-gold underline-offset-4 hover:underline";
const GOLD_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light disabled:cursor-not-allowed disabled:opacity-50";

function formatRemaining(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

// Announced only when a threshold is crossed, never on every tick.
function holdAnnouncement(remainingSeconds, startSeconds) {
  if (startSeconds <= 0) return "";
  if (remainingSeconds <= 0) return "Your hold has expired.";
  if (remainingSeconds <= 60 && startSeconds > 60) return "1 minute left to complete your booking.";
  if (remainingSeconds <= 300 && startSeconds > 300) return "5 minutes left to complete your booking.";
  return "";
}

function EmailForm({ onSubmit }) {
  const [email, setEmail] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(email.trim());
  }

  return (
    <StateMessage title="Find your booking" headingAs="h1">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3 text-left">
        <label htmlFor="checkout-email" className="block text-sm font-semibold text-rio-gold-light">
          Enter the e-mail you used
        </label>
        <input
          id="checkout-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border border-rio-gold/40 bg-rio-black px-3 py-2 text-white focus:border-rio-gold"
        />
        <button type="submit" className={`w-full ${GOLD_BUTTON_CLASSES}`}>
          Show my booking
        </button>
      </form>
    </StateMessage>
  );
}

function CopyReference({ reference }) {
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(reference);
      setStatus("Reference copied.");
    } catch {
      setStatus("Copying failed. Please write the reference down.");
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-mono text-3xl font-bold tracking-widest text-rio-gold sm:text-4xl">
          {reference}
        </p>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy booking reference ${reference}`}
          className="rounded-full border border-rio-gold/50 px-4 py-1.5 text-sm font-semibold text-rio-gold-light transition-colors hover:border-rio-gold hover:text-rio-gold"
        >
          Copy
        </button>
      </div>
      <p role="status" className="min-h-5 text-sm text-white/70">
        {status}
      </p>
    </div>
  );
}

function HeldBooking({ booking, screening }) {
  const [now, setNow] = useState(Date.now);
  const [startNow] = useState(now);
  const expiresAt = Date.parse(booking.holdExpiresAt);
  const remainingSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const startSeconds =
    booking.status === "held" ? Math.max(0, Math.ceil((expiresAt - startNow) / 1000)) : 0;
  const expired = booking.status === "expired" || remainingSeconds === 0;
  const warning = remainingSeconds <= WARNING_SECONDS;
  const { movie, theatre, hall } = screening;
  const seats = [...booking.seats].sort(
    (a, b) => a.rowNumber - b.rowNumber || a.seatNumber - b.seatNumber,
  );

  useEffect(() => {
    if (expired) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expired]);

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {holdAnnouncement(remainingSeconds, startSeconds)}
      </p>

      {expired ? (
        <StateMessage title="Your hold has expired." headingAs="h1">
          <p className="text-white/75">
            Your seats have been released for other customers.
          </p>
          <Link to={`/screenings/${booking.screeningId}`} className={GOLD_BUTTON_CLASSES}>
            Choose seats again
          </Link>
        </StateMessage>
      ) : (
        <div className={CONTAINER_CLASSES}>
          <h1 className="font-display text-3xl font-bold text-rio-gold sm:text-4xl">Checkout</h1>

          <p
            className={`mt-6 rounded-lg border px-4 py-3 font-semibold ${
              warning
                ? "border-red-400 bg-rio-red/30 text-red-200"
                : "border-rio-gold bg-rio-gold/10 text-rio-gold-light"
            }`}
          >
            Your seats are held for{" "}
            <span className="font-mono tabular-nums">{formatRemaining(remainingSeconds)}</span>
          </p>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <section aria-labelledby="checkout-movie-title" className="flex gap-4 sm:gap-6">
              <Poster src={movie.posterUrl} title={movie.title} className="w-24 shrink-0 sm:w-36" />
              <div className="min-w-0 space-y-3">
                <h2
                  id="checkout-movie-title"
                  className="font-display text-xl font-bold text-rio-gold sm:text-2xl"
                >
                  {movie.title}
                </h2>
                <p className="text-rio-gold-light">
                  <time dateTime={screening.startsAt}>
                    {formatDayLabel(screening.startsAt)} · {formatTime(screening.startsAt)}
                  </time>
                </p>
                <p className="text-sm text-white/75">
                  {theatre.name} · {hall.name}
                </p>
                <ul aria-label="Your seats" className="flex flex-wrap gap-2">
                  {seats.map((seat) => (
                    <li
                      key={seat.id}
                      className="rounded-full border border-rio-gold/50 px-3 py-1 text-xs font-semibold text-rio-gold-light"
                    >
                      Row {seat.rowNumber} · Seat {seat.seatNumber}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <aside
              aria-labelledby="checkout-summary-title"
              className="space-y-4 rounded-2xl border border-rio-gold/30 bg-rio-surface p-6"
            >
              <h2 id="checkout-summary-title" className="text-sm font-semibold text-white/70">
                Booking reference
              </h2>
              <CopyReference reference={booking.reference} />
              <p className="flex items-baseline justify-between gap-4 border-t border-rio-gold/20 pt-4">
                <span className="text-white/75">Total</span>
                <span className="text-xl font-semibold text-rio-gold-light">
                  {formatPrice(booking.totalPrice)}
                </span>
              </p>
              <button type="button" disabled className={`w-full ${GOLD_BUTTON_CLASSES}`}>
                Pay
              </button>
              <p className="text-center text-xs text-white/60">
                Payment is coming in the next sprint.
              </p>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}

function Checkout({ reference }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [lookup, setLookup] = useState(() => ({
    email: loadBookingEmail(reference),
    manual: false,
  }));
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const requestKey = `${lookup.email}#${attempt}`;
  const isLoading = lookup.email !== null && result.key !== requestKey;
  const apiCity = isLoading ? undefined : result.data?.screening.theatre.city;
  const urlCity = searchParams.get("city");

  useEffect(() => {
    document.title = PAGE_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, []);

  useEffect(() => {
    if (lookup.email === null) return undefined;
    const controller = new AbortController();
    const { signal } = controller;

    getBooking(reference, lookup.email, { signal })
      .then(async (booking) => {
        const { screening } = await getScreeningSeats(booking.screeningId, { signal });
        saveBookingEmail(reference, lookup.email);
        setResult({ key: requestKey, data: { booking, screening }, error: null });
      })
      .catch((error) => {
        if (!signal.aborted) setResult({ key: requestKey, data: null, error });
      });
    return () => controller.abort();
  }, [reference, lookup.email, requestKey]);

  useEffect(() => {
    if (apiCity && urlCity !== apiCity) {
      setSearchParams({ city: apiCity }, { replace: true });
    }
  }, [apiCity, urlCity, setSearchParams]);

  if (lookup.email === null) {
    return <EmailForm onSubmit={(email) => setLookup({ email, manual: true })} />;
  }

  if (isLoading) {
    return (
      <div className={CONTAINER_CLASSES}>
        <p role="status" className="sr-only">
          Loading your booking…
        </p>
        <div aria-hidden="true" className="h-96 rounded-2xl bg-white/10 motion-safe:animate-pulse" />
      </div>
    );
  }

  if (result.error) {
    const isNotFound =
      result.error instanceof ApiError && result.error.code === "BOOKING_NOT_FOUND";

    if (isNotFound) {
      return (
        <StateMessage title="Booking not found" headingAs="h1">
          <p className="text-white/75">
            We couldn’t find a booking with this reference and e-mail address.
          </p>
          {lookup.manual && (
            <button
              type="button"
              onClick={() => setLookup({ email: null, manual: true })}
              className={GOLD_BUTTON_CLASSES}
            >
              Try another e-mail
            </button>
          )}
          <Link to="/" className={TEXT_LINK_CLASSES}>
            Back to the home page →
          </Link>
        </StateMessage>
      );
    }

    return (
      <StateMessage title="We couldn’t load your booking" headingAs="h1" role="alert">
        <p className="text-white/75">
          Something went wrong on our side or your connection dropped. Please
          try again in a moment.
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
  }

  return <HeldBooking booking={result.data.booking} screening={result.data.screening} />;
}

function CheckoutPage() {
  const { reference } = useParams();
  return <Checkout key={reference} reference={reference} />;
}

export default CheckoutPage;
