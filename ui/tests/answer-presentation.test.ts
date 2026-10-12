import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import type { AnswerPresentation } from "@smart-cloud/ai-kit-core";
import { answerAttributeText, answerComparisonRows, normalizeAnswerPresentation, withSafeAnswerPresentation } from "../src/ai-chatbot/answer-presentation-state.ts";

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
  for (const invalid of [{ ...value, schemaVersion: 3 }, { ...value, locale: "invalid_locale" }]) {
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
  for (const presentation of [invalid, { ...fixture(), schemaVersion: 3 }, "raw HTML", null, undefined]) {
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
    require: (id: string) => id === "./answer-presentation-state" ? { answerAttributeText, answerComparisonRows, normalizeAnswerPresentation } : require(id),
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
  assert.match(render(React.createElement(View, { presentation: currentLocale, locale: "hu-HU" })), /949,95 USD/);
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
              height: link.getBoundingClientRect().height, tabIndex: link.tabIndex })),
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
