export var ROLES = ["homeowner", "contractor", "admin"];

export var SERVICE_TYPES = [
  "Plumbing",
  "Electrical",
  "HVAC",
  "Roofing",
  "Handyman",
  "Landscaping",
  "Cleaning",
  "Painting",
  "Moving",
  "General Home Repair"
];

export var JOB_STATUSES = ["new", "accepted", "scheduled", "in_progress", "completed", "canceled"];

export var SERVICE_REQUEST_STATUSES = ["new", "in_review", "contacted", "scheduled", "closed"];

export var PREFERRED_CONTACT_METHODS = ["phone", "email", "text"];

export var SERVICE_REQUEST_URGENCIES = ["emergency", "within_24_hours", "this_week", "flexible"];

export var PROPERTY_TYPES = [
  "single_family",
  "townhouse",
  "condo",
  "apartment",
  "multifamily",
  "commercial",
  "other"
];

export var ASSIGNMENT_STATUSES = ["pending", "accepted", "declined", "expired", "canceled"];

export var CONTRACTOR_STATUSES = ["active", "inactive", "suspended"];

export var NOTIFICATION_TYPES = [
  "job_assigned",
  "job_declined",
  "job_scheduled",
  "customer_message",
  "system_alert"
];
