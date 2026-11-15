import pool from "../../db.js";
import {
  deleteScreeningBookingsWithoutTickets,
  deleteScreeningRow,
  findAdminScreening,
  findMovie,
  findOverlappingScreenings,
  findScreeningForUpdate,
  hallExists,
  insertScreening,
  listAdminScreenings,
  screeningHasTickets,
  updateScreeningFields,
} from "./adminScreenings.db.js";
import { listHalls as listAdminHalls } from "./adminHalls.db.js";

const ZONED_ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2}))$/i;

export class AdminScreeningsServiceError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

function validationError(fields) {
  return new AdminScreeningsServiceError(
    400,
    "VALIDATION_ERROR",
    "Request validation failed.",
    { fields },
  );
}

function positiveId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isValidPrice(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (value < 0 || value > 100) return false;
  const [coefficient, exponentText] = value.toString().toLowerCase().split("e");
  const decimalPlaces = Math.max(
    0,
    (coefficient.split(".")[1]?.length ?? 0) - Number(exponentText ?? 0),
  );
  return decimalPlaces <= 2;
}

function parseStartsAt(value) {
  if (typeof value !== "string") return null;
  const match = ZONED_ISO_PATTERN.exec(value);
  if (!match) return null;
  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    zone,
    offsetHour,
    offsetMinute,
  ] = match;
  if (
    !parseDate(`${year}-${month}-${day}`) ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second ?? 0) > 59 ||
    (zone.toUpperCase() !== "Z" &&
      (Number(offsetHour) > 23 || Number(offsetMinute) > 59))
  ) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return null;
  return new Date(timestamp).toISOString();
}

function validateScreeningFields(body, { creating = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
  const fields = {};
  const values = {};

  for (const field of ["movieId", "hallId"]) {
    if (creating || Object.hasOwn(body, field)) {
      if (!positiveId(body[field])) {
        fields[field] = "Must be a positive integer";
      } else {
        values[field] = body[field];
      }
    }
  }

  if (creating || Object.hasOwn(body, "startsAt")) {
    const startsAt = parseStartsAt(body.startsAt);
    if (!startsAt) {
      fields.startsAt =
        "Must be a future ISO 8601 date and time with a time zone";
    } else {
      values.startsAt = startsAt;
    }
  }

  if (creating || Object.hasOwn(body, "basePrice")) {
    if (!isValidPrice(body.basePrice)) {
      fields.basePrice = "Must be a number from 0 to 100 with at most 2 decimals";
    } else {
      values.basePrice = body.basePrice;
    }
  }

  for (const field of ["isPremiere", "published"]) {
    if (Object.hasOwn(body, field)) {
      if (typeof body[field] !== "boolean") {
        fields[field] = "Must be a boolean";
      } else {
        values[field] = body[field];
      }
    }
  }

  if (creating) {
    values.isPremiere ??= false;
    values.published ??= false;
  }

  if (Object.keys(fields).length > 0) throw validationError(fields);
  return values;
}

function parsePathId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw validationError({ id: "Must be a positive integer" });
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    throw validationError({ id: "Must be a positive integer" });
  }
  return id;
}

function parseDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number(value.slice(0, 4)) < 1
  ) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

function helsinkiToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date, days) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function validateDateRange(query) {
  const today = helsinkiToday();
  const from = query.from === undefined ? today : query.from;
  const fields = {};
  const fromDate = parseDate(from);
  const to =
    query.to === undefined
      ? addDays(fromDate ? from : today, 13)
      : query.to;
  const toDate = parseDate(to);

  if (!fromDate) fields.from = "Must be a valid date in YYYY-MM-DD format";
  if (!toDate) fields.to = "Must be a valid date in YYYY-MM-DD format";
  if (fromDate && toDate) {
    const dayCount = (toDate - fromDate) / 86_400_000 + 1;
    if (dayCount < 1) fields.to = "Must be on or after from";
    else if (dayCount > 62) fields.to = "The date range cannot exceed 62 days";
  }
  let theatreId;
  if (query.theatreId !== undefined) {
    if (!/^[1-9]\d*$/.test(query.theatreId)) {
      fields.theatreId = "Must be a positive integer";
    } else {
      theatreId = Number(query.theatreId);
      if (!Number.isSafeInteger(theatreId)) {
        fields.theatreId = "Must be a positive integer";
      }
    }
  }
  if (Object.keys(fields).length > 0) throw validationError(fields);
  return { from, to, theatreId };
}

