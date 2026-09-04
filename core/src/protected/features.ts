// features.ts
//
// Concrete AI feature implementations.
// Routing is decided by decideCapability():
// - on-device → Chrome Built-in AI APIs
// - backend   → dispatchBackend() via Gatey or fetch

import { getGateyPlugin } from "@smart-cloud/gatey-core";
import { getWpSuite } from "@smart-cloud/wpsuite-core";
import type { AiKitPlugin } from "../runtime";

import { dispatchFeatureBackend, withRecaptchaHeaders } from "./backend";
import {
  decideCapability,
  isOnDeviceLanguageSupported,
  resolveBackend,
} from "./capabilities";

import { I18n } from "aws-amplify/utils";
import { LANGUAGE_OPTIONS } from "..";
import type {
  AiKitLanguageCode,
  AiKitSettings,
  AiKitStatusEvent,
  AiModePreference,
  BackendCallOptions,
  BuiltInAiFeature,
  CapabilityDecision,
  ChatMessageArgs,
  ContextKind,
  DetectLanguageArgs,
  DetectLanguageOutput,
  FeatureOptions,
  Features,
  FeedbackMessageArgs,
  PromptArgs,
  PromptImageInput,
  PromptResult,
  ProofreadArgs,
  ProofreadOutput,
  RewriteArgs,
  RewriteResult,
  SearchMessageArgs,
  SearchResult,
  SummarizeArgs,
  SummarizeResult,
  TranslateArgs,
  TranslateResult,
  WriteArgs,
  WriteResult,
} from "../types";
import { splitTextIntoChunks } from "./chunking-utils";

/* -------------------------------------------------------------------------------------------------
 * On-device model cache (page-lifetime)
 * ------------------------------------------------------------------------------------------------- */

type OnDeviceModelKind =
  | "writer"
  | "rewriter"
  | "proofreader"
  | "summarizer"
  | "language-detector"
  | "translator"
  | "language-model";

type CachedEntry<T> = {
  kind: OnDeviceModelKind;
  key: string;
  model: T;
  refCount: number;
  lastUsed: number;
  destroy: () => void;
};

type OnDeviceModelHandle<T> = {
  model: T;
  release: () => void;
  fromCache: boolean;
};

const ON_DEVICE_MODEL_CACHE_MAX_TOTAL = 8;
const ON_DEVICE_MODEL_CACHE_MAX_PER_KIND = 2;

const onDeviceModelCache = new Map<string, CachedEntry<unknown>>();
const onDeviceModelCreateInFlight = new Map<
  string,
  Promise<OnDeviceModelHandle<unknown>>
>();

function stableStringify(value: unknown): string {
  // JSON-stable stringify (keys sorted) for cache keys.
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
      .join(",") +
    "}"
  );
}

function hashString(input: string): string {
  // Small, deterministic hash (djb2-ish) – good enough for in-memory keys.
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function makeOnDeviceModelKey(
  kind: OnDeviceModelKind,
  keyParts: unknown,
): string {
  return `${kind}:${hashString(stableStringify(keyParts))}`;
}

function tryEvictOnDeviceModels(): void {
  // Evict per-kind first if over limit.
  const byKind = new Map<OnDeviceModelKind, CachedEntry<unknown>[]>();
  for (const e of onDeviceModelCache.values()) {
    const arr = byKind.get(e.kind) ?? [];
    arr.push(e);
    byKind.set(e.kind, arr);
  }
  for (const [kind, arr] of byKind.entries()) {
    if (arr.length <= ON_DEVICE_MODEL_CACHE_MAX_PER_KIND) continue;
    arr.sort(
      (a, b) =>
        a.refCount - b.refCount ||
        a.lastUsed - b.lastUsed ||
        a.key.localeCompare(b.key),
    );
    for (const e of arr) {
      if (byKind.get(kind)!.length <= ON_DEVICE_MODEL_CACHE_MAX_PER_KIND) break;
      if (e.refCount > 0) continue;
      try {
        e.destroy();
      } catch {
        /* ignore errors during destroy, but still evict from cache to avoid blocking others */
      }
      onDeviceModelCache.delete(e.key);
      byKind.set(
        kind,
        (byKind.get(kind) ?? []).filter((x) => x.key !== e.key),
      );
    }
  }

  // Evict globally if over limit (LRU, only refCount==0).
  if (onDeviceModelCache.size <= ON_DEVICE_MODEL_CACHE_MAX_TOTAL) return;

  const all = Array.from(onDeviceModelCache.values());
  all.sort(
    (a, b) =>
      a.refCount - b.refCount ||
      a.lastUsed - b.lastUsed ||
      a.key.localeCompare(b.key),
  );
  for (const e of all) {
    if (onDeviceModelCache.size <= ON_DEVICE_MODEL_CACHE_MAX_TOTAL) break;
    if (e.refCount > 0) continue;
    try {
      e.destroy();
    } catch {
      /* ignore errors during destroy, but still evict from cache to avoid blocking others */
    }
    onDeviceModelCache.delete(e.key);
  }
}

async function acquireOnDeviceModel<T>(
  kind: OnDeviceModelKind,
  keyParts: unknown,
  factory: () => Promise<T>,
  destroy: (model: T) => void,
): Promise<OnDeviceModelHandle<T>> {
  const key = makeOnDeviceModelKey(kind, keyParts);

  const cached = onDeviceModelCache.get(key) as CachedEntry<T> | undefined;
  if (cached) {
    cached.refCount++;
    cached.lastUsed = Date.now();
    // Touch for LRU: delete+set updates insertion order.
    onDeviceModelCache.delete(key);
    onDeviceModelCache.set(key, cached);
    return {
      model: cached.model,
      fromCache: true,
      release: () => {
        const e = onDeviceModelCache.get(key) as CachedEntry<T> | undefined;
        if (!e) return;
        e.refCount = Math.max(0, e.refCount - 1);
        e.lastUsed = Date.now();
        tryEvictOnDeviceModels();
      },
    };
  }

  const inFlight = onDeviceModelCreateInFlight.get(key) as
    | Promise<OnDeviceModelHandle<T>>
    | undefined;
  if (inFlight) return inFlight;

  const p = (async (): Promise<OnDeviceModelHandle<T>> => {
    const model = await factory();
    const entry: CachedEntry<T> = {
      kind,
      key,
      model,
      refCount: 1,
      lastUsed: Date.now(),
      destroy: () => destroy(model),
    };
    onDeviceModelCache.set(key, entry);
    onDeviceModelCreateInFlight.delete(key);
    tryEvictOnDeviceModels();

    return {
      model,
      fromCache: false,
      release: () => {
        const e = onDeviceModelCache.get(key) as CachedEntry<T> | undefined;
        if (!e) return;
        e.refCount = Math.max(0, e.refCount - 1);
        e.lastUsed = Date.now();
        tryEvictOnDeviceModels();
      },
    };
  })().catch((err) => {
    onDeviceModelCreateInFlight.delete(key);
    throw err;
  });

  onDeviceModelCreateInFlight.set(
    key,
    p as Promise<OnDeviceModelHandle<never>>,
  );
  return p;
}

// Page lifetime cleanup (models die on reload anyway, but this helps SPA navigation / hot-reload).
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    for (const e of onDeviceModelCache.values()) {
      try {
        e.destroy();
      } catch {
        /* ignore errors during destroy */
      }
    }
    onDeviceModelCache.clear();
    onDeviceModelCreateInFlight.clear();
  });
}

