import { httpError } from "../utils/http-error.js";

var transitions = {
  new: ["accepted", "canceled"],
  accepted: ["scheduled", "canceled"],
  scheduled: ["in_progress", "canceled"],
  in_progress: ["completed", "canceled"],
  completed: [],
  canceled: []
};

export function assertTransitionAllowed(currentStatus, nextStatus) {
  var allowed = transitions[currentStatus] || [];
  if (allowed.indexOf(nextStatus) === -1) {
    throw httpError(409, "Invalid status transition: " + currentStatus + " -> " + nextStatus);
  }
}

export function isTerminalStatus(status) {
  return status === "completed" || status === "canceled";
}
