import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await fs.readFile(new URL("../src/visitor-action.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parseVisitorActionProposal, parseConfirmedVisitorAction, parseVisitorActionResult } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const handle = "a".repeat(43);
const proposal = (patch = {}) => ({ schemaVersion: 1, handle, title: "Review requested action", description: "Confirm the reviewed selection before continuing.", submitLabel: "Confirm action", summary: [{ label: "Selection", value: "Verified source item" }], fields: [{ id: "country", label: "Country", kind: "country-code", required: true, maxLength: 2 }], expiresAt: 1_900_000_000, ...patch });
const confirmed = (patch = {}) => ({ handle, confirmed: true, values: { country: "HU" }, ...patch });
const result = (patch = {}) => ({ schemaVersion: 1, handle, status: "completed", title: "Action result", summary: [{ label: "Status", value: "Verified by the backend" }], ...patch });

test("visitor action parsers return independent plain snapshots without a provider-specific contract", () => {
  const original = proposal();
  const parsed = parseVisitorActionProposal(original);
  assert.deepEqual(parsed, original);
  assert.notEqual(parsed, original);
  parsed.fields[0].label = "Local edit";
  parsed.summary[0].value = "Local summary";
  assert.equal(original.fields[0].label, "Country");
  assert.equal(original.summary[0].value, "Verified source item");
  for (const status of ["completed", "pending", "failed"]) assert.deepEqual(parseVisitorActionResult(result({ status })), result({ status }));
  assert.deepEqual(parseConfirmedVisitorAction(confirmed()), confirmed());
});

test("visitor consent is an exact affirmative flag, not model text or navigation", () => {
  for (const value of [false, "true", 1, null, undefined]) assert.equal(parseConfirmedVisitorAction(confirmed({ confirmed: value })), undefined);
  for (const extra of ["query", "endpoint", "tool", "action", "order", "checkoutUrl", "confirmationMessage"]) {
    assert.equal(parseConfirmedVisitorAction(confirmed({ [extra]: "not-approved" })), undefined);
    assert.equal(parseVisitorActionProposal(proposal({ [extra]: "not-approved" })), undefined);
  }
});

test("only explicit server-authored summary messages opt into localization", () => {
  for (const valueKind of ["source", "message"]) {
    const summary = [{ label: "Status", value: "Server supplied text", valueKind }];
    assert.deepEqual(parseVisitorActionProposal(proposal({ summary }))?.summary, summary);
    assert.deepEqual(parseVisitorActionResult(result({ summary }))?.summary, summary);
  }
  assert.equal(Object.hasOwn(parseVisitorActionResult(result()).summary[0], "valueKind"), false, "absent kind stays a source fact by default");
  for (const valueKind of ["html", "translate", ["message"], 1, null]) {
    const summary = [{ label: "Status", value: "Source text", valueKind }];
    assert.equal(parseVisitorActionProposal(proposal({ summary })), undefined);
    assert.equal(parseVisitorActionResult(result({ summary })), undefined);
  }
});

test("only a pending known action can advertise a bounded manual retry label", () => {
  const pending = result({ status: "pending", retryLabel: "Check the pending result" });
  assert.deepEqual(parseVisitorActionResult(pending), pending);
  for (const status of ["completed", "failed"]) assert.equal(parseVisitorActionResult(result({ status, retryLabel: "Retry" })), undefined);
  for (const retryLabel of ["", "x".repeat(241), "Retry\nnow", ["Retry"], null]) assert.equal(parseVisitorActionResult(result({ status: "pending", retryLabel })), undefined);
  assert.deepEqual(parseConfirmedVisitorAction(confirmed({ values: {} })), confirmed({ values: {} }), "same-handle retry can carry no new visitor inputs");
  assert.equal(Object.hasOwn(parseVisitorActionResult(result({ status: "pending" })), "retryLabel"), false, "uncertain results do not gain a retry action");
});

test("opaque handles reject URLs, credentials, coercion and incorrect lengths", () => {
  for (const value of ["", "a".repeat(42), "a".repeat(44), handle + "\n", [handle], 123, null, "https://example.test/action"]) {
    assert.equal(parseVisitorActionProposal(proposal({ handle: value })), undefined);
    assert.equal(parseConfirmedVisitorAction(confirmed({ handle: value })), undefined);
    assert.equal(parseVisitorActionResult(result({ handle: value })), undefined);
  }
});

test("future schemas, invalid enums and coerced numbers are rejected", () => {
  for (const schemaVersion of [0, 3, "1", "2", null]) {
    assert.equal(parseVisitorActionProposal(proposal({ schemaVersion })), undefined);
    assert.equal(parseVisitorActionResult(result({ schemaVersion })), undefined);
  }
  for (const expiresAt of [0, -1, 1.5, "1900000000", Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) assert.equal(parseVisitorActionProposal(proposal({ expiresAt })), undefined);
  for (const status of ["success", ["completed"], 1, null]) assert.equal(parseVisitorActionResult(result({ status })), undefined);
  for (const kind of ["password", ["text"], "html", 1]) assert.equal(parseVisitorActionProposal(proposal({ fields: [{ ...proposal().fields[0], kind }] })), undefined);
});

test("version 2 preserves bounded compact details and independent country choices", () => {
  const original = proposal({ schemaVersion: 2, details: "Additional consent information", fields: [{ ...proposal().fields[0], countryCodes: ["HU", "AT"] }] });
  const parsed = parseVisitorActionProposal(original);
  assert.deepEqual(parsed, original);
  parsed.fields[0].countryCodes.push("DE");
  assert.deepEqual(original.fields[0].countryCodes, ["HU", "AT"]);
  const originalResult = result({ schemaVersion: 2, statusLabel: "Shipping rates checked", details: [{ label: "Timing", value: "Not guaranteed", valueKind: "message" }] });
  const parsedResult = parseVisitorActionResult(originalResult);
  assert.deepEqual(parsedResult, originalResult);
  parsedResult.details[0].value = "Changed";
  assert.equal(originalResult.details[0].value, "Not guaranteed");
});

test("version 1 rejects every version 2-only field, even explicitly undefined", () => {
  for (const details of [undefined, "Disclosure"]) assert.equal(parseVisitorActionProposal(proposal({ details })), undefined);
  assert.equal(parseVisitorActionProposal(proposal({ fields: [{ ...proposal().fields[0], countryCodes: undefined }] })), undefined);
  for (const patch of [{ statusLabel: undefined }, { statusLabel: "Done" }, { details: undefined }, { details: [] }]) assert.equal(parseVisitorActionResult(result(patch)), undefined);
});

test("version 2 rejects malformed country lists and details without executing accessors", () => {
  for (const countryCodes of [[], ["hu"], ["HUN"], ["HU", "HU"], ["HU\n"], Array(1), Object.assign(["HU"], { extra: true }), Array(301).fill("HU"), "HU", null]) {
    assert.equal(parseVisitorActionProposal(proposal({ schemaVersion: 2, fields: [{ ...proposal().fields[0], countryCodes }] })), undefined);
  }
  assert.equal(parseVisitorActionProposal(proposal({ schemaVersion: 2, fields: [{ ...proposal().fields[0], kind: "text", countryCodes: ["HU"] }] })), undefined);
  let called = false;
  const countryCodes = ["HU"];
  Object.defineProperty(countryCodes, "0", { enumerable: true, get() { called = true; return "HU"; } });
  assert.equal(parseVisitorActionProposal(proposal({ schemaVersion: 2, fields: [{ ...proposal().fields[0], countryCodes }] })), undefined);
  assert.equal(called, false);
  for (const details of ["", "x".repeat(1001), "line\nbreak", null]) assert.equal(parseVisitorActionProposal(proposal({ schemaVersion: 2, details })), undefined);
  for (const statusLabel of ["", "x".repeat(241), "line\nbreak", null]) assert.equal(parseVisitorActionResult(result({ schemaVersion: 2, statusLabel })), undefined);
  for (const details of [Array(21).fill({ label: "A", value: "B" }), Array(1), [{ label: "A", value: "B", hidden: true }], null]) assert.equal(parseVisitorActionResult(result({ schemaVersion: 2, details })), undefined);
});

test("proposal field identifiers are unique safe keys and field bounds remain finite", () => {
  for (const id of ["constructor", "prototype", "__proto__", "", "Bad-id", "a".repeat(49)]) assert.equal(parseVisitorActionProposal(proposal({ fields: [{ ...proposal().fields[0], id }] })), undefined);
  assert.equal(parseVisitorActionProposal(proposal({ fields: [...proposal().fields, ...proposal().fields] })), undefined);
  for (const maxLength of [0, -1, 257, 1.5, "2", Infinity]) assert.equal(parseVisitorActionProposal(proposal({ fields: [{ ...proposal().fields[0], maxLength }] })), undefined);
  assert.equal(parseVisitorActionProposal(proposal({ fields: Array.from({ length: 9 }, (_, i) => ({ ...proposal().fields[0], id: `field${i}` })) })), undefined);
  assert.equal(parseVisitorActionProposal(proposal({ fields: [{ ...proposal().fields[0], required: "true" }] })), undefined);
  assert.equal(parseVisitorActionProposal(proposal({ fields: [{ ...proposal().fields[0], value: "not-a-field-definition" }] })), undefined);
});

test("summaries and plain text are bounded and reject undeclared executable fields", () => {
  for (const patch of [{ title: "" }, { description: "x".repeat(1001) }, { submitLabel: "x".repeat(241) }, { title: "line\nbreak" }, { summary: [{ label: "Source", value: "ok", html: "<b>unsafe</b>" }] }, { summary: Array.from({ length: 41 }, () => ({ label: "A", value: "B" })) }]) assert.equal(parseVisitorActionProposal(proposal(patch)), undefined);
  assert.equal(parseVisitorActionResult(result({ summary: [{ label: "", value: "value" }] })), undefined);
  assert.equal(parseVisitorActionResult(result({ summary: [{ label: "A", value: "x".repeat(1001) }] })), undefined);
});

test("confirmation values remain bounded strings and reject inherited or reserved inputs", () => {
  for (const values of [[], { country: true }, { country: null }, { country: "x".repeat(257) }, { country: "HU\n" }, { constructor: "bad" }, JSON.parse('{"__proto__":"bad"}')]) assert.equal(parseConfirmedVisitorAction(confirmed({ values })), undefined);
  assert.equal(parseConfirmedVisitorAction(confirmed({ values: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`field${i}`, "value"])) })), undefined);
  const output = parseConfirmedVisitorAction(confirmed({ values: { optional: "" } }));
  assert.deepEqual(output?.values, { optional: "" });
});

