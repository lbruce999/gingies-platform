export function httpError(status, message, details) {
  var error = new Error(message);
  error.status = status;
  if (details) {
    error.details = details;
  }
  return error;
}
