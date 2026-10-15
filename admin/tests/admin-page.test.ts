import assert from "node:assert/strict";
import { test } from "node:test";

import { guardAiKitAdminPage, initialConversationProfileSections, resolveAiKitAdminPage } from "../src/admin-page.ts";

test("opens the Knowledge Base page requested by an admin notice", () => {
  assert.equal(
    resolveAiKitAdminPage("?page=smartcloud-ai-kit&aikit-page=kb-admin"),
    "kb-admin",
  );
});

test("opens the server-owned Conversation Profile page", () => {
  assert.equal(
    resolveAiKitAdminPage(
      "?page=smartcloud-ai-kit&aikit-page=conversation-profile",
    ),
    "conversation-profile",
  );
});

test("falls back to general for missing or unknown page values", () => {
  assert.equal(resolveAiKitAdminPage("?page=smartcloud-ai-kit"), "general");
  assert.equal(resolveAiKitAdminPage("?aikit-page=unexpected"), "general");
});

test("section deep links cover every tab and take precedence over the old parameter", () => {
  for (const page of ["general", "api-settings", "chatbot-settings", "conversation-profile", "kb-admin"]) {
    assert.equal(resolveAiKitAdminPage(`?section=${page}`), page);
    assert.equal(resolveAiKitAdminPage(`?aikit-page=${page}`), page);
  }
  assert.equal(resolveAiKitAdminPage("?section=chatbot-settings&aikit-page=kb-admin"), "chatbot-settings");
  assert.equal(resolveAiKitAdminPage("?section=unknown&aikit-page=kb-admin"), "general");
  assert.equal(resolveAiKitAdminPage("?section[]=kb-admin"), "general");
});


test("hydration preserves Pro deep links until configuration resolves", () => {
  for (const page of ["api-settings", "chatbot-settings", "conversation-profile", "kb-admin"] as const) {
    assert.equal(guardAiKitAdminPage(page, false, false), page);
    assert.equal(guardAiKitAdminPage(page, true, true), page);
    assert.equal(guardAiKitAdminPage(page, true, false), "general");
  }
  assert.equal(guardAiKitAdminPage("general", true, false), "general");
});

test("only an exact tools section deep link changes the initial conversation profile panels", () => {
  assert.deepEqual(initialConversationProfileSections("?section=conversation-profile&profile-section=tools"), ["tools"]);
  for (const search of ["", "?profile-section=Tools", "?profile-section[]=tools", "?profile-section=tool", "?profile-section=identity"]) {
    assert.deepEqual(initialConversationProfileSections(search), ["identity", "context", "response", "actions"]);
  }
});
