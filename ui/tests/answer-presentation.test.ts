import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import type { AnswerPresentation } from "@smart-cloud/ai-kit-core";
import { answerAttributeMarkdown, answerAttributeText, answerComparisonRows, normalizeAnswerPresentation, withSafeAnswerPresentation } from "../src/ai-chatbot/answer-presentation-state.ts";

export function fixture(layout: "compact-list" | "cards" | "carousel" = "cards"): AnswerPresentation {
  return { schemaVersion: 1, groups: [{ templateId: "approved", templateRevision: 1, layout, heading: "Authored heading", entities: [{
    ref: "entity-1", entityId: "source-id", title: "Verified title", description: "<script>plain text only</script>",
    attributes: [{ id: "count", label: "Count", type: "number", value: 0 }, { id: "available", label: "Available", type: "boolean", value: false },
      { id: "verified", label: "Verified flag", type: "boolean", value: true }],
    links: [{ id: "page", label: "Authored destination", url: "https://example.com/record" }],
    provenance: { kind: "external_rest", sourceId: "approved-source", evidenceId: "evidence-1", checkedAt: "2026-10-11T12:00:00.000Z" },
  }] }] };
}

export function typedFixture(preset: "product-cards" | "comparison" | "recommendations" | "status-cards" = "product-cards"): AnswerPresentation {
  const value = fixture();
  value.schemaVersion = 2;
  value.locale = "en-US";
  const group = value.groups[0]!;
  group.preset = preset;
  group.layout = preset === "comparison" ? "comparison" : "cards";
  group.entities[0]!.attributes.push(
    { id: "price", label: "Verified price", type: "money", role: "price", value: { amount: "94995", currency: "USD", unit: "minor", scale: 2 } },
    { id: "stock", label: "Verified inventory", type: "status", role: "availability", value: { code: "unknown", label: "Inventory not reported", semantics: "inventory" } },
    { id: "orderability", label: "Verified orderability", type: "status", role: "availability", value: { code: "orderable", label: "Ordering supported", semantics: "orderability" } },
  );
  group.entities[0]!.links[0]!.appearance = "secondary";
  return value;
}

test("typed money formats exact source units and locale without parsing legacy display strings", () => {
  const price = typedFixture().groups[0]!.entities[0]!.attributes.find(attribute => attribute.id === "price")!;
  assert.equal(answerAttributeText(price, "en-US"), "$949.95");
  assert.equal(answerAttributeText(price, "hu-HU"), "949,95\u00a0USD");
  assert.equal(answerAttributeText(price, "de-DE"), "949,95\u00a0$");
  assert.equal(answerAttributeText({ ...price, value: { amount: "0", currency: "USD", unit: "major" } }, "en-US"), "$0.00");
  assert.equal(answerAttributeText({ ...price, value: { amount: "94995", currency: "USD", unit: "minor", scale: 3 } }, "en-US"), "$94.995");
  assert.equal(answerAttributeText({ ...price, value: { amount: "0", unit: "major" } as never }, "en-US"), undefined);
  assert.equal(answerAttributeText({ ...price, value: { amount: "949,95", currency: "USD", unit: "major" } }, "en-US"), undefined);
  assert.equal(answerAttributeText({ ...price, type: "string", value: "HUF 949,95" }, "en-US"), "HUF 949,95");
});

test("v2 history preserves exact money and distinct status semantics; invalid future schemas retain only text", () => {
  const value = typedFixture();
  assert.deepEqual(withSafeAnswerPresentation(JSON.parse(JSON.stringify({ content: "Fallback", presentation: value }))), { content: "Fallback", presentation: value });
  for (const invalid of [{ ...value, schemaVersion: 4 }, { ...value, locale: "invalid_locale" }]) {
    assert.deepEqual(withSafeAnswerPresentation({ content: "Fallback", presentation: invalid }), { content: "Fallback" });
  }
  const invalid = typedFixture();
  invalid.groups[0]!.entities[0]!.attributes.find(attribute => attribute.id === "price")!.value = { amount: "94995", currency: "USD", unit: "minor", scale: 7 };
  assert.equal(normalizeAnswerPresentation(invalid), undefined);
  const unsupportedStock = typedFixture();
  unsupportedStock.groups[0]!.entities[0]!.attributes.find(attribute => attribute.id === "stock")!.value = { code: "orderable", label: "Cannot be treated as inventory", semantics: "inventory" };
  assert.equal(normalizeAnswerPresentation(unsupportedStock), undefined);
});

