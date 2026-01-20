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
  readonly renderFeature: (args: AiFeatureArgs) => Promise<AiWorkerHandle>;
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
  className?: string;
  styleText?: string;
  title?: string;
  onClose: () => void;
};

export type AiFeatureProps = AiWorkerProps & {
  mode: AiFeatureMode;
  context?: ContextKind;
  modeOverride?: AiModePreference;
  autoRun?: boolean;
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

export type PromptMessages =
  | string
  | Array<{ role: "system" | "user" | "assistant"; content: string }>;

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

  /** Optional language metadata (best-effort). */
  language?: {
    requestedOutputLanguage?: AiKitLanguageCode;
    modelOutputLanguage?: AiKitLanguageCode;
    translated?: boolean;
    strategy?: OnDeviceUnsupportedLanguageStrategy;
  };
}

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

  checkOnDeviceAvailability: (
    feature: BuiltInAiFeature,
    availabilityOptions?: AnyCreateCoreOptions,
  ) => Promise<DeviceAvailability>;

  decideCapability: (
    feature: BuiltInAiFeature,
    availabilityOptions?: AnyCreateCoreOptions,
    modeOverride?: AiModePreference,
  ) => Promise<CapabilityDecision>;

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
  dispatchBackend: (
    decision: CapabilityDecision,
    context: ContextKind,
    feature: BuiltInAiFeature,
    requestBody: unknown,
    options: BackendCallOptions,
  ) => Promise<TResponse>;
}

export type FeatureOptions = BackendCallOptions & {
  context?: ContextKind;
  modeOverride?: AiModePreference;
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
}
