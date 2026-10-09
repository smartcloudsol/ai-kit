import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const { build, transform } = require("esbuild");

async function clientBundle(premium: boolean) {
  const resolved: string[] = [];
  const entry = new URL("../src/answers/backend-clients.ts", import.meta.url);
  // Fold the build flag before module resolution, as the WordPress webpack build does.
  const source = await transform(await readFile(entry, "utf8"), {
    loader: "ts",
    minifySyntax: true,
    define: { "process.env.WPSUITE_PREMIUM": String(premium) },
  });
  const result = await build({
    stdin: { contents: source.code, resolveDir: fileURLToPath(new URL(".", entry)) },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    define: { "process.env.WPSUITE_PREMIUM": String(premium) },
    plugins: [{
      name: "private-sources-unavailable",
      setup(builder: { onResolve: (options: object, callback: (args: { path: string }) => unknown) => void; onLoad: (options: object, callback: (args: { path: string }) => unknown) => void }) {
        builder.onResolve({ filter: /paid-features/ }, ({ path }) => {
          resolved.push(path);
          if (!premium) throw new Error("Private source is unavailable in a public checkout.");
          return { path, namespace: "premium-fixture" };
        });
        builder.onLoad({ filter: /.*/, namespace: "premium-fixture" }, ({ path }) => ({
          contents: path.includes("conversation-profile")
            ? `export async function getConversationProfile(){ calls.push('profile-read'); return {configured:true}; }
               export async function updateConversationProfile(profile,revision){ calls.push(['profile-write',profile,revision]); return {configured:true}; }`
            : `export async function fetchKnowledgeSyncStatus(){ calls.push('knowledge-read'); return {policies:{post:{enabled:true}},availablePostTypes:[]}; }
               export async function updateKnowledgeSyncPolicy(type,policy){ calls.push(['knowledge-write',type,policy]); return {policy}; }`,
          loader: "js",
        }));
      },
    }],
  });
  const module = { exports: {} as Record<string, (...args: unknown[]) => Promise<unknown>> };
  const calls: unknown[] = [];
  vm.runInNewContext(result.outputFiles[0].text, {
    module,
    exports: module.exports,
    calls,
    fetch: () => assert.fail("The free client must not make network requests."),
  });
  return { clients: module.exports, calls, resolved };
}

test("free Answers bundles without any private source and cannot issue premium requests", async () => {
  const { clients, resolved } = await clientBundle(false);
  assert.deepEqual(resolved, []);
  assert.equal(await clients.getConversationProfile(), null);
  assert.equal(JSON.stringify(await clients.fetchKnowledgeSyncStatus()), '{"policies":{},"availablePostTypes":[]}');
  await assert.rejects(clients.updateConversationProfile({}, "r1"), /premium plugin build/);
  await assert.rejects(clients.updateKnowledgeSyncPolicy("post", {}), /premium plugin build/);
});

test("premium Answers delegates all reads and writes to the premium clients", async () => {
  const { clients, calls, resolved } = await clientBundle(true);
  await clients.getConversationProfile();
  await clients.fetchKnowledgeSyncStatus();
  const profile = { identity: { role: "Guide" } };
  const policy = { enabled: true };
  await clients.updateConversationProfile(profile, "r1");
  await clients.updateKnowledgeSyncPolicy("post", policy);
  assert.deepEqual(structuredClone(calls), ["profile-read", "knowledge-read", ["profile-write", profile, "r1"], ["knowledge-write", "post", policy]]);
  assert.deepEqual(resolved.sort(), ["../paid-features/conversation-profile/backend-client", "../paid-features/kb-admin/api-client"]);
});
