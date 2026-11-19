import { test } from "node:test";
import assert from "node:assert/strict";
import { ticketPrices, totalPrice } from "../src/modules/bookings/pricing.js";

test("ticket prices follow BR-012", () => {
  assert.deepEqual(ticketPrices(10, false), { adult: 10, child: 5 });
  assert.deepEqual(ticketPrices(10, true), { adult: 11.5, child: 5.75 });
  assert.deepEqual(ticketPrices("12.50", false), { adult: 12.5, child: 6.25 });
});

test("ticket prices are rounded to cents after the final calculation", () => {
  // 9.99 × 1.15 = 11.4885 → 11.49; × 0.5 = 5.74425 → 5.74 (not half of 11.49).
  assert.deepEqual(ticketPrices(9.99, true), { adult: 11.49, child: 5.74 });
});

test("the total adds prices without floating-point drift", () => {
  assert.equal(totalPrice([11.5, 5.75, 11.5]), 28.75);
  assert.equal(totalPrice([0.1, 0.2]), 0.3);
  assert.equal(totalPrice([]), 0);
});