function readDefaultOutputLanguage(): AiKitLanguageCode {
  const aiKit = getWpSuite()?.plugins?.aiKit as AiKitPlugin | undefined;
  return (
    ((aiKit?.settings ?? {}) as AiKitSettings).defaultOutputLanguage ?? "en"
  );
}

function emit(
  feature: BuiltInAiFeature,
  context: ContextKind,
  options: BackendCallOptions | undefined,
  event: Omit<AiKitStatusEvent, "feature" | "context">,
) {
  try {
    options?.onStatus?.({ feature, context, ...event });
  } catch {
    // ignore
  }
}

function readSharedContext(): string | undefined {
  const aiKit = getWpSuite()?.plugins?.aiKit as AiKitPlugin | undefined;
  return (aiKit?.settings?.sharedContext as string | undefined) ?? undefined;
}

function pickContext(options?: { context?: ContextKind }): ContextKind {
  return options?.context ?? "admin";
}

const DEFAULT_ON_DEVICE_TIMEOUT_MS = 45_000;
const QUICK_ON_DEVICE_TIMEOUT_MS = 5_000;

class OnDeviceTimeoutError extends Error {
  timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`On-device execution exceeded ${timeoutMs}ms`);
    this.name = "OnDeviceTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

type OnDeviceAbortScope = {
  signal: AbortSignal;
  timedOut: () => boolean;
  dispose: () => void;
};

function createOnDeviceAbortScope(
  options?: FeatureOptions,
  defaultTimeoutMs: number = DEFAULT_ON_DEVICE_TIMEOUT_MS,
): OnDeviceAbortScope {
  const controller = new AbortController();
  const userSignal = options?.signal;
  const requestedTimeout =
    typeof options?.onDeviceTimeoutOverride === "number"
      ? options.onDeviceTimeoutOverride
      : undefined;
  const effectiveTimeout =
    typeof requestedTimeout === "number" ? requestedTimeout : defaultTimeoutMs;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let didTimeout = false;

  const forwardAbort = () => {
    if (controller.signal.aborted) {
      return;
    }
    const reason =
      typeof (userSignal as { reason?: unknown } | undefined)?.reason !==
      "undefined"
        ? (userSignal as { reason?: unknown })?.reason
        : undefined;
    controller.abort(reason ?? new DOMException("Aborted", "AbortError"));
  };

  if (userSignal) {
    if (userSignal.aborted) {
      forwardAbort();
    } else {
      userSignal.addEventListener("abort", forwardAbort);
    }
  }

  if (effectiveTimeout && effectiveTimeout > 0) {
    timeoutId = setTimeout(() => {
      if (controller.signal.aborted) {
        return;
      }
      didTimeout = true;
      controller.abort(new OnDeviceTimeoutError(effectiveTimeout));
    }, effectiveTimeout);
  }

  return {
    signal: controller.signal,
    timedOut: () => didTimeout,
    dispose: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      if (userSignal) {
        userSignal.removeEventListener("abort", forwardAbort);
      }
    },
  };
}

type PromptBackendRequest = {
  engine?: string; // Optional engine override (e.g., "kb_rag")
  text?: string; // Simple text prompt (alternative to messages)
  systemPrompt?: string; // Optional system prompt to set behavior
  images?: { format: string; data: string }[]; // Optional images for multimodal prompts
  imageUrls?: string[]; // Optional S3 image keys for multimodal prompts
  audio?: { format: string; data: string }; // Optional audio for transcription
  audioUrl?: string; // Optional S3 audio key for transcription
  context?: string; // Optional context
  maxTokens?: number;
  responseConstraint?: {
    // JSON Schema for structured output
    type: "object";
    properties: Record<string, unknown>;
  };
  saveChatSession?: boolean; // Whether to save the chat session
  sessionId?: string; // Optional chat session ID
  feedbackMessageId?: string; // ID of the message to reject
  feedbackType?: "accepted" | "rejected"; // Type of feedback (e.g., "accept" or "reject")
  knowledgeBaseId?: string;
  disableKB?: boolean;
  topK?: number;
  temperature?: number;
  // User-selected KB metadata filters (when provided, backend skips model-based filter selection)
  userSelectedCategories?: string[];
  userSelectedSubcategories?: string[];
  userSelectedTags?: string[];
};

type WriterBackendRequest = {
  text: string;
  outputLanguage?: string;
  instruction?: string;
  context?: string;
  tone?: WriteArgs["tone"];
  format?: WriteArgs["format"];
  length?: WriteArgs["length"];
  knowledgeBaseId?: string;
  disableKB?: boolean;
};

type RewriterBackendRequest = {
  text: string;
  outputLanguage?: string;
  instruction?: string;
  context?: string;
  tone?: RewriteArgs["tone"];
  format?: RewriteArgs["format"];
  length?: RewriteArgs["length"];
};

type SummarizerBackendRequest = {
  text: string;
  outputLanguage?: string;
  instruction?: string;
  context?: string;
  type?: SummarizeArgs["type"];
  format?: SummarizeArgs["format"];
  length?: SummarizeArgs["length"];
};

type TranslatorBackendRequest = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
};

type LanguageDetectorBackendRequest = {
  text: string;
  maxCandidates?: number;
};

type ProofreaderBackendRequest = {
  text: string;
  expectedInputLanguages?: string[];
};

function readMaybeKb(args: unknown): {
  knowledgeBaseId?: string;
  disableKB?: boolean;
} {
  const a = args as Partial<{ knowledgeBaseId: string; disableKB: boolean }>;
  return {
    knowledgeBaseId:
      typeof a.knowledgeBaseId === "string" ? a.knowledgeBaseId : undefined,
    disableKB: typeof a.disableKB === "boolean" ? a.disableKB : undefined,
  };
}

async function buildPromptBackendRequest(
  args: PromptArgs,
  context: ContextKind,
  decision: CapabilityDecision,
  options?: BackendCallOptions,
): Promise<PromptBackendRequest> {
  const kb = readMaybeKb(args);
  const preparedImages = await preparePromptImagesForBackend(
    args.images,
    decision,
    context,
    options,
  );
  return {
    text: args.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n"),
    systemPrompt: args.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n"),
    images: preparedImages?.images,
    imageUrls: preparedImages?.imageUrls,
    context: args.sharedContext,
    maxTokens: args.maxTokens,
    saveChatSession: false,
    responseConstraint: args.responseConstraint,
    ...kb,
  };
}

async function buildChatMessageBackendRequest(
  args: ChatMessageArgs,
  context: ContextKind,
  decision: CapabilityDecision,
  options?: BackendCallOptions,
): Promise<PromptBackendRequest> {
  const kb = readMaybeKb(args);
  const preparedImages = await preparePromptImagesForBackend(
    args.images,
    decision,
    context,
    options,
  );
  const preparedAudio = await prepareAudioForBackend(
    args.audio,
    decision,
    context,
    options,
  );
  return {
    sessionId: args.sessionId,
    text: args.message!,
    images: preparedImages?.images,
    imageUrls: preparedImages?.imageUrls,
    audio: preparedAudio?.audio,
    audioUrl: preparedAudio?.audioUrl,
    context: args.sessionId ? undefined : args.sharedContext,
    maxTokens: args.maxTokens,
    saveChatSession: true,
    ...kb,
  };
}

