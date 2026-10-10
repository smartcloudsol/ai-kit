import type { ConnectionServer, ProductPageLinks, ProductPreview } from "./connection-types";

export interface ProductPage {
  postId: number; title: string; url: string; locale?: string;
  identities: Array<{ providerId: string; sourceOrigin: string; productId: string }>;
}
export interface ProductPages {
  siteUrl: string; pages: ProductPage[]; page: number; hasMore: boolean;
}

/** Changing a connection invalidates previews; changing its mapping draft does not. */
export function productPageConnectionKey(server: ConnectionServer): string {
  const connection = { ...server };
  delete connection.productPageLinks;
  return JSON.stringify(connection);
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const safeText = (value: unknown, max: number): value is string => typeof value === "string" && Boolean(value.trim()) && value.length <= max &&
  Array.from(value).every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);

export function productPageLocale(value: string): string | undefined {
  if (!value) return undefined;
  if (!safeText(value, 35) || value.toLowerCase() === "auto" || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(value)) throw new Error("Use a valid language tag, such as en or hu-HU.");
  try { return Intl.getCanonicalLocales(value)[0]; } catch { throw new Error("Use a valid language tag, such as en or hu-HU."); }
}

function publicPageUrl(value: unknown): URL | undefined {
  if (!safeText(value, 2048)) return undefined;
  if (value.includes("\\") || /%(?:2f|5c|2e|25|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)) return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.href.length > 2048 || url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443") ||
      !host.includes(".") || /^[\d.]+$/.test(host) || !/^[a-z0-9.-]+$/.test(host) || host.endsWith(".") ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host) ||
      /(?:^|\/)(?:wp-admin|wp-login\.php|xmlrpc\.php|wp-json|api|admin|cart|checkout)(?:\/|$)/i.test(decodeURIComponent(url.pathname))) return undefined;
    const seen = new Set<string>();
    for (const [key, entry] of url.searchParams) {
      if (seen.has(key)) return undefined;
      seen.add(key);
      if (key === "p" || key === "page_id") { if (!/^[1-9][0-9]{0,15}$/.test(entry)) return undefined; }
      else if (key === "lang") { if (!productPageLocale(entry)) return undefined; }
      else return undefined;
    }
    return url;
  } catch { return undefined; }
}

function publicSiteUrl(value: unknown): URL | undefined {
  const url = publicPageUrl(value);
  if (!url || url.search) return undefined;
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  if (url.href.length > 2048) return undefined;
  return url;
}

