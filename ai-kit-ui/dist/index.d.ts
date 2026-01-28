import * as _smart_cloud_ai_kit_core from '@smart-cloud/ai-kit-core';
import { ContextKind, AiModePreference, AiKitLanguageCode, HistoryStorageMode, AiChatbotLabels, AiKitStatusEvent, AiWorkerProps } from '@smart-cloud/ai-kit-core';
import * as React from 'react';
import React__default, { FC, ComponentType } from 'react';

declare const AiFeature: FC<_smart_cloud_ai_kit_core.AiWorkerProps & {
    mode: _smart_cloud_ai_kit_core.AiFeatureMode;
    context?: ContextKind;
    modeOverride?: AiModePreference;
    autoRun?: boolean;
    onDeviceTimeout?: number;
    editable?: boolean;
    acceptButtonTitle?: string;
    showRegenerateOnBackendButton?: boolean;
    optionsDisplay?: "collapse" | "horizontal" | "vertical";
    default?: {
        getText?: () => string;
        text?: string;
        image?: Blob;
        instructions?: string;
        inputLanguage?: AiKitLanguageCode | "auto";
        outputLanguage?: AiKitLanguageCode | "auto";
        tone?: WriterTone | RewriterTone;
        length?: WriterLength | RewriterLength | SummarizerLength;
        type?: SummarizerType;
        outputFormat?: "plain-text" | "markdown" | "html";
    };
    allowOverride?: {
        text?: boolean;
        instructions?: boolean;
        tone?: boolean;
        length?: boolean;
        type?: boolean;
        outputLanguage?: boolean;
        outputFormat?: boolean;
    };
    onAccept?: (result: unknown) => void;
} & Partial<_smart_cloud_ai_kit_core.AiWorkerProps>>;

declare const markdownToHtml: (markdown: string) => Promise<string>;

declare const DEFAULT_CHATBOT_LABELS: Required<AiChatbotLabels>;
declare const AiChatbot: React__default.FC<_smart_cloud_ai_kit_core.AiWorkerProps & {
    placeholder?: string;
    maxImages?: number;
    maxImageBytes?: number;
    previewMode?: boolean;
    historyStorage?: HistoryStorageMode;
    labels?: AiChatbotLabels;
    openButtonIconLayout?: _smart_cloud_ai_kit_core.OpenButtonIconLayout;
    openButtonPosition?: _smart_cloud_ai_kit_core.OpenButtonPosition;
} & Partial<_smart_cloud_ai_kit_core.AiWorkerProps>>;

type AiRunState<T> = {
    busy: boolean;
    error: string | null;
    statusEvent: AiKitStatusEvent | null;
    result: T | null;
    isCancelled: boolean;
    /** Last known execution source (best-effort). */
    lastSource: "on-device" | "backend" | null;
};
type AiFeatureFunction<T> = (args: {
    signal: AbortSignal;
    onStatus: (e: AiKitStatusEvent) => void;
}) => Promise<T>;
type UseAiRunResult<T> = AiRunState<T> & {
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
declare function isBackendConfigured(): Promise<boolean>;
declare function readDefaultOutputLanguage(): AiKitLanguageCode;
/**
 * Removes a single surrounding Markdown code fence.
 *
 * Handles common model outputs like:
 * ```json
 * {"a":1}
 * ```
 */
declare function stripCodeFence(text: string): string;
declare function useAiRun<T>(): UseAiRunResult<T>;

type AiKitShellInjectedProps = {
    language?: string;
    rootElement: HTMLElement;
};
declare function withAiKitShell<P extends object>(RootComponent: ComponentType<P & AiKitShellInjectedProps>, propOverrides?: Partial<AiWorkerProps>): React.FC<P & Partial<AiWorkerProps>>;

declare const translations: Record<string, Record<string, string>>;

export { AiChatbot, AiFeature, type AiFeatureFunction, type AiRunState, DEFAULT_CHATBOT_LABELS, type UseAiRunResult, isBackendConfigured, markdownToHtml, readDefaultOutputLanguage, stripCodeFence, translations, useAiRun, withAiKitShell };
