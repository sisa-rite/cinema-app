import pool from "../../db.js";

export async function listPublishedMovies(city) {
  const { rows } = await pool.query(
    `SELECT m.id, m.title, m.description, m.duration_minutes,
            m.genre, m.age_rating, m.poster_url
     FROM movies AS m
     WHERE m.published = true
       AND EXISTS (
         SELECT 1
         FROM screenings AS s
         JOIN halls AS h ON h.id = s.hall_id
         JOIN theatres AS t ON t.id = h.theatre_id
         WHERE s.movie_id = m.id
           AND s.published = true
           AND s.starts_at > NOW()
           AND LOWER(t.city) = $1
       )
     ORDER BY m.title`,
    [city],
  );
  return rows;
}

export async function findPublishedMovie(id) {
  const { rows } = await pool.query(
    `SELECT id, title, description, duration_minutes, genre,
            age_rating, poster_url, trailer_url
     FROM movies
     WHERE id = $1 AND published = true`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listUpcomingScreenings(movieId, city) {
  const { rows } = await pool.query(
    `SELECT s.id, s.starts_at, t.name AS theatre_name,
            h.name AS hall_name, s.base_price, s.is_premiere
     FROM screenings AS s
     JOIN halls AS h ON h.id = s.hall_id
     JOIN theatres AS t ON t.id = h.theatre_id
     WHERE s.movie_id = $1
       AND s.published = true
       AND s.starts_at > NOW()
       AND LOWER(t.city) = $2
     ORDER BY s.starts_at`,
    [movieId, city],
  );
  return rows;
}
