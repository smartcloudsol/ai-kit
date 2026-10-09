import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("../src/chat-stream-types.ts", import.meta.url);

async function loadProtocol() {
  const source = await fs.readFile(sourceUrl, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const protocol = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
  return { protocol, source };
}

function envelope(overrides = {}) {
  return {
    version: 1,
    conversationId: "conversation-17",
    turnId: "turn-42",
    eventId: "event-3",
    seq: 3,
    timestamp: "2026-09-25T08:15:00.000Z",
    type: "answer.delta",
    payload: {
      messageId: "assistant-message-42",
      text: "Partial answer",
    },
    ...overrides,
  };
}

test("accepts a valid answer delta envelope", async () => {
  const { protocol } = await loadProtocol();
  const candidate = envelope();

  assert.deepEqual(protocol.parseChatStreamServerEvent(candidate), candidate);
});

test("accepts a valid terminal answer envelope", async () => {
  const { protocol } = await loadProtocol();
  const candidate = envelope({
    seq: 9,
    type: "answer.completed",
    payload: {
      messageId: "assistant-message-42",
      result: "Complete answer",
      citations: [],
      activities: [],
      completion: "complete",
      metadata: { stopReason: "end_turn" },
    },
  });

  assert.deepEqual(protocol.parseChatStreamServerEvent(candidate), candidate);
});

test("rejects unsupported protocol versions and event types", async () => {
  const { protocol } = await loadProtocol();

  assert.equal(
    protocol.parseChatStreamServerEvent(envelope({ version: 2 })),
    undefined,
  );
  assert.equal(
    protocol.parseChatStreamServerEvent(
      envelope({ type: "answer.future-event" }),
    ),
    undefined,
  );
});

test("rejects missing or empty envelope identity fields", async () => {
  const { protocol } = await loadProtocol();

  for (const field of ["conversationId", "turnId", "eventId", "timestamp"]) {
    const missing = envelope();
    delete missing[field];
    assert.equal(
      protocol.parseChatStreamServerEvent(missing),
      undefined,
      `missing ${field}`,
    );
    assert.equal(
      protocol.parseChatStreamServerEvent(envelope({ [field]: "" })),
      undefined,
      `empty ${field}`,
    );
  }
});

test("rejects negative and non-integer sequence numbers", async () => {
  const { protocol } = await loadProtocol();

  assert.equal(
    protocol.parseChatStreamServerEvent(envelope({ seq: -1 })),
    undefined,
  );
  assert.equal(
    protocol.parseChatStreamServerEvent(envelope({ seq: 1.5 })),
    undefined,
  );
});

test("rejects non-object payloads", async () => {
  const { protocol } = await loadProtocol();

  for (const payload of [null, "answer", 17, true, []]) {
    assert.equal(
      protocol.parseChatStreamServerEvent(envelope({ payload })),
      undefined,
    );
  }
});

test("does not expose reasoning or chain-of-thought server events", async () => {
  const { source } = await loadProtocol();

  assert.doesNotMatch(
    source,
    /["'](?:reasoning|chain[-_. ]?of[-_. ]?thought)[^"']*["']/i,
  );
});
