// BR-012 (FR-021): the premiere surcharge is added to the base price first, then the
// child discount; the result is rounded to whole cents once, at the end.
// The 10th-ticket discount is for registered users only, so guest checkout never applies it.
// Wheelchair spaces have no special pricing (BR-014) and cost an adult ticket.
export const CHILD_MAX_AGE = 12;

const PREMIERE_PERCENT = 115;
const CHILD_PERCENT = 50;

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
