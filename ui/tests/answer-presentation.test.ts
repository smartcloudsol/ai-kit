import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import type { AnswerPresentation } from "@smart-cloud/ai-kit-core";
import { answerAttributeText, normalizeAnswerPresentation, withSafeAnswerPresentation } from "../src/ai-chatbot/answer-presentation-state.ts";

export function fixture(layout: "compact-list" | "cards" | "carousel" = "cards"): AnswerPresentation {
  return { schemaVersion: 1, groups: [{ templateId: "approved", templateRevision: 1, layout, heading: "Authored heading", entities: [{
    ref: "entity-1", entityId: "source-id", title: "Verified title", description: "<script>plain text only</script>",
    attributes: [{ id: "count", label: "Count", type: "number", value: 0 }, { id: "available", label: "Available", type: "boolean", value: false }],
    links: [{ id: "page", label: "Authored destination", url: "https://example.com/record" }],
    provenance: { kind: "external_rest", sourceId: "approved-source", evidenceId: "evidence-1", checkedAt: "2026-10-11T12:00:00.000Z" },
  }] }] };
}

test("history roundtrip retains approved data including false and zero without inferred values", () => {
  const message = { role: "assistant", content: "Fallback answer", presentation: fixture() };
  const stored = JSON.parse(JSON.stringify(withSafeAnswerPresentation(message)));
  assert.deepEqual(withSafeAnswerPresentation(stored), message);
  assert.equal(answerAttributeText(message.presentation.groups[0]!.entities[0]!.attributes[0]!), "0");
  assert.equal(answerAttributeText(message.presentation.groups[0]!.entities[0]!.attributes[1]!), "false");
  assert.equal(answerAttributeText({ id: "items", label: "Items", type: "string-list", value: ["One", "Two"] }), "One, Two");
});

test("malformed, future and unsafe history presentation is discarded while text survives", () => {
  const invalid = fixture();
  invalid.groups[0]!.entities[0]!.links[0]!.url = "javascript:alert(1)";
  for (const presentation of [invalid, { ...fixture(), schemaVersion: 2 }, "raw HTML", null, undefined]) {
    assert.equal(normalizeAnswerPresentation(presentation), undefined);
    assert.deepEqual(withSafeAnswerPresentation({ content: "Keep this", presentation }), { content: "Keep this" });
  }
  assert.deepEqual(withSafeAnswerPresentation({ content: "Legacy history" }), { content: "Legacy history" });
});

async function renderer() {
  const require = createRequire(import.meta.url);
  const source = await readFile(new URL("../src/ai-chatbot/AnswerPresentation.tsx", import.meta.url), "utf8");
  const transformed = await require("esbuild").transform(source, { loader: "tsx", format: "cjs", jsx: "automatic" });
  const module = { exports: {} as { AnswerPresentationView: (props: { presentation: AnswerPresentation }) => unknown } };
  vm.runInNewContext(transformed.code, { module, exports: module.exports,
    require: (id: string) => id === "./answer-presentation-state" ? { answerAttributeText, normalizeAnswerPresentation } : require(id),
  });
  return { View: module.exports.AnswerPresentationView, React: require("react"), render: require("react-dom/server").renderToStaticMarkup };
}

test("all three generic layouts render authored labels, escaped text and evidence timestamps", async () => {
  const { View, React, render } = await renderer();
  for (const layout of ["compact-list", "cards", "carousel"] as const) {
    const html = render(React.createElement(View, { presentation: fixture(layout) }));
    assert.match(html, new RegExp(`data-answer-layout="${layout}"`));
    assert.match(html, /Authored heading/);
    assert.match(html, /Authored destination/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /&lt;script&gt;plain text only&lt;\/script&gt;/);
    assert.match(html, /<dd[^>]*>0<\/dd>/);
    assert.match(html, /<dd[^>]*>false<\/dd>/);
    assert.match(html, /<time dateTime="2026-10-11T12:00:00.000Z"/);
    assert.doesNotMatch(html, /<script|<img|Shopify|MyMedio|aria-live/);
    if (layout === "carousel") { assert.match(html, /tabindex="0"/); assert.match(html, /overflow-x:auto/); }
  }
});

test("optional image is safe and layout remains useful without it", async () => {
  const { View, React, render } = await renderer();
  const value = fixture();
  value.groups[0]!.entities[0]!.image = { url: "https://example.com/image.webp", alt: "Authored alt" };
  const html = render(React.createElement(View, { presentation: value }));
  assert.match(html, /alt="Authored alt"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /referrerPolicy="no-referrer"/);
  value.groups[0]!.entities[0]!.image.url = "data:image/png;base64,xxx";
  assert.equal(render(React.createElement(View, { presentation: value })), "");
});

