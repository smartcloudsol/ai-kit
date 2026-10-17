import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import type { AnswerPresentation } from "@smart-cloud/ai-kit-core";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const catalogs = {
  en: {
    "Recommended products": "Catalog EN", "Price": "Price EN", "Availability": "Availability EN",
    "View product": "View EN", "Not reported": "Unknown EN", "Previous results": "Previous EN",
    "Next results": "Next EN", "Results": "Results EN", "of": "of EN",
    "More results available": "More EN", "Results expired. Search again.": "Expired EN",
    "{first}–{last} of {total}": "{first}–{last} out of {total} EN",
    "Catalog EN": "DO NOT TRANSLATE TWICE", "Next EN": "DO NOT TRANSLATE TWICE",
    "Source product": "DO NOT TRANSLATE SOURCE", "Source description": "DO NOT TRANSLATE SOURCE",
    "Source alt": "DO NOT TRANSLATE SOURCE", "Dawn": "DO NOT TRANSLATE SOURCE",
    "HUF 699.95": "DO NOT TRANSLATE SOURCE", "false": "DO NOT TRANSLATE SOURCE",
    "https://example.com/product": "https://invalid.example/changed",
  },
  hu: {
    "Recommended products": "Katalógus HU", "Price": "Ár HU", "Availability": "Elérhetőség HU",
    "View product": "Megtekintés HU", "Not reported": "Nem közölt HU", "Previous results": "Előző HU",
    "Next results": "Következő HU", "Results": "Találatok HU", "of": "/",
    "More results available": "Továbbiak HU", "Results expired. Search again.": "Lejárt HU",
    "{first}–{last} of {total}": "{first}–{last} / {total} HU",
  },
};
const pageLabels = {
  catalogPreviousLabel: "Previous results", catalogNextLabel: "Next results", catalogResultsLabel: "Results",
  catalogOfLabel: "of", catalogMoreAvailableLabel: "More results available", catalogExpiredLabel: "Results expired. Search again.",
};
const page = { schemaVersion: 1, pageIndex: 1, pageSize: 3, returnedCount: 3, totalCount: 10, hasMore: true,
  nextHandle: "n".repeat(43), previousHandle: "p".repeat(43), expiresAt: Math.floor(Date.now() / 1000) + 600 };

function presentation(schemaVersion: 1 | 2, layout: "cards" | "compact-list" | "carousel" | "comparison" = "cards"): AnswerPresentation {
  const result: AnswerPresentation = { schemaVersion, ...(schemaVersion === 2 ? { locale: "hu-HU" } : {}), groups: [{
    templateId: "source-template", templateRevision: 1, layout, heading: "Recommended products",
    entities: [{ ref: "entity-1", entityId: "source-1", title: "Source product", description: "Source description",
      image: { url: "https://example.com/image.jpg", alt: "Source alt" },
      attributes: [
        { id: "price", label: "Price", type: "string", value: "HUF 699.95" },
        { id: "color", label: "Untranslated authored label", type: "string", value: "Dawn" },
        { id: "flag", label: "Flag", type: "boolean", value: false },
        ...(schemaVersion === 2 ? [{ id: "availability", label: "Availability", type: "status" as const,
          value: { code: "unknown" as const, label: "Not reported", semantics: "inventory" as const } }]
          : [{ id: "availability", label: "Availability", type: "string" as const, value: "Not reported" }]),
      ],
      links: [{ id: "page", label: "View product", url: "https://example.com/product" }],
      provenance: { kind: "external_rest", sourceId: "source", evidenceId: "evidence-1", checkedAt: "2026-10-15T12:00:00.000Z" },
    }],
  }] };
  if (layout === "carousel") result.groups[0]!.entities = Array.from({ length: 5 }, (_, index) => ({
    ...result.groups[0]!.entities[0]!, ref: `entity-${index}`, entityId: `source-${index}`,
  }));
  return result;
}

