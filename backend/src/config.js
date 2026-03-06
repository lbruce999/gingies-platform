import dotenv from "dotenv";

dotenv.config();

function toNumber(value, fallback) {
  var parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export var config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: toNumber(process.env.PORT, 4000),
  databaseUrl: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/gingies",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  pollingIntervalMs: toNumber(process.env.POLLING_INTERVAL_MS, 25000)
};

if (config.nodeEnv === "production" && config.jwtSecret === "dev-secret-change-me") {
  throw new Error("JWT_SECRET must be set in production.");
}
