import assert from "node:assert/strict";
import test from "node:test";

import { citationDisplayText, citationLinkUrl } from "../src/shared/citation-display.ts";

test("decodes escaped citation labels as text", () => {
  assert.equal(citationDisplayText("Contact Support &amp; Sales"), "Contact Support & Sales");
  assert.equal(citationDisplayText("R&amp;D &#38; Support &eacute;quipe"), "R&D & Support équipe");
  assert.equal(citationDisplayText("&lt;em&gt;Safe text&lt;/em&gt;"), "<em>Safe text</em>");
});

test("decodes encoded URL separators without changing other query parameters", () => {
  assert.equal(
    citationLinkUrl("https://example.com/contact?topic=ai&amp;team=sales&copy=2"),
    "https://example.com/contact?topic=ai&team=sales&copy=2",
  );
  assert.equal(citationLinkUrl("https://example.com/?a=1&#38;b=2"), "https://example.com/?a=1&b=2");
  assert.equal(citationLinkUrl("https://example.com/?a=1&#038;b=2"), "https://example.com/?a=1&b=2");
  assert.equal(citationLinkUrl("javascript:alert(1)"), undefined);
  assert.equal(citationLinkUrl("https://user:pass@example.com/"), undefined);
});
