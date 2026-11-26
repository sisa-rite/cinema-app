import { useEffect, useId, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { cancelBooking, getBooking, payBooking, reserveBooking } from "../api/bookings.js";
import { ApiError } from "../api/client.js";
import { getScreeningSeats } from "../api/screenings.js";
import { useAuth } from "../auth/useAuth.js";
import CancelReservationDialog from "../components/CancelReservationDialog.jsx";
import Poster from "../components/Poster.jsx";
import SeatChips from "../components/SeatChips.jsx";
import StateMessage from "../components/StateMessage.jsx";
import { loadBookingEmail, saveBookingEmail } from "../utils/bookingStorage.js";
import { formatDateTime, formatDayLabel, formatPrice, formatTime } from "../utils/format.js";
import { withRedirect } from "../utils/redirect.js";
import {
  cancelErrorMessage,
  formatDeadline,
  isReservationClosed,
  reservationDeadline,
} from "../utils/reservations.js";

const PAGE_TITLE = "Checkout — Rio Theatres";
const CONFIRMED_TITLE = "Booking confirmed — Rio Theatres";
const DEFAULT_TITLE = "Rio Theatres";
const WARNING_SECONDS = 2 * 60;
// Pay and reserve errors that replace the whole checkout with another view.
const PAGE_LEVEL_ERRORS = [
  "HOLD_EXPIRED",
  "RESERVATION_EXPIRED",
  "SALES_CLOSED",
  "BOOKING_NOT_FOUND",
  "BOOKING_ALREADY_PAID",
];
const CONTAINER_CLASSES = "mx-auto max-w-5xl px-4 py-8 sm:px-6";
const TEXT_LINK_CLASSES =
  "rounded-sm font-semibold text-rio-gold underline-offset-4 hover:underline";
const GOLD_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light disabled:cursor-not-allowed disabled:opacity-50";
const OUTLINE_BUTTON_CLASSES =
  "rounded-full border border-rio-gold/60 px-6 py-2.5 font-semibold text-rio-gold transition-colors hover:border-rio-gold hover:bg-rio-gold/10 disabled:cursor-not-allowed disabled:opacity-50";
const CANCEL_BUTTON_CLASSES =
  "rounded-full border border-red-300/70 px-6 py-2.5 font-semibold text-red-200 transition-colors hover:border-red-300 hover:bg-rio-red/30 disabled:cursor-not-allowed disabled:opacity-50";

// A cancelled booking, or a reservation (it has a payment deadline) that expired.
function isEndedReservation(booking) {
  return (
    booking.status === "cancelled" || (booking.status === "expired" && Boolean(booking.paymentDeadline))
  );
}

// These views replace the button that led to them, so focus moves to their heading.
function useHeadingFocus() {
  const headingRef = useRef(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return headingRef;
}

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
        <p data-testid="booking-reference" className="font-mono text-3xl font-bold tracking-widest text-rio-gold sm:text-4xl">
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

function ScreeningDetails({ screening, booking }) {
  const { movie, theatre, hall } = screening;

  return (
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
        <SeatChips seats={booking.seats} wheelchairSpaces={booking.wheelchairSpaces} />
      </div>
    </section>
  );
}

function BookingConfirmation({ booking, screening, moviesPath }) {
  return (
    <section
      data-testid="booking-confirmation"
      aria-labelledby="confirmation-title"
      className={CONTAINER_CLASSES}
    >
      <div className="flex items-center gap-3">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-10 shrink-0 text-rio-gold"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M7.5 12.5l3 3 6-6" />
        </svg>
        <h1
          id="confirmation-title"
          className="font-display text-3xl font-bold text-rio-gold sm:text-4xl"
        >
          Your tickets are confirmed
        </h1>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {screening ? (
          <ScreeningDetails screening={screening} booking={booking} />
        ) : (
          <div className="space-y-3">
            <p className="text-white/75">Screening details are not available.</p>
            <SeatChips seats={booking.seats} wheelchairSpaces={booking.wheelchairSpaces} />
          </div>
        )}

        <aside
          aria-labelledby="confirmation-summary-title"
          className="space-y-4 rounded-2xl border border-rio-gold/30 bg-rio-surface p-6"
        >
          <h2 id="confirmation-summary-title" className="text-sm font-semibold text-white/70">
            Booking reference
          </h2>
          <CopyReference reference={booking.reference} />
          <p className="text-sm text-rio-gold-light">Show this reference at the cinema.</p>
          <p className="flex items-baseline justify-between gap-4 border-t border-rio-gold/20 pt-4">
            <span className="text-white/75">Total</span>
            <span className="text-xl font-semibold text-rio-gold-light">
              {formatPrice(booking.totalPrice)}
            </span>
          </p>
          <p className="text-sm text-white/75">
            Paid on <time dateTime={booking.paidAt}>{formatDateTime(booking.paidAt)}</time>
          </p>
        </aside>
      </div>

      <p className="mt-8 text-sm text-white/60">
        This confirmation is shown on screen only — please save your reference.
      </p>
      <Link to={moviesPath} className={`mt-6 inline-block ${GOLD_BUTTON_CLASSES}`}>
        Back to movies
      </Link>
    </section>
  );
}

// The no-refund checkbox gates only Pay; a reservation confirms it later, when it is paid.
function PaySection({ reference, email, onPaid, onError }) {
  const [accepted, setAccepted] = useState(false);
  const [paying, setPaying] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  const [payFailed, setPayFailed] = useState(false);
  const payingRef = useRef(false);

  async function pay() {
    if (payingRef.current) return;
    payingRef.current = true;
    setPaying(true);
    setAcceptError("");
    setPayFailed(false);

    try {
      onPaid(await payBooking(reference, { email, acceptNoRefund: true }));
    } catch (error) {
      payingRef.current = false;
      setPaying(false);
      const fields = error.code === "VALIDATION_ERROR" ? error.details?.fields : null;
      if (error instanceof ApiError && PAGE_LEVEL_ERRORS.includes(error.code)) {
        onError(error);
      } else if (fields) {
        setAcceptError(fields.acceptNoRefund ?? fields.email ?? error.message);
      } else {
        setPayFailed(true);
      }
    }
  }

  return (
    <>
      <p className="rounded-lg border border-rio-gold/40 bg-rio-gold/10 px-3 py-2 text-sm font-semibold text-rio-gold-light">
        Paid tickets cannot be refunded or cancelled.
      </p>
      <div className="space-y-1">
        <label className="flex items-start gap-2 text-sm text-white/75">
          <input
            type="checkbox"
            required
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            aria-invalid={acceptError ? true : undefined}
            aria-describedby={acceptError ? "no-refund-error" : undefined}
            className="mt-0.5 accent-rio-gold"
          />
          I understand that paid tickets cannot be refunded.
        </label>
        {acceptError && (
          <p id="no-refund-error" className="text-sm text-red-300">
            {acceptError}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={pay}
        disabled={!accepted || paying}
        className={`w-full ${GOLD_BUTTON_CLASSES}`}
      >
        {paying ? "Paying…" : "Pay"}
      </button>
      {payFailed && (
        <p role="alert" className="text-sm text-red-300">
          Payment failed. Please try again.
        </p>
      )}
      <p className="text-center text-xs text-white/60">
        This is a simulated payment — no card details are needed.
      </p>
    </>
  );
}

function OrDivider() {
  return (
    <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-white/60">
      <span aria-hidden="true" className="h-px flex-1 bg-rio-gold/20" />
      or
      <span aria-hidden="true" className="h-px flex-1 bg-rio-gold/20" />
    </p>
  );
}

function ReserveOption({ reference, startsAt, now, onReserved, onError }) {
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState("");
  const reservingRef = useRef(false);
  const hintId = useId();
  const closed = isReservationClosed(startsAt, now);

  async function reserve() {
    if (reservingRef.current) return;
    reservingRef.current = true;
    setReserving(true);
    setReserveError("");

    try {
      onReserved(await reserveBooking(reference));
    } catch (error) {
      reservingRef.current = false;
      setReserving(false);
      if (error instanceof ApiError && PAGE_LEVEL_ERRORS.includes(error.code)) {
        onError(error);
      } else if (error.code === "RESERVATION_CLOSED") {
        setReserveError(error.message);
      } else {
        setReserveError("Reserving failed. Please try again.");
      }
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={reserve}
        disabled={closed || reserving}
        aria-describedby={hintId}
        className={`w-full ${OUTLINE_BUTTON_CLASSES}`}
      >
        {reserving ? "Reserving…" : "Reserve and pay later"}
      </button>
      <p id={hintId} data-testid="reserve-hint" className="text-sm text-white/75">
        {closed
          ? "Reservations close 2 hours before the screening."
          : `Pay at the latest 2 hours before the screening (by ${formatDeadline(reservationDeadline(startsAt))}).`}
      </p>
      {reserveError && (
        <p role="alert" className="text-sm text-red-300">
          {reserveError}
        </p>
      )}
    </div>
  );
}

function HeldBooking({ booking, screening, email, onPaid, onReserved, onBookingError }) {
  const { user, status } = useAuth();
  const [now, setNow] = useState(Date.now);
  const [startNow] = useState(now);
  const expiresAt = Date.parse(booking.holdExpiresAt);
  const remainingSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const startSeconds =
    booking.status === "held" ? Math.max(0, Math.ceil((expiresAt - startNow) / 1000)) : 0;
  const expired = booking.status === "expired" || remainingSeconds === 0;
  const warning = remainingSeconds <= WARNING_SECONDS;
  const isCustomer = user?.role === "customer";

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
            <span data-testid="hold-countdown" className="font-mono tabular-nums">{formatRemaining(remainingSeconds)}</span>
          </p>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <ScreeningDetails screening={screening} booking={booking} />

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
              <PaySection
                reference={booking.reference}
                email={email}
                onPaid={onPaid}
                onError={onBookingError}
              />
              {/* A guest hold cannot be reserved; after login the customer selects seats again. */}
              {status !== "loading" && <OrDivider />}
              {isCustomer && (
                <ReserveOption
                  reference={booking.reference}
                  startsAt={screening.startsAt}
                  now={now}
                  onReserved={onReserved}
                  onError={onBookingError}
                />
              )}
              {!isCustomer && status !== "loading" && (
                <p className="text-center text-sm text-white/75">
                  Want to pay later?{" "}
                  <Link
                    to={withRedirect("/login", `/screenings/${booking.screeningId}`)}
                    className={`underline ${TEXT_LINK_CLASSES}`}
                  >
                    Log in to reserve
                  </Link>
                </p>
              )}
            </aside>
          </div>
        </div>
      )}
    </>
  );
}

function ReservedBooking({ booking, screening, email, onPaid, onCancelled, onBookingError }) {
  const headingRef = useHeadingFocus();
  const [cancelRequest, setCancelRequest] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  async function cancel() {
    setCancelling(true);
    setCancelError("");
    try {
      onCancelled(await cancelBooking(booking.reference));
    } catch (error) {
      setCancelling(false);
      setCancelError(cancelErrorMessage(error));
    }
  }

  return (
    <div data-testid="reservation-confirmation" className={CONTAINER_CLASSES}>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-3xl font-bold text-rio-gold focus:outline-none sm:text-4xl"
      >
        Reservation confirmed
      </h1>

      {booking.paymentDeadline && (
        <p
          role="status"
          className="mt-6 rounded-lg border border-rio-gold bg-rio-gold/10 px-4 py-3 font-semibold text-rio-gold-light"
        >
          Pay by{" "}
          <time data-testid="payment-deadline" dateTime={booking.paymentDeadline}>
            {formatDeadline(booking.paymentDeadline)}
          </time>
          , or the reservation expires and the seats are released.
        </p>
      )}
      <Link to="/my-bookings" className={`mt-4 inline-block ${TEXT_LINK_CLASSES}`}>
        Go to My bookings →
      </Link>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <ScreeningDetails screening={screening} booking={booking} />

        <aside
          aria-labelledby="reservation-summary-title"
          className="space-y-4 rounded-2xl border border-rio-gold/30 bg-rio-surface p-6"
        >
          <h2 id="reservation-summary-title" className="text-sm font-semibold text-white/70">
            Booking reference
          </h2>
          <CopyReference reference={booking.reference} />
          <p className="flex items-baseline justify-between gap-4 border-t border-rio-gold/20 pt-4">
            <span className="text-white/75">Total</span>
            <span className="text-xl font-semibold text-rio-gold-light">
              {formatPrice(booking.totalPrice)}
            </span>
          </p>
          <section aria-labelledby="pay-now-title" className="space-y-4 border-t border-rio-gold/20 pt-4">
            <h2 id="pay-now-title" className="font-display text-lg font-bold text-rio-gold">
              Pay now
            </h2>
            <PaySection
              reference={booking.reference}
              email={email}
              onPaid={onPaid}
              onError={onBookingError}
            />
          </section>
          <div className="space-y-2 border-t border-rio-gold/20 pt-4">
            <button
              type="button"
              onClick={() => setCancelRequest((count) => count + 1)}
              disabled={cancelling}
              className={`w-full ${CANCEL_BUTTON_CLASSES}`}
            >
              {cancelling ? "Cancelling…" : "Cancel reservation"}
            </button>
            {cancelError && (
              <p role="alert" className="text-sm text-red-300">
                {cancelError}
              </p>
            )}
          </div>
        </aside>
      </div>

      <CancelReservationDialog openRequest={cancelRequest} onConfirm={cancel} />
    </div>
  );
}

function ReservationEnded({ booking, screening, moviesPath }) {
  const headingRef = useHeadingFocus();
  const cancelled = booking.status === "cancelled";
  const moviePath = screening
    ? `/movies/${screening.movie.id}?city=${screening.theatre.city}`
    : moviesPath;

  return (
    <StateMessage
      title={cancelled ? "Reservation cancelled." : "Reservation expired"}
      headingAs="h1"
      headingRef={headingRef}
    >
      <p role="status" className="text-white/75">
        {cancelled
          ? "The seats have been released for other customers."
          : "The payment deadline has passed. Your reservation has expired."}
      </p>
      <Link to={moviePath} className={GOLD_BUTTON_CLASSES}>
        {screening ? "Back to the movie" : "Back to movies"}
      </Link>
      <Link to="/my-bookings" className={TEXT_LINK_CLASSES}>
        Go to My bookings →
      </Link>
    </StateMessage>
  );
}

function Checkout({ reference }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [lookup, setLookup] = useState(() => ({
    email: loadBookingEmail(reference),
    manual: false,
  }));
  const { user, status } = useAuth();
  // A customer's own booking opens without asking, e.g. from "My bookings" in a new tab.
  const accountEmail = user?.role === "customer" ? user.email : null;
  const email = lookup.email ?? (lookup.manual ? null : accountEmail);
  const usesAccountEmail = lookup.email === null && email !== null;
  const waitingForAccount = email === null && !lookup.manual && status === "loading";
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const requestKey = `${email}#${attempt}`;
  const isLoading = waitingForAccount || (email !== null && result.key !== requestKey);
  const apiCity = isLoading ? undefined : result.data?.screening?.theatre.city;
  const urlCity = searchParams.get("city");
  const city = apiCity ?? urlCity;
  const moviesPath = city ? `/movies?city=${encodeURIComponent(city)}` : "/";

  function updateBooking(booking) {
    setResult((current) => ({ ...current, data: { ...current.data, booking } }));
  }

  function handleBookingError(error) {
    if (error.code === "HOLD_EXPIRED" || error.code === "RESERVATION_EXPIRED") {
      updateBooking({ ...result.data.booking, status: "expired" });
    } else if (error.code === "BOOKING_ALREADY_PAID") {
      setAttempt((count) => count + 1);
    } else {
      setResult((current) => ({ ...current, error }));
    }
  }

  const isPaid = !isLoading && result.data?.booking.status === "paid";

  useEffect(() => {
    document.title = isPaid ? CONFIRMED_TITLE : PAGE_TITLE;
  }, [isPaid]);

  useEffect(() => {
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, []);

  useEffect(() => {
    if (email === null) return undefined;
    const controller = new AbortController();
    const { signal } = controller;

    getBooking(reference, email, { signal })
      .then(async (booking) => {
        // A paid booking is always confirmed, and an ended reservation always explained,
        // even if its screening was hidden later.
        const screeningOptional = booking.status === "paid" || isEndedReservation(booking);
        const screening = await getScreeningSeats(booking.screeningId, { signal }).then(
          (data) => data.screening,
          (error) => {
            if (!screeningOptional || signal.aborted) throw error;
            return null;
          },
        );
        saveBookingEmail(reference, email);
        setResult({ key: requestKey, data: { booking, screening }, error: null });
      })
      .catch((error) => {
        if (!signal.aborted) setResult({ key: requestKey, data: null, error });
      });
    return () => controller.abort();
  }, [reference, email, requestKey]);

  useEffect(() => {
    if (apiCity && urlCity !== apiCity) {
      setSearchParams({ city: apiCity }, { replace: true });
    }
  }, [apiCity, urlCity, setSearchParams]);

  if (email === null && !waitingForAccount) {
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
          {/* A booking made as a guest is not found under the account e-mail. */}
          {(lookup.manual || usesAccountEmail) && (
            <button
              type="button"
              onClick={() => setLookup({ email: null, manual: true })}
              className={GOLD_BUTTON_CLASSES}
            >
              Use a different e-mail
            </button>
          )}
          <Link to="/" className={TEXT_LINK_CLASSES}>
            Back to the home page →
          </Link>
        </StateMessage>
      );
    }

    if (result.error instanceof ApiError && result.error.code === "SALES_CLOSED") {
      return (
        <StateMessage title="Sales for this screening have closed." headingAs="h1">
          <p className="text-white/75">
            The screening has already started, so your seats could not be paid for.
          </p>
          <Link to={moviesPath} className={GOLD_BUTTON_CLASSES}>
            Back to movies
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

  if (isPaid) {
    return (
      <BookingConfirmation
        booking={result.data.booking}
        screening={result.data.screening}
        moviesPath={moviesPath}
      />
    );
  }

  const { booking, screening } = result.data;

  if (booking.status === "reserved") {
    return (
      <ReservedBooking
        booking={booking}
        screening={screening}
        email={email}
        onPaid={updateBooking}
        onCancelled={updateBooking}
        onBookingError={handleBookingError}
      />
    );
  }

  if (isEndedReservation(booking)) {
    return <ReservationEnded booking={booking} screening={screening} moviesPath={moviesPath} />;
  }

  return (
    <HeldBooking
      booking={booking}
      screening={screening}
      email={email}
      onPaid={updateBooking}
      onReserved={updateBooking}
      onBookingError={handleBookingError}
    />
  );
}

function CheckoutPage() {
  const { reference } = useParams();
  return <Checkout key={reference} reference={reference} />;
}

export default CheckoutPage;
