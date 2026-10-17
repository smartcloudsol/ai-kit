import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import type { VisitorActionProposal, VisitorActionResult } from "@smart-cloud/ai-kit-core";
import * as state from "../src/ai-chatbot/visitor-action-state.ts";
import { runChatStreamTurn, chatVisitorActionVersionForCapabilities } from "../src/ai-chatbot/chatStream.ts";

const require = createRequire(import.meta.url);
const handle = "a".repeat(43);
const proposal: VisitorActionProposal = { schemaVersion: 1, handle, title: "Confirm action", description: "Only after confirmation.",
  submitLabel: "Confirm", summary: [{ label: "Product", value: "Exact source – HUF 949.95" }],
  fields: [{ id: "country", label: "Country", kind: "country-code", required: true, maxLength: 2 },
    { id: "postalCode", label: "Postal code", kind: "text", required: true, maxLength: 10 }],
  expiresAt: Math.floor(Date.now() / 1000) + 600 };
const result: VisitorActionResult = { schemaVersion: 1, handle, title: "Action result", status: "completed", summary: proposal.summary };
const proposalV2: VisitorActionProposal = { ...proposal, schemaVersion: 2,
  title: "Check shipping", submitLabel: "Check shipping", details: "Technical disclosure",
  fields: [{ ...proposal.fields[0]!, countryCodes: ["HU", "DE"] }, proposal.fields[1]!,
    { id: "address2", label: "Address line 2", kind: "text", required: false, maxLength: 100 }] };

test("consent normalization is closed, bounded, cloned and rejects duplicate handles", () => {
  assert.deepEqual(state.normalizeVisitorActions([proposal]), [proposal]);
  assert.notEqual(state.normalizeVisitorActions([proposal])?.[0], proposal);
  const six = Array.from({ length: 6 }, (_, index) => ({ ...proposal, handle: String.fromCharCode(97 + index).repeat(43) }));
  assert.equal(state.normalizeVisitorActions(six)?.length, 6);
  assert.equal(state.normalizeVisitorActions([...six, { ...proposal, handle: "z".repeat(43) }]), undefined);
  let getterCalls = 0;
  const getter = [proposal]; Object.defineProperty(getter, "0", { enumerable: true, get: () => { getterCalls++; return proposal; } });
  assert.equal(state.normalizeVisitorActions(getter), undefined); assert.equal(getterCalls, 0);
  for (const invalid of [null, {}, Array(1), [proposal, proposal], Array(7).fill(proposal), [{ ...proposal, fields: Array(9).fill(proposal.fields[0]) }],
    [{ ...proposal, fields: [{ ...proposal.fields[0], maxLength: 1 }] }], [{ ...proposal, autoSubmit: true }]]) {
    assert.equal(state.normalizeVisitorActions(invalid), undefined);
  }
});

test("explicit confirmation preserves exact text, normalizes only country codes and enforces the proposal", () => {
  assert.deepEqual(state.confirmedVisitorAction(proposal, { country: "hu", postalCode: " 00123 " }),
    { handle, confirmed: true, values: { country: "HU", postalCode: " 00123 " } });
  for (const input of [{ country: "Hungary", postalCode: "123" }, { country: "H", postalCode: "123" },
    { country: "HU", postalCode: " " }, { country: "HU", postalCode: "12345678901" },
    { country: "HU", postalCode: "123", unexpected: "secret" }, { country: "HU", postalCode: "123\n456" }]) {
    assert.equal(state.confirmedVisitorAction(proposal, input), undefined);
  }
  for (const options of [{ busy: true }, { consumed: true }, { now: proposal.expiresAt * 1000 }]) {
    assert.equal(state.confirmedVisitorAction(proposal, { country: "HU", postalCode: "123" }, options), undefined);
  }
});

test("history serialization never retains outbound form values and validates proposal/results", () => {
  const safe = state.withSafeVisitorActions({ content: "Confirm", visitorAction: { handle, confirmed: true, values: { postalCode: "PRIVATE" } },
    visitorActions: [proposal], visitorActionResult: result });
  assert.equal(JSON.stringify(safe).includes("PRIVATE"), false);
  assert.equal(Object.hasOwn(safe, "visitorAction"), false);
  assert.deepEqual(safe.visitorActions, [proposal]);
  assert.deepEqual(safe.visitorActionResult, result);
  assert.deepEqual(state.withSafeVisitorActions({ content: "Fallback", visitorActions: [{}], visitorActionResult: {} }), { content: "Fallback" });
});

