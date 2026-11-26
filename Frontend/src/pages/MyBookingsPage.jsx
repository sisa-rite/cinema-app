import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cancelBooking } from "../api/bookings.js";
import { getMyBookings } from "../api/me.js";
import CancelReservationDialog from "../components/CancelReservationDialog.jsx";
import Poster from "../components/Poster.jsx";
import SeatChips from "../components/SeatChips.jsx";
import StateMessage from "../components/StateMessage.jsx";
import {
  formatDateTime,
  formatDayLabel,
  formatDayLabelWithYear,
  formatPrice,
  formatTime,
} from "../utils/format.js";
import { cancelErrorMessage } from "../utils/reservations.js";

const PAGE_TITLE = "My bookings — Rio Theatres";
const DEFAULT_TITLE = "Rio Theatres";
const CONTAINER_CLASSES = "mx-auto max-w-5xl px-4 py-8 sm:px-6";
const GOLD_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light";
const TEXT_LINK_CLASSES =
  "rounded-sm text-sm font-semibold text-rio-gold underline-offset-4 hover:underline";
const SMALL_GOLD_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-4 py-1.5 text-sm font-semibold text-rio-black transition-colors hover:bg-rio-gold-light";
const SMALL_CANCEL_BUTTON_CLASSES =
  "rounded-full border border-red-300/70 px-4 py-1.5 text-sm font-semibold text-red-200 transition-colors hover:border-red-300 hover:bg-rio-red/30 disabled:cursor-not-allowed disabled:opacity-50";
const STATUS_BADGES = {
  reserved: { label: "Reserved", classes: "border-rio-gold text-rio-gold-light" },
  paid: { label: "Paid", classes: "border-emerald-300 text-emerald-300" },
  cancelled: { label: "Cancelled", classes: "border-white/40 text-white/75" },
  expired: { label: "Expired", classes: "border-red-300 text-red-300" },
};

function StatusBadge({ status }) {
  const badge = STATUS_BADGES[status];
  if (!badge) return null;
  return (
    <span
      data-testid="booking-status"
      className={`shrink-0 rounded-full border px-3 py-0.5 text-xs font-semibold ${badge.classes}`}
    >
      {badge.label}
    </span>
  );
}

