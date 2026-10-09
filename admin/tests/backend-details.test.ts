import assert from "node:assert/strict";
import test from "node:test";
import { createBackendDetails } from "../src/backend-details.ts";

test("Gatey configuration displays the resolved named API endpoint", async () => {
  const names: string[] = [];
  const details = createBackendDetails({
    config: async () => ({ mode: "backend-fallback", backendTransport: "gatey", backendApiName: "answersBackend", backendBaseUrl: "https://unused.example.test" }),
    gateyEndpoint: async apiName => { names.push(apiName); return "https://answers.example.test/prod"; },
  });
  assert.deepEqual(await details(new AbortController().signal), {
    mode: "backend-fallback", transport: "gatey", apiName: "answersBackend", endpoint: "https://answers.example.test/prod",
  });
  assert.deepEqual(names, ["answersBackend"]);
});

test("Custom URL configuration uses the authored endpoint without resolving Gatey", async () => {
  const details = createBackendDetails({
    config: async () => ({ mode: "backend-only", backendTransport: "fetch", backendApiName: "unusedApi", backendBaseUrl: "https://custom.example.test/api" }),
    gateyEndpoint: async () => { assert.fail("Custom URL must not resolve a Gatey API"); },
  });
  assert.deepEqual(await details(new AbortController().signal), {
    mode: "backend-only", transport: "fetch", apiName: undefined, endpoint: "https://custom.example.test/api",
  });
});

test("Local-only mode remains visible when no backend is configured", async () => {
  const details = createBackendDetails({
    config: async () => ({ mode: "local-only" }),
    gateyEndpoint: async () => { assert.fail("Local-only without an API must not resolve Gatey"); },
  });
  assert.deepEqual(await details(new AbortController().signal), {
    mode: "local-only", transport: undefined, apiName: undefined, endpoint: undefined,
  });
});

test("Legacy configuration infers the endpoint source while preserving the execution mode", async () => {
  const gatey = createBackendDetails({
    config: async () => ({ mode: "backend-only", backendApiName: "legacyApi" }),
    gateyEndpoint: async apiName => { assert.equal(apiName, "legacyApi"); return "https://legacy.example.test"; },
  });
  assert.deepEqual(await gatey(new AbortController().signal), {
    mode: "backend-only", transport: "gatey", apiName: "legacyApi", endpoint: "https://legacy.example.test",
  });
  const custom = createBackendDetails({
    config: async () => ({ mode: "backend-fallback", backendBaseUrl: "https://legacy-custom.example.test" }),
    gateyEndpoint: async () => { assert.fail("A legacy custom URL must not resolve Gatey"); },
  });
  assert.deepEqual(await custom(new AbortController().signal), {
    mode: "backend-fallback", transport: "fetch", apiName: undefined, endpoint: "https://legacy-custom.example.test",
  });
});

test("Unavailable Gatey endpoint retains the configured mode and API name", async () => {
  const details = createBackendDetails({
    config: async () => ({ mode: "backend-only", backendTransport: "gatey", backendApiName: "answersBackend" }),
    gateyEndpoint: async () => { throw new Error("Gatey settings unavailable"); },
  });
  assert.deepEqual(await details(new AbortController().signal), {
    mode: "backend-only", transport: "gatey", apiName: "answersBackend", endpoint: undefined,
  });
});

test("Absent configuration returns empty details without resolving an API", async () => {
  const details = createBackendDetails({
    config: async () => null,
    gateyEndpoint: async () => { assert.fail("Absent configuration must not resolve Gatey"); },
  });
  assert.deepEqual(await details(new AbortController().signal), {});
});

test("A pre-aborted request never loads plugin configuration", async () => {
  const controller = new AbortController();
  controller.abort();
  const details = createBackendDetails({
    config: async () => { assert.fail("Aborted request must not load configuration"); },
    gateyEndpoint: async () => { assert.fail("Aborted request must not resolve Gatey"); },
  });
  await assert.rejects(details(controller.signal), { name: "AbortError" });
});

test("Abort during configuration loading prevents endpoint resolution", async () => {
  const controller = new AbortController();
  const details = createBackendDetails({
    config: async () => { controller.abort(); return { mode: "backend-only", backendTransport: "gatey", backendApiName: "answersBackend" }; },
    gateyEndpoint: async () => { assert.fail("Late-aborted configuration must not resolve Gatey"); },
  });
  await assert.rejects(details(controller.signal), { name: "AbortError" });
});

test("Abort during endpoint lookup suppresses stale details, including a failed lookup", async () => {
  for (const failLookup of [false, true]) {
    const controller = new AbortController();
    const details = createBackendDetails({
      config: async () => ({ mode: "backend-only", backendTransport: "gatey", backendApiName: "answersBackend" }),
      gateyEndpoint: async () => {
        controller.abort();
        if (failLookup) throw new Error("Lookup failed after cancellation");
        return "https://answers.example.test";
      },
    });
    await assert.rejects(details(controller.signal), { name: "AbortError" });
  }
});