test("version 2 country choices are source restricted and confirmed values cannot bypass the picker", () => {
  assert.deepEqual(state.normalizeVisitorActions([proposalV2]), [proposalV2]);
  assert.deepEqual(state.confirmedVisitorAction(proposalV2, { country: "hu", postalCode: "123" }),
    { handle, confirmed: true, values: { country: "HU", postalCode: "123", address2: "" } });
  assert.equal(state.confirmedVisitorAction(proposalV2, { country: "US", postalCode: "123" }), undefined);
  for (const countryCodes of [[], ["hu"], ["HU", "HU"], ["HUN"]]) {
    assert.equal(state.normalizeVisitorActions([{ ...proposalV2, fields: [{ ...proposalV2.fields[0], countryCodes }] }]), undefined);
  }
});

async function renderer() {
  const source = await readFile(new URL("../src/ai-chatbot/VisitorActions.tsx", import.meta.url), "utf8");
  const compiled = await require("esbuild").transform(source, { loader: "tsx", format: "cjs", jsx: "automatic" });
  const module = { exports: {} as { VisitorActions: unknown } };
  vm.runInNewContext(compiled.code, { module, exports: module.exports, Date, setTimeout, clearTimeout,
    require: (name: string) => name === "./visitor-action-state" ? state : name === "../locale" ? {
      useAiKitI18n: () => ({ language: "hu", get: (key: string) => ({ Confirm: "Jóváhagyás", Country: "Ország", Product: "Termék", "Source text": "Translated message", "Shipping rates checked": "Szállítási díjak lekérve", "Technical disclosure": "Műszaki tájékoztató" })[key] ?? key }),
    } : require(name) });
  return (props: Record<string, unknown>) => require("react-dom/server").renderToStaticMarkup(require("react").createElement(module.exports.VisitorActions, { onConfirm: () => {}, ...props }));
}

test("forms translate authored labels, preserve source summary values and render accessible bounded inputs", async () => {
  const render = await renderer();
  const html = render({ proposals: [proposal] });
  assert.match(html, /Ország/); assert.match(html, /Termék/); assert.match(html, /Jóváhagyás/);
  assert.match(html, /Exact source – HUF 949\.95/);
  assert.match(html, /aria-labelledby=/); assert.match(html, /aria-describedby=/);
  assert.match(html, /pattern="\[A-Z\]\{2\}"/); assert.match(html, /maxLength="2"/);
  assert.match(html, /autoComplete="off"/); assert.match(html, /type="submit"/); assert.match(html, /type="button">Cancel/);
  assert.doesNotMatch(html, /<script|PRIVATE/);
  for (const props of [{ busy: true }, { consumedHandles: [handle] }, { result }, { proposals: [{ ...proposal, expiresAt: 1 }] }]) {
    assert.match(render({ proposals: [proposal], ...props }), /<fieldset disabled="">/);
  }
});

test("version 2 compact UI uses source country options, collapsed optional details and localized status", async () => {
  const render = await renderer();
  const html = render({ proposals: [proposalV2] });
  assert.match(html, /<select[^>]+name="country"[^>]+required=""/);
  assert.match(html, /<option value="HU">Magyarország<\/option>/);
  assert.match(html, /<option value="DE">Németország<\/option>/);
  assert.doesNotMatch(html, /value="US"/);
  assert.match(html, /<details[^>]*><summary>Optional address details<\/summary>/);
  assert.match(html, /<details[^>]*><summary>Details<\/summary><p>Műszaki tájékoztató<\/p>/);
  assert.doesNotMatch(html, /<details[^>]* open/);
  const resultHtml = render({ result: { ...result, schemaVersion: 2, statusLabel: "Shipping rates checked",
    details: [{ label: "Product", value: "Source text" }, { label: "Status", value: "Source text", valueKind: "message" }] } });
  assert.match(resultHtml, /Szállítási díjak lekérve/);
  assert.doesNotMatch(resultHtml, /Action completed/);
  assert.match(resultHtml, /<dd>Source text<\/dd>/);
  assert.match(resultHtml, /<dd>Translated message<\/dd>/);
});