async function buildSearchMessageBackendRequest(
  args: SearchMessageArgs,
  context: ContextKind,
  decision: CapabilityDecision,
  options?: BackendCallOptions,
): Promise<PromptBackendRequest> {
  const kb = readMaybeKb(args);

  // Prepare audio for backend (S3 upload only)
  const preparedAudio = await prepareAudioForBackend(
    args.audio,
    decision,
    context,
    options,
  );

  // kb_rag is a backend-only research mode that returns citations.
  return {
    engine: "kb_rag",
    sessionId: args.sessionId,
    text: args.query,
    audio: preparedAudio?.audio,
    audioUrl: preparedAudio?.audioUrl,
    maxTokens: args.maxTokens,
    topK: args.topK,
    context: args.sessionId ? undefined : args.sharedContext,
    saveChatSession: false,
    // User-selected KB filters (when provided, backend skips model-based filter selection)
    userSelectedCategories: args.userSelectedCategories,
    userSelectedSubcategories: args.userSelectedSubcategories,
    userSelectedTags: args.userSelectedTags,
    ...kb,
  };
}

async function buildFeedbackMessageBackendRequest(
  args: FeedbackMessageArgs,
): Promise<PromptBackendRequest> {
  return {
    sessionId: args.sessionId,
    feedbackMessageId: args.feedbackMessageId,
    feedbackType: args.feedbackType,
    saveChatSession: true,
  };
}

function buildWriterBackendRequest(args: WriteArgs): WriterBackendRequest {
  const kb = readMaybeKb(args);
  return {
    text: args.prompt,
    outputLanguage: args.outputLanguage,
    instruction: args.context?.trim() ? args.context.trim() : undefined,
    context: args.sharedContext,
    tone: args.tone,
    format: args.format,
    length: args.length,
    ...kb,
  };
}

function buildRewriterBackendRequest(
  args: RewriteArgs,
): RewriterBackendRequest {
  return {
    text: args.text,
    outputLanguage: args.outputLanguage,
    instruction: args.context?.trim() ? args.context.trim() : undefined,
    context: args.sharedContext,
    tone: args.tone,
    format: args.format,
    length: args.length,
  };
}

function buildSummarizerBackendRequest(
  args: SummarizeArgs,
): SummarizerBackendRequest {
  return {
    text: args.text,
    outputLanguage: args.outputLanguage,
    instruction: args.context?.trim() ? args.context.trim() : undefined,
    context: args.sharedContext,
    type: args.type,
    format: args.format,
    length: args.length,
  };
}

function buildTranslatorBackendRequest(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): TranslatorBackendRequest {
  return { text, sourceLanguage, targetLanguage };
}

function buildLanguageDetectorBackendRequest(
  text: string,
  options?: unknown,
): LanguageDetectorBackendRequest {
  const o = options as Partial<{ maxCandidates: number }>;
  return {
    text,
    maxCandidates:
      typeof o?.maxCandidates === "number" ? o.maxCandidates : undefined,
  };
}

function buildProofreaderBackendRequest(
  args: ProofreadArgs,
): ProofreaderBackendRequest {
  return {
    text: args.text,
    expectedInputLanguages: args.expectedInputLanguages,
  };
}

async function route<TResp>(
  context: ContextKind,
  modeOverride: AiModePreference | undefined,
  silent: boolean | undefined,
  feature: BuiltInAiFeature,
  availabilityOptions: unknown | undefined,
  onDevice: () => Promise<TResp>,
  backendBody: unknown | ((decision: CapabilityDecision) => Promise<unknown>),
  backendOptions?: BackendCallOptions,
): Promise<TResp> {
  emit(feature, context, backendOptions, {
    step: "decide",
    message: "Deciding capability",
    silent,
  });
  const decision = await decideCapability(
    feature,
    availabilityOptions as never,
    modeOverride,
    context,
  );

  emit(feature, context, backendOptions, {
    step: "decide",
    source: decision.source,
    message: `Using ${decision.source}`,
    silent,
  });

  let quotaExceeded = false;

  if (decision.source === "on-device") {
    try {
      const result = await onDevice();
      emit(feature, context, backendOptions, {
        step: "done",
        source: "on-device",
        silent,
      });
      return result;
    } catch (error) {
      console.error(`Error in on-device ${feature}:`, error);
      emit(feature, context, backendOptions, {
        step: "error",
        source: "on-device",
        message: (error as Error).message,
        silent,
      });
      backendOptions?.signal?.throwIfAborted();

      // Check if it's a quota exceeded error
      if (
        error instanceof DOMException &&
        error.name === "QuotaExceededError"
      ) {
        quotaExceeded = true;
      }
    }
  }

  if (decision.mode !== "local-only" && decision.backendAvailable) {
    emit(feature, context, backendOptions, {
      step: "backend:request",
      source: "backend",
      silent,
    });
    const resolvedBody =
      typeof backendBody === "function"
        ? await backendBody(decision)
        : backendBody;
    const result = await dispatchFeatureBackend<TResp>(
      decision,
      context,
      feature,
      resolvedBody,
      backendOptions,
    );
    emit(feature, context, backendOptions, {
      step: "done",
      source: "backend",
      silent,
    });
    return result;
  }

  const reason = quotaExceeded
    ? "On-device quota exceeded. The browser has reached its limit for AI operations. Please try again later or contact support."
    : decision.reason;

  throw new Error(
    `No capability for "${feature}" (${context}). Reason: ${reason}`,
  );
}

/* ---------------------------
 * Writer
 * --------------------------- */

export const getWriteOptions: (
  args: Partial<WriteArgs>,
) => Promise<WriterCreateCoreOptions> = (
  args: Partial<WriteArgs>,
): Promise<WriterCreateCoreOptions> => {
  const outputLanguage = args.outputLanguage
    ? args.outputLanguage
    : readDefaultOutputLanguage();

  const availabilityOptions: WriterCreateCoreOptions = {
    tone: args.tone,
    format: args.format,
    length: args.length,
    outputLanguage,
  };
  return Promise.resolve(availabilityOptions);
};

