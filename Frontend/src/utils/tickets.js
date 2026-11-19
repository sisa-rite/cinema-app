// BR-005: one order has at most 10 tickets, seats and wheelchair spaces together.
export const MAX_TICKETS = 10;

// Keeps the adult/child split in step with the selected seats: a new seat becomes an
// adult ticket, a removed seat takes an adult ticket first, then a child ticket.
export function fitTicketTypes(types, seatCount) {
  let { adult, child } = types;
  if (seatCount > types.seatCount) adult += seatCount - types.seatCount;

  const excess = adult + child - seatCount;
  if (excess > 0) {
    const fromAdult = Math.min(adult, excess);
    adult -= fromAdult;
    child -= excess - fromAdult;
  }
  return { adult, child, seatCount };
}

// Wheelchair spaces cost an adult ticket (BR-014). Cents avoid 0.1 + 0.2 style drift.
export function ticketsTotal(prices, types, wheelchairSpaces) {
  const cents = (price) => Math.round(price * 100);
  return (
    ((types.adult + wheelchairSpaces) * cents(prices.adult) + types.child * cents(prices.child)) /
    100
  );
}
