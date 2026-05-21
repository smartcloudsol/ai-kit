import { AiKitLanguageCode, type AiKitStatusEvent } from "@smart-cloud/ai-kit-core";
export type AiRunState<T> = {
    busy: boolean;
    error: string | null;
    statusEvent: AiKitStatusEvent | null;
    result: T | null;
    isCancelled: boolean;
    /** Last known execution source (best-effort). */
    lastSource: "on-device" | "backend" | null;
};
export type AiFeatureFunction<T> = (args: {
    signal: AbortSignal;
    onStatus: (e: AiKitStatusEvent) => void;
}) => Promise<T>;
export type UseAiRunResult<T> = AiRunState<T> & {
    run: (func: AiFeatureFunction<T>) => Promise<T | null>;
    cancel: () => void;
    reset: () => void;
    /** Current AbortSignal, if a run is in-flight. */
    signal: AbortSignal | null;
};
/**
 * Returns true if backend routing is configured in the current AiKit settings.
 *
 * This is intentionally conservative: it only checks *configuration*, not reachability.
 */
export declare function isBackendConfigured(): Promise<boolean>;
export declare function readDefaultOutputLanguage(): AiKitLanguageCode;
/**
 * Removes a single surrounding Markdown code fence.
 *
 * Handles common model outputs like:
 * ```json
 * {"a":1}
 * ```
 */
export declare function stripCodeFence(text: string): string;
export declare function useAiRun<T>(): UseAiRunResult<T>;
