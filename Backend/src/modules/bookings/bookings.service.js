import { randomInt } from "node:crypto";
import pool from "../../db.js";
import {
  deleteTicketsForBookings,
  expireScreeningHolds,
  findBookingByReferenceAndEmail,
  findPublishedScreening,
  findRequestedSeats,
  insertBooking,
  insertTickets,
} from "./bookings.db.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class BookingsServiceError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

class TicketInsertConflict extends Error {}

function validationError(fields) {
  return new BookingsServiceError(
    400,
    "VALIDATION_ERROR",
    "Request validation failed.",
    { fields },
  );
}

function validateBookingBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) body = {};

  const fields = {};
  if (!Number.isSafeInteger(body.screeningId) || body.screeningId <= 0) {
    fields.screeningId = "Screening id must be a positive integer.";
  }
  if (
    !Array.isArray(body.seatIds) ||
    body.seatIds.length < 1 ||
    body.seatIds.length > 10 ||
    body.seatIds.some(
      (id) => !Number.isSafeInteger(id) || id <= 0,
    ) ||
    new Set(body.seatIds).size !== body.seatIds.length
  ) {
    fields.seatIds = "Select 1 to 10 unique seats";
  }
  if (
    typeof body.email !== "string" ||
    body.email.length > 254 ||
    !EMAIL_PATTERN.test(body.email)
  ) {
    fields.email = "Invalid e-mail address";
  }
  if (Object.keys(fields).length > 0) throw validationError(fields);

  return {
    screeningId: body.screeningId,
    seatIds: body.seatIds,
    email: body.email.toLowerCase(),
  };
}

function generateReference() {
  let suffix = "";
  for (let index = 0; index < 6; index += 1) {
    suffix += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return `RIO-${suffix}`;
}

async function insertBookingWithReference(
  client,
  screeningId,
  email,
  totalPrice,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // Keep a reference collision from aborting the surrounding transaction.
    await client.query("SAVEPOINT booking_reference");
    try {
      const booking = await insertBooking(
        client,
        screeningId,
        email,
        totalPrice,
        generateReference(),
      );
      await client.query("RELEASE SAVEPOINT booking_reference");
      return booking;
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT booking_reference");
      await client.query("RELEASE SAVEPOINT booking_reference");
      if (
        error.code !== "23505" ||
        error.constraint !== "bookings_reference_key" ||
        attempt === 2
      ) {
        throw error;
      }
    }
  }
}

function toBookingResponse(booking, seats) {
  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.response_status ?? booking.status,
    screeningId: booking.screening_id,
    email: booking.guest_email,
    holdExpiresAt: booking.hold_expires_at
      ? new Date(booking.hold_expires_at).toISOString()
      : null,
    seats: seats
      .filter((seat) => seat.seat_id !== null)
      .map((seat) => ({
        id: seat.seat_id,
        rowNumber: seat.row_number,
        seatNumber: seat.seat_number,
      })),
    totalPrice: Number(booking.total_price),
  };
}

export async function createBooking(body) {
  const { screeningId, seatIds, email } = validateBookingBody(body);
  const screening = await findPublishedScreening(screeningId);
  if (!screening) {
    throw new BookingsServiceError(
      404,
      "SCREENING_NOT_FOUND",
      "The requested screening was not found.",
    );
  }
  if (screening.sales_closed) {
    throw new BookingsServiceError(
      409,
      "SALES_CLOSED",
      "Sales for this screening have closed.",
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      const expiredBookingIds = await expireScreeningHolds(client, screeningId);
      if (expiredBookingIds.length > 0) {
        await deleteTicketsForBookings(client, expiredBookingIds);
      }

      const seats = await findRequestedSeats(
        client,
        screeningId,
        screening.hall_id,
        seatIds,
      );
      const unavailableSeatIds = seats
        .filter((seat) => !seat.available)
        .map((seat) => seat.id);
      if (unavailableSeatIds.length > 0) {
        throw new BookingsServiceError(
          409,
          "SEATS_UNAVAILABLE",
          "Some seats are no longer available.",
          { seatIds: unavailableSeatIds },
        );
      }

      const totalPrice = Number(screening.base_price) * seatIds.length;
      const booking = await insertBookingWithReference(
        client,
        screeningId,
        email,
        totalPrice,
      );
      try {
        await insertTickets(
          client,
          booking.id,
          screeningId,
          seatIds,
          screening.base_price,
        );
      } catch (error) {
        if (error.code === "23505") throw new TicketInsertConflict();
        throw error;
      }

      await client.query("COMMIT");
      return toBookingResponse(
        booking,
        seats.map((seat) => ({ ...seat, seat_id: seat.id })),
      );
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof TicketInsertConflict) {
        const unavailableSeats = await findRequestedSeats(
          client,
          screeningId,
          screening.hall_id,
          seatIds,
        );
        throw new BookingsServiceError(
          409,
          "SEATS_UNAVAILABLE",
          "Some seats are no longer available.",
          {
            seatIds: unavailableSeats
              .filter((seat) => !seat.available)
              .map((seat) => seat.id),
          },
        );
      }
      throw error;
    }
  } finally {
    client.release();
  }
}

export async function getBooking(reference, email) {
  if (typeof email !== "string") {
    throw new BookingsServiceError(
      404,
      "BOOKING_NOT_FOUND",
      "The requested booking was not found.",
    );
  }
  const rows = await findBookingByReferenceAndEmail(reference, email);
  if (rows.length === 0) {
    throw new BookingsServiceError(
      404,
      "BOOKING_NOT_FOUND",
      "The requested booking was not found.",
    );
  }
  return toBookingResponse(rows[0], rows);
}
