import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);

async function render(markdown: string) {
  const source = await readFile(new URL("../src/ai-chatbot/ChatMarkdownImage.tsx", import.meta.url), "utf8");
  const transformed = await require("esbuild").transform(source, { loader: "tsx", format: "cjs", jsx: "automatic" });
  const module = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(transformed.code, { module, exports: module.exports, require });
  const React = require("react");
  const ReactMarkdown = (await import("react-markdown")).default;
  return require("react-dom/server").renderToStaticMarkup(React.createElement(require("@mantine/core").MantineProvider, {},
    React.createElement(ReactMarkdown, { components: { img: module.exports.ChatMarkdownImage, a: module.exports.ChatMarkdownLink } }, markdown)));
}

test("Markdown images retain safe URL handling, lazy loading and authored alt text at every nesting depth", async () => {
  const html = await render("1. ![Authored product image](https://images.example/product.jpg \"Source title\")");
  assert.match(html, /<li><button[^>]*aria-label="Enlarge image: Authored product image"/);
  assert.match(html, /class="ai-chat-markdown-image" src="https:\/\/images.example\/product.jpg" alt="Authored product image" title="Source title" loading="lazy" decoding="async"/);
  assert.doesNotMatch(html, /srcSet|srcset|node=/);
  for (const unsafe of ["javascript:alert%281%29", "data:image/png;base64,aGVsbG8=", "vbscript:msgbox%281%29"]) {
    const rejected = await render(`![Unsafe image](${unsafe})`);
    assert.doesNotMatch(rejected, /<img|<button|javascript:|data:image|vbscript:/);
    assert.match(rejected, /class="ai-chat-image-unavailable"/);
  }
});

test("linked Markdown images do not nest interactive buttons in anchors, ordinary links stay links", async () => {
  const html = await render("[![Product](https://images.example/product.jpg)](https://shop.example/product)\n\n[Product details](https://shop.example/product)");
  assert.match(html, /<span class="ai-chat-linked-image"><button/);
  assert.doesNotMatch(html, /<a[^>]*><button/);
  assert.match(html, /<a href="https:\/\/shop.example\/product">Product details<\/a>/);
});

test("chat renderer wires bounded images and exposes authored preview labels with the existing modal accessibility", async () => {
  const source = await readFile(new URL("../src/ai-chatbot/ChatMarkdownImage.tsx", import.meta.url), "utf8");
  const integration = await readFile(new URL("../src/ai-chatbot/AiChatbot.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles/ai-kit-ui.css", import.meta.url), "utf8");
  assert.match(integration, /img: ChatMarkdownImage, a: ChatMarkdownLink/);
  assert.match(source, /trapFocus returnFocus=\{false\} closeOnEscape=\{false\} closeOnClickOutside lockScroll/);
  assert.match(source, /onExitTransitionEnd=\{\(\) => trigger.current\?\.focus\(\{ preventScroll: true \}\)\}/);
  assert.match(source, /data-mantine-stop-propagation/);
  assert.match(source, /ChatMarkdownImageLabelsContext = createContext/);
  assert.match(source, /onError=\{fail\}/);
  assert.match(css, /\.ai-chat-bubble img\.ai-chat-markdown-image\s*\{[^}]*max-width: 100%;[^}]*max-height: 16rem;[^}]*object-fit: contain;/);
  assert.match(css, /\.ai-chat-image-modal\s*\{[^}]*max-width: calc\(100vw - 2rem\);[^}]*max-height: calc\(100dvh - 2rem\);[^}]*overflow: hidden;/);
});

