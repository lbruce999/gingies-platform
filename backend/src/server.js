import app from "./app.js";
import { config } from "./config.js";
import { initializeDatabase, pool } from "./db/pool.js";

var server = null;

async function start() {
  try {
    await initializeDatabase();
  } catch (error) {
    // Keep the API process running so /api/health can report DB errors.
  }

  server = app.listen(config.port, function () {
    console.log("Gingies backend listening on port " + config.port);
  });
}

async function shutdown(signal) {
  console.log(signal + " received, shutting down server...");

  if (!server) {
    try {
      await pool.end();
    } finally {
      process.exit(0);
    }
    return;
  }

  server.close(async function () {
    try {
      await pool.end();
    } finally {
      process.exit(0);
    }
  });
}

process.on("SIGINT", function () {
  shutdown("SIGINT");
});

process.on("SIGTERM", function () {
  shutdown("SIGTERM");
});

start().catch(function (error) {
  console.error("Server startup failed:", error);
  process.exit(1);
});
