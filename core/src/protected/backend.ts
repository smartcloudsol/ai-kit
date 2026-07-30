// backend.ts
//
// Backend dispatcher for AI features.
// Uses capability decision (backend transport) and feature → path maps.
//
// Backend options:
// - Gatey (apiName): Gatey.cognito.post(apiName, path, { body, signal })
// - Fetch (base URL): fetch(baseUrl + path, POST JSON)

import { getGateyPlugin } from "@smart-cloud/gatey-core";
import { getRecaptcha, getWpSuite } from "@smart-cloud/wpsuite-core";
import { del, get, patch, post, put } from "aws-amplify/api";
import { getAiKitPlugin } from "../runtime";
import type {
  AiKitSettings,
  BackendCallOptions,
  BuiltInAiFeature,
  CapabilityDecision,
  ContextKind,
} from "../types";
import { BackendError } from "../types";

/* -----------------------------
 * reCAPTCHA chat assessment caching (client-side)
 * ----------------------------- */

const recaptchaVerifiedAtBySession = new Map<string, number>();

function parseIsoToMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : undefined;
}

function getChatRecaptchaTtlMs(settings: AiKitSettings): number {
  const v = settings?.reCaptchaChatTtlSeconds;
  const sec =
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 120;
  // Clamp to something sensible (0..3600s) to avoid surprising long-lived windows.
  const clampedSec = Math.min(3600, sec);
  return clampedSec * 1000;
}

function isRecaptchaAssessmentFresh(
  cacheKey: string,
  settings: AiKitSettings,
): boolean {
  const ttlMs = getChatRecaptchaTtlMs(settings);
  if (ttlMs <= 0) return false;
  const last = recaptchaVerifiedAtBySession.get(cacheKey);
  if (!last) return false;
  return Date.now() - last < ttlMs;
}

function setRecaptchaVerifiedAt(cacheKey: string, isoTimestamp: string): void {
  const ms = parseIsoToMs(isoTimestamp);
  if (!ms) return;
  recaptchaVerifiedAtBySession.set(cacheKey, ms);
}

function getRecaptchaChatCacheKey(
  context: ContextKind,
  body: unknown,
): string | undefined {
  if (context !== "frontend") return undefined;
  if (!isPlainObject(body)) return undefined;
  // Only chat/prompt calls use sessionId, and saveChatSession=true indicates session semantics.
  if (body["saveChatSession"] !== true) return undefined;
  const sid = body["sessionId"];
  return typeof sid === "string" && sid.trim() ? sid.trim() : undefined;
}

function readHeader(
  headers: Headers | Record<string, string | undefined> | undefined | null,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  try {
    if (typeof (headers as Headers).get === "function") {
      const v = (headers as Headers).get(name);
      return v ?? undefined;
    }
  } catch {
    // ignore
  }
  const key = Object.keys(headers as Record<string, unknown>).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  );
  if (!key) return undefined;
  const v = (headers as Record<string, string | undefined>)[key];
  return typeof v === "string" && v ? v : undefined;
}

