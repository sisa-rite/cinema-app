import pool from "../../db.js";

export async function findPublishedScreeningSeats(id) {
  const { rows } = await pool.query(
    `SELECT s.id AS screening_id, s.starts_at, s.base_price, s.is_premiere,
            m.id AS movie_id, m.title AS movie_title,
            m.duration_minutes, m.age_rating, m.poster_url,
            t.name AS theatre_name, LOWER(t.city) AS theatre_city,
            h.id AS hall_id, h.name AS hall_name,
            h.total_rows, h.seats_per_row,
            seat.id AS seat_id, seat.row_number, seat.seat_number,
            seat.pos_x, seat.pos_y,
            CASE
              WHEN seat.type = 'owner' THEN 'owner'
              WHEN seat.type = 'blocked' THEN 'blocked'
              WHEN b.status = 'paid'
                OR (b.status = 'reserved' AND b.payment_deadline > NOW())
                THEN 'sold'
              WHEN b.status = 'held' AND b.hold_expires_at > NOW()
                THEN 'held'
              ELSE 'available'
            END AS state
     FROM screenings AS s
     JOIN movies AS m ON m.id = s.movie_id
     JOIN halls AS h ON h.id = s.hall_id
     JOIN theatres AS t ON t.id = h.theatre_id
     LEFT JOIN seats AS seat ON seat.hall_id = h.id
     LEFT JOIN tickets AS ticket
       ON ticket.screening_id = s.id AND ticket.seat_id = seat.id
     LEFT JOIN bookings AS b
       ON b.id = ticket.booking_id AND b.screening_id = s.id
     WHERE s.id = $1 AND s.published = true
     ORDER BY seat.pos_y, seat.pos_x`,
    [id],
  );
  return rows;
}
