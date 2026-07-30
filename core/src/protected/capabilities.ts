// capabilities.ts
//
// Capability resolution for:
// - Chrome Built-in AI (on-device)
// - Optional backend (Gatey API name OR free base URL)
//
// Uses @types/dom-chromium-ai for all Chrome AI types.

import { getWpSuite } from "@smart-cloud/wpsuite-core";
import { getGateyPlugin } from "@smart-cloud/gatey-core";
import type { AiKitPlugin } from "../runtime";
import { getStoreSelect, type AiKitConfig } from "../store";
import type {
  AiKitLanguageCode,
  AiModePreference,
  AnyCreateCoreOptions,
  BackendTransport,
  BuiltInAiFeature,
  CapabilityDecision,
  DeviceAvailability,
} from "../types";

async function readAiKitConfig(): Promise<AiKitConfig> {
  const aiKit = getWpSuite()?.plugins?.aiKit as AiKitPlugin | undefined;
  const store = await aiKit?.features.store;
  const config = getStoreSelect(store!).getConfig();
  return config ?? {};
}

function normalizeTransport(config: AiKitConfig): {
  transport?: BackendTransport;
  backendApiName?: string;
  backendBaseUrl?: string;
} {
  const backendApiName = config.backendApiName?.trim() || undefined;
  const backendBaseUrl = config.backendBaseUrl?.trim() || undefined;

  const transport =
    config.backendTransport ??
    (backendBaseUrl ? "fetch" : backendApiName ? "gatey" : undefined);

  return { transport, backendApiName, backendBaseUrl };
}

function getModePreference(config: AiKitConfig): AiModePreference {
  if (config.mode) return config.mode;
  // Default: if a backend is configured -> backend-fallback, else local-only
  const { transport } = normalizeTransport(config);
  return transport ? "backend-fallback" : "local-only";
}

export async function resolveBackend(): Promise<{
  available: boolean;
  transport?: BackendTransport;
  apiName?: string;
  baseUrl?: string;
  reason?: string;
}> {
  const config = await readAiKitConfig();
  const { transport, backendApiName, backendBaseUrl } =
    normalizeTransport(config);

  if (!transport) {
    return { available: false, reason: "No backend configured" };
  }

  if (transport === "fetch") {
    if (!backendBaseUrl)
      return { available: false, reason: "backendBaseUrl is missing" };
    return {
      available: true,
      transport,
      baseUrl: backendBaseUrl,
      reason: "Custom fetch backend",
    };
  }

  // gatey transport
  if (!backendApiName)
    return { available: false, reason: "backendApiName is missing" };

  const gatey = getGateyPlugin();
  if (!gatey?.availability || (await gatey.availability()) !== "available") {
    return { available: false, reason: "Gatey is not available" };
  }

  return {
    available: true,
    transport,
    apiName: backendApiName,
    reason: "Gatey backend",
  };
}

/* -----------------------------
 * On-device availability
 * ----------------------------- */

function isPresent(name: string): boolean {
  return typeof (globalThis as never)[name] !== "undefined";
}

/**
 * Browser gate for Chrome Built-in AI.
 *
 * Motivation:
 * Some Chromium-derived browsers (Edge/Brave/etc.) may expose partial globals that look
 * present but crash later on availability()/create(). We pre-filter to "real" Chrome/Chromium
 * and enforce per-feature minimum Chrome major versions.
 *
 * Approach:
 * - Prefer UA-CH (navigator.userAgentData) brands/fullVersionList when available.
 * - Fall back to navigator.userAgent parsing.
 * - Explicitly exclude Edge/Opera/Vivaldi/Samsung/Firefox/Safari/Brave.
 */
export const MIN_CHROME_VERSION: Partial<Record<BuiltInAiFeature, number>> = {
  summarizer: 138,
  translator: 138,
  "language-detector": 138,
  writer: 137,
  rewriter: 137,
  proofreader: 141,
  prompt: 138,
};

/**
 * Features that require Origin Trial tokens or Chrome flags
 * These are experimental APIs that need additional setup
 */
