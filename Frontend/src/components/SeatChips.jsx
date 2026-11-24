const CHIP_CLASSES =
  "rounded-full border border-rio-gold/50 px-3 py-1 text-xs font-semibold text-rio-gold-light";
const TICKET_TYPE_LABELS = { adult: "Adult", child: "Child" };

function sortSeats(seats) {
  return [...seats].sort((a, b) => a.rowNumber - b.rowNumber || a.seatNumber - b.seatNumber);
}

function SeatChips({ seats, wheelchairSpaces, label = "Your seats" }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-2">
      {sortSeats(seats).map((seat) => (
        <li key={seat.id} className={CHIP_CLASSES}>
          Row {seat.rowNumber} · Seat {seat.seatNumber} · {TICKET_TYPE_LABELS[seat.ticketType]}
        </li>
      ))}
      {wheelchairSpaces > 0 && (
        <li className={CHIP_CLASSES}>
          {wheelchairSpaces} × Wheelchair space · in front of row 1
        </li>
      )}
    </ul>
  );
}

export default SeatChips;
