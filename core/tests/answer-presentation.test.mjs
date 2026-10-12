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
  for (const bad of [{ ...good, schemaVersion: 3 }, { ...good, html: "<div>" }, { ...good, groups: Array(3).fill(good.groups[0]) }, envelope({ ...entity(), links: [{ id: "x", label: "x", url: "javascript:alert(1)" }] }), envelope({ ...entity(), provenance: { ...provenance, checkedAt: "yesterday" } }), envelope({ ...entity(), attributes: [{ id: "x", label: "x", type: "number", value: "1" }] }), envelope({ ...entity(), description: "x".repeat(801) })]) assert.equal(contract.parseAnswerPresentation(bad), undefined);
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

function typedTemplate(overrides = {}) {
  return template({ preset: "product-cards", attributes: [
    { id: "price", label: "Source price", type: "money", pointer: "/amount", role: "price", money: { currencyPointer: "/currency", unit: "minor", scalePointer: "/scale" } },
    { id: "available", label: "Source availability", type: "status", pointer: "/available", role: "availability", status: { semantics: "orderability", values: [
      { value: true, code: "orderable", label: "Can be ordered" }, { value: false, code: "unavailable", label: "Cannot be ordered" },
    ], unknownLabel: "Not verified" } },
  ], ...overrides });
}
function typedEntity(input = {}, t = typedTemplate()) {
  return contract.materializeAnswerEntity(t, { id: "42", title: "Verified catalog item", amount: 94995, currency: "HUF", scale: 2, available: true, publicUrl: "https://example.org/products/42", ...input }, provenance, "entity-42");
}
function typedEnvelope(e = typedEntity()) { return { schemaVersion: 2, locale: "hu-HU", groups: [{ templateId: "product", templateRevision: 1, layout: "comparison", preset: "comparison", entities: [e] }] }; }

test("v2 presets and typed mapping remain provider independent and v1 remains strict", () => {
  for (const source of [{ kind: "structured_content", postTypes: ["service"] }, { kind: "external_rest", toolId: "catalog" }, { kind: "external_mcp", serverId: "catalog", toolName: "lookup" }]) {
    for (const preset of ["product-cards", "comparison", "recommendations", "status-cards"]) {
      const policy = { schemaVersion: 2, enabled: true, templates: [typedTemplate({ source, preset, layout: preset === "comparison" ? "comparison" : "cards" })] };
      assert.deepEqual(contract.parseAnswerPresentationPolicy(policy), policy);
      assert.throws(() => contract.parseAnswerPresentationPolicy({ ...policy, schemaVersion: 1 }));
    }
  }
  assert.deepEqual(contract.parseAnswerPresentation(typedEnvelope()), typedEnvelope());
  assert.equal(contract.parseAnswerPresentation({ ...typedEnvelope(), schemaVersion: 1 }), undefined);
  assert.equal(contract.parseAnswerPresentation({ ...typedEnvelope(), schemaVersion: 3 }), undefined);
});

test("typed money preserves declared units, currency and exact decimals through localization", () => {
  const money = typedEntity().attributes[0].value;
  assert.deepEqual(money, { amount: "94995", currency: "HUF", unit: "minor", scale: 2 });
  assert.match(contract.formatAnswerMoney(money, "hu-HU"), /949,95/);
  assert.match(contract.formatAnswerMoney(money, "en-US"), /949\.95/);
  assert.match(contract.formatAnswerMoney({ amount: "94995", currency: "JPY", unit: "minor", scale: 0 }, "en-US"), /94,995/);
  assert.match(contract.formatAnswerMoney({ amount: "0", currency: "USD", unit: "major" }, "en-US"), /0\.00/);
  assert.match(contract.formatAnswerMoney({ amount: "12345678901234567890.123456", currency: "USD", unit: "major" }, "en-US"), /12,345,678,901,234,567,890\.123456/);
  assert.match(contract.formatAnswerMoney({ amount: "-1", currency: "USD", unit: "minor", scale: 2 }, "en-US"), /-\$0\.01/);
  for (const input of [{ currency: undefined }, { currency: "XYZ" }, { amount: "HUF 949.95" }, { amount: true }, { scale: undefined }, { scale: 1.5 }, { scale: 7 }]) assert.equal(typedEntity(input).attributes.some(a => a.type === "money"), false);
  assert.equal(contract.formatAnswerMoney({ amount: "1", currency: "USD", unit: "minor" }, "en-US"), undefined);
});

test("status truthiness never promotes unknown or orderability into stock", () => {
  assert.deepEqual(typedEntity({ available: false }).attributes[1].value, { code: "unavailable", label: "Cannot be ordered", semantics: "orderability" });
  for (const value of [undefined, null, "true", 1, {}]) assert.equal(typedEntity({ available: value }).attributes[1].value.code, "unknown");
  assert.equal(typedEntity().attributes[1].value.code, "orderable");
  const invalid = typedTemplate(); invalid.attributes[1].status.values[0].code = "in-stock";
  assert.throws(() => contract.parseAnswerPresentationPolicy({ schemaVersion: 2, enabled: true, templates: [invalid] }));
  const duplicate = typedTemplate(); duplicate.attributes[1].status.values.push({ value: true, code: "unknown", label: "Other" });
  assert.throws(() => contract.parseAnswerPresentationPolicy({ schemaVersion: 2, enabled: true, templates: [duplicate] }));
});

test("every typed input pointer participates in approved projection boundaries", () => {
  const pointers = contract.answerTemplatePointers(typedTemplate());
  for (const p of ["/amount", "/currency", "/scale", "/available"]) assert.ok(pointers.includes(p));
  for (const money of [{ currencyPointer: "/currency", unit: "minor" }, { currencyPointer: "/currency", unit: "minor", scale: 2, scalePointer: "/scale" }, { currencyPointer: "/currency", unit: "major", scale: 2 }, { currencyPointer: "/constructor/private", unit: "major" }]) {
    const invalid = typedTemplate(); invalid.attributes[0].money = money;
    assert.throws(() => contract.parseAnswerPresentationPolicy({ schemaVersion: 2, enabled: true, templates: [invalid] }));
  }
});

test("negotiated v1 downgrade preserves usable verified values and drops v2-only fields", () => {
  const enhanced = typedEnvelope(typedEntity({ amount: 0, available: false }));
  enhanced.groups[0].entities[0].links[0].appearance = "primary";
  const old = contract.answerPresentationForVersion(enhanced, 1);
  assert.equal(old.schemaVersion, 1); assert.equal(old.groups[0].layout, "cards");
  assert.equal(old.groups[0].preset, undefined); assert.equal(old.locale, undefined);
  assert.equal(old.groups[0].entities[0].attributes[0].type, "string");
  assert.match(old.groups[0].entities[0].attributes[0].value, /0,00/);
  assert.equal(old.groups[0].entities[0].attributes[1].value, "Cannot be ordered");
  assert.equal(old.groups[0].entities[0].attributes[0].role, undefined);
  assert.equal(old.groups[0].entities[0].links[0].appearance, undefined);
  assert.deepEqual(old.groups[0].entities[0].provenance, provenance);
  assert.deepEqual(contract.answerPresentationForVersion(enhanced, 2), enhanced);
  assert.deepEqual(contract.answerPresentationForVersion(envelope(entity()), 2), envelope(entity()));
});