export const write: Features["write"] = async (
  args: WriteArgs,
  options?: FeatureOptions,
): Promise<WriteResult> => {
  const context = pickContext(options);
  const sharedContext = args.sharedContext ?? readSharedContext();

  let outputLanguage = args.outputLanguage
    ? args.outputLanguage
    : readDefaultOutputLanguage();

  const preferredOutputLanguage = outputLanguage;
  let translateOutput = false;
  if (!isOnDeviceLanguageSupported(outputLanguage)) {
    translateOutput = true;
    outputLanguage = "en";
  }

  const core = getWriteOptions({ ...args, outputLanguage });

  return route(
    context,
    options?.modeOverride,
    false,
    "writer",
    core,
    async () => {
      if (typeof Writer === "undefined")
        throw new Error("Writer API not available in this browser.");

      emit("writer", context, options, {
        step: "on-device:init",
        source: "on-device",
        message: "Creating Writer session",
      });

      const abortScope = createOnDeviceAbortScope(options);

      try {
        const { model: writer, release: releaseWriter } =
          await acquireOnDeviceModel(
            "writer",
            { core, sharedContext },
            () =>
              Writer.create({
                ...core,
                sharedContext,
                monitor(m) {
                  m.addEventListener(
                    "downloadprogress",
                    (e: ProgressEvent<EventTarget>) => {
                      // In current Chrome implementations, e.loaded is a 0..1 fraction.
                      const loaded = e.loaded as number | undefined;
                      emit("writer", context, options, {
                        step: "on-device:download",
                        source: "on-device",
                        progress: loaded,
                        loaded,
                      });
                    },
                  );
                },
              }),
            (m) => m.destroy(),
          );

        emit("writer", context, options, {
          step: "on-device:ready",
          source: "on-device",
        });

        try {
          emit("writer", context, options, {
            step: "on-device:run",
            source: "on-device",
            message: "Generating text",
          });

          let result = "";
          let chunked = false;
          const tokenCount = await writer.measureInputUsage(args.prompt, {
            context: args.context,
            signal: abortScope.signal,
          });
          const tokenLimit = writer.inputQuota;
          if (tokenCount > tokenLimit) {
            const chunks = splitTextIntoChunks(
              args.prompt,
              tokenLimit * 0.8 * 3.5,
            );
            if (chunks.length > 1) {
              const chunkWritings: string[] = [];
              chunked = true;

              for (let i = 0; i < chunks.length; i++) {
                const msgTemplate = I18n.get(
                  "Writing part {current}/{total}...",
                );
                const message = msgTemplate
                  .replace("{current}", String(i + 1))
                  .replace("{total}", String(chunks.length));
                emit("writer", context, options, {
                  step: "on-device:run",
                  source: "on-device",
                  message,
                });
                const chunkResult = await writer.write(chunks[i].text, {
                  context: args.context,
                  signal: abortScope.signal,
                });
                chunkWritings.push(chunkResult);
              }

              // Combine writings
              result = chunkWritings.join("\n\n");
            }
          }
          if (!chunked) {
            result = await writer.write(args.prompt, {
              context: args.context,
              signal: abortScope.signal,
            });
          }

          if (translateOutput) {
            // Post-process translation if needed.
            const translation = await translate(
              {
                text: result,
                sourceLanguage: outputLanguage,
                targetLanguage: preferredOutputLanguage,
              },
              {
                context,
                signal: abortScope.signal,
              },
            );
            return { result: translation.result };
          }
          return { result };
        } finally {
          try {
            releaseWriter();
          } catch (error) {
            console.error("Error destroying writer:", error);
          }
        }
      } finally {
        abortScope.dispose();
      }
    },
    buildWriterBackendRequest({
      ...args,
      sharedContext,
      outputLanguage: preferredOutputLanguage,
    } as WriteArgs),
    options,
  );
};

/* ---------------------------
 * Rewriter
 * --------------------------- */

export const getRewriteOptions: (
  args: Partial<RewriteArgs>,
) => Promise<RewriterCreateCoreOptions> = (
  args: Partial<RewriteArgs>,
): Promise<RewriterCreateCoreOptions> => {
  const outputLanguage = args.outputLanguage
    ? args.outputLanguage
    : readDefaultOutputLanguage();

  const availabilityOptions: RewriterCreateCoreOptions = {
    tone: args.tone,
    format: args.format,
    length: args.length,
    outputLanguage,
  };
  return Promise.resolve(availabilityOptions);
};

export const rewrite: Features["rewrite"] = async (
  args: RewriteArgs,
  options?: FeatureOptions,
): Promise<RewriteResult> => {
  const context = pickContext(options);
  const sharedContext = args.sharedContext ?? readSharedContext();

  let outputLanguage = args.outputLanguage
    ? args.outputLanguage
    : readDefaultOutputLanguage();

  const preferredOutputLanguage = outputLanguage;
  let translateOutput = false;
  if (!isOnDeviceLanguageSupported(outputLanguage)) {
    translateOutput = true;
    outputLanguage = "en";
  }

  const core = getRewriteOptions({ ...args, outputLanguage });

  return route(
    context,
    options?.modeOverride,
    false,
    "rewriter",
    core,
    async () => {
      if (typeof Rewriter === "undefined")
        throw new Error("Rewriter API not available in this browser.");

      emit("rewriter", context, options, {
        step: "on-device:init",
        source: "on-device",
        message: "Creating Rewriter session",
      });

      const abortScope = createOnDeviceAbortScope(options);

      try {
        const { model: rewriter, release: releaseRewriter } =
          await acquireOnDeviceModel(
            "rewriter",
            { core, sharedContext },
            () =>
              Rewriter.create({
                ...core,
                sharedContext,
                monitor(m) {
                  m.addEventListener(
                    "downloadprogress",
                    (e: ProgressEvent<EventTarget>) => {
                      const loaded = e.loaded as number | undefined;
                      emit("rewriter", context, options, {
                        step: "on-device:download",
                        source: "on-device",
                        progress: loaded,
                        loaded,
                      });
                    },
                  );
                },
              }),
            (m) => m.destroy(),
          );

        emit("rewriter", context, options, {
          step: "on-device:ready",
          source: "on-device",
        });

        try {
          emit("rewriter", context, options, {
            step: "on-device:run",
            source: "on-device",
            message: "Rewriting text",
          });

          let result = "";
          let chunked = false;
          const tokenCount = await rewriter.measureInputUsage(args.text, {
            context: args.context,
            signal: abortScope.signal,
          });
          const tokenLimit = rewriter.inputQuota;
          if (tokenCount > tokenLimit) {
            const chunks = splitTextIntoChunks(
              args.text,
              tokenLimit * 0.8 * 3.5,
            );
            if (chunks.length > 1) {
              const chunkRewrites: string[] = [];
              chunked = true;
              for (let i = 0; i < chunks.length; i++) {
                const msgTemplate = I18n.get(
                  "Rewriting part {current}/{total}...",
                );
                const message = msgTemplate
                  .replace("{current}", String(i + 1))
                  .replace("{total}", String(chunks.length));
                emit("rewriter", context, options, {
                  step: "on-device:run",
                  source: "on-device",
                  message,
                });
                const chunkResult = await rewriter.rewrite(chunks[i].text, {
                  context: args.context,
                  signal: abortScope.signal,
                });
                chunkRewrites.push(chunkResult);
              }
              result = chunkRewrites.join("\n\n");
            }
          }
          if (!chunked) {
            result = await rewriter.rewrite(args.text, {
              context: args.context,
              signal: abortScope.signal,
            });
          }

          if (translateOutput) {
            const translation = await translate(
              {
                text: result,
                sourceLanguage: outputLanguage,
                targetLanguage: preferredOutputLanguage,
              },
              {
                context,
                signal: abortScope.signal,
              },
            );
            return { result: translation.result };
          }
          return { result };
        } finally {
          try {
            releaseRewriter();
          } catch (error) {
            console.error("Error destroying rewriter:", error);
          }
        }
      } finally {
        abortScope.dispose();
      }
    },
    buildRewriterBackendRequest({
      ...args,
      sharedContext,
      outputLanguage: preferredOutputLanguage,
    }),
    options,
  );
};

/* ---------------------------
 * Proofreader
 * --------------------------- */

export const getProofreadOptions: () => Promise<ProofreaderCreateCoreOptions> =
  (): Promise<ProofreaderCreateCoreOptions> => {
    return Promise.resolve({
      includeCorrectionTypes: true,
      includeCorrectionExplanations: true,
    });
  };

