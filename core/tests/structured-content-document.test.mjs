import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const code = ts.transpileModule(await fs.readFile(new URL("../src/structured-content.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const contract = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const leaf = (type, description = "Approved authored value") => ({ type, description });
const schema = () => ({ type: "object", description: "Approved grouped entries", properties: {
  label: leaf("string"), entries: { type: "array", description: "Ordered entries", items: {
    type: "object", description: "Entry values", properties: {
      label: leaf("string"), amount: leaf("number"), currency: leaf("string"), variants: {
        type: "array", description: "Approved variants", items: leaf("string"),
      },
    },
  } },
} });
const projection = () => ({ schemaVersion: 2, enabled: true,
  fieldSchema: { grouped_entries: schema() }, fields: { grouped_entries: {
    label: "Consultations", entries: [{ label: "Initial", amount: 0, currency: "HUF", variants: [] }],
  } },
});

test("nested document v2 preserves native maps, ordered lists and zero values", () => {
  const input = projection();
  const before = structuredClone(input);
  const output = contract.parseStructuredContentProjection(input);
  assert.deepEqual(output, before);
  assert.deepEqual(input, before);
  assert.notEqual(output.fields.grouped_entries, input.fields.grouped_entries);
  assert.throws(() => contract.parseStructuredContentProjection({ ...input, schemaVersion: 1 }));
});

test("policies approve a complete declared nested schema, without inventing source fields", () => {
  const field = { sourceMetaKey: "registered_grouped_entries", targetKey: "grouped_entries", ...schema() };
  assert.deepEqual(contract.parseStructuredContentPolicy({ enabled: true, fields: [field] }), { enabled: true, fields: [field] });
  assert.deepEqual(contract.parseStructuredContentFieldSchema(schema()), schema());
  assert.throws(() => contract.parseStructuredContentPolicy({ enabled: true, fields: [{ ...field, sourceMetaKey: undefined }] }));
  assert.throws(() => contract.parseStructuredContentPolicy({ enabled: true, fields: [{ ...field, sourceMetaKey: undefined, sourcePostField: "excerpt" }] }));
  assert.throws(() => contract.parseStructuredContentFieldSchema({ ...schema(), additionalProperties: true }));
});

test("legacy scalar projections retain v1 and its smaller byte budget", () => {
  const input = { schemaVersion: 1, enabled: true, fields: { labels: ["a"] }, fieldSchema: { labels: leaf("string-list") } };
  assert.deepEqual(contract.parseStructuredContentProjection(input), input);
  const fields = { a: "a".repeat(4096), b: "b".repeat(4096) };
  const fieldSchema = { a: leaf("string"), b: leaf("string") };
  assert.throws(() => contract.parseStructuredContentProjection({ ...input, fields, fieldSchema }));
  assert.equal(contract.parseStructuredContentProjection({ ...input, schemaVersion: 2, fields, fieldSchema }).schemaVersion, 2);
  assert.deepEqual(contract.parseStructuredContentProjection({ schemaVersion: 2, enabled: false, fields: {}, fieldSchema: {} }), { schemaVersion: 2, enabled: false, fields: {}, fieldSchema: {} });
});

test("undeclared fields, unsafe numbers and null do not cross the contract", () => {
  for (const mutate of [
    value => { value.fields.grouped_entries.extra = "Not approved"; },
    value => { value.fields.grouped_entries.entries[0].amount = "100"; },
    value => { value.fields.grouped_entries.entries[0].amount = Number.MAX_SAFE_INTEGER + 1; },
    value => { value.fields.grouped_entries = null; },
    value => { value.enabled = false; },
    value => { value.fields.grouped_entries.entries = Array(65).fill({}); },
    value => { value.fieldSchema.grouped_entries.properties = Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`field_${index}`, leaf("string")])); },
  ]) { const value = projection(); mutate(value); assert.throws(() => contract.parseStructuredContentProjection(value)); }
});

test("data hooks and sparse/custom collections are rejected without executing hooks", () => {
  let called = false;
  const value = projection();
  Object.defineProperty(value.fields.grouped_entries, "label", { enumerable: true, get() { called = true; return "secret"; } });
  assert.throws(() => contract.parseStructuredContentProjection(value));
  assert.equal(called, false);
  for (const entries of [Array(1), Object.assign([], { extra: true }), Object.assign([], { toJSON() { called = true; return []; } })]) {
    const candidate = projection(); candidate.fields.grouped_entries.entries = entries;
    assert.throws(() => contract.parseStructuredContentProjection(candidate));
  }
  assert.equal(called, false);
});

test("deep and cyclic schemas fail within bounded traversal", () => {
  let nested = leaf("string");
  for (let depth = 0; depth < 9; depth++) nested = { type: "array", description: "Nested sequence", items: nested };
  assert.throws(() => contract.parseStructuredContentFieldSchema(nested));
  const cyclic = { type: "array", description: "Cycle" }; cyclic.items = cyclic;
  assert.throws(() => contract.parseStructuredContentFieldSchema(cyclic));
});

test("document v3 preserves explicit text formats and exact original data", () => {
  for (const contentFormat of ["plain-text", "html", "markdown"]) {
    const value = { schemaVersion: 3, enabled: true, fields: { text: "<p>É &amp; **source**</p>", list: ["<b>One</b>"] },
      fieldSchema: { text: { ...leaf("string"), contentFormat }, list: { ...leaf("string-list"), contentFormat } } };
    const before = structuredClone(value);
    assert.deepEqual(contract.parseStructuredContentProjection(value), before);
    assert.deepEqual(value, before);
    for (const schemaVersion of [1, 2]) assert.throws(() => contract.parseStructuredContentProjection({ ...value, schemaVersion }));
    assert.deepEqual(contract.parseStructuredContentPolicy({ enabled: true, fields: [{ sourceMetaKey: "text", targetKey: "text", ...value.fieldSchema.text }] }).fields[0].contentFormat, contentFormat);
  }
  const nested = projection(); nested.schemaVersion = 3;
  nested.fieldSchema.grouped_entries.properties.label.contentFormat = "html";
  assert.deepEqual(contract.parseStructuredContentProjection(nested), nested);
});

test("text formats are explicit bounded annotations, never guesses or coercions", () => {
  for (const contentFormat of [null, undefined, false, "HTML", "rich-text", {}, ["html"]]) {
    assert.throws(() => contract.parseStructuredContentFieldSchema({ ...leaf("string"), contentFormat }));
  }
  for (const type of ["url", "number", "boolean", "object", "array"]) {
    assert.throws(() => contract.parseStructuredContentFieldSchema({ ...leaf(type), contentFormat: "html" }));
  }
  assert.deepEqual(contract.parseStructuredContentProjection({ schemaVersion: 1, enabled: true,
    fields: { text: "<p>Literal source</p>" }, fieldSchema: { text: leaf("string") } }).fieldSchema.text, leaf("string"));
  for (const sourcePostField of ["excerpt", "featuredImageAlt"]) {
    for (const contentFormat of ["html", "markdown"]) assert.throws(() => contract.parseStructuredContentPolicy({ enabled: true,
      fields: [{ sourcePostField, targetKey: "native", ...leaf("string"), contentFormat }] }));
  }
});
