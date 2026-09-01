import assert from "node:assert/strict";
import test from "node:test";

import { normalizeInitialFilterValues } from "../src/doc-search/initialFilters.ts";

test("normalizes, deduplicates, and preserves initial DocSearch filters", () => {
  assert.deepEqual(
    normalizeInitialFilterValues([
      " Solutions ",
      "",
      "Solution Guide",
      "Solutions",
    ]),
    ["Solutions", "Solution Guide"],
  );
});

test("uses an empty selection when initial DocSearch filters are omitted", () => {
  assert.deepEqual(normalizeInitialFilterValues(undefined), []);
});
