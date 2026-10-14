import type { ProcessedCitations, PromptResult } from "./types";

export const CHAT_STREAM_PROTOCOL_VERSION = 1 as const;

export type ChatStreamActivityKind =
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

export type ChatStreamActivity = {
  activityId: string;
  kind: ChatStreamActivityKind;
  labelKey: string;
  labelParams?: Record<string, string | number>;
  safeDomain?: string;
  safeDomains?: string[];
  query?: string;
  categoryCount?: number;
  subcategoryCount?: number;
  tagCount?: number;
  /** Distinct source documents returned by a knowledge-base search. */
  documentCount?: number;
  /** Returned results; knowledge-base searches count retrieved chunks. */
  resultCount?: number;
  urls?: string[];
  status: "running" | "completed" | "failed";
};

export type ChatStreamClientCommand =
  | {
      version: typeof CHAT_STREAM_PROTOCOL_VERSION;
      type: "turn.start";
      /** Opt in to sequenced presentation events; old clients omit this. */
      presentationVersion?: 1 | 2;
      requestId: string;
      conversationId?: string;
      locale?: string;
      message: { text: string };
    }
  | {
      version: typeof CHAT_STREAM_PROTOCOL_VERSION;
      type: "turn.cancel";
      requestId: string;
      conversationId: string;
      turnId: string;
    }
  | {
      version: typeof CHAT_STREAM_PROTOCOL_VERSION;
      type: "turn.resume";
      /** Declare support independently on reconnect, including another client. */
      presentationVersion?: 1 | 2;
      requestId: string;
      conversationId: string;
      turnId: string;
      afterSeq: number;
    };

type ChatStreamEnvelope<TType extends string, TPayload> = {
  version: typeof CHAT_STREAM_PROTOCOL_VERSION;
  conversationId: string;
  turnId: string;
  eventId: string;
  seq: number;
  timestamp: string;
  type: TType;
  payload: TPayload;
};

export type ChatStreamServerEvent =
  | ChatStreamEnvelope<
      "turn.accepted",
      {
        sessionId: string;
        userMessageId: string;
        assistantMessageId: string;
        status: "queued" | "running";
      }
    >
  | ChatStreamEnvelope<
      "activity.started" | "activity.completed" | "activity.failed",
      ChatStreamActivity
    >
  | ChatStreamEnvelope<
      "answer.delta",
      { messageId: string; text: string }
    >
  | ChatStreamEnvelope<
      "citation.upsert",
      {
        messageId: string;
        citation: {
          citationId: string;
          docId?: string;
          chunkId?: string;
          title?: string;
          sourceUrl?: string;
          snippet?: string;
        };
      }
    >
  | ChatStreamEnvelope<
      "presentation.upsert",
      { messageId: string; presentation: NonNullable<PromptResult["presentation"]> }
    >
  | ChatStreamEnvelope<
      "answer.completed",
      {
        messageId: string;
        result: string;
        presentation?: PromptResult["presentation"];
        citations?: ProcessedCitations;
        activities?: ChatStreamActivity[];
        completion: "complete" | "partial" | "truncated";
        metadata?: PromptResult["metadata"];
      }
    >
  | ChatStreamEnvelope<
      "turn.failed",
      {
        code: string;
        messageKey: string;
        fallbackMessage?: string;
        status?: number;
        retryable: boolean;
        correlationId: string;
      }
    >
  | ChatStreamEnvelope<"turn.cancelled", { reason: string }>
  | ChatStreamEnvelope<
      "turn.snapshot",
      {
        lastSeq: number;
        active: boolean;
        result?: string;
        presentation?: PromptResult["presentation"];
        citations?: ProcessedCitations;
        activities: ChatStreamActivity[];
      }
    >;

const SERVER_EVENT_TYPES = new Set<ChatStreamServerEvent["type"]>([
  "turn.accepted",
  "activity.started",
  "activity.completed",
  "activity.failed",
  "answer.delta",
  "citation.upsert",
  "presentation.upsert",
  "answer.completed",
  "turn.failed",
  "turn.cancelled",
  "turn.snapshot",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Performs the transport boundary checks shared by browser clients. Detailed
 * payload validation remains event-specific in the reducer; malformed or future
 * event types are ignored instead of being rendered as trusted content.
 */
export function parseChatStreamServerEvent(
  value: unknown,
): ChatStreamServerEvent | undefined {
  if (!isRecord(value) || value.version !== CHAT_STREAM_PROTOCOL_VERSION) {
    return undefined;
  }
  if (
    typeof value.type !== "string" ||
    !SERVER_EVENT_TYPES.has(value.type as ChatStreamServerEvent["type"]) ||
    typeof value.conversationId !== "string" ||
    !value.conversationId ||
    typeof value.turnId !== "string" ||
    !value.turnId ||
    typeof value.eventId !== "string" ||
    !value.eventId ||
    typeof value.timestamp !== "string" ||
    !value.timestamp ||
    !Number.isSafeInteger(value.seq) ||
    (value.seq as number) < 0 ||
    !isRecord(value.payload)
  ) {
    return undefined;
  }
  return value as ChatStreamServerEvent;
}
