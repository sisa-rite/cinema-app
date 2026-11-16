import pool from "../../db.js";

const MOVIE_SELECT = `SELECT movie.id, movie.title, movie.description,
         movie.duration_minutes, movie.genre, movie.age_rating,
         movie.poster_url, movie.trailer_url, movie.published,
         (SELECT COUNT(*)::integer
          FROM screenings
          WHERE screenings.movie_id = movie.id
            AND screenings.starts_at > NOW()) AS upcoming_screenings
  FROM movies AS movie`;

export async function listAdminMovies() {
  const { rows } = await pool.query(`${MOVIE_SELECT} ORDER BY movie.title`);
  return rows;
}

export async function findAdminMovie(id) {
  const { rows } = await pool.query(`${MOVIE_SELECT} WHERE movie.id = $1`, [
    id,
  ]);
  return rows[0] ?? null;
}

export async function insertAdminMovie({
  title,
  description,
  durationMinutes,
  genre,
  ageRating,
  posterUrl,
  trailerUrl,
  published,
}) {
  const { rows } = await pool.query(
    `INSERT INTO movies
       (title, description, duration_minutes, genre, age_rating,
        poster_url, trailer_url, published)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      title,
      description,
      durationMinutes,
      genre,
      ageRating,
      posterUrl,
      trailerUrl,
      published,
    ],
  );
  return rows[0].id;
}

export async function updateAdminMovie(id, fields) {
  const columnNames = {
    title: "title",
    description: "description",
    durationMinutes: "duration_minutes",
    genre: "genre",
    ageRating: "age_rating",
    posterUrl: "poster_url",
    trailerUrl: "trailer_url",
    published: "published",
  };
  const entries = Object.entries(fields);
  const assignments = entries.map(
    ([field], index) => `${columnNames[field]} = $${index + 2}`,
  );
  const values = entries.map(([, value]) => value);
  const { rowCount } = await pool.query(
    `UPDATE movies
     SET ${assignments.join(", ")}
     WHERE id = $1`,
    [id, ...values],
  );
  return rowCount > 0;
}
