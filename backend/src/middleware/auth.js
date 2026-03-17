import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { httpError } from "../utils/http-error.js";
import { query } from "../db/query.js";

export async function authOptional(req, res, next) {
  try {
    var token = getBearerToken(req.headers.authorization);
    if (!token) {
      return next();
    }

    var decoded = jwt.verify(token, config.jwtSecret);
    var user = await findActiveUser(decoded.sub);
    if (user) {
      req.user = user;
    }

    next();
  } catch (error) {
    next(error.status ? error : httpError(401, "Invalid authentication token"));
  }
}

export async function authRequired(req, res, next) {
  try {
    var token = getBearerToken(req.headers.authorization);
    if (!token) {
      throw httpError(401, "Authentication required");
    }

    var decoded = jwt.verify(token, config.jwtSecret);
    var user = await findActiveUser(decoded.sub);
    if (!user) {
      throw httpError(401, "User account not found or inactive");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error.status ? error : httpError(401, "Invalid authentication token"));
  }
}

export function requireRoles(roles) {
  return function (req, res, next) {
    if (!req.user) {
      return next(httpError(401, "Authentication required"));
    }

    if (roles.indexOf(req.user.role) === -1) {
      return next(httpError(403, "Insufficient role permissions"));
    }

    next();
  };
}

function getBearerToken(authorization) {
  if (!authorization) {
    return null;
  }

  var parts = authorization.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    throw httpError(401, "Malformed authorization header");
  }

  return parts[1];
}

async function findActiveUser(userId) {
  var result = await query(
    "SELECT id, email, username, role, is_active FROM users WHERE id = $1 AND is_active = true LIMIT 1",
    [userId]
  );
  return result.rows[0] || null;
}
