import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await fs.readFile(new URL("../src/catalog-page.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { parseCatalogPage, CATALOG_PAGE_HANDLE } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const handle = "a".repeat(43);
const page = (overrides = {}) => ({ schemaVersion: 1, pageIndex: 0, pageSize: 4,
  returnedCount: 4, hasMore: true, nextHandle: handle, expiresAt: 1_900_000_000, ...overrides });

test("catalog pages preserve bounded safe metadata without inventing an exact total", () => {
  const input = page();
  const output = parseCatalogPage(input);
  assert.deepEqual(output, input);
  assert.notEqual(output, input);
  assert.equal(Object.hasOwn(output, "totalCount"), false);
  const last = page({ pageIndex: 1, returnedCount: 2, displayedCount: 2, hasMore: false,
    nextHandle: undefined, previousHandle: "b".repeat(43), totalCount: 6 });
  assert.deepEqual(parseCatalogPage(last), last);
  const empty = page({ returnedCount: 0, displayedCount: 0, totalCount: 0, hasMore: false, nextHandle: undefined });
  assert.deepEqual(parseCatalogPage(empty), empty);
});

test("catalog page numeric bounds reject coercion, fractions, unsafe and nonfinite numbers", () => {
  const invalid = {
    schemaVersion: [0, 2, "1", null], pageIndex: [-1, 100, 0.5, "0", NaN, Infinity],
    pageSize: [0, 7, 1.5, "4", null], returnedCount: [-1, 5, 0.5, "4", NaN],
    displayedCount: [-1, 5, 1.5, "4", null], totalCount: [3, -1, 4.5, "4", Number.MAX_SAFE_INTEGER + 1],
    expiresAt: [0, -1, 1.5, "1900000000", Number.MAX_SAFE_INTEGER + 1, Infinity],
    hasMore: [0, 1, "true", null],
  };
  for (const [key, values] of Object.entries(invalid)) {
    for (const value of values) assert.equal(parseCatalogPage(page({ [key]: value })), undefined, `${key}: ${value}`);
  }
  assert.ok(parseCatalogPage(page({ pageIndex: 99, pageSize: 6, returnedCount: 6, totalCount: Number.MAX_SAFE_INTEGER })));
});

test("catalog navigation accepts only opaque fixed-length handles, never URLs or provider cursors", () => {
  assert.equal(CATALOG_PAGE_HANDLE.test(`${"Z".repeat(41)}_-`), true);
  for (const bad of ["", "a".repeat(42), "a".repeat(44), ` ${handle}`, `${handle}\n`,
    "https://provider.example/cursor", { cursor: handle }, 123, null]) {
    for (const key of ["nextHandle", "previousHandle"]) {
      assert.equal(parseCatalogPage(page({ pageIndex: 1, [key]: bad })), undefined, key);
    }
  }
  assert.equal(parseCatalogPage(page({ hasMore: false })), undefined);
  assert.equal(parseCatalogPage(page({ previousHandle: handle })), undefined);
  assert.ok(parseCatalogPage(page({ hasMore: true, nextHandle: undefined })), "a provider may report more before a usable continuation is available");
});

test("persisted or future catalog metadata fails closed on unknown and server-owned fields", () => {
  for (const value of [undefined, null, false, 1, "page", [], [page()]]) assert.equal(parseCatalogPage(value), undefined);
  for (const key of ["cursor", "query", "filters", "serverId", "toolName", "headers", "providerUrl", "html", "futureField"]) {
    assert.equal(parseCatalogPage(page({ [key]: "not-client-owned" })), undefined, key);
  }
});

test("Core and backend catalog-page validation are one byte-identical shared wire contract", async () => {
  const backend = await fs.readFile(new URL("../../../marketplace/deployment-orchestration/lambdas/wpsuite-ai-kit/src/shared/catalog-page.ts", import.meta.url), "utf8");
  assert.equal(source, backend);
});

test("catalog navigation is optional and exported on HTTP and stream new turns only", async () => {
  const read = (file) => fs.readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
  const [index, types, stream, backend, features] = await Promise.all(
    ["index.ts", "types.ts", "chat-stream-types.ts", "protected/backend.ts", "protected/features.ts"].map(read));
  assert.match(index, /export \* from ["']\.\/catalog-page["']/);
  assert.match(types, /catalogPage\?: import\("\.\/catalog-page"\)\.CatalogPage/);
  for (const text of [types, features]) {
    assert.match(text, /catalogPageVersion\?: 1/);
    assert.match(text, /catalogContinuation\?: string/);
  }
  const start = stream.match(/type: "turn\.start";([\s\S]*?)\}\s*\|/)[1];
  assert.match(start, /catalogPageVersion\?: 1/);
  assert.match(start, /catalogContinuation\?: string/);
  const resume = stream.match(/type: "turn\.resume";([\s\S]*?)\};/)[1];
  assert.doesNotMatch(resume, /catalogContinuation|catalogPageVersion/);
  const allowlist = backend.match(/prompt:\s*\[([\s\S]*?)\],\s*writer:/)[1];
  assert.match(allowlist, /"catalogPageVersion"/);
  assert.match(allowlist, /"catalogContinuation"/);
  assert.match(features, /catalogPageVersion: args\.catalogPageVersion/);
  assert.match(features, /catalogContinuation: args\.catalogContinuation/);
});
