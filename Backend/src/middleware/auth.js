import jwt from "jsonwebtoken";
import { getJwtSecret, isUserRole } from "../modules/auth/auth.service.js";

function unauthorized(res) {
  res.status(401).json({
    error: {
      code: "UNAUTHORIZED",
      message: "Authentication is required.",
    },
  });
}

export function requireAuth(req, res, next) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") ?? "");
  if (!match) {
    unauthorized(res);
    return;
  }

  let payload;
  try {
    payload = jwt.verify(match[1], getJwtSecret(), {
      algorithms: ["HS256"],
    });
  } catch {
    unauthorized(res);
    return;
  }

  if (!payload || typeof payload !== "object") {
    unauthorized(res);
    return;
  }

  const id = Number(payload.sub);
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !isUserRole(payload.role) ||
    !(
      payload.theatreId === null ||
      (Number.isSafeInteger(payload.theatreId) && payload.theatreId > 0)
    )
  ) {
    unauthorized(res);
    return;
  }

  req.user = {
    id,
    role: payload.role,
    theatreId: payload.theatreId,
  };
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    requireAuth(req, res, (error) => {
      if (error) {
        next(error);
        return;
      }
      if (!roles.includes(req.user.role)) {
        res.status(403).json({
          error: {
            code: "FORBIDDEN",
            message: "You do not have permission to access this resource.",
          },
        });
        return;
      }
      next();
    });
  };
}
