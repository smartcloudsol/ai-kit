import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import type { AnswerPresentation } from "@smart-cloud/ai-kit-core";

import { runChatStreamTurn, summarizeChatActivities, isToolActivity, isSummaryActivity, chatPresentationVersionForCapabilities, type ChatActivity } from "../src/ai-chatbot/chatStream.ts";

const envelope = (
  type: string,
  seq: number,
  payload: Record<string, unknown>,
) => ({
  version: 1,
  type,
  conversationId: "session-1",
  turnId: "turn-1",
  eventId: `event-${seq}`,
  seq,
  timestamp: "2026-09-25T00:00:00.000Z",
  payload,
});

const presentation: AnswerPresentation = { schemaVersion: 1, groups: [{ templateId: "generic", templateRevision: 1, layout: "cards", entities: [{
  ref: "card-1", entityId: "verified-1", title: "Verified item", attributes: [], links: [],
  provenance: { kind: "external_mcp", sourceId: "approved-server", evidenceId: "evidence-1", checkedAt: "2026-10-11T12:00:00.000Z" },
}] }] };

class FakeSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly handleSend: (command: Record<string, unknown>, socket: FakeSocket) => void;

  constructor(handleSend: (command: Record<string, unknown>, socket: FakeSocket) => void) {
    this.handleSend = handleSend;
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }

  send(value: string) {
    this.handleSend(JSON.parse(value) as Record<string, unknown>, this);
  }

  emit(type: string, seq: number, payload: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(envelope(type, seq, payload)) });
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }
}

test("presentation capabilities opt into v2 only when explicitly advertised", () => {
  for (const capabilities of [undefined, {}, { "ai.answer.presentation": 1 }, { "ai.answer.presentation": "2" }, { "ai.answer.presentation": 3 }]) {
    assert.equal(chatPresentationVersionForCapabilities(capabilities), 1);
  }
  assert.equal(chatPresentationVersionForCapabilities({ "ai.answer.presentation": 2 }), 2);
});

