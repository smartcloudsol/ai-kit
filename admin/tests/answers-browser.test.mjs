import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
const requirePublisher = createRequire(
  new URL("../../../static-publisher/exporter/package.json", import.meta.url),
);
const { build } = requirePublisher("esbuild");
const { chromium } = requirePublisher("playwright");
const dir = fileURLToPath(new URL("..", import.meta.url));
const mocks = {
  "@smart-cloud/ai-kit-core": `export const TEXT_DOMAIN="smartcloud-ai-kit";export const getAiKitPlugin=()=>({restUrl:location.origin+'/api',nonce:'fixture',view:'settings'});export const getStore=async()=>({});export const getStoreSelect=()=>({getConfig:()=>window.fixture.backend?{subscriptionType:'pro'}:null});export const reloadConfig=async()=>{};export const resolveBackend=async()=>({available:window.fixture.backend,reason:'No backend configured'});`,
  profile: `export const getConversationProfile=async()=>structuredClone(window.fixture.profile);export const updateConversationProfile=async(profile,expectedRevision)=>{window.fixture.writes.push('profile');if(window.fixture.profileFailure)throw new Error('Profile conflict');window.fixture.profile={configured:true,document:{profile,revision:'p2'}};return structuredClone(window.fixture.profile)};`,
  knowledge: `export const fetchKnowledgeSyncStatus=async()=>{if(window.fixture.failKnowledge){window.fixture.failKnowledge=false;throw new Error('Knowledge unavailable');}return structuredClone(window.fixture.knowledge)};export const updateKnowledgeSyncPolicy=async(type,policy)=>{window.fixture.writes.push(type);window.fixture.knowledge.policies[type]=policy;return {policy}};`,
  main: `export default function Main(){return 'Native detailed admin'}`,
};
async function bundle(boot = false) {
  return build({
    absWorkingDir: dir,
    stdin: {
      contents: boot
        ? `import './src/index';`
        : `import {createRoot} from 'react-dom/client';import {MantineProvider} from '@mantine/core';import Answers from './src/answers/Answers';createRoot(document.getElementById('root')).render(<MantineProvider><Answers store={window.fixture.store} context={{openHelp:id=>window.fixture.help.push(id)}}/></MantineProvider>);`,
      resolveDir: dir,
      loader: "tsx",
    },
    bundle: true,
    write: false,
    loader: { ".png": "dataurl" },
    jsx: "automatic",
    outdir: "/tmp/answers-unified-browser",
    define: { "process.env.NODE_ENV": '"production"', "process.env.WPSUITE_PREMIUM": "true" },
    plugins: [
      {
        name: "fixtures",
        setup(plugin) {
          plugin.onResolve({ filter: /.*/ }, ({ path, importer }) => {
            const name =
              path === "@smart-cloud/ai-kit-core"
                ? path
                : path.endsWith("conversation-profile/backend-client")
                ? "profile"
                : path.endsWith("kb-admin/api-client")
                ? "knowledge"
                : importer.endsWith("/src/index.tsx") &&
                  ["./main", "./diagnostics"].includes(path)
                ? "main"
                : null;
            return name ? { path: name, namespace: "mock" } : undefined;
          });
          plugin.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({
            contents: mocks[path],
            loader: "js",
          }));
        },
      },
    ],
  });
}
const normal = await bundle();
const boot = await bundle(true);
const css = await (
  await import("node:fs/promises")
).readFile(`${dir}/node_modules/@mantine/core/styles.css`, "utf8");
const wordpressCss = process.env.WPSUITE_WORDPRESS_CSS
  ? await (await import("node:fs/promises")).readFile(process.env.WPSUITE_WORDPRESS_CSS, "utf8")
  : 'input[type="checkbox"]:checked::before{content:"native checkbox"}';
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-gpu", "--disable-software-rasterizer"],
});
async function fixture({
  backend = true,
  configured = false,
  width = 1280,
  native = false,
  connected = true,
  resetSetup = false,
  failInitialKnowledge = false,
} = {}) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    ({ backend, configured, connected, failInitialKnowledge }) => {
      window.fixture = {
        backend,
        failKnowledge: failInitialKnowledge,
        store: {},
        writes: [],
        help: [],
        server: {
          connected,
          revision: "r1",
          plan: "pro",
          backend_configured: backend,
          can_edit_pages: true,
          preview_url: "https://example.test",
          values: {
            enableChatbot: configured,
            title: configured ? "Existing title" : "",
            greeting: "Welcome",
            placeholder: "Ask",
            openButtonPosition: "bottom-right",
            brandColor: "",
          },
        },
        profile: {
          configured,
          document: {
            revision: configured ? "p1" : null,
            profile: {
              identity: {
                assistantName: "Existing identity",
                role: "Guide",
                sitePurpose: "Products",
              },
              response: { tone: "Clear", defaultLanguage: "auto" },
              context: { markdown: "Facts" },
              guidance: {
                primaryGoals: ["Help"],
                conversionGoals: ["Preserve"],
              },
              tools: {
                knowledgeBase: { enabled: false, maxResults: 5 },
                calculator: { enabled: true },
              },
            },
          },
        },
        knowledge: {
          policies: {},
          availablePostTypes: [
            {
              value: "post",
              label: "Posts",
              taxonomies: [{ value: "category", label: "Categories" }],
            },
          ],
        },
      };
    },
    { backend, configured, connected, failInitialKnowledge },
  );
  let onboardingCompleted = false;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/answers-onboarding") {
      const failure = await page.evaluate(() => window.fixture.onboardingFailure);
      if (failure) return route.fulfill({ status: 503, contentType: "application/json", body: '{}' });
      if (route.request().method() === "POST") {
        assert.deepEqual(route.request().postDataJSON(), { completed: true });
        onboardingCompleted = true;
        await page.evaluate(() => { window.fixture.completionWrites = (window.fixture.completionWrites || 0) + 1; });
      }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ completed: onboardingCompleted }) });
    }
    if (url.pathname === "/api/answers-settings") {
      if (route.request().method() === "POST") {
        const input = route.request().postDataJSON();
        const result = await page.evaluate((input) => {
          window.fixture.writes.push("appearance");
          if (window.fixture.appearanceFailure) return null;
          Object.assign(window.fixture.server.values, input.values);
          window.fixture.server.revision = "r2";
          return window.fixture.server;
        }, input);
        return route.fulfill({
          status: result ? 200 : 503,
          contentType: "application/json",
          body: JSON.stringify(
            result || { message: "Settings service unavailable" },
          ),
        });
      }
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(await page.evaluate(() => window.fixture.server)),
      });
    }
    return route.fulfill({
      contentType: "text/html",
      body: `<html><head><style>${css}</style><style>${(native ? boot : normal).outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n")}</style><style>${wordpressCss}</style></head><body class="wp-admin wp-core-ui"><div id="root"></div>${
        native
          ? '<div id="wpsuite-product-details" data-wpsuite-product="answers"><div id="smartcloud-ai-kit-admin"></div></div>'
          : ""
      }</body></html>`,
    });
  });
  await page.goto(resetSetup ? "http://answers.test/?setup=1&section=chatbot-settings#existing-anchor" : "http://answers.test");
  await page.addScriptTag({
    content: (native ? boot : normal).outputFiles.find((file) =>
      file.path.endsWith(".js"),
    ).text,
  });
  if (native)
    await page.evaluate(() =>
      window.smartcloudWpSuiteSurfaces.answers(
        document.getElementById("root"),
        { openHelp: (id) => window.fixture.help.push(id) },
      ),
    );
  if (failInitialKnowledge) {
    await page.getByRole("button", { name: "Retry loading setup" }).waitFor();
  } else {
    await page.getByText(configured && !resetSetup ? "Answers setup" : "Set up Answers", { exact: true }).waitFor();
  }
  return { page, errors };
}
async function fillWizard(page) {
  await page
    .getByRole("switch", { name: "Show the assistant across this site" })
    .check();
  assert.equal(await page.getByRole("switch").evaluate(node => getComputedStyle(node, "::before").content), "none");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Assistant name", exact: true })
    .fill("Mira");
  await page
    .getByRole("textbox", { name: "Brand color", exact: true })
    .fill("#123abc");
  await page
    .getByRole("heading", { name: "Set up Answers", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const roleLabel = page.getByText("Assistant role", { exact: true }).locator("xpath=ancestor::label");
  const alignedRequired = await roleLabel.evaluate(label => {
    const helper = label.querySelector("span");
    const required = label.querySelector(".mantine-InputWrapper-required");
    if (!helper || !required) return false;
    const h = helper.getBoundingClientRect();
    const r = required.getBoundingClientRect();
    return r.top < h.bottom && r.bottom > h.top;
  });
  assert.equal(alignedRequired, true, "Required marker stays on the help label line");
  assert.equal(await page.getByRole("textbox", { name: "Assistant role", exact: true }).getAttribute("aria-describedby") !== null, true);
  await page.screenshot({ path: "/tmp/wpsuite-polish-ai/behavior-step.png", fullPage: true });
  await page
    .getByRole("textbox", { name: "Assistant role", exact: true })
    .fill("Documentation guide");
  await page
    .getByRole("textbox", { name: "Site purpose", exact: true })
    .fill("Product help");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Knowledge content", exact: true })
    .click();
  await page.getByRole("option", { name: "Posts", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
test("wizard stages all settings, saves only at finish, then replays saved defaults", async () => {
  const { page, errors } = await fixture();
  try {
    await fillWizard(page);
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    await page.getByRole("button", { name: "Finish setup" }).click();
    await page.getByText("Answers setup", { exact: true }).waitFor();
    await page.screenshot({ path: "/tmp/wpsuite-unified-answers-desktop.png", fullPage: true });
    const state = await page.evaluate(() => window.fixture);
    assert.deepEqual(state.writes, ["profile", "post", "appearance"]);
    assert.equal(state.profile.document.profile.identity.assistantName, "Mira");
    assert.equal(
      state.profile.document.profile.tools.knowledgeBase.enabled,
      true,
    );
    assert.deepEqual(state.knowledge.policies.post.includeTaxonomies, [
      "category",
    ]);
    await page.getByRole("button", { name: "Run setup again" }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.equal(
      await page
        .getByRole("textbox", { name: "Assistant name", exact: true })
        .inputValue(),
      "Mira",
    );
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});
test("partial service failure retains edits and retries appearance only", async () => {
  const { page } = await fixture();
  try {
    await fillWizard(page);
    await page.evaluate(() => (window.fixture.appearanceFailure = true));
    await page.getByRole("button", { name: "Finish setup" }).click();
    await page.getByText(/Some changes were saved/).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.completionWrites || 0), 0);
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), [
      "profile",
      "post",
      "appearance",
    ]);
    await page.evaluate(() => (window.fixture.appearanceFailure = false));
    await page.getByRole("button", { name: "Retry remaining changes" }).click();
    await page.getByText("Answers setup", { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), [
      "profile",
      "post",
      "appearance",
      "appearance",
    ]);
  } finally {
    await page.close();
  }
});
test("without connection or backend content setup is available and cancel performs no writes", async () => {
  const { page } = await fixture({ backend: false, connected: false });
  try {
    assert.equal(await page.getByRole("switch").isDisabled(), true);
    assert.equal(await page.getByRole("switch").evaluate(input => getComputedStyle(input).opacity), "0", "Disabled Mantine input stays hidden under WordPress checkbox styles.");
    await page.screenshot({ path: "/tmp/wpsuite-ai-kit-switch/answers-disconnected.png", fullPage: true });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Knowledge content", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
  } finally {
    await page.close();
  }
});
test("actual index mounts native details and Answers together; mobile tools show guidance without repeated destination actions", async () => {
  const { page, errors } = await fixture({
    configured: true,
    native: true,
    width: 390,
  });
  try {
    await page.getByText("Native detailed admin").waitFor();
    await page
      .getByRole("button", { name: "AI Tools · More from AI-Kit" })
      .click();
    await page.getByRole("button", { name: "How to use it" }).first().waitFor();
    assert.equal(
      await page.getByRole("button", { name: "How to use it" }).count(),
      3,
    );
    assert.equal(
      await page
        .getByRole("link", { name: /Open Posts|Write a new post/ })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "How to use it" }).first().click();
    assert.deepEqual(await page.evaluate(() => window.fixture.help), [
      "ai-tools-editor",
    ]);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await page.screenshot({ path: "/tmp/wpsuite-unified-answers-mobile.png", fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});
test("return from detailed settings refreshes summary and replay, while an open wizard keeps edits", async () => {
  const { page } = await fixture({ configured: true });
  try {
    await page.evaluate(() => { window.fixture.server.values.title = "Title saved in details"; window.dispatchEvent(new Event("wpsuite-product-summary-open")); });
    await page.getByText("Answers setup", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Run setup again" }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.equal(await page.getByRole("textbox", { name: "Assistant name", exact: true }).inputValue(), "Title saved in details");
    await page.getByRole("textbox", { name: "Assistant name", exact: true }).fill("Unsaved wizard name");
    await page.evaluate(() => { window.fixture.server.values.title = "Another saved title"; window.dispatchEvent(new Event("wpsuite-product-summary-open")); });
    assert.equal(await page.getByRole("textbox", { name: "Assistant name", exact: true }).inputValue(), "Unsaved wizard name");
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
  } finally { await page.close(); }
});
test("reset intent opens Answers despite retained cloud configuration, preserves defaults and consumes intent once", async () => {
  const { page, errors } = await fixture({ configured: true, resetSetup: true });
  try {
    assert.equal(await page.getByRole("switch", { name: "Show the assistant across this site" }).isChecked(), true);
    assert.equal(new URL(page.url()).searchParams.has("setup"), false);
    assert.equal(new URL(page.url()).searchParams.get("section"), "chatbot-settings");
    assert.equal(new URL(page.url()).hash, "#existing-anchor");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.equal(await page.getByRole("textbox", { name: "Assistant name", exact: true }).inputValue(), "Existing title");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.equal(await page.getByRole("textbox", { name: "Assistant role", exact: true }).inputValue(), "Guide");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.evaluate(() => window.dispatchEvent(new Event("wpsuite-product-summary-open")));
    await page.getByText("Answers setup", { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
test("failed initial Answers load keeps reset intent until a successful retry", async () => {
  const { page } = await fixture({ configured: true, resetSetup: true, failInitialKnowledge: true });
  try {
    assert.equal(new URL(page.url()).searchParams.get("setup"), "1");
    await page.getByRole("button", { name: "Retry loading setup" }).click();
    await page.getByText("Set up Answers", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.has("setup"), false);
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
  } finally { await page.close(); }
});
test.after(async () => {
  await browser.close();
});

test("finishing with every feature off persists completion and reload stays closed", async () => {
  const { page } = await fixture({ backend: false, connected: false });
  try {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Finish setup", exact: true }).click();
    await page.getByText("Answers setup", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.completionWrites), 1);
    assert.deepEqual(await page.evaluate(() => window.fixture.writes), []);
    await page.reload();
    await page.addScriptTag({ content: normal.outputFiles.find(file => file.path.endsWith(".js")).text });
    await page.getByText("Answers setup", { exact: true }).waitFor();
    assert.equal(await page.getByText("Set up Answers", { exact: true }).count(), 0);
  } finally { await page.close(); }
});

test("failed completion save retains wizard and allows retry; canceled setup never marks completion", async () => {
  const { page } = await fixture({ backend: false, connected: false });
  try {
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixture.completionWrites || 0), 0);
    await page.getByRole("button", { name: "Run setup again" }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.evaluate(() => { window.fixture.onboardingFailure = true; });
    await page.getByRole("button", { name: "Finish setup", exact: true }).click();
    await page.getByText(/Setup completion could not be saved/).waitFor();
    assert.equal(await page.evaluate(() => window.fixture.completionWrites || 0), 0);
    await page.evaluate(() => { window.fixture.onboardingFailure = false; });
    await page.getByRole("button", { name: "Finish setup", exact: true }).click();
    await page.getByText("Answers setup", { exact: true }).waitFor();
  } finally { await page.close(); }
});

test("completion read failure offers retry instead of reopening completed onboarding", async () => {
  const { page } = await fixture({ backend: false, connected: false });
  try {
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.evaluate(() => { window.fixture.onboardingFailure = true; window.dispatchEvent(new Event("wpsuite-product-summary-open")); });
    await page.getByRole("button", { name: "Retry loading setup" }).waitFor();
    assert.equal(await page.getByText("Set up Answers", { exact: true }).count(), 0);
    await page.evaluate(() => { window.fixture.onboardingFailure = false; });
    await page.getByRole("button", { name: "Retry loading setup" }).click();
    await page.getByText("Set up Answers", { exact: true }).waitFor();
  } finally { await page.close(); }
});
