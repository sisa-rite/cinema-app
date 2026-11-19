const STEP_BUTTON_CLASSES =
  "grid size-9 place-items-center rounded-full border border-rio-gold/60 text-lg font-semibold text-rio-gold transition-colors hover:border-rio-gold hover:bg-rio-gold/10 disabled:cursor-not-allowed disabled:border-white/20 disabled:text-white/30 disabled:hover:bg-transparent";

// One "− count +" row; the label names the ticket type so screen readers announce
// "Add child ticket" instead of a bare "+".
function TicketCounter({ id, label, description, value, onChange, canDecrement, canIncrement }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm font-semibold text-rio-gold-light">
          {label}
        </p>
        {description && <p className="text-xs text-white/60">{description}</p>}
      </div>
      <div role="group" aria-labelledby={`${id}-label`} className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={!canDecrement}
          aria-label={`Remove ${label.toLowerCase()}`}
          className={STEP_BUTTON_CLASSES}
        >
          <span aria-hidden="true">−</span>
        </button>
        <output
          data-testid={`${id}-count`}
          aria-live="polite"
          className="w-5 text-center font-semibold text-white tabular-nums"
        >
          {value}
        </output>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={!canIncrement}
          aria-label={`Add ${label.toLowerCase()}`}
          className={STEP_BUTTON_CLASSES}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  );
}

export default TicketCounter;
