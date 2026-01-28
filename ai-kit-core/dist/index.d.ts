import { SubscriptionType, WpSuitePluginBase } from '@smart-cloud/wpsuite-core';
import { StoreDescriptor } from '@wordpress/data';

interface AiKitConfig {
    mode?: AiModePreference;
    backendTransport?: BackendTransport;
    backendApiName?: string;
    backendBaseUrl?: string;
    subscriptionType?: SubscriptionType;
    enableChatbot?: boolean;
    chatbot?: AiChatbotProps;
}
/**
 * Ensures we only keep runtime keys that are part of AiKitConfig.
 *
 * Defensive: upstream getConfig("ai-kit") or persisted site.settings may include
 * additional keys, but the admin UI and core should only operate on AiKitConfig.
 */
declare const sanitizeAiKitConfig: (input: unknown) => AiKitConfig;
declare const actions: {
    setShowChatbotPreview(showChatbotPreview: boolean): {
        type: string;
        showChatbotPreview: boolean;
    };
    setLanguage(language: string | undefined | null): {
        type: string;
        language: string | null | undefined;
    };
    setDirection(direction: "ltr" | "rtl" | "auto" | undefined | null): {
        type: string;
        direction: "ltr" | "rtl" | "auto" | null | undefined;
    };
};
interface CustomTranslations {
    [key: string]: Record<string, string>;
}
interface State {
    config: AiKitConfig | null;
    showChatbotPreview: boolean;
    language: string | undefined | null;
    direction: "ltr" | "rtl" | "auto" | undefined | null;
    customTranslations: CustomTranslations | null;
}
type Store = StoreDescriptor;
type StoreSelectors = {
    getConfig(): AiKitConfig | null;
    isShowChatbotPreview(): boolean;
    getCustomTranslations(): CustomTranslations | null;
    getLanguage(): string | undefined | null;
    getDirection(): "ltr" | "rtl" | "auto" | undefined | null;
    getState(): State;
};
type StoreActions = typeof actions;
declare const getStoreDispatch: (store: Store) => StoreActions;
declare const getStoreSelect: (store: Store) => StoreSelectors;
declare const observeStore: (observableStore: Store, selector: (state: State) => boolean | number | string | null | undefined, onChange: (nextValue: boolean | number | string | null | undefined, previousValue: boolean | number | string | null | undefined) => void) => () => void;

