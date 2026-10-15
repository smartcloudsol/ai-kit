export interface Appearance {
  enableChatbot: boolean;
  title: string;
  greeting: string;
  placeholder: string;
  openButtonPosition?: string;
  brandColor?: string;
}
export interface AnswersSettings {
  connected: boolean;
  revision: string;
  values: Appearance;
  plan: string;
  backend_configured: boolean;
  can_edit_pages: boolean;
  preview_url: string;
  advanced_tools_url?: string;
  runtime_refresh_requested?: boolean;
}

export class SettingsError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function validateSettings(value: unknown): AnswersSettings {
  if (!value || typeof value !== "object")
    throw new Error("Invalid assistant settings response.");
  const data = value as AnswersSettings;
  if (
    typeof data.connected !== "boolean" ||
    typeof data.revision !== "string" ||
    typeof data.plan !== "string" ||
    typeof data.backend_configured !== "boolean" ||
    typeof data.can_edit_pages !== "boolean" ||
    typeof data.preview_url !== "string" ||
    (data.advanced_tools_url !== undefined && typeof data.advanced_tools_url !== "string") ||
    !data.values ||
    typeof data.values.enableChatbot !== "boolean" ||
    [data.values.title, data.values.greeting, data.values.placeholder].some(
      (item) => typeof item !== "string",
    )
  )
    throw new Error("Invalid assistant settings response.");
  return data;
}

export async function requestSettings(
  restUrl: string,
  nonce: string,
  input?: { revision: string; values: Partial<Appearance> },
  signal?: AbortSignal,
): Promise<AnswersSettings> {
  const url = new URL(
    `${restUrl.replace(/\/$/, "")}/answers-settings`,
    window.location.href,
  );
  if (url.origin !== window.location.origin)
    throw new Error("Assistant settings must use this WordPress site's API.");
  const response = await fetch(url, {
    method: input ? "POST" : "GET",
    credentials: "same-origin",
    signal,
    headers: { "X-WP-Nonce": nonce, "Content-Type": "application/json" },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new SettingsError(
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : `Assistant settings request failed (HTTP ${response.status}).`,
      response.status,
    );
  return validateSettings(data);
}

export function safeCitationUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol)
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** WordPress supplies the install-aware URL; never infer wp-admin or leave this origin. */
export function safeAdvancedSettingsUrl(value: string | undefined, currentUrl: string): string | undefined {
  if (!value) return undefined;
  try {
    const target = new URL(value);
    if (!["https:", "http:"].includes(target.protocol) || target.origin !== new URL(currentUrl).origin ||
      target.username || target.password || target.searchParams.get("section") !== "conversation-profile" ||
      target.searchParams.get("profile-section") !== "tools") return undefined;
    return target.href;
  } catch { return undefined; }
}

/** Local completion, deliberately independent of remote appearance/backend settings. */
export async function requestOnboarding(
  restUrl: string,
  nonce: string,
  input?: { completed: true },
): Promise<{ completed: boolean }> {
  const url = new URL(`${restUrl.replace(/\/$/, "")}/answers-onboarding`, window.location.href);
  if (url.origin !== window.location.origin)
    throw new Error("Setup completion must use this WordPress site's API.");
  const response = await fetch(url, {
    method: input ? "POST" : "GET",
    credentials: "same-origin",
    headers: { "X-WP-Nonce": nonce, "Content-Type": "application/json" },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const message = input
    ? "Setup completion could not be saved. Retry finishing setup."
    : "Setup completion could not be loaded. Retry loading setup.";
  if (!response.ok) throw new SettingsError(message, response.status);
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error(message); }
  if (!data || typeof data !== "object" || !("completed" in data) || typeof data.completed !== "boolean" || (input && !data.completed))
    throw new Error(message);
  return { completed: data.completed };
}
