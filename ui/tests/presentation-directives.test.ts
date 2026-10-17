import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { hideVerifiedPresentationDirectives } from "../src/ai-chatbot/presentation-directives.ts";

const require = createRequire(import.meta.url);
const presentation = { schemaVersion: 1, groups: [{ templateId: "catalog-cards", templateRevision: 1, layout: "cards", entities: [{
  ref: "entity-1", entityId: "source-1", title: "Source title", attributes: [], links: [],
  provenance: { kind: "external_rest", sourceId: "source", evidenceId: "evidence-1", checkedAt: "2026-10-15T12:00:00.000Z" },
}] }] };
const marker = "[[presentation:catalog-cards|entity-1]]";
async function render(source: string, envelope: unknown = presentation) {
  const React = require("react");
  const ReactMarkdown = (await import("react-markdown")).default;
  return require("react-dom/server").renderToStaticMarkup(React.createElement(ReactMarkdown, {
    remarkPlugins: [hideVerifiedPresentationDirectives(envelope, source)],
  }, source));
}

test("only a standalone directive matching the validated presentation is hidden at render time", async () => {
  const source = `Source facts.\n\n${marker}\n\n[Source](https://example.test/record)`;
  const before = JSON.stringify(presentation);
  const html = await render(source);
  assert.doesNotMatch(html, /\[\[presentation:/);
  assert.match(html, /Source facts\./);
  assert.match(html, /href="https:\/\/example.test\/record"/);
  assert.equal(JSON.stringify(presentation), before);
  assert.ok(source.includes(marker), "Saved/source content is not rewritten");
  for (const alias of ["present_entities", "display_entities"]) {
    assert.doesNotMatch(await render(marker.replace("presentation", alias)), /\[\[/);
  }
});

test("ordinary explanations, escaped examples, code, quotations and link labels remain authored content", async () => {
  for (const source of [
    `The internal example is ${marker}.`, `\`${marker}\``, `\`\`\`text\n${marker}\n\`\`\``,
    `> ${marker}`, `\\[\\[presentation:catalog-cards|entity-1\\]\\]`, `[${marker}](https://example.test/explanation)`,
  ]) assert.match(await render(source), /presentation:catalog-cards/, source);
});

test("unvalidated, mismatched, duplicated or incomplete directives never become presentation authority", async () => {
  for (const envelope of [undefined, {}, { ...presentation, schemaVersion: 99 }]) {
    assert.match(await render(marker, envelope ?? null), /presentation:catalog-cards/);
  }
  for (const source of [
    "[[presentation:other-template|entity-1]]", "[[presentation:catalog-cards|entity-missing]]",
    "[[presentation:catalog-cards|entity-1,entity-1]]", "[[presentation:catalog-cards|entity-1",
    "[[note:authored]]", "[[evidence:kb-source]]",
  ]) assert.ok((await render(source)).includes(source));
});

test("assistant Markdown uses the render defense without changing raw user-message rendering", async () => {
  const source = await readFile(new URL("../src/ai-chatbot/AiChatbot.tsx", import.meta.url), "utf8");
  assert.match(source, /remarkPlugins=\{\[remarkGfm, hideVerifiedPresentationDirectives\(msg\.presentation, msg\.content\)\]\}/);
  assert.match(source, /\{msg\.role === "assistant" \? \(/);
});