test("real browser contains portrait and landscape images and restores focus after all lightbox close paths", {
  skip: !process.env.WPSUITE_BROWSER_EXECUTABLE || !process.env.WPSUITE_BROWSER_DRIVER_PATH,
}, async () => {
  const driver = require(process.env.WPSUITE_BROWSER_DRIVER_PATH!);
  const playwright = !!driver.chromium;
  const browser = await (driver.chromium ?? driver).launch({ executablePath: process.env.WPSUITE_BROWSER_EXECUTABLE!, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const bundle = await require("esbuild").build({ write: false, bundle: true, platform: "browser", format: "iife",
      stdin: { resolveDir: new URL("../", import.meta.url).pathname, loader: "tsx", contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { MantineProvider, Modal } from "@mantine/core";
        import ReactMarkdown from "react-markdown";
        import { ChatMarkdownImage, ChatMarkdownLink } from "./src/ai-chatbot/ChatMarkdownImage";
        createRoot(document.getElementById("root")).render(<MantineProvider><Modal.Root opened onClose={() => { document.body.dataset.outerClosed = "true"; }}><div className="ai-chat-bubble" style={{width:"min(100%, 400px)",transform:"translateZ(0)",overflow:"hidden"}}>
          <button id="outside">Outside preview</button>
          <ReactMarkdown components={{img:ChatMarkdownImage,a:ChatMarkdownLink}}>{${JSON.stringify("1. **Portrait title** Price: HUF 949.95\n[![Portrait product](https://fixture.example/portrait.svg)](https://fixture.example/page)\n[Portrait details](https://fixture.example/portrait-page)\n\nA separate loose list follows.\n\n1. **Landscape title** Price: HUF 699.95\n\n   ![Landscape product](https://fixture.example/landscape.svg)\n\n   [Landscape details](https://fixture.example/landscape-page)\n\n2. ![Broken product](https://fixture.example/broken.svg)")}}</ReactMarkdown>
        </div></Modal.Root></MantineProvider>);
      ` } });
    const css = await readFile(new URL("../src/styles/ai-kit-ui.css", import.meta.url), "utf8");
    const mantineCss = await readFile(require.resolve("@mantine/core/styles.css"), "utf8");
    const page = await browser.newPage();
    const response = (url: string) => ({ status: url.endsWith("broken.svg") ? 404 : 200, contentType: "image/svg+xml",
      body: url.endsWith("broken.svg") ? "Image unavailable" : `<svg xmlns="http://www.w3.org/2000/svg" width="${url.endsWith("portrait.svg") ? 1200 : 4400}" height="${url.endsWith("portrait.svg") ? 3000 : 700}"><rect width="100%" height="100%" fill="purple"/></svg>` });
    if (playwright) await page.route("**/*", (route: { request: () => { url: () => string }; fulfill: (value: unknown) => void }) => route.fulfill(response(route.request().url())));
    else {
      await page.setRequestInterception(true);
      page.on("request", (request: { url: () => string; respond: (value: unknown) => void }) => request.respond(response(request.url())));
    }
    const viewport = (size: { width: number; height: number }) => playwright ? page.setViewportSize(size) : page.setViewport(size);
    await page.setContent(`<style>${mantineCss}\n${css}\nbody{margin:0}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`);
    await page.waitForSelector(".ai-chat-image-trigger");
    await page.$$eval("img", (images: HTMLImageElement[]) => images.forEach(image => { image.loading = "eager"; }));
    await page.waitForSelector(".ai-chat-image-unavailable");
    for (const size of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
      await viewport(size);
      const preview = await page.$$eval(".ai-chat-markdown-image", (images: HTMLImageElement[]) => images.map(image => ({
        width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height, naturalWidth: image.naturalWidth,
      })));
      assert.equal(preview.length, 2);
      assert.ok(preview.every((image: { width: number; height: number; naturalWidth: number }) => image.width <= Math.min(size.width, 400) && image.height <= 256 && image.naturalWidth > 1000));
      assert.equal(await page.$eval("html", (node: HTMLElement) => node.scrollWidth <= node.clientWidth), true);
      const order = await page.$$eval(".ai-chat-bubble li", (items: HTMLElement[]) => items.slice(0, 2).map(item => {
        const image = item.querySelector("img")!.getBoundingClientRect();
        const title = item.querySelector("strong")!.getBoundingClientRect();
        const link = item.querySelector("a")!.getBoundingClientRect();
        const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
        let text: Node | null = walker.nextNode();
        while (text && !text.textContent?.includes("Price:")) text = walker.nextNode();
        const range = document.createRange();
        if (text) range.selectNodeContents(text);
        return { titleBottom: title.bottom, imageTop: image.top, imageBottom: image.bottom, linkTop: link.top,
          priceBottom: text ? range.getBoundingClientRect().bottom : null,
          triggerDisplay: getComputedStyle(item.querySelector("button")!).display,
          titleParent: item.querySelector("strong")!.parentElement!.tagName };
      }));
      assert.equal(order.length, 2);
      assert.deepEqual(order.map(item => item.titleParent), ["LI", "P"], "exercise both tight and loose Markdown list structures");
      for (const item of order) {
        assert.equal(item.triggerDisplay, "block");
        assert.ok(item.titleBottom <= item.imageTop, "tight and loose list titles precede images, not vertically centered beside them");
        assert.notEqual(item.priceBottom, null);
        assert.ok(item.priceBottom! <= item.imageTop, "price text remains above its image");
        assert.ok(item.linkTop >= item.imageBottom, "destination links follow their images on a new line");
      }
      await page.click(".ai-chat-image-trigger");
      await page.waitForSelector('[role="dialog"]');
      const enlarged = await page.$eval(".ai-chat-image-dismiss img", (image: HTMLImageElement) => {
        const rect = image.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      });
      assert.ok(enlarged.left >= 0 && enlarged.top >= 0 && enlarged.right <= size.width && enlarged.bottom <= size.height);
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Tab");
        assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), true, "Tab is trapped in preview");
      }
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
      assert.equal(await page.evaluate(() => document.body.dataset.outerClosed), undefined,
        "Escape closes only the preview, not the containing chatbot modal");
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("ai-chat-image-trigger")), true);
      await page.click(".ai-chat-image-trigger");
      await page.waitForSelector(".ai-chat-image-dismiss");
      await page.click(".ai-chat-image-dismiss");
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
      await page.click(".ai-chat-image-trigger");
      await page.waitForSelector('[role="dialog"]');
      await page.mouse.click(2, 2);
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    }
  } finally { await browser.close(); }
});