function toScreeningResponse(row) {
  const startsAt = new Date(row.starts_at);
  const durationMinutes = Number(row.duration_minutes);
  return {
    id: row.id,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000).toISOString(),
    basePrice: Number(row.base_price),
    isPremiere: row.is_premiere,
    published: row.published,
    movie: {
      id: row.movie_id,
      title: row.movie_title,
      durationMinutes,
      published: row.movie_published,
    },
    hall: { id: row.hall_id, name: row.hall_name },
    theatre: {
      id: row.theatre_id,
      name: row.theatre_name,
      city: row.theatre_city,
    },
    ticketsSold: row.tickets_sold,
    ticketsHeld: row.tickets_held,
  };
}

function serviceError(status, code, message) {
  return new AdminScreeningsServiceError(status, code, message);
}

function validatePriceBeforePublishing(published, basePrice) {
  if (published && Number(basePrice) === 0) {
    throw validationError({
      basePrice: "Set a price greater than 0 € before publishing",
    });
  }
}

async function validateReferences(client, values) {
  const movie = await findMovie(values.movieId, client);
  if (!movie) {
    throw serviceError(
      404,
      "MOVIE_NOT_FOUND",
      "The requested movie was not found.",
    );
  }
  if (!(await hallExists(values.hallId, client))) {
    throw serviceError(404, "NOT_FOUND", "The requested hall was not found.");
  }
  if (values.published && !movie.published) {
    throw serviceError(
      409,
      "MOVIE_NOT_PUBLISHED",
      "The movie must be published before its screening.",
    );
  }
  return movie;
}

async function ensureNoOverlap(client, values, durationMinutes, ignoredId) {
  const screeningIds = await findOverlappingScreenings(
    values.hallId,
    values.startsAt,
    durationMinutes,
    ignoredId,
    client,
  );
  if (screeningIds.length > 0) {
    throw new AdminScreeningsServiceError(
      409,
      "SCREENING_OVERLAP",
      "The hall is already in use at that time.",
      { screeningIds },
    );
  }
}

async function inTransaction(action) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
  }
}

export async function listScreenings(query = {}) {
  const range = validateDateRange(query);
  const rows = await listAdminScreenings(range);
  return rows.map(toScreeningResponse);
}

export async function listHalls() {
  return listAdminHalls();
}

export async function getScreening(pathId) {
  const id = parsePathId(pathId);
  const row = await findAdminScreening(id);
  if (!row) {
    throw serviceError(
      404,
      "SCREENING_NOT_FOUND",
      "The requested screening was not found.",
    );
  }
  return toScreeningResponse(row);
}

export async function createScreening(body) {
  const values = validateScreeningFields(body, { creating: true });
  validatePriceBeforePublishing(values.published, values.basePrice);
  return inTransaction(async (client) => {
    const movie = await validateReferences(client, values);
    await ensureNoOverlap(client, values, movie.duration_minutes, null);
    const id = await insertScreening(client, values);
    const row = await findAdminScreening(id, client);
    return toScreeningResponse(row);
  });
}

export async function updateScreening(pathId, body) {
  const id = parsePathId(pathId);
  const changes = validateScreeningFields(body);
  return inTransaction(async (client) => {
    const current = await findScreeningForUpdate(client, id);
    if (!current) {
      throw serviceError(
        404,
        "SCREENING_NOT_FOUND",
        "The requested screening was not found.",
      );
    }
    if (await screeningHasTickets(client, id)) {
      throw serviceError(
        409,
        "SCREENING_HAS_BOOKINGS",
        "The screening already has tickets and cannot be changed.",
      );
    }

    const values = {
      movieId: changes.movieId ?? current.movie_id,
      hallId: changes.hallId ?? current.hall_id,
      startsAt: changes.startsAt ?? new Date(current.starts_at).toISOString(),
      basePrice: changes.basePrice ?? Number(current.base_price),
      isPremiere: changes.isPremiere ?? current.is_premiere,
      published: changes.published ?? current.published,
    };
    validatePriceBeforePublishing(values.published, values.basePrice);
    const movie = await validateReferences(client, values);
    await ensureNoOverlap(client, values, movie.duration_minutes, id);
    if (Object.keys(changes).length > 0) {
      await updateScreeningFields(client, id, changes);
    }
    return toScreeningResponse(await findAdminScreening(id, client));
  });
}

export async function deleteScreening(pathId) {
  const id = parsePathId(pathId);
  await inTransaction(async (client) => {
    const current = await findScreeningForUpdate(client, id);
    if (!current) {
      throw serviceError(
        404,
        "SCREENING_NOT_FOUND",
        "The requested screening was not found.",
      );
    }
    if (await screeningHasTickets(client, id)) {
      throw serviceError(
        409,
        "SCREENING_HAS_BOOKINGS",
        "The screening already has tickets and cannot be deleted.",
      );
    }
    await deleteScreeningBookingsWithoutTickets(client, id);
    await deleteScreeningRow(client, id);
  });
}
