import assert from "node:assert/strict";
import test from "node:test";

import { normalizeChatCitations } from "../src/ai-chatbot/citations.ts";

test("normalizes structured localized citations for chat rendering", () => {
  assert.deepEqual(
    normalizeChatCitations({
      docs: [
        {
          docId: "guide@hu",
          title: "Magyar útmutató",
          sourceUrl: "https://example.com/docs/hu/utmutato/",
        },
      ],
      chunks: [
        {
          docId: "guide@hu",
          chunkId: "guide@hu#1",
          snippet: "Lokalizált részlet.",
        },
      ],
    }),
    [
      {
        title: "Magyar útmutató",
        sourceUrl: "https://example.com/docs/hu/utmutato/",
        snippet: "Lokalizált részlet.",
      },
    ],
  );
});

test("keeps legacy flat citations readable during rolling upgrades", () => {
  const legacy = [{ title: "Reference", url: "https://example.com" }];
  assert.deepEqual(normalizeChatCitations(legacy), legacy);
});

test("prefers document description over a raw retrieved Markdown chunk", () => {
  assert.deepEqual(normalizeChatCitations({
    docs: [{
      docId: "guide",
      title: "Guide",
      description: "<p>Concise <strong>overview</strong> &amp; setup.</p>",
    }],
    chunks: [{
      docId: "guide",
      chunkId: "guide#1",
      snippet: "### Raw heading\n```ts\nconst privateCode = 1;\n```\n[Read more](https://example.com)",
    }],
  }), [{ title: "Guide", snippet: "Concise overview & setup." }]);
});

test("cleans and bounds a chunk preview when description is absent", () => {
  const result = normalizeChatCitations({
    docs: [{ docId: "plain", title: "Plain" }],
    chunks: [{
      docId: "plain",
      chunkId: "plain#1",
      snippet: "## Heading\n- **Important** <em>details</em> and [a link](https://example.com).",
    }],
  });
  assert.deepEqual(result, [{ title: "Plain", snippet: "Heading Important details and a link." }]);
  const long = normalizeChatCitations([{ snippet: "word ".repeat(100) }]);
  assert.ok(long?.[0]?.snippet && Array.from(long[0].snippet).length <= 280);
  assert.ok(long?.[0]?.snippet?.endsWith("…"));
});
