import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const requirePublisher = createRequire(new URL("../../../static-publisher/exporter/package.json", import.meta.url));
const { build } = requirePublisher("esbuild");
const { chromium } = requirePublisher("playwright");
const dir = fileURLToPath(new URL("..", import.meta.url));
const bundle = await build({ absWorkingDir: dir, stdin: { contents: `
import{createRoot}from'react-dom/client';import{useState}from'react';import{MantineProvider}from'@mantine/core';import ProductPageLinks from'./src/answers/ProductPageLinks';import{productPageConnectionKey}from'./src/answers/product-page-links';import{adminTheme}from'./src/theme';
function Harness(){const[server,setServer]=useState(window.fixture.server);window.changeServer=setServer;return <ProductPageLinks key={productPageConnectionKey(server)} server={server} supported={window.fixture.supported} restUrl={location.origin+'/api'} nonce='fixture-nonce' previewProducts={async request=>{window.fixture.lookups.push(structuredClone(request));if(window.fixture.delayProduct)await new Promise(resolve=>window.fixture.releaseProduct=resolve);return structuredClone(window.fixture.products)}} onChange={next=>{window.fixture.drafts.push(structuredClone(next));window.fixture.server=next;setServer(next)}} openHelp={()=>window.fixture.help.push('product-pages')}/>};createRoot(document.getElementById('root')).render(<MantineProvider theme={adminTheme}><Harness/></MantineProvider>);`, loader: "tsx", resolveDir: dir }, bundle: true, write: false, jsx: "automatic", outdir: "/tmp/answers-product-pages-browser", define: { "process.env.NODE_ENV": '"production"' } });
const css = await readFile(`${dir}/node_modules/@mantine/core/styles.css`, "utf8");
const browser = await chromium.launch({ headless: true, args: ["--disable-gpu", "--disable-software-rasterizer"] });
test.after(async () => { await browser.close(); });
const id = "gid://shopify/Product/123";
function server() { return { id: "catalog", enabled: true, serverName: "universal-commerce", endpoint: "https://catalog.myshopify.com/api/ucp/mcp", purpose: "Read products", tools: [{ name: "search_catalog", policyClass: "read", readOnlyConfirmed: true, description: "Search", inputSchema: {} }], providerPreset: { id: "shopify-storefront-catalog", config: { shopDomain: "catalog.myshopify.com" } } }; }
async function fixture({ supported = true, initial = server(), width = 1000, untitledPage = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ server, supported, id }) => { window.fixture = { server, supported, lookups: [], drafts: [], help: [], products: { products: [{ id, title: "The Complete Snowboard" }] } }; }, { server: initial, supported, id });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/answers-product-pages") {
      requests.push({ method: route.request().method(), url: url.href, headers: route.request().headers() });
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ siteUrl: "https://owner.example.com/", page: 1, hasMore: false, pages: [
        { postId: 1, title: "Snowboard details", url: "https://owner.example.com/snowboard/", locale: "en-GB", identities: [] },
        { postId: 2, title: "Integration-supplied page", url: "https://owner.example.com/discovered/", identities: [{ providerId: "shopify-storefront-catalog", sourceOrigin: "https://catalog.myshopify.com/", productId: "discovered-product" }] },
        ...(untitledPage ? [{ postId: 3, title: "", url: "https://owner.example.com/unnamed/", identities: [] }] : []),
      ] }) });
    }
    return route.fulfill({ contentType: "text/html", body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0}#root{padding:12px;max-width:780px;box-sizing:border-box}</style></head><body><div id="root"></div></body></html>` });
  });
  await page.goto("https://owner.example.com/wp-admin/");
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });
  await page.getByRole("button", { name: "Product destination pages", exact: true }).click();
  return { page, errors, requests };
}
async function choose(page, label, option) {
  await page.getByRole("textbox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
test("owner selects a catalog product and WordPress page, then stages explicit localized mappings only", async () => {
  const { page, errors, requests } = await fixture();
  assert.equal(requests.length, 0);
  await page.getByRole("textbox", { name: "Search live catalog products", exact: true }).fill("snowboard");
  await page.getByRole("button", { name: "Search catalog products", exact: true }).click();
  await choose(page, "Catalog product", `The Complete Snowboard — ${id}`);
  await page.getByRole("button", { name: "Find published pages", exact: true }).click();
  await choose(page, "Published WordPress page", "Snowboard details (en-GB) — https://owner.example.com/snowboard/");
  assert.equal(await page.getByRole("textbox", { name: "Mapping language (optional)", exact: true }).inputValue(), "en-GB");
  assert.equal(await page.evaluate(() => window.fixture.drafts.length), 0);
  await choose(page, "Where product links open", "WordPress pages, with original store fallback");
  await page.getByRole("button", { name: "Add selected pair to draft", exact: true }).click();
  const mapping = await page.evaluate(() => window.fixture.server.productPageLinks);
  assert.deepEqual(mapping, { siteUrl: "https://owner.example.com/", policy: "prefer-local", mappings: [{ productId: id, publicUrl: "https://owner.example.com/snowboard/", locale: "en-GB", origin: "explicit" }] });
  assert.equal(await page.getByRole("button", { name: "Add selected pair to draft", exact: true }).isDisabled(), true);
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].headers["x-wp-nonce"], "fixture-nonce");
  assert.equal(await page.evaluate(() => window.fixture.lookups[0].operation), "previewProducts");
  assert.equal(await page.evaluate(() => window.fixture.lookups.length), 1);
  await page.getByRole("button", { name: "Product page link help", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.fixture.help), ["product-pages"]);
  assert.deepEqual(errors, []);
  await page.close();
});
test("discovered identities require explicit review and removal changes only the draft", async () => {
  const { page, errors } = await fixture({ width: 375 });
  await page.getByRole("button", { name: "Find published pages", exact: true }).click();
  await page.getByText("Review product identities supplied by an installed integration", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.fixture.drafts.length), 0);
  await page.getByRole("button", { name: "Add discovered mapping to draft", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.fixture.server.productPageLinks.mappings), [{ productId: "discovered-product", publicUrl: "https://owner.example.com/discovered/", origin: "discovered" }]);
  assert.equal(await page.getByRole("button", { name: "Add discovered mapping to draft", exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.getByRole("button", { name: "Remove mapping from draft", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.fixture.server.productPageLinks.mappings), []);
  assert.deepEqual(errors, []);
  await page.close();
});
test("an older backend preserves saved mappings and disables new page lookups or changes", async () => {
  const initial = { ...server(), productPageLinks: { siteUrl: "https://owner.example.com/", policy: "local-only", mappings: [{ productId: id, publicUrl: "https://owner.example.com/snowboard/", origin: "explicit" }] } };
  const { page, requests, errors } = await fixture({ supported: false, initial });
  await page.getByText("Update your AI Kit backend to use product page links.", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Remove mapping from draft", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("textbox", { name: "Where product links open", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Search catalog products", exact: true }).count(), 0);
  assert.equal(requests.length, 0);
  assert.deepEqual(await page.evaluate(() => window.fixture.server), initial);
  assert.deepEqual(errors, []);
  await page.close();
});
test("a pending catalog lookup cannot populate a replacement connection or stage its product", async () => {
  const { page, errors } = await fixture();
  await page.evaluate(() => { window.fixture.delayProduct = true; });
  await page.getByRole("textbox", { name: "Search live catalog products", exact: true }).fill("snowboard");
  await page.getByRole("button", { name: "Search catalog products", exact: true }).click();
  await page.waitForFunction(() => Boolean(window.fixture.releaseProduct));
  await page.evaluate(() => { window.changeServer({ ...window.fixture.server, endpoint: "https://replacement.myshopify.com/api/ucp/mcp" }); });
  await page.getByRole("button", { name: "Product destination pages", exact: true }).click();
  await page.evaluate(() => window.fixture.releaseProduct());
  await page.getByRole("textbox", { name: "Search live catalog products", exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Catalog product", exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => window.fixture.drafts.length), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test("an empty catalog result is explicit and an untitled published page remains selectable", async () => {
  const { page, errors } = await fixture({ untitledPage: true });
  await page.evaluate(() => { window.fixture.products = { products: [] }; });
  await page.getByRole("textbox", { name: "Search live catalog products", exact: true }).fill("missing-product");
  await page.getByRole("button", { name: "Search catalog products", exact: true }).click();
  await page.getByText("No matching catalog products. Try a more specific product name or category.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Find published pages", exact: true }).click();
  await choose(page, "Published WordPress page", "(Untitled page) — https://owner.example.com/unnamed/");
  assert.equal(await page.evaluate(() => window.fixture.drafts.length), 0);
  assert.deepEqual(errors, []);
  await page.close();
});