type ContextKind = "admin" | "frontend";
type AiModePreference = "local-only" | "backend-fallback" | "backend-only";
type BuiltInAiFeature = "prompt" | "summarizer" | "writer" | "rewriter" | "proofreader" | "language-detector" | "translator";
type CapabilitySource = "on-device" | "backend" | "none";
type BackendTransport = "gatey" | "fetch";
interface AiKit {
    features: AiKitFeatures;
    settings: AiKitSettings;
    nonce: string;
    restUrl: string;
    view: "settings" | "diagnostics";
}
interface AiKitFeatures {
    readonly store: Promise<Store>;
    readonly write: Features["write"];
    readonly rewrite: Features["rewrite"];
    readonly proofread: Features["proofread"];
    readonly summarize: Features["summarize"];
    readonly translate: Features["translate"];
    readonly detectLanguage: Features["detectLanguage"];
    readonly prompt: Features["prompt"];
    readonly sendChatMessage: Features["sendChatMessage"];
    readonly sendFeedbackMessage: Features["sendFeedbackMessage"];
    readonly renderFeature: (args: AiFeatureArgs) => Promise<AiWorkerHandle>;
}
interface AiKitSettings {
    /**
     * Context injected into supported Chrome APIs (Writer/Rewriter/Summarizer) and/or backend.
     */
    sharedContext?: string;
    /**
     * Optional language configuration used to resolve default input/output languages.
     * Keep this lightweight: most users will rely on defaults.
     */
    defaultOutputLanguage?: AiKitLanguageCode;
    /** Optional URL to custom translations JSON file. */
    customTranslationsUrl?: string;
    /**
     * Optional reCAPTCHA Enterprise configuration.
     * Only applied for FRONTEND backend calls ("/frontend/*").
     */
    reCaptchaSiteKey?: string;
    useRecaptchaNet?: boolean;
    useRecaptchaEnterprise?: boolean;
    /** Whether to show "Powered by WPSuite AI-Kit" branding in UIs. */
    enablePoweredBy?: boolean;
}
interface DeviceAvailability {
    available: boolean;
    status?: Availability | "api-not-present" | "unknown-feature" | "error";
    reason?: string;
    error?: Error;
}
interface CapabilityDecision {
    feature: BuiltInAiFeature;
    source: CapabilitySource;
    mode: AiModePreference;
    onDeviceAvailable: boolean;
    onDeviceStatus?: DeviceAvailability["status"];
    onDeviceReason?: DeviceAvailability["reason"];
    backendAvailable: boolean;
    backendTransport?: BackendTransport;
    backendApiName?: string;
    backendBaseUrl?: string;
    backendReason?: string;
    reason: string;
}
interface BackendCallOptions {
    signal?: AbortSignal;
    headers?: Record<string, string>;
    query?: Record<string, string | number | boolean>;
    /**
     * Optional status callback for progress / UI feedback.
     */
    onStatus?: (event: AiKitStatusEvent) => void;
}
type AiKitLanguageCode = "ar" | "en" | "zh" | "nl" | "fr" | "de" | "he" | "hi" | "hu" | "id" | "it" | "ja" | "ko" | "no" | "pl" | "pt" | "ru" | "es" | "sv" | "th" | "tr" | "uk";
type AiKitLanguageRef = "site" | "admin" | "content" | AiKitLanguageCode;
type AiKitLanguageProfile = "singleSite" | "englishAdminSingleFrontend" | "multilingual" | "custom";
type OnDeviceUnsupportedLanguageStrategy = "prefer-backend" | "pivot-translate";
type AiKitStatusStep = "decide" | "on-device:init" | "on-device:download" | "on-device:ready" | "on-device:run" | "backend:request" | "backend:waiting" | "backend:response" | "done" | "error";
interface AiKitStatusEvent {
    feature: BuiltInAiFeature;
    context: ContextKind;
    step: AiKitStatusStep;
    /** Where the work is happening. */
    source?: CapabilitySource;
    /** 0..1 for progress events (e.g. download). */
    progress?: number;
    loaded?: number;
    total?: number;
    message?: string;
}
declare class BackendError extends Error {
    readonly decision?: CapabilityDecision | undefined;
    readonly status?: number | undefined;
    constructor(message: string, decision?: CapabilityDecision | undefined, status?: number | undefined);
}
type AiWorkerHandle = {
    container: HTMLDivElement;
    close: () => void;
    unmount: () => void;
};
type AiFeatureArgs = AiFeatureProps & {
    target?: string | HTMLElement;
};
type AiFeatureMode = "proofread" | "translate" | "write" | "rewrite" | "summarize" | "generatePostMetadata" | "generateImageMetadata";
type AiWorkerProps = {
    store: Store;
    variation?: "default" | "modal";
    language?: string;
    showOpenButton?: boolean;
    openButtonTitle?: string;
    openButtonIcon?: string;
    showOpenButtonTitle?: boolean;
    showOpenButtonIcon?: boolean;
    direction?: "ltr" | "rtl" | "auto";
    colorMode?: "light" | "dark" | "auto";
    colors?: Record<string, string>;
    primaryColor?: string;
    primaryShade?: {
        light?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
        dark?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    };
    themeOverrides?: string;
    title?: string;
    onClose: () => void;
};
type HistoryStorageMode = "localstorage" | "sessionstorage" | "nostorage";
type OpenButtonIconLayout = "top" | "bottom" | "left" | "right";
type OpenButtonPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";
type AiChatbotLabels = Partial<{
    modalTitle: string;
    userLabel: string;
    assistantLabel: string;
    askMeLabel: string;
    sendLabel: string;
    cancelLabel: string;
    resetLabel: string;
    confirmLabel: string;
    clickAgainToConfirmLabel: string;
    notSentLabel: string;
    editLabel: string;
    readyLabel: string;
    readyEmptyLabel: string;
    addLabel: string;
    addImageLabel: string;
    removeImageLabel: string;
    closeChatLabel: string;
    maximizeLabel: string;
    restoreSizeLabel: string;
    referencesLabel: string;
    referenceLabel: string;
    acceptResponseLabel: string;
    rejectResponseLabel: string;
    placeholder: string;
    emptyResponseLabel: string;
    unexpectedErrorLabel: string;
}>;
type AiChatbotProps = AiWorkerProps & {
    placeholder?: string;
    maxImages?: number;
    maxImageBytes?: number;
    previewMode?: boolean;
    /**
     * Chat history persistence:
     * - "localstorage" (default)
     * - "sessionstorage"
     * - "nostorage"
     */
    historyStorage?: HistoryStorageMode;
    /**
     * UI labels override (admin UI will populate later)
     */
    labels?: AiChatbotLabels;
    /**
     * Open button icon layout relative to text.
     * Default: "top"
     */
    openButtonIconLayout?: OpenButtonIconLayout;
    /**
     * Open button position in the viewport.
     * Default: "bottom-right"
     * Options: "bottom-right" | "bottom-left" | "top-right" | "top-left"
     */
    openButtonPosition?: OpenButtonPosition;
};
type AiFeatureProps = AiWorkerProps & {
    mode: AiFeatureMode;
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
};
interface SummarizeArgs {
    text: string;
    context?: string;
    sharedContext?: string;
    type?: SummarizerType;
    format?: SummarizerFormat;
    length?: SummarizerLength;
    outputLanguage?: AiKitLanguageCode;
}
interface SummarizeResult {
    result: string;
}
interface WriteArgs {
    prompt: string;
    context?: string;
    sharedContext?: string;
    tone?: WriterTone;
    format?: WriterFormat;
    length?: WriterLength;
    outputLanguage?: AiKitLanguageCode;
}
interface WriteResult {
    result: string;
}
interface RewriteArgs {
    text: string;
    context?: string;
    sharedContext?: string;
    tone?: RewriterTone;
    format?: RewriterFormat;
    length?: RewriterLength;
    outputLanguage?: AiKitLanguageCode;
}
interface RewriteResult {
    result: string;
}
interface ProofreadArgs {
    text: string;
    expectedInputLanguages?: AiKitLanguageCode[];
    includeCorrectionTypes?: boolean;
    includeCorrectionExplanations?: boolean;
    correctionExplanationLanguage?: AiKitLanguageCode;
}
/**
 * ProofreadResult is provided by dom-chromium-ai:
 *   interface ProofreadResult { correctedInput: string; corrections: ProofreadCorrection[] }
 */
