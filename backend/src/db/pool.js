import postgres from "postgres";
import { config } from "../config.js";

var isProduction = config.nodeEnv === "production";

export var sql = postgres(config.databaseUrl, {
  ssl: isProduction ? "require" : undefined,
  // Supabase pooler + PgBouncer are safer with prepared statements disabled.
  prepare: false,
  max: 10
});

var startupCheckPromise = null;

function toResult(rows) {
  return {
    rows: rows,
    rowCount: Array.isArray(rows) ? rows.length : 0
  };
}

async function rawQuery(queryText, params) {
  var rows = await sql.unsafe(queryText, params || []);
  return toResult(rows);
}

export var pool = {
  query: rawQuery,
  connect: async function () {
    var reserved = await sql.reserve();
    return {
      query: async function (queryText, params) {
        var rows = await reserved.unsafe(queryText, params || []);
        return toResult(rows);
      },
      release: async function () {
        await reserved.release();
      }
    };
  },
  end: function () {
    return sql.end();
  }
};

export async function initializeDatabase() {
  if (!startupCheckPromise) {
    startupCheckPromise = (async function () {
      try {
        await sql.unsafe("SELECT 1");
        console.log("Database connected");
      } catch (error) {
        console.error("Database connection failed", error);
        throw error;
      }
    })();
  }

  return startupCheckPromise;
}
