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
