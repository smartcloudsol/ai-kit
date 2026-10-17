import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const coreSource = await readFile(new URL("../../core/src/catalog-page.ts", import.meta.url), "utf8");
const coreModule = { exports: {} as Record<string, unknown> };
const coreCode = await require("esbuild").transform(coreSource, { loader: "ts", format: "cjs" });
vm.runInNewContext(coreCode.code, { module: coreModule, exports: coreModule.exports });

async function load(file: string) {
  const source = await readFile(new URL(`../src/ai-chatbot/${file}`, import.meta.url), "utf8");
  const transformed = await require("esbuild").transform(source, { loader: file.endsWith("tsx") ? "tsx" : "ts", format: "cjs", jsx: "automatic" });
  const module = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(transformed.code, { module, exports: module.exports,
    require: (name: string) => name === "@smart-cloud/ai-kit-core" ? coreModule.exports :
      name === "./activityPresentation.ts" ? {} : name === "./answer-presentation-state.ts" ? { normalizeAnswerPresentation: () => undefined }
      : name === "./visitor-action-state.ts" ? { normalizeVisitorActions: () => undefined, normalizeVisitorActionResult: () => undefined }
      : name === "../locale" ? { useAiKitI18n: () => ({ language: "en", get: (key: string) => key }) } : require(name),
    setTimeout, clearTimeout, setInterval, clearInterval, Date, URL, DOMException, AbortController, WebSocket: { OPEN: 1 },
  });
  return module.exports;
}
const controls = await load("CatalogPageControls.tsx");
const React = require("react");
const labels = { catalogPreviousLabel: "Back batch", catalogNextLabel: "Forward batch", catalogResultsLabel: "Found",
  catalogOfLabel: "out of", catalogMoreAvailableLabel: "Additional results", catalogExpiredLabel: "Search again" };
const handle = "a".repeat(43);
const future = Math.floor(Date.now() / 1000) + 60;
const page = { schemaVersion: 1, pageIndex: 0, pageSize: 4, returnedCount: 4, hasMore: true, nextHandle: handle, expiresAt: future };
const render = (input: unknown, busy = false) => require("react-dom/server").renderToStaticMarkup(
  React.createElement(controls.CatalogPageControls, { page: input, labels, busy, onNavigate: () => {} }));

test("catalog controls distinguish the current page count, an optional source total, and more results", () => {
  const unknown = render(page);
  assert.match(unknown, /Found: 4/);
  assert.match(unknown, /Additional results/);
  assert.doesNotMatch(unknown, /out of/);
  assert.match(unknown, /disabled="">Back batch/);
  assert.match(unknown, /<button type="button">Forward batch/);
  const exact = render({ ...page, pageIndex: 1, previousHandle: "b".repeat(43), totalCount: 25 });
  assert.match(exact, /Found: 4 out of 25/);
  assert.doesNotMatch(exact, /5–8|1–4/,
    "an opaque cursor cannot prove how many items the previous provider page contained");
  const shortPage = render({ ...page, pageIndex: 9, returnedCount: 2 });
  assert.match(shortPage, /Found: 2/);
  assert.doesNotMatch(shortPage, /37|38|out of/,
    "page index and configured page size must not be used to invent global result offsets or totals");
  const empty = render({ ...page, returnedCount: 0, hasMore: false, nextHandle: undefined, totalCount: 0 });
  assert.match(empty, /Found: 0 out of 0/);
  assert.doesNotMatch(empty, /Additional results|1–0/);
});

test("expired and busy controls cannot issue requests, including a delayed browser click", () => {
  const expired = { ...page, expiresAt: 1 };
  const html = render(expired);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.match(html, /Search again/);
  assert.match(render(page, true), /aria-busy="true"/);
  const navigate = controls.catalogPageNavigation as (input: unknown, direction: string, busy: boolean, now?: number) => string | undefined;
  assert.equal(navigate(page, "next", false, (future - 1) * 1000), handle);
  assert.equal(navigate(page, "next", false, future * 1000), undefined);
  assert.equal(navigate(page, "next", true, 0), undefined);
  assert.equal(navigate(page, "previous", false, 0), undefined);
  assert.equal(navigate({ ...page, cursor: "provider-secret", query: "injected" }, "next", false, 0), undefined);
  assert.equal(render({ ...page, nextHandle: "https://attacker.example/cursor" }), "");
});