interface ProofreadOutput {
    result: ProofreadResult;
}
interface DetectLanguageArgs {
    text: string;
}
interface DetectLanguageOutput {
    result: {
        candidates: LanguageDetectionResult[];
    };
}
interface TranslateArgs {
    text: string;
    sourceLanguage: AiKitLanguageCode;
    targetLanguage: AiKitLanguageCode;
}
interface TranslateResult {
    result: string;
}
type PromptMessages = Array<{
    role: "system" | "user" | "assistant";
    content: string;
}>;
/**
 * Visual inputs supported by Chrome Prompt API multimodal prompting.
 * Note: For backend uploads we only handle Blob/File inputs.
 */
type PromptImageInput = Blob | File | HTMLImageElement | SVGImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap | VideoFrame | ImageData;
interface PromptArgs {
    messages: PromptMessages;
    sharedContext?: string;
    outputLanguage?: AiKitLanguageCode;
    /**
     * Optional multimodal images.
     * - On-device: passed as { type: "image", value: ... } parts.
     * - Backend: only Blob/File inputs are handled (inline data URLs or signed upload).
     */
    images?: PromptImageInput[];
    /**
     * Optional response constraint schema.
     */
    responseConstraint?: {
        type: "object";
        properties: Record<string, unknown>;
        required: string[];
        additionalProperties: boolean;
    };
    /**
     * Optional on-device tuning:
     */
    topK?: number;
    temperature?: number;
}
interface PromptResult {
    result: string;
    sessionId?: string;
    metadata?: {
        messageId: string;
    };
}
interface ChatMessageArgs {
    sessionId?: string;
    message?: string;
    sharedContext?: string;
    images?: PromptImageInput[];
    /**
     * Optional on-device tuning:
     */
    topK?: number;
    temperature?: number;
}
interface FeedbackMessageArgs {
    feedbackType: "accepted" | "rejected";
    feedbackMessageId: string;
    sessionId: string;
}
type AnyCreateCoreOptions = LanguageModelCreateCoreOptions | SummarizerCreateCoreOptions | WriterCreateCoreOptions | RewriterCreateCoreOptions | ProofreaderCreateCoreOptions | LanguageDetectorCreateCoreOptions | TranslatorCreateCoreOptions;
interface Capabilities {
    MIN_CHROME_VERSION?: Partial<Record<BuiltInAiFeature, number>>;
    checkOnDeviceAvailability: (feature: BuiltInAiFeature, availabilityOptions?: AnyCreateCoreOptions) => Promise<DeviceAvailability>;
    decideCapability: (feature: BuiltInAiFeature, availabilityOptions?: AnyCreateCoreOptions, modeOverride?: AiModePreference) => Promise<CapabilityDecision>;
    resolveBackend: () => Promise<{
        available: boolean;
        transport?: BackendTransport;
        apiName?: string;
        baseUrl?: string;
        reason?: string;
    }>;
    willUseOnDevice: (feature: BuiltInAiFeature, availabilityOptions?: AnyCreateCoreOptions) => Promise<boolean>;
    willUseBackend: (feature: BuiltInAiFeature, availabilityOptions?: AnyCreateCoreOptions) => Promise<boolean>;
}
interface Backend<TResponse> {
    dispatchBackend: (decision: CapabilityDecision, context: ContextKind, feature: BuiltInAiFeature, requestBody: unknown, options: BackendCallOptions) => Promise<TResponse>;
}
type FeatureOptions = BackendCallOptions & {
    context?: ContextKind;
    modeOverride?: AiModePreference;
    onDeviceTimeoutOverride?: number;
};
interface Features {
    getWriteOptions: (args: Partial<WriteArgs>) => Promise<WriterCreateCoreOptions>;
    write: (args: WriteArgs, options?: FeatureOptions) => Promise<WriteResult>;
    getRewriteOptions: (args: Partial<RewriteArgs>) => Promise<RewriterCreateCoreOptions>;
    rewrite: (args: RewriteArgs, options?: FeatureOptions) => Promise<RewriteResult>;
    getProofreadOptions: () => Promise<ProofreaderCreateCoreOptions>;
    proofread: (args: ProofreadArgs, options?: FeatureOptions) => Promise<ProofreadOutput>;
    getSummarizeOptions: (args: Partial<SummarizeArgs>) => Promise<SummarizerCreateCoreOptions>;
    summarize: (args: SummarizeArgs, options?: FeatureOptions) => Promise<SummarizeResult>;
    getTranslateOptions: (args: Partial<TranslateArgs>) => Promise<TranslatorCreateCoreOptions>;
    translate: (args: TranslateArgs, options?: FeatureOptions) => Promise<TranslateResult>;
    detectLanguage: (args: DetectLanguageArgs, options?: FeatureOptions) => Promise<DetectLanguageOutput>;
    getPromptOptions: (args: Partial<PromptArgs>) => Promise<LanguageModelCreateCoreOptions>;
    prompt: (args: PromptArgs, options?: FeatureOptions) => Promise<PromptResult>;
    sendChatMessage: (args: ChatMessageArgs, options?: FeatureOptions) => Promise<PromptResult>;
    sendFeedbackMessage: (args: FeedbackMessageArgs, options?: FeatureOptions) => Promise<PromptResult>;
}

