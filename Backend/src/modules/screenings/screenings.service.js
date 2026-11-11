import { findPublishedScreeningSeats } from "./screenings.db.js";

export class ScreeningsServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function getScreeningSeats(id) {
  if (typeof id !== "string" || !/^[1-9]\d*$/.test(id)) {
    throw new ScreeningsServiceError(
      400,
      "INVALID_ID",
      "Screening id must be a positive integer.",
    );
  }

  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId)) {
    throw new ScreeningsServiceError(
      400,
      "INVALID_ID",
      "Screening id must be a positive integer.",
    );
  }

  const rows = await findPublishedScreeningSeats(numericId);
  if (rows.length === 0) {
    throw new ScreeningsServiceError(
      404,
      "SCREENING_NOT_FOUND",
      "The requested screening was not found.",
    );
  }

  const row = rows[0];
  return {
    screening: {
      id: row.screening_id,
      startsAt: new Date(row.starts_at).toISOString(),
      basePrice: Number(row.base_price),
      isPremiere: row.is_premiere,
      movie: {
        id: row.movie_id,
        title: row.movie_title,
        durationMinutes: row.duration_minutes,
        ageRating: row.age_rating,
        posterUrl: row.poster_url,
      },
      theatre: {
        name: row.theatre_name,
        city: row.theatre_city,
      },
      hall: {
        id: row.hall_id,
        name: row.hall_name,
        totalRows: row.total_rows,
        seatsPerRow: row.seats_per_row,
      },
    },
    seats: rows
      .filter((seat) => seat.seat_id !== null)
      .map((seat) => ({
        id: seat.seat_id,
        rowNumber: seat.row_number,
        seatNumber: seat.seat_number,
        posX: seat.pos_x,
        posY: seat.pos_y,
        state: seat.state,
      })),
  };
}
