import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSeatLayout } from "../src/modules/halls/seatLayout.js";

test("generates the required 3 by 5 snake layout", () => {
  const seats = generateSeatLayout(3, 5);
  const rows = new Map();

  for (const seat of seats) {
    const row = rows.get(seat.posY) ?? [];
    row[seat.posX - 1] = seat.seatNumber;
    rows.set(seat.posY, row);
  }

  assert.deepEqual(rows.get(3), [16, 15, 14, 12, 11]);
  assert.deepEqual(rows.get(2), [6, 7, 8, 9, 10]);
  assert.deepEqual(rows.get(1), [5, 4, 3, 2, 1]);
});

test("generates 200 seats with row and seat number 13 skipped", () => {
  const seats = generateSeatLayout(20, 10);

  assert.equal(seats.length, 200);
  assert.deepEqual(
    [...new Set(seats.map(({ rowNumber }) => rowNumber))],
    [
      ...Array.from({ length: 12 }, (_, index) => index + 1),
      ...Array.from({ length: 8 }, (_, index) => index + 14),
    ],
  );
  assert.equal(Math.max(...seats.map(({ seatNumber }) => seatNumber)), 201);
  assert.equal(
    seats.some(
      ({ rowNumber, seatNumber }) => rowNumber === 13 || seatNumber === 13,
    ),
    false,
  );
});

test("assigns exactly one owner seat, seat number 1", () => {
  const seats = generateSeatLayout(20, 10);
  const owners = seats.filter(({ type }) => type === "owner");

  assert.equal(owners.length, 1);
  assert.equal(owners[0].seatNumber, 1);
});

test("rejects non-positive or non-integer dimensions", () => {
  assert.throws(() => generateSeatLayout(0, 5), RangeError);
  assert.throws(() => generateSeatLayout(3, 1.5), RangeError);
});
