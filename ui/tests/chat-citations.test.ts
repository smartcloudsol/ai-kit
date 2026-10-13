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

test("preserves citation source fields until the React display boundary", () => {
  assert.deepEqual(normalizeChatCitations({
    docs: [{
      docId: "support",
      title: "Contact Support &amp; Sales",
      sourceUrl: "https://example.com/contact?team=support&amp;lang=hu",
      description: "Questions &amp; answers",
    }],
  }), [{
    title: "Contact Support &amp; Sales",
    sourceUrl: "https://example.com/contact?team=support&amp;lang=hu",
    snippet: "Questions & answers",
  }]);
});

test("merges KB and structured display links without mutating retrieval evidence", () => {
  for (const structuredFirst of [true, false]) {
    const kb = { docId: "kb-doctor", title: "Verified doctor", sourceUrl: "https://example.com/doctor",
      description: "Verified public introduction." };
    const structured = { docId: "structured-doctor", title: "Verified doctor", sourceUrl: "https://example.com/doctor",
      sourceKind: "structured_content" as const, description: "Internal structured payload" };
    const payload = { docs: structuredFirst ? [structured, kb] : [kb, structured],
      chunks: [{ docId: structured.docId, chunkId: "record", snippet: "Private structured record" },
        { docId: kb.docId, chunkId: "text", snippet: "Public chunk." }],
      anchors: [{ span: { start: 0, end: 12 }, chunkIds: ["record", "text"] }] };
    const before = structuredClone(payload);
    assert.deepEqual(normalizeChatCitations(payload), [{ title: "Verified doctor",
      sourceUrl: "https://example.com/doctor", snippet: "Verified public introduction." }]);
    assert.deepEqual(payload, before, "docs, chunks and anchors remain separate evidence records");
  }
});

test("suppresses only known structured JSON previews, including old truncated responses", () => {
  for (const snippet of [
    '{"provenance":"approved_own_structured_content","schemaVersion":1,"fields":{"name":"doctor"}}',
    ' { "provenance" : "approved_own_structured_content", "entityRef":"wordpress/site/type/12',
    '{"schemaVersion":2,"provenance":"approved_own_structured_content","fields":{}}',
  ]) {
    assert.deepEqual(normalizeChatCitations({ docs: [{ docId: "record", title: "Public source" }],
      chunks: [{ docId: "record", chunkId: "data", snippet }] }), [{ title: "Public source" }]);
    assert.deepEqual(normalizeChatCitations([{ title: "Public source", description: snippet, snippet }]), [{ title: "Public source" }]);
  }
  for (const snippet of ['{"type":"measurement","value":42}',
    'An example uses {"provenance":"approved_own_structured_content"} as metadata.',
    '{"provenance":"another_source","value":42}']) {
    assert.equal(normalizeChatCitations([{ snippet }])?.[0]?.snippet, snippet);
  }
});

test("URL merging preserves query and fragment distinctions, invalid links and unlinked references", () => {
  const citations = [
    { title: "First", sourceUrl: "https://EXAMPLE.com:443/path?x=1&amp;y=2#part" },
    { title: "Duplicate", sourceUrl: "https://example.com/path?x=1&y=2#part", snippet: "Readable preview" },
    { title: "Query variant", sourceUrl: "https://example.com/path?x=2&y=2#part" },
    { title: "Fragment variant", sourceUrl: "https://example.com/path?x=1&y=2#other" },
    { title: "Same title" }, { title: "Same title" },
    { title: "Invalid", sourceUrl: "javascript:alert(1)" },
    { title: "Invalid", sourceUrl: "javascript:alert(1)" },
    { title: "Credentials", sourceUrl: "https://user:password@example.com/path" },
    { title: "Credentials", sourceUrl: "https://user:password@example.com/path" },
  ];
  const before = structuredClone(citations);
  const normalized = normalizeChatCitations(citations)!;
  assert.equal(normalized.length, 9);
  assert.equal(normalized[0]?.sourceUrl, citations[0]?.sourceUrl);
  assert.equal(normalized[0]?.snippet, "Readable preview");
  assert.deepEqual(citations, before);
});

test("prefers a genuine description over an earlier retrieved chunk for the same URL", () => {
  assert.deepEqual(normalizeChatCitations({ docs: [
    { docId: "chunk-only", sourceUrl: "https://example.com/guide" },
    { docId: "description", title: "Guide", sourceUrl: "https://example.com/guide", description: "Authored overview." },
  ], chunks: [{ docId: "chunk-only", chunkId: "text", snippet: "Raw retrieved chunk." }] }), [
    { sourceUrl: "https://example.com/guide", title: "Guide", snippet: "Authored overview." },
  ]);
});
