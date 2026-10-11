import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await fs.readFile(new URL("../src/answer-presentation.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const contract = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const provenance = { kind: "external_mcp", sourceId: "catalog:search_catalog", evidenceId: "kb-aabbcc", checkedAt: "2026-10-11T12:00:00.000Z" };
function template(overrides = {}) {
  return { id: "product", revision: 1, layout: "cards", source: { kind: "external_mcp", serverId: "catalog", toolName: "search_catalog" }, itemsPointer: "/products",
    bindings: { id: "/id", title: "/title", description: "/description" },
    image: { pointer: "/media/0/url", allowedUrlPrefixes: ["https://images.example.org/"] },
    attributes: [{ id: "amount", label: "Amount", pointer: "/price", type: "number" }, { id: "availability", label: "Availability", pointer: "/available", type: "boolean" }],
    links: [{ id: "details", label: "Details", pointer: "/publicUrl", allowedUrlPrefixes: ["https://example.org/products/"] }], maxItems: 3, ...overrides };
}
function envelope(entity) { return { schemaVersion: 1, groups: [{ templateId: "product", templateRevision: 1, layout: "cards", entities: [entity] }] }; }
function entity() { return contract.materializeAnswerEntity(template(), { id: "42", title: "Source title", price: 0, available: false, publicUrl: "https://example.org/products/42?variant=1", media: [{ url: "https://images.example.org/42.webp" }] }, provenance, "entity-42"); }

test("one declarative contract accepts own content, REST and MCP, but no code/action", () => {
  for (const source of [{ kind: "structured_content", postTypes: ["service"] }, { kind: "external_rest", toolId: "catalog" }, { kind: "external_mcp", serverId: "catalog", toolName: "search_catalog" }]) {
    const policy = { schemaVersion: 1, enabled: true, templates: [template({ source })] };
    assert.deepEqual(contract.parseAnswerPresentationPolicy(policy), policy);
  }
  for (const value of [template({ javascript: "alert(1)" }), template({ source: { kind: "external_rest", toolId: "catalog", write: true } }), template({ maxItems: 7 }), template({ revision: 0 }), template({ layout: "html" }), template({ image: { pointer: "/image", allowedUrlPrefixes: [] } })]) {
    assert.throws(() => contract.parseAnswerPresentationPolicy({ schemaVersion: 1, enabled: true, templates: [value] }));
  }
  assert.throws(() => contract.parseAnswerPresentationPolicy({ schemaVersion: 1, enabled: true, templates: [template(), template()] }));
});
test("pointer reads nested arrays or REST literal projected keys; never prototype paths", () => {
  assert.equal(contract.readAnswerPointer({ media: [{ url: "photo" }] }, "/media/0/url"), "photo");
  assert.equal(contract.readAnswerPointer({ "/product/title": "Projected title" }, "/product/title"), "Projected title");
  assert.equal(contract.readAnswerPointer({ "a/b": { "c~d": 42 } }, "/a~1b/c~0d"), 42);
  assert.equal(contract.readAnswerPointer({ title: "Root" }, "").title, "Root");
  assert.equal(contract.readAnswerPointer(Object.create({ private: "inherited" }), "/private"), undefined);
  for (const p of ["/constructor/prototype", "/__proto__/value", "/prototype", "/a~2b", "$.title"]) assert.throws(() => contract.readAnswerPointer({}, p));
});
test("materialization preserves typed zero and false, omits absent/invalid facts", () => {
  const value = entity();
  assert.deepEqual(value.attributes.map((a) => a.value), [0, false]);
  assert.equal(value.links[0].url, "https://example.org/products/42?variant=1");
  assert.equal(value.image.alt, "Source title");
  assert.equal(value.description, undefined);
  assert.deepEqual(contract.parseAnswerPresentation(envelope(value)), envelope(value));
  const empty = contract.materializeAnswerEntity(template(), { id: "42", title: "Source title", price: "0", available: "false", publicUrl: "https://other.example.org/products/42", media: [{ url: "https://tracking.example.org/42" }] }, provenance, "entity-42");
  assert.deepEqual(empty.attributes, []); assert.deepEqual(empty.links, []); assert.equal(empty.image, undefined);
  assert.equal(contract.materializeAnswerEntity(template(), { id: "42" }, provenance, "entity-42"), undefined);
});
test("URL allowlists enforce host/path boundaries and deny unsafe schemes/credentials/IPs", () => {
  for (const url of ["javascript:alert(1)", "data:image/png,abc", "https://name:secret@example.org/", "http://example.org", "https://127.0.0.1", "https://169.254.169.254", "https://[::1]", "https://service.local", "https://service.internal", "https://example.org:8443", "https://example.org\\@evil.org", "https://example.org/%20\n"]) assert.equal(contract.isAnswerHttpsUrl(url), false, url);
  for (const url of ["https://example.org.evil.org/products/42", "https://evil.org/products/42", "https://example.org/products-bad/42"]) assert.equal(contract.isAnswerUrlAllowed(url, ["https://example.org/products/"]), false);
  assert.equal(contract.isAnswerUrlAllowed("https://example.org/products/42?a=1", ["https://example.org/products/"]), true);
  assert.equal(contract.isAnswerUrlAllowed("https://example.org/anything", ["https://example.org/"]), true);
});
test("untrusted/future/history envelopes fail closed independently of text", () => {
  const good = envelope(entity());
  for (const bad of [{ ...good, schemaVersion: 2 }, { ...good, html: "<div>" }, { ...good, groups: Array(3).fill(good.groups[0]) }, envelope({ ...entity(), links: [{ id: "x", label: "x", url: "javascript:alert(1)" }] }), envelope({ ...entity(), provenance: { ...provenance, checkedAt: "yesterday" } }), envelope({ ...entity(), attributes: [{ id: "x", label: "x", type: "number", value: "1" }] }), envelope({ ...entity(), description: "x".repeat(801) })]) assert.equal(contract.parseAnswerPresentation(bad), undefined);
  const duplicate = { ...good, groups: [{ ...good.groups[0], entities: [entity(), entity()] }] };
  assert.equal(contract.parseAnswerPresentation(duplicate), undefined);
  assert.equal(contract.parseAnswerPresentation(undefined), undefined);
});
test("public wire contract carries optional presentation on full and final/snapshot streams", async () => {
  const types = await fs.readFile(new URL("../src/types.ts", import.meta.url), "utf8");
  const stream = await fs.readFile(new URL("../src/chat-stream-types.ts", import.meta.url), "utf8");
  assert.match(types, /presentation\?: import\("\.\/answer-presentation"\)\.AnswerPresentation/);
  assert.equal(stream.match(/presentation\?: PromptResult\["presentation"\]/g).length, 2);
  assert.match(stream, /presentationVersion\?: 1/);
  assert.match(stream, /"presentation\.upsert"/);
});
