import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("prompt requests retain the locale required for single-language retrieval", async () => {
  const source = await fs.readFile(
    new URL("../src/protected/backend.ts", import.meta.url),
    "utf8",
  );
  const promptAllowlist = source.match(
    /prompt:\s*\[([\s\S]*?)\],\s*writer:/,
  );

  assert.ok(promptAllowlist, "prompt request allowlist must remain discoverable");
  assert.match(promptAllowlist[1], /["']locale["']/);
});