test("getters, hidden properties, custom prototypes and sparse arrays fail closed without invocation", () => {
  let called = 0;
  const withGetter = proposal();
  Object.defineProperty(withGetter, "title", { enumerable: true, get: () => { called++; return "Unsafe accessor"; } });
  assert.equal(parseVisitorActionProposal(withGetter), undefined);
  assert.equal(called, 0);
  const hidden = proposal(); Object.defineProperty(hidden, "hidden", { value: "not-wire-data" });
  assert.equal(parseVisitorActionProposal(hidden), undefined);
  assert.equal(parseVisitorActionProposal(Object.assign(Object.create({ inherited: true }), proposal())), undefined);
  assert.equal(parseVisitorActionProposal(proposal({ summary: Array(1) })), undefined);
  assert.equal(parseVisitorActionProposal(proposal({ fields: Object.assign([], { extra: true }) })), undefined);
  const toJSON = proposal({ toJSON() { called++; return proposal(); } });
  assert.equal(parseVisitorActionProposal(toJSON), undefined);
  assert.equal(called, 0);
  const proxy = Proxy.revocable({}, {}); proxy.revoke();
  for (const parse of [parseVisitorActionProposal, parseConfirmedVisitorAction, parseVisitorActionResult]) assert.equal(parse(proxy.proxy), undefined);
});