test("pending results expose only explicit same-handle read retries, never uncertain or completed retries", async () => {
  const render = await renderer();
  assert.match(render({ result: { ...result, status: "pending", retryLabel: "Retry read" } }), /type="button">Retry read/);
  assert.doesNotMatch(render({ result: { ...result, status: "pending" } }), /<button/);
  assert.doesNotMatch(render({ result: { ...result, retryLabel: "Forbidden" } }), /Forbidden/);
  assert.match(render({ result: { ...result, status: "pending", retryLabel: "Retry read" }, retryDisabled: true }), /disabled=""/);
});

test("summary values translate only when explicitly marked as authored messages, never by guessing", async () => {
  const render = await renderer();
  const html = render({ result: { ...result, summary: [{ label: "Product", value: "Source text" },
    { label: "Status", value: "Source text", valueKind: "message" }, { label: "Product", value: "Source text", valueKind: "source" }] } });
  assert.equal((html.match(/<dd>Source text<\/dd>/g) ?? []).length, 2);
  assert.equal((html.match(/<dd>Translated message<\/dd>/g) ?? []).length, 1);
});

class Socket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  readonly receive: (command: Record<string, unknown>, socket: Socket) => void;
  constructor(receive: (command: Record<string, unknown>, socket: Socket) => void) {
    this.receive = receive;
    queueMicrotask(() => { this.readyState = 1; this.onopen?.(); });
  }
  send(text: string) { this.receive(JSON.parse(text), this); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
  emit(type: string, seq: number, payload: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify({ version: 1, type, seq, payload, conversationId: "session", turnId: "turn", eventId: `e${seq}`, timestamp: "2026-10-15T12:00:00Z" }) });
  }
}
const options = () => ({ url: "wss://example.test/chat", text: "Confirm", locale: "en", requestId: "request",
  signal: new AbortController().signal, onView: () => {}, retryDelayMs: 0,
  ticketProvider: async () => ({ ticket: "ticket", expiresAt: "2099-01-01", sessionId: "session" }) });

test("visitor capability requires exact explicit version and unsupported confirmation never dispatches", async () => {
  for (const caps of [undefined, {}, { "ai.visitor.actions": "1" }, { "ai.visitor.actions": 3 },
    { "ai.visitor.actions.v2": 1 }, { "ai.visitor.actions": "1", "ai.visitor.actions.v2": 1 },
    { "ai.visitor.actions": 3, "ai.visitor.actions.v2": 1 }]) assert.equal(chatVisitorActionVersionForCapabilities(caps), undefined);
  assert.equal(chatVisitorActionVersionForCapabilities({ "ai.visitor.actions": 1 }), 1);
  assert.equal(chatVisitorActionVersionForCapabilities({ "ai.visitor.actions": 2 }), 2);
  assert.equal(chatVisitorActionVersionForCapabilities({ "ai.visitor.actions": 1, "ai.visitor.actions.v2": 1 }), 2);
  for (const flag of [undefined, 0, 2, "1", true]) {
    assert.equal(chatVisitorActionVersionForCapabilities({ "ai.visitor.actions": 1, "ai.visitor.actions.v2": flag }), 1);
  }
  let calls = 0;
  await assert.rejects(runChatStreamTurn({ ...options(), visitorAction: { handle, confirmed: true, values: {} },
    ticketProvider: async () => { calls++; throw new Error("Not dispatched"); } }), /Review your input/);
  assert.equal(calls, 0);
});

