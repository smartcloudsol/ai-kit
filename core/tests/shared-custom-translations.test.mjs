import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("the AI Kit store uses the site-wide translation loader with its legacy URL only as fallback", async () => {
  const sourceUrl = new URL("../src/store.ts", import.meta.url);
  const source = await fs.readFile(sourceUrl, "utf8");

  assert.match(
    source,
    /getCustomTranslations as loadCustomTranslations/,
    "the store must import the shared WP Suite loader",
  );
  assert.match(
    source,
    /loadCustomTranslations\(\{\s*legacyUrl:\s*getAiKitPlugin\(\)\?\.settings\.customTranslationsUrl,?\s*\}\)/s,
    "the retired plugin setting may only be passed as a rolling-upgrade fallback",
  );
  assert.doesNotMatch(
    source,
    /loadTranslationCatalogs/,
    "the store must not load a plugin-specific URL directly",
  );
});
