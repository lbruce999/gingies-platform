import express from "express";
import { z } from "zod";
import { query, withTransaction } from "../db/query.js";
import { authOptional, authRequired, requireRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { httpError } from "../utils/http-error.js";
import { assertUuid } from "../utils/ids.js";
import { SERVICE_TYPES } from "../utils/constants.js";
import {
  assertPublicOrUserCanAccessJob,
  assertUserCanAccessJob,
  getContractorByUserId,
  getHomeownerByUserId
} from "../services/access.js";
import { assertTransitionAllowed } from "../services/job-transitions.js";
import { createNotification } from "../services/notifications.js";
import { logAuditEvent } from "../services/audit.js";

var router = express.Router();

var createJobSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email(),
    phone: z.string().min(3).max(30).optional(),
    service: z.enum(SERVICE_TYPES),
    description: z.string().min(3).max(5000),
    city: z.string().min(1).max(120),
    state: z.string().min(2).max(32).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    budgetMinCents: z.number().int().nonnegative().optional(),
    budgetMaxCents: z.number().int().nonnegative().optional()
  })
  .superRefine(function (value, context) {
    if (
      Number.isFinite(value.budgetMinCents) &&
      Number.isFinite(value.budgetMaxCents) &&
      value.budgetMinCents > value.budgetMaxCents
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["budgetMinCents"],
        message: "budgetMinCents must be less than or equal to budgetMaxCents"
      });
    }
  });

var messageSchema = z.object({
  message: z.string().min(1).max(3000)
});

var attachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  fileSizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  storageKey: z.string().min(1).max(1024),
  storageProvider: z.string().min(1).max(120)
});

var updateStatusSchema = z.object({
  status: z.enum(["scheduled", "in_progress", "completed", "canceled"])
});

