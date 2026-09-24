import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("chat transport does not send browser-owned shared context", async () => {
  const source = await fs.readFile(
    new URL("../src/protected/features.ts", import.meta.url),
    "utf8",
  );
  const match = source.match(
    /async function buildChatMessageBackendRequest\([\s\S]*?return \{([\s\S]*?)\n  \};\n\}/,
  );

  assert.ok(match, "chat backend request construction must remain discoverable");
  assert.doesNotMatch(match[1], /sharedContext|context:/);
  assert.match(match[1], /sessionId:\s*args\.sessionId/);
  assert.match(match[1], /locale:\s*args\.locale/);
});
