import { test } from "node:test";
import assert from "node:assert/strict";
import { runLoop } from "../src/loop.js";

const FALLBACK = "Just go Berseh Food Centre lah.";

/**
 * runLoop is not a pure function, so these two cases stub global fetch
 * rather than reaching the network. They guard the guard clause only.
 */
function stubModelReply(content) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { role: "assistant", content } }] }),
  });
  return () => {
    globalThis.fetch = original;
  };
}

test("falls back when the Places key is missing", async () => {
  const reply = await runLoop([], "where should I eat lunch?", {});
  assert.equal(reply, FALLBACK);
});

test("answers food questions instead of falling back", async () => {
  const restore = stubModelReply("Go Tekka Centre, the mee goreng there damn shiok.");
  try {
    for (const message of [
      "where should I eat lunch?",
      "I am hungry, any food nearby?",
      "recommend a hawker centre or restaurant to makan",
    ]) {
      const reply = await runLoop([], message, {
        GOOGLE_PLACES_API_KEY: "test-key",
        OPENCODE_API_KEY: "test-key",
      });
      assert.notEqual(reply, FALLBACK, `"${message}" hit the fallback`);
    }
  } finally {
    restore();
  }
});
