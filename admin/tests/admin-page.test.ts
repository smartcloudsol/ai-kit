import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveAiKitAdminPage } from "../src/admin-page.ts";

test("opens the Knowledge Base page requested by an admin notice", () => {
  assert.equal(
    resolveAiKitAdminPage("?page=smartcloud-ai-kit&aikit-page=kb-admin"),
    "kb-admin",
  );
});

test("falls back to general for missing or unknown page values", () => {
  assert.equal(resolveAiKitAdminPage("?page=smartcloud-ai-kit"), "general");
  assert.equal(resolveAiKitAdminPage("?aikit-page=unexpected"), "general");
});
