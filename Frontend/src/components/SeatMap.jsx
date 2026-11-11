import SeatIcon from "./SeatIcon.jsx";

const STATE_LABELS = {
  available: "available",
  selected: "selected",
  held: "held by another customer",
  sold: "sold",
  owner: "reserved for the owner",
  blocked: "not available",
};

function tooltipPosition(posX, columns) {
  if (posX <= 2) return "left-0";
  if (posX > columns - 2) return "right-0";
  return "left-1/2 -translate-x-1/2";
}

function DoorIcon() {
  return (
    <svg viewBox="0 0 12 14" aria-hidden="true" className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5">
      <rect x="1.5" y="0.75" width="9" height="12.5" rx="1" className="fill-none stroke-current" strokeWidth="1.2" />
      <circle cx="8" cy="7.2" r="0.9" className="fill-current" />
    </svg>
  );
}

function Entrance({ gridColumn, align }) {
  return (
    <div
      aria-hidden="true"
      style={{ gridColumn }}
      className={`flex items-center gap-1 pb-2 text-[0.5625rem] font-semibold uppercase tracking-[0.2em] text-rio-gold/80 sm:text-[0.6875rem] ${
        align === "end" ? "justify-self-end" : "justify-self-start"
      }`}
    >
      <DoorIcon />
      Entrance
    </div>
  );
}

function SeatMap({ seats, selectedIds, onToggle, hallName, maxSelected = 10, readOnly = false }) {
  const selected = new Set(selectedIds);
  const limitReached = !readOnly && selected.size >= maxSelected;
  const columns = Math.max(...seats.map((seat) => seat.posX));
  const rows = Math.max(...seats.map((seat) => seat.posY));
  const rowNumbers = new Map(seats.map((seat) => [seat.posY, seat.rowNumber]));
  const lastColumn = columns + 4;
  const screenRow = rows + 2;
  const gridRowOf = (posY) => rows - posY + 2;

  return (
    <div className="seat-map">
      <p id="seat-map-hint" className="sr-only">
        The screen is at the front. Row 1 is closest to the screen.
      </p>
      <div className="overflow-x-auto pb-2">
        <div
          role="group"
          aria-label={`Seat map, ${hallName}`}
          data-testid="seat-map"
          aria-describedby="seat-map-hint"
          className="seat-map-grid mx-auto"
          style={{ "--columns": columns, "--rows": rows }}
        >
          <Entrance gridColumn="1 / span 5" align="start" />
          <Entrance gridColumn={`${lastColumn - 4} / span 5`} align="end" />

          {[1, lastColumn].map((gridColumn) => (
            <div
              key={gridColumn}
              aria-hidden="true"
              className="seat-stairs"
              style={{ gridColumn, gridRow: `2 / span ${rows}` }}
            />
          ))}

          <div
            aria-hidden="true"
            className="seat-light-cone"
            style={{
              gridColumn: `3 / span ${columns}`,
              gridRow: `${gridRowOf(Math.min(rows, 4))} / ${screenRow}`,
            }}
          />

          {[...rowNumbers].flatMap(([posY, rowNumber]) =>
            [2, lastColumn - 1].map((gridColumn) => (
              <div
                key={`${posY}-${gridColumn}`}
                aria-hidden="true"
                className="seat-row-in flex items-center justify-center text-[0.625rem] font-semibold text-rio-gold-light/70 sm:text-xs"
                style={{ gridColumn, gridRow: gridRowOf(posY), "--row": posY - 1 }}
              >
                {rowNumber}
              </div>
            )),
          )}

          {seats.map((seat) => {
            const isSelected = selected.has(seat.id);
            const visualState = isSelected ? "selected" : seat.state;
            const isBlockedByLimit = seat.state === "available" && !isSelected && limitReached;
            const isDisabled = readOnly || seat.state !== "available" || isBlockedByLimit;

            return (
              <button
                key={seat.id}
                type="button"
                className="seat seat-row-in relative z-[1] hover:z-10 focus-visible:z-10"
                style={{
                  gridColumn: seat.posX + 2,
                  gridRow: gridRowOf(seat.posY),
                  "--row": seat.posY - 1,
                }}
                aria-label={`Row ${seat.rowNumber}, seat ${seat.seatNumber}, ${STATE_LABELS[visualState]}`}
                title={!readOnly && seat.state === "owner" ? "Reserved for the owner" : undefined}
                disabled={isDisabled}
                aria-disabled={isDisabled || undefined}
                onClick={() => onToggle(seat.id)}
              >
                <SeatIcon
                  state={visualState}
                  number={seat.seatNumber}
                  className={`${isSelected ? "seat-pop" : ""} ${isBlockedByLimit ? "opacity-40" : ""}`}
                />
                {!isDisabled && (
                  <span
                    aria-hidden="true"
                    className={`seat-tooltip pointer-events-none absolute bottom-full mb-1.5 whitespace-nowrap rounded-sm border border-rio-gold/40 bg-rio-black px-1.5 py-0.5 text-[0.6875rem] text-rio-gold-light ${tooltipPosition(seat.posX, columns)}`}
                  >
                    Row {seat.rowNumber} · Seat {seat.seatNumber}
                  </span>
                )}
              </button>
            );
          })}

          <div
            aria-hidden="true"
            data-testid="screen"
            className="pt-4"
            style={{ gridColumn: `3 / span ${columns}`, gridRow: screenRow }}
          >
            <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="seat-screen h-3 w-full overflow-visible sm:h-4">
              <defs>
                <linearGradient id="seat-screen-gradient">
                  <stop offset="0" stopColor="var(--color-rio-gold-deep)" />
                  <stop offset="0.3" stopColor="var(--color-rio-gold-light)" />
                  <stop offset="0.5" stopColor="#fff" />
                  <stop offset="0.7" stopColor="var(--color-rio-gold-light)" />
                  <stop offset="1" stopColor="var(--color-rio-gold-deep)" />
                </linearGradient>
              </defs>
              <path
                d="M1 2Q50 10 99 2"
                fill="none"
                stroke="url(#seat-screen-gradient)"
                strokeWidth="4"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <p className="mt-1 text-center text-[0.625rem] font-semibold uppercase tracking-[0.6em] text-rio-gold-light/80 sm:text-xs">
              Screen
            </p>
          </div>
        </div>
      </div>
      <p role="status" className="mt-2 min-h-5 text-center text-sm text-rio-gold-light">
        {limitReached ? `You can select up to ${maxSelected} seats.` : ""}
      </p>
    </div>
  );
}

export default SeatMap;
