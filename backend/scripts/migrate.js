import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db/pool.js";

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var sqlDir = path.join(__dirname, "..", "sql");

async function run() {
  var client = await pool.connect();

  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename TEXT PRIMARY KEY,
         executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );

    var files = await fs.readdir(sqlDir);
    var migrationFiles = files.filter(function (file) {
      return file.endsWith(".sql");
    }).sort();

    for (var i = 0; i < migrationFiles.length; i += 1) {
      var file = migrationFiles[i];
      var already = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1",
        [file]
      );

      if (already.rowCount > 0) {
        console.log("Skipping already-applied migration: " + file);
        continue;
      }

      var fullPath = path.join(sqlDir, file);
      var sql = await fs.readFile(fullPath, "utf8");

      console.log("Applying migration: " + file);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("Migrations complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(function (error) {
  console.error("Migration failed:", error);
  process.exit(1);
});
