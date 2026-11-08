import pool from "../../db.js";

export async function findUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, name, email, password_hash, role, theatre_id, active
     FROM users
     WHERE LOWER(email) = $1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function createUser({ name, email, passwordHash }) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'customer')
     RETURNING id, name, email, role, theatre_id`,
    [name, email, passwordHash],
  );
  return rows[0];
}

export async function findUserById(id) {
  const { rows } = await pool.query(
    `SELECT id, name, email, role, theatre_id, active
     FROM users
     WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}