const bundle = await require("esbuild").build({ write: false, bundle: true, platform: "node", format: "cjs",
  external: ["react", "react/jsx-runtime", "@smart-cloud/wpsuite-core", "@smart-cloud/ai-kit-core"],
  stdin: { resolveDir: new URL("../", import.meta.url).pathname, loader: "tsx", contents: `
    export { AiKitLocaleProvider as Provider } from "./src/locale";
    export { AnswerPresentationView as View } from "./src/ai-chatbot/AnswerPresentation";
    export { CatalogPageControls as Controls } from "./src/ai-chatbot/CatalogPageControls";
  ` },
});
const module = { exports: {} as Record<string, unknown> };
vm.runInNewContext(bundle.outputFiles[0].text, { require, module, exports: module.exports, setTimeout, clearTimeout });
const ui = module.exports;
function render(language: string, value: AnswerPresentation, paging = page): string {
  return renderToStaticMarkup(React.createElement(ui.Provider, { language, customTranslations: catalogs },
    React.createElement("p", { "data-answer": true }, "Magyar válasz változatlanul."),
    React.createElement(ui.View, { presentation: value, locale: "hu-HU" }),
    React.createElement(ui.Controls, { page: paging, labels: pageLabels, onNavigate: () => {} })));
}

test("all native layouts use the shared UI catalog without translating source data or stored envelopes", () => {
  for (const schema of [1, 2] as const) for (const layout of ["cards", "compact-list", "carousel", ...(schema === 2 ? ["comparison" as const] : [])] as const) {
    const value = presentation(schema, layout);
    const original = JSON.stringify(value);
    const html = render("en", value);
    for (const text of ["Catalog EN", "Price EN", "View EN", "Source product", "Source description", "Dawn", "HUF 699.95", "Untranslated authored label", "Magyar válasz változatlanul."]) assert.ok(html.includes(text), `${schema}/${layout}: ${text}`);
    assert.match(html, /href="https:\/\/example.com\/product"/);
    assert.doesNotMatch(html, /DO NOT TRANSLATE|invalid\.example/);
    if (layout !== "compact-list") assert.match(html, /alt="Source alt"/);
    assert.ok(html.includes(schema === 2 ? "Unknown EN" : "Not reported"), "only typed, authored status labels may be translated; legacy string values are source data");
    assert.equal(JSON.stringify(value), original);
  }
});

test("persisted card and pager labels follow UI language, not the answer envelope locale", () => {
  const value = JSON.parse(JSON.stringify(presentation(2, "carousel")));
  const original = JSON.stringify(value);
  const english = render("en-GB", value);
  assert.match(english, /Catalog EN/);
  assert.match(english, /aria-label="Next EN"/);
  assert.match(english, /3 of EN 10/);
  assert.match(english, /More EN/);
  const hungarian = render("hu", value);
  for (const text of ["Katalógus HU", "Megtekintés HU", "Nem közölt HU", "Következő HU", "Továbbiak HU", "Magyar válasz változatlanul."]) assert.ok(hungarian.includes(text), text);
  assert.doesNotMatch(hungarian, /Catalog EN|Next EN/);
  assert.equal(JSON.stringify(value), original);
  const expired = render("hu", value, { ...page, expiresAt: 1 });
  assert.match(expired, /Lejárt HU/);
  assert.equal(page.nextHandle, "n".repeat(43));
});

test("translation collisions never bypass the comparison's raw label and type conflict checks", () => {
  const value = presentation(2, "comparison");
  const group = value.groups[0]!;
  group.entities.push({ ...group.entities[0]!, ref: "other", entityId: "other",
    attributes: [{ ...group.entities[0]!.attributes[0]!, label: "Different source meaning" }] });
  const html = renderToStaticMarkup(React.createElement(ui.Provider, { language: "en", customTranslations: {
    en: { Price: "Same translated label", "Different source meaning": "Same translated label" },
  } }, React.createElement(ui.View, { presentation: value })));
  assert.doesNotMatch(html, /Same translated label/, "conflicting source rows stay excluded even when their translated labels coincide");
});

