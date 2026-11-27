const CHIP_CLASSES =
  "rounded-full border border-rio-gold/50 px-3 py-1 text-xs font-semibold text-rio-gold-light";
const TICKET_TYPE_LABELS = { adult: "Adult", child: "Child" };

function sortSeats(seats) {
  return [...seats].sort((a, b) => a.rowNumber - b.rowNumber || a.seatNumber - b.seatNumber);
}

// Loyalty discount (OQ-005): text, not only colour, so screen readers announce it.
function DiscountBadge({ children }) {
  return (
    <span
      data-testid="discount-badge"
      className="rounded-full bg-rio-gold px-2 py-0.5 text-xs font-semibold text-rio-black"
    >
      {children}
    </span>
  );
}

function SeatChips({ seats, wheelchairSpaces, wheelchairDiscounts = 0, label = "Your seats" }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-2">
      {sortSeats(seats).map((seat) => (
        <li key={seat.id} className="flex flex-wrap items-center gap-1">
          <span className={CHIP_CLASSES}>
            Row {seat.rowNumber} · Seat {seat.seatNumber} · {TICKET_TYPE_LABELS[seat.ticketType]}
          </span>
          {seat.discountNote && <DiscountBadge>{seat.discountNote}</DiscountBadge>}
        </li>
      ))}
      {wheelchairSpaces > 0 && (
        <li className="flex flex-wrap items-center gap-1">
          <span className={CHIP_CLASSES}>
            {wheelchairSpaces} × Wheelchair space · in front of row 1
          </span>
          {wheelchairDiscounts > 0 && (
            <DiscountBadge>
              {wheelchairDiscounts} wheelchair {wheelchairDiscounts === 1 ? "space" : "spaces"} −50 %
            </DiscountBadge>
          )}
        </li>
      )}
    </ul>
  );
}

export default SeatChips;
