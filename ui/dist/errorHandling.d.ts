export type AiRunErrorKind = "cancelled" | "human-verification" | "authorization" | "throttled" | "grounding" | "timeout" | "validation" | "network" | "server" | "general";
export type HumanVerificationClassification = "TOKEN_REJECTED" | "ACTION_REJECTED" | "RISK_REJECTED" | "PROVIDER_UNAVAILABLE";
export type AiRunErrorDetails = {
    kind: AiRunErrorKind;
    status?: number;
    code?: string;
    safeMessage?: string;
    requestId?: string;
    classification?: HumanVerificationClassification;
    retryable?: boolean;
};
export type AiRunErrorFeedback = {
    message: string | null;
    details: AiRunErrorDetails | null;
};
export declare function isAiRunAbort(error: unknown): boolean;
export declare function normalizeAiRunError(error: unknown): AiRunErrorDetails;
export declare function getAiRunErrorMessage(details: AiRunErrorDetails, translate?: (message: string) => string): string;
export declare function clearAiRunErrorFeedback(): AiRunErrorFeedback;
export declare function createAiRunErrorFeedback(error: unknown, translate?: (message: string) => string): AiRunErrorFeedback;
export declare class AiRunError extends Error {
    readonly details: AiRunErrorDetails;
    constructor(details: AiRunErrorDetails, message?: string, options?: ErrorOptions);
}