export function validProductPageUrl(value: unknown, siteUrl: string): value is string {
  const site = publicSiteUrl(siteUrl);
  if (!site) return false;
  try {
    const url = publicPageUrl(value);
    if (!url || url.origin !== site.origin) return false;
    const base = site.pathname.replace(/\/+$/, "");
    if (base && url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return false;
    return true;
  } catch { return false; }
}

export function productMappingKey(mapping: ProductPageLinks["mappings"][number]): string {
  return JSON.stringify([mapping.productId, mapping.locale ? productPageLocale(mapping.locale)?.toLowerCase() : "", mapping.origin]);
}

export function validProductPageLinks(value: unknown): value is ProductPageLinks {
  try { if (new TextEncoder().encode(JSON.stringify(value)).length > 96 * 1024) return false; } catch { return false; }
  if (!record(value) || Object.keys(value).some(key => !["siteUrl", "policy", "mappings"].includes(key)) ||
    !publicSiteUrl(value.siteUrl) || !["source", "prefer-local", "local-only"].includes(value.policy as string) ||
    !Array.isArray(value.mappings) || value.mappings.length > 50) return false;
  const keys = new Set<string>();
  for (const row of value.mappings) {
    if (!record(row) || Object.keys(row).some(key => !["productId", "publicUrl", "locale", "origin"].includes(key)) ||
      !safeText(row.productId, 256) || !validProductPageUrl(row.publicUrl, value.siteUrl as string) ||
      !["explicit", "discovered"].includes(row.origin as string)) return false;
    try { if (row.locale !== undefined && (typeof row.locale !== "string" || !productPageLocale(row.locale))) return false; }
    catch { return false; }
    const key = productMappingKey(row as unknown as ProductPageLinks["mappings"][number]);
    if (keys.has(key)) return false;
    keys.add(key);
  }
  return true;
}

export function validateProductPreview(value: unknown): ProductPreview {
  if (!record(value) || !Array.isArray(value.products) || value.products.length > 20 || value.products.some(product =>
    !record(product) || !safeText(product.id, 256) || !safeText(product.title, 256))) throw new Error("The catalog returned an unsupported product list.");
  const products = value.products as ProductPreview["products"];
  if (new Set(products.map(product => product.id)).size !== products.length) throw new Error("The catalog returned duplicate product identities.");
  return { products: products.map(product => ({ id: product.id, title: product.title, ...(typeof product.sourceUrl === "string" ? { sourceUrl: product.sourceUrl } : {}) })) };
}

export function validateProductPages(value: unknown): ProductPages {
  if (!record(value) || !publicSiteUrl(value.siteUrl) || !Array.isArray(value.pages) || value.pages.length > 20 ||
    !Number.isSafeInteger(value.page) || (value.page as number) < 1 || typeof value.hasMore !== "boolean") throw new Error("Product page links need published HTTPS pages on this WordPress site.");
  for (const page of value.pages) {
    if (!record(page) || !Number.isSafeInteger(page.postId) || (page.postId as number) < 1 || !(page.title === "" || safeText(page.title, 1000)) ||
      !validProductPageUrl(page.url, value.siteUrl as string) || !Array.isArray(page.identities) || page.identities.length > 20 || page.identities.some(identity =>
        !record(identity) || !safeText(identity.providerId, 100) || !safeText(identity.sourceOrigin, 2048) || !safeText(identity.productId, 256))) throw new Error("The WordPress page list contains an unsupported page or identity.");
    if (page.locale !== undefined) { if (typeof page.locale !== "string" || !productPageLocale(page.locale)) throw new Error("A WordPress page has an invalid language tag."); }
  }
  return value as unknown as ProductPages;
}

/** Trusted plugin identities can suggest a mapping only inside the exact connection's namespace. */
export function productPageSuggestions(server: ConnectionServer, pages: ProductPages): Array<{ title: string; mapping: ProductPageLinks["mappings"][number] }> {
  const providerId = server.providerPreset?.id;
  let sourceOrigin: string | undefined;
  try {
    const domain = server.providerPreset?.config.shopDomain;
    const source = typeof domain === "string" ? publicSiteUrl(`https://${domain}/`) : publicSiteUrl(server.providerPreset?.config.siteUrl);
    sourceOrigin = source?.href;
  } catch { return []; }
  if (!providerId || !sourceOrigin) return [];
  const seen = new Set<string>();
  return pages.pages.flatMap(page => page.identities.flatMap(identity => {
    if (identity.providerId !== providerId || publicSiteUrl(identity.sourceOrigin)?.href !== sourceOrigin) return [];
    const mapping: ProductPageLinks["mappings"][number] = { productId: identity.productId, publicUrl: page.url,
      ...(page.locale ? { locale: productPageLocale(page.locale) } : {}), origin: "discovered" };
    if (!validProductPageLinks({ siteUrl: pages.siteUrl, policy: "source", mappings: [mapping] })) return [];
    const key = productMappingKey(mapping);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ title: page.title || "(Untitled page)", mapping }];
  }));
}

export async function requestProductPages(restUrl: string, nonce: string, search: string, page = 1, signal?: AbortSignal): Promise<ProductPages> {
  if (search.length > 200 || !Number.isSafeInteger(page) || page < 1) throw new Error("Use a shorter page search and a valid page number.");
  const url = new URL(`${restUrl.replace(/\/$/, "")}/answers-product-pages`, window.location.href);
  if (url.origin !== window.location.origin) throw new Error("Page selection must use this WordPress site's API.");
  url.searchParams.set("search", search); url.searchParams.set("page", String(page)); url.searchParams.set("perPage", "20");
  const response = await fetch(url, { credentials: "same-origin", signal, headers: { "X-WP-Nonce": nonce } });
  if (!response.ok) throw new Error(`Could not read published WordPress pages (HTTP ${response.status}).`);
  const result = validateProductPages(await response.json());
  if (new URL(result.siteUrl).origin !== window.location.origin) throw new Error("The returned page list belongs to another site.");
  return result;
}
