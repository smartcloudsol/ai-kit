import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/kb-section/edit.tsx", import.meta.url),
  "utf8",
);

test("every AI Kit block declares the plugin text domain", () => {
  for (const block of ["ai-feature", "doc-search", "kb-section"]) {
    const metadata = JSON.parse(
      readFileSync(
        new URL(`../src/${block}/block.json`, import.meta.url),
        "utf8",
      ),
    );

    assert.equal(metadata.textdomain, "smartcloud-ai-kit", block);
  }
});

test("KB Section visible examples and status labels use WordPress i18n", () => {
  for (const unlocalized of [
    'placeholder="e.g., pricing"',
    'placeholder="e.g., Pricing Information"',
    '? "Base Doc"',
    '? `Doc: ${docKey || "unnamed"}`',
    ': "Excluded"',
    "placeholder={`Auto:",
  ]) {
    assert.doesNotMatch(source, new RegExp(escapeRegExp(unlocalized)));
  }

  for (const localized of [
    '__("e.g., pricing", TEXT_DOMAIN)',
    '__("e.g., Pricing Information", TEXT_DOMAIN)',
    '__("Base document", TEXT_DOMAIN)',
    '__("Document: %s", TEXT_DOMAIN)',
    '__("unnamed", TEXT_DOMAIN)',
    '__("Excluded", TEXT_DOMAIN)',
    '__("Auto: %s…", TEXT_DOMAIN)',
  ]) {
    assert.match(source, new RegExp(escapeRegExp(localized)));
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
