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

test("composer uses focus containment at every size and retains accessible authored actions", async () => {
  const source = await componentsSource();
  assert.doesNotMatch(source, /useMediaQuery|String\(props.value/);
  assert.match(source, /event.currentTarget.contains\(event.relatedTarget as Node \| null\)/);
  assert.match(source, /autosize minRows=\{expanded \? 3 : 1\} maxRows=\{expanded \? 6 : 1\}/);
  const integration = await readFile(new URL("../src/ai-chatbot/AiChatbot.tsx", import.meta.url), "utf8");
  assert.match(integration, /aria-label=\{textareaPlaceholder\}/);
  assert.match(integration, /components=\{CHAT_MARKDOWN_COMPONENTS\}/);
  assert.match(integration, /data-ai-kit-ai-disclosure/);
  assert.match(integration, /aria-label=\{sendOrCancelLabel\}/);
  assert.match(integration, /aria-label=\{I18n.get\(labels.resetLabel\)\}/);
  assert.match(integration, /expanded=\{composerExpanded\}/);
  assert.ok(integration.indexOf('className="ai-composer-send-actions"') <
    integration.indexOf('className="ai-composer-reset-actions"'), "tab order matches the compact visual order");
});

test("composer Enter sends only outside IME composition and Shift-Enter retains multiline editing", async () => {
  const source = await readFile(new URL("../src/ai-chatbot/AiChatbot.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const handleQuestionKeyDown = useCallback(");
  const end = source.indexOf("const handleOpenClick", start);
  const transformed = await require("esbuild").transform(`${source.slice(start, end)}\nexports.keyDown = handleQuestionKeyDown;`,
    { loader: "tsx", format: "cjs" });
  let sends = 0;
  let prevented = 0;
  const module = { exports: {} as { keyDown: (event: unknown) => void } };
  vm.runInNewContext(transformed.code, { module, exports: module.exports,
    useCallback: (callback: unknown) => callback, ask: () => { sends++; }, canSend: true });
  const event = { key: "Enter", shiftKey: false, keyCode: 13, nativeEvent: { isComposing: false },
    preventDefault: () => { prevented++; } };
  module.exports.keyDown({ ...event, nativeEvent: { isComposing: true } });
  module.exports.keyDown({ ...event, keyCode: 229 });
  module.exports.keyDown({ ...event, shiftKey: true });
  assert.equal(sends, 0);
  assert.equal(prevented, 0);
  module.exports.keyDown(event);
  assert.equal(sends, 1);
  assert.equal(prevented, 1);
});

test("accepted submission releases only its own still-focused composer control", async () => {
  const transformed = await require("esbuild").transform(`${await componentsSource()}\nexports.release = releaseSubmittedComposerFocus;`,
    { loader: "tsx", format: "cjs", jsx: "automatic" });
  const module = { exports: {} as { release: (composer: unknown, active: unknown) => void } };
  vm.runInNewContext(transformed.code, { module, exports: module.exports, require });
  let blurs = 0;
  const input = { blur: () => { blurs++; } };
  const send = { blur: () => { blurs++; } };
  const outside = { blur: () => { throw new Error("unrelated focus must be preserved"); } };
  const composer = { contains: (node: unknown) => node === input || node === send,
    ownerDocument: { activeElement: input as unknown } };
  module.exports.release(composer, input);
  composer.ownerDocument.activeElement = send;
  module.exports.release(composer, send);
  assert.equal(blurs, 2, "both Enter and send-button submission can collapse");
  composer.ownerDocument.activeElement = outside;
  module.exports.release(composer, input);
  module.exports.release(composer, outside);
  composer.ownerDocument.activeElement = send;
  module.exports.release(composer, input);
  module.exports.release(null, input);
  assert.equal(blurs, 2, "attachment preparation must not steal newly moved focus");
  const source = await readFile(new URL("../src/ai-chatbot/AiChatbot.tsx", import.meta.url), "utf8");
  const ask = source.slice(source.indexOf("const ask = useCallback("), source.indexOf("const handleQuestionKeyDown"));
  assert.ok(ask.indexOf("releaseSubmittedComposerFocus(") > ask.indexOf("userAttachments = await buildUserAttachments"));
  assert.doesNotMatch(ask, /questionInputRef.current(?:\?\.|\.)focus\(/,
    "completion, failure and cancellation must not reopen the composer or steal focus");
});

test("real browser keeps comparisons scrollable and all-size composer compact without losing drafts or clicks", {
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
        import { MantineProvider, Stack, Button, Group, Textarea } from "@mantine/core";
        import ReactMarkdown from "react-markdown";
        import remarkGfm from "remark-gfm";
        ${await componentsSource()}
        function App() {
          const [value, setValue] = useState("");
          const [sent, setSent] = useState("");
          const ref = React.useRef(null);
          const composerRef = React.useRef(null);
          const send = () => {
            if (!value.trim()) return;
            releaseSubmittedComposerFocus(composerRef.current, document.activeElement);
            setSent(value); setValue("");
          };
          return <MantineProvider><div className="ai-chat-container" style={{ width: "100%", height: "100%", maxWidth: "100%" }}>
            <div className="ai-chat-container-internal">
              <div className="ai-chat-header-bar">Authored assistant title</div>
              <div className="ai-chat-scroll"><div className="ai-chat-bubble">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{table: ChatMarkdownTable}}>{${JSON.stringify(markdown)}}</ReactMarkdown>
                <details id="references"><summary>References</summary>Verified source</details>
              </div></div>
              <div data-ai-kit-ai-disclosure>Unchanged authored AI disclosure</div>
              <ChatComposer composerRef={composerRef}>{expanded => <>
                <Group className="ai-composer-field"><ChatComposerInput inputRef={ref} expanded={expanded} value={value} className="ai-message"
                  aria-label="Authored message label" placeholder="Authored placeholder" onChange={event => setValue(event.target.value)}
                  onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} /></Group>
                <Group className="ai-actions" justify="space-between">
                  <Group className="ai-composer-send-actions"><Button id="send" className="ai-composer-send" leftSection={<span>→</span>}
                    onPointerDown={event => { if (!expanded) event.preventDefault(); }}
                    aria-label="Authored send" title="Authored send" onClick={send}>
                    <span className="ai-composer-action-label">Authored send</span></Button></Group>
                  <Group className="ai-composer-reset-actions"><Button id="reset" className="ai-composer-reset" leftSection={<span>×</span>}
                    onPointerDown={event => { if (!expanded) event.preventDefault(); }}
                    aria-label="Authored reset" title="Authored reset" onClick={() => setValue("")}>
                    <span className="ai-composer-action-label">Authored reset</span></Button></Group>
                </Group>
              </>}</ChatComposer>
              <output id="sent">{sent}</output>
              <button id="outside">Outside composer</button>
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
    const compactMetrics = await page.evaluate(() => {
      const input = document.querySelector("textarea")!.getBoundingClientRect();
      const send = document.querySelector("#send")!.getBoundingClientRect();
      const reset = document.querySelector("#reset")!.getBoundingClientRect();
      return { inputRight: input.right, sendLeft: send.left, sendRight: send.right, resetLeft: reset.left,
        sendWidth: send.width, sendHeight: send.height, resetWidth: reset.width,
        labelDisplay: getComputedStyle(document.querySelector("#send .ai-composer-action-label")!).display };
    });
    assert.ok(compactMetrics.inputRight <= compactMetrics.sendLeft, "send is immediately after the input");
    assert.ok(compactMetrics.sendRight <= compactMetrics.resetLeft, "reset follows send");
    assert.equal(compactMetrics.sendWidth, 44);
    assert.equal(compactMetrics.sendHeight, 44);
    assert.equal(compactMetrics.resetWidth, 44);
    assert.equal(compactMetrics.labelDisplay, "none");
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
    assert.ok(await inputHeight() > idleHeight + 20, "focus within actions retains the editor before clicking");
    await page.click("#send");
    assert.equal(await page.$eval("#sent", (node: HTMLElement) => node.textContent), "Keep this draft");
    await waitHeight((idle: number) => document.querySelector("textarea")!.getBoundingClientRect().height <= idle + 1, idleHeight);
    assert.equal(await page.evaluate(() => document.querySelector(".ai-composer")!.contains(document.activeElement)), false);
    await page.click("#references summary");
    assert.equal(await page.$eval("#references", (node: HTMLDetailsElement) => node.open), true,
      "the first reference click opens it without a late composer layout shift");
    await viewport({ width: 1000, height: 700 });
    await waitHeight((idle: number) => document.querySelector("textarea")!.getBoundingClientRect().height <= idle + 1, idleHeight);
    await page.focus("textarea");
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), "TEXTAREA", "empty Enter preserves editing focus");
    await page.type("textarea", "Keyboard submission");
    await page.keyboard.press("Enter");
    await waitHeight((idle: number) => document.querySelector("textarea")!.getBoundingClientRect().height <= idle + 1, idleHeight);
    assert.equal(await page.$eval("#sent", (node: HTMLElement) => node.textContent), "Keyboard submission");
    assert.equal(await page.evaluate(() => document.querySelector(".ai-composer")!.contains(document.activeElement)), false);
    await page.focus("textarea");
    await page.type("textarea", "Send a collapsed draft");
    await page.focus("#outside");
    await waitHeight((idle: number) => document.querySelector("textarea")!.getBoundingClientRect().height <= idle + 1, idleHeight);
    await page.click("#send");
    assert.equal(await page.$eval("#sent", (node: HTMLElement) => node.textContent), "Send a collapsed draft",
      "pointer focus does not relocate the compact send button before its click");
    await page.focus("textarea");
    await page.keyboard.down("Shift");
    await page.type("textarea", "line\n".repeat(40));
    await page.keyboard.up("Shift");
    await viewport({ width: 360, height: 450 });
    await page.waitForFunction(() => document.querySelector("textarea")!.getBoundingClientRect().height <= 115);
    const bounded = await page.$eval("textarea", (input: HTMLTextAreaElement) => ({ value: input.value,
      height: input.getBoundingClientRect().height, scrollHeight: input.scrollHeight, clientHeight: input.clientHeight }));
    assert.ok(bounded.value.length > 150, "resize preserves draft text");
    assert.ok(bounded.scrollHeight > bounded.clientHeight, "long draft scrolls rather than consuming the message rail");
    await page.focus("#outside");
    await waitHeight((idle: number) => document.querySelector("textarea")!.getBoundingClientRect().height <= idle + 1, idleHeight);
    assert.equal(await page.$eval("textarea", (input: HTMLTextAreaElement) => input.value), bounded.value,
      "collapsing a multiline draft never clears it");
    await viewport({ width: 1000, height: 700 });
    await page.focus("textarea");
    await waitHeight((idle: number) => document.querySelector("textarea")!.getBoundingClientRect().height > idle + 20, idleHeight);
    await page.focus("#reset");
    await page.click("#reset");
    assert.equal(await page.$eval("textarea", (input: HTMLTextAreaElement) => input.value), "");
    assert.equal(await page.$eval("[data-ai-kit-ai-disclosure]", (node: HTMLElement) => node.textContent), "Unchanged authored AI disclosure");
  } finally { await browser.close(); }
});
