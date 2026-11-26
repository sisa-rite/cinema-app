import pool from "../db.js";
import { deleteTicketsForBookings } from "../modules/bookings/bookings.db.js";

export async function expireBookings() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE bookings
       SET status = 'expired'
       WHERE (status = 'held' AND hold_expires_at <= now())
          OR (status = 'reserved' AND payment_deadline <= now())
       RETURNING id`,
    );
    const bookingIds = rows.map(({ id }) => id);

    if (bookingIds.length > 0) {
      await deleteTicketsForBookings(client, bookingIds);
    }

    await client.query("COMMIT");
    return bookingIds.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function startExpiryJob({ intervalMs = 60_000 } = {}) {
  let running = false;

  async function run() {
    if (running) return;
    running = true;
    try {
      const expiredCount = await expireBookings();
      if (expiredCount > 0) {
        console.log(`Expired ${expiredCount} holds and reservations`);
      }
    } catch (error) {
      console.error("Expiry job failed:", error);
    } finally {
      running = false;
    }
  }

  void run();
  return setInterval(run, intervalMs);
}
