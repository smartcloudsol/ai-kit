import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const requirePublisher = createRequire(new URL("../../../static-publisher/exporter/package.json", import.meta.url));
const { build } = requirePublisher("esbuild");
const { chromium } = requirePublisher("playwright");
const dir = fileURLToPath(new URL("..", import.meta.url));
const fixture = JSON.stringify({ products: Array.from({ length: 240 }, (_, index) => ({
  id: `product-${index}`, title: "Reviewed catalog item with a long description for scrolling",
})) }, null, 2);
assert.ok(Buffer.byteLength(fixture) >= 24000);
const bundle = await build({
  absWorkingDir: dir, bundle: true, write: false, splitting: true, format: "esm", jsx: "automatic",
  outdir: "/tmp/wpsuite-bounded-json-browser", loader: { ".ttf": "dataurl" },
  define: { "process.env.NODE_ENV": '"production"' },
  stdin: { resolveDir: dir, loader: "tsx", sourcefile: "bounded-json-browser-entry.tsx", contents: `
    import {createRoot} from 'react-dom/client';import {useState} from 'react';
    import {MantineProvider,Button} from '@mantine/core';import BoundedJsonEditor from './src/components/BoundedJsonEditor';
    window.MonacoEnvironment={getWorkerUrl:(_moduleId,label)=>label==='json'?'/json-worker.js':'/editor-worker.js'};
    function Fixture(){const [value,setValue]=useState(window.fixture.large);const [error,setError]=useState(undefined);const [locked,setLocked]=useState(false);
      return <MantineProvider><div style={{maxWidth:720,padding:20}}><BoundedJsonEditor label="Reviewed JSON" description="Bounded JSON fixture" value={value} maxBytes={64*1024} error={error} readOnly={locked}
      onChange={next=>{window.fixture.value=next;setValue(next);try{JSON.parse(next);setError(undefined)}catch{setError('Invalid JSON draft')}}}/>
      <Button onClick={()=>setLocked(current=>!current)}>{locked?'Unlock edits':'Lock edits'}</Button>
      <Button onClick={()=>setValue('x'.repeat(70*1024))}>Load oversized draft</Button></div></MantineProvider>}
    createRoot(document.getElementById('root')).render(<Fixture/>);`,
  },
  plugins: [{ name: "local-monaco-fixture", setup(plugin) {
    plugin.onResolve({ filter: /^monaco-editor\/esm\// }, ({ path }) => {
      if (!/\.(?:js|css|ttf|json)$/.test(path)) return { path: requirePublisher.resolve(`${path}.js`, { paths: [dir] }) };
    });
    plugin.onResolve({ filter: /^@smart-cloud\/ai-kit-core$|^@wordpress\/i18n$/ }, ({ path }) => ({ path, namespace: "fixture" }));
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ loader: "js", contents: path === "@wordpress/i18n" ? "export const __=text=>text;" : "export const TEXT_DOMAIN='smartcloud-ai-kit';" }));
  } }],
});
const workerEntries = [
  ["/json-worker.js", "monaco-editor/esm/vs/language/json/json.worker.js"],
  ["/editor-worker.js", "monaco-editor/esm/vs/editor/editor.worker.js"],
];
const files = new Map(bundle.outputFiles.map((file) => [`/${file.path.split("/").at(-1)}`, file.contents]));
for (const [path, entry] of workerEntries) {
  const result = await build({ absWorkingDir: dir, entryPoints: [requirePublisher.resolve(entry, { paths: [dir] })], bundle: true,
    write: false, format: "iife", define: { "process.env.NODE_ENV": '"production"' } });
  files.set(path, result.outputFiles[0].contents);
}
const css = await readFile(`${dir}/node_modules/@mantine/core/styles.css`, "utf8");
const entry = bundle.outputFiles.find((file) => file.path.endsWith("/stdin.js"));
assert.ok(entry);
const styles = bundle.outputFiles.filter((file) => file.path.endsWith(".css")).map((file) => `<link rel="stylesheet" href="/${file.path.split("/").at(-1)}">`).join("");
const server = createServer((request, response) => {
  const path = request.url.split("?")[0];
  if (path === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end(`<html><head><style>${css}body{margin:0}</style>${styles}</head><body><div id="root"></div><script>window.fixture={large:${JSON.stringify(fixture)},value:${JSON.stringify(fixture)}};</script><script type="module" src="/${entry.path.split("/").at(-1)}"></script></body></html>`);
  } else if (files.has(path)) {
    response.setHeader("Content-Type", path.endsWith(".css") ? "text/css" : "text/javascript"); response.end(files.get(path));
  } else { response.statusCode = 404; response.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
test.after(async () => { await browser.close(); await new Promise((resolve) => server.close(resolve)); });

test("local real Monaco bounds a large JSON draft, scrolls internally, resizes and exposes draft errors", async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const externalRequests = [], errors = [];
  page.on("request", (request) => { if (!request.url().startsWith(origin)) externalRequests.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(origin);
    const input = page.getByRole("textbox", { name: "Reviewed JSON", exact: true });
    await input.waitFor();
    const host = page.locator("[data-bounded-json-editor]");
    const initial = await host.boundingBox();
    assert.equal(initial.height, 280);
    assert.ok(await page.locator(".monaco-editor .view-lines").innerText());
    await input.focus();
    await page.keyboard.press("Control+End");
    await page.waitForFunction(() => document.querySelector(".monaco-editor .view-lines")?.textContent.includes("product-239"));
    assert.equal((await host.boundingBox()).height, initial.height);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await host.scrollIntoViewIfNeeded();
    const before = await host.boundingBox();
    await page.mouse.move(before.x + before.width - 3, before.y + before.height - 3);
    await page.mouse.down(); await page.mouse.move(before.x + before.width - 3, before.y + before.height + 450); await page.mouse.up();
    const expanded = await host.boundingBox();
    assert.ok(expanded.height > before.height);
    assert.ok(expanded.height <= 600);
    await page.waitForFunction(() => Math.abs(document.querySelector('.monaco-editor').getBoundingClientRect().height -
      document.querySelector('[data-bounded-json-editor]').getBoundingClientRect().height) < 4);
    await page.setViewportSize({ width: 600, height: 600 });
    await page.waitForFunction(() => document.querySelector('[data-bounded-json-editor]').getBoundingClientRect().height <= innerHeight * .7 + 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await input.focus(); await page.keyboard.press("Control+A"); await page.keyboard.insertText("{");
    await page.getByRole("alert").filter({ hasText: "Invalid JSON draft" }).waitFor();
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    const editedValue = await page.evaluate(() => window.fixture.value);
    assert.throws(() => JSON.parse(editedValue));
    assert.notEqual(editedValue, fixture);
    await page.getByRole("button", { name: "Load oversized draft" }).click();
    await page.getByRole("alert").filter({ hasText: "JSON exceeds the size limit." }).waitFor();
    assert.ok((await host.boundingBox()).height <= 420);
    await host.scrollIntoViewIfNeeded();
    const large = await host.boundingBox();
    await page.mouse.move(large.x + large.width - 3, large.y + large.height - 3);
    await page.mouse.down(); await page.mouse.move(large.x + large.width - 3, large.y - 300); await page.mouse.up();
    const small = await host.boundingBox();
    assert.ok(small.height >= 140);
    assert.ok(small.height < large.height);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("real Monaco read-only state blocks editing until unlocked", async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(origin);
    const input = page.getByRole("textbox", { name: "Reviewed JSON", exact: true });
    await input.waitFor();
    await page.getByRole("button", { name: "Lock edits", exact: true }).click();
    await page.getByRole("button", { name: "Unlock edits", exact: true }).waitFor();
    await input.focus();
    await page.keyboard.press("Control+Home");
    await page.keyboard.insertText("SHOULD_NOT_BE_INSERTED");
    assert.equal(await page.evaluate(() => window.fixture.value), fixture);
    assert.equal(await page.locator(".monaco-editor .view-lines").innerText().then(text => text.includes("SHOULD_NOT_BE_INSERTED")), false);
    await page.getByRole("button", { name: "Unlock edits", exact: true }).click();
    await input.focus();
    await page.keyboard.press("Control+Home");
    await page.keyboard.insertText("UNLOCKED_EDIT");
    await page.waitForFunction(() => window.fixture.value.includes("UNLOCKED_EDIT"));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