test("chatbot validates persisted and completed page metadata and keeps retry handles opaque", async () => {
  const source = await readFile(new URL("../src/ai-chatbot/AiChatbot.tsx", import.meta.url), "utf8");
  assert.match(source, /catalogPage: msg\.role === "assistant" \? parseCatalogPage\(msg\.catalogPage\)/);
  assert.match(source, /catalogPage: parseCatalogPage\(res\.metadata\?\.catalogPage\)/);
  assert.match(source, /catalogPage: parseCatalogPage\(result\.metadata\?\.catalogPage\)/);
  assert.match(source, /onNavigate=\{\(handle, label\) => void ask\(label, false, handle\)\}/);
  assert.match(source, /ask\(msg\.retryText, false, msg\.retryCatalogContinuation\)/);
  assert.equal((source.match(/\.\.\.catalogOptions/g) ?? []).length, 2, "HTTP and WS use the same capability-negotiated request fields");
  assert.match(source, /discoverChatPresentationVersion\(\), discoverChatCatalogPageVersion\(\)/);
  assert.match(source, /errorCode === "CATALOG_PAGINATION_UNAVAILABLE"\s*\? labels\.catalogExpiredLabel/,
    "the authored paging message survives useAiRun error normalization");
});

test("HTTP and WS omit catalog fields for legacy backends and reject unsupported continuation before dispatch", async () => {
  const source = await readFile(new URL("../src/ai-chatbot/AiChatbot.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const [presentationVersion, catalogPageVersion] = await Promise.all(");
  const end = source.indexOf("return out;", start) + "return out;".length;
  assert.ok(start > 0 && end > start);
  const transformed = await require("esbuild").transform(`exports.run = async () => { ${source.slice(start, end)} };`, { loader: "tsx", format: "cjs" });
  for (const stream of [false, true]) for (const capability of [undefined, 1]) for (const continuation of [undefined, handle]) {
    const requests: { kind: string; options: Record<string, unknown> }[] = [];
    const module = { exports: {} as { run: () => Promise<unknown> } };
    vm.runInNewContext(transformed.code, { module, exports: module.exports,
      discoverChatPresentationVersion: async () => 2, discoverChatCatalogPageVersion: async () => capability,
      discoverChatVisitorActionVersion: async () => undefined, visitorAction: undefined,
      discoverChatStreamUrl: async () => stream ? "wss://stream.example/chat" : undefined,
      catalogContinuation: continuation, I18n: { language: "en", get: (value: string) => value }, labels: { catalogExpiredLabel: "Authored catalog unavailable" },
      trimmed: "Next batch", selectedAudio: undefined, selectedImages: [], signal: { aborted: false },
      activeSessionId: "session", createMessageId: () => "turn", setStreamTransportState: () => {}, latestStreamView: null,
      onStatus: () => {}, maxTokens: 1024, context: {},
      runChatStreamTurn: async (options: Record<string, unknown>) => {
        requests.push({ kind: "ws", options });
        return { result: "Products", sessionId: "session" };
      },
      sendChatMessage: async (options: Record<string, unknown>) => { requests.push({ kind: "http", options }); return { result: "Products" }; },
    });
    if (continuation && capability !== 1) {
      await assert.rejects(() => module.exports.run(), /Authored catalog unavailable/);
      assert.equal(requests.length, 0, "unsupported paging must never become an ordinary question");
    } else {
      await module.exports.run();
      assert.equal(requests.length, 1);
      assert.equal(requests[0]!.kind, stream ? "ws" : "http");
      const options = requests[0]!.options;
      assert.equal(options.catalogPageVersion, capability);
      assert.equal(Object.hasOwn(options, "catalogPageVersion"), capability === 1);
      assert.equal(options.catalogContinuation, continuation);
      assert.equal(Object.hasOwn(options, "catalogContinuation"), continuation !== undefined);
    }
  }
});

test("transport only sends the opaque continuation on start, never queries, provider cursors or resume", async () => {
  const { runChatStreamTurn } = await load("chatStream.ts") as { runChatStreamTurn: (options: Record<string, unknown>) => Promise<unknown> };
  for (const resume of [false, true]) {
    let command: Record<string, unknown> | undefined;
    const result = await runChatStreamTurn({ url: "wss://stream.example/chat", text: "Forward batch", locale: "en", requestId: "paging-request",
      catalogPageVersion: 1, catalogContinuation: handle, cursor: "not-client-owned", query: "injected", filters: { available: false },
      ...(resume ? { resume: { requestId: "paging-request", conversationId: "session", turnId: "turn", lastSeq: 0 } } : {}),
      signal: new AbortController().signal, onView: () => {},
      ticketProvider: async () => ({ ticket: "ticket", sessionId: "session", expiresAt: "2030-01-01T00:00:00Z" }),
      socketFactory: () => {
        const socket = { readyState: 0, onopen: null as (() => void) | null,
          onmessage: null as ((message: { data: string }) => void) | null, onclose: null as (() => void) | null, onerror: null,
          close() { this.readyState = 3; this.onclose?.(); },
          send(value: string) {
            command = JSON.parse(value);
            queueMicrotask(() => {
              const emit = (type: string, seq: number, payload: unknown) => socket.onmessage?.({ data: JSON.stringify({ version: 1,
                type, seq, eventId: `event-${seq}`, conversationId: "session", turnId: "turn", timestamp: "2026-10-15T00:00:00Z", payload }) });
              if (!resume) emit("turn.accepted", 0, { sessionId: "session", assistantMessageId: "assistant" });
              emit(resume ? "turn.snapshot" : "answer.completed", 1, { result: "Products", metadata: { catalogPage: page },
                active: false, lastSeq: 1, completion: "complete" });
            });
          } };
        queueMicrotask(() => { socket.readyState = 1; socket.onopen?.(); });
        return socket;
      } });
    assert.ok(command);
    assert.equal(command.type, resume ? "turn.resume" : "turn.start");
    assert.equal(command.catalogContinuation, resume ? undefined : handle);
    assert.equal(command.catalogPageVersion, resume ? undefined : 1);
    assert.equal(command.cursor, undefined);
    assert.equal(command.query, undefined);
    assert.equal(command.filters, undefined);
    assert.equal((result as { metadata?: { catalogPage?: { nextHandle: string } } }).metadata?.catalogPage?.nextHandle, handle);
  }
  for (const bad of ["x", "https://attacker.example/cursor", { cursor: handle }]) {
    await assert.rejects(() => runChatStreamTurn({ catalogPageVersion: 1, catalogContinuation: bad,
      signal: new AbortController().signal }), /Invalid catalog continuation/);
  }
  let tickets = 0;
  await assert.rejects(() => runChatStreamTurn({ catalogContinuation: handle, signal: new AbortController().signal,
    ticketProvider: async () => { tickets++; return {}; } }), /Catalog pagination is unavailable/);
  assert.equal(tickets, 0, "unsupported continuation is rejected before any network request");
});

test("real browser themes paging, preserves keyboard and disabled states, and orders cards before paging before references", {
  skip: !process.env.WPSUITE_BROWSER_EXECUTABLE || !process.env.WPSUITE_BROWSER_DRIVER_PATH,
}, async () => {
  const source = await readFile(new URL("../src/ai-chatbot/AiChatbot.tsx", import.meta.url), "utf8");
  const start = source.indexOf('{msg.role === "assistant" && !msg.error && msg.catalogPage && (');
  const end = source.indexOf("\n                    </Stack>", start);
  assert.ok(start > 0 && end > start);
  const footer = source.slice(start, end);
  assert.ok(footer.indexOf("<CatalogPageControls") < footer.indexOf('<details className="ai-citations">'));
  assert.ok(footer.indexOf('<details className="ai-citations">') < footer.indexOf('<Group className="ai-feedback"'));
  const presentation = { schemaVersion: 1, groups: [{ templateId: "catalog-cards", templateRevision: 1, layout: "cards", entities: [{
    ref: "entity-1", entityId: "source-1", title: "Source product", attributes: [], links: [],
    provenance: { kind: "external_rest", sourceId: "source", evidenceId: "evidence-1", checkedAt: "2026-10-15T12:00:00.000Z" },
  }] }] };
  const bundle = await require("esbuild").build({ write: false, bundle: true, platform: "browser", format: "iife",
    stdin: { resolveDir: new URL("../", import.meta.url).pathname, loader: "tsx", contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import ReactMarkdown from "react-markdown";
      import { CatalogPageControls } from "./src/ai-chatbot/CatalogPageControls";
      import { AnswerPresentationView } from "./src/ai-chatbot/AnswerPresentation";
      import { hideVerifiedPresentationDirectives } from "./src/ai-chatbot/presentation-directives";
      const root = createRoot(document.getElementById("root"));
      const I18n = {get: value => value};
      const labels = {...${JSON.stringify(labels)}, referencesLabel:"References", referenceLabel:"Reference", acceptResponseLabel:"Accept answer", rejectResponseLabel:"Reject answer"};
      const Group = ({children,className}) => <div className={className}>{children}</div>;
      const Button = ({children,variant,size,...props}) => <button {...props}>{children}</button>;
      const Text = ({children}) => <span>{children}</span>;
      const Anchor = ({children,...props}) => <a {...props}>{children}</a>;
      const List = ({children}) => <ul>{children}</ul>; List.Item = ({children}) => <li>{children}</li>;
      const citationLinkUrl = value => value;
      const citationDisplayText = value => value;
      const updateFeedback = () => {};
      window.navigationCalls = [];
      const ask = (label,unused,handle) => window.navigationCalls.push({label,handle});
      window.renderFixture = (busy=false,expiresAt=${future},long=false) => {
        const ai = {busy}; const isChatBusy = busy;
        const msg = {id:"assistant-1",role:"assistant",content:"Source facts.\\n\\n[[presentation:catalog-cards|entity-1]]",
          presentation:${JSON.stringify(presentation)},catalogPage:{...${JSON.stringify(page)},pageIndex:1,previousHandle:"${"b".repeat(43)}",expiresAt},
          citations:[{title:"Verified source",url:"https://example.test/record"}]};
        if (long) { labels.catalogPreviousLabel="Previous results with a very long authored label " + "x".repeat(60); labels.catalogNextLabel="Next results with a very long authored label " + "y".repeat(60); }
        else { labels.catalogPreviousLabel="Back batch"; labels.catalogNextLabel="Forward batch"; }
        root.render(<div className="ai-feature-root"><button id="before">Before answer</button><div className="ai-chat-bubble">
          <ReactMarkdown remarkPlugins={[hideVerifiedPresentationDirectives(msg.presentation,msg.content)]}>{msg.content}</ReactMarkdown>
          <AnswerPresentationView presentation={msg.presentation}/>
          ${footer}
        </div></div>);
      };
      window.renderFixture();
    ` } });
  const driver = require(process.env.WPSUITE_BROWSER_DRIVER_PATH!);
  const playwright = !!driver.chromium;
  const browser = await (driver.chromium ?? driver).launch({ executablePath: process.env.WPSUITE_BROWSER_EXECUTABLE!, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const browserPage = await browser.newPage();
    const css = await readFile(new URL("../src/styles/ai-kit-ui.css", import.meta.url), "utf8");
    for (const width of [220, 360, 1100]) {
      const viewport = { width, height: 800 };
      if (playwright) await browserPage.setViewportSize(viewport); else await browserPage.setViewport(viewport);
      await browserPage.setContent(`<style>${css}\nbody{margin:0}#root{--ai-kit-color-primary:#375caa;--ai-kit-color-primary-contrast:#fff;--ai-kit-action-focus-ring:#d23a70}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`);
      await browserPage.waitForSelector(".ai-catalog-page-controls");
      const order = await browserPage.$eval(".ai-chat-bubble", (node: HTMLElement) => [...node.querySelectorAll(".ai-answer-presentation,.ai-catalog-page-controls,.ai-citations,.ai-feedback")].map(item => item.className));
      assert.deepEqual(order, ["ai-answer-presentation", "ai-catalog-page-controls", "ai-citations", "ai-feedback"]);
      const visible = await browserPage.$eval(".ai-chat-bubble", (node: HTMLElement) => node.textContent);
      assert.match(visible, /Source facts\./);
      assert.match(visible, /Source product/);
      assert.doesNotMatch(visible, /\[\[presentation:/, "render-only marker defense leaves the verified cards intact");
      await browserPage.focus("#before");
      await browserPage.keyboard.press("Tab");
      assert.equal(await browserPage.evaluate(() => document.activeElement?.textContent), "Back batch");
      const focused = await browserPage.$eval(".ai-catalog-page-actions button", (button: HTMLElement) => ({
        outline: getComputedStyle(button).outlineStyle, outlineWidth: getComputedStyle(button).outlineWidth,
        background: getComputedStyle(button).backgroundColor, color: getComputedStyle(button).color,
      }));
      assert.equal(focused.outline, "solid");
      assert.equal(focused.outlineWidth, "2px");
      assert.equal(focused.background, "rgb(55, 92, 170)");
      assert.equal(focused.color, "rgb(255, 255, 255)");
      await browserPage.keyboard.press("Enter");
      await browserPage.keyboard.press("Tab");
      await browserPage.keyboard.press("Enter");
      assert.deepEqual(await browserPage.evaluate(() => (window as unknown as { navigationCalls: {handle:string}[] }).navigationCalls.map(item => item.handle)), ["b".repeat(43), handle]);
      await browserPage.evaluate(() => (window as unknown as {renderFixture: (...args: unknown[]) => void}).renderFixture(true));
      await browserPage.waitForSelector('[aria-busy="true"]');
      assert.equal(await browserPage.$$eval(".ai-catalog-page-actions button", (buttons: HTMLButtonElement[]) => buttons.every(button => button.disabled && getComputedStyle(button).cursor === "progress")), true);
      await browserPage.keyboard.press("Enter");
      assert.equal(await browserPage.evaluate(() => (window as unknown as {navigationCalls:unknown[]}).navigationCalls.length), 2);
      await browserPage.evaluate(() => (window as unknown as {renderFixture: (...args: unknown[]) => void}).renderFixture(false,1));
      await browserPage.waitForSelector('[data-expired="true"]');
      assert.equal(await browserPage.$$eval(".ai-catalog-page-actions button", (buttons: HTMLButtonElement[]) => buttons.every(button => button.disabled && Number(getComputedStyle(button).opacity) < 1)), true);
      assert.match(await browserPage.$eval(".ai-catalog-page-expired", (node: HTMLElement) => node.textContent), /Search again/);
      await browserPage.evaluate((expiresAt: number) => (window as unknown as {renderFixture: (...args: unknown[]) => void}).renderFixture(false,expiresAt,true), future);
      await browserPage.waitForFunction(() => !document.querySelector('[data-expired="true"]') && document.querySelector(".ai-catalog-page-actions")?.textContent?.includes("xxxxxxxxxx"));
      const buttons = await browserPage.$$eval(".ai-catalog-page-actions button", (items: HTMLElement[]) => items.map(button => ({
        height: button.getBoundingClientRect().height, width: button.getBoundingClientRect().width,
        parentWidth: button.parentElement!.getBoundingClientRect().width, whiteSpace: getComputedStyle(button).whiteSpace,
      })));
      for (const button of buttons) {
        assert.ok(button.height >= 44);
        assert.ok(button.width <= button.parentWidth + 1);
        assert.equal(button.whiteSpace, "normal");
      }
      assert.equal(await browserPage.$eval("html", (node: HTMLElement) => node.scrollWidth <= node.clientWidth), true);
    }
  } finally { await browser.close(); }
});
