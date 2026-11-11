import pool from "../../db.js";

export async function findPublishedScreening(id) {
  const { rows } = await pool.query(
    `SELECT id, hall_id, base_price, starts_at <= NOW() AS sales_closed
     FROM screenings
     WHERE id = $1 AND published = true`,
    [id],
  );
  return rows[0] ?? null;
}

export async function expireScreeningHolds(client, screeningId) {
  const { rows } = await client.query(
    `UPDATE bookings
     SET status = 'expired'
     WHERE screening_id = $1
       AND status = 'held'
       AND hold_expires_at <= NOW()
     RETURNING id`,
    [screeningId],
  );
  return rows.map(({ id }) => id);
}

export async function deleteTicketsForBookings(client, bookingIds) {
  await client.query(
    "DELETE FROM tickets WHERE booking_id = ANY($1::integer[])",
    [bookingIds],
  );
}

export async function findRequestedSeats(
  client,
  screeningId,
  hallId,
  seatIds,
) {
  const { rows } = await client.query(
    `SELECT requested.seat_id AS id,
            seat.row_number,
            seat.seat_number,
            CASE
              WHEN seat.id IS NULL OR seat.type IN ('owner', 'blocked') THEN false
              WHEN booking.id IS NOT NULL THEN false
              ELSE true
            END AS available
     FROM unnest($3::integer[]) AS requested(seat_id)
     LEFT JOIN seats AS seat
       ON seat.id = requested.seat_id AND seat.hall_id = $2
     LEFT JOIN tickets AS ticket
       ON ticket.screening_id = $1 AND ticket.seat_id = seat.id
     LEFT JOIN bookings AS booking
       ON booking.id = ticket.booking_id
      AND booking.screening_id = ticket.screening_id
      AND (
        booking.status = 'paid'
        OR (booking.status = 'reserved' AND booking.payment_deadline > NOW())
        OR (booking.status = 'held' AND booking.hold_expires_at > NOW())
      )
     ORDER BY seat.row_number NULLS LAST, seat.seat_number NULLS LAST`,
    [screeningId, hallId, seatIds],
  );
  return rows;
}

export async function insertBooking(
  client,
  screeningId,
  email,
  totalPrice,
  reference,
) {
  const { rows } = await client.query(
    `INSERT INTO bookings
       (reference, guest_email, screening_id, status, hold_expires_at, total_price)
     VALUES ($1, $2, $3, 'held', NOW() + INTERVAL '15 minutes', $4)
     RETURNING id, reference, status, screening_id, guest_email,
               hold_expires_at, total_price`,
    [reference, email, screeningId, totalPrice],
  );
  return rows[0];
}

export async function insertTickets(
  client,
  bookingId,
  screeningId,
  seatIds,
  price,
) {
  for (const seatId of seatIds) {
    await client.query(
      `INSERT INTO tickets
         (booking_id, screening_id, seat_id, ticket_type, price)
       VALUES ($1, $2, $3, 'adult', $4)`,
      [bookingId, screeningId, seatId, price],
    );
  }
}

export async function findBookingByReferenceAndEmail(reference, email) {
  const { rows } = await pool.query(
    `SELECT booking.id, booking.reference, booking.status,
            CASE
              WHEN booking.status = 'held'
               AND booking.hold_expires_at <= NOW()
                THEN 'expired'
              ELSE booking.status
            END AS response_status,
            booking.screening_id, booking.guest_email,
            booking.hold_expires_at, booking.total_price,
            ticket.seat_id, seat.row_number, seat.seat_number
     FROM bookings AS booking
     LEFT JOIN tickets AS ticket ON ticket.booking_id = booking.id
     LEFT JOIN seats AS seat ON seat.id = ticket.seat_id
     WHERE booking.reference = $1
       AND LOWER(booking.guest_email) = LOWER($2)
     ORDER BY seat.row_number NULLS LAST, seat.seat_number NULLS LAST`,
    [reference, email],
  );
  return rows;
}
