export async function logAuditEvent(clientOrPool, payload) {
  var queryable = clientOrPool.query ? clientOrPool : clientOrPool.client;
  await queryable.query(
    `INSERT INTO audit_events (actor_user_id, entity_type, entity_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [payload.actorUserId || null, payload.entityType, payload.entityId || null, payload.eventType, payload.payload || {}]
  );
}
