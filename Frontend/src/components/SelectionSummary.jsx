import { useEffect, useState } from "react";
import { getMyLoyalty } from "../api/me.js";
import { useAuth } from "../auth/useAuth.js";
import { requiresAgeCheck } from "../utils/ageRating.js";
import { formatPrice } from "../utils/format.js";
import { MAX_TICKETS, ticketsTotal } from "../utils/tickets.js";
import AgeRatingDialog from "./AgeRatingDialog.jsx";
import TicketCounter from "./TicketCounter.jsx";

const GOLD_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light disabled:cursor-not-allowed disabled:opacity-50";
const TEXT_BUTTON_CLASSES =
  "rounded-sm text-sm font-semibold text-rio-gold underline-offset-4 hover:underline";

// Hint only (OQ-005): the price from the hold is the real one, so the total is not changed here.
function loyaltyHintText(ticketsUntilDiscount, ticketCount, adultTickets, wheelchairSpaces) {
  if (ticketCount >= ticketsUntilDiscount) {
    // Child tickets count toward the position but never get the discount.
    return adultTickets > 0 || wheelchairSpaces > 0
      ? "One ticket in this order gets 50 % off (every 10th ticket). The final price is shown after you continue."
      : "Child tickets don't get the 10th-ticket discount — add an adult ticket to use it.";
  }
  return ticketsUntilDiscount === 1
    ? "Your next ticket is 50 % off"
    : `${ticketsUntilDiscount} more tickets until 50 % off`;
}

function LoyaltyHint({ ticketCount, adultTickets, wheelchairSpaces }) {
  const [loyalty, setLoyalty] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    // A failed request only hides the hint.
    getMyLoyalty({ signal: controller.signal }).then(setLoyalty, () => {});
    return () => controller.abort();
  }, []);

  if (!loyalty) return null;
  return (
    <p role="status" data-testid="loyalty-hint" className="text-xs text-rio-gold-light">
      {loyaltyHintText(loyalty.ticketsUntilDiscount, ticketCount, adultTickets, wheelchairSpaces)}
    </p>
  );
}

