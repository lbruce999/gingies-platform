import test from "node:test";
import assert from "node:assert/strict";
import { createServiceRequestSchema } from "../src/routes/service-requests.routes.js";

function validPayload(overrides) {
  return Object.assign(
    {
      serviceType: "Plumbing",
      serviceSubtype: "Leak repair",
      address: "123 Main St",
      zipCode: "43215",
      city: "Columbus",
      state: "oh",
      firstName: "Jamie",
      lastName: "Taylor",
      phone: "555-019-0123",
      email: "JAMIE@example.com",
      preferredContactMethod: "text",
      projectDescription: "Kitchen sink is leaking under the cabinet.",
      urgency: "this_week",
      propertyType: "single_family"
    },
    overrides || {}
  );
}

test("service request validation accepts launch intake payloads", function () {
  var parsed = createServiceRequestSchema.safeParse(validPayload());

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.state, "OH");
  assert.equal(parsed.data.email, "jamie@example.com");
});

test("service request validation accepts zip-only location starts", function () {
  var parsed = createServiceRequestSchema.safeParse(
    validPayload({
      address: "",
      zipCode: "43215-1234"
    })
  );

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.address, undefined);
});

test("service request validation rejects invalid launch data", function () {
  var cases = [
    validPayload({ email: "not-an-email" }),
    validPayload({ zipCode: "4321" }),
    validPayload({ serviceType: "Carpentry" }),
    validPayload({ address: "", zipCode: "" }),
    validPayload({ status: "closed" })
  ];

  cases.forEach(function (payload) {
    var parsed = createServiceRequestSchema.safeParse(payload);
    assert.equal(parsed.success, false);
  });
});
