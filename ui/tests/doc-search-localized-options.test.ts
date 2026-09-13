import assert from "node:assert/strict";
import test from "node:test";

import { buildLocalizedOptions } from "../src/doc-search/localizedOptions.ts";

test("sorts DocSearch tag options by localized label and preserves canonical values", () => {
  const translations: Record<string, string> = {
    "API Integration": "API-integráció",
    "API Security": "API-biztonság",
    Authentication: "Hitelesítés",
    AWS: "AWS",
    "Amazon S3": "Amazon S3",
  };

  assert.deepEqual(
    buildLocalizedOptions(
      ["Amazon S3", "API Integration", "API Security", "Authentication", "AWS"],
      (value) => translations[value] ?? value,
      "hu-HU",
    ),
    [
      { value: "Amazon S3", label: "Amazon S3" },
      { value: "API Security", label: "API-biztonság" },
      { value: "API Integration", label: "API-integráció" },
      { value: "AWS", label: "AWS" },
      { value: "Authentication", label: "Hitelesítés" },
    ],
  );
});

test("falls back to the runtime collator when a locale is invalid", () => {
  assert.deepEqual(
    buildLocalizedOptions(["z", "a"], (value) => value, "invalid_locale"),
    [
      { value: "a", label: "a" },
      { value: "z", label: "z" },
    ],
  );
});
