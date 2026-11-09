import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  createUser,
  findUserByEmail,
  findUserById,
} from "./auth.db.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_ROLES = new Set(["customer", "cashier", "admin"]);
const INVALID_CREDENTIALS_MESSAGE = "Invalid e-mail or password.";

export class AuthServiceError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

export function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET must be set before the authentication API can start.");
  }
  return process.env.JWT_SECRET;
}

function toUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    theatreId: row.theatre_id,
  };
}

function createToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      theatreId: user.theatre_id,
    },
    getJwtSecret(),
    { algorithm: "HS256", expiresIn: "8h" },
  );
}

function validationError(fields) {
  return new AuthServiceError(
    400,
    "VALIDATION_ERROR",
    "Request validation failed.",
    { fields },
  );
}

function invalidCredentials() {
  return new AuthServiceError(
    401,
    "INVALID_CREDENTIALS",
    INVALID_CREDENTIALS_MESSAGE,
  );
}

export async function register(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) body = {};

  const fields = {};
  const nameLength =
    typeof body.name === "string" ? Array.from(body.name).length : 0;
  if (
    typeof body.name !== "string" ||
    nameLength < 1 ||
    nameLength > 100 ||
    body.name.trim().length === 0
  ) {
    fields.name = "Name must be 1–100 characters";
  }
  if (typeof body.email !== "string" || !EMAIL_PATTERN.test(body.email)) {
    fields.email = "Invalid e-mail address";
  }
  if (
    typeof body.password !== "string" ||
    Buffer.byteLength(body.password, "utf8") < 8 ||
    Buffer.byteLength(body.password, "utf8") > 72
  ) {
    fields.password = "Password must be 8–72 bytes";
  }
  if (Object.keys(fields).length > 0) throw validationError(fields);

  const email = body.email.toLowerCase();
  if (await findUserByEmail(email)) {
    throw new AuthServiceError(
      409,
      "EMAIL_TAKEN",
      "An account with this e-mail already exists.",
    );
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  let row;
  try {
    row = await createUser({ name: body.name, email, passwordHash });
  } catch (error) {
    if (error.code === "23505") {
      throw new AuthServiceError(
        409,
        "EMAIL_TAKEN",
        "An account with this e-mail already exists.",
      );
    }
    throw error;
  }

  return { user: toUser(row), token: createToken(row) };
}

export async function login(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw invalidCredentials();
  }
  if (typeof body.email !== "string" || typeof body.password !== "string") {
    throw invalidCredentials();
  }

  const row = await findUserByEmail(body.email.toLowerCase());
  if (
    !row ||
    !row.active ||
    !(await bcrypt.compare(body.password, row.password_hash))
  ) {
    throw invalidCredentials();
  }

  const user = toUser(row);
  return { user, token: createToken(row) };
}

export async function getCurrentUser(id) {
  const row = await findUserById(id);
  if (!row || !row.active) {
    throw new AuthServiceError(
      401,
      "UNAUTHORIZED",
      "Authentication is required.",
    );
  }
  return toUser(row);
}

export function isUserRole(role) {
  return USER_ROLES.has(role);
}
