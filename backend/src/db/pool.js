import pg from "pg";
import { config } from "../config.js";

var Pool = pg.Pool;

export var pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.nodeEnv === "production" ? { rejectUnauthorized: false } : false
});

pool.on("error", function (error) {
  console.error("Unexpected PostgreSQL pool error:", error);
});
