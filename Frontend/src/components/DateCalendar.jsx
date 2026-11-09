import { useEffect, useId, useRef, useState } from "react";
import { addMonths, formatFullDate, formatMonthYear, getMonthGrid } from "../utils/format.js";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
      <rect x="2.5" y="4" width="15" height="13.5" rx="2" className="fill-none stroke-current" strokeWidth="1.5" />
      <path d="M2.5 8.5h15M6.5 2.5v3M13.5 2.5v3" className="fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MonthButton({ direction, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction < 0 ? "Previous month" : "Next month"}
      className="rounded-sm px-2 text-xl leading-none text-rio-gold transition-colors hover:text-rio-gold-light disabled:cursor-default disabled:opacity-25 motion-reduce:transition-none"
    >
      <span aria-hidden="true">{direction < 0 ? "‹" : "›"}</span>
    </button>
  );
}

function DateCalendar({ counts, todayKey, lastKey, selectedKey, isActive, onSelect }) {
  const dialogId = useId();
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [month, setMonth] = useState(selectedKey.slice(0, 7));
  const firstMonth = todayKey.slice(0, 7);
  const lastMonth = lastKey.slice(0, 7);

  useEffect(() => {
    if (!isOpen) return;
    dialogRef.current
      ?.querySelector('[aria-pressed="true"], [data-day]:not(:disabled)')
      ?.focus();

    function closeOnOutsideClick(event) {
      if (dialogRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      setIsOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function toggle() {
    if (!isOpen) setMonth(selectedKey.slice(0, 7));
    setIsOpen(!isOpen);
  }

  function select(key) {
    onSelect(key);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label="More dates"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={dialogId}
        className={`ml-1 flex h-9 w-9 items-center justify-center rounded-md border transition-colors motion-reduce:transition-none sm:ml-2 ${
          isActive || isOpen
            ? "border-rio-gold bg-rio-gold text-rio-black"
            : "border-rio-gold/40 text-rio-gold hover:border-rio-gold"
        }`}
      >
        <CalendarIcon />
      </button>

      {isOpen && (
        <div
          ref={dialogRef}
          id={dialogId}
          role="dialog"
          aria-label="Choose a date"
          className="absolute top-full left-0 z-30 mt-2 w-72 rounded-xl border border-rio-gold/30 bg-rio-surface p-4 shadow-rio-glow"
        >
          <div className="flex items-center justify-between">
            <MonthButton direction={-1} disabled={month <= firstMonth} onClick={() => setMonth(addMonths(month, -1))} />
            <p aria-live="polite" className="font-display font-bold text-rio-gold-light">
              {formatMonthYear(`${month}-01`)}
            </p>
            <MonthButton direction={1} disabled={month >= lastMonth} onClick={() => setMonth(addMonths(month, 1))} />
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} aria-hidden="true" className="pb-1 text-[0.6875rem] font-semibold uppercase text-white/50">
                {weekday}
              </span>
            ))}
            {getMonthGrid(month).map((key, index) => {
              if (!key) return <span key={`blank-${index}`} aria-hidden="true" />;
              const count = counts.get(key) ?? 0;
              const isAvailable = count > 0 && key >= todayKey;
              const isSelected = key === selectedKey;
              return (
                <button
                  key={key}
                  type="button"
                  data-day
                  disabled={!isAvailable}
                  aria-pressed={isSelected}
                  aria-label={`${formatFullDate(key)}, ${
                    isAvailable ? `${count} ${count === 1 ? "screening" : "screenings"}` : "no screenings"
                  }`}
                  onClick={() => select(key)}
                  className={`h-9 rounded-md text-sm font-semibold transition-colors motion-reduce:transition-none ${
                    isSelected
                      ? "bg-rio-gold text-rio-black"
                      : isAvailable
                        ? "text-white hover:bg-rio-gold/15 hover:text-rio-gold-light"
                        : "cursor-not-allowed text-white/25"
                  }`}
                >
                  {Number(key.slice(8))}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export default DateCalendar;