test("stream completion and snapshots validate action responses and never expose confirmation values in views", async () => {
  for (const terminal of ["answer.completed", "turn.snapshot"]) for (const version of [1, 2] as const) {
    const views: unknown[] = []; const commands: Record<string, unknown>[] = [];
    const returnedProposal = version === 2 ? proposalV2 : proposal;
    const returnedResult: VisitorActionResult = version === 2 ? { ...result, schemaVersion: 2, statusLabel: "Shipping rates checked" } : result;
    const actual = await runChatStreamTurn({ ...options(), visitorActionVersion: version,
      visitorAction: { handle, confirmed: true, values: { postalCode: "PRIVATE" } }, onView: view => views.push(view),
      socketFactory: () => new Socket((command, socket) => { commands.push(command); queueMicrotask(() => {
        socket.emit("turn.accepted", 0, { assistantMessageId: "assistant", sessionId: "session" });
        socket.emit(terminal, 1, { result: "Safe answer", visitorActions: [returnedProposal], visitorActionResult: returnedResult, active: false });
      }); }) as unknown as WebSocket });
    assert.deepEqual(actual.visitorActions, [returnedProposal]); assert.deepEqual(actual.visitorActionResult, returnedResult);
    assert.equal(commands[0]?.visitorActionVersion, version);
    assert.match(JSON.stringify(commands[0]), /PRIVATE/);
    assert.doesNotMatch(JSON.stringify(views), /PRIVATE/); assert.doesNotMatch(JSON.stringify(actual), /PRIVATE/);
  }
});

test("lost confirmation admission is not automatically retried; accepted turns resume without form values", async () => {
  let sockets = 0;
  const action = { handle, confirmed: true as const, values: { postalCode: "PRIVATE" } };
  await assert.rejects(runChatStreamTurn({ ...options(), visitorActionVersion: 1, visitorAction: action,
    socketFactory: () => { sockets++; return new Socket((_command, socket) => queueMicrotask(() => socket.close())) as unknown as WebSocket; } }),
  error => (error as { code?: string }).code === "VISITOR_ACTION_ADMISSION_UNCERTAIN");
  assert.equal(sockets, 1);
  for (const version of [1, 2] as const) {
  const commands: Record<string, unknown>[] = [];
  await runChatStreamTurn({ ...options(), visitorActionVersion: version, visitorAction: action,
    socketFactory: () => new Socket((command, socket) => { commands.push(command); queueMicrotask(() => {
      if (command.type === "turn.start") { socket.emit("turn.accepted", 0, { sessionId: "session" }); socket.close(); }
      else socket.emit("turn.snapshot", 1, { active: false, result: "Complete", visitorActionResult: result });
    }); }) as unknown as WebSocket });
  assert.equal(commands.length, 2); assert.equal(commands[1]?.type, "turn.resume"); assert.equal(commands[1]?.visitorActionVersion, version);
  assert.equal(Object.hasOwn(commands[1]!, "visitorAction"), false); assert.doesNotMatch(JSON.stringify(commands[1]), /PRIVATE/);
  }
});

