import pool from "../../db.js";

const SCREENING_SELECT = `SELECT screening.id, screening.starts_at,
         screening.base_price, screening.is_premiere, screening.published,
         movie.id AS movie_id, movie.title AS movie_title,
         movie.duration_minutes, movie.published AS movie_published,
         hall.id AS hall_id, hall.name AS hall_name,
         theatre.id AS theatre_id, theatre.name AS theatre_name,
         LOWER(theatre.city) AS theatre_city,
         COUNT(ticket.id) FILTER (
           WHERE booking.status = 'paid'
             AND seat.type IS DISTINCT FROM 'owner'
         )::integer AS tickets_sold,
         COUNT(ticket.id) FILTER (
           WHERE booking.status = 'held'
             AND booking.hold_expires_at > NOW()
             AND seat.type IS DISTINCT FROM 'owner'
         )::integer AS tickets_held
  FROM screenings AS screening
  JOIN movies AS movie ON movie.id = screening.movie_id
  JOIN halls AS hall ON hall.id = screening.hall_id
  JOIN theatres AS theatre ON theatre.id = hall.theatre_id
  LEFT JOIN tickets AS ticket ON ticket.screening_id = screening.id
  LEFT JOIN seats AS seat ON seat.id = ticket.seat_id
  LEFT JOIN bookings AS booking
    ON booking.id = ticket.booking_id
   AND booking.screening_id = screening.id`;

const SCREENING_GROUP_BY = `GROUP BY screening.id, movie.id, hall.id, theatre.id`;

export async function listAdminScreenings({ from, to, theatreId }) {
  const values = [from, to];
  let theatreFilter = "";
  if (theatreId !== undefined) {
    values.push(theatreId);
    theatreFilter = `AND theatre.id = $${values.length}`;
  }
  const { rows } = await pool.query(
    `${SCREENING_SELECT}
     WHERE screening.starts_at >= ($1::date::timestamp AT TIME ZONE 'Europe/Helsinki')
       AND screening.starts_at < (($2::date + 1)::timestamp AT TIME ZONE 'Europe/Helsinki')
       ${theatreFilter}
     ${SCREENING_GROUP_BY}
     ORDER BY screening.starts_at`,
    values,
  );
  return rows;
}

export async function findAdminScreening(id, client = pool) {
  const { rows } = await client.query(
    `${SCREENING_SELECT}
     WHERE screening.id = $1
     ${SCREENING_GROUP_BY}`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findMovie(id, client = pool) {
  const { rows } = await client.query(
    "SELECT id, duration_minutes, published FROM movies WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function hallExists(id, client = pool) {
  const { rows } = await client.query("SELECT id FROM halls WHERE id = $1", [
    id,
  ]);
  return rows.length > 0;
}

export async function findOverlappingScreenings(
  hallId,
  startsAt,
  durationMinutes,
  ignoredId,
  client = pool,
) {
  const { rows } = await client.query(
    `SELECT screening.id
     FROM screenings AS screening
     JOIN movies AS movie ON movie.id = screening.movie_id
     WHERE screening.hall_id = $1
       AND ($4::integer IS NULL OR screening.id <> $4)
       AND tstzrange(
             screening.starts_at - INTERVAL '12 minutes',
             screening.starts_at
               + (movie.duration_minutes * INTERVAL '1 minute')
           )
           &&
           tstzrange(
             $2::timestamptz - INTERVAL '12 minutes',
             $2::timestamptz
               + ($3::integer * INTERVAL '1 minute')
           )
     ORDER BY screening.starts_at`,
    [hallId, startsAt, durationMinutes, ignoredId],
  );
  return rows.map(({ id }) => id);
}

export async function insertScreening(
  client,
  { movieId, hallId, startsAt, basePrice, isPremiere, published },
) {
  const { rows } = await client.query(
    `INSERT INTO screenings
       (movie_id, hall_id, starts_at, base_price, is_premiere, published)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [movieId, hallId, startsAt, basePrice, isPremiere, published],
  );
  return rows[0].id;
}

export async function findScreeningForUpdate(client, id) {
  const { rows } = await client.query(
    `SELECT screening.id, screening.movie_id, screening.hall_id,
            screening.starts_at, screening.base_price,
            screening.is_premiere, screening.published
     FROM screenings AS screening
     WHERE screening.id = $1
     FOR UPDATE`,
    [id],
  );
  return rows[0] ?? null;
}

export async function screeningHasTickets(client, id) {
  const { rows } = await client.query(
    "SELECT EXISTS (SELECT 1 FROM tickets WHERE screening_id = $1) AS has_tickets",
    [id],
  );
  return rows[0].has_tickets;
}

export async function updateScreeningFields(client, id, fields) {
  const columnNames = {
    movieId: "movie_id",
    hallId: "hall_id",
    startsAt: "starts_at",
    basePrice: "base_price",
    isPremiere: "is_premiere",
    published: "published",
  };
  const entries = Object.entries(fields);
  const assignments = entries.map(
    ([field], index) => `${columnNames[field]} = $${index + 2}`,
  );
  const values = entries.map(([, value]) => value);
  await client.query(
    `UPDATE screenings
     SET ${assignments.join(", ")}
     WHERE id = $1`,
    [id, ...values],
  );
}

export async function deleteScreeningBookingsWithoutTickets(client, id) {
  await client.query(
    `DELETE FROM bookings AS booking
     WHERE booking.screening_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM tickets AS ticket
         WHERE ticket.booking_id = booking.id
       )`,
    [id],
  );
}

export async function deleteScreeningRow(client, id) {
  await client.query("DELETE FROM screenings WHERE id = $1", [id]);
}
