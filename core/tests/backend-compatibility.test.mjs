import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { randomUUID } from "node:crypto";

async function loadCompatibility(runtime = {}) {
  const fixtureKey = `__aiCapabilityFixture_${randomUUID()}`;
  globalThis[fixtureKey] = runtime;
  test.after(() => { delete globalThis[fixtureKey]; });
  const sourceUrl = new URL("../src/backend-compatibility.ts", import.meta.url);
  let source = await fs.readFile(sourceUrl, "utf8");
  source = source.replace(
    'import { getGateyPlugin } from "@smart-cloud/gatey-core";',
    `const getGateyPlugin = () => globalThis[${JSON.stringify(fixtureKey)}].gatey;
     const fetch = (...args) => (globalThis[${JSON.stringify(fixtureKey)}].fetch ?? globalThis.fetch)(...args);`,
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

test("legacy fallback permits only capabilities that predate discovery", async () => {
  const compatibility = await loadCompatibility();
  const legacy = { status: "legacy", reason: "manifest unavailable" };

  assert.equal(
    compatibility.supportsBackendCapability(
      legacy,
      "ai.prompt.admin",
    ),
    true,
  );
  assert.equal(
    compatibility.supportsBackendCapability(
      legacy,
      "knowledge.automation",
    ),
    false,
  );
  assert.equal(
    compatibility.supportsBackendCapability(
      legacy,
      "ai.chat.stream.frontend",
    ),
    false,
  );
});

test("verified manifests enforce advertised capability versions", async () => {
  const compatibility = await loadCompatibility();
  const verified = {
    status: "verified",
    manifest: {
      schemaVersion: 1,
      product: "smartcloud-ai-kit-backend",
      release: "1.0.75",
      capabilities: { "knowledge.automation": 1 },
    },
  };

  assert.equal(
    compatibility.supportsBackendCapability(
      verified,
      "knowledge.automation",
    ),
    true,
  );
  assert.equal(
    compatibility.supportsBackendCapability(
      verified,
      "knowledge.automation",
      2,
    ),
    false,
  );
});

test("streaming chat is available only when a verified backend advertises it", async () => {
  const compatibility = await loadCompatibility();
  const verified = {
    status: "verified",
    manifest: {
      schemaVersion: 1,
      product: "smartcloud-ai-kit-backend",
      release: "1.0.102",
      capabilities: { "ai.chat.stream.frontend": 1 },
    },
  };

  assert.equal(
    compatibility.supportsBackendCapability(
      verified,
      "ai.chat.stream.frontend",
    ),
    true,
  );
});

test("conversation profile admin calls require their dedicated capability", async () => {
  const compatibility = await loadCompatibility();

  assert.equal(
    compatibility.capabilityForCustomPath(
      "admin",
      "/conversation-profile",
    ),
    "ai.conversation-profile.admin",
  );
  assert.equal(
    compatibility.capabilityForCustomPath(
      "frontend",
      "/conversation-profile",
    ),
    undefined,
  );
});

test("cost policy admin calls require their dedicated capability", async () => {
  const compatibility = await loadCompatibility();

  assert.equal(
    compatibility.capabilityForCustomPath("admin", "/cost-policy"),
    "ai.cost-policy.admin",
  );
  assert.equal(
    compatibility.capabilityForCustomPath("frontend", "/cost-policy"),
    undefined,
  );
  assert.equal(
    compatibility.supportsBackendCapability(
      { status: "legacy", reason: "manifest unavailable" },
      "ai.cost-policy.admin",
    ),
    false,
  );
});

test("taxonomy paths require their own advertised capability", async () => {
  const compatibility = await loadCompatibility();
  assert.equal(compatibility.supportsBackendCapability({ status: "legacy" }, "knowledge.taxonomy-paths"), false);
  for (const [capabilities, expected] of [
    [{ "knowledge.automation": 6 }, false],
    [{ "knowledge.taxonomy-paths": 0 }, false],
    [{ "knowledge.taxonomy-paths": "1" }, false],
    [{ "knowledge.taxonomy-paths": 1.5 }, false],
    [{ "knowledge.taxonomy-paths": Number.POSITIVE_INFINITY }, false],
    [{ "knowledge.taxonomy-paths": 1 }, true],
  ]) {
    assert.equal(compatibility.supportsBackendCapability({ status: "verified", manifest: { capabilities } }, "knowledge.taxonomy-paths"), expected);
  }
});


const supportedManifest = { schemaVersion: 1, product: "smartcloud-ai-kit-backend", release: "v1.1.8", capabilities: { "knowledge.structured-content": 1 } };
const unsupportedManifest = { ...supportedManifest, release: "v1.0.1", capabilities: {} };
const supportsStructured = (api, value) => api.supportsBackendCapability(value, "knowledge.structured-content");
function gateyFixture() {
  const state = { endpoint: "https://ai-prod.example.test/prod", calls: [] };
  const runtime = { gatey: { cognito: {
    store: Promise.resolve(),
    getAmplifyConfig: () => ({ API: { REST: { api: { endpoint: state.endpoint } } } }),
    get: (request) => {
      state.calls.push({ endpoint: state.endpoint, request });
      return { response: Promise.resolve({ body: { json: async () => state.endpoint.includes("ai-prod") ? supportedManifest : unsupportedManifest } }) };
    },
  } } };
  return { state, runtime, input: { transport: "gatey", apiName: "api" } };
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("Gatey TTL cache follows the actual REST endpoint when the same API name is retargeted", async () => {
  const { state, runtime, input } = gateyFixture();
  const api = await loadCompatibility(runtime);
  assert.equal(supportsStructured(api, await api.resolveBackendCompatibility(input)), true);
  assert.equal(supportsStructured(api, await api.resolveBackendCompatibility(input)), true);
  assert.equal(state.calls.length, 1, "unchanged endpoint uses its own cache");
  state.endpoint = "https://ai-dev.example.test/dev";
  assert.equal(supportsStructured(api, await api.resolveBackendCompatibility(input)), false);
  assert.equal(state.calls.length, 2, "same API name must discover the new endpoint during TTL");
  state.endpoint = "https://ai-prod.example.test/prod";
  assert.equal(supportsStructured(api, await api.resolveBackendCompatibility(input)), true);
  assert.equal(state.calls.length, 2, "returning to an identical endpoint may reuse only its own manifest");
});

test("a Gatey endpoint change while response JSON is pending rejects the old manifest and does not cache it", async () => {
  const { state, runtime, input } = gateyFixture();
  const started = deferred();
  const body = deferred();
  runtime.gatey.cognito.get = () => {
    state.calls.push(state.endpoint);
    started.resolve();
    return { response: Promise.resolve({ body: { json: () => body.promise } }) };
  };
  const api = await loadCompatibility(runtime);
  const pending = api.resolveBackendCompatibility(input);
  await started.promise;
  state.endpoint = "https://ai-dev.example.test/dev";
  body.resolve(supportedManifest);
  const raced = await pending;
  assert.equal(raced.status, "legacy");
  assert.equal(supportsStructured(api, raced), false);
  assert.match(raced.reason, /changed during capability discovery/);
  runtime.gatey.cognito.get = () => {
    state.calls.push(state.endpoint);
    return { response: Promise.resolve({ body: { json: async () => unsupportedManifest } }) };
  };
  assert.equal(supportsStructured(api, await api.resolveBackendCompatibility(input)), false);
  state.endpoint = "https://ai-prod.example.test/prod";
  assert.equal(supportsStructured(api, await api.resolveBackendCompatibility(input)), false);
  assert.equal(state.calls.length, 3, "the raced response must not populate either endpoint's cache");
});

test("Gatey cannot trust a supplied base URL when its actual REST endpoint is unknown", async () => {
  const { state, runtime, input } = gateyFixture();
  state.endpoint = undefined;
  const api = await loadCompatibility(runtime);
  const unknown = await api.resolveBackendCompatibility({ ...input, baseUrl: "https://ai-prod.example.test" });
  assert.equal(unknown.status, "legacy");
  assert.equal(supportsStructured(api, unknown), false);
  assert.equal(state.calls.length, 0);
  state.endpoint = "https://ai-prod.example.test/prod";
  assert.equal(supportsStructured(api, await api.resolveBackendCompatibility(input)), true);
  assert.equal(state.calls.length, 1, "missing endpoint failures cannot poison a later valid target");
});

test("capability discovery waits for Gatey initialization and rejects a replaced runtime", async () => {
  const { state, runtime, input } = gateyFixture();
  const ready = deferred();
  runtime.gatey.cognito.store = ready.promise;
  const api = await loadCompatibility(runtime);
  const pending = api.resolveBackendCompatibility(input);
  assert.equal(state.calls.length, 0);
  runtime.gatey = { cognito: { ...runtime.gatey.cognito, store: Promise.resolve() } };
  ready.resolve();
  const result = await pending;
  assert.equal(result.status, "legacy");
  assert.equal(supportsStructured(api, result), false);
  assert.equal(state.calls.length, 0, "replaced runtime must not receive the captured discovery request");
});

test("fetch cache keys use the actual base URL even when both inputs carry the same API name", async () => {
  const calls = [];
  const api = await loadCompatibility({ fetch: async url => {
    calls.push(url);
    return { ok: true, json: async () => url.includes("ai-prod") ? supportedManifest : unsupportedManifest };
  } });
  const input = { transport: "fetch", apiName: "shared-api", baseUrl: "https://ai-prod.example.test/prod///" };
  assert.equal(supportsStructured(api, await api.resolveBackendCompatibility(input)), true);
  assert.equal(supportsStructured(api, await api.resolveBackendCompatibility({ ...input, apiName: "other-label" })), true);
  assert.equal(supportsStructured(api, await api.resolveBackendCompatibility({ ...input, baseUrl: "https://ai-dev.example.test/dev" })), false);
  assert.deepEqual(calls, ["https://ai-prod.example.test/prod/meta/capabilities", "https://ai-dev.example.test/dev/meta/capabilities"]);
});