test("unverified, unavailable and failing capability discovery cannot opt into v2", async () => {
  const require = createRequire(import.meta.url);
  const source = await readFile(new URL("../src/ai-chatbot/chatStream.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function discoverChatPresentationVersion(");
  const end = source.indexOf("/** The backend advertises", start);
  assert.ok(start > 0 && end > start);
  const transformed = await require("esbuild").transform(source.slice(start, end), { loader: "ts", format: "cjs" });
  const module = { exports: {} as { discoverChatPresentationVersion: () => Promise<number> } };
  let backend: unknown;
  vm.runInNewContext(transformed.code, { module, exports: module.exports, chatPresentationVersionForCapabilities,
    resolveBackend: async () => { if (backend instanceof Error) throw backend; return backend; } });
  for (const status of ["verified", "unknown", undefined]) for (const available of [true, false]) {
    backend = { available, compatibility: { status, manifest: { capabilities: { "ai.answer.presentation": 2 } } } };
    assert.equal(await module.exports.discoverChatPresentationVersion(), available && status === "verified" ? 2 : 1);
  }
  backend = new Error("Unavailable manifest");
  assert.equal(await module.exports.discoverChatPresentationVersion(), 1);
});

test("stream start and resume consistently use the negotiated display schema without changing transport version", async () => {
  for (const presentationVersion of [undefined, 1, 2] as const) for (const resume of [false, true]) {
    const negotiated = presentationVersion ?? 1;
    const display = { ...presentation, schemaVersion: negotiated };
    const result = await runChatStreamTurn({
      url: "wss://stream.example.test/chat", text: "hello", locale: "en", requestId: "request-negotiated",
      presentationVersion,
      ...(resume ? { resume: { requestId: "request-negotiated", conversationId: "session-1", turnId: "turn-1", lastSeq: 0 } } : {}),
      signal: new AbortController().signal,
      ticketProvider: async () => ({ ticket: "safe-ticket", sessionId: "session-1", expiresAt: new Date(Date.now() + 60_000).toISOString() }),
      socketFactory: () => new FakeSocket((command, socket) => queueMicrotask(() => {
        assert.equal(command.type, resume ? "turn.resume" : "turn.start");
        assert.equal(command.version, 1);
        assert.equal(command.presentationVersion, negotiated);
        if (!resume) socket.emit("turn.accepted", 0, { sessionId: "session-1", assistantMessageId: "assistant-1", status: "running" });
        socket.emit(resume ? "turn.snapshot" : "answer.completed", 1, { result: "Source-only answer", presentation: display, completion: "complete", lastSeq: 1, active: false });
      })) as unknown as WebSocket,
      onView: () => {},
    });
    assert.deepEqual(result.presentation, display);
  }
});

test("v2 gap recovery preserves negotiated typed display values in every resume frame", async () => {
  const typed = { ...presentation, schemaVersion: 2, locale: "en-US", groups: presentation.groups.map(group => ({ ...group,
    entities: group.entities.map(entity => ({ ...entity, attributes: [
      { id: "price", label: "Verified price", type: "money", role: "price", value: { amount: "0", currency: "USD", unit: "major" } },
      { id: "availability", label: "Verified status", type: "status", role: "availability", value: { code: "unknown", label: "Source did not report inventory", semantics: "inventory" } },
    ] })),
  })) };
  const commands: Record<string, unknown>[] = [];
  const result = await runChatStreamTurn({
    url: "wss://stream.example.test/chat", text: "hello", locale: "en", requestId: "request-v2-gap", presentationVersion: 2,
    signal: new AbortController().signal,
    ticketProvider: async () => ({ ticket: "safe-ticket", sessionId: "session-1", expiresAt: new Date(Date.now() + 60_000).toISOString() }),
    socketFactory: () => new FakeSocket((command, socket) => queueMicrotask(() => {
      commands.push(command);
      assert.equal(command.presentationVersion, 2);
      if (command.type === "turn.start") {
        socket.emit("turn.accepted", 0, { sessionId: "session-1", assistantMessageId: "assistant-1", status: "running" });
        socket.emit("presentation.upsert", 2, { messageId: "assistant-1", presentation: typed });
      } else {
        socket.emit("answer.delta", 1, { text: "Verified source answer" });
        socket.emit("answer.completed", 3, { completion: "complete" });
      }
    })) as unknown as WebSocket,
    onView: () => {},
  });
  assert.deepEqual(commands.map(command => command.type), ["turn.start", "turn.resume"]);
  assert.deepEqual(result.presentation, typed);
  assert.equal(result.result, "Verified source answer");
});

test("validated presentation survives completion and completed snapshot replay", async () => {
  for (const terminal of ["answer.completed", "turn.snapshot"]) {
    const result = await runChatStreamTurn({
      url: "wss://stream.example.test/chat", text: "hello", locale: "en", requestId: "request-cards",
      signal: new AbortController().signal,
      ticketProvider: async () => ({ ticket: "safe-ticket", sessionId: "session-1", expiresAt: new Date(Date.now() + 60_000).toISOString() }),
      socketFactory: () => new FakeSocket((_command, socket) => queueMicrotask(() => {
        socket.emit("turn.accepted", 0, { sessionId: "session-1", assistantMessageId: "assistant-1", status: "running" });
        socket.emit(terminal, 1, { result: "Text fallback", presentation, completion: "complete", lastSeq: 1, active: false });
      })) as unknown as WebSocket,
      onView: () => {},
    });
    assert.equal(result.result, "Text fallback");
    assert.deepEqual(result.presentation, presentation);
  }
});

test("malformed presentation is ignored without losing streamed text", async () => {
  const result = await runChatStreamTurn({
    url: "wss://stream.example.test/chat", text: "hello", locale: "en", requestId: "request-invalid-cards",
    signal: new AbortController().signal,
    ticketProvider: async () => ({ ticket: "safe-ticket", sessionId: "session-1", expiresAt: new Date(Date.now() + 60_000).toISOString() }),
    socketFactory: () => new FakeSocket((_command, socket) => queueMicrotask(() => {
      socket.emit("turn.accepted", 0, { sessionId: "session-1", assistantMessageId: "assistant-1", status: "running" });
      socket.emit("answer.delta", 1, { text: "Retained text" });
      socket.emit("answer.completed", 2, { presentation: { ...presentation, schemaVersion: 3 }, completion: "complete" });
    })) as unknown as WebSocket,
    onView: () => {},
  });
  assert.equal(result.result, "Retained text");
  assert.equal(result.presentation, undefined);
});

test("snapshot reset discards cards from persisted partial stream state", async () => {
  const result = await runChatStreamTurn({
    url: "wss://stream.example.test/chat", text: "hello", locale: "en", requestId: "request-card-reset",
    resume: { requestId: "request-card-reset", conversationId: "session-1", turnId: "turn-1", lastSeq: 0 },
    initialView: { text: "Old partial text", presentation, activities: [], citations: [] },
    signal: new AbortController().signal,
    ticketProvider: async () => ({ ticket: "safe-ticket", sessionId: "session-1", expiresAt: new Date(Date.now() + 60_000).toISOString() }),
    socketFactory: () => new FakeSocket((_command, socket) => queueMicrotask(() => {
      socket.emit("turn.snapshot", 1, { reset: true, lastSeq: 1, active: true });
      socket.emit("answer.delta", 2, { text: "New answer" });
      socket.emit("turn.snapshot", 3, { lastSeq: 3, active: false });
    })) as unknown as WebSocket,
    onView: () => {},
  });
  assert.equal(result.result, "New answer");
  assert.equal(result.presentation, undefined);
});

test("large terminal omission retains validated presentation upsert and explicit invalid value clears it", async () => {
  for (const clear of [false, true]) {
    const text = "Large answer ".repeat(2200);
    const result = await runChatStreamTurn({
      url: "wss://stream.example.test/chat", text: "hello", locale: "en", requestId: "request-large-cards",
      signal: new AbortController().signal,
      ticketProvider: async () => ({ ticket: "safe-ticket", sessionId: "session-1", expiresAt: new Date(Date.now() + 60_000).toISOString() }),
      socketFactory: () => new FakeSocket((_command, socket) => queueMicrotask(() => {
        socket.emit("turn.accepted", 0, { sessionId: "session-1", assistantMessageId: "assistant-1", status: "running" });
        socket.emit("answer.delta", 1, { text });
        socket.emit("presentation.upsert", 2, { messageId: "assistant-1", presentation });
        socket.emit("answer.completed", 3, { completion: "complete", ...(clear ? { presentation: null } : {}) });
      })) as unknown as WebSocket, onView: () => {},
    });
    assert.equal(result.result, text);
    assert.deepEqual(result.presentation, clear ? undefined : presentation);
  }
});

test("large snapshot reset replay restores presentation without duplicating cards", async () => {
  const result = await runChatStreamTurn({
    url: "wss://stream.example.test/chat", text: "hello", locale: "en", requestId: "request-replay-cards",
    resume: { requestId: "request-replay-cards", conversationId: "session-1", turnId: "turn-1", lastSeq: 0, assistantMessageId: "assistant-1" },
    initialView: { text: "Old answer", presentation, activities: [], citations: [] },
    signal: new AbortController().signal,
    ticketProvider: async () => ({ ticket: "safe-ticket", sessionId: "session-1", expiresAt: new Date(Date.now() + 60_000).toISOString() }),
    socketFactory: () => new FakeSocket((_command, socket) => queueMicrotask(() => {
      socket.emit("turn.snapshot", 1, { reset: true, lastSeq: 1, active: true });
      socket.emit("answer.delta", 2, { text: "Replayed answer" });
      socket.emit("presentation.upsert", 3, { messageId: "assistant-1", presentation });
      socket.emit("presentation.upsert", 3, { messageId: "assistant-1", presentation });
      socket.emit("answer.completed", 4, { completion: "complete" });
    })) as unknown as WebSocket, onView: () => {},
  });
  assert.equal(result.result, "Replayed answer");
  assert.deepEqual(result.presentation, presentation);
});

test("presentation upsert for a different message is not rendered", async () => {
  const result = await runChatStreamTurn({
    url: "wss://stream.example.test/chat", text: "hello", locale: "en", requestId: "request-wrong-cards",
    signal: new AbortController().signal,
    ticketProvider: async () => ({ ticket: "safe-ticket", sessionId: "session-1", expiresAt: new Date(Date.now() + 60_000).toISOString() }),
    socketFactory: () => new FakeSocket((_command, socket) => queueMicrotask(() => {
      socket.emit("turn.accepted", 0, { sessionId: "session-1", assistantMessageId: "assistant-1", status: "running" });
      socket.emit("presentation.upsert", 1, { messageId: "other-message", presentation });
      socket.emit("answer.completed", 2, { result: "Text only", completion: "complete" });
    })) as unknown as WebSocket, onView: () => {},
  });
  assert.equal(result.presentation, undefined);
  assert.equal(result.result, "Text only");
});

test("reconnects with a fresh ticket and resumes the same turn without duplicate text", async () => {
  const commands: string[] = [];
  const urls: string[] = [];
  const views: string[] = [];
  const transportStates: string[] = [];
  let tickets = 0;
  let acceptedCount = 0;
  const result = await runChatStreamTurn({
    url: "wss://stream.example.test/chat",
    text: "hello",
    locale: "hu",
    requestId: "request-1",
    signal: new AbortController().signal,
    retryDelayMs: 0,
    ticketProvider: async () => ({
      ticket: `ticket-${++tickets}`,
      sessionId: "session-1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    socketFactory: (url) => {
      urls.push(url);
      return new FakeSocket((command, socket) => {
        commands.push(String(command.type));
        if (command.type === "turn.start") {
          assert.equal(command.presentationVersion, 1);
          queueMicrotask(() => {
            socket.emit("turn.accepted", 0, {
              sessionId: "session-1",
              userMessageId: "user-1",
              assistantMessageId: "assistant-1",
              status: "running",
            });
            socket.emit("answer.delta", 1, { messageId: "assistant-1", text: "Hello " });
            socket.emit("turn.accepted", 0, {
              sessionId: "session-1",
              userMessageId: "user-1",
              assistantMessageId: "assistant-1",
              status: "running",
            });
            socket.close();
          });
        } else if (command.type === "turn.resume") {
          assert.equal(command.presentationVersion, 1);
          assert.equal(command.turnId, "turn-1");
          assert.equal(command.afterSeq, 1);
          queueMicrotask(() => {
            socket.emit("turn.snapshot", 2, {
              lastSeq: 2,
              active: true,
              result: "Hello ",
              activities: [],
            });
            socket.emit("answer.delta", 3, { messageId: "assistant-1", text: "world" });
            socket.emit("answer.completed", 4, {
              messageId: "assistant-1",
              result: "",
              activities: [],
              completion: "complete",
            });
          });
        }
      }) as unknown as WebSocket;
    },
    onAccepted: (checkpoint) => {
      acceptedCount += 1;
      assert.equal(checkpoint.lastSeq, 0);
    },
    onView: (view) => views.push(view.text),
    onTransportState: (state) => {
      if (transportStates.at(-1) !== state) transportStates.push(state);
    },
  });

  assert.equal(result.result, "Hello world");
  assert.equal(result.messageId, "assistant-1");
  assert.equal(tickets, 2);
  assert.equal(acceptedCount, 1);
  assert.deepEqual(commands, ["turn.start", "turn.resume"]);
  assert.match(urls[0]!, /ticket=ticket-1/);
  assert.match(urls[1]!, /ticket=ticket-2/);
  assert.ok(views.includes("Hello "));
  assert.ok(views.includes("Hello world"));
  assert.deepEqual(transportStates, [
    "sending", "waiting", "receiving", "reconnecting", "waiting", "receiving",
  ]);
});

test("requests replay when events arrive out of order", async () => {
  const commands: string[] = [];
  const result = await runChatStreamTurn({
    url: "wss://stream.example.test/chat",
    text: "question",
    locale: "en",
    requestId: "request-2",
    signal: new AbortController().signal,
    ticketProvider: async () => ({
      ticket: "ticket",
      sessionId: "session-1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    socketFactory: () =>
      new FakeSocket((command, socket) => {
        commands.push(String(command.type));
        if (command.type === "turn.start") {
          queueMicrotask(() => {
            socket.emit("turn.accepted", 0, {
              sessionId: "session-1",
              userMessageId: "user-1",
              assistantMessageId: "assistant-1",
              status: "running",
            });
            socket.emit("answer.delta", 2, { messageId: "assistant-1", text: "world" });
          });
        } else if (command.type === "turn.resume") {
          assert.equal(command.afterSeq, 0);
          queueMicrotask(() => {
            socket.emit("answer.delta", 1, { messageId: "assistant-1", text: "Hello " });
            socket.emit("answer.completed", 3, {
              messageId: "assistant-1",
              result: "Hello world",
              activities: [],
              completion: "complete",
            });
          });
        }
      }) as unknown as WebSocket,
    onView: () => undefined,
  });

  assert.equal(result.result, "Hello world");
  assert.deepEqual(commands, ["turn.start", "turn.resume"]);
});

test("large-result reset snapshot rebuilds a completed answer from synthetic deltas", async () => {
  const views: string[] = [];
  const result = await runChatStreamTurn({
    url: "wss://stream.example.test/chat",
    text: "long answer request",
    locale: "hu",
    requestId: "request-3",
    sessionId: "session-1",
    resume: {
      requestId: "request-3",
      conversationId: "session-1",
      turnId: "turn-1",
      lastSeq: 7,
      assistantMessageId: "assistant-1",
    },
    initialView: {
      text: "stale partial",
      activities: [],
      citations: [{ citationId: "old", title: "Old source" }],
    },
    signal: new AbortController().signal,
    ticketProvider: async () => ({
      ticket: "ticket",
      sessionId: "session-1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    socketFactory: () =>
      new FakeSocket((command, socket) => {
        assert.equal(command.type, "turn.resume");
        assert.equal(command.afterSeq, 7);
        queueMicrotask(() => {
          socket.emit("turn.snapshot", 200, {
            lastSeq: 200,
            active: true,
            reset: true,
            activities: [],
          });
          socket.emit("answer.delta", 201, {
            messageId: "assistant-1",
            text: "long ",
          });
          socket.emit("answer.delta", 202, {
            messageId: "assistant-1",
            text: "answer",
          });
          socket.emit("answer.completed", 203, {
            messageId: "assistant-1",
            result: "",
            activities: [],
            completion: "complete",
          });
        });
      }) as unknown as WebSocket,
    onView: (view) => views.push(view.text),
  });

  assert.equal(result.result, "long answer");
  assert.ok(views.includes(""));
  assert.ok(!views.includes("stale partiallong "));
});

test("terminal failure and cancellation snapshots are not completed answers", async () => {
  for (const terminalType of ["turn.failed", "turn.cancelled"] as const) {
    await assert.rejects(
      runChatStreamTurn({
        url: "wss://stream.example.test/chat",
        text: "question",
        locale: "en",
        requestId: "request-4",
        resume: {
          requestId: "request-4",
          conversationId: "session-1",
          turnId: "turn-1",
          lastSeq: 0,
        },
        signal: new AbortController().signal,
        ticketProvider: async () => ({
          ticket: "ticket",
          sessionId: "session-1",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
        socketFactory: () =>
          new FakeSocket((command, socket) => {
            assert.equal(command.type, "turn.resume");
            queueMicrotask(() =>
              socket.emit("turn.snapshot", 1, {
                lastSeq: 1,
                active: false,
                terminalType,
                code: "GROUNDING_EVIDENCE_UNAVAILABLE",
                activities: [],
              }),
            );
          }) as unknown as WebSocket,
        onView: () => undefined,
      }),
      terminalType === "turn.cancelled"
        ? { name: "AbortError" }
        : { name: "ChatStreamError", code: "GROUNDING_EVIDENCE_UNAVAILABLE" },
    );
  }
});

test("shows a turn rejection before acceptance instead of waiting forever", async () => {
  await assert.rejects(
    runChatStreamTurn({
      url: "wss://stream.example.test/chat",
      text: "another question",
      locale: "hu",
      requestId: "request-busy",
      signal: new AbortController().signal,
      ticketProvider: async () => ({
        ticket: "ticket",
        sessionId: "session-1",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      socketFactory: () => new FakeSocket((command, socket) => {
        if (command.type === "turn.start") {
          queueMicrotask(() => socket.emit("turn.failed", 0, {
            code: "CONVERSATION_BUSY",
            messageKey: "chat.error.CONVERSATION_BUSY",
            status: 409,
            retryable: true,
          }));
        }
      }) as unknown as WebSocket,
      onView: () => undefined,
    }),
    { name: "ChatStreamError", code: "CONVERSATION_BUSY", status: 409 },
  );
});

test("keeps bounded safe site domains in completed web activity", async () => {
  let domains: string[] | undefined;
  await runChatStreamTurn({
    url: "wss://stream.example.test/chat",
    text: "search",
    locale: "en",
    requestId: "request-sites",
    signal: new AbortController().signal,
    ticketProvider: async () => ({
      ticket: "ticket",
      sessionId: "session-1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    socketFactory: () => new FakeSocket((command, socket) => {
      if (command.type === "turn.start") queueMicrotask(() => {
        socket.emit("turn.accepted", 0, { sessionId: "session-1" });
        socket.emit("activity.completed", 1, {
          activityId: "web-1",
          kind: "web_search",
          labelKey: "chat.activity.web_search",
          status: "completed",
          safeDomains: ["example.com", "another.example", "javascript:bad", "third.example"],
        });
        socket.emit("answer.completed", 2, { result: "Found", completion: "complete", activities: [{
          activityId: "web-1",
          kind: "web_search",
          labelKey: "chat.activity.web_search",
          status: "completed",
          safeDomains: ["example.com", "another.example", "javascript:bad", "third.example"],
        }] });
      });
    }) as unknown as WebSocket,
    onView: (view) => { domains = view.activities[0]?.safeDomains; },
  });
  assert.deepEqual(domains, ["example.com", "another.example", "third.example"]);
});

test("keeps thinking events in arrival order when their status changes", async () => {
  const activityViews: ChatActivity[][] = [];
  await runChatStreamTurn({
    url: "wss://stream.example.test/chat",
    text: "question",
    locale: "hu",
    requestId: "request-activity-order",
    signal: new AbortController().signal,
    ticketProvider: async () => ({
      ticket: "ticket",
      sessionId: "session-1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    socketFactory: () => new FakeSocket((command, socket) => {
      if (command.type === "turn.start") queueMicrotask(() => {
        socket.emit("turn.accepted", 0, { sessionId: "session-1" });
        socket.emit("activity.started", 1, {
          activityId: "thinking", kind: "thinking", labelKey: "chat.activity.thinking", status: "running",
        });
        socket.emit("activity.started", 2, {
          activityId: "search", kind: "knowledge_search", labelKey: "chat.activity.knowledge_search", status: "running",
        });
        socket.emit("activity.completed", 3, {
          activityId: "thinking", kind: "thinking", labelKey: "chat.activity.thinking", status: "completed",
        });
        socket.emit("activity.completed", 4, {
          activityId: "search", kind: "knowledge_search", labelKey: "chat.activity.knowledge_search", status: "completed",
        });
        socket.emit("answer.completed", 5, { result: "Answer", completion: "complete" });
      });
    }) as unknown as WebSocket,
    onView: (view) => activityViews.push(view.activities),
  });

  assert.deepEqual(activityViews.at(-1)?.map(({ activityId, status }) => [activityId, status]), [
    ["thinking", "completed"],
    ["search", "completed"],
  ]);
});

test("finished activity summary excludes thinking-only turns and counts real searches", () => {
  for (const kind of ["thinking", "checking_sources", "generating_response"] as const) {
    assert.equal(isToolActivity({ activityId: kind, kind, labelKey: kind, status: "completed" }), false);
  }
  assert.deepEqual(summarizeChatActivities([{
    activityId: "model-0", kind: "thinking", labelKey: "chat.activity.thinking", status: "completed",
  }]), { knowledgeSearches: 0, websites: 0, otherTools: 0 });
  assert.deepEqual(summarizeChatActivities([
    { activityId: "kb-1", kind: "knowledge_search", labelKey: "chat.activity.knowledge_search", status: "completed" },
    { activityId: "kb-2", kind: "knowledge_search", labelKey: "chat.activity.knowledge_search", status: "completed" },
    { activityId: "web-1", kind: "web_search", labelKey: "chat.activity.web_search", status: "completed", safeDomains: ["example.com", "docs.example.com"] },
    { activityId: "web-2", kind: "web_search", labelKey: "chat.activity.web_search", status: "completed", safeDomains: ["example.com"] },
    { activityId: "calc", kind: "calculation", labelKey: "chat.activity.calculation", status: "failed" },
  ]), { knowledgeSearches: 2, websites: 2, otherTools: 0 });
});

test("omits unnamed completed internal operations but retains errors and useful details", () => {
  const generic: ChatActivity = { activityId: "tool-1", kind: "other", labelKey: "chat.activity.other", status: "completed" };
  assert.equal(isSummaryActivity(generic), false);
  assert.deepEqual(summarizeChatActivities([generic]), { knowledgeSearches: 0, websites: 0, otherTools: 0 });
  assert.equal(isSummaryActivity({ ...generic, status: "failed" }), true);
  assert.equal(isSummaryActivity({ ...generic, query: "useful search" }), true);
  assert.equal(isSummaryActivity({ ...generic, resultCount: 0 }), true);
});

test("retains safe search details at completion and discards unsafe URL data", async () => {
  let finalActivities: ChatActivity[] = [];
  const activity = {
    activityId: "kb", kind: "knowledge_search", labelKey: "chat.activity.knowledge_search", status: "completed",
    query: "WordPress search", categoryCount: 2, subcategoryCount: -1, tagCount: 3, resultCount: 8,
    urls: ["https://example.com/docs?q=secret#part", "javascript:alert(1)", "http://localhost/admin", "https://user:password@example.com/"],
    internalResult: "not-for-the-client",
  };
  await runChatStreamTurn({
    url: "wss://stream.example.test/chat", text: "search", locale: "en", requestId: "request-details",
    signal: new AbortController().signal,
    ticketProvider: async () => ({ ticket: "ticket", sessionId: "session-1", expiresAt: new Date(Date.now() + 60_000).toISOString() }),
    socketFactory: () => new FakeSocket((command, socket) => {
      if (command.type === "turn.start") queueMicrotask(() => {
        socket.emit("turn.accepted", 0, { sessionId: "session-1" });
        socket.emit("activity.completed", 1, activity);
        // Large completions omit repeated activities; retain streamed details.
        socket.emit("answer.completed", 2, { result: "Found" });
      });
    }) as unknown as WebSocket,
    onView: (view) => { finalActivities = view.activities; },
  });
  assert.equal(finalActivities[0]?.query, "WordPress search");
  assert.equal(finalActivities[0]?.categoryCount, 2);
  assert.equal(finalActivities[0]?.subcategoryCount, undefined);
  assert.equal(finalActivities[0]?.tagCount, 3);
  assert.equal(finalActivities[0]?.resultCount, 8);
  assert.deepEqual(finalActivities[0]?.urls, ["https://example.com/docs"]);
  assert.doesNotMatch(JSON.stringify(finalActivities), /secret|password|not-for-the-client/);
});

test("retains bounded tool metadata through running, completion, reconnect snapshot and replay", async () => {
  const views: ChatActivity[][] = [];
  const params = { operation: "catalog_search", toolName: "search_catalog", providerLabel: "Demo Commerce" };
  const activity = { activityId: "catalog-1", kind: "other", labelKey: "chat.activity.other", status: "running", labelParams: { ...params, purpose: "private-instructions", arguments: { token: "private-token" } } };
  let connections = 0;
  await runChatStreamTurn({
    url: "wss://stream.example.test/chat", text: "products", locale: "en", requestId: "request-tool-metadata", retryDelayMs: 0,
    signal: new AbortController().signal,
    ticketProvider: async () => ({ ticket: "ticket", sessionId: "session-1", expiresAt: new Date(Date.now() + 60_000).toISOString() }),
    socketFactory: () => {
      connections += 1;
      return new FakeSocket((command, socket) => {
        if (command.type === "turn.start") queueMicrotask(() => {
          socket.emit("turn.accepted", 0, { sessionId: "session-1" });
          socket.emit("activity.started", 1, activity);
          socket.emit("activity.completed", 2, { ...activity, status: "completed" });
          socket.close();
        });
        else if (command.type === "turn.resume") queueMicrotask(() => {
          assert.equal(command.afterSeq, 2);
          socket.emit("turn.snapshot", 3, { lastSeq: 3, active: true, result: "", activities: [{ ...activity, status: "completed" }] });
          // A replayed event must neither duplicate nor overwrite newer state.
          socket.emit("activity.started", 1, activity);
          socket.emit("answer.completed", 4, { result: "Products", activities: [{ ...activity, status: "completed" }] });
        });
      }) as unknown as WebSocket;
    },
    onView: (view) => views.push(structuredClone(view.activities)),
  });
  assert.equal(connections, 2);
  const nonempty = views.filter((activities) => activities.length);
  assert.ok(nonempty.some((activities) => activities[0].status === "running"));
  assert.ok(nonempty.some((activities) => activities[0].status === "completed"));
  for (const activities of nonempty) {
    assert.equal(activities.length, 1);
    assert.deepEqual(activities[0].labelParams, params);
  }
  assert.equal(nonempty.at(-1)?.[0].status, "completed");
  assert.doesNotMatch(JSON.stringify(nonempty), /private-instructions|private-token|arguments|purpose/);
});

test("parser rejects unknown semantic operations and strips invalid names and raw payloads", async () => {
  let activities: ChatActivity[] = [];
  const external = { kind: "other", labelKey: "chat.activity.other", status: "completed" };
  await runChatStreamTurn({
    url: "wss://stream.example.test/chat", text: "products", locale: "en", requestId: "request-unsafe-tool-metadata",
    signal: new AbortController().signal,
    ticketProvider: async () => ({ ticket: "ticket", sessionId: "session-1", expiresAt: new Date(Date.now() + 60_000).toISOString() }),
    socketFactory: () => new FakeSocket((command, socket) => {
      if (command.type === "turn.start") queueMicrotask(() => {
        socket.emit("turn.accepted", 0, { sessionId: "session-1" });
        socket.emit("activity.completed", 1, { ...external, activityId: "unknown", labelParams: { operation: "run_anything", toolName: "secret_tool" } });
        socket.emit("activity.completed", 2, { ...external, activityId: "known", labelParams: { operation: "external_read", toolName: "<b>bad</b>", providerLabel: "x".repeat(65), arguments: "raw-private-args" }, rawResult: "raw-private-result" });
        socket.emit("answer.completed", 3, { result: "Done" });
      });
    }) as unknown as WebSocket,
    onView: (view) => { activities = view.activities; },
  });
  assert.equal(activities[0].labelParams, undefined);
  assert.deepEqual(activities[1].labelParams, { operation: "external_read" });
  assert.equal(isSummaryActivity(activities[1]), true);
  assert.doesNotMatch(JSON.stringify(activities), /secret_tool|raw-private|<b>|run_anything/);
});