function BookingCard({ booking, isPast, onUpdated }) {
  const { reference, status, screening } = booking;
  const { movie, theatre, hall } = screening;
  const titleId = `booking-${reference}-title`;
  const hasTickets = booking.seats.length > 0 || booking.wheelchairSpaces > 0;
  const checkoutPath = `/checkout/${encodeURIComponent(reference)}?city=${theatre.city}`;
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState(null);
  const messageRef = useRef(null);

  // The cancel button disappears after success, so focus moves to the message.
  useEffect(() => {
    if (message?.focus) messageRef.current.focus();
  }, [message]);

  async function cancel() {
    setConfirming(false);
    setCancelling(true);
    setMessage(null);
    try {
      const cancelled = await cancelBooking(reference);
      onUpdated({ ...booking, ...cancelled });
      setMessage({ text: "Reservation cancelled.", role: "status", focus: true });
    } catch (error) {
      if (error.code === "BOOKING_NOT_CANCELLABLE" && error.details?.status) {
        onUpdated({ ...booking, status: error.details.status });
      }
      setMessage({ text: cancelErrorMessage(error), role: "alert", focus: false });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <article
      data-testid="booking-card"
      aria-labelledby={titleId}
      className="flex gap-4 rounded-2xl border border-rio-gold/30 bg-rio-surface p-4 sm:gap-6 sm:p-6"
    >
      <Poster src={movie.posterUrl} title={movie.title} className="w-20 shrink-0 sm:w-28" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 id={titleId} className="font-display text-lg font-bold text-rio-gold sm:text-xl">
            {movie.title}
          </h3>
          <StatusBadge status={status} />
        </div>
        <p className="text-rio-gold-light">
          <time dateTime={screening.startsAt}>
            {isPast ? formatDayLabelWithYear(screening.startsAt) : formatDayLabel(screening.startsAt)}
            {" · "}
            {formatTime(screening.startsAt)}
          </time>
        </p>
        <p className="text-sm text-white/75">
          {theatre.name} · {hall.name}
        </p>
        {hasTickets && (
          <SeatChips
            seats={booking.seats}
            wheelchairSpaces={booking.wheelchairSpaces}
            label={`Seats for ${movie.title}`}
          />
        )}
        {status === "reserved" && booking.paymentDeadline && (
          <p className="text-sm text-white/75">
            Pay by{" "}
            <time dateTime={booking.paymentDeadline}>{formatDateTime(booking.paymentDeadline)}</time>
          </p>
        )}
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-white/70">Total</dt>
            <dd className="font-semibold text-rio-gold-light">{formatPrice(booking.totalPrice)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-white/70">Reference</dt>
            <dd data-testid="booking-reference" className="font-mono font-semibold tracking-wider text-rio-gold-light">
              {reference}
            </dd>
          </div>
        </dl>
        {status === "reserved" && (
          <div className="flex flex-wrap items-center gap-3">
            <Link to={checkoutPath} className={SMALL_GOLD_BUTTON_CLASSES}>
              Pay now<span className="sr-only"> for {movie.title}, {reference}</span>
            </Link>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={cancelling}
              className={SMALL_CANCEL_BUTTON_CLASSES}
            >
              {cancelling ? "Cancelling…" : "Cancel reservation"}
              <span className="sr-only"> for {movie.title}, {reference}</span>
            </button>
          </div>
        )}
        {status === "paid" && (
          <div className="flex flex-wrap items-center gap-4">
            <Link to={checkoutPath} className={TEXT_LINK_CLASSES}>
              View confirmation<span className="sr-only"> for {movie.title}, {reference}</span>
            </Link>
          </div>
        )}
        {message && (
          <p
            ref={messageRef}
            role={message.role}
            tabIndex={-1}
            className={`text-sm focus:outline-none ${
              message.role === "alert" ? "text-red-300" : "text-rio-gold-light"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
      {status === "reserved" && (
        <CancelReservationDialog
          open={confirming}
          onConfirm={cancel}
          onCancel={() => setConfirming(false)}
        />
      )}
    </article>
  );
}

function BookingSection({ id, title, bookings, emptyText, isPast = false, onUpdated }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="font-display text-2xl font-bold text-rio-gold-light">
        {title}
      </h2>
      {bookings.length === 0 ? (
        <p className="text-white/70">{emptyText}</p>
      ) : (
        <ul className="space-y-4">
          {bookings.map((booking) => (
            <li key={booking.reference}>
              <BookingCard booking={booking} isPast={isPast} onUpdated={onUpdated} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MyBookingsPage() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ attempt: null, data: null, error: null });
  const isLoading = result.attempt !== attempt;

  useEffect(() => {
    document.title = PAGE_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, []);

  // A cancelled reservation stays in its place in the list.
  function updateBooking(updated) {
    const replace = (bookings) =>
      bookings.map((booking) => (booking.reference === updated.reference ? updated : booking));
    setResult((current) => ({
      ...current,
      data: { upcoming: replace(current.data.upcoming), past: replace(current.data.past) },
    }));
  }

  useEffect(() => {
    const controller = new AbortController();
    getMyBookings({ signal: controller.signal })
      .then((data) => setResult({ attempt, data, error: null }))
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ attempt, data: null, error });
      });
    return () => controller.abort();
  }, [attempt]);

  let content;
  if (isLoading) {
    content = (
      <>
        <p role="status" className="sr-only">
          Loading your bookings…
        </p>
        <div aria-hidden="true" className="space-y-4">
          <div className="h-48 rounded-2xl bg-white/10 motion-safe:animate-pulse" />
          <div className="h-48 rounded-2xl bg-white/10 motion-safe:animate-pulse" />
        </div>
      </>
    );
  } else if (result.error) {
    content = (
      <StateMessage title="We couldn’t load your bookings" role="alert">
        <p className="text-white/75">
          Something went wrong on our side or your connection dropped. Please try again in a moment.
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
  } else if (result.data.upcoming.length === 0 && result.data.past.length === 0) {
    content = (
      <StateMessage title="No bookings yet.">
        <Link to="/" className={GOLD_BUTTON_CLASSES}>
          Browse movies
        </Link>
      </StateMessage>
    );
  } else {
    content = (
      <div className="space-y-10">
        <BookingSection
          id="upcoming-bookings"
          title="Upcoming"
          bookings={result.data.upcoming}
          emptyText="No upcoming bookings."
          onUpdated={updateBooking}
        />
        <BookingSection
          id="past-bookings"
          title="Past"
          bookings={result.data.past}
          emptyText="No past bookings."
          isPast
          onUpdated={updateBooking}
        />
      </div>
    );
  }

  return (
    <div className={CONTAINER_CLASSES}>
      <h1 className="font-display text-3xl font-bold text-rio-gold sm:text-4xl">My bookings</h1>
      <div className="mt-8">{content}</div>
    </div>
  );
}

export default MyBookingsPage;
