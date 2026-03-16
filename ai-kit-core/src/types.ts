// types.ts
// Core shared types for ai-kit-core.
// NOTE: Chrome Built-in AI types come from @types/dom-chromium-ai (global).

import { Store } from "./store";

export type ContextKind = "admin" | "frontend";

export type AiModePreference =
  | "local-only" // only on-device, never backend
  | "backend-fallback" // prefer on-device, fallback to backend
  | "backend-only"; // only backend, ignore on-device

export type BuiltInAiFeature =
  | "prompt" // LanguageModel / Prompt API
  | "summarizer" // Summarizer API
  | "writer" // Writer API
  | "rewriter" // Rewriter API
  | "proofreader" // Proofreader API
  | "language-detector" // LanguageDetector API
  | "translator"; // Translator API

export type CapabilitySource = "on-device" | "backend" | "none";

export type BackendTransport = "gatey" | "fetch";

export interface AiKit {
  features: AiKitFeatures;
  settings: AiKitSettings;
  nonce: string;
  restUrl: string;
  view: "settings" | "diagnostics";
}

export interface AiKitFeatures {
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
  readonly sendSearchMessage: Features["sendSearchMessage"];
  readonly renderFeature: (args: AiFeatureArgs) => Promise<AiWorkerHandle>;
  readonly renderSearchComponent: (
    args: DocSearchArgs,
  ) => Promise<AiWorkerHandle>;
}

export interface AiKitSettings {
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

  /** Chat optimization: number of seconds a successful reCAPTCHA assessment remains valid for the current chat session. */
  reCaptchaChatTtlSeconds?: number;

  /** Whether to show "Powered by WPSuite AI-Kit" branding in UIs. */
  enablePoweredBy?: boolean;

  /** Whether to enable server-side debug logging for AI-Kit. */
  debugLoggingEnabled?: boolean;
}

export interface DeviceAvailability {
  available: boolean;
  status?: Availability | "api-not-present" | "unknown-feature" | "error";
  reason?: string;
  error?: Error;
}

export interface CapabilityDecision {
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

export interface BackendCallOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;

  /**
   * Optional status callback for progress / UI feedback.
   */
  onStatus?: (event: AiKitStatusEvent) => void;
}

/* -----------------------------
 * Language settings
 * ----------------------------- */

export type AiKitLanguageCode =
  | "ar"
  | "en"
  | "zh"
  | "nl"
  | "fr"
  | "de"
  | "he"
  | "hi"
  | "hu"
  | "id"
  | "it"
  | "ja"
  | "ko"
  | "no"
  | "pl"
  | "pt"
  | "ru"
  | "es"
  | "sv"
  | "th"
  | "tr"
  | "uk";

export type AiKitLanguageRef =
  | "site" // WP site locale (injected by plugin)
  | "admin" // WP admin/user locale (injected by plugin)
  | "content" // current content language (WPML/Polylang), fallback: site
  | AiKitLanguageCode;

export type AiKitLanguageProfile =
  | "singleSite"
  | "englishAdminSingleFrontend"
  | "multilingual"
  | "custom";

export type OnDeviceUnsupportedLanguageStrategy =
  | "prefer-backend" // if backend is available, use it
  | "pivot-translate"; // run on-device in pivot language, translate afterwards

export type AiKitStatusStep =
  | "decide"
  | "on-device:init"
  | "on-device:download"
  | "on-device:ready"
  | "on-device:run"
  | "backend:request"
  | "backend:waiting"
  | "backend:response"
  | "done"
  | "error";

export interface AiKitStatusEvent {
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

  silent?: boolean; // whether this event should be ignored for user-facing status updates
}

export class BackendError extends Error {
  constructor(
    message: string,
    public readonly decision?: CapabilityDecision,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AiBackendError";
  }
}

export type AiWorkerHandle = {
  container: HTMLDivElement;
  close: () => void;
  unmount: () => void;
};

export type AiFeatureArgs = AiFeatureProps & {
  target?: string | HTMLElement;
};

