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
  if (path.startsWith("/kb/")) {
    return context === "admin" ? "knowledge.admin" : "knowledge.query.frontend";
  }
  return undefined;
}

function isManifest(value: unknown): value is BackendManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    record.product === "smartcloud-ai-kit-backend" &&
    typeof record.release === "string" &&
    !!record.capabilities &&
    typeof record.capabilities === "object" &&
    !Array.isArray(record.capabilities)
  );
}

async function requestManifest(input: {
  transport: BackendTransport;
  apiName?: string;
  baseUrl?: string;
}): Promise<unknown> {
  if (input.transport === "fetch") {
    if (!input.baseUrl) throw new Error("backendBaseUrl is missing");
    const response = await fetch(
      `${input.baseUrl.replace(/\/+$/, "")}${MANIFEST_PATH}`,
      { method: "GET", credentials: "omit" },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  if (!input.apiName) throw new Error("backendApiName is missing");
  const get = getGateyPlugin()?.cognito?.get;
  if (!get) throw new Error("Gatey GET transport is unavailable");
  const call = get({
    apiName: input.apiName,
    path: MANIFEST_PATH,
    options: { retryStrategy: { strategy: "no-retry" } },
  }) as unknown as {
    response: Promise<{ body: { json: () => Promise<unknown> } }>;
  };
  return (await call.response).body.json();
}

export async function resolveBackendCompatibility(input: {
  transport: BackendTransport;
  apiName?: string;
  baseUrl?: string;
}): Promise<BackendCompatibility> {
  const key = `${input.transport}:${input.apiName ?? input.baseUrl ?? ""}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let value: BackendCompatibility;
  try {
    const manifest = await requestManifest(input);
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
  }

  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
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
  return typeof version === "number" && version >= minimumVersion;
}