test("real browser switches saved card and paging labels with UI language while prose, values and opaque actions stay unchanged", {
  skip: !process.env.WPSUITE_BROWSER_EXECUTABLE || !process.env.WPSUITE_BROWSER_DRIVER_PATH,
}, async () => {
  const driver = require(process.env.WPSUITE_BROWSER_DRIVER_PATH!);
  const browser = await (driver.chromium ?? driver).launch({ executablePath: process.env.WPSUITE_BROWSER_EXECUTABLE!, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const value = JSON.parse(JSON.stringify(presentation(2, "carousel")));
    const browserPage = { ...page, pageSize: 5, returnedCount: 5 };
    const built = await require("esbuild").build({ write: false, bundle: true, platform: "browser", format: "iife",
      stdin: { resolveDir: new URL("../", import.meta.url).pathname, loader: "tsx", contents: `
        import React, { useState } from "react";
        import { createRoot } from "react-dom/client";
        import { AiKitLocaleProvider } from "./src/locale";
        import { AnswerPresentationView } from "./src/ai-chatbot/AnswerPresentation";
        import { CatalogPageControls } from "./src/ai-chatbot/CatalogPageControls";
        const saved = ${JSON.stringify(value)};
        window.savedEnvelope = saved;
        function App() {
          const [language, setLanguage] = useState("en");
          return <AiKitLocaleProvider language={language} customTranslations={${JSON.stringify(catalogs)}}>
            <button id="use-hu" onClick={() => setLanguage("hu")}>HU</button>
            <button id="use-en" onClick={() => setLanguage("en")}>EN</button>
            <p id="answer-prose">Magyar válasz változatlanul.</p>
            <AnswerPresentationView presentation={saved} locale="hu-HU" />
            <CatalogPageControls page={${JSON.stringify(browserPage)}} labels={${JSON.stringify(pageLabels)}}
              onNavigate={(handle, label) => { window.lastCatalogAction = { handle, label }; }} />
          </AiKitLocaleProvider>;
        }
        createRoot(document.getElementById("root")).render(<App />);
      ` },
    });
    const tab = await browser.newPage();
    await tab.setContent('<div id="root"></div>');
    await tab.addScriptTag({ content: built.outputFiles[0].text });
    await tab.waitForFunction(() => document.querySelector("h3")?.textContent === "Catalog EN");
    assert.equal(await tab.$eval("#answer-prose", (node: HTMLElement) => node.textContent), "Magyar válasz változatlanul.");
    await tab.$eval(".ai-catalog-page-actions button:last-child", (button: HTMLButtonElement) => button.click());
    assert.deepEqual(await tab.evaluate(() => (window as unknown as { lastCatalogAction: unknown }).lastCatalogAction), {
      handle: page.nextHandle, label: "Next EN",
    });
    await tab.click("#use-hu");
    await tab.waitForFunction(() => document.querySelector("h3")?.textContent === "Katalógus HU");
    assert.equal(await tab.$eval(".ai-catalog-page-actions button:last-child", (button: HTMLButtonElement) => button.textContent), "Következő HU");
    assert.equal(await tab.$eval(".ai-answer-carousel-controls button:last-child", (button: HTMLButtonElement) => button.getAttribute("aria-label")), "Következő HU");
    await tab.$eval(".ai-catalog-page-actions button:first-child", (button: HTMLButtonElement) => button.click());
    assert.deepEqual(await tab.evaluate(() => (window as unknown as { lastCatalogAction: unknown }).lastCatalogAction), {
      handle: page.previousHandle, label: "Előző HU",
    });
    assert.equal(await tab.evaluate(() => JSON.stringify((window as unknown as { savedEnvelope: unknown }).savedEnvelope)), JSON.stringify(value));
    assert.equal(await tab.$eval("#answer-prose", (node: HTMLElement) => node.textContent), "Magyar válasz változatlanul.");
    assert.ok((await tab.$eval(".ai-answer-presentation", (node: HTMLElement) => node.textContent))?.includes("HUF 699.95"));
    await tab.click("#use-en");
    await tab.waitForFunction(() => document.querySelector("h3")?.textContent === "Catalog EN");
    assert.doesNotMatch(await tab.$eval("body", (node: HTMLElement) => node.textContent ?? ""), /DO NOT TRANSLATE/);
  } finally { await browser.close(); }
});
