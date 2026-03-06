import { query } from "../db/query.js";
import { haversineMiles, resolveCoords } from "./distance.js";

export async function getContractorMatches(jobId) {
  var jobResult = await query(
    `SELECT id, service_type, city, lat, lng
     FROM jobs
     WHERE id = $1
     LIMIT 1`,
    [jobId]
  );

  if (jobResult.rowCount === 0) {
    return [];
  }

  var job = jobResult.rows[0];
  var jobCoords = resolveCoords(job.city, numberOrNull(job.lat), numberOrNull(job.lng));

  var contractorsResult = await query(
    `SELECT c.id,
            c.display_name,
            c.rating,
            c.service_area_city,
            c.service_area_state,
            c.lat,
            c.lng,
            c.status,
            COALESCE(resp.avg_response_seconds, 999999) AS avg_response_seconds
     FROM contractors c
     JOIN contractor_services cs ON cs.contractor_id = c.id
     LEFT JOIN (
       SELECT contractor_id,
              AVG(EXTRACT(EPOCH FROM (responded_at - assigned_at))) AS avg_response_seconds
       FROM job_assignments
       WHERE responded_at IS NOT NULL
       GROUP BY contractor_id
     ) resp ON resp.contractor_id = c.id
     WHERE c.status = 'active'
       AND LOWER(c.service_area_city) = LOWER($1)
       AND cs.service_type = $2`,
    [job.city, job.service_type]
  );

  return contractorsResult.rows
    .map(function (contractor) {
      var contractorCoords = resolveCoords(
        contractor.service_area_city,
        numberOrNull(contractor.lat),
        numberOrNull(contractor.lng)
      );
      var distanceMiles = haversineMiles(jobCoords, contractorCoords);
      var ratingScore = Number(contractor.rating || 0) * 20;
      var proximityScore = distanceMiles === null ? 0 : Math.max(0, 40 - distanceMiles);
      var responseHours = Number(contractor.avg_response_seconds || 999999) / 3600;
      var responseSpeedScore = Math.max(0, 40 - responseHours * 2);
      var contractorScore = Math.round((ratingScore + proximityScore + responseSpeedScore) * 100) / 100;

      return {
        contractorId: contractor.id,
        displayName: contractor.display_name,
        rating: Number(contractor.rating || 0),
        serviceAreaCity: contractor.service_area_city,
        distanceMiles: distanceMiles === null ? null : Math.round(distanceMiles * 10) / 10,
        avgResponseHours: Math.round(responseHours * 10) / 10,
        score: contractorScore,
        confidence: {
          ratingWeight: Math.round(ratingScore * 100) / 100,
          proximityWeight: Math.round(proximityScore * 100) / 100,
          responseSpeedWeight: Math.round(responseSpeedScore * 100) / 100
        }
      };
    })
    .sort(function (a, b) {
      return b.score - a.score;
    });
}

function numberOrNull(value) {
  var parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