test("comparison joins only configured attribute IDs and excludes conflicting labels or types", () => {
  const a = fixture().groups[0]!.entities[0]!;
  const b = { ...a, ref: "second", attributes: a.attributes.map(attribute => ({ ...attribute })) };
  b.attributes[0]!.label = "Conflicting count label";
  b.attributes[1]!.type = "string";
  b.attributes[1]!.value = "false";
  assert.deepEqual(answerComparisonRows([a, b]).map(row => row.id), ["verified"]);
  assert.deepEqual(answerComparisonRows([a, { ...b, attributes: [] }]).map(row => row.id), ["count", "available", "verified"]);
});

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
  for (const presentation of [invalid, { ...fixture(), schemaVersion: 4 }, "raw HTML", null, undefined]) {
    assert.equal(normalizeAnswerPresentation(presentation), undefined);
    assert.deepEqual(withSafeAnswerPresentation({ content: "Keep this", presentation }), { content: "Keep this" });
  }
  assert.deepEqual(withSafeAnswerPresentation({ content: "Legacy history" }), { content: "Legacy history" });
});

async function renderer() {
  const require = createRequire(import.meta.url);
  const source = await readFile(new URL("../src/ai-chatbot/AnswerPresentation.tsx", import.meta.url), "utf8");
  const transformed = await require("esbuild").transform(source, { loader: "tsx", format: "cjs", jsx: "automatic" });
  const module = { exports: {} as { AnswerPresentationView: (props: { presentation: AnswerPresentation; locale?: string }) => unknown } };
  vm.runInNewContext(transformed.code, { module, exports: module.exports,
    require: (id: string) => id === "./answer-presentation-state" ? { answerAttributeMarkdown, answerAttributeText, answerComparisonRows, normalizeAnswerPresentation }
      : id === "../locale" ? { useAiKitI18n: () => ({ language: "en", get: (key: string) => key }) } : require(id),
  });
  return { View: module.exports.AnswerPresentationView, React: require("react"), render: require("react-dom/server").renderToStaticMarkup };
}

