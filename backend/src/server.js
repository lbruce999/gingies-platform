import app from "./app.js";
import { config } from "./config.js";
import { pool } from "./db/pool.js";

var server = app.listen(config.port, function () {
  console.log("Gingies backend listening on port " + config.port);
});

async function shutdown(signal) {
  console.log(signal + " received, shutting down server...");

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
