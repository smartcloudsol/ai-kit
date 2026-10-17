import {
  decideCapability,
  dispatchBackend,
  resolveBackend,
  CATALOG_PAGE_HANDLE,
  parseConfirmedVisitorAction,
  type ConfirmedVisitorAction,
  type VisitorActionProposal,
  type VisitorActionResult,
  type ProcessedCitations,
  type PromptResult,
  type AnswerPresentation,
} from "@smart-cloud/ai-kit-core";
import { safePublicActivityParams } from "./activityPresentation.ts";
import { normalizeAnswerPresentation } from "./answer-presentation-state.ts";
import { normalizeVisitorActions, normalizeVisitorActionResult } from "./visitor-action-state.ts";

export type ChatActivity = {
  activityId: string;
  kind:
    | "knowledge_search"
    | "web_search"
    | "web_read"
    | "calculation"
    | "script"
    | "validation"
    | "thinking"
    | "generating_response"
    | "checking_sources"
    | "other";
  labelKey: string;
  labelParams?: Record<string, string | number>;
  safeDomain?: string;
  safeDomains?: string[];
  query?: string;
  categoryCount?: number;
  subcategoryCount?: number;
  tagCount?: number;
  documentCount?: number;
  resultCount?: number;
  urls?: string[];
  status: "running" | "completed" | "failed";
};

export type ChatStreamCheckpoint = {
  requestId: string;
  conversationId: string;
  turnId: string;
  lastSeq: number;
  assistantMessageId?: string;
};

export type ChatStreamView = {
  text: string;
  visitorActions?: VisitorActionProposal[];
  visitorActionResult?: VisitorActionResult;
  presentation?: AnswerPresentation;
  activities: ChatActivity[];
  citations: StreamCitation[];
  checkpoint?: ChatStreamCheckpoint;
};

export type StreamCitation = {
  citationId: string;
  docId?: string;
  chunkId?: string;
  title?: string;
  sourceUrl?: string;
  snippet?: string;
};

export type ChatStreamResult = {
  result: string;
  visitorActions?: VisitorActionProposal[];
  visitorActionResult?: VisitorActionResult;
  presentation?: AnswerPresentation;
  sessionId: string;
  messageId?: string;
  citations?: ProcessedCitations | StreamCitation[];
  metadata?: PromptResult["metadata"];
  completion: "complete" | "partial" | "truncated";
};

type ChatStreamEvent = {
  version: 1;
  type:
    | "turn.accepted"
    | "activity.started"
    | "activity.completed"
    | "activity.failed"
    | "answer.delta"
    | "presentation.upsert"
    | "citation.upsert"
    | "answer.completed"
    | "turn.failed"
    | "turn.cancelled"
    | "turn.snapshot";
  conversationId: string;
  turnId: string;
  eventId: string;
  seq: number;
  timestamp: string;
  payload: Record<string, unknown>;
};

type StreamTicket = { ticket: string; expiresAt: string; sessionId: string };

export type ChatStreamOptions = {
  url: string;
  text: string;
  locale: string;
  /** Selected only after a verified backend capability advertises this schema. */
  presentationVersion?: 1 | 2 | 3;
  /** Selected only after verified ai.catalog.pagination capability discovery; handles contain no client-selected queries. */
  catalogPageVersion?: 1;
  catalogContinuation?: string;
  visitorActionVersion?: 1 | 2;
  visitorAction?: ConfirmedVisitorAction;
  sessionId?: string;
  requestId: string;
  resume?: ChatStreamCheckpoint;
  initialView?: ChatStreamView;
  signal: AbortSignal;
  onView: (view: ChatStreamView) => void;
  onAccepted?: (checkpoint: ChatStreamCheckpoint, sessionId: string) => void;
  onSession?: (sessionId: string) => void;
  onSocket?: (socket: WebSocket | null) => void;
  onTransportState?: (state: "sending" | "waiting" | "receiving" | "reconnecting") => void;
  /** Transport seams used by deterministic replay tests. */
  ticketProvider?: (sessionId: string | undefined, signal: AbortSignal) => Promise<StreamTicket>;
  socketFactory?: (url: string) => WebSocket;
  retryDelayMs?: number;
};