export const proofread: Features["proofread"] = async (
  args: ProofreadArgs,
  options?: FeatureOptions,
): Promise<ProofreadOutput> => {
  const context = pickContext(options);

  const core = await getProofreadOptions();

  return route(
    context,
    options?.modeOverride,
    false,
    "proofreader",
    core,
    async () => {
      if (typeof Proofreader === "undefined")
        throw new Error("Proofreader API not available in this browser.");

      emit("proofreader", context, options, {
        step: "on-device:init",
        source: "on-device",
        message: "Creating Proofreader session",
      });

      const abortScope = createOnDeviceAbortScope(options);

      try {
        const { model: session, release: releaseProofreader } =
          await acquireOnDeviceModel(
            "proofreader",
            { core },
            () =>
              Proofreader.create({
                ...core,
                monitor(m) {
                  m.addEventListener(
                    "downloadprogress",
                    (e: ProgressEvent<EventTarget>) => {
                      const loaded = e.loaded as number | undefined;
                      emit("proofreader", context, options, {
                        step: "on-device:download",
                        source: "on-device",
                        progress: loaded,
                        loaded,
                      });
                    },
                  );
                },
              }),
            (m) => m.destroy(),
          );

        emit("proofreader", context, options, {
          step: "on-device:ready",
          source: "on-device",
        });

        try {
          emit("proofreader", context, options, {
            step: "on-device:run",
            source: "on-device",
            message: "Proofreading",
          });
          const result = await session.proofread(args.text, {
            signal: abortScope.signal,
          });
          return { result };
        } finally {
          try {
            releaseProofreader();
          } catch (error) {
            console.error("Error destroying proofreader:", error);
          }
        }
      } finally {
        abortScope.dispose();
      }
    },
    buildProofreaderBackendRequest(args),
    options,
  );
};

/* ---------------------------
 * Summarizer
 * --------------------------- */

export const getSummarizeOptions: (
  args: Partial<SummarizeArgs>,
) => Promise<SummarizerCreateCoreOptions> = (
  args: Partial<SummarizeArgs>,
): Promise<SummarizerCreateCoreOptions> => {
  const outputLanguage = args.outputLanguage
    ? args.outputLanguage
    : readDefaultOutputLanguage();

  const availabilityOptions: SummarizerCreateCoreOptions = {
    type: args.type,
    format: args.format,
    length: args.length,
    outputLanguage,
  };
  return Promise.resolve(availabilityOptions);
};

export const summarize: Features["summarize"] = async (
  args: SummarizeArgs,
  options?: FeatureOptions,
): Promise<SummarizeResult> => {
  const context = pickContext(options);
  const sharedContext = args.sharedContext ?? readSharedContext();

  let outputLanguage = args.outputLanguage
    ? args.outputLanguage
    : readDefaultOutputLanguage();

  const preferredOutputLanguage = outputLanguage;
  let translateOutput = false;
  if (!isOnDeviceLanguageSupported(outputLanguage)) {
    translateOutput = true;
    outputLanguage = "en";
  }

  const core = await getSummarizeOptions({ ...args, outputLanguage });

  return route(
    context,
    options?.modeOverride,
    false,
    "summarizer",
    core,
    async () => {
      if (typeof Summarizer === "undefined")
        throw new Error("Summarizer API not available in this browser.");

      emit("summarizer", context, options, {
        step: "on-device:init",
        source: "on-device",
        message: "Creating Summarizer session",
      });

      const abortScope = createOnDeviceAbortScope(options);

      try {
        const { model: summarizer, release: releaseSummarizer } =
          await acquireOnDeviceModel(
            "summarizer",
            { core, sharedContext },
            () =>
              Summarizer.create({
                ...core,
                sharedContext,
                monitor(m) {
                  m.addEventListener(
                    "downloadprogress",
                    (e: ProgressEvent<EventTarget>) => {
                      const loaded = e.loaded as number | undefined;
                      emit("summarizer", context, options, {
                        step: "on-device:download",
                        source: "on-device",
                        progress: loaded,
                        loaded,
                      });
                    },
                  );
                },
              }),
            (m) => m.destroy(),
          );

        emit("summarizer", context, options, {
          step: "on-device:ready",
          source: "on-device",
        });

        try {
          emit("summarizer", context, options, {
            step: "on-device:run",
            source: "on-device",
            message: "Summarizing",
          });

          const tokenCount = await summarizer.measureInputUsage(args.text, {
            context: args.context,
            signal: abortScope.signal,
          });
          const tokenLimit = summarizer.inputQuota;
          if (tokenCount > tokenLimit) {
            const chunks = splitTextIntoChunks(
              args.text,
              tokenLimit * 0.8 * 3.5,
            );
            if (chunks.length > 1) {
              const chunkSummaries: string[] = [];

              for (let i = 0; i < chunks.length; i++) {
                const msgTemplate = I18n.get(
                  "Summarizing part {current}/{total}...",
                );
                const message = msgTemplate
                  .replace("{current}", String(i + 1))
                  .replace("{total}", String(chunks.length));
                emit("summarizer", context, options, {
                  step: "on-device:run",
                  source: "on-device",
                  message,
                });
                const chunkResult = await summarizer.summarize(chunks[i].text, {
                  context: args.context,
                  signal: abortScope.signal,
                });
                chunkSummaries.push(chunkResult);
              }

              // Combine summaries
              args.text = chunkSummaries.join("\n\n");
            }
          }

          const result = await summarizer.summarize(args.text, {
            context: args.context,
            signal: abortScope.signal,
          });

          if (translateOutput) {
            // Post-process translation if needed.
            const translation = await translate(
              {
                text: result,
                sourceLanguage: outputLanguage,
                targetLanguage: preferredOutputLanguage,
              },
              {
                context,
                signal: abortScope.signal,
              },
            );
            return { result: translation.result };
          }
          return { result };
        } finally {
          try {
            releaseSummarizer();
          } catch (error) {
            console.error("Error destroying summarizer:", error);
          }
        }
      } finally {
        abortScope.dispose();
      }
    },
    buildSummarizerBackendRequest({
      ...args,
      sharedContext,
      outputLanguage: preferredOutputLanguage,
    }),
    options,
  );
};

/* ---------------------------
 * Language detector
 * --------------------------- */

export const detectLanguage: Features["detectLanguage"] = async (
  args: DetectLanguageArgs,
  options?: FeatureOptions,
): Promise<DetectLanguageOutput> => {
  const context = pickContext(options);

  return route(
    context,
    options?.modeOverride,
    options?.silent,
    "language-detector",
    undefined,
    async () => {
      if (typeof LanguageDetector === "undefined")
        throw new Error("LanguageDetector API not available in this browser.");

      emit("language-detector", context, options, {
        step: "on-device:init",
        source: "on-device",
        message: "Creating LanguageDetector session",
        silent: options?.silent,
      });

      const abortScope = createOnDeviceAbortScope(
        options,
        QUICK_ON_DEVICE_TIMEOUT_MS,
      );

      try {
        const { model: detector, release: releaseLanguageDetector } =
          await acquireOnDeviceModel(
            "language-detector",
            {},
            () =>
              LanguageDetector.create({
                monitor(m) {
                  m.addEventListener(
                    "downloadprogress",
                    (e: ProgressEvent<EventTarget>) => {
                      const loaded = e.loaded as number | undefined;
                      emit("language-detector", context, options, {
                        step: "on-device:download",
                        source: "on-device",
                        progress: loaded,
                        loaded,
                        silent: options?.silent,
                      });
                    },
                  );
                },
              }),
            (m) => m.destroy(),
          );

        emit("language-detector", context, options, {
          step: "on-device:ready",
          source: "on-device",
          silent: options?.silent,
        });

        try {
          emit("language-detector", context, options, {
            step: "on-device:run",
            source: "on-device",
            message: "Detecting language",
            silent: options?.silent,
          });
          const candidates = (
            await detector.detect(args.text, {
              signal: abortScope.signal,
            })
          ).filter((c) =>
            LANGUAGE_OPTIONS.find(
              (option) =>
                option.value === (c.detectedLanguage as AiKitLanguageCode),
            ),
          );
          return { result: { candidates } };
        } finally {
          try {
            releaseLanguageDetector();
          } catch (error) {
            console.error("Error destroying language detector:", error);
          }
        }
      } finally {
        abortScope.dispose();
      }
    },
    buildLanguageDetectorBackendRequest(args.text, options),
    options,
  );
};

