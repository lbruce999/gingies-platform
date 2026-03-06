import { httpError } from "../utils/http-error.js";

export function validate(schema, source) {
  return function (req, res, next) {
    var target = source === "query" ? req.query : req.body;
    var parsed = schema.safeParse(target);

    if (!parsed.success) {
      return next(
        httpError(
          400,
          "Validation failed",
          parsed.error.issues.map(function (issue) {
            return {
              path: issue.path.join("."),
              message: issue.message
            };
          })
        )
      );
    }

    if (source === "query") {
      req.query = parsed.data;
    } else {
      req.body = parsed.data;
    }

    next();
  };
}
