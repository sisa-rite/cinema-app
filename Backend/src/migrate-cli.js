import "dotenv/config";
import pool from "./db.js";
import { migrate } from "./migrate.js";

try {
  await migrate();
  console.log("Migrations are up to date");
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