/* ---------------------------
 * Translator
 * --------------------------- */

export const getTranslateOptions: (
  args: Partial<TranslateArgs>,
) => Promise<TranslatorCreateCoreOptions> = (
  args: Partial<TranslateArgs>,
): Promise<TranslatorCreateCoreOptions> => {
  const availabilityOptions: TranslatorCreateCoreOptions = {
    sourceLanguage: args.sourceLanguage ?? "auto",
    targetLanguage: args.targetLanguage ?? readDefaultOutputLanguage() ?? "en",
  };
  return Promise.resolve(availabilityOptions);
};

export const translate: Features["translate"] = async (
  args: TranslateArgs,
  options?: FeatureOptions,
): Promise<TranslateResult> => {
  const context = pickContext(options);

  const core = await getTranslateOptions({ ...args });

  return route(
    context,
    options?.modeOverride,
    options?.silent,
    "translator",
    core,
    async () => {
      if (typeof Translator === "undefined")
        throw new Error("Translator API not available in this browser.");

      emit("translator", context, options, {
        step: "on-device:init",
        source: "on-device",
        message: "Creating Translator session",
        silent: options?.silent,
      });

      const abortScope = createOnDeviceAbortScope(
        options,
        QUICK_ON_DEVICE_TIMEOUT_MS,
      );

      try {
        const { model: translator, release: releaseTranslator } =
          await acquireOnDeviceModel(
            "translator",
            { core },
            () =>
              Translator.create({
                ...core,
                monitor(m) {
                  m.addEventListener(
                    "downloadprogress",
                    (e: ProgressEvent<EventTarget>) => {
                      const loaded = e.loaded as number | undefined;
                      emit("translator", context, options, {
                        step: "on-device:download",
                        source: "on-device",
                        progress: loaded,
                        loaded,
                        silent: options?.silent,
                      });
                    },
                  );
                },
              }),
            (m) => m.destroy(),
          );

        emit("translator", context, options, {
          step: "on-device:ready",
          source: "on-device",
          silent: options?.silent,
        });

        try {
          emit("translator", context, options, {
            step: "on-device:run",
            source: "on-device",
            message: "Translating",
            silent: options?.silent,
          });
          const translations: Promise<string>[] = [];
          const ensureNotAborted = () => {
            if (typeof abortScope.signal.throwIfAborted === "function") {
              abortScope.signal.throwIfAborted();
            } else if (abortScope.signal.aborted) {
              throw (
                (abortScope.signal as unknown as { reason?: unknown }).reason ??
                new DOMException("Aborted", "AbortError")
              );
            }
          };
          for (const line of args.text.split("\n")) {
            ensureNotAborted();
            translations.push(translator.translate(line.trim()));
          }
          const result = (await Promise.all(translations)).join("\n");
          return { result };
        } finally {
          try {
            releaseTranslator();
          } catch (error) {
            console.error("Error destroying translator:", error);
          }
        }
      } finally {
        abortScope.dispose();
      }
    },
    buildTranslatorBackendRequest(
      args.text,
      args.sourceLanguage,
      args.targetLanguage,
    ),
    options,
  );
};

/* ---------------------------
 * Prompt API (LanguageModel)
 * --------------------------- */

function buildLanguageModelInput(args: PromptArgs): LanguageModelPrompt {
  const hasImages = Array.isArray(args.images) && args.images.length > 0;

  const images = (args.images ?? []) as PromptImageInput[];
  const imageParts: Array<{ type: "image"; value: PromptImageInput }> =
    hasImages ? images.map((img) => ({ type: "image", value: img })) : [];

  // Build LanguageModelPrompt, optionally making the last user message multimodal.
  let prompt: LanguageModelPrompt;
  if (typeof args.messages === "string") {
    prompt = hasImages
      ? ([
          {
            role: "user",
            content: [{ type: "text", value: args.messages }, ...imageParts],
          },
        ] as LanguageModelPrompt)
      : args.messages;
  } else {
    const prompts: LanguageModelPrompt = args.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

    if (hasImages) {
      let lastUserIdx = -1;
      for (let i = prompts.length - 1; i >= 0; i--) {
        if (prompts[i].role === "user") {
          lastUserIdx = i;
          break;
        }
      }
      if (lastUserIdx === -1) {
        prompts.push({
          role: "user",
          content: [{ type: "text", value: "" }, ...imageParts],
        });
      } else {
        const t = String(prompts[lastUserIdx].content ?? "");
        prompts[lastUserIdx] = {
          ...prompts[lastUserIdx],
          content: [{ type: "text", value: t }, ...imageParts],
        };
      }
    }

    prompt = prompts;
  }

  return prompt;
}

const PROMPT_REQUEST_LIMIT_BYTES = 4 * 1024 * 1024;

function isBlobLike(x: unknown): x is Blob {
  return typeof Blob !== "undefined" && x instanceof Blob;
}

function extFromImageMime(mime: string | undefined): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("bmp")) return "bmp";
  return "jpg";
}

function formatFromImageMime(
  mime: string | undefined,
): "jpeg" | "png" | "gif" | "webp" {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "jpeg";
}
function extFromAudioMime(mime: string | undefined): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("aac")) return "aac";
  if (m.includes("flac")) return "flac";
  if (m.includes("m4a")) return "m4a";
  if (m.includes("webm")) return "webm";
  return "webm";
}

function formatFromAudioMime(
  mime: string | undefined,
): "mp3" | "wav" | "ogg" | "aac" | "flac" | "m4a" | "webm" {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("aac")) return "aac";
  if (m.includes("flac")) return "flac";
  if (m.includes("m4a")) return "m4a";
  return "webm";
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("FileReader error"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob);
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.substring(idx + 1) : dataUrl;
}

