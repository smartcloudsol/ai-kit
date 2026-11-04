import { getGateyPlugin } from "@smart-cloud/gatey-core";
import type {
  AiKitBackendCapability,
  BackendCompatibility,
  BackendManifest,
  BackendTransport,
  BuiltInAiFeature,
  ContextKind,
} from "./types";

const MANIFEST_PATH = "/meta/capabilities";
const CACHE_TTL_MS = 5 * 60 * 1000;

// Capabilities that existed before the backend exposed a manifest. Keep this
// list deliberately explicit: newly introduced features must be advertised by
// the backend and must not become available merely because manifest discovery
// failed.
const LEGACY_CAPABILITIES = new Set<AiKitBackendCapability>([
  "ai.prompt.admin",
  "ai.summarizer.admin",
  "ai.writer.admin",
  "ai.rewriter.admin",
  "ai.translator.admin",
  "ai.proofreader.admin",
  "ai.language-detector.admin",
  "ai.prompt.frontend",
  "ai.summarizer.frontend",
  "ai.writer.frontend",
  "ai.rewriter.frontend",
  "ai.translator.frontend",
  "ai.proofreader.frontend",
  "ai.language-detector.frontend",
  "knowledge.admin",
  "knowledge.query.frontend",
]);

const cache = new Map<
  string,
  { expiresAt: number; value: BackendCompatibility }
>();

const gateyTargets = new WeakMap<BackendCompatibility, GateyTarget>();

export function capabilityForFeature(
  context: ContextKind,
  feature: BuiltInAiFeature,
): AiKitBackendCapability {
  return `ai.${feature}.${context}` as AiKitBackendCapability;
}

export function capabilityForCustomPath(
  context: ContextKind,
  path: string,
): AiKitBackendCapability | undefined {
  if (path === "/conversation-profile") {
    return context === "admin" ? "ai.conversation-profile.admin" : undefined;
  }
  if (path === "/cost-policy") {
    return context === "admin" ? "ai.cost-policy.admin" : undefined;
  }
  if (path.startsWith("/kb/")) {
    return context === "admin" ? "knowledge.admin" : "knowledge.query.frontend";
  }
  return undefined;
}

function isManifest(value: unknown): value is BackendManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const transports = record.transports;
  const validTransports = transports === undefined || (
    !!transports && typeof transports === "object" && !Array.isArray(transports) &&
    ((transports as Record<string, unknown>).chatWebSocketUrl === undefined ||
      typeof (transports as Record<string, unknown>).chatWebSocketUrl === "string") &&
    ((transports as Record<string, unknown>).chatStreamTicketUrl === undefined ||
      typeof (transports as Record<string, unknown>).chatStreamTicketUrl === "string")
  );
  return (
    record.schemaVersion === 1 &&
    record.product === "smartcloud-ai-kit-backend" &&
    typeof record.release === "string" &&
    !!record.capabilities &&
    typeof record.capabilities === "object" &&
    !Array.isArray(record.capabilities) &&
    validTransports
  );
}

type CompatibilityInput = {
  transport: BackendTransport;
  apiName?: string;
  baseUrl?: string;
};

type GateyTarget = {
  cognito: NonNullable<ReturnType<typeof getGateyPlugin>>["cognito"];
  apiName: string;
  endpoint: string;
};

function normalizedEndpoint(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Backend endpoint is unavailable");
  const endpoint = value.replace(/\/+$/, "");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Backend endpoint is invalid");
  return endpoint;
}

function currentGateyEndpoint(target: GateyTarget): string {
  if (getGateyPlugin()?.cognito !== target.cognito) throw new Error("Gatey backend changed during capability discovery");
  return normalizedEndpoint(target.cognito.getAmplifyConfig().API?.REST?.[target.apiName]?.endpoint);
}

function requireCurrentGateyTarget(target: GateyTarget): void {
  if (currentGateyEndpoint(target) !== target.endpoint) throw new Error("Gatey backend changed during capability discovery");
}

/** Internal dispatch fence; older caller-created decisions without discovery metadata remain compatible. */
export function assertBackendCompatibilityTargetCurrent(compatibility: BackendCompatibility | undefined): void {
  const target = compatibility && gateyTargets.get(compatibility);
  if (target) requireCurrentGateyTarget(target);
}

async function requestManifest(input: CompatibilityInput, gateyTarget?: GateyTarget): Promise<unknown> {
  if (input.transport === "fetch") {
    const response = await fetch(
      `${normalizedEndpoint(input.baseUrl)}${MANIFEST_PATH}`,
      { method: "GET", credentials: "omit" },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  if (!gateyTarget) throw new Error("Gatey backend identity is unavailable");
  requireCurrentGateyTarget(gateyTarget);
  const get = gateyTarget.cognito.get;
  if (!get) throw new Error("Gatey GET transport is unavailable");
  const call = get({
    apiName: gateyTarget.apiName,
    path: MANIFEST_PATH,
    options: { retryStrategy: { strategy: "no-retry" } },
  }) as unknown as {
    response: Promise<{ body: { json: () => Promise<unknown> } }>;
  };
  const manifest = await (await call.response).body.json();
  requireCurrentGateyTarget(gateyTarget);
  return manifest;
}

export async function resolveBackendCompatibility(input: CompatibilityInput): Promise<BackendCompatibility> {
  let key: string | undefined;
  let gateyTarget: GateyTarget | undefined;
  let value: BackendCompatibility;
  try {
    if (input.transport === "fetch") {
      // apiName is unrelated metadata for direct fetch transports.
      key = `fetch:${normalizedEndpoint(input.baseUrl)}`;
    } else {
      if (!input.apiName) throw new Error("backendApiName is missing");
      const cognito = getGateyPlugin()?.cognito;
      if (!cognito) throw new Error("Gatey backend identity is unavailable");
      await cognito.store;
      gateyTarget = { cognito, apiName: input.apiName, endpoint: "" };
      gateyTarget.endpoint = currentGateyEndpoint(gateyTarget);
      key = JSON.stringify(["gatey", input.apiName, gateyTarget.endpoint]);
    }
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      // Never repin an existing result: an earlier decision may still hold it.
      try {
        assertBackendCompatibilityTargetCurrent(cached.value);
        return cached.value;
      } catch {
        cache.delete(key);
      }
    }

    const manifest = await requestManifest(input, gateyTarget);
    value = isManifest(manifest)
      ? { status: "verified", manifest }
      : {
          status: "legacy",
          reason: "Backend returned an unsupported capability manifest.",
        };
  } catch (error) {
    value = {
      status: "legacy",
      reason:
        error instanceof Error
          ? `Capability manifest is unavailable: ${error.message}`
          : "Capability manifest is unavailable.",
    };
    // A response racing a retarget must not seed a cache entry for either target.
    if (gateyTarget) {
      try { requireCurrentGateyTarget(gateyTarget); } catch { key = undefined; }
    }
  }

  if (key) {
    if (gateyTarget) gateyTargets.set(value, gateyTarget);
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  }
  return value;
}

export function supportsBackendCapability(
  compatibility: BackendCompatibility,
  capability: AiKitBackendCapability,
  minimumVersion = 1,
): boolean {
  if (compatibility.status === "legacy") {
    return minimumVersion <= 1 && LEGACY_CAPABILITIES.has(capability);
  }
  const version = compatibility.manifest?.capabilities[capability];
  return typeof version === "number" && Number.isInteger(version) && version >= minimumVersion;
}