async function getRecaptchaTokenIfNeeded(
  context: ContextKind,
  opts?: { cacheKey?: string },
): Promise<string | undefined> {
  if (context !== "frontend") return undefined;

  const settings = getWpSuite()?.siteSettings;
  if (!settings?.reCaptchaPublicKey) return undefined;

  // Chat optimization: if we recently passed an assessment for this session, skip generating a new token.
  if (
    opts?.cacheKey &&
    isRecaptchaAssessmentFresh(opts.cacheKey, getAiKitPlugin()?.settings || {})
  ) {
    return undefined;
  }

  const { execute } = await getRecaptcha(
    settings?.useRecaptchaEnterprise || false,
  );

  /*
  type GrecaptchaLike = {
    ready?: (cb: () => void) => void;
    execute?: (siteKey: string, opts: { action: string }) => Promise<string>;
    enterprise?: {
      ready?: (cb: () => void) => void;
      execute?: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  };

  const grecaptcha = (globalThis as unknown as { grecaptcha?: GrecaptchaLike })
    .grecaptcha;
  const enterprise = settings?.useRecaptchaEnterprise
    ? grecaptcha?.enterprise
    : undefined;
  const ready = enterprise?.ready ?? grecaptcha?.ready;
  const execute = enterprise?.execute ?? grecaptcha?.execute;
  */
  if (typeof execute !== "function") return undefined;

  try {
    /*
    if (typeof ready === "function") {
      await new Promise<void>((resolve) => ready(() => resolve()));
    }
      */
    const action = "generate";
    const token = await execute(settings.reCaptchaPublicKey, { action });
    return typeof token === "string" && token ? token : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Adds X-Recaptcha-Token header for frontend calls when configured.
 */
export async function withRecaptchaHeaders(
  context: ContextKind,
  headers: Record<string, string>,
  opts?: { cacheKey?: string },
): Promise<Record<string, string>> {
  if (context !== "frontend") return headers;
  // Respect explicit header if already provided.
  if (headers["X-Recaptcha-Token"] || headers["x-recaptcha-token"]) {
    return headers;
  }
  const token = await getRecaptchaTokenIfNeeded(context, opts);
  if (!token) return headers;
  return { ...headers, "X-Recaptcha-Token": token };
}

function emit(
  options: BackendCallOptions | undefined,
  event: Parameters<NonNullable<BackendCallOptions["onStatus"]>>[0],
) {
  try {
    options?.onStatus?.(event);
  } catch {
    // ignore
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

const BACKEND_REQUEST_ALLOWLIST: Record<BuiltInAiFeature, readonly string[]> = {
  prompt: [
    "text",
    "audio",
    "audioUrl",
    "systemPrompt",
    "context",
    "maxTokens",
    "responseConstraint",
    "saveChatSession",
    "engine",
    "sessionId",
    "images",
    "imageUrls",
    "feedbackMessageId",
    "feedbackType",
    "knowledgeBaseId",
    "disableKB",
    "topK",
    "temperature",
    "userSelectedCategories",
    "userSelectedSubcategories",
    "userSelectedTags",
  ],
  writer: [
    "text",
    "outputLanguage",
    "instruction",
    "context",
    "tone",
    "format",
    "length",
    "knowledgeBaseId",
    "disableKB",
  ],
  rewriter: [
    "text",
    "outputLanguage",
    "instruction",
    "context",
    "tone",
    "format",
    "length",
  ],
  summarizer: [
    "text",
    "outputLanguage",
    "instruction",
    "context",
    "type",
    "format",
    "length",
  ],
  translator: ["text", "sourceLanguage", "targetLanguage"],
  "language-detector": ["text", "maxCandidates"],
  proofreader: ["text", "expectedInputLanguages"],
};

function sanitizeBackendRequestBody(
  feature: BuiltInAiFeature,
  body: unknown,
): unknown {
  if (!isPlainObject(body)) return body;
  const allowed = BACKEND_REQUEST_ALLOWLIST[feature];
  if (!allowed) return body;
  const out: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) out[k] = body[k];
  }
  return out;
}

/**
 * Backend-relative paths for admin context.
 */
const ADMIN_FEATURE_PATH_MAP: Record<BuiltInAiFeature, string> = {
  prompt: "/admin/prompt",
  writer: "/admin/write",
  rewriter: "/admin/rewrite",
  summarizer: "/admin/summarize",
  translator: "/admin/translate",
  "language-detector": "/admin/detect-language",
  proofreader: "/admin/proofread",
};

/**
 * Backend-relative paths for frontend context.
 */
const FRONTEND_FEATURE_PATH_MAP: Record<BuiltInAiFeature, string> = {
  prompt: "/frontend/prompt",
  writer: "/frontend/write",
  rewriter: "/frontend/rewrite",
  summarizer: "/frontend/summarize",
  translator: "/frontend/translate",
  "language-detector": "/frontend/detect-language",
  proofreader: "/frontend/proofread",
};

function getBackendPath(
  context: ContextKind,
  feature: BuiltInAiFeature,
): string {
  const map =
    context === "admin" ? ADMIN_FEATURE_PATH_MAP : FRONTEND_FEATURE_PATH_MAP;
  return map[feature];
}

function getBackendCustomPath(context: ContextKind, path: string): string {
  const map = context === "admin" ? "/admin" : "/frontend";
  return `${map}${path}`;
}

/**
 * Dispatch feature backend call using an already computed decision.
 * Callers should compute decision via decideCapability() once, then call this.
 */
export async function dispatchFeatureBackend<TResponse>(
  decision: CapabilityDecision,
  context: ContextKind,
  feature: BuiltInAiFeature,
  requestBody: unknown,
  options: BackendCallOptions = {},
): Promise<TResponse> {
  const path = getBackendPath(context, feature);
  if (!path) {
    throw new BackendError(
      `No backend path configured for "${feature}" (${context}).`,
      decision,
    );
  }
  const sanitizedBody = sanitizeBackendRequestBody(feature, requestBody);
  return dispatchBackend(
    decision,
    context,
    feature,
    path,
    "POST",
    sanitizedBody,
    options,
  );
}

/**
 * Dispatch feature backend call using an already computed decision.
 * Callers should compute decision via decideCapability() once, then call this.
 */
export async function dispatchCustomBackend<TResponse>(
  decision: CapabilityDecision,
  context: ContextKind,
  customPath: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  requestBody: unknown,
  options: BackendCallOptions = {},
): Promise<TResponse> {
  const path = getBackendCustomPath(context, customPath);
  return dispatchBackend(
    decision,
    context,
    "prompt",
    path,
    method,
    requestBody,
    options,
  );
}

async function dispatchBackend<TResponse>(
  decision: CapabilityDecision,
  context: ContextKind,
  feature: BuiltInAiFeature,
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  requestBody: unknown,
  options: BackendCallOptions = {},
): Promise<TResponse> {
  if (decision.backendTransport === "fetch") {
    if (!decision.backendBaseUrl) {
      throw new BackendError(
        `backendTransport=fetch but backendBaseUrl is missing.`,
        decision,
      );
    }
    return callBackendViaFetch<TResponse>(
      decision.backendBaseUrl,
      path,
      method,
      requestBody,
      options,
      decision,
      feature,
      context,
    );
  }

  // Default to gatey if transport is "gatey" or undefined but apiName is present.
  if (!decision.backendApiName) {
    throw new BackendError(
      `backendTransport=gatey but backendApiName is missing.`,
      decision,
    );
  }
  return callBackendViaGatey<TResponse>(
    decision.backendApiName,
    path,
    method,
    requestBody,
    options,
    decision,
    feature,
    context,
  );
}

async function callBackendViaFetch<TResponse>(
  baseUrl: string,
  path: string,
  method: string,
  body: unknown,
  options: BackendCallOptions,
  decision: CapabilityDecision,
  feature: BuiltInAiFeature,
  context: ContextKind,
): Promise<TResponse> {
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;

  const baseHeaders: Record<string, string> = {
    "content-type": "application/json",
    ...(options.headers ?? {}),
  };

  const recaptchaCacheKey =
    feature === "prompt" ? getRecaptchaChatCacheKey(context, body) : undefined;
  const headers = await withRecaptchaHeaders(context, baseHeaders, {
    cacheKey: recaptchaCacheKey,
  });

  const qs =
    options.query && Object.keys(options.query).length > 0
      ? "?" +
        new URLSearchParams(
          Object.entries(options.query).map(([k, v]) => [k, String(v)]),
        ).toString()
      : "";

  emit(options, {
    feature,
    context,
    step: "backend:request",
    source: "backend",
  });

  emit(options, {
    feature,
    context,
    step: "backend:waiting",
    source: "backend",
  });

  const res = await fetch(url + qs, {
    method: method,
    headers,
    body: JSON.stringify(body ?? {}),
    signal: options.signal,
    credentials: "omit",
  });

  emit(options, {
    feature,
    context,
    step: "backend:response",
    source: "backend",
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const t = await res.text();
      if (t) msg = `${msg}: ${t.substring(0, 400)}`;
    } catch {
      // ignore
    }
    throw new BackendError(
      `Fetch backend call failed: ${msg}`,
      decision,
      res.status,
    );
  }

  const ct = res.headers.get("content-type") || "";
  const verifiedAt = readHeader(res.headers, "x-recaptcha-verified-at");

  if (ct.includes("application/json")) {
    const data = (await res.json()) as unknown as { sessionId?: string };
    const sid =
      (data && typeof data.sessionId === "string" && data.sessionId.trim()
        ? data.sessionId.trim()
        : undefined) ?? recaptchaCacheKey;

    if (verifiedAt && sid) {
      setRecaptchaVerifiedAt(sid, verifiedAt);
    }
    return data as unknown as TResponse;
  }

  // Non-JSON responses don't carry sessionId; use request cache key if available.
  if (verifiedAt && recaptchaCacheKey) {
    setRecaptchaVerifiedAt(recaptchaCacheKey, verifiedAt);
  }
  return (await res.text()) as unknown as TResponse;
}

async function callBackendViaGatey<TResponse>(
  apiName: string,
  path: string,
  method: string,
  body: unknown,
  options: BackendCallOptions,
  decision: CapabilityDecision,
  feature: BuiltInAiFeature,
  context: ContextKind,
): Promise<TResponse> {
  const gatey = getGateyPlugin();

  let f:
    | typeof get
    | typeof post
    | typeof put
    | typeof patch
    | typeof del
    | undefined;
  switch (method.toUpperCase()) {
    case "POST":
      f = gatey?.cognito?.post;
      break;
    case "GET":
      f = gatey?.cognito?.get;
      break;
    case "PUT":
      f = gatey?.cognito?.put;
      break;
    case "PATCH":
      f = gatey?.cognito?.patch;
      break;
    case "DELETE":
      f = gatey?.cognito?.del;
      break;
    default:
      throw new BackendError(
        `Unsupported HTTP method "${method}" for Gatey backend.`,
        decision,
      );
  }

  if (!f) {
    throw new BackendError(
      `Gatey backend selected, but Gatey.cognito.${method.toLowerCase()} is not available.`,
      decision,
    );
  }

  const recaptchaCacheKey =
    feature === "prompt" ? getRecaptchaChatCacheKey(context, body) : undefined;
  const headers = await withRecaptchaHeaders(
    context,
    {
      ...(options.headers ?? {}),
    },
    {
      cacheKey: recaptchaCacheKey,
    },
  );

  emit(options, {
    feature,
    context,
    step: "backend:request",
    source: "backend",
  });

  emit(options, {
    feature,
    context,
    step: "backend:waiting",
    source: "backend",
  });
  type GateyPostCall<T> = {
    cancel: () => void;
    response: Promise<{ body: { json: () => Promise<T> } }>;
  };

  const call = f({
    apiName,
    path,
    options: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: body as any,
      headers,
      retryStrategy: {
        strategy: "no-retry",
      },
    },
  }) as unknown as GateyPostCall<TResponse>;
  options?.signal?.addEventListener?.("abort", () => {
    call.cancel();
  });
  const response = await call.response;
  const verifiedAt = readHeader(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (response as any).headers as any,
    "x-recaptcha-verified-at",
  );

  const result = (await response.body.json()) as unknown as TResponse;

  // Try to resolve a sessionId from the response (preferred) or request.
  const sid =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((result as any)?.sessionId as unknown as string | undefined) ??
    recaptchaCacheKey;

  if (verifiedAt && typeof sid === "string" && sid.trim()) {
    setRecaptchaVerifiedAt(sid.trim(), verifiedAt);
  }

  emit(options, {
    feature,
    context,
    step: "backend:response",
    source: "backend",
  });

  return result;
}