test("public generic layouts render authored labels and links without technical provenance", async () => {
  const { View, React, render } = await renderer();
  for (const layout of ["compact-list", "cards", "carousel"] as const) {
    const html = render(React.createElement(View, { presentation: fixture(layout) }));
    assert.match(html, new RegExp(`data-answer-layout="${layout}"`));
    assert.match(html, /Authored heading/);
    assert.match(html, /Authored destination/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /&lt;script&gt;plain text only&lt;\/script&gt;/);
    assert.match(html, /<dd[^>]*><span[^>]*>0<\/span><\/dd>/);
    assert.match(html, /<dd[^>]*><span[^>]*>false<\/span><\/dd>/);
    assert.match(html, /<dd[^>]*><span[^>]*>true<\/span><\/dd>/);
    assert.match(html, /class="ai-answer-link"/);
    assert.match(html, /min-height:2.75rem/);
    assert.doesNotMatch(html, /approved-source|evidence-1|2026-10-11T12:00:00.000Z|data-source-kind|<time/);
    assert.doesNotMatch(html, /<script|<img|Shopify|MyMedio|aria-live/);
    if (layout === "carousel") {
      assert.doesNotMatch(html, /ai-answer-carousel-track|ai-answer-carousel-controls/,
        "four or fewer results remain an ordinary grid even when carousel is requested");
    }
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

test("projected plain text keeps line boundaries without enabling HTML or Markdown execution", async () => {
  const { View, React, render } = await renderer();
  for (const preset of ["product-cards", "comparison"] as const) {
    const presentation = typedFixture(preset);
    const entity = presentation.groups[0]!.entities[0]!;
    entity.description = "First paragraph\nSecond paragraph & <literal>";
    entity.attributes.push({ id: "specialty", label: "Specialty", type: "string", value: "Felnőtt gasztroenterológia\n**Literal** <script>not executable</script>" });
    const html = render(React.createElement(View, { presentation }));
    assert.match(html, /white-space:pre-line/);
    assert.match(html, /First paragraph\nSecond paragraph &amp; &lt;literal&gt;/);
    assert.match(html, /\*\*Literal\*\* &lt;script&gt;not executable&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script|<literal>|<strong>Literal<\/strong>/);
  }
});

function markdownFixture(preset: "product-cards" | "comparison" = "product-cards"): AnswerPresentation {
  const value = typedFixture(preset);
  value.schemaVersion = 3;
  const entity = value.groups[0]!.entities[0]!;
  entity.description = "First & second — plain fallback";
  entity.descriptionMarkdown = "First &amp; **second** — plain fallback";
  entity.attributes.push(
    { id: "specialty", label: "Specialty", type: "string", value: "Felnőtt gasztroenterológia\nSource emphasis",
      markdown: "**Felnőtt gasztroenterológia**\n\n*Source emphasis* and ~~removed~~" },
    { id: "qualifications", label: "Qualifications", type: "string-list", value: ["Exact first", "Exact second"], markdown: ["Exact **first**", "Exact *second*"] },
  );
  return value;
}

test("explicit wire-v3 Markdown formats descriptions and text attributes without replacing plain fallback values", async () => {
  const { View, React, render } = await renderer();
  for (const preset of ["product-cards", "comparison"] as const) {
    const value = markdownFixture(preset);
    const before = structuredClone(value);
    const html = render(React.createElement(View, { presentation: value }));
    assert.match(html, /First &amp; <strong>second<\/strong>/);
    assert.match(html, /<strong>Felnőtt gasztroenterológia<\/strong>/);
    assert.match(html, /<em>Source emphasis<\/em>/);
    assert.match(html, /<del>removed<\/del>/);
    assert.match(html, /Exact <strong>first<\/strong>/);
    assert.match(html, /Exact <em>second<\/em>/);
    assert.equal(answerAttributeText(value.groups[0]!.entities[0]!.attributes.at(-2)!), "Felnőtt gasztroenterológia\nSource emphasis");
    assert.deepEqual(value, before);
    assert.deepEqual(withSafeAnswerPresentation(JSON.parse(JSON.stringify({ content: "Saved reply", presentation: value }))).presentation, before);
  }
});

test("source Markdown cannot introduce raw HTML, images, embeds, navigation, headings or tables", async () => {
  const { View, React, render } = await renderer();
  const value = markdownFixture();
  delete value.groups[0]!.heading;
  const entity = value.groups[0]!.entities[0]!;
  entity.links = [];
  entity.descriptionMarkdown = "# Modest title\n\n[Keep link label](https://external.invalid/path) ![Drop image](https://external.invalid/pixel.png)\n\n<script>window.pwned=true</script>\n\n<iframe src=\"https://external.invalid/frame\"></iframe>\n\n<img src=\"x\" onerror=\"alert(1)\">\n\n| Big | Table |\n| --- | --- |\n| Cell | Value |\n\n`<script>literal code</script>`\n\n> Quote";
  const html = render(React.createElement(View, { presentation: value }));
  assert.match(html, /Keep link label/);
  assert.match(html, /&lt;script&gt;literal code&lt;\/script&gt;/);
  assert.match(html, /<blockquote/);
  assert.doesNotMatch(html, /<a\b|<img\b|<iframe\b|<script\b|<h[1-6]\b|<table\b|href=|external\.invalid|window\.pwned|onerror|Drop image/);
});

test("unannotated wire-v3 values remain literal and invalid or legacy Markdown metadata fails closed", async () => {
  const { View, React, render } = await renderer();
  const value = markdownFixture();
  const entity = value.groups[0]!.entities[0]!;
  delete entity.descriptionMarkdown;
  entity.description = "**Literal description** <b>not HTML</b>";
  for (const attribute of entity.attributes) delete attribute.markdown;
  entity.attributes.shift();
  entity.attributes.push({ id: "literal", label: "Literal", type: "string", value: "**Unformatted** <p>source</p>" });
  const html = render(React.createElement(View, { presentation: value }));
  assert.match(html, /\*\*Literal description\*\* &lt;b&gt;not HTML&lt;\/b&gt;/);
  assert.match(html, /\*\*Unformatted\*\* &lt;p&gt;source&lt;\/p&gt;/);
  assert.doesNotMatch(html, /ai-answer-source-markdown|<strong>Unformatted|<b>/);
  for (const schemaVersion of [1, 2]) assert.equal(normalizeAnswerPresentation({ ...markdownFixture(), schemaVersion }), undefined);
  const invalid = markdownFixture();
  invalid.groups[0]!.entities[0]!.attributes.at(-1)!.markdown = ["Only one item"];
  assert.equal(normalizeAnswerPresentation(invalid), undefined);
});

test("real browser renders bounded source Markdown and literal opt-outs without executing HTML or creating navigation", {
  skip: !process.env.WPSUITE_BROWSER_EXECUTABLE || !process.env.WPSUITE_BROWSER_DRIVER_PATH,
}, async () => {
  const require = createRequire(import.meta.url);
  const driver = require(process.env.WPSUITE_BROWSER_DRIVER_PATH!);
  const playwright = !!driver.chromium;
  const browser = await (driver.chromium ?? driver).launch({ executablePath: process.env.WPSUITE_BROWSER_EXECUTABLE!, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    const requests: string[] = [];
    if (playwright) await page.route("**/*", (route: { request: () => { url: () => string }; abort: () => void }) => {
      requests.push(route.request().url()); route.abort();
    });
    else {
      await page.setRequestInterception(true);
      page.on("request", (request: { url: () => string; abort: () => void }) => { requests.push(request.url()); request.abort(); });
    }
    for (const preset of ["product-cards", "comparison"] as const) for (const width of [320, 960]) {
      const value = markdownFixture(preset);
      delete value.groups[0]!.heading;
      const entity = value.groups[0]!.entities[0]!;
      entity.links = [];
      entity.descriptionMarkdown = "First &amp; **second**\n\n- One\n- Two\n\n[Keep link label](https://external.invalid/path)\n\n![Drop image](https://external.invalid/pixel.png)\n\n<script>window.pwned=true</script>\n\n<iframe src=\"https://external.invalid/frame\"></iframe>\n\n<img src=\"https://external.invalid/x\" onerror=\"window.pwned=true\">\n\n```\n" + "wide".repeat(180) + "\n```";
      entity.attributes.shift();
      entity.attributes.push({ id: "literal", label: "Literal", type: "string", value: "**Unformatted** <p>source</p>" });
      const built = await require("esbuild").build({ write: false, bundle: true, platform: "browser", format: "iife",
        stdin: { resolveDir: new URL("../", import.meta.url).pathname, loader: "tsx", contents: `
          import React from "react";
          import {createRoot} from "react-dom/client";
          import {AnswerPresentationView} from "./src/ai-chatbot/AnswerPresentation";
          import {AiKitLocaleProvider} from "./src/locale";
          createRoot(document.getElementById("root")).render(<AiKitLocaleProvider language="hu"
            customTranslations={{hu:{"Source emphasis":"INCORRECT TRANSLATION","**Felnőtt gasztroenterológia**":"INCORRECT TRANSLATION"}}}>
            <AnswerPresentationView presentation={${JSON.stringify(value)}}/>
          </AiKitLocaleProvider>);` } });
      if (playwright) await page.setViewportSize({ width, height: 900 }); else await page.setViewport({ width, height: 900 });
      await page.setContent(`<style>body{margin:0}#root{box-sizing:border-box;width:100%;padding:8px}</style><div id="root"></div><script>${built.outputFiles[0].text}</script>`);
      await page.waitForSelector(".ai-answer-source-markdown strong");
      const metrics = await page.evaluate(() => {
        const blocks = [...document.querySelectorAll<HTMLElement>(".ai-answer-source-markdown")];
        return { text: document.getElementById("root")!.textContent, bold: blocks[0]!.querySelector("strong")?.textContent,
          unsafe: document.querySelectorAll(".ai-answer-source-markdown a,.ai-answer-source-markdown img,.ai-answer-source-markdown iframe,.ai-answer-source-markdown script,.ai-answer-source-markdown h1,.ai-answer-source-markdown table").length,
          executed: (window as unknown as { pwned?: boolean }).pwned === true,
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
          overflow: blocks.some(block => block.scrollWidth > block.clientWidth + 1),
          emphasis: [...document.querySelectorAll(".ai-answer-source-markdown em")].map(node => node.textContent),
        };
      });
      assert.equal(metrics.bold, "second");
      assert.equal(metrics.unsafe, 0);
      assert.equal(metrics.executed, false);
      assert.equal(metrics.pageOverflow, false);
      assert.equal(metrics.overflow, false);
      assert.match(metrics.text ?? "", /First & second/);
      assert.match(metrics.text ?? "", /Keep link label/);
      assert.match(metrics.text ?? "", /\*\*Unformatted\*\* <p>source<\/p>/);
      assert.doesNotMatch(metrics.text ?? "", /INCORRECT TRANSLATION|window\.pwned|Drop image/);
      assert.ok(metrics.emphasis.includes("Source emphasis"));
      assert.deepEqual(requests, []);
    }
  } finally { await browser.close(); }
});

test("carousel requires more than four entities and provides authored navigation and position labels", async () => {
  const { View, React, render } = await renderer();
  for (const count of [1, 4, 5, 6]) {
    const value = fixture("carousel");
    const first = value.groups[0]!.entities[0]!;
    value.groups[0]!.entities = Array.from({ length: count }, (_, index) => ({ ...first, ref: `entity-${index}`, title: `Item ${index + 1}` }));
    const html = render(React.createElement(View, { presentation: value, carouselLabels: {
      previous: "Authored previous", next: "Authored next", position: "Showing {first} through {last} / {total}", region: "Authored region",
    } }));
    if (count <= 4) assert.doesNotMatch(html, /ai-answer-carousel-controls|ai-answer-carousel-track/);
    else {
      assert.match(html, /class="ai-answer-carousel-controls"/);
      assert.match(html, /aria-label="Authored previous" aria-disabled="true"/);
      assert.match(html, /aria-label="Authored next"/);
      assert.match(html, new RegExp(`Showing 1 through 1 / ${count}`));
      assert.match(html, /aria-live="polite" aria-atomic="true"/);
      assert.match(html, /overflow-x:auto/);
    }
  }
});

test("card and carousel navigation fills each card with centered usable buttons", async () => {
  const { View, React, render } = await renderer();
  for (const layout of ["cards", "carousel"] as const) {
    const value = typedFixture();
    value.groups[0]!.layout = layout;
    value.groups[0]!.entities[0]!.links.push({ id: "details", label: "Secondary information",
      url: "https://example.com/details", appearance: "secondary" });
    const html = render(React.createElement(View, { presentation: value }));
    const anchors = html.match(/<a\b[^>]*class="ai-answer-link"[^>]*>/g) ?? [];
    assert.equal(anchors.length, 2);
    for (const anchor of anchors) {
      assert.match(anchor, /(?:;|")width:100%[;"]/);
      assert.match(anchor, /box-sizing:border-box/);
      assert.match(anchor, /justify-content:center/);
      assert.match(anchor, /text-align:center/);
      assert.match(anchor, /min-height:2.75rem/);
    }
  }
  const compact = render(React.createElement(View, { presentation: fixture("compact-list") }));
  const compactAnchor = compact.match(/<a\b[^>]*class="ai-answer-link"[^>]*>/)?.[0] ?? "";
  assert.doesNotMatch(compactAnchor, /(?:;|")width:100%[;"]/);
});

test("four generic presets display only verified values, authored status labels and genuine links", async () => {
  const { View, React, render } = await renderer();
  for (const preset of ["product-cards", "comparison", "recommendations", "status-cards"] as const) {
    const html = render(React.createElement(View, { presentation: typedFixture(preset), locale: "hu-HU" }));
    assert.match(html, new RegExp(`data-answer-preset="${preset}"`));
    assert.match(html, /\$949\.95/, "envelope locale takes precedence over current UI locale");
    assert.match(html, /Inventory not reported/);
    assert.match(html, /Ordering supported/);
    assert.match(html, /data-answer-status-semantics="inventory"/);
    assert.match(html, /data-answer-status-semantics="orderability"/);
    assert.match(html, /data-answer-attribute-role="price"/);
    assert.match(html, /data-answer-link-appearance="secondary"/);
    assert.match(html, /href="https:\/\/example.com\/record"/);
    assert.doesNotMatch(html, /in-stock|approved-source|evidence-1|2026-10-11T12:00:00.000Z|Shopify|MyMedio/);
  }
  const currentLocale = typedFixture();
  delete currentLocale.locale;
  assert.match(render(React.createElement(View, { presentation: currentLocale, locale: "hu-HU" })), /949,95\u00a0USD/);
});

test("real browser anchors card action groups at the bottom without constraining content height", {
  skip: !process.env.WPSUITE_BROWSER_EXECUTABLE || !process.env.WPSUITE_BROWSER_DRIVER_PATH,
}, async () => {
  const require = createRequire(import.meta.url);
  const driver = require(process.env.WPSUITE_BROWSER_DRIVER_PATH!);
  const playwright = !!driver.chromium;
  const browser = await (driver.chromium ?? driver).launch({ executablePath: process.env.WPSUITE_BROWSER_EXECUTABLE!, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    const imageResponse = { status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="320"><rect width="100%" height="100%" fill="purple"/></svg>' };
    if (playwright) await page.route("**/*", (route: { fulfill: (response: unknown) => void }) => route.fulfill(imageResponse));
    else {
      await page.setRequestInterception(true);
      page.on("request", (request: { respond: (response: unknown) => void }) => request.respond(imageResponse));
    }
    const { View, React, render } = await renderer();
    for (const width of [220, 360, 1100]) for (const count of [3, 4, 6]) for (const images of [false, true]) {
      const value = fixture(count > 4 ? "carousel" : "cards");
      const group = value.groups[0]!;
      const first = group.entities[0]!;
      group.entities = Array.from({ length: count }, (_, index) => ({ ...first, ref: `item-${index}`,
        title: index % 2 ? "A longer title occupying two or more lines" : "Short title",
        description: index % 3 ? "A detailed description with more content than the adjacent card, preserved without clipping." : undefined,
        attributes: index % 2 ? first.attributes : [],
        image: images && index % 3 !== 2 ? { url: "https://fixture.example/product.svg", alt: "Authored image" } : undefined,
        links: index % 3 ? first.links : [...first.links, { id: "extra", label: "A longer additional action that may wrap safely", url: "https://example.com/more" }],
      }));
      const viewport = { width, height: 800 };
      if (playwright) await page.setViewportSize(viewport); else await page.setViewport(viewport);
      const css = await readFile(new URL("../src/styles/ai-kit-ui.css", import.meta.url), "utf8");
      await page.setContent(`<style>${css}\nbody{margin:0}</style><div id="rail">${render(React.createElement(View, { presentation: value }))}</div>`);
      await page.$$eval("img", (items: HTMLImageElement[]) => items.forEach(image => { image.loading = "eager"; }));
      await page.waitForFunction(() => [...document.querySelectorAll("img")].every(image => image.complete));
      const metrics = await page.$$eval("[data-answer-entity]", (items: HTMLElement[]) => items.map(card => {
        const box = card.getBoundingClientRect();
        const body = card.querySelector<HTMLElement>(".ai-answer-entity-body")!;
        const links = card.querySelector<HTMLElement>(".ai-answer-links")!;
        const actions = links.getBoundingClientRect();
        const contentEnd = links.previousElementSibling!.getBoundingClientRect().bottom;
        return { top: box.top, bottom: box.bottom, actionBottom: actions.bottom, actionTop: actions.top,
          contentEnd, bodyDisplay: getComputedStyle(body).display, direction: getComputedStyle(body).flexDirection,
          actionRects: [...links.querySelectorAll("a")].map(link => {
            const rect = link.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height, parentLeft: actions.left, parentRight: actions.right };
          }) };
      }));
      assert.equal(metrics.length, count);
      for (const card of metrics) {
        assert.equal(card.bodyDisplay, "flex");
        assert.equal(card.direction, "column");
        assert.ok(Math.abs(card.bottom - card.actionBottom - 17) < 1, "action groups retain bottom padding at every content height");
        assert.ok(card.actionTop >= card.contentEnd + 11, "auto margin preserves the minimum content/action gap");
        for (const action of card.actionRects) {
          assert.ok(action.height >= 44);
          assert.ok(action.left >= action.parentLeft - 1 && action.right <= action.parentRight + 1, "multiple and wrapped actions remain within their card");
        }
        for (const peer of metrics.filter(item => Math.abs(item.top - card.top) < 1)) {
          assert.ok(Math.abs(peer.actionBottom - card.actionBottom) < 1, "action groups align across a grid row or carousel track");
        }
      }
      assert.equal(await page.$eval("html", (node: HTMLElement) => node.scrollWidth <= node.clientWidth), true);
    }
  } finally { await browser.close(); }
});

test("comparison missing source values remain empty, not zero, false or manufactured availability", async () => {
  const { View, React, render } = await renderer();
  const value = typedFixture("comparison");
  const group = value.groups[0]!;
  group.entities.push({ ...group.entities[0]!, ref: "missing-fields", title: "Missing source fields", attributes: [], links: [] });
  const html = render(React.createElement(View, { presentation: value }));
  assert.equal((html.match(/<td[^>]*><\/td>/g) ?? []).length, group.entities[0]!.attributes.length);
  assert.doesNotMatch(html, /Not available|In stock|Unknown price|N\/A/);
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
  let direction = "ltr";
  const container = { children: cards, ownerDocument: { defaultView: { getComputedStyle: () => ({ direction }) } } };
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
  cards[0]!.focused = false;
  direction = "rtl";
  module.exports.moveCarouselFocus(event("ArrowRight", cards[1]));
  assert.equal(cards[0]!.focused, true, "RTL visual right moves to the preceding logical card");
  cards[2]!.focused = false;
  module.exports.moveCarouselFocus(event("ArrowLeft", cards[1]));
  assert.equal(cards[2]!.focused, true);
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
  const driver = require(process.env.WPSUITE_BROWSER_DRIVER_PATH!);
  const playwright = !!driver.chromium;
  const browser = await (driver.chromium ?? driver).launch({ executablePath: process.env.WPSUITE_BROWSER_EXECUTABLE!, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    if (playwright) await page.route("**/*", (route: { abort: () => void }) => route.abort());
    else {
      await page.setRequestInterception(true);
      page.on("request", (request: { abort: () => void }) => request.abort());
    }
    const { View, React, render } = await renderer();
    for (const width of [220, 360, 900]) {
      for (const layout of ["compact-list", "cards", "carousel"] as const) {
        const value = fixture(layout);
        const first = value.groups[0]!.entities[0]!;
        value.groups[0]!.entities = [first, { ...first, ref: "entity-2" }, { ...first, ref: "entity-3" }];
        const viewport = { width: width <= 360 ? 360 : 1000, height: 800 };
        if (playwright) await page.setViewportSize(viewport);
        else await page.setViewport(viewport);
        await page.setContent(`<style>body {margin:0}</style><div id="rail" style="width:${width}px;max-width:100%">${render(React.createElement(View, { presentation: value }))}</div>`);
        const metrics = await page.evaluate(() => {
          const rail = document.querySelector("#rail")!;
          const list = rail.querySelector("ul")!;
          return { railWidth: rail.getBoundingClientRect().width, listWidth: list.getBoundingClientRect().width,
            clientWidth: list.clientWidth, scrollWidth: list.scrollWidth,
            cards: [...list.children].map((card) => card.getBoundingClientRect().width),
            publicText: rail.textContent,
            values: [...rail.querySelectorAll("dd")].map((value) => value.textContent),
            links: [...rail.querySelectorAll<HTMLAnchorElement>("a")].map((link) => ({ href: link.href,
              height: link.getBoundingClientRect().height, width: link.getBoundingClientRect().width,
              parentWidth: link.parentElement!.getBoundingClientRect().width, tabIndex: link.tabIndex })),
            documentWidth: document.documentElement.clientWidth, documentScrollWidth: document.documentElement.scrollWidth };
        });
        assert.ok(metrics.listWidth <= metrics.railWidth + 1, `${layout}/${width}: list must fit its rail`);
        assert.ok(metrics.documentScrollWidth <= metrics.documentWidth + 1, `${layout}/${width}: no document horizontal overflow`);
        assert.doesNotMatch(metrics.publicText, /approved-source|evidence-1|2026-10-11T12:00:00.000Z/);
        assert.deepEqual(metrics.values.slice(0, 3), ["0", "false", "true"]);
        for (const link of metrics.links) {
          assert.equal(link.href, "https://example.com/record");
          assert.equal(link.tabIndex, 0);
          assert.ok(link.height >= 44, "navigation buttons have usable pointer targets");
          if (layout !== "compact-list") assert.ok(Math.abs(link.width - link.parentWidth) <= 1,
            "card and carousel buttons span the full card content rail");
        }
        if (layout !== "carousel") assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, `${layout}/${width}: no clipped grid`);
        for (const card of metrics.cards) {
          assert.ok(card <= metrics.railWidth + 1, `${layout}/${width}: card must fit narrow rail`);
          if (layout !== "compact-list") assert.ok(card <= 257, `${layout}/${width}: desktop card stays bounded`);
        }
      }
    }
  } finally { await browser.close(); }
});

test("real browser carousel navigates visible batches without moving control focus and supports RTL and reduced motion", {
  skip: !process.env.WPSUITE_BROWSER_EXECUTABLE || !process.env.WPSUITE_BROWSER_DRIVER_PATH,
}, async () => {
  const require = createRequire(import.meta.url);
  const driver = require(process.env.WPSUITE_BROWSER_DRIVER_PATH!);
  const playwright = !!driver.chromium;
  const browser = await (driver.chromium ?? driver).launch({ executablePath: process.env.WPSUITE_BROWSER_EXECUTABLE!, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const value = fixture("carousel");
    const first = value.groups[0]!.entities[0]!;
    value.groups[0]!.entities = Array.from({ length: 6 }, (_, index) => ({ ...first, ref: `item-${index}`, title: `Item ${index + 1}` }));
    const bundle = await require("esbuild").build({ write: false, bundle: true, platform: "browser", format: "iife",
      stdin: { resolveDir: new URL("../", import.meta.url).pathname, loader: "tsx", contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { AnswerPresentationView } from "./src/ai-chatbot/AnswerPresentation";
        createRoot(document.getElementById("root")).render(<AnswerPresentationView presentation={${JSON.stringify(value)}} />);
      ` } });
    const css = await readFile(new URL("../src/styles/ai-kit-ui.css", import.meta.url), "utf8");
    const page = await browser.newPage();
    if (playwright) await page.route("**/*", (route: { abort: () => void }) => route.abort());
    else {
      await page.setRequestInterception(true);
      page.on("request", (request: { abort: () => void }) => request.abort());
    }
    if (playwright) await page.emulateMedia({ reducedMotion: "reduce" });
    else await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    for (const direction of ["ltr", "rtl"]) {
      for (const width of [360, 900]) {
        const viewport = { width, height: 700 };
        if (playwright) await page.setViewportSize(viewport); else await page.setViewport(viewport);
        await page.setContent(`<style>${css}\nbody{margin:0}</style><div id="root" dir="${direction}"></div><script>${bundle.outputFiles[0].text}</script>`);
        await page.waitForSelector(".ai-answer-carousel-track");
        assert.equal(await page.$eval('[aria-label="Previous results"]', (button: HTMLButtonElement) => button.getAttribute("aria-disabled")), "true");
        const next = '[aria-label="Next results"]';
        for (let step = 0; step < 6; step++) {
          if (await page.$eval(next, (button: HTMLButtonElement) => button.getAttribute("aria-disabled") === "true")) break;
          await page.click(next);
          await page.waitForTimeout(100);
          assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Next results");
        }
        assert.equal(await page.$eval(next, (button: HTMLButtonElement) => button.getAttribute("aria-disabled")), "true");
        assert.match(await page.$eval('[aria-live="polite"]', (node: HTMLElement) => node.textContent), /6 of 6$/);
        const previous = '[aria-label="Previous results"]';
        for (let step = 0; step < 6; step++) {
          if (await page.$eval(previous, (button: HTMLButtonElement) => button.getAttribute("aria-disabled") === "true")) break;
          await page.click(previous);
          await page.waitForTimeout(100);
        }
        assert.equal(await page.$eval(previous, (button: HTMLButtonElement) => button.getAttribute("aria-disabled")), "true");
        await page.focus(".ai-answer-carousel-track");
        await page.keyboard.press("End");
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-answer-entity")), "item-5");
        await page.keyboard.press("Home");
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-answer-entity")), "item-0");
        await page.keyboard.press(direction === "rtl" ? "ArrowLeft" : "ArrowRight");
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-answer-entity")), "item-1");
        await page.focus('[data-answer-entity="item-1"] a');
        await page.keyboard.press("ArrowRight");
        assert.equal(await page.evaluate(() => document.activeElement?.tagName), "A", "arrow navigation does not hijack focused actions");
        assert.equal(await page.$eval("html", (node: HTMLElement) => node.scrollWidth <= node.clientWidth), true);
      }
    }
  } finally { await browser.close(); }
});

test("real browser renders all source-independent presets and readable scrolling comparisons at mobile widths", {
  skip: !process.env.WPSUITE_BROWSER_EXECUTABLE || !process.env.WPSUITE_BROWSER_DRIVER_PATH,
}, async () => {
  const require = createRequire(import.meta.url);
  const driver = require(process.env.WPSUITE_BROWSER_DRIVER_PATH!);
  const playwright = !!driver.chromium;
  const browser = await (driver.chromium ?? driver).launch({ executablePath: process.env.WPSUITE_BROWSER_EXECUTABLE!, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    if (playwright) await page.route("**/*", (route: { abort: () => void }) => route.abort());
    else { await page.setRequestInterception(true); page.on("request", (request: { abort: () => void }) => request.abort()); }
    const { View, React, render } = await renderer();
    for (const width of [220, 360, 900]) for (const preset of ["product-cards", "comparison", "recommendations", "status-cards"] as const) {
      const value = typedFixture(preset);
      const group = value.groups[0]!;
      const first = group.entities[0]!;
      group.entities = ["Alpha", "Beta", "Gamma"].map((name, index) => ({ ...first, ref: `verified-${index}`,
        title: `Very Long Verified Catalog Item ${name} With Authored Description` }));
      const viewport = { width: width <= 360 ? 360 : 1000, height: 800 };
      if (playwright) await page.setViewportSize(viewport); else await page.setViewport(viewport);
      await page.setContent(`<style>body {margin:0} .bubble {word-break:break-word;overflow-wrap:anywhere}</style><div class="bubble" id="rail" style="width:${width}px;max-width:100%">${render(React.createElement(View, { presentation: value }))}</div>`);
      const metrics = await page.evaluate(() => {
        const rail = document.querySelector<HTMLElement>("#rail")!;
        const scroll = rail.querySelector<HTMLElement>(".ai-answer-comparison-scroll");
        const headers = rail.querySelectorAll<HTMLElement>("thead th");
        return { text: rail.textContent, width: rail.clientWidth, scrollWidth: scroll?.scrollWidth, clientWidth: scroll?.clientWidth,
          table: !!scroll, focusable: scroll?.tabIndex,
          columns: [...headers].map(header => ({ width: header.getBoundingClientRect().width, wordBreak: getComputedStyle(header).wordBreak })),
          documentWidth: document.documentElement.clientWidth, documentScroll: document.documentElement.scrollWidth };
      });
      assert.match(metrics.text, /\$949\.95/);
      assert.match(metrics.text, /Inventory not reported/);
      assert.match(metrics.text, /Ordering supported/);
      assert.doesNotMatch(metrics.text, /approved-source|evidence-1|2026-10-11T12:00:00.000Z/);
      assert.ok(metrics.documentScroll <= metrics.documentWidth + 1, `${preset}/${width}: no page overflow`);
      if (preset === "comparison") {
        assert.equal(metrics.focusable, 0);
        assert.ok(metrics.clientWidth! <= metrics.width + 1, "comparison fits its answer rail");
        for (const column of metrics.columns) { assert.ok(column.width >= 160); assert.equal(column.wordBreak, "normal"); }
        if (width <= 360) {
          assert.ok(metrics.scrollWidth! > metrics.clientWidth!, "long columns scroll rather than splitting names");
          await page.focus(".ai-answer-comparison-scroll");
          await page.keyboard.press("ArrowRight");
          await page.waitForFunction(() => document.querySelector(".ai-answer-comparison-scroll")!.scrollLeft > 0);
        }
      } else assert.equal(metrics.table, false);
    }
  } finally { await browser.close(); }
});
