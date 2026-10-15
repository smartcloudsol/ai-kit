export type AiKitAdminPage =
  | "general"
  | "api-settings"
  | "chatbot-settings"
  | "conversation-profile"
  | "kb-admin";

const AI_KIT_ADMIN_PAGES: ReadonlySet<string> = new Set([
  "general",
  "api-settings",
  "chatbot-settings",
  "conversation-profile",
  "kb-admin",
]);

/** A fixed deep link opens Tools without interpreting arbitrary accordion names. */
export function initialConversationProfileSections(search: string): string[] {
  return new URLSearchParams(search).get("profile-section") === "tools"
    ? ["tools"]
    : ["identity", "context", "response", "actions"];
}

export function resolveAiKitAdminPage(search: string): AiKitAdminPage {
  const query = new URLSearchParams(search);
  const requestedPage = query.get("section") ?? query.get("aikit-page");

  return requestedPage && AI_KIT_ADMIN_PAGES.has(requestedPage)
    ? (requestedPage as AiKitAdminPage)
    : "general";
}

/** Keep a deep link while configuration loads; terminal denial falls back safely. */
export function guardAiKitAdminPage(page: AiKitAdminPage, ready: boolean, proAvailable: boolean): AiKitAdminPage {
  return ready && !proAvailable && page !== "general" ? "general" : page;
}