const ORIGIN_TRIAL_FEATURES: Set<BuiltInAiFeature> = new Set([
  "writer",
  "rewriter",
  "proofreader",
  "prompt",
]);

type BrowserGateResult = {
  allowed: boolean;
  reason: string;
  chromeMajor?: number;
};

function parseMajor(version?: string): number | undefined {
  if (!version) return undefined;
  const major = Number.parseInt(String(version).split(".")[0] ?? "", 10);
  return Number.isFinite(major) ? major : undefined;
}

function hasBrand(
  list: Array<{ brand: string; version: string }> | undefined,
  brandName: string,
): string | undefined {
  return list?.find((b) => b.brand === brandName)?.version;
}

async function getUaBrandList(): Promise<
  Array<{ brand: string; version: string }> | undefined
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uaData = (navigator as any)?.userAgentData as
    | {
        brands?: Array<{ brand: string; version: string }>;
        getHighEntropyValues?: (
          hints: string[],
        ) => Promise<
          | { fullVersionList: Array<{ brand: string; version: string }> }
          | undefined
        >;
      }
    | undefined;

  if (!uaData) return undefined;

  try {
    const hev = await uaData.getHighEntropyValues?.(["fullVersionList"]);
    const full = hev?.fullVersionList as
      | Array<{ brand: string; version: string }>
      | undefined;
    if (Array.isArray(full) && full.length > 0) return full;
  } catch {
    // ignore
  }

  if (Array.isArray(uaData.brands) && uaData.brands.length > 0)
    return uaData.brands;
  return undefined;
}

function detectChromeMajorFromUa(userAgent: string): number | undefined {
  // Chrome/141.0.0.0 or Chromium/141.0.0.0
  const m = userAgent.match(/\b(?:Chrome|Chromium)\/(\d{2,3})\b/i);
  return m?.[1] ? parseMajor(m[1]) : undefined;
}

function isBraveBrowser(): boolean {
  // Brave often masks as Chrome in UA + UA-CH; this runtime signal is the most reliable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(navigator as any)?.brave;
}

async function browserGate(
  feature: BuiltInAiFeature,
): Promise<BrowserGateResult> {
  if (typeof navigator === "undefined")
    return { allowed: false, reason: "no-navigator" };

  if (
    typeof globalThis.isSecureContext === "boolean" &&
    !globalThis.isSecureContext
  ) {
    return { allowed: false, reason: "not-secure-context" };
  }

  const userAgent = navigator.userAgent ?? "";
  const brands = await getUaBrandList();

  const edgeBrandVersion =
    hasBrand(brands, "Microsoft Edge") ??
    hasBrand(brands, "Microsoft Edge WebView2");
  const chromeBrandVersion =
    hasBrand(brands, "Google Chrome") ?? hasBrand(brands, "Chromium");

  const isEdge =
    !!edgeBrandVersion ||
    /\bEdg\//i.test(userAgent) ||
    /\bEdgiOS\//i.test(userAgent);
  const isOpera = /\bOPR\//i.test(userAgent);
  const isVivaldi = /\bVivaldi\//i.test(userAgent);
  const isSamsung = /\bSamsungBrowser\//i.test(userAgent);
  const isFirefox = /\bFirefox\//i.test(userAgent);
  const isSafariLike =
    !/\bChrome\//i.test(userAgent) &&
    /\bSafari\//i.test(userAgent) &&
    !/\bChromium\//i.test(userAgent);
  const isBrave = isBraveBrowser() || /\bBrave\//i.test(userAgent);

  if (
    isEdge ||
    isOpera ||
    isVivaldi ||
    isSamsung ||
    isFirefox ||
    isSafariLike ||
    isBrave
  ) {
    const reason = isEdge
      ? "edge"
      : isBrave
        ? "brave"
        : isFirefox
          ? "firefox"
          : isSafariLike
            ? "safari"
            : isOpera
              ? "opera"
              : isVivaldi
                ? "vivaldi"
                : isSamsung
                  ? "samsung"
                  : "unsupported-browser";
    return { allowed: false, reason };
  }

  const chromeMajor =
    parseMajor(chromeBrandVersion) ?? detectChromeMajorFromUa(userAgent);

  const min = MIN_CHROME_VERSION[feature];
  if (!min) return { allowed: false, reason: "no-min-version", chromeMajor };

  if (!chromeMajor) return { allowed: false, reason: "unknown-chrome-version" };

  if (chromeMajor < min) {
    return {
      allowed: false,
      reason: `chrome-too-old-${chromeMajor}-lt-${min}`,
      chromeMajor,
    };
  }

  return { allowed: true, reason: "ok", chromeMajor };
}

