import { randomInt } from "node:crypto";
import pool from "../../db.js";
import {
  countTakenWheelchairSpaces,
  deleteTicketsForBookings,
  expireExpiredScreeningBookings,
  findBookingsForCustomer,
  findBookingResponseById,
  findBookingByReferenceAndAccess,
  findPublishedScreening,
  findRequestedSeats,
  insertBooking,
  insertTickets,
  isScreeningSalesClosed,
  lockBookingForPayment,
  lockBookingForReservation,
  lockScreening,
  reserveBooking as updateBookingReservation,
} from "./bookings.db.js";
import { ticketPrices, totalPrice } from "./pricing.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// BR-005: one online purchase has at most 10 tickets, seats and wheelchair spaces together.
const MAX_TICKETS = 10;

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

function validateBookingBody(body, isCustomer) {
  if (!body || typeof body !== "object" || Array.isArray(body)) body = {};

  const fields = {};
  if (!Number.isSafeInteger(body.screeningId) || body.screeningId <= 0) {
    fields.screeningId = "Screening id must be a positive integer.";
  }
  const seatIdsValid =
    Array.isArray(body.seatIds) &&
    body.seatIds.every((id) => Number.isSafeInteger(id) && id > 0) &&
    new Set(body.seatIds).size === body.seatIds.length;
  const childTickets = body.childTickets ?? 0;
  const wheelchairSpaces = body.wheelchairSpaces ?? 0;
  const wheelchairValid =
    Number.isSafeInteger(wheelchairSpaces) &&
    wheelchairSpaces >= 0 &&
    wheelchairSpaces <= MAX_TICKETS;

  if (!wheelchairValid) {
    fields.wheelchairSpaces = "Wheelchair spaces must be a whole number from 0 to 10";
  }
  if (!seatIdsValid) {
    fields.seatIds = "Select 1 to 10 unique seats";
  } else if (wheelchairValid) {
    const ticketCount = body.seatIds.length + wheelchairSpaces;
    if (ticketCount < 1 || ticketCount > MAX_TICKETS) {
      fields.seatIds = "Select 1 to 10 tickets in total";
    }
  }
  if (
    !Number.isSafeInteger(childTickets) ||
    childTickets < 0 ||
    (seatIdsValid && childTickets > body.seatIds.length)
  ) {
    fields.childTickets = "Child tickets must be a whole number up to the number of seats";
  }
  if (!isCustomer) {
    if (
      typeof body.email !== "string" ||
      body.email.length > 254 ||
      !EMAIL_PATTERN.test(body.email)
    ) {
      fields.email = "Invalid e-mail address";
    }
  }
  if (Object.keys(fields).length > 0) throw validationError(fields);

  return {
    screeningId: body.screeningId,
    seatIds: body.seatIds,
    childTickets,
    wheelchairSpaces,
    email: isCustomer ? null : body.email.toLowerCase(),
  };
}

