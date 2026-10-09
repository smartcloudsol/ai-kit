import assert from "node:assert/strict";
import test from "node:test";

import { runChatStreamTurn, summarizeChatActivities, isToolActivity, isSummaryActivity, type ChatActivity } from "../src/ai-chatbot/chatStream.ts";

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
