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

export function resolveAiKitAdminPage(search: string): AiKitAdminPage {
  const requestedPage = new URLSearchParams(search).get("aikit-page");

  return requestedPage && AI_KIT_ADMIN_PAGES.has(requestedPage)
    ? (requestedPage as AiKitAdminPage)
    : "general";
}
