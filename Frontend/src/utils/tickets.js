// BR-005: one order has at most 10 tickets, seats and wheelchair spaces together.
export const MAX_TICKETS = 10;

// Seats without a child ticket are adult tickets; wheelchair spaces cost an adult
// ticket too (BR-014). Cents avoid 0.1 + 0.2 style drift.
export function ticketsTotal(prices, seatCount, childTickets, wheelchairSpaces) {
  const cents = (price) => Math.round(price * 100);
  const adultTickets = seatCount - childTickets + wheelchairSpaces;
  return (adultTickets * cents(prices.adult) + childTickets * cents(prices.child)) / 100;
}