router.post("/jobs", authOptional, validate(createJobSchema), async function (req, res, next) {
  try {
    if (req.user && ["homeowner", "admin"].indexOf(req.user.role) === -1) {
      throw httpError(403, "Only homeowners and admins can create jobs");
    }

    var body = req.body;
    var created = await withTransaction(async function (client) {
      var homeownerId = null;

      if (req.user && req.user.role === "homeowner") {
        var homeowner = await getHomeownerByUserId(client, req.user.id);
        if (homeowner) {
          homeownerId = homeowner.id;
        } else {
          var createHomeownerResult = await client.query(
            `INSERT INTO homeowners (user_id, name, email, phone)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [req.user.id, body.name, body.email, body.phone || null]
          );
          homeownerId = createHomeownerResult.rows[0].id;
        }
      }

      if (!homeownerId) {
        homeownerId = await upsertAnonymousHomeowner(client, body);
      }

      var jobResult = await client.query(
        `INSERT INTO jobs (
            homeowner_id,
            customer_name,
            customer_email,
            customer_phone,
            service_type,
            description,
            city,
            state,
            lat,
            lng,
            budget_min_cents,
            budget_max_cents,
            status
          )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'new')
         RETURNING id,
                   homeowner_id,
                   customer_name,
                   customer_email,
                   customer_phone,
                   service_type,
                   description,
                   city,
                   state,
                   lat,
                   lng,
                   budget_min_cents,
                   budget_max_cents,
                   status,
                   created_at,
                   updated_at`,
        [
          homeownerId,
          body.name,
          body.email,
          body.phone || null,
          body.service,
          body.description,
          body.city,
          body.state || null,
          body.lat || null,
          body.lng || null,
          body.budgetMinCents || null,
          body.budgetMaxCents || null
        ]
      );

      var job = jobResult.rows[0];

      await logAuditEvent(client, {
        actorUserId: req.user ? req.user.id : null,
        entityType: "job",
        entityId: job.id,
        eventType: "job_created",
        payload: {
          serviceType: job.service_type,
          city: job.city,
          source: req.user ? req.user.role : "public"
        }
      });

      return job;
    });

    res.status(201).json({
      job: serializeJob(created)
    });
  } catch (error) {
    next(error);
  }
});

router.get("/jobs/:id", authOptional, async function (req, res, next) {
  try {
    assertUuid(req.params.id, "job id");

    var customerEmail = typeof req.query.email === "string" ? req.query.email : null;
    var job = await assertPublicOrUserCanAccessJob(query, req.user || null, req.params.id, customerEmail);

    var assignment = await query(
      `SELECT id, contractor_id, status, assigned_at, responded_at
       FROM job_assignments
       WHERE job_id = $1
       ORDER BY assigned_at DESC
       LIMIT 1`,
      [req.params.id]
    );

    res.json({
      job: serializeJob(job),
      latestAssignment: assignment.rows[0] || null
    });
  } catch (error) {
    next(error);
  }
});

router.get("/jobs/:id/messages", authRequired, async function (req, res, next) {
  try {
    assertUuid(req.params.id, "job id");
    await assertUserCanAccessJob(query, req.user, req.params.id);

    var result = await query(
      `SELECT id,
              job_id,
              sender_user_id,
              sender_role,
              message,
              created_at
       FROM job_messages
       WHERE job_id = $1
       ORDER BY created_at ASC`,
      [req.params.id]
    );

    res.json({
      messages: result.rows
    });
  } catch (error) {
    next(error);
  }
});

router.post("/jobs/:id/messages", authRequired, validate(messageSchema), async function (req, res, next) {
  try {
    assertUuid(req.params.id, "job id");

    var createdMessage = await withTransaction(async function (client) {
      await assertUserCanAccessJob(client, req.user, req.params.id);

      var insertResult = await client.query(
        `INSERT INTO job_messages (job_id, sender_user_id, sender_role, message)
         VALUES ($1, $2, $3, $4)
         RETURNING id,
                   job_id,
                   sender_user_id,
                   sender_role,
                   message,
                   created_at`,
        [req.params.id, req.user.id, req.user.role, req.body.message]
      );

      await notifyCounterpartyOnMessage(client, req.params.id, req.user.id, req.user.role);

      await logAuditEvent(client, {
        actorUserId: req.user.id,
        entityType: "job",
        entityId: req.params.id,
        eventType: "job_message_posted",
        payload: {
          senderRole: req.user.role
        }
      });
      return insertResult.rows[0];
    });

    res.status(201).json({
      message: createdMessage
    });
  } catch (error) {
    next(error);
  }
});

router.post("/jobs/:id/attachments", authRequired, validate(attachmentSchema), async function (req, res, next) {
  try {
    assertUuid(req.params.id, "job id");

    var createdAttachment = await withTransaction(async function (client) {
      await assertUserCanAccessJob(client, req.user, req.params.id);

      var body = req.body;
      var result = await client.query(
        `INSERT INTO job_attachments (
            job_id,
            uploaded_by,
            file_name,
            mime_type,
            file_size_bytes,
            storage_key,
            storage_provider
          )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id,
                   job_id,
                   uploaded_by,
                   file_name,
                   mime_type,
                   file_size_bytes,
                   storage_key,
                   storage_provider,
                   created_at`,
        [
          req.params.id,
          req.user.id,
          body.fileName,
          body.mimeType,
          body.fileSizeBytes,
          body.storageKey,
          body.storageProvider
        ]
      );

      await logAuditEvent(client, {
        actorUserId: req.user.id,
        entityType: "job",
        entityId: req.params.id,
        eventType: "job_attachment_added",
        payload: {
          fileName: body.fileName,
          storageProvider: body.storageProvider
        }
      });
      return result.rows[0];
    });

    res.status(201).json({
      attachment: createdAttachment
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/jobs/:id/accept",
  authRequired,
  requireRoles(["contractor"]),
  async function (req, res, next) {
    try {
      assertUuid(req.params.id, "job id");

      var payload = await withTransaction(async function (client) {
        var contractor = await getContractorByUserId(client, req.user.id);
        if (!contractor) {
          throw httpError(404, "Contractor profile not found");
        }

        var jobResult = await client.query(
          `SELECT id, status, customer_name, service_type
           FROM jobs
           WHERE id = $1
           FOR UPDATE`,
          [req.params.id]
        );

        if (jobResult.rowCount === 0) {
          throw httpError(404, "Job not found");
        }

        var job = jobResult.rows[0];
        if (job.status === "canceled" || job.status === "completed") {
          throw httpError(409, "Cannot accept a completed or canceled job");
        }

        var assignmentResult = await client.query(
          `SELECT id, assigned_by
           FROM job_assignments
           WHERE job_id = $1
             AND contractor_id = $2
             AND status = 'pending'
           FOR UPDATE`,
          [req.params.id, contractor.id]
        );

        if (assignmentResult.rowCount === 0) {
          throw httpError(409, "No pending assignment found for this contractor");
        }

        var assignment = assignmentResult.rows[0];

        await client.query(
          `UPDATE job_assignments
           SET status = 'accepted',
               responded_at = NOW()
           WHERE id = $1`,
          [assignment.id]
        );

        await client.query(
          `UPDATE jobs
           SET status = 'accepted',
               updated_at = NOW()
           WHERE id = $1`,
          [req.params.id]
        );

        if (assignment.assigned_by && String(assignment.assigned_by) !== String(req.user.id)) {
          await createNotification(client, {
            userId: assignment.assigned_by,
            contractorId: contractor.id,
            jobId: req.params.id,
            type: "system_alert",
            message: contractor.display_name + " accepted job " + req.params.id + "."
          });
        }

        await logAuditEvent(client, {
          actorUserId: req.user.id,
          entityType: "job",
          entityId: req.params.id,
          eventType: "job_accepted",
          payload: {
            contractorId: contractor.id
          }
        });

        return {
          jobId: req.params.id,
          status: "accepted",
          contractorId: contractor.id
        };
      });

      res.json(payload);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/jobs/:id/decline",
  authRequired,
  requireRoles(["contractor"]),
  async function (req, res, next) {
    try {
      assertUuid(req.params.id, "job id");

      var payload = await withTransaction(async function (client) {
        var contractor = await getContractorByUserId(client, req.user.id);
        if (!contractor) {
          throw httpError(404, "Contractor profile not found");
        }

        var assignmentResult = await client.query(
          `SELECT id, assigned_by
           FROM job_assignments
           WHERE job_id = $1
             AND contractor_id = $2
             AND status IN ('pending', 'accepted')
           ORDER BY assigned_at DESC
           LIMIT 1
           FOR UPDATE`,
          [req.params.id, contractor.id]
        );

        if (assignmentResult.rowCount === 0) {
          throw httpError(409, "No active assignment found for this contractor");
        }

        var assignment = assignmentResult.rows[0];

        await client.query(
          `UPDATE job_assignments
           SET status = 'declined',
               responded_at = NOW()
           WHERE id = $1`,
          [assignment.id]
        );

        await client.query(
          `UPDATE jobs
           SET status = 'new',
               updated_at = NOW()
           WHERE id = $1
             AND status NOT IN ('completed', 'canceled')`,
          [req.params.id]
        );

        await notifyAdmins(client, {
          contractorId: contractor.id,
          jobId: req.params.id,
          type: "job_declined",
          message: contractor.display_name + " declined job " + req.params.id + "."
        });

        if (assignment.assigned_by && String(assignment.assigned_by) !== String(req.user.id)) {
          await createNotification(client, {
            userId: assignment.assigned_by,
            contractorId: contractor.id,
            jobId: req.params.id,
            type: "job_declined",
            message: contractor.display_name + " declined the assigned job."
          });
        }

        await logAuditEvent(client, {
          actorUserId: req.user.id,
          entityType: "job",
          entityId: req.params.id,
          eventType: "job_declined",
          payload: {
            contractorId: contractor.id
          }
        });

        return {
          jobId: req.params.id,
          status: "new",
          contractorId: contractor.id
        };
      });

      res.json(payload);
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  "/jobs/:id/status",
  authRequired,
  requireRoles(["contractor", "admin"]),
  validate(updateStatusSchema),
  async function (req, res, next) {
    try {
      assertUuid(req.params.id, "job id");

      var updated = await withTransaction(async function (client) {
        var jobResult = await client.query(
          `SELECT id, status, homeowner_id
           FROM jobs
           WHERE id = $1
           FOR UPDATE`,
          [req.params.id]
        );

        if (jobResult.rowCount === 0) {
          throw httpError(404, "Job not found");
        }

        var job = jobResult.rows[0];
        var nextStatus = req.body.status;
        var adminCancelOverride =
          req.user.role === "admin" && nextStatus === "canceled" && job.status !== "canceled";

        if (req.user.role === "contractor") {
          if (nextStatus === "canceled") {
            throw httpError(403, "Only admins can cancel jobs");
          }

          var contractor = await getContractorByUserId(client, req.user.id);
          if (!contractor) {
            throw httpError(404, "Contractor profile not found");
          }

          var assignment = await client.query(
            `SELECT id
             FROM job_assignments
             WHERE job_id = $1
               AND contractor_id = $2
               AND status = 'accepted'
             LIMIT 1`,
            [req.params.id, contractor.id]
          );

          if (assignment.rowCount === 0) {
            throw httpError(403, "Contractor cannot update status for this job");
          }
        }

        if (!adminCancelOverride) {
          assertTransitionAllowed(job.status, nextStatus);
        }

        var timestamps = {
          scheduledAt: nextStatus === "scheduled" ? "NOW()" : "scheduled_at",
          startedAt: nextStatus === "in_progress" ? "NOW()" : "started_at",
          completedAt: nextStatus === "completed" ? "NOW()" : "completed_at",
          canceledAt: nextStatus === "canceled" ? "NOW()" : "canceled_at"
        };

        var updatedResult = await client.query(
          `UPDATE jobs
           SET status = $2,
               scheduled_at = ${timestamps.scheduledAt},
               started_at = ${timestamps.startedAt},
               completed_at = ${timestamps.completedAt},
               canceled_at = ${timestamps.canceledAt},
               updated_at = NOW()
           WHERE id = $1
           RETURNING id,
                     homeowner_id,
                     customer_name,
                     customer_email,
                     customer_phone,
                     service_type,
                     description,
                     city,
                     state,
                     lat,
                     lng,
                     budget_min_cents,
                     budget_max_cents,
                     status,
                     created_at,
                     updated_at,
                     scheduled_at,
                     started_at,
                     completed_at,
                     canceled_at`,
          [req.params.id, nextStatus]
        );

        if (nextStatus === "scheduled") {
          await notifyHomeownerByJob(client, req.params.id, {
            type: "job_scheduled",
            message: "Your job " + req.params.id + " has been scheduled."
          });
        }

        await logAuditEvent(client, {
          actorUserId: req.user.id,
          entityType: "job",
          entityId: req.params.id,
          eventType: "job_status_updated",
          payload: {
            previousStatus: job.status,
            nextStatus: nextStatus
          }
        });

        return updatedResult.rows[0];
      });

      res.json({
        job: serializeJob(updated)
      });
    } catch (error) {
      next(error);
    }
  }
);

async function upsertAnonymousHomeowner(client, body) {
  var findResult = await client.query(
    `SELECT id
     FROM homeowners
     WHERE user_id IS NULL
       AND email = $1
     LIMIT 1`,
    [body.email]
  );

  if (findResult.rowCount > 0) {
    await client.query(
      `UPDATE homeowners
       SET name = $2,
           phone = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [findResult.rows[0].id, body.name, body.phone || null]
    );

    return findResult.rows[0].id;
  }

  var insertResult = await client.query(
    `INSERT INTO homeowners (name, email, phone)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [body.name, body.email, body.phone || null]
  );

  return insertResult.rows[0].id;
}

async function notifyAdmins(client, payload) {
  var admins = await client.query(
    `SELECT id
     FROM users
     WHERE role = 'admin'
       AND is_active = true`
  );

  for (var i = 0; i < admins.rows.length; i += 1) {
    await createNotification(client, {
      userId: admins.rows[i].id,
      contractorId: payload.contractorId || null,
      jobId: payload.jobId || null,
      type: payload.type,
      message: payload.message
    });
  }
}

async function notifyHomeownerByJob(client, jobId, payload) {
  var result = await client.query(
    `SELECT u.id AS user_id
     FROM jobs j
     JOIN homeowners h ON h.id = j.homeowner_id
     JOIN users u ON u.id = h.user_id
     WHERE j.id = $1
     LIMIT 1`,
    [jobId]
  );

  if (result.rowCount === 0) {
    return;
  }

  await createNotification(client, {
    userId: result.rows[0].user_id,
    contractorId: null,
    jobId: jobId,
    type: payload.type,
    message: payload.message
  });
}

async function notifyCounterpartyOnMessage(client, jobId, senderUserId, senderRole) {
  var recipients = [];

  if (senderRole === "homeowner") {
    var contractorUsers = await client.query(
      `SELECT DISTINCT u.id AS user_id, c.id AS contractor_id
       FROM job_assignments ja
       JOIN contractors c ON c.id = ja.contractor_id
       JOIN users u ON u.id = c.user_id
       WHERE ja.job_id = $1
         AND ja.status IN ('pending', 'accepted')`,
      [jobId]
    );

    recipients = contractorUsers.rows;
  } else if (senderRole === "contractor") {
    var homeownerUser = await client.query(
      `SELECT u.id AS user_id
       FROM jobs j
       JOIN homeowners h ON h.id = j.homeowner_id
       JOIN users u ON u.id = h.user_id
       WHERE j.id = $1
       LIMIT 1`,
      [jobId]
    );

    recipients = homeownerUser.rows.map(function (row) {
      return {
        user_id: row.user_id,
        contractor_id: null
      };
    });
  }

  for (var i = 0; i < recipients.length; i += 1) {
    var recipient = recipients[i];
    if (String(recipient.user_id) === String(senderUserId)) {
      continue;
    }

    await createNotification(client, {
      userId: recipient.user_id,
      contractorId: recipient.contractor_id || null,
      jobId: jobId,
      type: "customer_message",
      message: "New message on job " + jobId + "."
    });
  }
}

function serializeJob(job) {
  return {
    id: job.id,
    homeownerId: job.homeowner_id,
    customerName: job.customer_name,
    customerEmail: job.customer_email,
    customerPhone: job.customer_phone,
    serviceType: job.service_type,
    description: job.description,
    city: job.city,
    state: job.state,
    lat: toNumberOrNull(job.lat),
    lng: toNumberOrNull(job.lng),
    budgetMinCents: job.budget_min_cents,
    budgetMaxCents: job.budget_max_cents,
    status: job.status,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    scheduledAt: job.scheduled_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    canceledAt: job.canceled_at
  };
}

function toNumberOrNull(value) {
  var parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default router;