test("HTTP/WS/history rendering integration negotiates actions and never stores confirmation input", async () => {
  const source = await readFile(new URL("../src/ai-chatbot/AiChatbot.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/\.\.\.visitorOptions/g) ?? []).length, 2);
  assert.match(source, /withSafeVisitorActions\(withSafeAnswerPresentation\(rest\)\)/);
  assert.match(source, /withSafeVisitorActions\(withSafeAnswerPresentation\(msg\)\)/);
  assert.match(source, /retryText: !visitorAction &&/);
  assert.match(source, /void ask\(label, false, undefined, action\)/);
  assert.match(source, /!msg\.visitorActionResult && <ChatMarkdownImageLabelsContext\.Provider/,
    "only strictly parsed native results replace the ordinary response paragraph");
  assert.match(source, /retryText: pending\.confirmation \? undefined : pending\.text/,
    "a restored confirmation never becomes a fresh automatically resubmitted action");
  const start = source.indexOf("const safeStream ="); const end = source.indexOf("setActiveStream(safeStream)", start);
  assert.doesNotMatch(source.slice(start, end), /\.\.\.parsed\.activeStream|visitorAction:/);
});

test("HTTP and WebSocket share action negotiation and unsupported consent fails before dispatch", async () => {
  const source = await readFile(new URL("../src/ai-chatbot/AiChatbot.tsx", import.meta.url), "utf8");
  const start = source.indexOf("const [presentationVersion, catalogPageVersion] = await Promise.all(");
  const end = source.indexOf("return out;", start) + "return out;".length;
  const compiled = await require("esbuild").transform(`exports.run=async()=>{${source.slice(start, end)}}`, { loader: "tsx", format: "cjs" });
  for (const stream of [false, true]) for (const version of [undefined, 1, 2]) for (const confirmed of [false, true]) {
    const requests: Record<string, unknown>[] = [];
    const action = confirmed ? { handle, confirmed: true, values: { postalCode: "PRIVATE" } } : undefined;
    const module = { exports: {} as { run: () => Promise<unknown> } };
    vm.runInNewContext(compiled.code, { module, exports: module.exports,
      discoverChatPresentationVersion: async () => 2, discoverChatCatalogPageVersion: async () => undefined,
      discoverChatVisitorActionVersion: async () => version,
      discoverChatStreamUrl: async () => stream ? "wss://example.test/chat" : undefined,
      visitorAction: action, catalogContinuation: undefined, I18n: { language: "hu", get: (key: string) => key },
      trimmed: "Jóváhagyom", selectedAudio: undefined, selectedImages: [], signal: { aborted: false }, activeSessionId: "session",
      latestStreamView: null, createMessageId: () => "turn", setStreamTransportState: () => {},
      maxTokens: 1024, context: {}, onStatus: () => {},
      runChatStreamTurn: async (options: Record<string, unknown>) => { requests.push(options); return { result: "Safe answer", sessionId: "session", visitorActionResult: result }; },
      sendChatMessage: async (options: Record<string, unknown>) => { requests.push(options); return { result: "Safe answer", visitorActionResult: result }; },
    });
    if (confirmed && !version) { await assert.rejects(module.exports.run(), /Review your input/); assert.equal(requests.length, 0); }
    else {
      const response = await module.exports.run(); assert.equal(requests.length, 1);
      assert.equal(requests[0]?.visitorActionVersion, version);
      assert.equal(requests[0]?.visitorAction, version ? action : undefined);
      assert.equal((requests[0]?.message as string | undefined) ?? requests[0]?.text, "Jóváhagyom");
      assert.doesNotMatch(JSON.stringify(response), /PRIVATE/);
    }
  }
});

test("browser requires explicit consent, clears inputs, prevents duplicate submission, cancels and handles expiry", {
  skip: !process.env.WPSUITE_BROWSER_EXECUTABLE || !process.env.WPSUITE_BROWSER_DRIVER_PATH,
}, async () => {
  const bundle = await require("esbuild").build({ write: false, bundle: true, platform: "browser", format: "iife",
    stdin: { resolveDir: new URL("../", import.meta.url).pathname, loader: "tsx", contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {VisitorActions} from './src/ai-chatbot/VisitorActions';
      import {AiKitLocaleProvider} from './src/locale';
      const root=createRoot(document.getElementById('root')); window.calls=[];
      let serial=0; window.renderFixture=(props={})=>root.render(<AiKitLocaleProvider language="hu"
        customTranslations={{hu:{'Confirm action':'Jóváhagyás szükséges','Confirm':'Jóváhagyom','Country':'Ország'}}}>
        <VisitorActions key={++serial} proposals={[${JSON.stringify(proposal)}]} {...props}
          onConfirm={(action,label)=>window.calls.push({action,label})}/></AiKitLocaleProvider>);
      window.renderFixture();` } });
  const driver = require(process.env.WPSUITE_BROWSER_DRIVER_PATH!);
  const browser = await (driver.chromium ?? driver).launch({ executablePath: process.env.WPSUITE_BROWSER_EXECUTABLE!, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 700 } });
    const css = await readFile(new URL("../src/styles/ai-kit-ui.css", import.meta.url), "utf8");
    await page.setContent(`<style>${css}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`);
    await page.waitForSelector("form");
    assert.equal(await page.evaluate(() => (window as unknown as { calls: unknown[] }).calls.length), 0);
    await page.locator('button[type="submit"]').click();
    assert.equal(await page.evaluate(() => (window as unknown as { calls: unknown[] }).calls.length), 0);
    await page.locator('input[name="country"]').fill("hu"); await page.locator('input[name="postalCode"]').fill("PRIVATE123");
    assert.equal(await page.locator('input[name="country"]').inputValue(), "HU");
    await page.locator('button[type="submit"]').dblclick({ force: true });
    const calls = await page.evaluate(() => (window as unknown as { calls: { action: unknown; label: string }[] }).calls);
    assert.deepEqual(calls, [{ action: { handle, confirmed: true, values: { country: "HU", postalCode: "PRIVATE123" } }, label: "Jóváhagyom" }]);
    assert.equal(await page.locator('input[name="postalCode"]').inputValue(), "");
    assert.equal(await page.evaluate(() => document.body.textContent?.includes("PRIVATE123")), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.evaluate(() => (window as unknown as { renderFixture: (props?: unknown) => void }).renderFixture());
    await page.locator('input[name="postalCode"]').fill("CANCELLED"); await page.locator('button[type="button"]').click();
    await page.waitForFunction(() => (document.querySelector("fieldset") as HTMLFieldSetElement)?.disabled === true);
    assert.equal(await page.locator('input[name="postalCode"]').inputValue(), ""); assert.equal(await page.locator('input[name="postalCode"]').isDisabled(), true);
    await page.evaluate((value: unknown) => (window as unknown as { renderFixture: (props: unknown) => void }).renderFixture(value), { proposals: [{ ...proposal, expiresAt: Math.floor(Date.now() / 1000) + 2 }] });
    await page.waitForFunction(() => (document.querySelector("fieldset") as HTMLFieldSetElement)?.disabled === false);
    await page.locator('input[name="postalCode"]').fill("EXPIRES");
    await page.waitForFunction(() => (document.querySelector("fieldset") as HTMLFieldSetElement)?.disabled === true);
    assert.equal(await page.locator('input[name="postalCode"]').inputValue(), "");
    assert.equal(await page.evaluate(() => (window as unknown as { calls: unknown[] }).calls.length), 1);
    await page.evaluate((value: unknown) => (window as unknown as { renderFixture: (props: unknown) => void }).renderFixture(value),
      { proposals: [], result: { ...result, status: "pending", retryLabel: "Retry read" } });
    await page.waitForSelector('.ai-visitor-action-result button');
    await page.locator('.ai-visitor-action-result button').dblclick({ force: true });
    const retryCalls = await page.evaluate(() => (window as unknown as { calls: { action: unknown; label: string }[] }).calls);
    assert.equal(retryCalls.length, 2); assert.deepEqual(retryCalls[1]?.action, { handle, confirmed: true, values: {} });
    await page.evaluate((value: unknown) => (window as unknown as { renderFixture: (props: unknown) => void }).renderFixture(value),
      { proposals: [], result: { ...result, status: "pending" } });
    await page.waitForFunction(() => !document.querySelector('.ai-visitor-action-result button'));
    await page.evaluate((value: unknown) => (window as unknown as { renderFixture: (props: unknown) => void }).renderFixture(value), { proposals: [proposalV2] });
    await page.waitForSelector('select[name="country"]');
    assert.equal(await page.locator('select[name="country"] option').count(), 3);
    assert.equal(await page.locator('select[name="country"] option[value="HU"]').textContent(), "Magyarország");
    assert.equal(await page.locator('input[name="address2"]').isVisible(), false);
    const optional = page.locator('details').filter({ hasText: 'További címadatok' });
    await optional.locator('summary').click();
    await page.locator('input[name="address2"]').fill("OPTIONAL");
    await optional.locator('summary').click();
    await optional.locator('summary').click();
    assert.equal(await page.locator('input[name="address2"]').inputValue(), "OPTIONAL");
    await optional.locator('summary').click();
    await page.locator('select[name="country"]').selectOption("DE");
    await page.locator('input[name="postalCode"]').fill("10115");
    assert.equal(await page.locator('select[name="country"]').evaluate((element: HTMLSelectElement) => element.getBoundingClientRect().height >= 44), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width: 1024, height: 800 });
    const widths = await page.locator('.ai-visitor-action-fields').first().evaluate((element: HTMLElement) => ({
      columns: getComputedStyle(element).gridTemplateColumns.split(' ').length, width: element.getBoundingClientRect().width,
    }));
    assert.equal(widths.columns, 2); assert.ok(widths.width < 640);
    await page.locator('button[type="submit"]').click();
    const finalCalls = await page.evaluate(() => (window as unknown as { calls: { action: unknown }[] }).calls);
    assert.deepEqual(finalCalls.at(-1)?.action, { handle, confirmed: true, values: { country: "DE", postalCode: "10115", address2: "OPTIONAL" } });
  } finally { await browser.close(); }
});