export class ChatStreamError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status?: number;
  readonly requestId?: string;

  constructor(
    message: string,
    code: string,
    retryable = false,
    status?: number,
    requestId?: string,
  ) {
    super(message);
    this.name = "ChatStreamError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
    this.requestId = requestId;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseEvent(value: unknown): ChatStreamEvent | undefined {
  const event = asRecord(value);
  const payload = asRecord(event?.payload);
  if (
    event?.version !== 1 ||
    !payload ||
    typeof event.type !== "string" ||
    ![
      "turn.accepted",
      "activity.started",
      "activity.completed",
      "activity.failed",
      "answer.delta",
      "presentation.upsert",
      "citation.upsert",
      "answer.completed",
      "turn.failed",
      "turn.cancelled",
      "turn.snapshot",
    ].includes(event.type) ||
    typeof event.conversationId !== "string" ||
    !event.conversationId ||
    typeof event.turnId !== "string" ||
    !event.turnId ||
    typeof event.eventId !== "string" ||
    !event.eventId ||
    !Number.isSafeInteger(event.seq) ||
    (event.seq as number) < 0
  ) {
    return undefined;
  }
  return event as ChatStreamEvent;
}

function parseActivity(value: unknown): ChatActivity | undefined {
  const activity = asRecord(value);
  if (
    !activity ||
    typeof activity.activityId !== "string" ||
    typeof activity.labelKey !== "string" ||
    ![
      "knowledge_search",
      "web_search",
      "web_read",
      "calculation",
      "script",
      "validation",
      "thinking",
      "generating_response",
      "checking_sources",
      "other",
    ].includes(String(activity.kind)) ||
    !["running", "completed", "failed"].includes(String(activity.status))
  ) {
    return undefined;
  }
  const safeDomains = Array.isArray(activity.safeDomains)
    ? activity.safeDomains
        .filter((domain): domain is string =>
          typeof domain === "string" &&
          domain.length <= 253 &&
          /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain),
        )
        .slice(0, 10)
    : undefined;
  const details: Pick<ChatActivity, "query" | "categoryCount" | "subcategoryCount" | "tagCount" | "documentCount" | "resultCount" | "urls"> = {};
  if (typeof activity.query === "string") {
    // eslint-disable-next-line no-control-regex -- Activity text must not include control characters.
    details.query = activity.query.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 300);
  }
  for (const key of ["categoryCount", "subcategoryCount", "tagCount", "documentCount", "resultCount"] as const) {
    const count = activity[key];
    if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) details[key] = count;
  }
  if (Array.isArray(activity.urls)) {
    details.urls = [...new Set(activity.urls.flatMap((value) => {
      if (typeof value !== "string" || value.length > 2_000) return [];
      try {
        const url = new URL(value);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return [];
        if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(url.hostname) || /\.(?:local|localhost|internal)$/i.test(url.hostname)) return [];
        url.search = "";
        url.hash = "";
        return [url.href];
      } catch { return []; }
    }))].slice(0, 10);
  }
  return {
    activityId: activity.activityId,
    kind: activity.kind as ChatActivity["kind"],
    labelKey: activity.labelKey,
    labelParams: safePublicActivityParams(activity.labelParams),
    status: activity.status as ChatActivity["status"],
    safeDomains,
    ...(typeof activity.safeDomain === "string" && /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(activity.safeDomain)
      ? { safeDomain: activity.safeDomain } : {}),
    ...details,
  };
}

export function isToolActivity(activity: ChatActivity): boolean {
  return !["thinking", "generating_response", "checking_sources"].includes(activity.kind);
}

/** Display useful execution history plus the latest active stage, not old thinking rows.
 * The full activity list stays intact for persistence, diagnostics and replay.
 */
export function visibleProgressActivities(activities: readonly ChatActivity[]): ChatActivity[] {
  let lastStage: ChatActivity | undefined;
  for (const activity of activities) if (!isToolActivity(activity)) lastStage = activity;
  return activities.filter(activity => isToolActivity(activity) ||
    (activity === lastStage && activity.status === "running"));
}

/** Completed history must not leave a busy turn without a current status caption. */
export function needsProgressFallback(activities: readonly ChatActivity[], busy: boolean): boolean {
  return busy && !visibleProgressActivities(activities).some(activity => activity.status === "running");
}

/** An unnamed successful internal operation is not useful visitor-facing history. */
export function isSummaryActivity(activity: ChatActivity): boolean {
  if (!isToolActivity(activity)) return false;
  return activity.kind !== "other" || activity.status !== "completed" || Boolean(
    activity.query || activity.urls?.length || activity.safeDomains?.length || activity.safeDomain ||
    activity.resultCount !== undefined || safePublicActivityParams(activity.labelParams),
  );
}