export type AiFeatureMode =
  | "proofread"
  | "translate"
  | "write"
  | "rewrite"
  | "summarize"
  | "generatePostMetadata"
  | "generateImageMetadata";

export type AiWorkerProps = {
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

export type HistoryStorageMode =
  | "localstorage"
  | "sessionstorage"
  | "nostorage";
export type OpenButtonIconLayout = "top" | "bottom" | "left" | "right";

export type OpenButtonPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

export type AiChatbotLabels = Partial<{
  modalTitle: string;

  userLabel: string;
  assistantLabel: string;
  assistantThinkingLabel: string;

  askMeLabel: string; // fallback for open button (if openButtonTitle not provided)

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

export type AiChatbotProps = AiWorkerProps & {
  context?: ContextKind;
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
   * Empty chat history after X days
   */
  emptyHistoryAfterDays?: number;

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
  openButtonPosition?: OpenButtonPosition; // default: "bottom-right"
};

export type AiFeatureOptions = {
  text?: string;
  instructions?: string;
  inputLanguage?: AiKitLanguageCode | "auto";
  outputLanguage?: AiKitLanguageCode | "auto";
  tone?: WriterTone | RewriterTone;
  length?: WriterLength | RewriterLength | SummarizerLength;
  type?: SummarizerType;
  outputFormat?: "plain-text" | "markdown" | "html";
};

export type AiFeatureProps = AiWorkerProps & {
  mode: AiFeatureMode;
  context?: ContextKind;
  modeOverride?: AiModePreference;
  autoRun?: boolean;
  onDeviceTimeout?: number;
  editable?: boolean;
  acceptButtonTitle?: string;
  showRegenerateOnBackendButton?: boolean;
  optionsDisplay?: "collapse" | "horizontal" | "vertical";
  default?: AiFeatureOptions & {
    getText?: Promise<string> | (() => Promise<string>);
    image?: Blob;
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
  onOptionsChanged?: (options: AiFeatureOptions) => void;
};

/* -----------------------------
 * Public request/response shapes
 * (reuse dom-chromium-ai types where available)
 * ----------------------------- */

export interface SummarizeArgs {
  text: string;
  context?: string;
  sharedContext?: string;

  type?: SummarizerType;
  format?: SummarizerFormat;
  length?: SummarizerLength;

  outputLanguage?: AiKitLanguageCode;
}

export interface SummarizeResult {
  result: string;
}

export interface WriteArgs {
  prompt: string;
  context?: string;
  sharedContext?: string;

  tone?: WriterTone;
  format?: WriterFormat;
  length?: WriterLength;

  outputLanguage?: AiKitLanguageCode;
}

export interface WriteResult {
  result: string;
}

export interface RewriteArgs {
  text: string;
  context?: string;
  sharedContext?: string;

  tone?: RewriterTone;
  format?: RewriterFormat;
  length?: RewriterLength;

  outputLanguage?: AiKitLanguageCode;
}

export interface RewriteResult {
  result: string;
}

export interface ProofreadArgs {
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
export interface ProofreadOutput {
  result: ProofreadResult;
}

export interface DetectLanguageArgs {
  text: string;
}

export interface DetectLanguageOutput {
  result: {
    candidates: LanguageDetectionResult[];
  };
}

export interface TranslateArgs {
  text: string;
  sourceLanguage: AiKitLanguageCode;
  targetLanguage: AiKitLanguageCode;
}

export interface TranslateResult {
  result: string;
}

export type PromptMessages = Array<{
  role: "system" | "user" | "assistant";
  content: string;
}>;

/**
 * Visual inputs supported by Chrome Prompt API multimodal prompting.
 * Note: For backend uploads we only handle Blob/File inputs.
 */
export type PromptImageInput =
  | Blob
  | File
  | HTMLImageElement
  | SVGImageElement
  | HTMLVideoElement
  | HTMLCanvasElement
  | OffscreenCanvas
  | ImageBitmap
  | VideoFrame
  | ImageData;

/**
 * Audio input for multimodal prompting.
 * Backend supports base64-encoded audio with format specification.
 */
export type PromptAudioInput = {
  format: string; // MIME type: "audio/webm", "audio/mp3", "audio/wav", etc.
  data: string; // base64-encoded audio data
};

export interface PromptArgs {
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
   * Optional multimodal audio.
   * - Backend only (Nova models support audio input)
   * - Formats: audio/webm, audio/mp3, audio/wav, audio/flac, audio/aac
   */
  audio?: PromptAudioInput;

  /**
   * Optional response constraint schema.
   */
  responseConstraint?: {
    // JSON Schema for structured output
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

export interface PromptResult {
  result: string;
  sessionId?: string;
  metadata?: {
    messageId: string;
  };
}

export interface RetrievedDoc {
  docId: string;
  title?: string;
  description?: string;
  author?: string;
  sourceUrl?: string;
}

export interface RetrievedChunk {
  docId: string;
  chunkId: string;
  snippet?: string;
}

export interface ProcessedCitations {
  docs: Array<RetrievedDoc>;
  chunks: Array<RetrievedChunk>;
  anchors?: Array<{
    // Minimal span shape we rely on in the frontend (backend may provide more).
    span: { start: number; end: number };
    chunkIds: Array<string>;
  }>;
}

export interface SearchResult {
  result: string;
  sessionId?: string;
  citations?: ProcessedCitations;
  metadata?: {
    modelId?: string;
    requestId?: string;
    inputTokens?: number;
    outputTokens?: number;
    usedKB?: boolean;
    kbId?: string;
    citationCount?: number;
    fallbackReason?: string;
  };
}

export interface SearchMessageArgs {
  /** Search query in the user's language (required if no audio). */
  query?: string;
  /** Optional audio query (alternative to text query). Blob will be uploaded to S3. */
  audio?: Blob;
  /** Optional backend session for future optimizations. */
  sessionId?: string;
  /** Optional shared context (defaults to AiKit settings sharedContext). */
  sharedContext?: string;
  knowledgeBaseId?: string;
  /**
   * Optional on-device tuning:
   */
  topK?: number;
  temperature?: number;
  /** User-selected category filters (when provided, skips model-based filter selection) */
  userSelectedCategories?: string[];
  /** User-selected subcategory filters */
  userSelectedSubcategories?: string[];
  /** User-selected tag filters */
  userSelectedTags?: string[];
}

export interface ChatMessageArgs {
  sessionId?: string;
  message?: string;
  audio?: Blob;
  sharedContext?: string;
  images?: PromptImageInput[];
  /**
   * Optional on-device tuning:
   */
  topK?: number;
  temperature?: number;
}

export interface FeedbackMessageArgs {
  feedbackType: "accepted" | "rejected";
  feedbackMessageId: string;
  sessionId: string;
}

export type DocSearchProps = AiWorkerProps & {
  context?: ContextKind;
  autoRun?: boolean;

  /** Title shown above the search input (optional). */
  title?: string;

  /** Optional search input. */
  getSearchText?: () => string;

  /** Optional base64 icon (SVG or PNG) for the search button. */
  searchButtonIcon?: string;

  showSearchButtonTitle?: boolean;
  showSearchButtonIcon?: boolean;

  /** Whether to render document cards under the summary. */
  showSources?: boolean;

  /** Max number of results to return. */
  topK?: number;

  /** Max snippet length shown per chunk. */
  snippetMaxChars?: number;

  /** Optional callback when clicking on a document card. */
  onClickDoc?: (doc: RetrievedDoc) => void;

  /** Enable user-selectable category and tag filters */
  enableUserFilters?: boolean;

  /** Available categories (category -> subcategories map) for user selection */
  availableCategories?: Record<string, string[]>;

  /** Available tags for user selection */
  availableTags?: string[];
};

export type DocSearchArgs = DocSearchProps & {
  target?: string | HTMLElement;
};

/* -----------------------------
 * Feature → availability options typing
 * ----------------------------- */

export type AnyCreateCoreOptions =
  | LanguageModelCreateCoreOptions
  | SummarizerCreateCoreOptions
  | WriterCreateCoreOptions
  | RewriterCreateCoreOptions
  | ProofreaderCreateCoreOptions
  | LanguageDetectorCreateCoreOptions
  | TranslatorCreateCoreOptions;

export interface Capabilities {
  MIN_CHROME_VERSION?: Partial<Record<BuiltInAiFeature, number>>;

  isOnDeviceLanguageSupported: (outputLanguage: AiKitLanguageCode) => boolean;

  checkOnDeviceAvailability: (
    feature: BuiltInAiFeature,
    availabilityOptions?: AnyCreateCoreOptions,
  ) => Promise<DeviceAvailability>;

  decideCapability: (
    feature: BuiltInAiFeature,
    availabilityOptions?: AnyCreateCoreOptions,
    modeOverride?: AiModePreference,
  ) => Promise<CapabilityDecision>;

  resolveBackend: () => Promise<{
    available: boolean;
    transport?: BackendTransport;
    apiName?: string;
    baseUrl?: string;
    reason?: string;
  }>;

  willUseOnDevice: (
    feature: BuiltInAiFeature,
    availabilityOptions?: AnyCreateCoreOptions,
  ) => Promise<boolean>;

  willUseBackend: (
    feature: BuiltInAiFeature,
    availabilityOptions?: AnyCreateCoreOptions,
  ) => Promise<boolean>;
}

export interface Backend<TResponse> {
  dispatchFeatureBackend: (
    decision: CapabilityDecision,
    context: ContextKind,
    feature: BuiltInAiFeature,
    requestBody: unknown,
    options: BackendCallOptions,
  ) => Promise<TResponse>;
  dispatchCustomBackend: (
    decision: CapabilityDecision,
    context: ContextKind,
    customPath: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    requestBody: unknown,
    options: BackendCallOptions,
  ) => Promise<TResponse>;
}

export type FeatureOptions = BackendCallOptions & {
  context?: ContextKind;
  modeOverride?: AiModePreference;
  onDeviceTimeoutOverride?: number;
  silent?: boolean; // whether to suppress user-facing status updates for this call
};

export interface Features {
  getWriteOptions: (
    args: Partial<WriteArgs>,
  ) => Promise<WriterCreateCoreOptions>;
  write: (args: WriteArgs, options?: FeatureOptions) => Promise<WriteResult>;

  getRewriteOptions: (
    args: Partial<RewriteArgs>,
  ) => Promise<RewriterCreateCoreOptions>;
  rewrite: (
    args: RewriteArgs,
    options?: FeatureOptions,
  ) => Promise<RewriteResult>;

  getProofreadOptions: () => Promise<ProofreaderCreateCoreOptions>;
  proofread: (
    args: ProofreadArgs,
    options?: FeatureOptions,
  ) => Promise<ProofreadOutput>;

  getSummarizeOptions: (
    args: Partial<SummarizeArgs>,
  ) => Promise<SummarizerCreateCoreOptions>;
  summarize: (
    args: SummarizeArgs,
    options?: FeatureOptions,
  ) => Promise<SummarizeResult>;

  getTranslateOptions: (
    args: Partial<TranslateArgs>,
  ) => Promise<TranslatorCreateCoreOptions>;
  translate: (
    args: TranslateArgs,
    options?: FeatureOptions,
  ) => Promise<TranslateResult>;

  detectLanguage: (
    args: DetectLanguageArgs,
    options?: FeatureOptions,
  ) => Promise<DetectLanguageOutput>;

  getPromptOptions: (
    args: Partial<PromptArgs>,
  ) => Promise<LanguageModelCreateCoreOptions>;
  prompt: (args: PromptArgs, options?: FeatureOptions) => Promise<PromptResult>;
  sendChatMessage: (
    args: ChatMessageArgs,
    options?: FeatureOptions,
  ) => Promise<PromptResult>;
  sendFeedbackMessage: (
    args: FeedbackMessageArgs,
    options?: FeatureOptions,
  ) => Promise<PromptResult>;
  sendSearchMessage: (
    args: SearchMessageArgs,
    options?: FeatureOptions,
  ) => Promise<SearchResult>;
}