async function requestSignedUploadUrl(
  decision: CapabilityDecision,
  context: ContextKind,
  fileName: string,
  contentType: string,
  contentLength: number,
  options?: BackendCallOptions,
): Promise<{ uploadUrl: string; key: string }> {
  if (!decision.backendAvailable) {
    throw new Error("Backend not available for signed URL request");
  }

  const path =
    context === "admin"
      ? "/admin/generate-upload-url"
      : "/frontend/generate-upload-url";

  const baseHeaders: Record<string, string> = {
    ...(options?.headers ?? {}),
  };
  const headers = await withRecaptchaHeaders(context, baseHeaders);

  // fetch transport
  if (decision.backendTransport === "fetch") {
    if (!decision.backendBaseUrl) {
      throw new Error("Backend base URL not available for signed URL request");
    }
    const qs = new URLSearchParams({
      fileName,
      contentType,
      contentLength: String(contentLength),
    }).toString();

    const url = `${decision.backendBaseUrl.replace(/\/+$/, "")}${path}?${qs}`;
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: options?.signal,
      credentials: "omit",
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(
        `generate-upload-url (fetch) failed: HTTP ${res.status}${
          t ? ": " + t.substring(0, 200) : ""
        }`,
      );
    }
    const data = (await res.json()) as { uploadUrl: string; key: string };
    if (!data?.uploadUrl || !data?.key) {
      throw new Error(
        "generate-upload-url (fetch) response missing uploadUrl/key",
      );
    }
    return { uploadUrl: data.uploadUrl, key: data.key };
  }

  // gatey transport
  if (!decision.backendApiName) {
    throw new Error("Backend not available for signed URL request");
  }
  const gatey = getGateyPlugin();

  const body: Record<string, unknown> = {
    fileName,
    contentType,
    contentLength,
  };

  // Try GET if present, otherwise POST (backend should accept either).
  if (gatey?.cognito?.get) {
    const call = gatey.cognito.get({
      apiName: decision.backendApiName,
      path,
      options: {
        queryParams: Object.keys(body).reduce(
          (acc, k) => {
            acc[k] = String(body[k]);
            return acc;
          },
          {} as Record<string, string>,
        ),
        headers,
        retryStrategy: {
          strategy: "no-retry",
        },
      },
    });
    options?.signal?.addEventListener?.("abort", () => {
      call.cancel();
    });
    const data = await call.response.then(
      (response) =>
        response.body.json() as unknown as {
          uploadUrl: string;
          key: string;
        },
    );
    if (!data?.uploadUrl || !data?.key) {
      throw new Error(
        "generate-upload-url (gatey get) response missing uploadUrl/key",
      );
    }
    return { uploadUrl: data.uploadUrl, key: data.key };
  }

  if (!gatey?.cognito?.post) {
    throw new Error("Gatey.cognito.post is not available");
  }

  const call = gatey.cognito.post({
    apiName: decision.backendApiName,
    path,
    options: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: body as unknown as Record<string, any>,
      headers,
      retryStrategy: {
        strategy: "no-retry",
      },
    },
  });
  options?.signal?.addEventListener?.("abort", () => {
    call.cancel();
  });
  const data = await call.response.then(
    (response) =>
      response.body.json() as unknown as {
        uploadUrl: string;
        key: string;
      },
  );
  if (!data?.uploadUrl || !data?.key) {
    throw new Error(
      "generate-upload-url (gatey post) response missing uploadUrl/key",
    );
  }
  return { uploadUrl: data.uploadUrl, key: data.key };
}

async function uploadToSignedUrl(
  uploadUrl: string,
  blob: Blob,
  contentType: string,
  options?: BackendCallOptions,
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType || "application/octet-stream",
    },
    body: blob,
    signal: options?.signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(
      `S3 upload failed: HTTP ${res.status}${
        t ? ": " + t.substring(0, 200) : ""
      }`,
    );
  }
}

async function preparePromptImagesForBackend(
  images: PromptArgs["images"],
  decision: CapabilityDecision,
  context: ContextKind,
  options?: BackendCallOptions,
): Promise<
  | { images?: { format: string; data: string }[]; imageUrls?: string[] }
  | undefined
> {
  if (!images || images.length === 0) return undefined;

  // Backend uploads only support Blob/File inputs.
  const blobs: Blob[] = [];
  for (const img of images) {
    if (!isBlobLike(img)) {
      throw new Error(
        "Backend multimodal prompting currently supports only Blob/File inputs for images.",
      );
    }
    blobs.push(img);
  }

  // Estimate request size if we inline images as data URLs (base64 overhead).
  const totalBytes = blobs.reduce((sum, b) => sum + (b.size || 0), 0);
  const estimatedInlineBytes = Math.ceil(
    totalBytes * 1.37 + 2048 * blobs.length,
  );
  const shouldInline = estimatedInlineBytes <= PROMPT_REQUEST_LIMIT_BYTES;

  if (shouldInline) {
    emit("prompt", context, options, {
      step: "backend:request",
      source: "backend",
      message: "Inlining images as base64",
    });
    const inline: { format: string; data: string }[] = [];
    for (const b of blobs) {
      inline.push({
        format: formatFromImageMime(b.type),
        data: await blobToBase64(b),
      });
    }
    return { images: inline };
  }

  // Otherwise: upload images via signed URL and send keys.
  emit("prompt", context, options, {
    step: "backend:request",
    source: "backend",
    message: "Uploading images via signed URL",
  });

  const keys: string[] = [];
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    const contentType = b.type || "application/octet-stream";
    const name =
      (b as { name?: string }).name ||
      `image_${i}.${extFromImageMime(contentType)}`;

    emit("prompt", context, options, {
      step: "backend:request",
      source: "backend",
      message: "Requesting signed URL",
    });
    const { uploadUrl, key } = await requestSignedUploadUrl(
      decision,
      context,
      name,
      contentType,
      b.size || 0,
      options,
    );

    emit("prompt", context, options, {
      step: "backend:waiting",
      source: "backend",
      message: "Uploading",
    });
    await uploadToSignedUrl(uploadUrl, b, contentType, options);
    keys.push(key);
  }

  return { imageUrls: keys };
}

/**
 * Prepare audio for backend request: upload Blob to S3 and return key.
 * Backend only accepts S3 keys (audioUrl), not base64 inline.
 */
async function prepareAudioForBackend(
  audio: Blob | undefined,
  decision: CapabilityDecision,
  context: ContextKind,
  options?: BackendCallOptions,
): Promise<
  { audio?: { format: string; data: string }; audioUrl?: string } | undefined
> {
  if (!audio) return undefined;

  // Estimate request size if we inline audio as data URL (base64 overhead).
  const totalBytes = audio.size || 0;
  const estimatedInlineBytes = Math.ceil(totalBytes * 1.37 + 2048);
  const shouldInline = estimatedInlineBytes <= PROMPT_REQUEST_LIMIT_BYTES;

  if (shouldInline) {
    emit("prompt", context, options, {
      step: "backend:request",
      source: "backend",
      message: "Inlining audio as base64",
    });
    const format = formatFromAudioMime(audio.type || "audio/webm");
    const data = await blobToBase64(audio);
    return { audio: { format, data } };
  }

  // Otherwise: upload audio via signed URL and send key.
  emit("prompt", context, options, {
    step: "backend:request",
    source: "backend",
    message: "Uploading audio via signed URL",
  });

  const contentType = audio.type || "audio/webm";
  const name =
    (audio as { name?: string }).name ||
    `audio.${extFromAudioMime(contentType)}`;

  emit("prompt", context, options, {
    step: "backend:request",
    source: "backend",
    message: "Requesting signed URL for audio",
  });

  const { uploadUrl, key: audioKey } = await requestSignedUploadUrl(
    decision,
    context,
    name,
    contentType,
    audio.size || 0,
    options,
  );

  emit("prompt", context, options, {
    step: "backend:waiting",
    source: "backend",
    message: "Uploading audio",
  });

  await uploadToSignedUrl(uploadUrl, audio, contentType, options);

  return { audioUrl: audioKey };
}