export async function checkOnDeviceAvailability(
  feature: BuiltInAiFeature,
  availabilityOptions?: AnyCreateCoreOptions,
): Promise<DeviceAvailability> {
  try {
    const gate = await browserGate(feature);
    const gateReason = `browser-gate:${gate.reason}${
      gate.chromeMajor ? ` (chrome ${gate.chromeMajor})` : ""
    }`;
    if (!gate.allowed) {
      return {
        available: false,
        status: "unavailable",
        reason: gateReason,
      };
    }

    // Helper to build better error messages when availability() returns unavailable
    const buildUnavailableReason = (apiStatus: string): string => {
      if (apiStatus === "unavailable") {
        if (ORIGIN_TRIAL_FEATURES.has(feature)) {
          return "requires Chrome flags or Origin Trial tokens — see AI-Kit Diagnostics";
        }
        return "check hardware requirements or see AI-Kit Diagnostics";
      }
      return gateReason;
    };

    switch (feature) {
      case "writer": {
        if (!isPresent("Writer") || !Writer?.availability)
          return {
            available: false,
            status: "api-not-present",
            reason: gateReason,
          };
        const status = await Writer.availability(
          availabilityOptions as WriterCreateCoreOptions,
        );
        return {
          available: status !== "unavailable",
          status,
          reason: buildUnavailableReason(status),
        };
      }
      case "rewriter": {
        if (!isPresent("Rewriter") || !Rewriter?.availability)
          return {
            available: false,
            status: "api-not-present",
            reason: gateReason,
          };
        const status = await Rewriter.availability(
          availabilityOptions as RewriterCreateCoreOptions,
        );
        return {
          available: status !== "unavailable",
          status,
          reason: buildUnavailableReason(status),
        };
      }
      case "summarizer": {
        if (!isPresent("Summarizer") || !Summarizer?.availability)
          return {
            available: false,
            status: "api-not-present",
            reason: gateReason,
          };
        const status = await Summarizer.availability(
          availabilityOptions as SummarizerCreateCoreOptions,
        );
        return {
          available: status !== "unavailable",
          status,
          reason: buildUnavailableReason(status),
        };
      }
      case "proofreader": {
        if (!isPresent("Proofreader") || !Proofreader?.availability)
          return {
            available: false,
            status: "api-not-present",
            reason: gateReason,
          };
        const status = await Proofreader.availability(
          availabilityOptions as ProofreaderCreateCoreOptions,
        );
        return {
          available: status !== "unavailable",
          status,
          reason: buildUnavailableReason(status),
        };
      }
      case "language-detector": {
        if (!isPresent("LanguageDetector") || !LanguageDetector?.availability)
          return {
            available: false,
            status: "api-not-present",
            reason: gateReason,
          };
        const status = await LanguageDetector.availability(
          availabilityOptions as LanguageDetectorCreateCoreOptions,
        );
        return {
          available: status !== "unavailable",
          status,
          reason: buildUnavailableReason(status),
        };
      }
      case "translator": {
        if (!isPresent("Translator") || !Translator?.availability)
          return {
            available: false,
            status: "api-not-present",
            reason: gateReason,
          };
        const opts = availabilityOptions as
          | TranslatorCreateCoreOptions
          | undefined;
        if (!opts?.sourceLanguage || !opts?.targetLanguage) {
          return {
            available: false,
            status: "error",
            reason: gateReason,
            error: new Error(
              "Translator.availability requires sourceLanguage/targetLanguage",
            ),
          };
        }
        const status = await Translator.availability({
          ...opts,
          sourceLanguage:
            opts.sourceLanguage === "auto" ? "en" : opts.sourceLanguage,
          targetLanguage:
            opts.sourceLanguage === "auto" ||
            opts.sourceLanguage === opts.targetLanguage
              ? "hu" // different from source language
              : opts.targetLanguage,
        });
        return {
          available: status !== "unavailable",
          status,
          reason: buildUnavailableReason(status),
        };
      }
      case "prompt": {
        if (!isPresent("LanguageModel") || !LanguageModel?.availability)
          return {
            available: false,
            status: "api-not-present",
            reason: gateReason,
          };
        // Note: for multimodal prompting, callers may pass expectedInputs
        // which is not part of LanguageModelCreateCoreOptions.
        const status = await LanguageModel.availability(
          availabilityOptions as LanguageModelCreateCoreOptions,
        );
        return {
          available: status !== "unavailable",
          status,
          reason: buildUnavailableReason(status),
        };
      }
      default:
        return {
          available: false,
          status: "unknown-feature",
          reason: gateReason,
        };
    }
  } catch (error) {
    return {
      available: false,
      status: "error",
      reason: "exception in availability()",
      error: error as Error,
    };
  }
}

