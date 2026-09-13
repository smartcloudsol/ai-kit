import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("chat transport forwards every caller option while resolving shared context", async () => {
  const source = await fs.readFile(
    new URL("../src/protected/features.ts", import.meta.url),
    "utf8",
  );
  const match = source.match(
    /buildChatMessageBackendRequest\(\s*\{([\s\S]*?)\}\s+as ChatMessageArgs/,
  );

  assert.ok(match, "chat backend request construction must remain discoverable");
  assert.match(match[1], /\.\.\.args/);
  assert.match(match[1], /sharedContext/);
  assert.doesNotMatch(match[1], /sessionId:\s*args\.sessionId/);
});
