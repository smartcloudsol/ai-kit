import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const feature = readFileSync(
  new URL("../src/ai-feature/AiFeature.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../src/styles/ai-kit-ui.css", import.meta.url),
  "utf8",
);

test("feature options toggle uses legible neutral colors in light and dark themes", () => {
  assert.match(feature, /className="ai-feature-options-toggle"/);
  assert.match(feature, /aria-expanded=\{optionsOpen\}/);
  assert.match(
    styles,
    /\.ai-feature-options-summary \.ai-feature-options-toggle\s*\{[^}]*color: var\(--ai-kit-options-toggle-color\);[^}]*background-color: transparent;[^}]*border: 1px solid var\(--ai-kit-color-border\);/s,
  );
  assert.match(
    styles,
    /\.ai-feature-options-summary \.ai-feature-options-toggle:hover\s*\{[^}]*color: var\(--ai-kit-options-toggle-color\);[^}]*background-color: var\(--ai-kit-options-toggle-bg-hover\);/s,
  );
  assert.match(
    styles,
    /\[data-ai-kit-theme="dark"\]\s*\{[^}]*--ai-kit-options-toggle-bg-hover: rgba\(255, 255, 255, 0\.1\);/s,
  );
  assert.match(
    styles,
    /\[data-ai-kit-theme="dark"\]\s*\{[^}]*--ai-kit-options-toggle-border-hover: rgba\(255, 255, 255, 0\.28\);/s,
  );
});
