import { formatPrice } from "../utils/format.js";

function SelectionSummary({ seats, basePrice }) {
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

      <div className="flex items-center gap-4 lg:flex-col lg:items-stretch lg:gap-2">
        <button
          type="button"
          disabled
          className="rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue
        </button>
        <p className="text-xs text-white/60 lg:text-center">
          Checkout is coming soon.
        </p>
      </div>
    </aside>
  );
}

export default SelectionSummary;