/* -----------------------------
 * Capability decision
 * ----------------------------- */

export function isOnDeviceLanguageSupported(
  outputLanguage: AiKitLanguageCode,
): boolean {
  const supported = ["en", "ja", "es"];
  const lang = outputLanguage.toLowerCase();
  return supported.some((s) => lang === s.toLowerCase());
}

export async function decideCapability(
  feature: BuiltInAiFeature,
  availabilityOptions?: AnyCreateCoreOptions,
  modeOverride?: AiModePreference,
): Promise<CapabilityDecision> {
  const config = await readAiKitConfig();
  const mode = modeOverride ? modeOverride : getModePreference(config);

  const backend = await resolveBackend();
  const onDevice = await checkOnDeviceAvailability(
    feature,
    availabilityOptions,
  );

  const onDeviceAvailable = onDevice.available;
  const backendAvailable = backend.available;

  const base: Omit<CapabilityDecision, "source" | "reason"> = {
    feature,
    mode,
    onDeviceAvailable,
    onDeviceStatus: onDevice.status,
    onDeviceReason: onDevice.reason,
    backendAvailable,
    backendTransport: backend.transport,
    backendApiName: backend.apiName,
    backendBaseUrl: backend.baseUrl,
    backendReason: backend.reason,
  };

  if (mode === "local-only") {
    if (onDeviceAvailable) {
      return {
        ...base,
        source: "on-device",
        reason: `local-only, on-device available (${
          onDevice.reason ?? onDevice.status
        })`,
      };
    }
    return {
      ...base,
      source: "none",
      reason: `local-only, but on-device unavailable (${
        onDevice.reason ?? onDevice.status
      })`,
    };
  }

  if (mode === "backend-only") {
    if (backendAvailable) {
      return {
        ...base,
        source: "backend",
        reason: `backend-only, backend available (${backend.reason ?? "n/a"})`,
      };
    }
    return {
      ...base,
      source: "none",
      reason: `backend-only, but backend unavailable (${backend.reason ?? "n/a"})`,
    };
  }

  // backend-fallback
  if (onDeviceAvailable) {
    return {
      ...base,
      source: "on-device",
      reason: `backend-fallback, using on-device (${
        onDevice.reason ?? onDevice.status
      })`,
    };
  }
  if (backendAvailable) {
    return {
      ...base,
      source: "backend",
      reason: `backend-fallback, using backend (${
        backend.reason ?? "n/a"
      }; on-device: ${onDevice.reason ?? onDevice.status})`,
    };
  }

  return {
    ...base,
    source: "none",
    reason: `No on-device AI or backend available (on-device: ${
      onDevice.reason ?? onDevice.status
    }; backend: ${backend.reason ?? "n/a"})`,
  };
}
