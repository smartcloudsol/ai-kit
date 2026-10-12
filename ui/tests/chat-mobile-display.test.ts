import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const markdown = "| Attribute | Very Long Verified Catalog Item Alpha | Another Long Verified Catalog Item Beta | A Third Verified Catalog Item Gamma |\n| --- | --- | --- | --- |\n| Detail | Verified description | Another verified description | Final verified description |";

async function componentsSource() {
  const source = await readFile(new URL("../src/ai-chatbot/AiChatbot.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function ChatMarkdownTable(");
  const end = source.indexOf("const CHAT_MARKDOWN_COMPONENTS", start);
  assert.ok(start > 0 && end > start);
  return source.slice(start, end);
}

test("Markdown tables use a native focusable scroll rail and preserve table semantics", async () => {
  const transformed = await require("esbuild").transform(`${await componentsSource()}\nexports.Table = ChatMarkdownTable;`,
    { loader: "tsx", format: "cjs", jsx: "automatic" });
  const module = { exports: {} as { Table: unknown } };
  vm.runInNewContext(transformed.code, { module, exports: module.exports, require });
  const React = require("react");
  const ReactMarkdown = (await import("react-markdown")).default;
  const remarkGfm = (await import("remark-gfm")).default;
  const html = require("react-dom/server").renderToStaticMarkup(React.createElement(ReactMarkdown,
    { remarkPlugins: [remarkGfm], components: { table: module.exports.Table } }, markdown));
  assert.match(html, /class="ai-chat-table-scroll" tabindex="0" role="region" aria-label="Attribute Very Long Verified Catalog Item Alpha Another Long Verified Catalog Item Beta A Third Verified Catalog Item Gamma"><table>/);
  assert.match(html, /<thead>/);
  assert.match(html, /<th>Very Long Verified Catalog Item Alpha<\/th>/);
  assert.doesNotMatch(html, /node="|role="presentation"/);
});

test("composer uses bounded responsive autosizing and retains its authored accessible label", async () => {
  const source = await componentsSource();
  assert.match(source, /useMediaQuery\("\(max-width: 600px\)", false\)/);
  assert.match(source, /!mobile \|\| focused \|\| String\(props.value \?\? ""\).length > 0/);
  assert.match(source, /autosize minRows=\{expanded \? 3 : 1\} maxRows=\{6\}/);
  const integration = await readFile(new URL("../src/ai-chatbot/AiChatbot.tsx", import.meta.url), "utf8");
  assert.match(integration, /aria-label=\{textareaPlaceholder\}/);
  assert.match(integration, /components=\{CHAT_MARKDOWN_COMPONENTS\}/);
  assert.match(integration, /data-ai-kit-ai-disclosure/);
});

test("real browser keeps comparisons scrollable and mobile composer compact without losing drafts or clicks", {
  skip: !process.env.WPSUITE_BROWSER_EXECUTABLE || !process.env.WPSUITE_BROWSER_DRIVER_PATH,
}, async () => {
  const driver = require(process.env.WPSUITE_BROWSER_DRIVER_PATH!);
  const playwright = !!driver.chromium;
  const browser = await (driver.chromium ?? driver).launch({ executablePath: process.env.WPSUITE_BROWSER_EXECUTABLE!, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const bundle = await require("esbuild").build({ write: false, bundle: true, platform: "browser", format: "iife",
      stdin: { resolveDir: new URL("../", import.meta.url).pathname, loader: "tsx", contents: `
        import React, { useState } from "react";
        import { createRoot } from "react-dom/client";
        import { MantineProvider, Textarea } from "@mantine/core";
        import { useMediaQuery } from "@mantine/hooks";
        import ReactMarkdown from "react-markdown";
        import remarkGfm from "remark-gfm";
        ${await componentsSource()}
        function App() {
          const [value, setValue] = useState("");
          const [sent, setSent] = useState("");
          const ref = React.useRef(null);
          return <MantineProvider><div className="ai-chat-container" style={{ width: "100%", height: "100%", maxWidth: "100%" }}>
            <div className="ai-chat-container-internal">
              <div className="ai-chat-header-bar">Authored assistant title</div>
              <div className="ai-chat-scroll"><div className="ai-chat-bubble">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{table: ChatMarkdownTable}}>{${JSON.stringify(markdown)}}</ReactMarkdown>
              </div></div>
              <div data-ai-kit-ai-disclosure>Unchanged authored AI disclosure</div>
              <div className="ai-box ai-box-open"><ChatComposerInput inputRef={ref} value={value} className="ai-message"
                aria-label="Authored message label" placeholder="Authored placeholder" onChange={event => setValue(event.target.value)} />
                <button id="send" onClick={() => { setSent(value); setValue(""); }}>Authored send</button>
                <output id="sent">{sent}</output>
              </div>
            </div>
          </div></MantineProvider>;
        }
        createRoot(document.getElementById("root")).render(<App />);
      ` } });
    const css = await readFile(new URL("../src/styles/ai-kit-ui.css", import.meta.url), "utf8");
    const mantineCss = await readFile(require.resolve("@mantine/core/styles.css"), "utf8");
    const page = await browser.newPage();
    if (playwright) await page.route("**/*", (route: { abort: () => void }) => route.abort());
    else {
      await page.setRequestInterception(true);
      page.on("request", (request: { abort: () => void }) => request.abort());
    }
    const viewport = (size: { width: number; height: number }) => playwright ? page.setViewportSize(size) : page.setViewport(size);
    const waitHeight = (predicate: (idle: number) => boolean, idle: number) =>
      playwright ? page.waitForFunction(predicate, idle) : page.waitForFunction(predicate, {}, idle);
    await viewport({ width: 360, height: 700 });
    await page.setContent(`<style>${mantineCss}\n${css}\nbody {margin:0} .ai-chat-container {--ai-kit-space-1:4px;--ai-kit-space-2:8px;--ai-kit-space-3:12px;--ai-kit-space-4:16px}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`);
    await page.waitForSelector("textarea");
    const inputHeight = () => page.$eval("textarea", (input: HTMLTextAreaElement) => input.getBoundingClientRect().height);
    await page.waitForFunction(() => document.querySelector("textarea")!.getBoundingClientRect().height < 60);
    const idleHeight = await inputHeight();
    const tableMetrics = await page.evaluate(() => {
      const rail = document.querySelector<HTMLElement>(".ai-chat-table-scroll")!;
      const cell = rail.querySelector("th")!;
      return { width: rail.clientWidth, scroll: rail.scrollWidth, focusable: rail.tabIndex,
        wordBreak: getComputedStyle(cell).wordBreak, cellWidth: cell.getBoundingClientRect().width,
        documentWidth: document.documentElement.clientWidth, documentScroll: document.documentElement.scrollWidth };
    });
    assert.ok(tableMetrics.scroll > tableMetrics.width, "comparison scrolls within its own rail");
    assert.ok(tableMetrics.cellWidth >= 160, "long names have usable column width");
    assert.equal(tableMetrics.wordBreak, "normal");
    assert.equal(tableMetrics.focusable, 0);
    assert.ok(tableMetrics.documentScroll <= tableMetrics.documentWidth + 1, "document has no horizontal overflow");
    await page.focus(".ai-chat-table-scroll");
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.querySelector(".ai-chat-table-scroll")!.scrollLeft > 0);
    await page.focus("textarea");
    await waitHeight((idle: number) => document.querySelector("textarea")!.getBoundingClientRect().height > idle + 20, idleHeight);
    await page.type("textarea", "Keep this draft");
    await page.focus("#send");
    assert.ok(await inputHeight() > idleHeight + 20, "draft remains expanded after blur");
    await page.click("#send");
    assert.equal(await page.$eval("#sent", (node: HTMLElement) => node.textContent), "Keep this draft");
    await waitHeight((idle: number) => document.querySelector("textarea")!.getBoundingClientRect().height <= idle + 1, idleHeight);
    await viewport({ width: 1000, height: 700 });
    await waitHeight((idle: number) => document.querySelector("textarea")!.getBoundingClientRect().height > idle + 20, idleHeight);
    await page.focus("textarea");
    await page.type("textarea", "line\n".repeat(40));
    await viewport({ width: 360, height: 450 });
    await page.waitForFunction(() => document.querySelector("textarea")!.getBoundingClientRect().height <= 115);
    const bounded = await page.$eval("textarea", (input: HTMLTextAreaElement) => ({ value: input.value,
      height: input.getBoundingClientRect().height, scrollHeight: input.scrollHeight, clientHeight: input.clientHeight }));
    assert.ok(bounded.value.length > 150, "resize preserves draft text");
    assert.ok(bounded.scrollHeight > bounded.clientHeight, "long draft scrolls rather than consuming the message rail");
    assert.equal(await page.$eval("[data-ai-kit-ai-disclosure]", (node: HTMLElement) => node.textContent), "Unchanged authored AI disclosure");
  } finally { await browser.close(); }
});