function parseCitation(value: unknown): StreamCitation | undefined {
  const citation = asRecord(value);
  if (!citation || typeof citation.citationId !== "string" || !citation.citationId) {
    return undefined;
  }
  const sourceUrl = citation.sourceUrl;
  if (typeof sourceUrl === "string") {
    try {
      const url = new URL(sourceUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return { ...citation, sourceUrl: undefined } as StreamCitation;
      }
    } catch {
      return { ...citation, sourceUrl: undefined } as StreamCitation;
    }
  }
  return citation as StreamCitation;
}

function parseActivities(value: unknown): ChatActivity[] {
  return Array.isArray(value)
    ? value.map(parseActivity).filter((item): item is ChatActivity => !!item)
    : [];
}

export function summarizeChatActivities(activities: ChatActivity[]): {
  knowledgeSearches: number;
  websites: number;
  otherTools: number;
} {
  const completed = activities.filter((activity) => activity.status === "completed" && isSummaryActivity(activity));
  return {
    knowledgeSearches: completed.filter((activity) => activity.kind === "knowledge_search").length,
    websites: new Set(completed.flatMap((activity) =>
      activity.kind === "web_search" || activity.kind === "web_read"
        ? activity.safeDomains ?? []
        : [],
    )).size,
    otherTools: completed.filter((activity) =>
      activity.kind === "calculation" ||
      activity.kind === "script" ||
      activity.kind === "validation" ||
      activity.kind === "other",
    ).length,
  };
}

function abortError(): Error {
  return new DOMException("Chat turn cancelled", "AbortError");
}

export function chatPresentationVersionForCapabilities(capabilities?: Record<string, unknown>): 1 | 2 | 3 {
  const version = capabilities?.["ai.answer.presentation"];
  return version === 3 ? 3 : version === 2 ? 2 : 1;
}

export function chatCatalogPageVersionForCapabilities(capabilities?: Record<string, unknown>): 1 | undefined {
  return capabilities?.["ai.catalog.pagination"] === 1 ? 1 : undefined;
}

export function chatVisitorActionVersionForCapabilities(capabilities?: Record<string, unknown>): 1 | 2 | undefined {
  const version = capabilities?.["ai.visitor.actions"];
  // Keep the base capability at 1 for already published clients. The additive
  // opt-in selects richer envelopes without disabling their v1 consent flow.
  return version === 2 || (version === 1 && capabilities?.["ai.visitor.actions.v2"] === 1) ? 2 : version === 1 ? 1 : undefined;
}

export async function discoverChatVisitorActionVersion(): Promise<1 | 2 | undefined> {
  try {
    const backend = await resolveBackend();
    if (!backend.available || backend.compatibility?.status !== "verified") return undefined;
    const manifest = backend.compatibility.manifest as { capabilities?: Record<string, unknown> } | undefined;
    return chatVisitorActionVersionForCapabilities(manifest?.capabilities);
  } catch { return undefined; }
}

/** The same negotiation applies to HTTP prompts and every stream resume frame. */
export async function discoverChatPresentationVersion(): Promise<1 | 2 | 3> {
  try {
    const backend = await resolveBackend();
    if (!backend.available || backend.compatibility?.status !== "verified") return 1;
    const manifest = backend.compatibility.manifest as { capabilities?: Record<string, unknown> } | undefined;
    return chatPresentationVersionForCapabilities(manifest?.capabilities);
  } catch { return 1; }
}

/** Older or unverified backends must never receive the new catalog request fields. */
export async function discoverChatCatalogPageVersion(): Promise<1 | undefined> {
  try {
    const backend = await resolveBackend();
    if (!backend.available || backend.compatibility?.status !== "verified") return undefined;
    const manifest = backend.compatibility.manifest as { capabilities?: Record<string, unknown> } | undefined;
    return chatCatalogPageVersionForCapabilities(manifest?.capabilities);
  } catch { return undefined; }
}

