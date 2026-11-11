import pool from "../db.js";

export async function expireHolds() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE bookings
       SET status = 'expired'
       WHERE status = 'held'
         AND hold_expires_at <= now()
       RETURNING id`,
    );
    const bookingIds = rows.map(({ id }) => id);

    if (bookingIds.length > 0) {
      await client.query(
        "DELETE FROM tickets WHERE booking_id = ANY($1::integer[])",
        [bookingIds],
      );
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
      const expiredCount = await expireHolds();
      if (expiredCount > 0) {
        console.log(`Expired ${expiredCount} seat holds`);
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