type AiKitReadyEvent = "wpsuite:ai-kit:ready";
type AiKitErrorEvent = "wpsuite:ai-kit:error";
type AiKitPlugin = WpSuitePluginBase & AiKit;
declare function getAiKitPlugin(): AiKitPlugin;
declare function waitForAiKitReady(timeoutMs?: number): Promise<void>;
declare function getStore(timeoutMs?: number): Promise<Store>;

declare const TEXT_DOMAIN = "wpsuite-ai-kit";

declare const AiKitFeatureIcon: React.FC<React.SVGProps<SVGSVGElement>>;
declare const AiKitChatbotIcon: React.FC<React.SVGProps<SVGSVGElement>>;

declare const LANGUAGE_OPTIONS: {
    label: string;
    value: AiKitLanguageCode;
}[];
declare const getMinChromeVersions: () => Promise<Partial<Record<BuiltInAiFeature, number>> | undefined>;
declare const decideCapability: (...args: Parameters<Capabilities["decideCapability"]>) => Promise<CapabilityDecision>;
declare const checkOnDeviceAvailability: (...args: Parameters<Capabilities["checkOnDeviceAvailability"]>) => Promise<DeviceAvailability>;
declare const dispatchBackend: (...args: Parameters<Backend<unknown>["dispatchBackend"]>) => Promise<unknown>;
declare const getWriteOptions: (...args: Parameters<Features["getWriteOptions"]>) => Promise<WriterCreateCoreOptions>;
declare const write: (...args: Parameters<Features["write"]>) => Promise<WriteResult>;
declare const getRewriteOptions: (...args: Parameters<Features["getRewriteOptions"]>) => Promise<RewriterCreateCoreOptions>;
declare const rewrite: (...args: Parameters<Features["rewrite"]>) => Promise<RewriteResult>;
declare const getProofreadOptions: (...args: Parameters<Features["getProofreadOptions"]>) => Promise<ProofreaderCreateCoreOptions>;
declare const proofread: (...args: Parameters<Features["proofread"]>) => Promise<ProofreadOutput>;
declare const getSummarizeOptions: (...args: Parameters<Features["getSummarizeOptions"]>) => Promise<SummarizerCreateCoreOptions>;
declare const summarize: (...args: Parameters<Features["summarize"]>) => Promise<SummarizeResult>;
declare const getTranslateOptions: (...args: Parameters<Features["getTranslateOptions"]>) => Promise<TranslatorCreateCoreOptions>;
declare const translate: (...args: Parameters<Features["translate"]>) => Promise<TranslateResult>;
declare const detectLanguage: (...args: Parameters<Features["detectLanguage"]>) => Promise<DetectLanguageOutput>;
declare const getPromptOptions: (...args: Parameters<Features["getPromptOptions"]>) => Promise<LanguageModelCreateCoreOptions>;
declare const prompt: (...args: Parameters<Features["prompt"]>) => Promise<PromptResult>;
declare const sendChatMessage: (...args: Parameters<Features["sendChatMessage"]>) => Promise<PromptResult>;
declare const sendFeedbackMessage: (...args: Parameters<Features["sendFeedbackMessage"]>) => Promise<PromptResult>;
declare const initializeAiKit: (renderFeature: (args: AiFeatureArgs) => Promise<AiWorkerHandle>) => AiKitPlugin;

