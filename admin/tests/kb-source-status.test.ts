import assert from "node:assert/strict";
import { test } from "node:test";

import { kbSourceStatusPresentation } from "../src/paid-features/kb-admin/kb-source-status.ts";

test("manual and automatic statuses have distinct filter values and labels", () => {
  const statuses = kbSourceStatusPresentation(
    (text) => text,
    "smartcloud-ai-kit",
  );
  assert.deepEqual(Object.keys(statuses), [
    "needs_review",
    "ready_to_publish",
    "published",
    "sync_pending",
    "sync_running",
    "sync_delivered",
    "sync_error",
    "sync_blocked",
    "sync_removed",
  ]);
  assert.equal(statuses.sync_delivered.label, "Delivered");
  assert.notEqual(statuses.sync_delivered.label, statuses.published.label);
  assert.equal(statuses.sync_error.color, "red");
  assert.equal(statuses.sync_blocked.color, "red");
});

test("every status uses the caller's localization and text domain", () => {
  const calls: string[] = [];
  const statuses = kbSourceStatusPresentation((text, domain) => {
    assert.equal(domain, "smartcloud-ai-kit");
    calls.push(text);
    return `localized:${text}`;
  }, "smartcloud-ai-kit");
  assert.equal(calls.length, 9);
  for (const status of Object.values(statuses)) {
    assert.ok(status.label.startsWith("localized:"));
  }
});
