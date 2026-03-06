import { httpError } from "./http-error.js";

var UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuid(value, fieldName) {
  if (!UUID_REGEX.test(String(value || ""))) {
    throw httpError(400, (fieldName || "id") + " must be a valid UUID");
  }
}
