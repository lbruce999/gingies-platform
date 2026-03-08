import { pool, sql } from "./pool.js";

export async function query(text, params) {
  return pool.query(text, params);
}

// Some services pass `query` where an object with `.query()` is expected.
query.query = query;

export async function withTransaction(handler) {
  return sql.begin(async function (tx) {
    var client = {
      query: async function (statement, statementParams) {
        var rows = await tx.unsafe(statement, statementParams || []);
        return {
          rows: rows,
          rowCount: Array.isArray(rows) ? rows.length : 0
        };
      }
    };

    return handler(client);
  });
}
