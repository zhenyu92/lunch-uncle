import { test } from "node:test";
import assert from "node:assert/strict";
import { executeTool, CT_HUB_2, haversineMetres } from "../src/tools.js";

/**
 * findLunchPlaces does IO, so this stubs global fetch. It is here rather than
 * in formatters.test.js because the thing worth guarding is the request we
 * send, not the shape of the response.
 */
function stubPlaces(places) {
  const original = globalThis.fetch;
  const sent = {};
  globalThis.fetch = async (url, options) => {
    sent.url = String(url);
    sent.body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ places }) };
  };
  sent.restore = () => {
    globalThis.fetch = original;
  };
  return sent;
}

test("searches around CT Hub 2, not a hardcoded point in the east", async () => {
  const stub = stubPlaces([]);
  try {
    await executeTool("find_lunch_places", { query: "chicken rice" }, {
      GOOGLE_PLACES_API_KEY: "test-key",
    });
    assert.deepEqual(stub.body.locationBias.circle.center, CT_HUB_2);
  } finally {
    stub.restore();
  }
});

test("reports distances measured from CT Hub 2", async () => {
  // Golden Mile Food Centre: about 1 km from the office, 7 km from the old centre.
  const goldenMile = { latitude: 1.3025, longitude: 103.8631 };
  const stub = stubPlaces([
    { displayName: { text: "Golden Mile Food Centre" }, location: goldenMile },
  ]);
  try {
    const raw = await executeTool("find_lunch_places", { query: "hawker" }, {
      GOOGLE_PLACES_API_KEY: "test-key",
    });
    const [place] = JSON.parse(raw).places;
    const expected = Math.round(haversineMetres(CT_HUB_2, goldenMile));
    assert.equal(place.distance_m, expected);
    assert.ok(place.distance_m < 1200, `expected a walk, got ${place.distance_m} m`);
  } finally {
    stub.restore();
  }
});

test("reports an error instead of throwing when Places rejects the request", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  try {
    const raw = await executeTool("find_lunch_places", { query: "laksa" }, {
      GOOGLE_PLACES_API_KEY: "test-key",
    });
    assert.deepEqual(JSON.parse(raw), { error: "Places API returned 429" });
  } finally {
    globalThis.fetch = original;
  }
});
