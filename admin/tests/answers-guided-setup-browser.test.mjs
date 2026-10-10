import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const requirePublisher = createRequire(new URL("../../../static-publisher/exporter/package.json", import.meta.url));
const { build } = requirePublisher("esbuild");
const { chromium } = requirePublisher("playwright");
const dir = fileURLToPath(new URL("..", import.meta.url));
const core = `export const TEXT_DOMAIN='smartcloud-ai-kit';export const getAiKitPlugin=()=>({restUrl:location.origin+'/api',nonce:'fixture'});export const getStoreSelect=()=>({getConfig:()=>({subscriptionType:'pro'})});export const reloadConfig=async()=>{};export const resolveBackend=async()=>({available:true});`;
const profileServices = `
export const getConversationProfile=async()=>structuredClone(window.fixture.profile);
export const previewConversationConnection=async(request)=>{window.fixture.checks.push(structuredClone(request));if(window.fixture.delayCheck)await new Promise(resolve=>window.fixture.releaseCheck=resolve);return structuredClone(window.fixture.preview)};
export const updateConversationProfile=async(profile,revision)=>{window.fixture.writes.push({profile:structuredClone(profile),revision});if(window.fixture.delaySave)await new Promise(resolve=>window.fixture.releaseSave=resolve);window.fixture.profile={...window.fixture.profile,configured:true,document:{profile:structuredClone(profile),revision:'saved-2'}};return structuredClone(window.fixture.profile)};`;
const knowledgeServices = `export const fetchKnowledgeSyncStatus=async()=>({policies:{},availablePostTypes:[]});export const updateKnowledgeSyncPolicy=async(type,policy)=>({policy});`;
const bundle = await build({
  absWorkingDir: dir,
  stdin: { contents: `import{createRoot}from'react-dom/client';import{useState}from'react';import{MantineProvider}from'@mantine/core';import Answers from'./src/answers/Answers';import ConnectionSetup from'./src/answers/ConnectionSetup';import{adminTheme}from'./src/theme';function ConnectionHarness(){const[existing,setExisting]=useState(window.fixture.profile.document.profile.tools.externalMcpServers);return <ConnectionSetup catalog={window.fixture.profile.setup} existing={existing} previewConnection={async request=>{window.fixture.checks.push(request);return structuredClone(window.fixture.preview)}} onAdd={server=>{window.fixture.adds.push(server);setExisting(current=>[...current,server])}} onRemove={id=>setExisting(current=>current.filter(server=>server.id!==id))}/>;}createRoot(document.getElementById('root')).render(<MantineProvider theme={adminTheme}>{window.fixture.connectionOnly?<ConnectionHarness/>:<Answers store={{}} context={{openHelp:id=>window.fixture.help.push(id)}}/>}</MantineProvider>);`, loader: "tsx", resolveDir: dir },
  bundle: true, write: false, jsx: "automatic", outdir: "/tmp/answers-guided-setup-browser",
  define: { "process.env.NODE_ENV": '"production"', "process.env.WPSUITE_PREMIUM": "true" },
  plugins: [{ name: "guided-setup-services", setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, ({ path }) => {
      const name = path === "@smart-cloud/ai-kit-core" ? "core" : path.endsWith("conversation-profile/backend-client") ? "profile" : path.endsWith("kb-admin/api-client") ? "knowledge" : null;
      return name ? { path: name, namespace: "fixture" } : undefined;
    });
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "core" ? core : path === "profile" ? profileServices : knowledgeServices, loader: "js" }));
  } }],
});
const css = await readFile(`${dir}/node_modules/@mantine/core/styles.css`, "utf8");
const browser = await chromium.launch({ headless: true, args: ["--disable-gpu", "--disable-software-rasterizer"] });
test.after(async () => { await browser.close(); });

