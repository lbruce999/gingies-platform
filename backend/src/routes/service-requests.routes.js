import express from "express";
import { z } from "zod";
import { query } from "../db/query.js";
import { validate } from "../middleware/validate.js";
import {
  PREFERRED_CONTACT_METHODS,
  PROPERTY_TYPES,
  SERVICE_REQUEST_STATUSES,
  SERVICE_REQUEST_URGENCIES,
  SERVICE_TYPES
} from "../utils/constants.js";

var router = express.Router();
var DEFAULT_SERVICE_REQUEST_STATUS = SERVICE_REQUEST_STATUSES[0];
var ZIP_CODE_PATTERN = /^[0-9]{5}(-[0-9]{4})?$/;
var STATE_PATTERN = /^[A-Z]{2}$/;
var PHONE_PATTERN = /^[0-9+().\-\s]+$/;

function optionalTrimmedString(maxLength) {
  return z.preprocess(
    function (value) {
      if (typeof value !== "string") {
        return value;
      }

      var trimmed = value.trim();
      return trimmed ? trimmed : undefined;
    },
    z.string().max(maxLength).optional()
  );
}

export var createServiceRequestSchema = z
  .object({
    serviceType: z.enum(SERVICE_TYPES),
    serviceSubtype: optionalTrimmedString(120),
    address: optionalTrimmedString(240),
    zipCode: optionalTrimmedString(10).refine(
      function (value) {
        return !value || ZIP_CODE_PATTERN.test(value);
      },
      {
        message: "zipCode must be a valid US ZIP code"
      }
    ),
    city: z.string().trim().min(1).max(120),
    state: z
      .string()
      .trim()
      .transform(function (value) {
        return value.toUpperCase();
      })
      .refine(
        function (value) {
          return STATE_PATTERN.test(value);
        },
        {
          message: "state must be a 2-letter code"
        }
      ),
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(7).max(30).regex(PHONE_PATTERN, "phone must be a valid phone number"),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform(function (value) {
        return value.toLowerCase();
      }),
    preferredContactMethod: z.enum(PREFERRED_CONTACT_METHODS),
    projectDescription: z.string().trim().min(3).max(5000),
    urgency: z.enum(SERVICE_REQUEST_URGENCIES),
    propertyType: z.enum(PROPERTY_TYPES)
  })
  .strict()
  .superRefine(function (value, context) {
    if (!value.address && !value.zipCode) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["address"],
        message: "address or zipCode is required"
      });
    }
  });

router.post("/service-requests", validate(createServiceRequestSchema), async function (req, res, next) {
  try {
    var body = req.body;
    var result = await query(
      `INSERT INTO service_requests (
          service_type,
          service_subtype,
          address,
          zip_code,
          city,
          state,
          first_name,
          last_name,
          phone,
          email,
          preferred_contact_method,
          project_description,
          urgency,
          property_type,
          status
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id,
                 created_at,
                 updated_at,
                 service_type,
                 service_subtype,
                 address,
                 zip_code,
                 city,
                 state,
                 first_name,
                 last_name,
                 phone,
                 email,
                 preferred_contact_method,
                 project_description,
                 urgency,
                 property_type,
                 status`,
      [
        body.serviceType,
        body.serviceSubtype || null,
        body.address || null,
        body.zipCode || null,
        body.city,
        body.state,
        body.firstName,
        body.lastName,
        body.phone,
        body.email,
        body.preferredContactMethod,
        body.projectDescription,
        body.urgency,
        body.propertyType,
        DEFAULT_SERVICE_REQUEST_STATUS
      ]
    );

    res.status(201).json({
      serviceRequest: serializeServiceRequest(result.rows[0])
    });
  } catch (error) {
    next(error);
  }
});

export function serializeServiceRequest(serviceRequest) {
  return {
    id: serviceRequest.id,
    createdAt: serviceRequest.created_at,
    updatedAt: serviceRequest.updated_at,
    serviceType: serviceRequest.service_type,
    serviceSubtype: serviceRequest.service_subtype,
    address: serviceRequest.address,
    zipCode: serviceRequest.zip_code,
    city: serviceRequest.city,
    state: serviceRequest.state,
    firstName: serviceRequest.first_name,
    lastName: serviceRequest.last_name,
    phone: serviceRequest.phone,
    email: serviceRequest.email,
    preferredContactMethod: serviceRequest.preferred_contact_method,
    projectDescription: serviceRequest.project_description,
    urgency: serviceRequest.urgency,
    propertyType: serviceRequest.property_type,
    status: serviceRequest.status
  };
}

export default router;
