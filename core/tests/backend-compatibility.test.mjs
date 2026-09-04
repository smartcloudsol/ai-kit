import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadCompatibility() {
  const sourceUrl = new URL("../src/backend-compatibility.ts", import.meta.url);
  let source = await fs.readFile(sourceUrl, "utf8");
  source = source.replace(
    'import { getGateyPlugin } from "@smart-cloud/gatey-core";',
    "const getGateyPlugin = () => undefined;",
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
