export async function createNotification(client, payload) {
  var result = await client.query(
    `INSERT INTO notifications (user_id, contractor_id, job_id, type, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, contractor_id, job_id, type, message, read, created_at`,
    [payload.userId, payload.contractorId || null, payload.jobId || null, payload.type, payload.message]
  );

  return result.rows[0];
}
