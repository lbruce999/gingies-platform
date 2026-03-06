import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query, withTransaction } from "../db/query.js";
import { validate } from "../middleware/validate.js";
import { authRequired } from "../middleware/auth.js";
import { httpError } from "../utils/http-error.js";
import { createAccessToken } from "../utils/token.js";
import { logAuditEvent } from "../services/audit.js";

var router = express.Router();

var registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["homeowner", "contractor", "admin"]),
  name: z.string().min(1),
  phone: z.string().min(3).optional(),
  serviceAreaCity: z.string().min(1).optional(),
  serviceAreaState: z.string().min(1).max(2).optional(),
  servicesOffered: z.array(z.enum(["Plumbing", "Electrical", "Carpentry", "General Repairs"])).optional()
});

var loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post("/register", validate(registerSchema), async function (req, res, next) {
  try {
    var body = req.body;

    var existing = await query("SELECT id FROM users WHERE email = $1 LIMIT 1", [body.email]);
    if (existing.rowCount > 0) {
      throw httpError(409, "Email already registered");
    }

    var passwordHash = await bcrypt.hash(body.password, 12);

    var user = await withTransaction(async function (client) {
      var userResult = await client.query(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, $2, $3)
         RETURNING id, email, role, created_at`,
        [body.email, passwordHash, body.role]
      );

      var createdUser = userResult.rows[0];

      if (body.role === "homeowner") {
        await client.query(
          `INSERT INTO homeowners (user_id, name, email, phone)
           VALUES ($1, $2, $3, $4)`,
          [createdUser.id, body.name, body.email, body.phone || null]
        );
      }

      if (body.role === "contractor") {
        if (!body.serviceAreaCity) {
          throw httpError(400, "serviceAreaCity is required for contractor registration");
        }

        var contractorResult = await client.query(
          `INSERT INTO contractors (user_id, display_name, phone, service_area_city, service_area_state, rating, status, jobs_completed_base)
           VALUES ($1, $2, $3, $4, $5, 0, 'active', 0)
           RETURNING id`,
          [
            createdUser.id,
            body.name,
            body.phone || null,
            body.serviceAreaCity,
            body.serviceAreaState || null
          ]
        );

        var contractorId = contractorResult.rows[0].id;
        var services = body.servicesOffered && body.servicesOffered.length > 0
          ? body.servicesOffered
          : ["General Repairs"];

        for (var i = 0; i < services.length; i += 1) {
          await client.query(
            `INSERT INTO contractor_services (contractor_id, service_type)
             VALUES ($1, $2)
             ON CONFLICT (contractor_id, service_type) DO NOTHING`,
            [contractorId, services[i]]
          );
        }
      }

      await logAuditEvent(client, {
        actorUserId: createdUser.id,
        entityType: "user",
        entityId: createdUser.id,
        eventType: "user_registered",
        payload: {
          role: createdUser.role
        }
      });

      return createdUser;
    });

    var token = createAccessToken(user);

    res.status(201).json({
      user: user,
      token: token
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", validate(loginSchema), async function (req, res, next) {
  try {
    var body = req.body;
    var result = await query(
      `SELECT id, email, password_hash, role, is_active
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [body.email]
    );

    if (result.rowCount === 0) {
      throw httpError(401, "Invalid email or password");
    }

    var user = result.rows[0];
    if (!user.is_active) {
      throw httpError(403, "Account is inactive");
    }

    var passwordOk = await bcrypt.compare(body.password, user.password_hash);
    if (!passwordOk) {
      throw httpError(401, "Invalid email or password");
    }

    var token = createAccessToken(user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      token: token
    });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", authRequired, async function (req, res, next) {
  try {
    await query(
      `INSERT INTO audit_events (actor_user_id, entity_type, entity_id, event_type, payload)
       VALUES ($1, 'session', $1, 'user_logout', '{}'::jsonb)`,
      [req.user.id]
    );

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get("/me", authRequired, async function (req, res, next) {
  try {
    var user = req.user;
    var profile = null;

    if (user.role === "homeowner") {
      var homeownerResult = await query(
        "SELECT id, name, email, phone FROM homeowners WHERE user_id = $1 LIMIT 1",
        [user.id]
      );
      profile = homeownerResult.rows[0] || null;
    }

    if (user.role === "contractor") {
      var contractorResult = await query(
        `SELECT c.id,
                c.display_name,
                c.phone,
                c.rating,
                c.status,
                c.service_area_city,
                c.service_area_state,
                c.jobs_completed_base,
                ARRAY(
                  SELECT service_type
                  FROM contractor_services cs
                  WHERE cs.contractor_id = c.id
                  ORDER BY service_type
                ) AS services_offered
         FROM contractors c
         WHERE c.user_id = $1
         LIMIT 1`,
        [user.id]
      );

      profile = contractorResult.rows[0] || null;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      profile: profile
    });
  } catch (error) {
    next(error);
  }
});

export default router;
