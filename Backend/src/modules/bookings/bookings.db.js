import pool from "../../db.js";

export async function findPublishedScreening(id) {
  const { rows } = await pool.query(
    `SELECT s.id, s.hall_id, s.base_price, s.is_premiere,
            s.starts_at <= NOW() AS sales_closed,
            h.wheelchair_spaces
     FROM screenings AS s
     JOIN movies AS m ON m.id = s.movie_id
     JOIN halls AS h ON h.id = s.hall_id
     WHERE s.id = $1 AND s.published = true AND m.published = true`,
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

// Wheelchair tickets have no seat, so the unique seat index cannot protect them;
// locking the screening makes concurrent wheelchair bookings wait for each other.
export async function lockScreening(client, screeningId) {
  await client.query("SELECT id FROM screenings WHERE id = $1 FOR UPDATE", [
    screeningId,
  ]);
}

export async function countTakenWheelchairSpaces(client, screeningId) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::integer AS taken
     FROM tickets AS ticket
     JOIN bookings AS booking ON booking.id = ticket.booking_id
     WHERE ticket.screening_id = $1
       AND ticket.is_wheelchair
       AND (
         booking.status = 'paid'
         OR (booking.status = 'reserved' AND booking.payment_deadline > NOW())
         OR (booking.status = 'held' AND booking.hold_expires_at > NOW())
       )`,
    [screeningId],
  );
  return rows[0].taken;
}

export async function insertBooking(
  client,
  screeningId,
  userId,
  email,
  totalPrice,
  reference,
) {
  const { rows } = await client.query(
    `INSERT INTO bookings
       (reference, user_id, guest_email, screening_id, status,
        hold_expires_at, total_price)
     VALUES ($1, $2, $3, $4, 'held', NOW() + INTERVAL '15 minutes', $5)
     RETURNING id, reference, status, screening_id, guest_email,
               user_id, hold_expires_at, payment_deadline, total_price`,
    [reference, userId, email, screeningId, totalPrice],
  );
  return rows[0];
}

export async function insertTickets(client, bookingId, screeningId, tickets) {
  for (const ticket of tickets) {
    await client.query(
      `INSERT INTO tickets
         (booking_id, screening_id, seat_id, is_wheelchair, ticket_type, price)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        bookingId,
        screeningId,
        ticket.seatId,
        ticket.isWheelchair,
        ticket.ticketType,
        ticket.price,
      ],
    );
  }
}

export async function findBookingByReferenceAndAccess(reference, email, userId) {
  const { rows } = await pool.query(
    `SELECT booking.id, booking.reference, booking.status,
            CASE
              WHEN booking.status = 'held'
               AND booking.hold_expires_at <= NOW()
                THEN 'expired'
              WHEN booking.status = 'reserved'
               AND booking.payment_deadline <= NOW()
                THEN 'expired'
              ELSE booking.status
            END AS response_status,
            booking.screening_id, booking.guest_email, booking.user_id,
            account.email AS user_email,
            COALESCE(account.email, booking.guest_email) AS response_email,
            booking.hold_expires_at, booking.payment_deadline,
            booking.total_price,
            payment.paid_at,
            ticket.seat_id, ticket.is_wheelchair, ticket.ticket_type,
            ticket.price AS ticket_price,
            seat.row_number, seat.seat_number
     FROM bookings AS booking
     LEFT JOIN users AS account ON account.id = booking.user_id
     LEFT JOIN tickets AS ticket ON ticket.booking_id = booking.id
     LEFT JOIN seats AS seat ON seat.id = ticket.seat_id
     LEFT JOIN payments AS payment ON payment.booking_id = booking.id
     WHERE booking.reference = $1
       AND (
         LOWER(COALESCE(account.email, booking.guest_email)) = LOWER($2::text)
         OR ($3::integer IS NOT NULL AND booking.user_id = $3)
       )
     ORDER BY seat.row_number NULLS LAST, seat.seat_number NULLS LAST`,
    [reference, email ?? null, userId ?? null],
  );
  return rows;
}

