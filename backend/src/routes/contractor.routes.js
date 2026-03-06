import express from "express";
import { z } from "zod";
import { query } from "../db/query.js";
import { authRequired, requireRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { parsePagination } from "../utils/pagination.js";
import { assertUuid } from "../utils/ids.js";
import { JOB_STATUSES } from "../utils/constants.js";
import { getContractorByUserId } from "../services/access.js";
import { haversineMiles, resolveCoords } from "../services/distance.js";
import { httpError } from "../utils/http-error.js";

var router = express.Router();

var jobsQuerySchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional()
});

var notificationsQuerySchema = z.object({
  unread_only: z.enum(["true", "false"]).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional()
});

router.use(authRequired, requireRoles(["contractor"]));

router.get("/jobs", validate(jobsQuerySchema, "query"), async function (req, res, next) {
  try {
    var contractor = await getContractorByUserId(query, req.user.id);
    if (!contractor) {
      throw httpError(404, "Contractor profile not found");
    }

    var pagination = parsePagination(req.query);
    var filters = [contractor.id];
    var statusFilterSql = "";

    if (req.query.status) {
      filters.push(req.query.status);
      statusFilterSql = " AND j.status = $2";
    }

    var totalResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM job_assignments ja
       JOIN jobs j ON j.id = ja.job_id
       WHERE ja.contractor_id = $1
         AND ja.status = 'accepted'
         ${statusFilterSql}`,
      filters
    );

    var listParams = filters.slice();
    listParams.push(pagination.limit, pagination.offset);

    var listResult = await query(
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
              ja.id AS assignment_id,
              ja.status AS assignment_status,
              ja.assigned_at,
              ja.responded_at,
              COALESCE(jq.amount_cents, j.budget_max_cents, j.budget_min_cents, 0) AS estimated_value_cents
       FROM job_assignments ja
       JOIN jobs j ON j.id = ja.job_id
       LEFT JOIN LATERAL (
         SELECT amount_cents
         FROM job_quotes
         WHERE job_id = j.id
           AND contractor_id = ja.contractor_id
           AND status = 'accepted'
         ORDER BY submitted_at DESC
         LIMIT 1
       ) jq ON TRUE
       WHERE ja.contractor_id = $1
         AND ja.status = 'accepted'
         ${statusFilterSql}
       ORDER BY j.created_at DESC
       LIMIT $${listParams.length - 1}
       OFFSET $${listParams.length}`,
      listParams
    );

    var baseCoords = resolveCoords(
      contractor.service_area_city,
      toNumberOrNull(contractor.lat),
      toNumberOrNull(contractor.lng)
    );

    var rows = listResult.rows.map(function (row) {
      var jobCoords = resolveCoords(row.city, toNumberOrNull(row.lat), toNumberOrNull(row.lng));
      var distance = haversineMiles(baseCoords, jobCoords);

      return {
        id: row.id,
        customerName: row.customer_name,
        customerEmail: row.customer_email,
        customerPhone: row.customer_phone,
        serviceType: row.service_type,
        description: row.description,
        city: row.city,
        state: row.state,
        lat: toNumberOrNull(row.lat),
        lng: toNumberOrNull(row.lng),
        status: row.status,
        budgetMinCents: row.budget_min_cents,
        budgetMaxCents: row.budget_max_cents,
        estimatedValueCents: Number(row.estimated_value_cents || 0),
        distanceMiles: distance === null ? null : round(distance, 1),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        scheduledAt: row.scheduled_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        assignment: {
          id: row.assignment_id,
          status: row.assignment_status,
          assignedAt: row.assigned_at,
          respondedAt: row.responded_at
        }
      };
    });

    res.json({
      data: rows,
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

router.get("/jobs/available", async function (req, res, next) {
  try {
    var contractor = await getContractorByUserId(query, req.user.id);
    if (!contractor) {
      throw httpError(404, "Contractor profile not found");
    }

    var result = await query(
      `SELECT j.id,
              j.customer_name,
              j.service_type,
              j.description,
              j.city,
              j.state,
              j.lat,
              j.lng,
              j.budget_min_cents,
              j.budget_max_cents,
              j.created_at,
              ja.id AS assignment_id,
              ja.status AS assignment_status,
              ja.assigned_at
       FROM job_assignments ja
       JOIN jobs j ON j.id = ja.job_id
       WHERE ja.contractor_id = $1
         AND ja.status = 'pending'
         AND j.status = 'new'
       ORDER BY ja.assigned_at DESC`,
      [contractor.id]
    );

    var contractorCoords = resolveCoords(
      contractor.service_area_city,
      toNumberOrNull(contractor.lat),
      toNumberOrNull(contractor.lng)
    );

    var availableJobs = result.rows.map(function (row) {
      var jobCoords = resolveCoords(row.city, toNumberOrNull(row.lat), toNumberOrNull(row.lng));
      var distance = haversineMiles(contractorCoords, jobCoords);

      return {
        id: row.id,
        customerName: row.customer_name,
        serviceType: row.service_type,
        description: row.description,
        city: row.city,
        state: row.state,
        budgetMinCents: row.budget_min_cents,
        budgetMaxCents: row.budget_max_cents,
        distanceMiles: distance === null ? null : round(distance, 1),
        createdAt: row.created_at,
        assignment: {
          id: row.assignment_id,
          status: row.assignment_status,
          assignedAt: row.assigned_at
        }
      };
    });

    res.json({
      data: availableJobs
    });
  } catch (error) {
    next(error);
  }
});

router.get(
  "/notifications",
  validate(notificationsQuerySchema, "query"),
  async function (req, res, next) {
    try {
      var pagination = parsePagination(req.query);
      var unreadOnly = req.query.unread_only === "true";

      var filters = [req.user.id];
      var unreadSql = "";

      if (unreadOnly) {
        unreadSql = " AND read = false";
      }

      var totalResult = await query(
        `SELECT COUNT(*)::int AS total
         FROM notifications
         WHERE user_id = $1${unreadSql}`,
        filters
      );

      var listResult = await query(
        `SELECT id,
                user_id,
                contractor_id,
                job_id,
                type,
                message,
                read,
                created_at
         FROM notifications
         WHERE user_id = $1${unreadSql}
         ORDER BY created_at DESC
         LIMIT $2
         OFFSET $3`,
        [req.user.id, pagination.limit, pagination.offset]
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
  }
);

router.post("/notifications/:id/read", async function (req, res, next) {
  try {
    assertUuid(req.params.id, "notification id");

    var result = await query(
      `UPDATE notifications
       SET read = true
       WHERE id = $1
         AND user_id = $2
       RETURNING id,
                 user_id,
                 contractor_id,
                 job_id,
                 type,
                 message,
                 read,
                 created_at`,
      [req.params.id, req.user.id]
    );

    if (result.rowCount === 0) {
      throw httpError(404, "Notification not found");
    }

    res.json({
      notification: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

function toNumberOrNull(value) {
  var parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, decimals) {
  var factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export default router;