function SelectionSummary({
  screeningId,
  movieTitle,
  ageRating = null,
  seats,
  prices,
  childMaxAge,
  ticketTypes,
  onTicketTypesChange,
  wheelchairSpaces,
  wheelchairAvailable,
  onWheelchairSpacesChange,
  onHold,
  submitting = false,
  fieldErrors = {},
  alert = null,
}) {
  const [step, setStep] = useState("seats");
  const { user } = useAuth();
  // The server books a customer under the account e-mail, so customers skip the e-mail field.
  const accountEmail = user?.role === "customer" ? user.email : null;
  const [email, setEmail] = useState("");
  // A counter, not a boolean: the dialog closes natively and its close event arrives
  // asynchronously, so a mirrored "open" state could still be true when Continue is clicked again.
  const [ageDialogRequest, setAgeDialogRequest] = useState(0);
  // Storing the screening id (not a boolean) makes the confirmation reset for another screening.
  const [ageConfirmedFor, setAgeConfirmedFor] = useState(null);
  const ticketCount = seats.length + wheelchairSpaces;
  const assignedSeats = ticketTypes.adult + ticketTypes.child;
  const unassignedSeats = seats.length - assignedSeats;
  const canContinue = ticketCount > 0 && unassignedSeats === 0;
  const showEmailStep = step === "email" && canContinue;
  const wheelchairMax = Math.min(wheelchairAvailable, MAX_TICKETS - seats.length);
  const needsAgeCheck = requiresAgeCheck(ageRating) && ageConfirmedFor !== screeningId;

  function handleContinue() {
    if (needsAgeCheck) setAgeDialogRequest((n) => n + 1);
    else setStep("email");
  }

  function confirmAgeRating() {
    setAgeConfirmedFor(screeningId);
    setStep("email");
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!submitting) onHold((accountEmail ?? email).trim());
  }

  return (
    <aside
      aria-labelledby="selection-summary-title"
      // With the ticket counters the summary is too tall to stick over the seat map on a phone.
      className="space-y-3 rounded-2xl border border-rio-gold/30 bg-rio-surface p-4 sm:p-6 lg:sticky lg:top-6"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="selection-summary-title"
          className="font-display text-lg font-bold text-rio-gold"
        >
          Your tickets ({ticketCount})
        </h2>
        <p className="text-right">
          <span className="sr-only">Total: </span>
          <span data-testid="selection-total" className="text-lg font-semibold text-rio-gold-light">
            {formatPrice(ticketsTotal(prices, ticketTypes, wheelchairSpaces))}
          </span>
        </p>
      </div>

      {seats.length === 0 ? (
        <p className="text-sm text-white/70">No seats selected yet.</p>
      ) : (
        <ul className="flex max-h-16 flex-wrap gap-2 overflow-y-auto lg:max-h-none">
          {seats.map((seat) => (
            <li
              key={seat.id}
              className="rounded-full border border-rio-gold/50 px-3 py-1 text-xs font-semibold text-rio-gold-light"
            >
              Row {seat.rowNumber} · Seat {seat.seatNumber}
            </li>
          ))}
        </ul>
      )}
      {fieldErrors.seatIds && (
        <p className="text-sm text-red-300">{fieldErrors.seatIds}</p>
      )}

      <div className="space-y-3 border-t border-rio-gold/20 pt-3">
        <TicketCounter
          id="adult-tickets"
          label="Adult ticket"
          description={formatPrice(prices.adult)}
          value={ticketTypes.adult}
          onChange={(adult) => onTicketTypesChange(adult, ticketTypes.child)}
          canDecrement={!submitting && ticketTypes.adult > 0}
          canIncrement={!submitting && unassignedSeats > 0}
        />
        <TicketCounter
          id="child-tickets"
          label="Child ticket"
          description={`Up to ${childMaxAge} years · ${formatPrice(prices.child)}`}
          value={ticketTypes.child}
          onChange={(child) => onTicketTypesChange(ticketTypes.adult, child)}
          canDecrement={!submitting && ticketTypes.child > 0}
          canIncrement={!submitting && unassignedSeats > 0}
        />
        {unassignedSeats > 0 && (
          <p role="status" className="text-xs text-rio-gold-light">
            Choose a ticket type for {unassignedSeats} more{" "}
            {unassignedSeats === 1 ? "seat" : "seats"}.
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-rio-gold/20 pt-3">
        <TicketCounter
          id="wheelchair-spaces"
          label="Wheelchair space"
          description={`In front of row 1, no seat needed · ${formatPrice(prices.adult)}`}
          value={wheelchairSpaces}
          onChange={onWheelchairSpacesChange}
          canDecrement={!submitting && wheelchairSpaces > 0}
          canIncrement={!submitting && wheelchairSpaces < wheelchairMax}
        />
        {wheelchairAvailable === 0 ? (
          <p className="text-xs text-white/60">No wheelchair spaces are left for this screening.</p>
        ) : (
          ticketCount >= MAX_TICKETS && (
            <p className="text-xs text-white/60">One order can have up to {MAX_TICKETS} tickets.</p>
          )
        )}
      </div>

      {accountEmail && (
        <LoyaltyHint
          ticketCount={ticketCount}
          adultTickets={ticketTypes.adult}
          wheelchairSpaces={wheelchairSpaces}
        />
      )}

      {alert && (
        <p role="alert" className="text-sm text-red-300">
          {alert.text}
        </p>
      )}

      {showEmailStep ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          {!accountEmail && (
            <div className="space-y-1">
              <label htmlFor="booking-email" className="block text-sm font-semibold text-rio-gold-light">
                E-mail for your tickets
              </label>
              <input
                id="booking-email"
                type="email"
                autoComplete="email"
                // The "Continue" button that had focus is gone once this step shows.
                autoFocus
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? "booking-email-error" : undefined}
                className="w-full rounded-lg border border-rio-gold/40 bg-rio-black px-3 py-2 text-white focus:border-rio-gold"
              />
              {fieldErrors.email && (
                <p id="booking-email-error" className="text-sm text-red-300">
                  {fieldErrors.email}
                </p>
              )}
            </div>
          )}
          <div className="flex items-center gap-4 lg:flex-col lg:items-stretch lg:gap-2">
            <button
              type="submit"
              // Without the e-mail field, focus moves here from the "Continue" button.
              autoFocus={accountEmail !== null}
              disabled={submitting}
              className={`${GOLD_BUTTON_CLASSES} disabled:cursor-wait`}
            >
              {submitting ? "Holding your seats…" : alert?.retry ? "Try again" : "Hold my seats"}
            </button>
            <button
              type="button"
              onClick={() => setStep("seats")}
              disabled={submitting}
              className={`${TEXT_BUTTON_CLASSES} disabled:opacity-50`}
            >
              Change seats
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue}
          className={`w-full ${GOLD_BUTTON_CLASSES}`}
        >
          Continue
        </button>
      )}

      {requiresAgeCheck(ageRating) && (
        <AgeRatingDialog
          openRequest={ageDialogRequest}
          rating={ageRating}
          movieTitle={movieTitle}
          onConfirm={confirmAgeRating}
        />
      )}
    </aside>
  );
}

export default SelectionSummary;
