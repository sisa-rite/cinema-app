import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyLoyaltyDiscount,
  LOYALTY_DISCOUNT_NOTE,
  ticketPrices,
  totalPrice,
} from "../src/modules/bookings/pricing.js";

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

test("the 10th ticket discount follows the first worked example", () => {
  const tickets = Array.from({ length: 5 }, (_, index) => ({
    ticketType: "adult",
    isWheelchair: false,
    rowNumber: 1,
    seatNumber: index + 1,
    price: 12.5,
  }));
  const discounted = applyLoyaltyDiscount({ ticketsSoFar: 8, tickets });

  assert.equal(totalPrice(discounted.map(({ price }) => price)), 56.25);
  assert.equal(discounted[0].price, 6.25);
  assert.equal(discounted[0].discountNote, LOYALTY_DISCOUNT_NOTE);
  assert.ok(discounted.slice(1).every(({ discountNote }) => discountNote === null));
});

test("child tickets count toward the second worked example but are not discounted", () => {
  const tickets = [
    ...Array.from({ length: 8 }, (_, index) => ({
      ticketType: "adult",
      isWheelchair: false,
      rowNumber: 1,
      seatNumber: index + 1,
      price: 12.5,
    })),
    ...Array.from({ length: 2 }, () => ({
      ticketType: "child",
      isWheelchair: false,
      rowNumber: 2,
      seatNumber: 1,
      price: 6.25,
    })),
  ];
  const discounted = applyLoyaltyDiscount({ ticketsSoFar: 0, tickets });

  assert.equal(totalPrice(discounted.map(({ price }) => price)), 106.25);
  assert.equal(discounted[0].discountNote, LOYALTY_DISCOUNT_NOTE);
  assert.ok(discounted.slice(8).every(({ discountNote }) => discountNote === null));
});

test("a child-only 10th ticket loses its discount", () => {
  const [ticket] = applyLoyaltyDiscount({
    ticketsSoFar: 9,
    tickets: [
      {
        ticketType: "child",
        isWheelchair: false,
        rowNumber: 1,
        seatNumber: 1,
        price: 6.25,
      },
    ],
  });

  assert.equal(ticket.price, 6.25);
  assert.equal(ticket.discountNote, null);
});

test("premiere discount rounds the unrounded adult price once", () => {
  const [ticket] = applyLoyaltyDiscount({
    ticketsSoFar: 9,
    tickets: [
      {
        ticketType: "adult",
        isWheelchair: false,
        rowNumber: 1,
        seatNumber: 1,
        price: 14.375,
      },
    ],
  });

  assert.equal(ticket.price, 7.19);
});

test("half-cent premiere prices round using integer cents", () => {
  const [ticket] = applyLoyaltyDiscount({
    ticketsSoFar: 9,
    tickets: [
      {
        ticketType: "adult",
        isWheelchair: false,
        rowNumber: 1,
        seatNumber: 1,
        price: 1.15,
      },
    ],
  });

  assert.equal(ticket.price, 0.58);
});

test("a wheelchair ticket receives the discount when there is no adult seat", () => {
  const tickets = [
    {
      ticketType: "child",
      isWheelchair: false,
      rowNumber: 1,
      seatNumber: 1,
      price: 6.25,
    },
    {
      ticketType: "adult",
      isWheelchair: true,
      price: 12.5,
    },
  ];
  const discounted = applyLoyaltyDiscount({ ticketsSoFar: 9, tickets });

  assert.equal(discounted[1].price, 6.25);
  assert.equal(discounted[1].discountNote, LOYALTY_DISCOUNT_NOTE);
  assert.equal(discounted[0].discountNote, null);
});

test("adult seats are selected by row and seat number before wheelchair spaces", () => {
  const tickets = [
    {
      ticketType: "adult",
      isWheelchair: true,
      price: 12.5,
    },
    {
      ticketType: "adult",
      isWheelchair: false,
      rowNumber: 2,
      seatNumber: 1,
      price: 12.5,
    },
    {
      ticketType: "adult",
      isWheelchair: false,
      rowNumber: 1,
      seatNumber: 3,
      price: 12.5,
    },
    {
      ticketType: "adult",
      isWheelchair: false,
      rowNumber: 1,
      seatNumber: 2,
      price: 12.5,
    },
  ];
  const discounted = applyLoyaltyDiscount({ ticketsSoFar: 9, tickets });

  assert.equal(discounted[0].discountNote, null);
  assert.equal(discounted[1].discountNote, null);
  assert.equal(discounted[2].discountNote, null);
  assert.equal(discounted[3].discountNote, LOYALTY_DISCOUNT_NOTE);
});
