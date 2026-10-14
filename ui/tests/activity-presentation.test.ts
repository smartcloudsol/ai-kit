import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import { publicToolActivityDetails, publicToolActivityLabel, safePublicActivityParams } from "../src/ai-chatbot/activityPresentation.ts";
import type { ChatActivity } from "../src/ai-chatbot/chatStream.ts";
import { enDict } from "../src/i18n/en.ts";
import { huDict } from "../src/i18n/hu.ts";

const activity: ChatActivity = { activityId: "external-1", kind: "other", labelKey: "chat.activity.other", status: "running", labelParams: { operation: "catalog_search", providerLabel: "Demo Commerce", toolName: "search_catalog" } };
const operations = { catalog_search: "Product search", product_details: "Product details", catalog_lookup: "Catalog lookup", external_read: "External tool", web_read: "Web sources",
  structured_read: "Retrieving structured data", structured_schema: "Reading data fields", presentation: "Preparing response display", tool_workflow: "Retrieving related information" };

test("all semantic operation labels resolve in English and Hungarian for every lifecycle state", () => {
  for (const dictionary of [enDict, huDict]) {
    const translate = (key: string) => dictionary[key] ?? key;
    for (const [operation, key] of Object.entries(operations)) {
      assert.ok(dictionary[key]?.trim(), `${key} must be localized`);
      const sample = { ...activity, labelParams: { operation } };
      assert.equal(publicToolActivityLabel(sample, translate), `${translate(key)}…`);
      assert.equal(publicToolActivityLabel({ ...sample, status: "completed" }, translate), `${translate(key)} · ${translate("Done.")}`);
      assert.equal(publicToolActivityLabel({ ...sample, status: "failed" }, translate), `${translate(key)} · ${translate("Action failed")}`);
      assert.equal(publicToolActivityLabel(sample, translate, true), `${translate(key)} · ${translate("Action interrupted")}`);
    }
  }
});

test("legacy tools and unknown operations use the established caller fallback", () => {
  for (const params of [undefined, {}, { operation: "constructor" }, { operation: "unknown" }, { operation: "catalog_search\n" }, { operation: "<script>catalog_search</script>" }]) {
    const sample = { ...activity, labelParams: params };
    assert.equal(publicToolActivityLabel(sample, (key) => key), null);
    assert.equal(publicToolActivityDetails(sample), null);
  }
});

test("activity parameters retain only bounded public metadata and never raw descriptions or arguments", () => {
  assert.deepEqual(safePublicActivityParams({ operation: "external_read", toolName: "catalog.lookup:v2", providerLabel: "Équipe & Co (EU)", purpose: "operator instructions", input: { secret: "private" }, arguments: "raw" }), { operation: "external_read", toolName: "catalog.lookup:v2", providerLabel: "Équipe & Co (EU)" });
  for (const unsafe of ["<b>unsafe</b>", "secret\ntext", "unsafe\u202e", "x".repeat(65), ""] ) {
    assert.deepEqual(safePublicActivityParams({ operation: "external_read", toolName: unsafe, providerLabel: unsafe }), { operation: "external_read" });
  }
  assert.deepEqual(safePublicActivityParams({ operation: "external_read", toolName: "x".repeat(64), providerLabel: "É".repeat(64) }), { operation: "external_read", toolName: "x".repeat(64), providerLabel: "É".repeat(64) });
  for (const invalid of [null, [], "catalog_search", { operation: 1 }]) assert.equal(safePublicActivityParams(invalid), undefined);
  assert.equal(publicToolActivityDetails(activity), "Demo Commerce");
  for (const status of ["running", "completed", "failed"] as const) {
    const technicalOnly = { ...activity, status, labelParams: { operation: "structured_read", toolName: "get_content_record" } };
    assert.equal(publicToolActivityDetails(technicalOnly), null);
    assert.ok(!publicToolActivityLabel(technicalOnly, (key) => key)?.includes("get_content_record"));
  }
});

