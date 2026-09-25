import type { ProcessedCitations, PromptResult } from "./types";
export declare const CHAT_STREAM_PROTOCOL_VERSION: 1;
export type ChatStreamActivityKind = "knowledge_search" | "web_search" | "web_read" | "calculation" | "script" | "validation" | "thinking" | "generating_response" | "checking_sources" | "other";
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
    resultCount?: number;
    urls?: string[];
    status: "running" | "completed" | "failed";
};
export type ChatStreamClientCommand = {
    version: typeof CHAT_STREAM_PROTOCOL_VERSION;
    type: "turn.start";
    requestId: string;
    conversationId?: string;
    locale?: string;
    message: {
        text: string;
    };
} | {
    version: typeof CHAT_STREAM_PROTOCOL_VERSION;
    type: "turn.cancel";
    requestId: string;
    conversationId: string;
    turnId: string;
} | {
    version: typeof CHAT_STREAM_PROTOCOL_VERSION;
    type: "turn.resume";
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
export type ChatStreamServerEvent = ChatStreamEnvelope<"turn.accepted", {
    sessionId: string;
    userMessageId: string;
    assistantMessageId: string;
    status: "queued" | "running";
}> | ChatStreamEnvelope<"activity.started" | "activity.completed" | "activity.failed", ChatStreamActivity> | ChatStreamEnvelope<"answer.delta", {
    messageId: string;
    text: string;
}> | ChatStreamEnvelope<"citation.upsert", {
    messageId: string;
    citation: {
        citationId: string;
        docId?: string;
        chunkId?: string;
        title?: string;
        sourceUrl?: string;
        snippet?: string;
    };
}> | ChatStreamEnvelope<"answer.completed", {
    messageId: string;
    result: string;
    citations?: ProcessedCitations;
    activities?: ChatStreamActivity[];
    completion: "complete" | "partial" | "truncated";
    metadata?: PromptResult["metadata"];
}> | ChatStreamEnvelope<"turn.failed", {
    code: string;
    messageKey: string;
    fallbackMessage?: string;
    status?: number;
    retryable: boolean;
    correlationId: string;
}> | ChatStreamEnvelope<"turn.cancelled", {
    reason: string;
}> | ChatStreamEnvelope<"turn.snapshot", {
    lastSeq: number;
    active: boolean;
    result?: string;
    citations?: ProcessedCitations;
    activities: ChatStreamActivity[];
}>;
/**
 * Performs the transport boundary checks shared by browser clients. Detailed
 * payload validation remains event-specific in the reducer; malformed or future
 * event types are ignored instead of being rendered as trusted content.
 */
export declare function parseChatStreamServerEvent(value: unknown): ChatStreamServerEvent | undefined;
export {};
