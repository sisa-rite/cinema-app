import pool from "../../db.js";

export async function listHalls() {
  const { rows } = await pool.query(
    `SELECT hall.id, hall.name,
            COUNT(seat.id) FILTER (
              WHERE seat.type IN ('normal', 'owner')
            )::integer AS seats,
            theatre.id AS theatre_id, theatre.name AS theatre_name,
            LOWER(theatre.city) AS theatre_city
     FROM halls AS hall
     JOIN theatres AS theatre ON theatre.id = hall.theatre_id
     LEFT JOIN seats AS seat ON seat.hall_id = hall.id
     GROUP BY hall.id, theatre.id
     ORDER BY theatre.name, hall.name`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    seats: row.seats,
    theatre: {
      id: row.theatre_id,
      name: row.theatre_name,
      city: row.theatre_city,
    },
  }));
}
