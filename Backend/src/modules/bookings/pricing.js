// BR-012 (FR-021): the premiere surcharge is added to the base price first, then the
// child discount; the result is rounded to whole cents once, at the end.
// The 10th-ticket discount is for registered users only, so guest checkout never applies it.
// Wheelchair spaces have no special pricing (BR-014) and cost an adult ticket.
export const CHILD_MAX_AGE = 12;

const PREMIERE_PERCENT = 115;
const CHILD_PERCENT = 50;
export const LOYALTY_DISCOUNT_NOTE = "Every 10th ticket −50 %";

// Integer cents keep 10 € × 115 % × 50 % at exactly 5.75 €.
function toEuros(cents) {
  return Math.round(cents) / 100;
}

export function ticketPrices(basePrice, isPremiere) {
  const baseCents = Math.round(Number(basePrice) * 100);
  const adultPercent = isPremiere ? PREMIERE_PERCENT : 100;
  return {
    adult: toEuros((baseCents * adultPercent) / 100),
    child: toEuros((baseCents * adultPercent * CHILD_PERCENT) / 10000),
  };
}

export function totalPrice(prices) {
  return toEuros(prices.reduce((cents, price) => cents + Math.round(price * 100), 0));
}

// `tickets` are priced with ticketPrices(); `prices` is that result for the screening.
// The discounted price is the unrounded normal price × 50 %, rounded once: the child price.
export function applyLoyaltyDiscount({ ticketsSoFar, tickets, prices }) {
  const pricedTickets = tickets.map((ticket) => ({ ...ticket, discountNote: null }));
  const hasDiscountPosition = tickets.some(
    (_, index) => (ticketsSoFar + index + 1) % 10 === 0,
  );
  if (!hasDiscountPosition) return pricedTickets;

  const firstAdultSeat = pricedTickets
    .filter((ticket) => ticket.ticketType === "adult" && !ticket.isWheelchair)
    .sort(
      (left, right) =>
        left.rowNumber - right.rowNumber ||
        left.seatNumber - right.seatNumber,
    )[0];
  const discountedTicket =
    firstAdultSeat ??
    pricedTickets.find(
      (ticket) => ticket.ticketType === "adult" && ticket.isWheelchair,
    );

  if (discountedTicket) {
    discountedTicket.price = prices.child;
    discountedTicket.discountNote = LOYALTY_DISCOUNT_NOTE;
  }

  return pricedTickets;
}
