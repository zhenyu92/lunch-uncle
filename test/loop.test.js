import { test } from "node:test";
import assert from "node:assert/strict";
import { runLoop } from "../src/loop.js";

const FALLBACK = "Just go Berseh Food Centre lah.";
const KEYS = { GOOGLE_PLACES_API_KEY: "test-key", OPENCODE_API_KEY: "test-key" };

/**
 * runLoop does IO, so these tests stub global fetch instead of reaching the
 * network. Model calls are scripted; anything else is a tool call and gets an
 * empty but well-formed payload back.
 */
function stubFetch(modelMessages) {
  const original = globalThis.fetch;
  const remaining = [...modelMessages];
  const state = { modelCalls: 0 };

  globalThis.fetch = async (url) => {
    const isModel = String(url).includes("/chat/completions");
    if (!isModel) {
      return { ok: true, json: async () => ({ places: [] }) };
    }
    state.modelCalls += 1;
    const message = remaining.length > 1 ? remaining.shift() : remaining[0];
    return { ok: true, json: async () => ({ choices: [{ message }] }) };
  };

  state.restore = () => {
    globalThis.fetch = original;
  };
  return state;
}

const say = (content) => ({ role: "assistant", content });
const callTool = () => ({
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id: "call_1",
      function: { name: "find_lunch_places", arguments: '{"query":"lunch"}' },
    },
  ],
});

test("falls back when the Places key is missing", async () => {
  assert.equal(await runLoop([], "where should I eat lunch?", {}), FALLBACK);
});

test("answers food questions instead of falling back", async () => {
  const reply = "Go Tekka Centre, the mee goreng there damn shiok.";
  const stub = stubFetch([say(reply)]);
  try {
    for (const message of [
      "where should I eat lunch?",
      "I am hungry, any food nearby?",
      "recommend a hawker centre or restaurant to makan",
    ]) {
      assert.equal(await runLoop([], message, KEYS), reply, `failed on: ${message}`);
    }
  } finally {
    stub.restore();
  }
});

test("runs tool calls and then returns the model's answer", async () => {
  const stub = stubFetch([callTool(), say("Berseh Food Centre, go now.")]);
  try {
    const reply = await runLoop([], "where should I eat lunch?", KEYS);
    assert.equal(reply, "Berseh Food Centre, go now.");
    assert.equal(stub.modelCalls, 2);
  } finally {
    stub.restore();
  }
});

test("gives up after MAX_ROUNDS when the model keeps calling tools", { timeout: 5000 }, async () => {
  const stub = stubFetch([callTool()]);
  try {
    const reply = await runLoop([], "where should I eat lunch?", KEYS);
    assert.match(reply, /tried too many times/);
    assert.equal(stub.modelCalls, 8);
  } finally {
    stub.restore();
  }
});
