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

function getUserFromAuthorization(authorization) {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  if (!match) return null;
  let payload;
  try {
    payload = jwt.verify(match[1], getJwtSecret(), {
      algorithms: ["HS256"],
    });
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
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
    return null;
  }

  return {
    id,
    role: payload.role,
    theatreId: payload.theatreId,
  };
}

export function requireAuth(req, res, next) {
  const user = getUserFromAuthorization(req.get("authorization"));
  if (!user) {
    unauthorized(res);
    return;
  }
  req.user = user;
  next();
}

export function optionalAuth(req, res, next) {
  const authorization = req.get("authorization");
  if (authorization === undefined) {
    next();
    return;
  }

  const user = getUserFromAuthorization(authorization);
  if (!user) {
    unauthorized(res);
    return;
  }
  req.user = user;
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