test("visitor action negotiation and confirmations are optional on HTTP and new stream turns only", async () => {
  const read = file => fs.readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
  const [index, types, stream, backend, features] = await Promise.all(["index.ts", "types.ts", "chat-stream-types.ts", "protected/backend.ts", "protected/features.ts"].map(read));
  assert.match(index, /export \* from "\.\/visitor-action"/);
  assert.match(types, /visitorActions\?: import\("\.\/visitor-action"\)\.VisitorActionProposal\[\]/);
  assert.match(types, /visitorActionResult\?: import\("\.\/visitor-action"\)\.VisitorActionResult/);
  for (const name of ["PromptArgs", "ChatMessageArgs"]) {
    const section = types.slice(types.indexOf(`export interface ${name} {`));
    assert.match(section, /visitorActionVersion\?: 1 \| 2;/);
    assert.match(section, /visitorAction\?: import\("\.\/visitor-action"\)\.ConfirmedVisitorAction/);
  }
  const start = stream.match(/type: "turn\.start";([\s\S]*?)\}\s*\|/)[1];
  assert.match(start, /visitorActionVersion\?: 1 \| 2;/);
  assert.match(start, /visitorAction\?: import\("\.\/visitor-action"\)\.ConfirmedVisitorAction/);
  const resume = stream.match(/type: "turn\.resume";([\s\S]*?)\};/)[1];
  assert.match(resume, /visitorActionVersion\?: 1 \| 2;/);
  assert.doesNotMatch(resume, /visitorAction\?:/);
  const allowlist = backend.match(/prompt:\s*\[([\s\S]*?)\],\s*writer:/)[1];
  assert.match(allowlist, /"visitorActionVersion"/);
  assert.match(allowlist, /"visitorAction"/);
  assert.equal((features.match(/visitorActionVersion: args\.visitorActionVersion/g) ?? []).length, 2);
  assert.equal((features.match(/visitorAction: args\.visitorAction/g) ?? []).length, 2);
});