export async function lockBookingForPayment(client, reference, email, userId) {
  const { rows } = await client.query(
    `SELECT booking.id, booking.reference, booking.status,
            booking.screening_id, booking.guest_email, booking.user_id,
            account.email AS user_email,
            COALESCE(account.email, booking.guest_email) AS response_email,
            booking.hold_expires_at, booking.payment_deadline,
            booking.total_price,
            booking.hold_expires_at <= now() AS hold_expired
     FROM bookings AS booking
     LEFT JOIN users AS account ON account.id = booking.user_id
     WHERE booking.reference = $1
       AND (
         LOWER(COALESCE(account.email, booking.guest_email)) = LOWER($2::text)
         OR ($3::integer IS NOT NULL AND booking.user_id = $3)
       )
     FOR UPDATE OF booking`,
    [reference, email ?? null, userId ?? null],
  );
  return rows[0] ?? null;
}

export async function isScreeningSalesClosed(client, screeningId) {
  const { rows } = await client.query(
    "SELECT starts_at <= now() AS sales_closed FROM screenings WHERE id = $1",
    [screeningId],
  );
  if (!rows[0]) throw new Error("The booking screening was not found.");
  return rows[0].sales_closed;
}

export async function findBookingResponseById(client, bookingId) {
  const { rows } = await client.query(
    `SELECT booking.id, booking.reference, booking.status,
            booking.screening_id, booking.guest_email, booking.user_id,
            account.email AS user_email,
            COALESCE(account.email, booking.guest_email) AS response_email,
            booking.hold_expires_at, booking.payment_deadline,
            booking.total_price,
            payment.paid_at,
            ticket.seat_id, ticket.is_wheelchair, ticket.ticket_type,
            ticket.price AS ticket_price,
            seat.row_number, seat.seat_number
     FROM bookings AS booking
     LEFT JOIN users AS account ON account.id = booking.user_id
     LEFT JOIN tickets AS ticket ON ticket.booking_id = booking.id
     LEFT JOIN seats AS seat ON seat.id = ticket.seat_id
     LEFT JOIN payments AS payment ON payment.booking_id = booking.id
     WHERE booking.id = $1
     ORDER BY seat.row_number NULLS LAST, seat.seat_number NULLS LAST`,
    [bookingId],
  );
  return rows;
}

export async function findBookingsForCustomer(userId) {
  const { rows } = await pool.query(
    `WITH eligible AS (
       SELECT booking.id, booking.reference,
              CASE
                WHEN booking.status = 'reserved'
                 AND booking.payment_deadline <= NOW()
                  THEN 'expired'
                ELSE booking.status
              END AS response_status,
              booking.payment_deadline, payment.paid_at,
              booking.total_price, screening.id AS screening_id,
              screening.starts_at,
              movie.id AS movie_id, movie.title AS movie_title,
              movie.poster_url,
              theatre.name AS theatre_name, LOWER(theatre.city) AS theatre_city,
              hall.name AS hall_name
       FROM bookings AS booking
       JOIN screenings AS screening ON screening.id = booking.screening_id
       JOIN movies AS movie ON movie.id = screening.movie_id
       JOIN halls AS hall ON hall.id = screening.hall_id
       JOIN theatres AS theatre ON theatre.id = hall.theatre_id
       LEFT JOIN payments AS payment ON payment.booking_id = booking.id
       WHERE booking.user_id = $1
         AND (
           booking.status IN ('reserved', 'paid', 'cancelled')
           OR (booking.status = 'expired' AND booking.payment_deadline IS NOT NULL)
         )
     ),
     selected AS (
       SELECT * FROM eligible WHERE starts_at > NOW()
       UNION ALL
       SELECT * FROM (
         SELECT * FROM eligible
         WHERE starts_at <= NOW()
         ORDER BY starts_at DESC, id
         LIMIT 50
       ) AS past
     )
     SELECT selected.*,
            ticket.seat_id, ticket.is_wheelchair, ticket.ticket_type,
            ticket.price AS ticket_price,
            seat.row_number, seat.seat_number,
            selected.starts_at > NOW() AS is_upcoming
     FROM selected
     LEFT JOIN tickets AS ticket
       ON ticket.booking_id = selected.id
      AND selected.response_status NOT IN ('cancelled', 'expired')
     LEFT JOIN seats AS seat ON seat.id = ticket.seat_id
     ORDER BY
       CASE WHEN selected.starts_at > NOW() THEN 0 ELSE 1 END,
       CASE WHEN selected.starts_at > NOW() THEN selected.starts_at END ASC,
       CASE WHEN selected.starts_at <= NOW() THEN selected.starts_at END DESC,
       selected.id,
       seat.row_number NULLS LAST,
       seat.seat_number NULLS LAST`,
    [userId],
  );
  return rows;
}