// Exercise the actual private formatting functions without mounting unrelated
// chatbot attachments, transports and shell hooks. No copied implementation.
async function chatbotFormatting() {
  const source = await readFile(new URL("../src/ai-chatbot/AiChatbot.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const activityLabel = (");
  const end = source.indexOf("// New: small helpers for storage", start);
  assert.ok(start >= 0 && end > start, "AiChatbot activity formatting boundaries must exist");
  const { transform } = createRequire(import.meta.url)("esbuild");
  const transformed = await transform(source.slice(start, end).replace("const activityLabel", "export const activityLabel").replace("const activityDetails", "export const activityDetails"), { loader: "ts", format: "cjs" });
  const module = { exports: {} as { activityLabel: (value: ChatActivity, i18n: { get: (key: string) => string }, settled?: boolean) => string; activityDetails: (value: ChatActivity, i18n: { get: (key: string) => string }) => string | null } };
  vm.runInNewContext(transformed.code, { module, exports: module.exports, publicToolActivityLabel, publicToolActivityDetails, isToolActivity: (value: ChatActivity) => !["thinking", "generating_response", "checking_sources"].includes(value.kind) });
  return module.exports;
}

test("actual chatbot formatters distinguish page reading, preserve old tool labels and keep details brief", async () => {
  const { activityLabel, activityDetails } = await chatbotFormatting();
  for (const dictionary of [enDict, huDict]) {
    const i18n = { get: (key: string) => dictionary[key] ?? key };
    const legacy = { ...activity, labelParams: undefined };
    assert.equal(activityLabel(legacy, i18n), i18n.get("Checking…"));
    assert.equal(activityLabel({ ...legacy, status: "completed" }, i18n), i18n.get("Action completed"));
    assert.equal(activityLabel({ ...legacy, kind: "web_read" }, i18n), i18n.get("Reading pages…"));
    assert.equal(activityLabel({ ...legacy, kind: "web_read", status: "completed" }, i18n), i18n.get("Pages read"));
    assert.equal(activityLabel({ ...legacy, kind: "web_search", status: "completed" }, i18n), i18n.get("Web search completed"));
    assert.equal(activityLabel(activity, i18n), `${i18n.get("Product search")}…`);
    assert.equal(activityDetails({ ...legacy, safeDomains: ["one.example.com", "two.example.com", "three.example.com"] }, i18n), "one.example.com, two.example.com");
    assert.equal(activityDetails({ ...activity, resultCount: 3, safeDomains: ["one.example.com"] }, i18n), `Demo Commerce · ${i18n.get("Results: {count}").replace("{count}", "3")}`);
    assert.equal(activityDetails({ ...legacy, safeDomains: [] }, i18n), null);
  }
});

test("knowledge searches show distinct documents without relabeling legacy chunk counts", async () => {
  const { activityDetails } = await chatbotFormatting();
  for (const dictionary of [enDict, huDict]) {
    const i18n = { get: (key: string) => dictionary[key] ?? key };
    assert.ok(dictionary["Documents found: {count}"]?.includes("{count}"));
    const knowledgeSearch: ChatActivity = {
      activityId: "kb", kind: "knowledge_search", labelKey: "chat.activity.knowledge_search",
      status: "completed", query: "WordPress search", resultCount: 8,
    };
    const query = i18n.get("Search query: {query}").replace("{query}", "WordPress search");
    assert.equal(activityDetails({ ...knowledgeSearch, documentCount: 2 }, i18n),
      `${query} · ${i18n.get("Documents found: {count}").replace("{count}", "2")}`);
    assert.equal(activityDetails({ ...knowledgeSearch, documentCount: 0, resultCount: 0 }, i18n),
      `${query} · ${i18n.get("Documents found: {count}").replace("{count}", "0")}`);
    assert.equal(activityDetails(knowledgeSearch, i18n), query);
    assert.equal(activityDetails({ ...knowledgeSearch, query: undefined }, i18n), null);
    assert.equal(activityDetails({ ...knowledgeSearch, kind: "web_search", documentCount: 2 }, i18n),
      i18n.get("Results: {count}").replace("{count}", "8"));
  }
});
