import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyBookings } from "../api/me.js";
import Poster from "../components/Poster.jsx";
import SeatChips from "../components/SeatChips.jsx";
import StateMessage from "../components/StateMessage.jsx";
import { formatDateTime, formatDayLabel, formatPrice, formatTime } from "../utils/format.js";

const PAGE_TITLE = "My bookings — Rio Theatres";
const DEFAULT_TITLE = "Rio Theatres";
const CONTAINER_CLASSES = "mx-auto max-w-5xl px-4 py-8 sm:px-6";
const GOLD_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light";
const TEXT_LINK_CLASSES =
  "rounded-sm text-sm font-semibold text-rio-gold underline-offset-4 hover:underline";
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

function BookingCard({ booking }) {
  const { reference, status, screening } = booking;
  const { movie, theatre, hall } = screening;
  const titleId = `booking-${reference}-title`;
  const hasTickets = booking.seats.length > 0 || booking.wheelchairSpaces > 0;

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
            {formatDayLabel(screening.startsAt)} · {formatTime(screening.startsAt)}
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
        {/* Reservation actions (Pay now, Cancel reservation) are added here by FR-016 and FR-018. */}
        {status === "paid" && (
          <div className="flex flex-wrap items-center gap-4">
            <Link
              to={`/checkout/${encodeURIComponent(reference)}?city=${theatre.city}`}
              className={TEXT_LINK_CLASSES}
            >
              View confirmation<span className="sr-only"> for {movie.title}, {reference}</span>
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

function BookingSection({ id, title, bookings, emptyText }) {
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
              <BookingCard booking={booking} />
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
        />
        <BookingSection
          id="past-bookings"
          title="Past"
          bookings={result.data.past}
          emptyText="No past bookings."
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
