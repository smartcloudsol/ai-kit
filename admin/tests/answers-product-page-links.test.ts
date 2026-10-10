import assert from "node:assert/strict";
import test from "node:test";
import { productPageLocale, productMappingKey, productPageConnectionKey, productPageSuggestions, requestProductPages, validProductPageLinks, validProductPageUrl, validateProductPages, validateProductPreview } from "../src/answers/product-page-links.ts";
import type { ConnectionServer } from "../src/answers/connection-types.ts";

const siteUrl = "https://owner.example.com/store/";
const mapping = { productId: "gid://shopify/Product/123", publicUrl: `${siteUrl}snowboard/`, origin: "explicit" as const };
const links = () => ({ siteUrl, policy: "prefer-local", mappings: [mapping] });
const server = (): ConnectionServer => ({ id: "shop", enabled: true, endpoint: "https://catalog.myshopify.com/api/ucp/mcp", serverName: "universal-commerce", purpose: "Read products", tools: [], providerPreset: { id: "shopify-storefront-catalog", config: { shopDomain: "catalog.myshopify.com" } } });

test("exact opaque identities and canonical regional languages survive mapping validation", () => {
  assert.equal(validProductPageLinks(links()), true);
  assert.equal(validProductPageLinks({ ...links(), mappings: [{ ...mapping, productId: "  opaque ID  ", locale: "en-gb" }] }), true);
  assert.equal(productPageLocale("en-gb"), "en-GB");
  for (const invalid of ["auto", "en_US", "x-private", "en\n", "", " "]) {
    if (!invalid) assert.equal(productPageLocale(invalid), undefined);
    else assert.throws(() => productPageLocale(invalid));
  }
});
test("only public site destinations within the exact site path and safe query are allowed", () => {
  for (const url of [`${siteUrl}item`, "https://owner.example.com/store", `${siteUrl}?p=123`, `${siteUrl}?page_id=1&lang=en-GB`]) assert.equal(validProductPageUrl(url, siteUrl), true, url);
  for (const url of ["http://owner.example.com/store/item", "https://other.example.com/store/item", "https://owner.example.com/store-two/item", "https://owner.example.com/", `${siteUrl}wp-admin/edit`, `${siteUrl}%77p-admin/edit`, `${siteUrl}%63art/`, `${siteUrl}checkout`, `${siteUrl}item#secret`, `${siteUrl}item?next=https://evil.com`, `${siteUrl}?p=1&p=2`, `${siteUrl}?page_id=12345678901234567`, `${siteUrl}?p=0`, `${siteUrl}?lang=auto`, `${siteUrl}%252fadmin`, `${siteUrl}x%2fy`, `${siteUrl}..%2fadmin`, `${siteUrl}x%00`, "https://user:pass@owner.example.com/store/item", "https://127.0.0.1/store/item", "https://owner.internal/store/item"]) assert.equal(validProductPageUrl(url, siteUrl), false, url);
});
test("mapping bounds and duplicate keys are enforced without merging case-distinct IDs or origins", () => {
  const row = { ...mapping, locale: "en-gb" };
  assert.equal(productMappingKey(row), productMappingKey({ ...row, locale: "en-GB" }));
  assert.equal(validProductPageLinks({ ...links(), mappings: [row, { ...row, locale: "en-GB" }] }), false);
  assert.equal(validProductPageLinks({ ...links(), mappings: [row, { ...row, origin: "discovered" }, { ...row, productId: row.productId.toUpperCase() }] }), true);
  for (const extra of [{ policy: "wildcard" }, { siteUrl: `${siteUrl}?p=1` }, { siteUrl: "https://owner.internal/store/" }, { injected: true }, { mappings: [{ ...mapping, productId: " ", locale: "auto" }] }, { mappings: [{ ...mapping, variantId: "other" }] }, { mappings: Array.from({ length: 51 }, (_, index) => ({ ...mapping, productId: String(index) })) }]) assert.equal(validProductPageLinks({ ...links(), ...extra }), false);
  const largeRows = Array.from({ length: 50 }, (_, index) => ({ ...mapping, productId: String(index), publicUrl: `${siteUrl}${"é".repeat(1000)}` }));
  assert.equal(validProductPageLinks({ ...links(), mappings: largeRows }), false);
});
test("trusted suggestions match provider and full source namespace only, never titles or handles", () => {
  const pages = { siteUrl, page: 1, hasMore: false, pages: [{ postId: 1, title: "Coincidentally similar title", url: mapping.publicUrl, locale: "en-gb", identities: [
    { providerId: "shopify-storefront-catalog", sourceOrigin: "https://CATALOG.myshopify.com", productId: mapping.productId },
    { providerId: "shopify-storefront-catalog", sourceOrigin: "https://another.myshopify.com/", productId: "wrong-shop" },
    { providerId: "woocommerce", sourceOrigin: "https://catalog.myshopify.com/", productId: "wrong-provider" },
  ] }] };
  assert.deepEqual(productPageSuggestions(server(), pages), [{ title: "Coincidentally similar title", mapping: { ...mapping, locale: "en-GB", origin: "discovered" } }]);
  const woo = { ...server(), providerPreset: { id: "woocommerce", config: { siteUrl: "https://catalog.example.com/shop-one/" } } };
  pages.pages[0].identities = [
    { providerId: "woocommerce", sourceOrigin: "https://catalog.example.com/shop-one/", productId: "good" },
    { providerId: "woocommerce", sourceOrigin: "https://catalog.example.com/shop-two/", productId: "wrong-subsite" },
  ];
  assert.deepEqual(productPageSuggestions(woo, pages).map(item => item.mapping.productId), ["good"]);
  assert.deepEqual(productPageSuggestions({ ...woo, providerPreset: { id: "woocommerce", config: {} } }, pages), []);
});
test("connection changes invalidate previews while mapping-only draft changes keep the picker", () => {
  const initial = server();
  assert.equal(productPageConnectionKey(initial), productPageConnectionKey({ ...initial, productPageLinks: { ...links(), policy: "source" } }));
  assert.notEqual(productPageConnectionKey(initial), productPageConnectionKey({ ...initial, endpoint: "https://other.myshopify.com/mcp" }));
  assert.notEqual(productPageConnectionKey(initial), productPageConnectionKey({ ...initial, providerPreset: { id: "shopify-storefront-catalog", config: { shopDomain: "other.myshopify.com" } } }));
});
test("catalog and WordPress preview payloads reject malformed identities and unsafe destinations", () => {
  assert.deepEqual(validateProductPreview({ products: [{ id: mapping.productId, title: "Snowboard", ignored: "remote text" }] }), { products: [{ id: mapping.productId, title: "Snowboard" }] });
  assert.throws(() => validateProductPreview({ products: [{ id: "1", title: "A" }, { id: "1", title: "B" }] }));
  assert.throws(() => validateProductPreview({ products: Array.from({ length: 21 }, (_, index) => ({ id: String(index), title: "A" })) }));
  assert.throws(() => validateProductPreview({ products: [{ id: " ", title: "A" }] }));
  assert.throws(() => validateProductPages({ siteUrl, page: 1, hasMore: false, pages: [{ postId: 1, title: "A", url: `${siteUrl}cart/`, identities: [] }] }));
  assert.equal(validProductPageUrl(`${siteUrl}xmlrpc.php`, siteUrl), false);
  assert.deepEqual(validateProductPages({ siteUrl, page: 1, hasMore: false, pages: [{ postId: 1, title: "", url: mapping.publicUrl, identities: [] }] }).pages[0].title, "");
});
test("WordPress page picker uses same-origin nonce GET and preserves cancellation", async () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://owner.example.com", href: "https://owner.example.com/wp-admin/" } } });
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const controller = new AbortController();
  globalThis.fetch = (async (url, init) => { calls.push({ url: new URL(String(url)), init }); return new Response(JSON.stringify({ siteUrl, page: 2, hasMore: false, pages: [] }), { status: 200 }); }) as typeof fetch;
  try {
    await requestProductPages("/wp-json/ai-kit/v1/", "fixture-nonce", "snow board", 2, controller.signal);
    assert.equal(calls[0].url.pathname, "/wp-json/ai-kit/v1/answers-product-pages");
    assert.equal(calls[0].url.searchParams.get("search"), "snow board");
    assert.equal(calls[0].url.searchParams.get("page"), "2");
    assert.equal(calls[0].url.searchParams.get("perPage"), "20");
    assert.deepEqual(calls[0].init?.headers, { "X-WP-Nonce": "fixture-nonce" });
    assert.equal(calls[0].init?.credentials, "same-origin");
    assert.equal(calls[0].init?.signal, controller.signal);
    assert.equal(calls[0].init?.method, undefined);
    await assert.rejects(requestProductPages("https://other.example.com/api", "nonce", ""), /this WordPress site's API/);
    await assert.rejects(requestProductPages("/api", "nonce", "x".repeat(201)), /shorter/);
    assert.equal(calls.length, 1);
    globalThis.fetch = (async () => new Response(JSON.stringify({ siteUrl: "https://other.example.com/", page: 1, hasMore: false, pages: [] }))) as typeof fetch;
    await assert.rejects(requestProductPages("/api", "nonce", ""), /another site/);
  } finally { globalThis.fetch = oldFetch; if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else Reflect.deleteProperty(globalThis, "window"); }
});
