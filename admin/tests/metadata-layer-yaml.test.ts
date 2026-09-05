import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "yaml";

import {
  parseExternalVocabularyYaml,
  serializeMetadataLayer,
} from "../src/paid-features/kb-admin/metadata-layer-yaml.ts";

const sources = [
  {
    id: "external:docs",
    enabled: true,
    namespaces: {
      category: [
        {
          slug: "setup",
          label: "Setup",
          parentSlug: "guides",
          custom: "retained",
        },
      ],
      post_tag: ["true", "007", "2026-09-05"],
    },
    unknownProducerField: { enabled: false, count: 2, missing: null },
  },
];

test("YAML display round-trips external vocabulary hierarchy, string types and unknown producer fields", () => {
  const yaml = serializeMetadataLayer(sources);
  assert.ok(yaml.startsWith("- id:"));
  assert.deepEqual(parseExternalVocabularyYaml(yaml), sources);
  assert.deepEqual(
    parseExternalVocabularyYaml(JSON.stringify(sources)),
    sources,
  );
});

test("WordPress-derived, provenance and collision display preserve all structured values", () => {
  for (const value of [
    sources,
    { allowedTags: { "007": ["external:docs", "wordpress:blog-1"] } },
    [{ selected: "Guides", discarded: "guides" }],
    [],
    {},
  ]) {
    assert.deepEqual(parse(serializeMetadataLayer(value)), value);
  }
});

test("external YAML rejects invalid envelopes instead of silently changing the API contract", () => {
  for (const value of [
    {},
    null,
    [{ id: "docs", enabled: "true", namespaces: {} }],
    [{ id: "docs", enabled: true, namespaces: { category: {} } }],
    [
      {
        id: "docs",
        enabled: true,
        namespaces: { category: [{ slug: "setup" }] },
      },
    ],
    [sources[0], sources[0]],
  ]) {
    assert.throws(() =>
      parseExternalVocabularyYaml(serializeMetadataLayer(value)),
    );
  }
  assert.deepEqual(parseExternalVocabularyYaml("[]"), []);
  assert.throws(() => parseExternalVocabularyYaml(""));
});

test("external YAML rejects duplicate keys, aliases, custom tags, multi-document input and lossy numbers", () => {
  for (const raw of [
    "- id: docs\n  id: other\n  enabled: true\n  namespaces: {}",
    "- &source { id: docs, enabled: true, namespaces: {} }\n- *source",
    "- id: docs\n  enabled: true\n  namespaces: {}\n  custom: !unsafe value",
    "[]\n---\n[]",
    "- id: docs\n  enabled: true\n  namespaces: {}\n  custom: .nan",
    "- id: docs\n  enabled: true\n  namespaces: {}\n  custom: 9007199254740993",
  ])
    assert.throws(() => parseExternalVocabularyYaml(raw));
});

test("custom validation errors use the UI translator", () => {
  assert.throws(
    () => parseExternalVocabularyYaml("{}", (text) => `localized:${text}`),
    /localized:/,
  );
});
