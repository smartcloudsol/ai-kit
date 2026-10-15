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

test("presentation negotiation is an optional literal version on both start and resume, not cancellation", async () => {
  const { source } = await loadProtocol();
  const parsed = ts.createSourceFile("chat-stream-types.ts", source, ts.ScriptTarget.Latest, true);
  const command = parsed.statements.find((statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === "ChatStreamClientCommand");
  assert.ok(command && ts.isUnionTypeNode(command.type));
  for (const branch of command.type.types) {
    assert.ok(ts.isTypeLiteralNode(branch));
    const discriminator = branch.members.find((member) => member.name?.getText(parsed) === "type");
    const flag = branch.members.find((member) => member.name?.getText(parsed) === "presentationVersion");
    const kind = discriminator.type.literal.text;
    if (kind === "turn.start" || kind === "turn.resume") {
      assert.ok(flag?.questionToken, `${kind} retains legacy requests without negotiation`);
      assert.ok(ts.isUnionTypeNode(flag.type));
      assert.deepEqual(flag.type.types.map(type => {
        assert.ok(ts.isLiteralTypeNode(type) && ts.isNumericLiteral(type.literal));
        return type.literal.text;
      }), ["1", "2", "3"], `${kind} advertises only the supported presentation versions`);
    } else {
      assert.equal(flag, undefined, "cancellation does not negotiate rendering capabilities");
    }
  }
});

test("accepts an additive presentation upsert frame without changing the stream protocol version", async () => {
  const { protocol } = await loadProtocol();
  const candidate = envelope({ type: "presentation.upsert", payload: {
    messageId: "assistant-message-42", presentation: { schemaVersion: 1, groups: [] },
  } });
  assert.equal(protocol.CHAT_STREAM_PROTOCOL_VERSION, 1);
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
