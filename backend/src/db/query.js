import { pool } from "./pool.js";

export async function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(handler) {
  var client = await pool.connect();
  try {
    await client.query("BEGIN");
    var result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
