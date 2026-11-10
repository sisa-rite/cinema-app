import { useState } from "react";
import { formatPrice } from "../utils/format.js";

const GOLD_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light disabled:cursor-not-allowed disabled:opacity-50";
const TEXT_BUTTON_CLASSES =
  "rounded-sm text-sm font-semibold text-rio-gold underline-offset-4 hover:underline";

function SelectionSummary({ seats, basePrice, onHold, submitting = false, fieldErrors = {}, alert = null }) {
  const [step, setStep] = useState("seats");
  const [email, setEmail] = useState("");
  const showEmailStep = step === "email" && seats.length > 0;

  function handleSubmit(event) {
    event.preventDefault();
    if (!submitting) onHold(email.trim());
  }

  return (
    <aside
      aria-labelledby="selection-summary-title"
      className="sticky bottom-0 z-20 -mx-4 space-y-3 border-t border-rio-gold/30 bg-rio-surface/95 px-4 py-4 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:top-6 lg:bottom-auto lg:mx-0 lg:rounded-2xl lg:border lg:p-6"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="selection-summary-title"
          className="font-display text-lg font-bold text-rio-gold"
        >
          Your seats ({seats.length})
        </h2>
        <p className="text-right">
          <span className="sr-only">Total: </span>
          <span className="text-lg font-semibold text-rio-gold-light">
            {formatPrice(basePrice * seats.length)}
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

      {alert && (
        <p role="alert" className="text-sm text-red-300">
          {alert.text}
        </p>
      )}

      {showEmailStep ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="booking-email" className="block text-sm font-semibold text-rio-gold-light">
              E-mail for your tickets
            </label>
            <input
              id="booking-email"
              type="email"
              autoComplete="email"
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
          <div className="flex items-center gap-4 lg:flex-col lg:items-stretch lg:gap-2">
            <button
              type="submit"
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
          onClick={() => setStep("email")}
          disabled={seats.length === 0}
          className={`w-full ${GOLD_BUTTON_CLASSES}`}
        >
          Continue
        </button>
      )}
    </aside>
  );
}

export default SelectionSummary;
