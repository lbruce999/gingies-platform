import express from "express";
import { z } from "zod";
import { query, withTransaction } from "../db/query.js";
import { authRequired, requireRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  CONTRACTOR_STATUSES,
  JOB_STATUSES,
  SERVICE_TYPES
} from "../utils/constants.js";
import { parsePagination } from "../utils/pagination.js";
import { assertUuid } from "../utils/ids.js";
import { getContractorMatches } from "../services/matching.js";
import { httpError } from "../utils/http-error.js";
import { createNotification } from "../services/notifications.js";
import { logAuditEvent } from "../services/audit.js";

var router = express.Router();

var jobsQuerySchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  city: z.string().min(1).max(120).optional(),
  service_type: z.enum(SERVICE_TYPES).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional()
});

var assignSchema = z.object({
  contractorId: z.string().uuid(),
  note: z.string().max(1000).optional()
});

var contractorsQuerySchema = z.object({
  status: z.enum(CONTRACTOR_STATUSES).optional(),
  city: z.string().min(1).max(120).optional(),
  service_type: z.enum(SERVICE_TYPES).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional()
});

var contractorStatusSchema = z.object({
  status: z.enum(CONTRACTOR_STATUSES)
});

router.use(authRequired, requireRoles(["admin"]));

router.get("/jobs", validate(jobsQuerySchema, "query"), async function (req, res, next) {
  try {
    var pagination = parsePagination(req.query);
    var where = [];
    var params = [];

    if (req.query.status) {
      params.push(req.query.status);
      where.push("j.status = $" + params.length);
    }

    if (req.query.city) {
      params.push(req.query.city);
      where.push("LOWER(j.city) = LOWER($" + params.length + ")");
    }

    if (req.query.service_type) {
      params.push(req.query.service_type);
      where.push("j.service_type = $" + params.length);
    }

    var whereSql = where.length > 0 ? "WHERE " + where.join(" AND ") : "";

    var totalQuery =
      "SELECT COUNT(*)::int AS total FROM jobs j " +
      whereSql;

    var totalResult = await query(totalQuery, params);

    var listParams = params.slice();
    listParams.push(pagination.limit, pagination.offset);

    var listQuery =
      `SELECT j.id,
              j.customer_name,
              j.customer_email,
              j.customer_phone,
              j.service_type,
              j.description,
              j.city,
              j.state,
              j.lat,
              j.lng,
              j.budget_min_cents,
              j.budget_max_cents,
              j.status,
              j.created_at,
              j.updated_at,
              j.scheduled_at,
              j.started_at,
              j.completed_at,
              j.canceled_at,
              a.id AS active_assignment_id,
              a.status AS active_assignment_status,
              a.assigned_at AS active_assignment_assigned_at,
              c.id AS assigned_contractor_id,
              c.display_name AS assigned_contractor_name
       FROM jobs j
       LEFT JOIN LATERAL (
         SELECT ja.id, ja.contractor_id, ja.status, ja.assigned_at
         FROM job_assignments ja
         WHERE ja.job_id = j.id
           AND ja.status IN ('pending', 'accepted')
         ORDER BY ja.assigned_at DESC
         LIMIT 1
       ) a ON TRUE
       LEFT JOIN contractors c ON c.id = a.contractor_id
       ${whereSql}
       ORDER BY j.created_at DESC
       LIMIT $${listParams.length - 1}
       OFFSET $${listParams.length}`;

    var listResult = await query(listQuery, listParams);

    res.json({
      data: listResult.rows,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: totalResult.rows[0].total
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/jobs/:id/matches", async function (req, res, next) {
  try {
    assertUuid(req.params.id, "job id");

    var matches = await getContractorMatches(req.params.id);
    res.json({
      jobId: req.params.id,
      matches: matches
    });
  } catch (error) {
    next(error);
  }
});

router.post("/jobs/:id/assign", validate(assignSchema), async function (req, res, next) {
  try {
    assertUuid(req.params.id, "job id");

    var result = await withTransaction(async function (client) {
      var job = await lockAssignableJob(client, req.params.id);
      var contractor = await getContractorForAssignment(client, req.body.contractorId, job.service_type);

      var existing = await client.query(
        `SELECT id
         FROM job_assignments
         WHERE job_id = $1
           AND status IN ('pending', 'accepted')
         LIMIT 1`,
        [req.params.id]
      );

      if (existing.rowCount > 0) {
        throw httpError(409, "Job already has an active assignment");
      }

      var assignmentResult = await client.query(
        `INSERT INTO job_assignments (job_id, contractor_id, status, assigned_by, assigned_at, note)
         VALUES ($1, $2, 'pending', $3, NOW(), $4)
         RETURNING id,
                   job_id,
                   contractor_id,
                   status,
                   assigned_by,
                   assigned_at,
                   responded_at,
                   note`,
        [req.params.id, contractor.id, req.user.id, req.body.note || null]
      );

      await client.query(
        `UPDATE jobs
         SET status = 'new',
             updated_at = NOW()
         WHERE id = $1`,
        [req.params.id]
      );

      await createNotification(client, {
        userId: contractor.user_id,
        contractorId: contractor.id,
        jobId: req.params.id,
        type: "job_assigned",
        message:
          "New " + job.service_type.toLowerCase() + " request assigned in " + job.city + "."
      });

      await logAuditEvent(client, {
        actorUserId: req.user.id,
        entityType: "job",
        entityId: req.params.id,
        eventType: "job_assigned",
        payload: {
          contractorId: contractor.id,
          note: req.body.note || null
        }
      });

      return assignmentResult.rows[0];
    });

    res.status(201).json({
      assignment: result
    });
  } catch (error) {
    next(error);
  }
});

router.post("/jobs/:id/reassign", validate(assignSchema), async function (req, res, next) {
  try {
    assertUuid(req.params.id, "job id");

    var result = await withTransaction(async function (client) {
      var job = await lockAssignableJob(client, req.params.id);
      var contractor = await getContractorForAssignment(client, req.body.contractorId, job.service_type);

      await client.query(
        `UPDATE job_assignments
         SET status = 'canceled',
             responded_at = COALESCE(responded_at, NOW()),
             note = CASE
                      WHEN note IS NULL THEN 'Canceled due to reassignment'
                      ELSE note || ' | Canceled due to reassignment'
                    END
         WHERE job_id = $1
           AND status IN ('pending', 'accepted')`,
        [req.params.id]
      );

      var assignmentResult = await client.query(
        `INSERT INTO job_assignments (job_id, contractor_id, status, assigned_by, assigned_at, note)
         VALUES ($1, $2, 'pending', $3, NOW(), $4)
         RETURNING id,
                   job_id,
                   contractor_id,
                   status,
                   assigned_by,
                   assigned_at,
                   responded_at,
                   note`,
        [req.params.id, contractor.id, req.user.id, req.body.note || null]
      );

      await client.query(
        `UPDATE jobs
         SET status = 'new',
             updated_at = NOW()
         WHERE id = $1`,
        [req.params.id]
      );

      await createNotification(client, {
        userId: contractor.user_id,
        contractorId: contractor.id,
        jobId: req.params.id,
        type: "job_assigned",
        message: "A reassigned job is waiting for your response."
      });

      await logAuditEvent(client, {
        actorUserId: req.user.id,
        entityType: "job",
        entityId: req.params.id,
        eventType: "job_reassigned",
        payload: {
          contractorId: contractor.id,
          note: req.body.note || null
        }
      });

      return assignmentResult.rows[0];
    });

    res.status(201).json({
      assignment: result
    });
  } catch (error) {
    next(error);
  }
});

router.get("/contractors", validate(contractorsQuerySchema, "query"), async function (req, res, next) {
  try {
    var pagination = parsePagination(req.query);
    var where = [];
    var params = [];

    if (req.query.status) {
      params.push(req.query.status);
      where.push("c.status = $" + params.length);
    }

    if (req.query.city) {
      params.push(req.query.city);
      where.push("LOWER(c.service_area_city) = LOWER($" + params.length + ")");
    }

    if (req.query.service_type) {
      params.push(req.query.service_type);
      where.push(
        "EXISTS (SELECT 1 FROM contractor_services cs WHERE cs.contractor_id = c.id AND cs.service_type = $" +
          params.length +
          ")"
      );
    }

    var whereSql = where.length > 0 ? "WHERE " + where.join(" AND ") : "";

    var totalResult = await query(
      "SELECT COUNT(*)::int AS total FROM contractors c " + whereSql,
      params
    );

    var listParams = params.slice();
    listParams.push(pagination.limit, pagination.offset);

    var listResult = await query(
      `SELECT c.id,
              c.user_id,
              c.display_name,
              c.phone,
              c.rating,
              c.status,
              c.service_area_city,
              c.service_area_state,
              c.lat,
              c.lng,
              c.jobs_completed_base,
              c.created_at,
              c.updated_at,
              ARRAY(
                SELECT cs.service_type
                FROM contractor_services cs
                WHERE cs.contractor_id = c.id
                ORDER BY cs.service_type
              ) AS services_offered
       FROM contractors c
       ${whereSql}
       ORDER BY c.created_at DESC
       LIMIT $${listParams.length - 1}
       OFFSET $${listParams.length}`,
      listParams
    );

    res.json({
      data: listResult.rows,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: totalResult.rows[0].total
      }
    });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/contractors/:id/status",
  validate(contractorStatusSchema),
  async function (req, res, next) {
    try {
      assertUuid(req.params.id, "contractor id");

      var result = await query(
        `UPDATE contractors
         SET status = $2,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id,
                   user_id,
                   display_name,
                   status,
                   service_area_city,
                   service_area_state,
                   updated_at`,
        [req.params.id, req.body.status]
      );

      if (result.rowCount === 0) {
        throw httpError(404, "Contractor not found");
      }

      await logAuditEvent(query, {
        actorUserId: req.user.id,
        entityType: "contractor",
        entityId: req.params.id,
        eventType: "contractor_status_updated",
        payload: {
          status: req.body.status
        }
      });

      res.json({
        contractor: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/metrics", async function (req, res, next) {
  try {
    var countsResult = await query(
      `SELECT COUNT(*) FILTER (WHERE status = 'new')::int AS new_jobs,
              COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted_jobs,
              COUNT(*) FILTER (WHERE status = 'scheduled')::int AS scheduled_jobs,
              COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_jobs,
              COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_jobs,
              COUNT(*) FILTER (WHERE status = 'canceled')::int AS canceled_jobs
       FROM jobs`
    );

    var revenueResult = await query(
      `SELECT COALESCE(
                SUM(COALESCE(q.amount_cents, j.budget_max_cents, j.budget_min_cents, 0)),
                0
              )::bigint AS weekly_revenue_cents
       FROM jobs j
       LEFT JOIN LATERAL (
         SELECT amount_cents
         FROM job_quotes q
         WHERE q.job_id = j.id
           AND q.status = 'accepted'
         ORDER BY q.submitted_at DESC
         LIMIT 1
       ) q ON TRUE
       WHERE j.status = 'completed'
         AND COALESCE(j.completed_at, j.updated_at, j.created_at) >= NOW() - INTERVAL '7 days'`
    );

    var contractorResult = await query(
      `SELECT COUNT(*) FILTER (WHERE status = 'active')::int AS active_contractors,
              COUNT(*)::int AS total_contractors
       FROM contractors`
    );

    var unreadNotificationsResult = await query(
      `SELECT COUNT(*)::int AS unread_notifications
       FROM notifications
       WHERE read = false`
    );

    res.json({
      jobs: countsResult.rows[0],
      revenue: {
        weeklyRevenueCents: Number(revenueResult.rows[0].weekly_revenue_cents || 0)
      },
      contractors: contractorResult.rows[0],
      notifications: unreadNotificationsResult.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

async function lockAssignableJob(client, jobId) {
  var result = await client.query(
    `SELECT id, service_type, city, status
     FROM jobs
     WHERE id = $1
     FOR UPDATE`,
    [jobId]
  );

  if (result.rowCount === 0) {
    throw httpError(404, "Job not found");
  }

  var job = result.rows[0];
  if (job.status === "completed" || job.status === "canceled") {
    throw httpError(409, "Cannot assign a completed or canceled job");
  }

  return job;
}

async function getContractorForAssignment(client, contractorId, serviceType) {
  var result = await client.query(
    `SELECT c.id, c.user_id, c.display_name, c.status
     FROM contractors c
     WHERE c.id = $1
     LIMIT 1`,
    [contractorId]
  );

  if (result.rowCount === 0) {
    throw httpError(404, "Contractor not found");
  }

  var contractor = result.rows[0];

  if (contractor.status !== "active") {
    throw httpError(409, "Contractor is not active");
  }

  var serviceCheck = await client.query(
    `SELECT 1
     FROM contractor_services
     WHERE contractor_id = $1
       AND service_type = $2
     LIMIT 1`,
    [contractorId, serviceType]
  );

  if (serviceCheck.rowCount === 0) {
    throw httpError(409, "Contractor does not offer this service type");
  }

  return contractor;
}

export default router;
