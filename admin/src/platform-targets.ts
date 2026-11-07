interface PlatformSettings {
  workspaceApiMode?: unknown;
  platformApiBaseUrl?: unknown;
  platformConfigUrl?: unknown;
}

export const PRODUCTION_PLATFORM_CONFIG = "https://wpsuite.io/static/config/foundation/prod/config.json";
export const DEVELOPMENT_PLATFORM_CONFIG = "https://wpsuite.io/static/config/foundation/dev/config.json";

function endpoint(value: unknown, json: boolean): string {
  if (typeof value !== "string" || !value || /[\s\\?#]/.test(value) || Array.from(value).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) throw new Error("Invalid platform connection");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (json && !url.pathname.endsWith(".json"))) throw new Error("Invalid platform connection");
  return json ? url.href : url.href.replace(/\/+$/, "");
}

/** Select the identity configuration belonging to the active connection. */
export function aiKitPlatformTargets(settings: PlatformSettings | undefined, legacy: { apiBaseUrl: string; configUrl: string }): { apiBaseUrl: string; configUrl: string } {
  const api = settings?.platformApiBaseUrl;
  const config = settings?.platformConfigUrl;
  if (settings?.workspaceApiMode === "workspace") return { apiBaseUrl: endpoint(api, false), configUrl: endpoint(config, true) };
  if (settings?.workspaceApiMode && settings.workspaceApiMode !== "legacy") throw new Error("Unsupported workspace API mode");
  if (api || config) throw new Error("Explicit platform connection requires workspace mode");
  return legacy;
}

/** A Foundation catalog must identify the same API selected by the connection. */
export async function loadAiKitPlatformConfiguration(configUrl: string, apiBaseUrl: string, requireWorkspace: boolean, fetcher: typeof fetch = fetch): Promise<unknown> {
  const response = await fetcher(configUrl);
  if (!response.ok) throw new Error(`Platform configuration request failed (HTTP ${response.status}).`);
  const value: unknown = await response.json();
  if (requireWorkspace) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid platform configuration.");
    const config = value as Record<string, unknown>;
    if (config.workspaceApiMode !== "workspace" || endpoint(config.foundationApiBaseUrl, false) !== endpoint(apiBaseUrl, false)) throw new Error("Platform configuration does not match the selected API.");
  }
  return value;
}