export { type AiChatbotLabels, type AiChatbotProps, type AiFeatureArgs, type AiFeatureMode, type AiFeatureProps, type AiKit, AiKitChatbotIcon, type AiKitConfig, type AiKitErrorEvent, AiKitFeatureIcon, type AiKitFeatures, type AiKitLanguageCode, type AiKitLanguageProfile, type AiKitLanguageRef, type AiKitPlugin, type AiKitReadyEvent, type AiKitSettings, type AiKitStatusEvent, type AiKitStatusStep, type AiModePreference, type AiWorkerHandle, type AiWorkerProps, type AnyCreateCoreOptions, type Backend, type BackendCallOptions, BackendError, type BackendTransport, type BuiltInAiFeature, type Capabilities, type CapabilityDecision, type CapabilitySource, type ChatMessageArgs, type ContextKind, type CustomTranslations, type DetectLanguageArgs, type DetectLanguageOutput, type DeviceAvailability, type FeatureOptions, type Features, type FeedbackMessageArgs, type HistoryStorageMode, LANGUAGE_OPTIONS, type OnDeviceUnsupportedLanguageStrategy, type OpenButtonIconLayout, type OpenButtonPosition, type PromptArgs, type PromptImageInput, type PromptMessages, type PromptResult, type ProofreadArgs, type ProofreadOutput, type RewriteArgs, type RewriteResult, type State, type Store, type SummarizeArgs, type SummarizeResult, TEXT_DOMAIN, type TranslateArgs, type TranslateResult, type WriteArgs, type WriteResult, checkOnDeviceAvailability, decideCapability, detectLanguage, dispatchBackend, getAiKitPlugin, getMinChromeVersions, getPromptOptions, getProofreadOptions, getRewriteOptions, getStore, getStoreDispatch, getStoreSelect, getSummarizeOptions, getTranslateOptions, getWriteOptions, initializeAiKit, observeStore, prompt, proofread, rewrite, sanitizeAiKitConfig, sendChatMessage, sendFeedbackMessage, summarize, translate, waitForAiKitReady, write };