test("actual HTTP request builders forward only explicit confirmation and the allowlist preserves it", async () => {
  const features = await fs.readFile(new URL("../src/protected/features.ts", import.meta.url), "utf8");
  const backend = await fs.readFile(new URL("../src/protected/backend.ts", import.meta.url), "utf8");
  const extract = (text, functionNames, variableNames = []) => {
    const parsed = ts.createSourceFile("source.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    return parsed.statements.filter(node =>
      (ts.isFunctionDeclaration(node) && functionNames.includes(node.name?.text)) ||
      (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => variableNames.includes(d.name.getText(parsed)))),
    ).map(node => node.getText(parsed)).join("\n");
  };
  const text = extract(features, ["buildPromptBackendRequest", "buildChatMessageBackendRequest"]) +
    extract(backend, ["isPlainObject", "sanitizeBackendRequestBody"], ["BACKEND_REQUEST_ALLOWLIST"]);
  const executable = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const helpers = new Function("readMaybeKb", "preparePromptImagesForBackend", "prepareAudioForBackend", `${executable}\nreturn { buildPromptBackendRequest, buildChatMessageBackendRequest, sanitizeBackendRequestBody };`)(() => ({}), async () => undefined, async () => undefined);
  const visitorAction = confirmed();
  for (const version of [1, 2]) {
  const args = { message: "", messages: [{ role: "user", content: "" }], visitorActionVersion: version, visitorAction };
  for (const build of [helpers.buildPromptBackendRequest, helpers.buildChatMessageBackendRequest]) {
    const request = await build(args, "frontend", {});
    assert.equal(request.visitorActionVersion, version);
    assert.deepEqual(request.visitorAction, visitorAction);
    const sanitized = helpers.sanitizeBackendRequestBody("prompt", { ...request, arbitraryGraphql: "not-approved", endpoint: "https://example.test" });
    assert.deepEqual(sanitized.visitorAction, visitorAction);
    assert.equal(Object.hasOwn(sanitized, "arbitraryGraphql"), false);
    assert.equal(Object.hasOwn(sanitized, "endpoint"), false);
    const legacy = await build({ ...args, visitorActionVersion: undefined, visitorAction: undefined }, "frontend", {});
    assert.equal(legacy.visitorAction, undefined, "ordinary requests never synthesize consent");
  }
  }
  assert.deepEqual(visitorAction, confirmed(), "request construction cannot alter the approved visitor inputs");
});
