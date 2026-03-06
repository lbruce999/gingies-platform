export function notFoundHandler(req, res) {
  res.status(404).json({
    error: "NotFound",
    message: "Route not found"
  });
}

export function errorHandler(error, req, res, next) {
  var status = error.status || 500;
  var payload = {
    error: status >= 500 ? "InternalServerError" : "RequestError",
    message: error.message || "Unexpected server error"
  };

  if (error.details) {
    payload.details = error.details;
  }

  if (status >= 500) {
    console.error("Unhandled error:", error);
  }

  res.status(status).json(payload);
}