function validatePaymentBody(body, canOmitEmail) {
  if (!body || typeof body !== "object" || Array.isArray(body)) body = {};

  const fields = {};
  if (body.email === undefined && !canOmitEmail) {
    fields.email = "Invalid e-mail address";
  } else if (
    body.email !== undefined &&
    (typeof body.email !== "string" ||
      body.email.length > 254 ||
      !EMAIL_PATTERN.test(body.email))
  ) {
    fields.email = "Invalid e-mail address";
  }
  if (body.acceptNoRefund !== true) {
    fields.acceptNoRefund = "Confirm that paid tickets cannot be refunded";
  }
  if (Object.keys(fields).length > 0) throw validationError(fields);

  return { email: body.email?.toLowerCase() ?? null };
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
  userId,
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
        userId,
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

function toBookingResponse(booking, seats, includePaidAt = false) {
  const response = {
    id: booking.id,
    reference: booking.reference,
    status: booking.response_status ?? booking.status,
    screeningId: booking.screening_id,
    email: booking.response_email ?? booking.user_email ?? booking.guest_email,
    holdExpiresAt: booking.hold_expires_at
      ? new Date(booking.hold_expires_at).toISOString()
      : null,
    paymentDeadline: booking.payment_deadline
      ? new Date(booking.payment_deadline).toISOString()
      : null,
    seats: seats
      .filter((seat) => seat.seat_id !== null)
      .map((seat) => ({
        id: seat.seat_id,
        rowNumber: seat.row_number,
        seatNumber: seat.seat_number,
        ticketType: seat.ticket_type,
        price: Number(seat.ticket_price),
      })),
    wheelchairSpaces: seats.filter((seat) => seat.is_wheelchair).length,
    totalPrice: Number(booking.total_price),
  };
  if (includePaidAt) {
    response.paidAt = booking.paid_at
      ? new Date(booking.paid_at).toISOString()
      : null;
  }
  return response;
}

// The last `childTickets` seats become child tickets; seats are interchangeable for pricing.
function buildTickets(seatIds, childTickets, wheelchairSpaces, prices) {
  const firstChildIndex = seatIds.length - childTickets;
  const seatTickets = seatIds.map((seatId, index) => {
    const ticketType = index < firstChildIndex ? "adult" : "child";
    return { seatId, isWheelchair: false, ticketType, price: prices[ticketType] };
  });
  const wheelchairTickets = Array.from({ length: wheelchairSpaces }, () => ({
    seatId: null,
    isWheelchair: true,
    ticketType: "adult",
    price: prices.adult,
  }));
  return [...seatTickets, ...wheelchairTickets];
}

export async function createBooking(body, user) {
  const userId = user?.role === "customer" ? user.id : null;
  const { screeningId, seatIds, childTickets, wheelchairSpaces, email } =
    validateBookingBody(body, userId !== null);
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
      if (wheelchairSpaces > 0) await lockScreening(client, screeningId);

      const expiredBookingIds = await expireExpiredScreeningBookings(
        client,
        screeningId,
      );
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

      if (wheelchairSpaces > 0) {
        const taken = await countTakenWheelchairSpaces(client, screeningId);
        const available = Math.max(screening.wheelchair_spaces - taken, 0);
        if (wheelchairSpaces > available) {
          throw new BookingsServiceError(
            409,
            "WHEELCHAIR_SPACES_UNAVAILABLE",
            "Not enough wheelchair spaces are left.",
            { available },
          );
        }
      }

      const tickets = buildTickets(
        seatIds,
        childTickets,
        wheelchairSpaces,
        ticketPrices(screening.base_price, screening.is_premiere),
      );
      const booking = await insertBookingWithReference(
        client,
        screeningId,
        userId,
        email,
        totalPrice(tickets.map((ticket) => ticket.price)),
      );
      try {
        await insertTickets(client, booking.id, screeningId, tickets);
      } catch (error) {
        if (error.code === "23505") throw new TicketInsertConflict();
        throw error;
      }

      const rows = await findBookingResponseById(client, booking.id);
      await client.query("COMMIT");
      return toBookingResponse(rows[0], rows);
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

function customerId(user) {
  return user?.role === "customer" ? user.id : null;
}

export async function getBooking(reference, email, user) {
  const rows = await findBookingByReferenceAndAccess(
    reference,
    email,
    customerId(user),
  );
  if (rows.length === 0) {
    throw new BookingsServiceError(
      404,
      "BOOKING_NOT_FOUND",
      "The requested booking was not found.",
    );
  }
  return toBookingResponse(rows[0], rows, true);
}

export async function payBooking(reference, body, user) {
  const ownerId = customerId(user);
  const { email } = validatePaymentBody(body, ownerId !== null);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const booking = await lockBookingForPayment(
      client,
      reference,
      email,
      ownerId,
    );
    if (!booking) {
      throw new BookingsServiceError(
        404,
        "BOOKING_NOT_FOUND",
        "The requested booking was not found.",
      );
    }

    if (booking.status === "paid") {
      const rows = await findBookingResponseById(client, booking.id);
      await client.query("COMMIT");
      return toBookingResponse(rows[0], rows, true);
    }

    if (
      booking.status === "reserved" &&
      booking.reservation_expired
    ) {
      throw new BookingsServiceError(
        409,
        "RESERVATION_EXPIRED",
        "The reservation payment deadline has passed.",
      );
    }

    if (
      (booking.status !== "held" && booking.status !== "reserved") ||
      (booking.status === "held" && booking.hold_expired)
    ) {
      throw new BookingsServiceError(
        409,
        "HOLD_EXPIRED",
        "The booking hold has expired.",
      );
    }

    if (await isScreeningSalesClosed(client, booking.screening_id)) {
      throw new BookingsServiceError(
        409,
        "SALES_CLOSED",
        "Sales for this screening have closed.",
      );
    }

    await client.query(
      "UPDATE bookings SET status = 'paid' WHERE id = $1",
      [booking.id],
    );
    await client.query(
      `INSERT INTO payments (booking_id, method, amount, paid_at)
       VALUES ($1, 'online', $2, now())`,
      [booking.id, booking.total_price],
    );

    const rows = await findBookingResponseById(client, booking.id);
    await client.query("COMMIT");
    return toBookingResponse(rows[0], rows, true);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function reserveBooking(reference, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      const booking = await lockBookingForReservation(client, reference);
      if (!booking || booking.user_id !== userId) {
        throw new BookingsServiceError(
          404,
          "BOOKING_NOT_FOUND",
          "The requested booking was not found.",
        );
      }

      if (booking.status === "reserved") {
        if (booking.reservation_expired) {
          throw new BookingsServiceError(
            409,
            "RESERVATION_EXPIRED",
            "The reservation payment deadline has passed.",
          );
        }
        const rows = await findBookingResponseById(client, booking.id);
        await client.query("COMMIT");
        return toBookingResponse(rows[0], rows, true);
      }

      if (booking.status === "paid") {
        throw new BookingsServiceError(
          409,
          "BOOKING_ALREADY_PAID",
          "The booking has already been paid.",
        );
      }

      if (booking.status !== "held" || booking.hold_expired) {
        throw new BookingsServiceError(
          409,
          "HOLD_EXPIRED",
          "The booking hold has expired.",
        );
      }

      if (booking.sales_closed) {
        throw new BookingsServiceError(
          409,
          "SALES_CLOSED",
          "Sales for this screening have closed.",
        );
      }

      if (booking.reservation_closed) {
        throw new BookingsServiceError(
          409,
          "RESERVATION_CLOSED",
          "Reservations close 2 hours before the screening. Pay now instead.",
        );
      }

      await updateBookingReservation(client, booking.id);
      const rows = await findBookingResponseById(client, booking.id);
      await client.query("COMMIT");
      return toBookingResponse(rows[0], rows, true);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
  }
}

export async function getMyBookings(userId) {
  const rows = await findBookingsForCustomer(userId);
  const bookingsById = new Map();
  for (const row of rows) {
    let booking = bookingsById.get(row.id);
    if (!booking) {
      booking = {
        upcoming: row.is_upcoming,
        item: {
          reference: row.reference,
          status: row.response_status,
          paymentDeadline: row.payment_deadline
            ? new Date(row.payment_deadline).toISOString()
            : null,
          paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
          seats: [],
          wheelchairSpaces: 0,
          totalPrice: Number(row.total_price),
          screening: {
            id: row.screening_id,
            startsAt: new Date(row.starts_at).toISOString(),
            movie: {
              id: row.movie_id,
              title: row.movie_title,
              posterUrl: row.poster_url,
            },
            theatre: { name: row.theatre_name, city: row.theatre_city },
            hall: { name: row.hall_name },
          },
        },
      };
      bookingsById.set(row.id, booking);
    }
    if (row.is_wheelchair) booking.item.wheelchairSpaces += 1;
    if (row.seat_id !== null) {
      booking.item.seats.push({
        id: row.seat_id,
        rowNumber: row.row_number,
        seatNumber: row.seat_number,
        ticketType: row.ticket_type,
        price: Number(row.ticket_price),
      });
    }
  }

  const result = { upcoming: [], past: [] };
  for (const booking of bookingsById.values()) {
    result[booking.upcoming ? "upcoming" : "past"].push(booking.item);
  }
  return result;
}