/** The backend advertises streaming only when its WebSocket route is ready. */
export async function discoverChatStreamUrl(): Promise<string | undefined> {
  if (typeof WebSocket === "undefined") return undefined;
  try {
    const backend = await resolveBackend();
    if (!backend.available || backend.compatibility?.status !== "verified") {
      return undefined;
    }
    const manifest = backend.compatibility.manifest as
      | {
          capabilities?: Record<string, number>;
          transports?: { chatWebSocketUrl?: string };
        }
      | undefined;
    if ((manifest?.capabilities?.["ai.chat.stream.frontend"] ?? 0) < 1) {
      return undefined;
    }
    const url = manifest?.transports?.chatWebSocketUrl;
    if (!url) return undefined;
    const parsed = new URL(url);
    if (
      parsed.protocol !== "wss:" &&
      !(parsed.protocol === "ws:" &&
        ["localhost", "127.0.0.1"].includes(parsed.hostname))
    ) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

async function requestTicket(
  sessionId: string | undefined,
  signal: AbortSignal,
): Promise<StreamTicket> {
  const decision = await decideCapability(
    "prompt",
    undefined,
    "backend-only",
    "frontend",
  );
  if (!decision.backendAvailable) {
    throw new ChatStreamError(
      "We couldn't reach the AI service. Check your connection and try again.",
      "BACKEND_UNAVAILABLE",
      true,
    );
  }
  const ticket = (await dispatchBackend(
    decision,
    "frontend",
    "/chat-stream/ticket",
    "POST",
    { sessionId },
    { signal },
  )) as StreamTicket;
  if (
    typeof ticket?.ticket !== "string" ||
    !ticket.ticket ||
    typeof ticket.sessionId !== "string" ||
    !ticket.sessionId ||
    typeof ticket.expiresAt !== "string" ||
    Date.parse(ticket.expiresAt) <= Date.now()
  ) {
    throw new ChatStreamError(
      "The request could not be processed. Review your input and try again.",
      "INVALID_STREAM_TICKET",
    );
  }
  return ticket;
}

export function sendChatStreamCancel(
  socket: WebSocket | null,
  checkpoint: ChatStreamCheckpoint | undefined,
): void {
  if (!socket || socket.readyState !== WebSocket.OPEN || !checkpoint) return;
  socket.send(
    JSON.stringify({
      version: 1,
      type: "turn.cancel",
      requestId: checkpoint.requestId,
      conversationId: checkpoint.conversationId,
      turnId: checkpoint.turnId,
    }),
  );
}

/**
 * The ticket is single use and short lived. Reconnect requests a fresh ticket
 * and replays from the last acknowledged sequence, never starting a new turn.
 */
export async function runChatStreamTurn(
  options: ChatStreamOptions,
): Promise<ChatStreamResult> {
  if (options.signal.aborted) throw abortError();
  const visitorAction = options.visitorAction === undefined ? undefined : parseConfirmedVisitorAction(options.visitorAction);
  if (!options.resume && options.visitorAction !== undefined &&
      (!visitorAction || (options.visitorActionVersion !== 1 && options.visitorActionVersion !== 2) || options.catalogContinuation !== undefined)) {
    throw new ChatStreamError("The request could not be processed. Review your input and try again.", "INVALID_VISITOR_ACTION");
  }
  if (!options.resume && options.catalogContinuation !== undefined) {
    if (options.catalogPageVersion !== 1) {
      throw new ChatStreamError("Catalog pagination is unavailable. Please search again.", "CATALOG_PAGINATION_UNAVAILABLE");
    }
    if (typeof options.catalogContinuation !== "string" || !CATALOG_PAGE_HANDLE.test(options.catalogContinuation)) {
      throw new ChatStreamError("Invalid catalog continuation.", "INVALID_CATALOG_CONTINUATION");
    }
  }
  const presentationVersion = options.presentationVersion === 3 ? 3 : options.presentationVersion === 2 ? 2 : 1;

  let checkpoint = options.resume;
  let sessionId = options.resume?.conversationId ?? options.sessionId;
  let text = options.initialView?.text ?? "";
  let presentation = normalizeAnswerPresentation(options.initialView?.presentation);
  let visitorActions = normalizeVisitorActions(options.initialView?.visitorActions);
  let visitorActionResult = normalizeVisitorActionResult(options.initialView?.visitorActionResult);
  let activities: ChatActivity[] = options.initialView?.activities ?? [];
  const citations = new Map<string, StreamCitation>(
    options.initialView?.citations.map((citation) => [citation.citationId, citation]) ?? [],
  );
  let attempts = 0;
  const emit = () =>
    options.onView({
      text,
      presentation,
      visitorActions,
      visitorActionResult,
      activities: [...activities],
      citations: [...citations.values()],
      checkpoint,
    });

  while (attempts < 4) {
    if (options.signal.aborted) throw abortError();
    options.onTransportState?.(attempts > 0 || options.resume ? "reconnecting" : "sending");
    const ticket = await (options.ticketProvider ?? requestTicket)(
      sessionId,
      options.signal,
    );
    sessionId = ticket.sessionId;
    options.onSession?.(sessionId);

    const url = new URL(options.url);
    url.searchParams.set("ticket", ticket.ticket);

    const outcome = await new Promise<
      | { kind: "retry" }
      | { kind: "done"; result: ChatStreamResult }
    >((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = options.socketFactory
          ? options.socketFactory(url.toString())
          : new WebSocket(url.toString());
      } catch (error) {
        reject(error);
        return;
      }
      options.onSocket?.(socket);
      let closed = false;
      let gapRequested = false;
      let lastEventAt = Date.now();
      const queued = new Map<number, ChatStreamEvent>();
      const openTimer = globalThis.setTimeout(() => socket.close(), 12_000);
      const replayTimer = globalThis.setInterval(() => {
        if (!closed && checkpoint && socket.readyState === WebSocket.OPEN && Date.now() - lastEventAt >= 20_000) {
          socket.send(JSON.stringify({
            version: 1,
            type: "turn.resume",
            presentationVersion,
            ...(options.visitorActionVersion === 1 || options.visitorActionVersion === 2 ? { visitorActionVersion: options.visitorActionVersion } : {}),
            requestId: options.requestId,
            conversationId: checkpoint.conversationId,
            turnId: checkpoint.turnId,
            afterSeq: checkpoint.lastSeq,
          }));
          lastEventAt = Date.now();
        }
      }, 5_000);
      const cleanup = () => {
        globalThis.clearTimeout(openTimer);
        globalThis.clearInterval(replayTimer);
        options.signal.removeEventListener("abort", onAbort);
        options.onSocket?.(null);
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        if (socket.readyState === WebSocket.OPEN) socket.close();
      };
      const finish = (result: ChatStreamResult) => {
        if (closed) return;
        closed = true;
        cleanup();
        resolve({ kind: "done", result });
      };
      const fail = (error: Error) => {
        if (closed) return;
        closed = true;
        cleanup();
        reject(error);
      };
      const onAbort = () => {
        sendChatStreamCancel(socket, checkpoint);
        fail(abortError());
      };
      options.signal.addEventListener("abort", onAbort, { once: true });

      const processEvent = (event: ChatStreamEvent) => {
        const payload = event.payload;
        options.onTransportState?.(event.type === "turn.accepted" ? "waiting" : "receiving");
        if (!checkpoint && event.type === "turn.failed") {
          fail(new ChatStreamError(
            String(payload.fallbackMessage || payload.messageKey || "Chat turn failed."),
            String(payload.code || "CHAT_TURN_FAILED"),
            payload.retryable === true,
            typeof payload.status === "number" ? payload.status : undefined,
            typeof payload.correlationId === "string" ? payload.correlationId : undefined,
          ));
          return;
        }
        if (!checkpoint && event.type === "turn.cancelled") {
          fail(abortError());
          return;
        }
        if (event.type === "turn.accepted") {
          const acceptedSession = payload.sessionId;
          if (typeof acceptedSession === "string" && acceptedSession) {
            sessionId = acceptedSession;
            options.onSession?.(acceptedSession);
          }
          checkpoint = {
            requestId: options.requestId,
            conversationId: event.conversationId,
            turnId: event.turnId,
            lastSeq: event.seq,
            assistantMessageId:
              typeof payload.assistantMessageId === "string"
                ? payload.assistantMessageId
                : undefined,
          };
          options.onAccepted?.(checkpoint, sessionId!);
        } else if (!checkpoint) {
          return;
        } else {
          checkpoint = { ...checkpoint, lastSeq: event.seq };
          if (event.type.startsWith("activity.")) {
            const activity = parseActivity(payload);
            if (activity) {
              const index = activities.findIndex((item) => item.activityId === activity.activityId);
              activities = index < 0
                ? [...activities, activity]
                : activities.map((item, itemIndex) => itemIndex === index ? activity : item);
            }
          } else if (event.type === "answer.delta") {
            if (typeof payload.text === "string") text += payload.text;
          } else if (event.type === "presentation.upsert") {
            if (typeof payload.messageId === "string" &&
                payload.messageId === (checkpoint.assistantMessageId ?? checkpoint.turnId)) {
              presentation = normalizeAnswerPresentation(payload.presentation);
            }
          } else if (event.type === "citation.upsert") {
            const citation = parseCitation(payload.citation);
            if (citation) citations.set(citation.citationId, citation);
          } else if (event.type === "turn.snapshot") {
            const snapshotSeq = payload.lastSeq;
            if (
              Number.isSafeInteger(snapshotSeq) &&
              (snapshotSeq as number) >= event.seq
            ) {
              checkpoint = { ...checkpoint, lastSeq: snapshotSeq as number };
            }
            if (payload.reset === true) {
              // A large completed result is replayed as synthetic deltas after
              // this snapshot. Discard the locally persisted partial answer.
              text = "";
              presentation = undefined;
              visitorActions = undefined;
              visitorActionResult = undefined;
              citations.clear();
            }
            if (typeof payload.result === "string" && payload.result) {
              text = payload.result;
            }
            if (Object.hasOwn(payload, "presentation")) presentation = normalizeAnswerPresentation(payload.presentation);
            if (Object.hasOwn(payload, "visitorActions")) visitorActions = normalizeVisitorActions(payload.visitorActions);
            if (Object.hasOwn(payload, "visitorActionResult")) visitorActionResult = normalizeVisitorActionResult(payload.visitorActionResult);
            if (Array.isArray(payload.activities)) activities = parseActivities(payload.activities);
            if (asRecord(payload.citations)) {
              // The authoritative structured citations arrive with completion.
              citations.clear();
            }
            if (payload.active === false) {
              if (payload.terminalType === "turn.cancelled") {
                fail(abortError());
                return;
              }
              if (payload.terminalType === "turn.failed") {
                fail(
                  new ChatStreamError(
                    String(
                      payload.fallbackMessage ||
                        payload.messageKey ||
                        "The request could not be processed. Review your input and try again.",
                    ),
                    String(payload.code || "CHAT_TURN_FAILED"),
                    payload.retryable === true,
                    typeof payload.status === "number" ? payload.status : undefined,
                    typeof payload.correlationId === "string" ? payload.correlationId : undefined,
                  ),
                );
                return;
              }
              finish({
                result: text,
                presentation,
                visitorActions,
                visitorActionResult,
                sessionId: sessionId!,
                messageId: checkpoint.assistantMessageId,
                citations: payload.citations as ProcessedCitations | undefined,
                metadata: payload.metadata as PromptResult["metadata"] | undefined,
                completion: "complete",
              });
              return;
            }
          } else if (event.type === "answer.completed") {
            const result =
              typeof payload.result === "string" && payload.result
                ? payload.result
                : text;
            text = result;
            if (Object.hasOwn(payload, "presentation")) presentation = normalizeAnswerPresentation(payload.presentation);
            visitorActions = normalizeVisitorActions(payload.visitorActions);
            visitorActionResult = normalizeVisitorActionResult(payload.visitorActionResult);
            if (Array.isArray(payload.activities)) activities = parseActivities(payload.activities);
            const completion = ["complete", "partial", "truncated"].includes(
              String(payload.completion),
            )
              ? (payload.completion as ChatStreamResult["completion"])
              : "complete";
            emit();
            finish({
              result,
              presentation,
              visitorActions,
              visitorActionResult,
              sessionId: sessionId!,
              messageId:
                typeof payload.messageId === "string"
                  ? payload.messageId
                  : checkpoint.assistantMessageId,
              citations: (payload.citations as ProcessedCitations | undefined) ?? [
                ...citations.values(),
              ],
              metadata: payload.metadata as PromptResult["metadata"] | undefined,
              completion,
            });
            return;
          } else if (event.type === "turn.failed") {
            fail(
              new ChatStreamError(
                String(payload.fallbackMessage || payload.messageKey || "Chat turn failed."),
                String(payload.code || "CHAT_TURN_FAILED"),
                payload.retryable === true,
                typeof payload.status === "number" ? payload.status : undefined,
                typeof payload.correlationId === "string" ? payload.correlationId : undefined,
              ),
            );
            return;
          } else if (event.type === "turn.cancelled") {
            fail(abortError());
            return;
          }
        }
        emit();
      };

      socket.onopen = () => {
        globalThis.clearTimeout(openTimer);
        options.onTransportState?.("waiting");
        socket.send(
          JSON.stringify(
            checkpoint
              ? {
                  version: 1,
                  type: "turn.resume",
                  presentationVersion,
                  ...(options.visitorActionVersion === 1 || options.visitorActionVersion === 2 ? { visitorActionVersion: options.visitorActionVersion } : {}),
                  requestId: options.requestId,
                  conversationId: checkpoint.conversationId,
                  turnId: checkpoint.turnId,
                  afterSeq: checkpoint.lastSeq,
                }
              : {
                  version: 1,
                  type: "turn.start",
                  presentationVersion,
                  requestId: options.requestId,
                  conversationId: sessionId,
                  locale: options.locale,
                  message: { text: options.text },
                  ...(options.catalogPageVersion === 1 ? { catalogPageVersion: 1,
                    ...(options.catalogContinuation ? { catalogContinuation: options.catalogContinuation } : {}) } : {}),
                  ...(options.visitorActionVersion === 1 || options.visitorActionVersion === 2 ? { visitorActionVersion: options.visitorActionVersion,
                    ...(visitorAction ? { visitorAction } : {}) } : {}),
                },
          ),
        );
      };
      socket.onmessage = (message) => {
        let parsed: ChatStreamEvent | undefined;
        try {
          parsed = parseEvent(JSON.parse(String(message.data)));
        } catch {
          return;
        }
        if (!parsed) return;
        lastEventAt = Date.now();
        if (
          checkpoint &&
          (parsed.turnId !== checkpoint.turnId ||
            parsed.conversationId !== checkpoint.conversationId)
        ) {
          return;
        }
        if (parsed.type === "turn.snapshot" && checkpoint) {
          queued.clear();
          processEvent(parsed);
          return;
        }
        // A new turn has no acknowledged events yet. The backend's first
        // turn.accepted event is sequence 0, so the initial cursor is -1.
        const lastSeq = checkpoint?.lastSeq ?? -1;
        if (parsed.seq <= lastSeq) return;
        queued.set(parsed.seq, parsed);
        let nextSeq = lastSeq + 1;
        while (queued.has(nextSeq)) {
          const next = queued.get(nextSeq)!;
          queued.delete(nextSeq);
          processEvent(next);
          if (closed) return;
          nextSeq += 1;
          gapRequested = false;
        }
        if (queued.size > 0 && checkpoint && !gapRequested) {
          gapRequested = true;
          socket.send(
            JSON.stringify({
              version: 1,
              type: "turn.resume",
              presentationVersion,
              ...(options.visitorActionVersion === 1 || options.visitorActionVersion === 2 ? { visitorActionVersion: options.visitorActionVersion } : {}),
              requestId: options.requestId,
              conversationId: checkpoint.conversationId,
              turnId: checkpoint.turnId,
              afterSeq: checkpoint.lastSeq,
            }),
          );
        }
      };
      socket.onclose = () => {
        if (closed) return;
        options.onTransportState?.("reconnecting");
        closed = true;
        cleanup();
        resolve({ kind: "retry" });
      };
      socket.onerror = () => {
        // The close event performs replay. Browser WebSocket errors are opaque.
      };
    });

    if (outcome.kind === "done") {
      return outcome.result;
    }
    // A lost admission response is uncertain: never automatically submit consent again.
    // Once accepted, only the existing turn's checkpoint may be resumed.
    if (visitorAction && !checkpoint) {
      throw new ChatStreamError("We couldn't reach the AI service. Check your connection and try again.", "VISITOR_ACTION_ADMISSION_UNCERTAIN");
    }
    attempts += 1;
    if (attempts < 4) {
      await new Promise<void>((resolve, reject) => {
        const timer = globalThis.setTimeout(() => {
          options.signal.removeEventListener("abort", cancel);
          resolve();
        }, options.retryDelayMs ?? Math.min(4_000, 500 * 2 ** (attempts - 1)));
        const cancel = () => {
          globalThis.clearTimeout(timer);
          reject(abortError());
        };
        options.signal.addEventListener("abort", cancel, { once: true });
      });
    }
  }
  throw new ChatStreamError(
    "We couldn't reach the AI service. Check your connection and try again.",
    "CHAT_STREAM_DISCONNECTED",
    true,
  );
}
