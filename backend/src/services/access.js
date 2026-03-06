import { httpError } from "../utils/http-error.js";

export async function getContractorByUserId(queryable, userId) {
  var result = await queryable.query(
    `SELECT id, user_id, display_name, status, service_area_city, service_area_state, lat, lng
     FROM contractors
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

export async function getHomeownerByUserId(queryable, userId) {
  var result = await queryable.query(
    `SELECT id, user_id, name, email, phone
     FROM homeowners
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

export async function getJobById(queryable, jobId) {
  var result = await queryable.query(
    `SELECT id,
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
            canceled_at
     FROM jobs
     WHERE id = $1
     LIMIT 1`,
    [jobId]
  );

  return result.rows[0] || null;
}

export async function assertUserCanAccessJob(queryable, user, jobId) {
  var job = await getJobById(queryable, jobId);
  if (!job) {
    throw httpError(404, "Job not found");
  }

  if (!user) {
    throw httpError(401, "Authentication required");
  }

  if (user.role === "admin") {
    return job;
  }

  if (user.role === "homeowner") {
    var homeowner = await getHomeownerByUserId(queryable, user.id);
    var sameHomeowner = homeowner && String(homeowner.id) === String(job.homeowner_id);
    var sameEmail = normalizeCi(user.email) === normalizeCi(job.customer_email);

    if (!sameHomeowner && !sameEmail) {
      throw httpError(403, "You do not have access to this job");
    }

    return job;
  }

  if (user.role === "contractor") {
    var contractor = await getContractorByUserId(queryable, user.id);
    if (!contractor) {
      throw httpError(403, "Contractor profile not found");
    }

    var assignment = await queryable.query(
      `SELECT id
       FROM job_assignments
       WHERE job_id = $1
         AND contractor_id = $2
       LIMIT 1`,
      [jobId, contractor.id]
    );

    if (assignment.rowCount === 0) {
      throw httpError(403, "You do not have access to this job");
    }

    return job;
  }

  throw httpError(403, "Insufficient role permissions");
}

export async function assertPublicOrUserCanAccessJob(queryable, user, jobId, customerEmail) {
  var job = await getJobById(queryable, jobId);
  if (!job) {
    throw httpError(404, "Job not found");
  }

  if (!user) {
    if (!customerEmail || normalizeCi(customerEmail) !== normalizeCi(job.customer_email)) {
      throw httpError(403, "Provide matching customer email to view this job");
    }
    return job;
  }

  await assertUserCanAccessJob(queryable, user, jobId);
  return job;
}

function normalizeCi(value) {
  return String(value || "").trim().toLowerCase();
}
