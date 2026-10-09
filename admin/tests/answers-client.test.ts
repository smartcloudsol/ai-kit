import assert from "node:assert/strict";
import test from "node:test";
import { safeCitationUrl, validateSettings } from "../src/answers/client.ts";
test("Answers settings require a bounded typed presentation and independent backend/plan state", () => {
  const fixture = {
    connected: true,
    revision: "r1",
    plan: "",
    backend_configured: false,
    can_edit_pages: false,
    preview_url: "https://example.test/site-home/",
    values: { enableChatbot: true, title: "", greeting: "", placeholder: "" },
  };
  assert.deepEqual(validateSettings(fixture), fixture);
  for (const invalid of [
    null,
    {},
    { ...fixture, values: { ...fixture.values, enableChatbot: 1 } },
    { ...fixture, connected: "yes" },
    { ...fixture, revision: null },
  ])
    assert.throws(() => validateSettings(invalid));
});
test("Answer citations permit web links and reject script/data/relative URLs", () => {
  assert.equal(
    safeCitationUrl("https://example.test/source"),
    "https://example.test/source",
  );
  assert.equal(
    safeCitationUrl("http://example.test/source"),
    "http://example.test/source",
  );
  for (const invalid of [
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "//example.test",
    "/relative",
    "",
  ])
    assert.equal(safeCitationUrl(invalid), undefined);
});

test("completion client uses only same-site API and rejects malformed or unconfirmed completion", async () => {
  const { requestOnboarding } = await import("../src/answers/client.ts");
  const global = globalThis as typeof globalThis & { window?: unknown };
  const previousWindow = global.window;
  const previousFetch = globalThis.fetch;
  Object.defineProperty(global, "window", { configurable: true, value: { location: { href: "https://example.test/admin", origin: "https://example.test" } } });
  const calls: { url: string; init?: RequestInit }[] = [];
  let payload: unknown = { completed: false };
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(payload), { status: 200 }); };
  try {
    assert.deepEqual(await requestOnboarding("/api", "fixture"), { completed: false });
    assert.equal(calls[0].url, "https://example.test/api/answers-onboarding");
    assert.equal(calls[0].init?.credentials, "same-origin");
    assert.equal((calls[0].init?.headers as Record<string, string>)["X-WP-Nonce"], "fixture");
    await assert.rejects(requestOnboarding("https://other.test/api", "fixture"), /this WordPress/);
    assert.equal(calls.length, 1);
    for (const invalid of [null, {}, { completed: "true" }, { completed: false }]) {
      payload = invalid;
      await assert.rejects(requestOnboarding("/api", "fixture", { completed: true }), /could not be saved/);
    }
    payload = { completed: true };
    assert.deepEqual(await requestOnboarding("/api", "fixture", { completed: true }), { completed: true });
    assert.equal(calls.at(-1)?.init?.body, '{"completed":true}');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete global.window;
    else Object.defineProperty(global, "window", { configurable: true, value: previousWindow });
  }
});
