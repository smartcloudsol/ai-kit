import { type ConfirmedVisitorAction, type VisitorActionProposal, type VisitorActionResult, type ProcessedCitations, type PromptResult, type AnswerPresentation } from "@smart-cloud/ai-kit-core";
export type ChatActivity = {
    activityId: string;
    kind: "knowledge_search" | "web_search" | "web_read" | "calculation" | "script" | "validation" | "thinking" | "generating_response" | "checking_sources" | "other";
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
type StreamTicket = {
    ticket: string;
    expiresAt: string;
    sessionId: string;
};
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
export declare class ChatStreamError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    readonly status?: number;
    readonly requestId?: string;
    constructor(message: string, code: string, retryable?: boolean, status?: number, requestId?: string);
}
export declare function isToolActivity(activity: ChatActivity): boolean;
/** Display useful execution history plus the latest active stage, not old thinking rows.
 * The full activity list stays intact for persistence, diagnostics and replay.
 */
export declare function visibleProgressActivities(activities: readonly ChatActivity[]): ChatActivity[];
/** Completed history must not leave a busy turn without a current status caption. */
export declare function needsProgressFallback(activities: readonly ChatActivity[], busy: boolean): boolean;
/** An unnamed successful internal operation is not useful visitor-facing history. */
export declare function isSummaryActivity(activity: ChatActivity): boolean;
export declare function summarizeChatActivities(activities: ChatActivity[]): {
    knowledgeSearches: number;
    websites: number;
    otherTools: number;
};
export declare function chatPresentationVersionForCapabilities(capabilities?: Record<string, unknown>): 1 | 2 | 3;
export declare function chatCatalogPageVersionForCapabilities(capabilities?: Record<string, unknown>): 1 | undefined;
export declare function chatVisitorActionVersionForCapabilities(capabilities?: Record<string, unknown>): 1 | 2 | undefined;
export declare function discoverChatVisitorActionVersion(): Promise<1 | 2 | undefined>;
/** The same negotiation applies to HTTP prompts and every stream resume frame. */
export declare function discoverChatPresentationVersion(): Promise<1 | 2 | 3>;
/** Older or unverified backends must never receive the new catalog request fields. */
export declare function discoverChatCatalogPageVersion(): Promise<1 | undefined>;
/** The backend advertises streaming only when its WebSocket route is ready. */
export declare function discoverChatStreamUrl(): Promise<string | undefined>;
export declare function sendChatStreamCancel(socket: WebSocket | null, checkpoint: ChatStreamCheckpoint | undefined): void;
/**
 * The ticket is single use and short lived. Reconnect requests a fresh ticket
 * and replays from the last acknowledged sequence, never starting a new turn.
 */
export declare function runChatStreamTurn(options: ChatStreamOptions): Promise<ChatStreamResult>;
export {};
