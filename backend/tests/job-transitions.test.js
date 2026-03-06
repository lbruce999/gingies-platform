import test from "node:test";
import assert from "node:assert/strict";
import { assertTransitionAllowed, isTerminalStatus } from "../src/services/job-transitions.js";

test("allows valid transitions", function () {
  assert.doesNotThrow(function () {
    assertTransitionAllowed("new", "accepted");
  });
  assert.doesNotThrow(function () {
    assertTransitionAllowed("accepted", "scheduled");
  });
  assert.doesNotThrow(function () {
    assertTransitionAllowed("scheduled", "in_progress");
  });
  assert.doesNotThrow(function () {
    assertTransitionAllowed("in_progress", "completed");
  });
});

test("rejects invalid transitions", function () {
  assert.throws(function () {
    assertTransitionAllowed("new", "completed");
  });
  assert.throws(function () {
    assertTransitionAllowed("completed", "scheduled");
  });
});

test("terminal status detection", function () {
  assert.equal(isTerminalStatus("completed"), true);
  assert.equal(isTerminalStatus("canceled"), true);
  assert.equal(isTerminalStatus("scheduled"), false);
});
