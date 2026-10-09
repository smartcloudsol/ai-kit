import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
const requirePublisher = createRequire(new URL("../../../static-publisher/exporter/package.json", import.meta.url));
const { build } = requirePublisher("esbuild");
const { chromium } = requirePublisher("playwright");
const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
try {
  for (const [plugin, key] of [["ai-kit", "answers"], ["flow", "forms-workflows"]]) {
    await test(`${plugin} overview entry registers without native admin and uses the shared Cognito session`, async () => {
      const dir = fileURLToPath(new URL(`../../../${plugin}/admin/`, import.meta.url));
      const result = await build({
        absWorkingDir: dir, entryPoints: ["src/backend-readiness-entry.ts"], bundle: true, write: false,
        plugins: [{ name: "runtime-fixture", setup(builder) {
          builder.onResolve({ filter: /^@smart-cloud\// }, ({ path }) => ({ path, namespace: "runtime-fixture" }));
          builder.onLoad({ filter: /.*/, namespace: "runtime-fixture" }, ({ path }) => ({ loader: "js", contents:
            path.endsWith("gatey-core")
              ? `export const getGateyPlugin=()=>window.fixture.gatey;`
              : path.endsWith("wpsuite-core")
              ? `export const getWpSuite=()=>({siteSettings:{accountId:'account',siteId:'site'}});`
              : `export const getStore=async()=>({});export const getStoreSelect=()=>({getConfig:()=>({backendApiName:'customer-api'})});`,
          }));
        } }],
      });
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setContent("<!doctype html><body><h1>Overview</h1></body>");
      await page.evaluate((plugin) => {
        window.fixture = { calls: 0, sessionCalls: 0, authenticated: true, gatey: { cognito: {
          store: Promise.resolve({}),
          getAmplifyConfig: () => ({ API: { REST: { "customer-api": { endpoint: "https://backend.test" } } } }),
          get: () => { window.fixture.calls++; return { cancel() {}, response: Promise.resolve({ body: { json: async () => plugin === "ai-kit" ? { configured: false, document: {} } : { items: [] } } }) }; },
        } } };
        window.WpSuiteAmplify = { fetchAuthSession: async () => {
          window.fixture.sessionCalls++;
          return window.fixture.authenticated ? { tokens: { idToken: {}, accessToken: {} } } : {};
        } };
      }, plugin);
      await page.addScriptTag({ content: result.outputFiles[0].text });
      assert.equal(await page.evaluate(async (key) => window.smartcloudWpSuiteBackendChecks[key](new AbortController().signal), key), "ready");
      assert.deepEqual(await page.evaluate(() => [window.fixture.calls, window.fixture.sessionCalls]), [1, 1]);
      await page.evaluate(() => { window.fixture.authenticated = false; });
      assert.equal(await page.evaluate(async (key) => window.smartcloudWpSuiteBackendChecks[key](new AbortController().signal), key), "sign_in");
      assert.deepEqual(await page.evaluate(() => [window.fixture.calls, window.fixture.sessionCalls]), [1, 2]);
      assert.deepEqual(errors, []);
      await page.close();
    });
  }
} finally { await browser.close(); }