test("carousel keyboard navigation moves card focus without hijacking link keys", async () => {
  const require = createRequire(import.meta.url);
  const source = await readFile(new URL("../src/ai-chatbot/AnswerPresentation.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function moveCarouselFocus(");
  const end = source.indexOf("/** The same", start);
  const transformed = await require("esbuild").transform(`export ${source.slice(start, end)}`, { loader: "ts", format: "cjs" });
  const module = { exports: {} as { moveCarouselFocus: (event: unknown) => void } };
  class Element { focused = false; focus() { this.focused = true; } }
  vm.runInNewContext(transformed.code, { module, exports: module.exports, HTMLElement: Element });
  const cards = [new Element(), new Element(), new Element()];
  const container = { children: cards };
  let prevented = 0;
  const event = (key: string, target: unknown) => ({ key, currentTarget: container, target, preventDefault: () => prevented++ });
  module.exports.moveCarouselFocus(event("ArrowRight", cards[0]));
  assert.equal(cards[1]!.focused, true);
  module.exports.moveCarouselFocus(event("End", cards[0]));
  assert.equal(cards[2]!.focused, true);
  module.exports.moveCarouselFocus(event("Home", cards[2]));
  assert.equal(cards[0]!.focused, true);
  module.exports.moveCarouselFocus(event("ArrowRight", { tagName: "A" }));
  assert.equal(prevented, 3);
});

test("image failure removes only the failed image and does not fabricate a fallback", async () => {
  const require = createRequire(import.meta.url);
  const source = await readFile(new URL("../src/ai-chatbot/AnswerPresentation.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function EntityImage(");
  const end = source.indexOf("function EntityContent(", start);
  const transformed = await require("esbuild").transform(`export ${source.slice(start, end)}`, { loader: "tsx", format: "cjs", jsx: "automatic" });
  const module = { exports: {} as { EntityImage: (props: unknown) => { props: { onError: () => void } } | null } };
  let failed = false;
  vm.runInNewContext(transformed.code, { module, exports: module.exports, require,
    useState: () => [failed, (value: boolean) => { failed = value; }],
  });
  const props = { image: { url: "https://example.com/image.webp", alt: "Authored alt" } };
  module.exports.EntityImage(props)?.props.onError();
  assert.equal(failed, true);
  assert.equal(module.exports.EntityImage(props), null);
});

test("real browser keeps card tracks within narrow rails and bounded on desktop", {
  skip: !process.env.WPSUITE_BROWSER_EXECUTABLE || !process.env.WPSUITE_BROWSER_DRIVER_PATH,
}, async () => {
  const require = createRequire(import.meta.url);
  const { launch } = require(process.env.WPSUITE_BROWSER_DRIVER_PATH!);
  const browser = await launch({ executablePath: process.env.WPSUITE_BROWSER_EXECUTABLE!, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request: { abort: () => void }) => request.abort());
    const { View, React, render } = await renderer();
    for (const width of [220, 360, 900]) {
      for (const layout of ["compact-list", "cards", "carousel"] as const) {
        const value = fixture(layout);
        const first = value.groups[0]!.entities[0]!;
        value.groups[0]!.entities = [first, { ...first, ref: "entity-2" }, { ...first, ref: "entity-3" }];
        await page.setViewport({ width: 1000, height: 800 });
        await page.setContent(`<div id="rail" style="width:${width}px;max-width:100%">${render(React.createElement(View, { presentation: value }))}</div>`);
        const metrics = await page.evaluate(() => {
          const rail = document.querySelector("#rail")!;
          const list = rail.querySelector("ul")!;
          return { railWidth: rail.getBoundingClientRect().width, listWidth: list.getBoundingClientRect().width,
            clientWidth: list.clientWidth, scrollWidth: list.scrollWidth,
            cards: [...list.children].map((card) => card.getBoundingClientRect().width),
            documentWidth: document.documentElement.clientWidth, documentScrollWidth: document.documentElement.scrollWidth };
        });
        assert.ok(metrics.listWidth <= metrics.railWidth + 1, `${layout}/${width}: list must fit its rail`);
        assert.ok(metrics.documentScrollWidth <= metrics.documentWidth + 1, `${layout}/${width}: no document horizontal overflow`);
        if (layout !== "carousel") assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, `${layout}/${width}: no clipped grid`);
        for (const card of metrics.cards) {
          assert.ok(card <= metrics.railWidth + 1, `${layout}/${width}: card must fit narrow rail`);
          if (layout !== "compact-list") assert.ok(card <= 257, `${layout}/${width}: desktop card stays bounded`);
        }
      }
    }
  } finally { await browser.close(); }
});
