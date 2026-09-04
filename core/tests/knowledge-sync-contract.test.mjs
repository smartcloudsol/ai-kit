import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadContract() {
  const sourceUrl = new URL("../src/knowledge-sync.ts", import.meta.url);
  const source = await fs.readFile(sourceUrl, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

function projection(overrides = {}) {
  return {
    schemaVersion: 1,
    source: {
      producer: "wordpress",
      siteId: "site-17",
      blogId: "1",
      postType: "solution",
      postId: "42",
    },
    sourceVersion: "90071992547409931234",
    correlationId: "01JTEST",
    observedAt: "2026-09-02T08:00:00.000Z",
    operation: "upsert",
    document: {
      profile: "default",
      canonicalUrl: "https://example.com/solutions/example/",
      title: "Example solution",
      excerpt: "Summary",
      content: "# Example solution",
      contentType: "text/markdown",
      contentSha256: "a".repeat(64),
      modifiedGmt: "2026-09-02T07:59:00.000Z",
      metadata: [
        { namespace: "industry", slug: "healthcare", label: "Healthcare" },
      ],
    },
    ...overrides,
  };
}

test("projection round-trips without losing bigint source versions", async () => {
  const contract = await loadContract();
  const parsed = contract.parsePublicContentProjectionV1(projection(), {
    producer: "wordpress",
    siteId: "site-17",
  });
  assert.equal(parsed.sourceVersion, "90071992547409931234");
  assert.equal(
    contract.knowledgeSyncSourceKey(parsed.source),
    "wordpress:site-17:1:solution:42",
  );
});

test("older source versions cannot be mistaken for newer changes", async () => {
  const contract = await loadContract();
  assert.equal(contract.compareKnowledgeSourceVersions("41", "42"), "older");
  assert.equal(contract.compareKnowledgeSourceVersions("42", "42"), "same");
  assert.equal(contract.compareKnowledgeSourceVersions("43", "42"), "newer");
});

test("authenticated producer boundaries reject cross-site projections", async () => {
  const contract = await loadContract();
  assert.throws(
    () =>
      contract.parsePublicContentProjectionV1(projection(), {
        producer: "wordpress",
        siteId: "another-site",
      }),
    (error) => error.code === "source_boundary_mismatch",
  );
});

test("projection contract rejects caller-selected S3 object keys", async () => {
  const contract = await loadContract();
  assert.throws(
    () =>
      contract.parsePublicContentProjectionV1({
        ...projection(),
        objectKey: "documents/another-tenant/private.md",
      }),
    (error) => error.code === "unknown_field",
  );
});

test("delete projections retain identity without accepting content", async () => {
  const contract = await loadContract();
  const parsed = contract.parsePublicContentProjectionV1(
    projection({
      operation: "delete",
      document: null,
      lastPublicUrl: "https://example.com/solutions/example/",
    }),
  );
  assert.equal(parsed.operation, "delete");
  assert.equal(parsed.document, null);
});

test("policy parsing is strict and normalizes taxonomy scope", async () => {
  const contract = await loadContract();
  const parsed = contract.parseKnowledgeSyncPolicyV1({
    schemaVersion: 1,
    postType: "solution",
    enabled: true,
    autoEnableSource: "administrator",
    reviewPolicy: "wordpress-publish-is-approval",
    onPublish: "upsert",
    onPublishedUpdate: "upsert",
    onUnpublish: "delete",
    metadataRefresh: "reconcile",
    includeTaxonomies: ["solution_topic", "industry", "industry"],
    documentProfile: "default",
  });
  assert.deepEqual(parsed.includeTaxonomies, ["industry", "solution_topic"]);
});