export const getPromptOptions: (
  args: Partial<PromptArgs>,
) => Promise<LanguageModelCreateCoreOptions> = async (
  args: Partial<PromptArgs>,
): Promise<LanguageModelCreateCoreOptions> => {
  let outputLanguage = args.outputLanguage
    ? args.outputLanguage
    : readDefaultOutputLanguage();

  if (!isOnDeviceLanguageSupported(outputLanguage)) {
    outputLanguage = "en";
  }

  const availabilityOptions: LanguageModelCreateCoreOptions = {
    topK: args.topK,
    temperature: args.temperature,
    expectedInputs: [{ type: "text" }, { type: "image" }],
    expectedOutputs: [{ type: "text", languages: [outputLanguage] }],
  };
  return availabilityOptions;
};

export const prompt: Features["prompt"] = async (
  args: PromptArgs,
  options?: FeatureOptions,
): Promise<PromptResult> => {
  const context = pickContext(options);
  const sharedContext = args.sharedContext ?? readSharedContext();

  let outputLanguage = args.outputLanguage
    ? args.outputLanguage
    : readDefaultOutputLanguage();

  const preferredOutputLanguage = outputLanguage;
  let translateOutput = false;
  if (!isOnDeviceLanguageSupported(outputLanguage)) {
    translateOutput = true;
    outputLanguage = "en";
  }

  const core = await getPromptOptions({ ...args, outputLanguage });
  const decision = await decideCapability(
    "prompt",
    core as never,
    options?.modeOverride,
    context,
  );

  return route(
    context,
    options?.modeOverride,
    false,
    "prompt",
    core,
    async () => {
      if (typeof LanguageModel === "undefined")
        throw new Error("LanguageModel API not available in this browser.");

      emit("prompt", context, options, {
        step: "on-device:init",
        source: "on-device",
        message: "Creating LanguageModel session",
      });

      const systemTexts: string[] = [];

      if (typeof args.messages !== "string") {
        for (const m of args.messages) {
          if (m.role === "system" && m.content.trim())
            systemTexts.push(m.content.trim());
        }
        if (sharedContext && sharedContext.trim()) {
          systemTexts.push("SHARED CONTEXT: " + sharedContext.trim());
        }
      }

      const systemText =
        systemTexts.length > 0 ? systemTexts.join("\n\n") : undefined;

      const initialPrompts: [LanguageModelSystemMessage] | undefined =
        systemText ? [{ role: "system", content: systemText }] : undefined;

      const abortScope = createOnDeviceAbortScope(options);

      try {
        const { model: languageModel, release: releaseLanguageModel } =
          await acquireOnDeviceModel(
            "language-model",
            { core, initialPrompts },
            () =>
              LanguageModel.create({
                ...core,
                initialPrompts,
                monitor(m) {
                  m.addEventListener(
                    "downloadprogress",
                    (e: ProgressEvent<EventTarget>) => {
                      // In current Chrome implementations, e.loaded is a 0..1 fraction.
                      const loaded = e.loaded as number | undefined;
                      emit("prompt", context, options, {
                        step: "on-device:download",
                        source: "on-device",
                        progress: loaded,
                        loaded,
                      });
                    },
                  );
                },
              }),
            (m) => m.destroy(),
          );

        emit("prompt", context, options, {
          step: "on-device:ready",
          source: "on-device",
        });

        try {
          emit("prompt", context, options, {
            step: "on-device:run",
            source: "on-device",
            message: "Generating text",
          });
          const result = await languageModel.prompt(
            buildLanguageModelInput(args),
            {
              signal: abortScope.signal,
              responseConstraint: args.responseConstraint,
            },
          );
          if (translateOutput) {
            // Post-process translation if needed.
            const translation = await translate(
              {
                text: result,
                sourceLanguage: outputLanguage,
                targetLanguage: preferredOutputLanguage,
              },
              {
                context,
                signal: abortScope.signal,
              },
            );
            return { result: translation.result };
          }
          return { result };
        } finally {
          try {
            releaseLanguageModel();
          } catch (error) {
            console.error("Error destroying LanguageModel:", error);
          }
        }
      } finally {
        abortScope.dispose();
      }
    },
    await buildPromptBackendRequest(
      {
        ...args,
        sharedContext,
      } as PromptArgs,
      context,
      decision,
      options,
    ),
    options,
  );
};

export const sendChatMessage: Features["sendChatMessage"] = async (
  args: ChatMessageArgs,
  options?: FeatureOptions,
): Promise<PromptResult> => {
  const context = pickContext(options);
  const sharedContext = args.sharedContext ?? readSharedContext();

  const feature = "prompt";
  const backend = await resolveBackend();
  const decision = {
    feature,
    mode: "backend-only",
    onDeviceAvailable: false,
    backendAvailable: backend.available,
    backendTransport: backend.transport,
    backendApiName: backend.apiName,
    backendBaseUrl: backend.baseUrl,
    backendReason: backend.reason,
  } as CapabilityDecision;

  const backendBody = await buildChatMessageBackendRequest(
    {
      sessionId: args.sessionId,
      message: args.message,
      audio: args.audio,
      images: args.images,
      sharedContext,
    } as ChatMessageArgs,
    context,
    decision,
    options,
  );

  emit(feature, context, options, {
    step: "backend:request",
    source: "backend",
  });
  const result = await dispatchFeatureBackend<PromptResult>(
    decision,
    context,
    feature,
    backendBody,
    options,
  );
  emit(feature, context, options, {
    step: "done",
    source: "backend",
  });
  return result;
};

export const sendSearchMessage: Features["sendSearchMessage"] = async (
  args: SearchMessageArgs,
  options?: FeatureOptions,
): Promise<SearchResult> => {
  const context = pickContext(options);
  const sharedContext = args.sharedContext ?? readSharedContext();

  const feature = "prompt";
  const backend = await resolveBackend();
  const decision = {
    feature,
    mode: "backend-only",
    onDeviceAvailable: false,
    backendAvailable: backend.available,
    backendTransport: backend.transport,
    backendApiName: backend.apiName,
    backendBaseUrl: backend.baseUrl,
    backendReason: backend.reason,
  } as CapabilityDecision;

  const backendBody = await buildSearchMessageBackendRequest(
    {
      ...args,
      sharedContext,
    },
    context,
    decision,
    options,
  );

  emit(feature, context, options, {
    step: "backend:request",
    source: "backend",
  });

  const result = await dispatchFeatureBackend<SearchResult>(
    decision,
    context,
    feature,
    backendBody,
    options,
  );

  emit(feature, context, options, {
    step: "done",
    source: "backend",
  });

  return result;
};

export const sendFeedbackMessage: Features["sendFeedbackMessage"] = async (
  args: FeedbackMessageArgs,
  options?: FeatureOptions,
): Promise<PromptResult> => {
  const context = "frontend";

  const feature = "prompt";
  const backend = await resolveBackend();
  const decision = {
    feature,
    mode: "backend-only",
    onDeviceAvailable: false,
    backendAvailable: backend.available,
    backendTransport: backend.transport,
    backendApiName: backend.apiName,
    backendBaseUrl: backend.baseUrl,
    backendReason: backend.reason,
  } as CapabilityDecision;

  const backendBody = await buildFeedbackMessageBackendRequest({
    sessionId: args.sessionId,
    feedbackMessageId: args.feedbackMessageId,
    feedbackType: args.feedbackType,
  } as FeedbackMessageArgs);

  emit(feature, context, options, {
    step: "backend:request",
    source: "backend",
  });
  const result = await dispatchFeatureBackend<PromptResult>(
    decision,
    context,
    feature,
    backendBody,
    options,
  );
  emit(feature, context, options, {
    step: "done",
    source: "backend",
  });
  return result;
};