function server() {
  return {
    id: "shopify_catalog", enabled: false, purpose: "Read reviewed products", endpoint: "https://test.myshopify.com/api/ucp/mcp", serverName: "universal-commerce",
    tools: [{ name: "search_catalog", description: "Read catalog products", policyClass: "read", readOnlyConfirmed: false, inputSchema: { type: "object", properties: { query: { type: "string", maxLength: 500 } }, additionalProperties: false } }],
    providerPreset: { id: "shopify-storefront-catalog", config: { shopDomain: "test.myshopify.com", countryCode: "HU", language: "hu" } },
    protocolAdapter: { id: "ucp", config: { version: "2026-08-25", agentProfileUrl: "https://fixture.test/profile.json" } },
    localeBinding: { argumentPointer: "/catalog/context/language" },
  };
}
const catalog = {
  agentProfilePath: "/agent-profile", agentProfileUrl: "https://fixture.test/profile.json",
  connectors: [{ id: "shopify-storefront-catalog", label: "Shopify product catalog", description: "Read current published products without cart changes.", fields: [
    { id: "shopDomain", label: "Shop domain", description: "Your permanent myshopify.com domain.", required: true, maxLength: 253 },
    { id: "countryCode", label: "Market country", description: "Optional two-letter market country.", maxLength: 2 },
    { id: "language", label: "Catalog language", description: "Optional catalog language.", maxLength: 35 },
    { id: "agentProfileUrl", label: "Agent profile URL", description: "Hosted profile supplied by this backend.", required: true, advanced: true, maxLength: 2000 },
  ] }],
};
function existingProfile(connections = []) {
  return {
    identity: { assistantName: "Saved assistant", role: "Existing owner role", sitePurpose: "Existing owner purpose", audience: "Existing audience" },
    context: { markdown: "Owner context to keep." },
    response: { tone: "Owner tone", defaultLanguage: "auto" }, guidance: { primaryGoals: ["Owner task"], conversionGoals: ["Owner conversion"] },
    tools: { knowledgeBase: { enabled: false, metadataPolicy: "inherit", maxResults: 5 }, webGrounding: { enabled: false, allowedUrlPrefixes: [] }, externalMcpServers: connections, calculator: { enabled: true } },
    grounding: { defaultRequirement: "required", missingEvidenceBehavior: "decline", citationRequired: true, inheritMetadataCategoryPolicies: true },
    scope: { allowedTopics: ["Owner scope"] }, model: { modelId: "owner-model" }, safety: { guardrailIdentifier: "owner-guardrail" }, memory: { preserveEvidenceReferences: true }, actions: [{ id: "owner-action" }],
  };
}
async function fixture({ width = 1280, height = 1000, discovery = true, connections = [], connectionOnly = false, previewServer = server() } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ profile, catalog, discovery, preview, connectionOnly }) => {
    window.fixture = {
      checks: [], writes: [], help: [], adds: [], preview, connectionOnly,
      profile: { configured: true, ...(discovery ? { setup: catalog } : {}), document: { profile, revision: "profile-1" } },
      appearance: { connected: true, revision: "appearance-1", plan: "pro", backend_configured: true, can_edit_pages: true, preview_url: "https://fixture.test/", values: { enableChatbot: true, title: "Saved assistant", greeting: "Hello", placeholder: "Ask", openButtonPosition: "bottom-right", brandColor: "" } },
    };
  }, { profile: existingProfile(connections), catalog, discovery, connectionOnly, preview: { connectorId: "shopify-storefront-catalog", server: previewServer, operationLabels: { search_catalog: "Search published products" } } });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/answers-onboarding") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ completed: true }) });
    if (url.pathname === "/api/answers-settings") return route.fulfill({ contentType: "application/json", body: JSON.stringify(await page.evaluate(() => window.fixture.appearance)) });
    return route.fulfill({ contentType: "text/html", body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n${bundle.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n')}\nbody{margin:0}#root{padding:12px;box-sizing:border-box}</style></head><body><div id="root"></div></body></html>` });
  });
  await page.goto("http://guided.test/?setup=1");
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });
  if (connectionOnly) { await page.getByRole("textbox", { name: "Optional service", exact: true }).waitFor(); return { page, errors }; }
  await page.getByRole("heading", { name: "Set up Answers", exact: true }).waitFor();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("textbox", { name: "Profile starting point", exact: true }).waitFor();
  return { page, errors };
}
async function choosePreset(page, label = "Product discovery") {
  await page.getByRole("textbox", { name: "Profile starting point", exact: true }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await page.getByRole("textbox", { name: "Site or business name", exact: true }).fill("Northstar");
  await page.getByRole("textbox", { name: "What should visitors achieve on this site?", exact: true }).fill("Help visitors compare outdoor equipment.");
}
async function chooseConnection(page) {
  await page.getByRole("textbox", { name: "Optional service", exact: true }).click();
  await page.getByRole("option", { name: "Shopify product catalog", exact: true }).click();
  await page.getByRole("textbox", { name: "Shop domain", exact: true }).fill("test.myshopify.com");
}
async function reviewConnection(page) {
  await chooseConnection(page);
  await page.getByRole("button", { name: "Check connection and available reads", exact: true }).click();
  await page.getByText("Review this connection", { exact: true }).waitFor();
}
async function finish(page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await page.getByRole("heading", { name: "Answers setup", exact: true }).waitFor();
}

test("real wizard preset selection and preview never save; explicit apply preserves advanced profile", async () => {
  const { page, errors } = await fixture();
  try {
    const original = await page.evaluate(() => window.fixture.profile.document.profile);
    await choosePreset(page);
    assert.equal(await page.getByRole("textbox", { name: "Assistant role", exact: true }).inputValue(), original.identity.role);
    await page.getByRole("textbox", { name: "Main topics, services or product categories", exact: true }).fill("Snowboards\nProtective equipment");
    await page.getByRole("button", { name: "Preview assistant profile", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    await page.getByRole("button", { name: "Apply reviewed profile", exact: true }).click();
    assert.match(await page.getByRole("textbox", { name: "General context", exact: true }).inputValue(), /^Owner context to keep\./);
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    await finish(page);
    const written = await page.evaluate(() => window.fixture.writes[0]);
    assert.equal(written.revision, "profile-1");
    assert.match(written.profile.identity.role, /Northstar/);
    for (const key of ["tools", "model", "scope", "safety", "memory", "actions", "grounding"]) assert.deepEqual(written.profile[key], original[key]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

for (const width of [1280, 360]) {
  test(`all profile presets remain visible and clickable outside cards at ${width}px`, async () => {
    const { page, errors } = await fixture({ width, height: 480 });
    try {
      const input = page.getByRole("textbox", { name: "Profile starting point", exact: true });
      for (const label of ["Site guide", "Services and enquiries", "Product discovery", "Customer support"]) {
        await input.click();
        const options = page.getByRole("option");
        await options.first().waitFor();
        await page.waitForTimeout(150);
        assert.equal(await options.count(), 4);
        for (const option of await options.all()) {
          const visibility = await option.evaluate(element => {
            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
            return { label: element.textContent, inViewport: rect.top >= 0 && rect.bottom <= innerHeight,
              hit: element.contains(document.elementFromPoint(x, y)) };
          });
          assert.ok(visibility.inViewport && visibility.hit, JSON.stringify(visibility));
        }
        await page.getByRole("option", { name: label, exact: true }).click();
        await page.waitForFunction(({ label }) => document.querySelector('[aria-label="Profile starting point"]')?.value === label || Array.from(document.querySelectorAll("input")).some(input => input.value === label), { label });
        assert.equal(await input.inputValue(), label);
      }
      assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}

test("admin textareas allow vertical resizing and scroll after reaching their bound", async () => {
  const { page, errors } = await fixture({ width: 1280, height: 1000 });
  try {
    await choosePreset(page, "Product discovery");
    await page.getByRole("button", { name: "Preview assistant profile", exact: true }).click();
    const textareas = page.locator("textarea:visible");
    assert.ok(await textareas.count() >= 6);
    for (const field of await textareas.all()) {
      const styles = await field.evaluate(element => {
        const style = getComputedStyle(element);
        return { resize: style.resize, overflow: style.overflowY, maxHeight: style.maxHeight };
      });
      assert.equal(styles.resize, "vertical");
      assert.equal(styles.overflow, "auto");
      assert.notEqual(styles.maxHeight, "none");
    }
    const field = page.getByRole("textbox", { name: "Main topics, services or product categories", exact: true });
    await field.scrollIntoViewIfNeeded();
    const before = await field.boundingBox();
    await page.mouse.move(before.x + before.width - 3, before.y + before.height - 3);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width - 3, before.y + before.height + 80, { steps: 10 });
    await page.mouse.up();
    const after = await field.boundingBox();
    assert.ok(after.height > before.height + 30, JSON.stringify({ before, after }));
    await field.fill("Catalog information\n".repeat(250));
    const bounded = await field.evaluate(element => ({ client: element.clientHeight, scroll: element.scrollHeight, height: element.getBoundingClientRect().height }));
    assert.ok(bounded.height <= 600 && bounded.scroll > bounded.client, JSON.stringify(bounded));
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("preset preview remains bounded and fits a narrow viewport with long owner text", async () => {
  const { page, errors } = await fixture({ width: 360 });
  try {
    await choosePreset(page, "Site guide");
    const name = page.getByRole("textbox", { name: "Site or business name", exact: true });
    await name.fill("N".repeat(120));
    assert.equal(await name.getAttribute("maxlength"), "120");
    const purpose = page.getByRole("textbox", { name: "What should visitors achieve on this site?", exact: true });
    await purpose.fill("https://example.test/" + "details".repeat(150));
    await page.getByRole("button", { name: "Preview assistant profile", exact: true }).click();
    await page.getByRole("textbox", { name: "Resulting general context", exact: true }).waitFor();
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(dimensions.scroll <= dimensions.viewport + 1, JSON.stringify(dimensions));
    const size = await page.getByRole("textbox", { name: "Resulting general context", exact: true }).boundingBox();
    assert.ok(size.height < 400, JSON.stringify(size));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("connection agent profile comes from the active backend and permits an explicit override", async () => {
  const { page, errors } = await fixture();
  try {
    await chooseConnection(page);
    await page.getByRole("button", { name: "Connection details", exact: true }).click();
    const field = page.getByRole("textbox", { name: "Agent profile URL", exact: true });
    assert.equal(await field.inputValue(), "https://fixture.test/profile.json");
    await page.getByRole("button", { name: "Check connection and available reads", exact: true }).click();
    await page.getByText("Review this connection", { exact: true }).waitFor();
    assert.equal((await page.evaluate(() => window.fixture.checks[0])).config.agentProfileUrl, "https://fixture.test/profile.json");
    await field.fill("https://owner.example.test/custom-profile.json");
    assert.equal(await page.getByText("Review this connection", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Check connection and available reads", exact: true }).click();
    await page.getByText("Review this connection", { exact: true }).waitFor();
    assert.equal((await page.evaluate(() => window.fixture.checks[1])).config.agentProfileUrl, "https://owner.example.test/custom-profile.json");
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("discovery produces disabled unconfirmed review; owner approval stages a unique enabled draft only", async () => {
  const originalServer = { ...server(), endpoint: "https://other.example.test/catalog/mcp", enabled: true, tools: server().tools.map(tool => ({ ...tool, readOnlyConfirmed: true })) };
  const { page, errors } = await fixture({ connections: [originalServer] });
  try {
    await reviewConnection(page);
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    assert.equal(await page.evaluate(() => window.fixture.preview.server.enabled), false);
    assert.equal(await page.evaluate(() => window.fixture.preview.server.tools[0].readOnlyConfirmed), false);
    const add = page.getByRole("button", { name: "Add reviewed connection to draft", exact: true });
    assert.equal(await add.isDisabled(), true);
    await page.getByRole("checkbox", { name: "I approve these read-only operations for this assistant", exact: true }).check();
    await add.click();
    await page.getByText(/shopify_catalog-2 \(enabled\)/).waitFor();
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    assert.equal(await page.getByRole("button", { name: "Continue", exact: true }).isDisabled(), true);
    await page.getByRole("checkbox", { name: "Allow answers grounded in these connected sources", exact: true }).check();
    await finish(page);
    const connections = await page.evaluate(() => window.fixture.writes[0].profile.tools.externalMcpServers);
    assert.equal(connections.length, 2);
    assert.deepEqual(connections[0], originalServer);
    assert.equal(connections[1].id, "shopify_catalog-2");
    assert.equal(connections[1].enabled, true);
    assert.equal(connections[1].tools[0].readOnlyConfirmed, true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("changing connection inputs or language invalidates checked approval and requires a fresh read", async () => {
  const { page, errors } = await fixture();
  try {
    await reviewConnection(page);
    await page.getByRole("checkbox", { name: "I approve these read-only operations for this assistant", exact: true }).check();
    await page.getByRole("textbox", { name: "Market country", exact: true }).fill("US");
    assert.equal(await page.getByText("Review this connection", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Check connection and available reads", exact: true }).click();
    await page.getByText("Review this connection", { exact: true }).waitFor();
    assert.equal(await page.getByRole("checkbox", { name: "I approve these read-only operations for this assistant", exact: true }).isChecked(), false);
    await page.getByRole("checkbox", { name: "Use the visitor's language when the service supports it", exact: true }).uncheck();
    assert.equal(await page.getByText("Review this connection", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Check connection and available reads", exact: true }).click();
    await page.getByText("Review this connection", { exact: true }).waitFor();
    const checks = await page.evaluate(() => window.fixture.checks);
    assert.equal(checks.length, 3);
    assert.equal(checks[2].config.countryCode, "US");
    assert.equal(checks[2].useVisitorLanguage, false);
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

for (const enabled of [true, false]) {
  test(`guided discovery rejects an existing ${enabled ? "enabled" : "disabled"} endpoint with any connection ID`, async () => {
    const originalServer = { ...server(), id: "owner-catalog", enabled, endpoint: "https://TEST.myshopify.com:443/api/ucp/mcp" };
    const { page, errors } = await fixture({ connections: [originalServer] });
    try {
      await reviewConnection(page);
      const original = await page.evaluate(() => window.fixture.profile.document.profile);
      await page.getByText(/already connected as owner-catalog/).waitFor();
      await page.getByRole("checkbox", { name: "I approve these read-only operations for this assistant", exact: true }).check();
      const add = page.getByRole("button", { name: "Add reviewed connection to draft", exact: true });
      assert.equal(await add.isDisabled(), true);
      // Catalog preferences and the public agent profile do not identify a second service.
      for (const [label, value] of [["Market country", "US"], ["Catalog language", "en"], ["Agent profile URL", "https://owner.test/profile.json"]]) {
        if (label === "Agent profile URL") await page.getByRole("button", { name: "Connection details", exact: true }).click();
        await page.getByRole("textbox", { name: label, exact: true }).fill(value);
        await page.getByRole("button", { name: "Check connection and available reads", exact: true }).click();
        await page.getByText(/already connected as owner-catalog/).waitFor();
        await page.getByRole("checkbox", { name: "I approve these read-only operations for this assistant", exact: true }).check();
        assert.equal(await add.isDisabled(), true);
      }
      assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
      assert.deepEqual(await page.evaluate(() => window.fixture.profile.document.profile), original);
      await finish(page);
      assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
      assert.deepEqual(await page.evaluate(() => window.fixture.profile.document.profile), original);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}

test("the same reviewed preview is consumed once even when Add fires twice synchronously", async () => {
  const { page, errors } = await fixture({ connectionOnly: true });
  try {
    await reviewConnection(page);
    await page.getByRole("checkbox", { name: "I approve these read-only operations for this assistant", exact: true }).check();
    await page.getByRole("button", { name: "Add reviewed connection to draft", exact: true }).evaluate(button => { button.click(); button.click(); });
    await page.getByText("shopify_catalog (enabled)", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.adds.length), 1);
    await reviewConnection(page);
    await page.getByText(/already connected as shopify_catalog/).waitFor();
    await page.getByRole("checkbox", { name: "I approve these read-only operations for this assistant", exact: true }).check();
    assert.equal(await page.getByRole("button", { name: "Add reviewed connection to draft", exact: true }).isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("existing custom connections to one endpoint are preserved on an unrelated profile edit", async () => {
  const connections = [{ ...server(), id: "custom-a" }, { ...server(), id: "custom-b", purpose: "An independently reviewed custom tool selection" }];
  const { page, errors } = await fixture({ connections });
  try {
    await page.getByRole("textbox", { name: "Assistant role", exact: true }).fill("Updated owner role");
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    await finish(page);
    assert.deepEqual(await page.evaluate(() => window.fixture.writes[0].profile.tools.externalMcpServers), connections);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("draft removal allows deliberate re-add without changing saved settings until Finish", async () => {
  const originalServer = { ...server(), id: "existing-service", enabled: true };
  const { page, errors } = await fixture({ connections: [originalServer] });
  try {
    await reviewConnection(page);
    await page.getByText(/already connected as existing-service/).waitFor();
    await page.getByRole("button", { name: "Remove from draft", exact: true }).click();
    assert.equal(await page.getByText(/already connected as existing-service/).count(), 0);
    await page.getByRole("checkbox", { name: "I approve these read-only operations for this assistant", exact: true }).check();
    await page.getByRole("button", { name: "Add reviewed connection to draft", exact: true }).click();
    await page.getByText("shopify_catalog (enabled)", { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.fixture.profile.document.profile.tools.externalMcpServers), [originalServer]);
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    await page.getByRole("checkbox", { name: "Allow answers grounded in these connected sources", exact: true }).check();
    await finish(page);
    const connections = await page.evaluate(() => window.fixture.writes[0].profile.tools.externalMcpServers);
    assert.equal(connections.length, 1);
    assert.equal(connections[0].id, "shopify_catalog");
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

for (const endpoint of ["https://test.myshopify.com/api/ucp/other", "https://test.myshopify.com/api/ucp/mcp?catalog=other"]) {
  test(`distinct endpoint path or query keeps a separate draft and a collision suffix within 40 characters: ${endpoint}`, async () => {
    const id = "catalog_" + "a".repeat(32);
    const originalServer = { ...server(), id, endpoint };
    const { page, errors } = await fixture({ connections: [originalServer], previewServer: { ...server(), id } });
    try {
      await reviewConnection(page);
      await page.getByRole("checkbox", { name: "I approve these read-only operations for this assistant", exact: true }).check();
      await page.getByRole("button", { name: "Add reviewed connection to draft", exact: true }).click();
      const expectedId = id.slice(0, 38) + "-2";
      await page.getByText(`${expectedId} (enabled)`, { exact: true }).waitFor();
      assert.equal(expectedId.length, 40);
      assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
      await page.getByRole("checkbox", { name: "Allow answers grounded in these connected sources", exact: true }).check();
      await finish(page);
      const connections = await page.evaluate(() => window.fixture.writes[0].profile.tools.externalMcpServers);
      assert.deepEqual(connections[0], originalServer);
      assert.equal(connections[1].id, expectedId);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}

test("unsupported discovery keeps existing connections and opens specific setup help", async () => {
  const { page, errors } = await fixture({ discovery: false, connections: [server()] });
  try {
    await page.getByText(/Guided connections require a backend/).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Optional service", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Connection setup help", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.fixture.help), ["answers-connections"]);
    await finish(page);
    assert.deepEqual(await page.evaluate(() => window.fixture.checks), []);
    assert.deepEqual(await page.evaluate(() => window.fixture.profile.document.profile.tools.externalMcpServers), [server()]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("web source requires a valid allowlist and explicit evidence-policy review", async () => {
  const { page, errors } = await fixture();
  try {
    await page.getByRole("button", { name: "Read information from approved websites (optional)", exact: true }).click();
    await page.getByRole("checkbox", { name: "Allow web sources", exact: true }).check();
    const next = page.getByRole("button", { name: "Continue", exact: true });
    assert.equal(await next.isDisabled(), true);
    await page.getByRole("textbox", { name: "Approved HTTPS websites or sections", exact: true }).fill("https://trusted.test/help/?unsafe=yes");
    await page.getByRole("checkbox", { name: "Allow answers grounded in these connected sources", exact: true }).check();
    assert.equal(await next.isDisabled(), true);
    await page.getByRole("textbox", { name: "Approved HTTPS websites or sections", exact: true }).fill("https://trusted.test/help/");
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    await finish(page);
    const written = await page.evaluate(() => window.fixture.writes[0].profile);
    assert.deepEqual(written.tools.webGrounding, { enabled: true, allowedUrlPrefixes: ["https://trusted.test/help/"] });
    assert.deepEqual(written.grounding, { defaultRequirement: "preferred", missingEvidenceBehavior: "ask", citationRequired: true, inheritMetadataCategoryPolicies: false });
    assert.deepEqual(written.safety, { guardrailIdentifier: "owner-guardrail" });
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("connection checks lock their inputs and profile save locks wizard navigation", async () => {
  const { page, errors } = await fixture();
  try {
    await chooseConnection(page);
    await page.evaluate(() => { window.fixture.delayCheck = true; });
    await page.getByRole("button", { name: "Check connection and available reads", exact: true }).click();
    await page.waitForFunction(() => typeof window.fixture.releaseCheck === "function");
    assert.equal(await page.getByRole("textbox", { name: "Shop domain", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("textbox", { name: "Optional service", exact: true }).isDisabled(), true);
    await page.evaluate(() => window.fixture.releaseCheck());
    await page.getByText("Review this connection", { exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Shop domain", exact: true }).isEnabled(), true);
    await page.getByRole("textbox", { name: "Assistant role", exact: true }).fill("Reviewed owner role");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.evaluate(() => { window.fixture.delaySave = true; });
    await page.getByRole("button", { name: "Finish setup", exact: true }).click();
    await page.waitForFunction(() => typeof window.fixture.releaseSave === "function");
    assert.equal(await page.getByRole("button", { name: "Back", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Cancel", exact: true }).isDisabled(), true);
    await page.evaluate(() => window.fixture.releaseSave());
    await page.getByRole("heading", { name: "Answers setup", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.profile.document.profile.identity.role), "Reviewed owner role");
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("removing a connection changes only the draft until Finish and preserves stricter policy", async () => {
  const originalServer = { ...server(), enabled: true, tools: server().tools.map(tool => ({ ...tool, readOnlyConfirmed: true })) };
  const { page, errors } = await fixture({ connections: [originalServer] });
  try {
    const originalPolicy = await page.evaluate(() => window.fixture.profile.document.profile.grounding);
    await page.getByRole("button", { name: "Remove from draft", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    assert.equal(await page.getByRole("button", { name: "Remove from draft", exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.fixture.profile.document.profile.tools.externalMcpServers.length), 1);
    await finish(page);
    const written = await page.evaluate(() => window.fixture.writes[0].profile);
    assert.deepEqual(written.tools.externalMcpServers, []);
    assert.deepEqual(written.grounding, originalPolicy);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
