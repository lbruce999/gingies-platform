import test from "node:test";
import assert from "node:assert/strict";
import { CITY_COORDS, resolveCoords, haversineMiles } from "../src/services/distance.js";

test("resolveCoords returns known city coords", function () {
  assert.deepEqual(resolveCoords("Columbus"), CITY_COORDS.columbus);
  assert.deepEqual(resolveCoords("Downtown Dayton, OH"), CITY_COORDS.dayton);
});

test("resolveCoords uses explicit lat/lng when provided", function () {
  var coords = resolveCoords("Columbus", 40.01, -82.95);
  assert.deepEqual(coords, { lat: 40.01, lng: -82.95 });
});

test("haversineMiles returns null for missing inputs", function () {
  assert.equal(haversineMiles(null, CITY_COORDS.columbus), null);
});

test("haversineMiles returns deterministic positive distance", function () {
  var miles = haversineMiles(CITY_COORDS.columbus, CITY_COORDS.dayton);
  assert.equal(Number.isFinite(miles), true);
  assert.equal(miles > 0, true);
});
