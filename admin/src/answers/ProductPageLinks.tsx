import { Accordion, Alert, Button, Card, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import type { ConnectionServer, ProductPageLinks as Links, ProductPreview, ProductPreviewRequest } from "./connection-types";
import { productMappingKey, productPageLocale, productPageSuggestions, requestProductPages, validateProductPreview, validProductPageLinks, type ProductPages } from "./product-page-links";

/** Owner-reviewed destination links only. The parent owns the revision-checked Save/Finish. */
export default function ProductPageLinks({ server, supported, restUrl, nonce, disabled = false, previewProducts, onChange, openHelp }: {
  server: ConnectionServer; supported: boolean; restUrl?: string; nonce?: string; disabled?: boolean;
  previewProducts: (request: ProductPreviewRequest) => Promise<ProductPreview>;
  onChange: (server: ConnectionServer) => void; openHelp?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductPreview["products"]>([]);
  const [catalogSearched, setCatalogSearched] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [pageQuery, setPageQuery] = useState("");
  const [pages, setPages] = useState<ProductPages | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [locale, setLocale] = useState("");
  const [productBusy, setProductBusy] = useState(false);
  const [pageBusy, setPageBusy] = useState(false);
  const [error, setError] = useState("");
  const productGeneration = useRef(0);
  const pageGeneration = useRef(0);
  const pageRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { productGeneration.current += 1; pageGeneration.current += 1; pageRequest.current?.abort(); }, []);
  const config = server.productPageLinks;
  const mappings = config?.mappings ?? [];
  const canReadCatalog = server.tools.some(tool => tool.name === "search_catalog" && tool.policyClass === "read" && tool.readOnlyConfirmed);
  const ready = supported && Boolean(restUrl && nonce) && !disabled;
  const page = pages?.pages.find(item => String(item.postId) === pageId);
  const suggestions = pages ? productPageSuggestions(server, pages) : [];
  const sameSite = !config || !mappings.length || !pages || new URL(config.siteUrl).href === new URL(pages.siteUrl).href;
  const stage = (next: Links) => {
    if (!ready || !validProductPageLinks(next)) { setError("Choose valid public pages and language tags. Up to 50 unique mappings can be saved."); return; }
    onChange({ ...server, productPageLinks: next }); setError("");
  };
  const searchProducts = async () => {
    if (!ready || !canReadCatalog || !query.trim() || query.length > 500) return;
    const generation = ++productGeneration.current;
    setProducts([]); setCatalogSearched(false); setProductId(null); setProductBusy(true); setError("");
    try {
      const result = validateProductPreview(await previewProducts({ operation: "previewProducts", server, query: query.trim() }));
      if (productGeneration.current === generation) { setProducts(result.products); setCatalogSearched(true); }
    } catch { if (productGeneration.current === generation) setError("Could not read matching products. Check that this connection's catalog read is approved, then try again."); }
    finally { if (productGeneration.current === generation) setProductBusy(false); }
  };
  const searchPages = async (pageNumber = 1, nextPolicy?: Links["policy"]) => {
    if (!ready || !restUrl || !nonce) return;
    const generation = ++pageGeneration.current;
    pageRequest.current?.abort(); const controller = new AbortController(); pageRequest.current = controller;
    setPageBusy(true); setPageId(null); setError("");
    try {
      const result = await requestProductPages(restUrl, nonce, pageQuery, pageNumber, controller.signal);
      if (pageGeneration.current !== generation) return;
      setPages(result);
      if (nextPolicy) {
        if (config && mappings.length && new URL(config.siteUrl).href !== new URL(result.siteUrl).href) setError("These saved links belong to a different site base. Keep them unchanged or remove them before selecting pages for this site.");
        else stage({ siteUrl: result.siteUrl, policy: nextPolicy, mappings });
      }
    } catch { if (pageGeneration.current === generation) setError("Could not load published WordPress pages. Check your admin session and that the updated AI Kit plugin is active on this HTTPS site."); }
    finally { if (pageGeneration.current === generation) setPageBusy(false); }
  };
  const selectPolicy = (policy: string | null) => {
    if (!policy || !ready) return;
    if (config) stage({ ...config, policy: policy as Links["policy"] });
    else if (pages) stage({ siteUrl: pages.siteUrl, policy: policy as Links["policy"], mappings: [] });
    else if (policy !== "source") void searchPages(1, policy as Links["policy"]);
  };
  let candidate: Links["mappings"][number] | undefined;
  let localeError: string | undefined;
  try {
    const resolvedLocale = productPageLocale(locale);
    if (productId && page) candidate = { productId, publicUrl: page.url, ...(resolvedLocale ? { locale: resolvedLocale } : {}), origin: "explicit" };
  } catch { localeError = "Use a language tag such as en or hu-HU, or leave it empty for any language."; }
  const duplicate = candidate && mappings.some(row => productMappingKey(row) === productMappingKey(candidate!));
  const add = (row: Links["mappings"][number]) => {
    const siteUrl = pages?.siteUrl;
    if (!ready || !sameSite || !siteUrl || mappings.length >= 50 || mappings.some(item => productMappingKey(item) === productMappingKey(row))) return;
    stage({ siteUrl, policy: config?.policy ?? "source", mappings: [...mappings, row] });
  };
  return <Accordion variant="contained"><Accordion.Item value="destinations"><Accordion.Control>Product destination pages</Accordion.Control><Accordion.Panel><Stack gap="sm">
    <Group justify="space-between"><Text size="sm">Product details, prices and availability still come from the catalog. You can choose published pages on this WordPress site for product links.</Text>{openHelp && <Button variant="subtle" size="compact-xs" onClick={openHelp}>Product page link help</Button>}</Group>
    {!supported && <Alert color="blue">Update your AI Kit backend to use product page links. Existing mappings are preserved; no settings are changed here.</Alert>}
    {supported && (!restUrl || !nonce) && <Alert color="blue">Published page selection needs a connected WordPress admin session.</Alert>}
    <Select label="Where product links open" data={[
      { value: "source", label: "Original store pages" },
      { value: "prefer-local", label: "WordPress pages, with original store fallback" },
      { value: "local-only", label: "WordPress pages only" },
    ]} value={config?.policy ?? "source"} disabled={!ready || pageBusy} onChange={selectPolicy} comboboxProps={{ withinPortal: true, zIndex: 100002 }} />
    <Text size="sm" c="dimmed">With WordPress-only links, products without an approved matching page have no product link. Save profile or Finish setup to apply this draft.</Text>
    {supported && <>
      {!canReadCatalog && <Alert color="blue">Approve this connection's read-only catalog search before looking up products.</Alert>}
      <TextInput label="Search live catalog products" description="Search by a product name or category. No assistant call is made." maxLength={500} value={query} disabled={!ready || !canReadCatalog}
        onChange={event => { productGeneration.current += 1; setProductBusy(false); setQuery(event.currentTarget.value); setProducts([]); setCatalogSearched(false); setProductId(null); }} />
      <Button variant="light" loading={productBusy} disabled={!ready || !canReadCatalog || !query.trim()} onClick={() => void searchProducts()}>Search catalog products</Button>
      {catalogSearched && !productBusy && <Text size="sm">{products.length ? "Showing the first catalog matches. Refine your search to find a specific product." : "No matching catalog products. Try a more specific product name or category."}</Text>}
      {!productBusy && products.length > 0 && <Select label="Catalog product" searchable value={productId} data={products.map(product => ({ value: product.id, label: `${product.title} — ${product.id}` }))} disabled={!ready} onChange={setProductId} comboboxProps={{ withinPortal: true, zIndex: 100002 }} />}
      <TextInput label="Search published WordPress pages" description="Choose a public page or product page from this site. Draft and password-protected pages are excluded." maxLength={200} value={pageQuery} disabled={!ready}
        onChange={event => { pageGeneration.current += 1; pageRequest.current?.abort(); setPageBusy(false); setPageQuery(event.currentTarget.value); setPages(null); setPageId(null); }} />
      <Group><Button variant="light" loading={pageBusy} disabled={!ready} onClick={() => void searchPages()}>Find published pages</Button>
        {pages && <><Button size="compact-xs" variant="subtle" disabled={!ready || pageBusy || pages.page <= 1} onClick={() => void searchPages(pages.page - 1)}>Previous pages</Button><Text size="sm">Page {pages.page}</Text><Button size="compact-xs" variant="subtle" disabled={!ready || pageBusy || !pages.hasMore} onClick={() => void searchPages(pages.page + 1)}>Next pages</Button></>}
      </Group>
      {pages && !pages.pages.length && <Text size="sm">No eligible published pages match this search.</Text>}
      {pages && pages.pages.length > 0 && <Select label="Published WordPress page" searchable value={pageId} disabled={!ready || pageBusy}
        data={pages.pages.map(item => ({ value: String(item.postId), label: `${item.title || "(Untitled page)"}${item.locale ? ` (${item.locale})` : ""} — ${item.url}` }))}
        onChange={value => { setPageId(value); setLocale(pages.pages.find(item => String(item.postId) === value)?.locale ?? ""); }} comboboxProps={{ withinPortal: true, zIndex: 100002 }} />}
      {!sameSite && <Alert color="red">Saved links belong to another site base. Remove those mappings before adding pages from this site.</Alert>}
      <TextInput label="Mapping language (optional)" description="A matching visitor language uses this page. Empty means any language. The selected page's language is filled when available." maxLength={35} value={locale} error={localeError} disabled={!ready} onChange={event => setLocale(event.currentTarget.value)} />
      {duplicate && <Text size="sm">This product already has an explicit mapping for that language. Remove it first to change its destination.</Text>}
      <Button disabled={!ready || !sameSite || !candidate || Boolean(duplicate) || mappings.length >= 50 || pageBusy} onClick={() => { if (candidate) add(candidate); }}>Add selected pair to draft</Button>
      {suggestions.length > 0 && <Stack gap="xs"><Text fw={600} size="sm">Review product identities supplied by an installed integration</Text><Text size="sm">These suggestions match this exact provider and store. Each one needs your approval.</Text>
        {suggestions.map(({ title, mapping }) => <Card key={productMappingKey(mapping)} withBorder padding="xs"><Stack gap="xs"><Text size="sm" style={{ overflowWrap: "anywhere" }}>{title} — {mapping.productId}{mapping.locale ? ` (${mapping.locale})` : ""}</Text><Text size="sm" style={{ overflowWrap: "anywhere" }}>{mapping.publicUrl}</Text><Button size="compact-xs" variant="light" disabled={!ready || !sameSite || mappings.length >= 50 || mappings.some(row => productMappingKey(row) === productMappingKey(mapping))} onClick={() => add(mapping)}>Add discovered mapping to draft</Button></Stack></Card>)}
      </Stack>}
    </>}
    {error && <Alert color="red" role="alert">{error}</Alert>}
    <Text size="sm">{mappings.length} / 50 approved page mappings in this draft</Text>
    {mappings.map((mapping, index) => <Card key={`${index}-${productMappingKey(mapping)}`} withBorder padding="xs"><Stack gap="xs"><Text size="sm" style={{ overflowWrap: "anywhere" }}>{mapping.productId}{mapping.locale ? ` (${mapping.locale})` : " (any language)"} · {mapping.origin}</Text><Text size="sm" style={{ overflowWrap: "anywhere" }}>{mapping.publicUrl}</Text><Button size="compact-xs" variant="subtle" color="red" disabled={!ready} onClick={() => { if (config) stage({ ...config, mappings: mappings.filter((_, rowIndex) => rowIndex !== index) }); }}>Remove mapping from draft</Button></Stack></Card>)}
  </Stack></Accordion.Panel></Accordion.Item></Accordion>;
}
