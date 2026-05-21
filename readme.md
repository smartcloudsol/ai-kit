# WP Suite AI-Kit

AI-Kit is a WordPress plugin that adds **private, on-device AI tools** to WordPress (Gutenberg + Media Library) — with an optional **Pro backend** that enables **backend-only** or **backend-fallback** processing when on-device AI is unavailable.

This repository contains the source code and frontend modules for the **free / OSS parts** of the AI-Kit WordPress plugin.

> **Premium builds** are published on npm:
> - `@smart-cloud/ai-kit-core`
> - `@smart-cloud/ai-kit-ui`
> - (shared dependency) `@smart-cloud/wpsuite-core`

![Node.js](https://img.shields.io/badge/node-%3E%3D16.x-blue.svg)
![PHP](https://img.shields.io/badge/PHP-%3E%3D8.1-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

---

## Documentation

You can find the plugin’s continuously expanding documentation at:  
https://wpsuite.io/docs/

## Machine-readable resources

- AI plugin manifest: https://wpsuite.io/.well-known/ai-plugin.json
- OpenAPI spec: https://wpsuite.io/.well-known/openapi.yaml

---

## What AI-Kit does

### Free (local-only)
AI-Kit uses Chrome’s built-in on-device AI capabilities (when available) to power:

- **Media Library**: generate image SEO metadata (alt/title/caption/description)  
  - list view, grid view, attachment panel, attachment edit screen  
  - bulk preview + accept workflows
- **Gutenberg sidebar**: post metadata + text generation
- **Inline toolbar tools**: proofread / rewrite / translate
- **Image block panel**: SEO metadata panel for `core/image`, `core/cover`, `core/media-text`

### Pro (optional)
Pro adds:

- **AI-Kit Feature Gutenberg block** (front-end buttons: summarize/write/rewrite/translate/proofread)
- **`[ai-kit-feature]` shortcode** (same front-end feature in other editors/builders)
- **Backend-only / backend-fallback** modes (connect to your own AWS backend)

> **Important architecture note:**  
> Backend requests are made **directly from the browser** (front-end widgets or wp-admin/editor UI).  
> WordPress/PHP does **not** proxy these calls.

---

## AWS Backend (optional, Pro-ready)

AI-Kit can integrate with a production backend packaged as an **AWS Serverless Application Repository (SAR)** deployment.  
It is published as **`wpsuite-ai-kit`** and can be deployed into **your own AWS account**.

**Public SAR page:**  
https://serverlessrepo.aws.amazon.com/applications/us-east-1/637423296378/wpsuite-ai-kit

**Tip:** SAR opens in the AWS region last used in your browser.  
If you want another region, switch it in the top-right region selector before deploying.

For full backend installation and parameters, follow the SAR documentation from the application page.

---

## Project Structure

- `core/`  
  Shared JavaScript modules and feature logic.  
  **Premium build:** `@smart-cloud/ai-kit-core`

- `ui/`  
  Shared UI kit (Mantine components, modals, editors, onboarding assets, etc.).  
  **Premium build:** `@smart-cloud/ai-kit-ui`

- `main/`  
  Base runtime JavaScript and CSS features loaded where needed (plugin “main” entry point); build here and copy the generated assets from `main/dist/` into the final plugin layout.

- `admin/`  
  WordPress admin interface (settings, diagnostics, onboarding UI, etc.); build here and copy the generated assets from `admin/dist/` and `admin/php/` into the final plugin layout.

- `blocks/`  
  Gutenberg integrations (sidebar, toolbar tools, inspector panels, Pro feature block integration); build here and copy the generated assets from `blocks/dist/` into the final plugin layout.

- `wpsuite-main/` (in the Hub repository)  
  Shared frontend bundle copied into `hub-for-wpsuiteio/`; its `dist/` output provides the script loaded on every page to initialize WPSuite reCAPTCHA v3 when needed.

- `wpsuite-admin/` (in the Hub repository)  
  Shared WP Suite admin interface used across WP Suite plugins.

- `wpsuite-*-vendor/` (in the Hub repository)  
  Shared vendor bundles whose `dist/` outputs are copied into `hub-for-wpsuiteio/assets/js/` and `hub-for-wpsuiteio/assets/css/`.

- `assets/`  
  Static plugin assets.

- `dist/` folders under `main/`, `admin/`, and `blocks/`  
  Compiled and minified frontend output used by the WordPress plugin.

- Plugin PHP code and metadata (e.g. `ai-kit.php`, `readme.txt`) are located in the **project root**.

⚠️ **Note:**  
`wpsuite-core` is published on npm as `@smart-cloud/wpsuite-core`.  
If you also work on the Hub codebase, you may build and link a local version instead. Shared Hub assets such as `wpsuite-admin/`, `wpsuite-main/`, and `wpsuite-*-vendor/` also live in that separate repository.

### Source of Shared WPSuite Hub Code

The shared WordPress Hub code lives in the `wpsuite-admin/`, `wpsuite-main/`, and `wpsuite-*-vendor/` directories of the [Hub for WPSuite.io](https://github.com/smartcloudsol/hub-for-wpsuiteio) repository.  
That repository hosts the shared administrative interface, global frontend assets, and vendor bundles used across WPSuite plugins, including AI-Kit.

---

## Installation and Build Guide

### Prerequisites
- Node.js (>= 16.x)
- Yarn or npm
- PHP >= 8.1
- Git

### 1) Clone the repositories

You typically want AI-Kit **and** the Hub repository (for `wpsuite-core`, `wpsuite-admin`, `wpsuite-main`, and the shared vendor bundles) side-by-side:

```bash
git clone https://github.com/smartcloudsol/hub-for-wpsuiteio.git
git clone https://github.com/smartcloudsol/ai-kit.git
```

Suggested structure:

```
/projects/
  hub-for-wpsuiteio/
    wpsuite-core/
    wpsuite-admin/
    wpsuite-main/
    wpsuite-amplify-vendor/
    wpsuite-mantine-vendor/
    wpsuite-webcrypto-vendor/
  ai-kit/
    core/
    ui/
    main/
    admin/
    blocks/
```

### 2) Install JavaScript dependencies

```bash
# Hub repo
cd hub-for-wpsuiteio/wpsuite-core
yarn install

cd ../wpsuite-admin
yarn install

cd ../wpsuite-main
yarn install

cd ../wpsuite-amplify-vendor
yarn install

cd ../wpsuite-mantine-vendor
yarn install

cd ../wpsuite-webcrypto-vendor
yarn install

# AI-Kit repo
cd ../../ai-kit/core
yarn install

cd ../ui
yarn install

cd ../main
yarn install

cd ../admin
yarn install

cd ../blocks
yarn install
```

### 3) Choose your dependency mode

#### Option A — Use published packages from npm (recommended)
Install the premium packages where needed:

```bash
npm install @smart-cloud/ai-kit-core @smart-cloud/ai-kit-ui @smart-cloud/wpsuite-core
```

(Which workspace needs what depends on your local setup; typically admin/blocks/main depend on core/ui.)

#### Option B — Local linking (development)
Useful if you actively modify `wpsuite-core`, `ai-kit-core`, or `ai-kit-ui`.

Build/link `wpsuite-core` from the Hub repo:

```bash
cd ../hub-for-wpsuiteio/wpsuite-core
yarn run build
npm link
```

Build/link `ai-kit-core` (depends on `wpsuite-core`):

```bash
cd ../../ai-kit/core
yarn run build
npm link @smart-cloud/wpsuite-core
npm link
```

Build/link `ai-kit-ui` (often depends on `ai-kit-core` + `wpsuite-core`):

```bash
cd ../ui
yarn run build
npm link @smart-cloud/wpsuite-core
npm link @smart-cloud/ai-kit-core
npm link
```

Then link the packages into other AI-Kit projects:

```bash
# e.g. admin / blocks / main
npm link @smart-cloud/ai-kit-core
npm link @smart-cloud/ai-kit-ui
```

### 4) Build frontend modules for WordPress

Each module that ships WordPress bundles should build into its own `dist/` folder:

```bash
cd main
yarn run build-wp dist

cd ../admin
yarn run build-wp dist

cd ../blocks
yarn run build-wp dist
```

After building `main/`, `admin/`, and `blocks/`, copy the generated assets from each module's `dist/` directory into the matching plugin directory. For `admin/`, copy the PHP files from `admin/php/` as well.

If you build shared Hub assets locally, run `yarn run build-wp dist` in `hub-for-wpsuiteio/wpsuite-main` and `hub-for-wpsuiteio/wpsuite-admin`, and run `yarn run build` in any touched `hub-for-wpsuiteio/wpsuite-*-vendor` workspace before packaging.

### 5) Development workflow
- Rebuild `core/` and `ui/` after shared package changes (`yarn run build`), and rebuild `main/`, `admin/`, or `blocks/` with `yarn run build-wp dist` after WordPress bundle changes.
- If you changed `wpsuite-core`, `wpsuite-main`, `wpsuite-admin`, or any `wpsuite-*-vendor` workspace in the Hub repo, rebuild those outputs before local testing or packaging.
- If you changed `ai-kit-core` or `ai-kit-ui`, re-build and re-link as needed.
- PHP changes are loaded by WordPress immediately.

---

## Packaging for Deployment

Ensure the built assets are copied into the simplified plugin layout:

- `main/dist/*` → `main/`
- `blocks/dist/*` → `blocks/`
- `admin/php/*` and `admin/dist/*` → `admin/`

If you rebuild the shared Hub assets in the separate Hub repository, copy the following outputs into the plugin's `hub-for-wpsuiteio/` directory according to that repository's instructions:

- `wpsuite-main/dist/*` → `hub-for-wpsuiteio/`
- `wpsuite-admin/php/*` and `wpsuite-admin/dist/*` → `hub-for-wpsuiteio/`
- `wpsuite-*-vendor/dist/*.js` → `hub-for-wpsuiteio/assets/js/`
- `wpsuite-*-vendor/dist/*.css` → `hub-for-wpsuiteio/assets/css/`

The `wpsuite-main/dist/` bundle provides the script that loads on every page and initializes the reCAPTCHA v3 flow used by WPSuite plugins whenever it is needed.

Once the structure matches the layout above, create the distributable ZIP:

```bash
git archive --format zip -o ai-kit.zip HEAD
```

This uses rules defined in `.gitattributes` to include only required `dist` content and production PHP code.

---

## External Services

Depending on configuration and edition:

- **Google reCAPTCHA v3** (optional): browser requests to Google to retrieve a token.
- **Customer-configured backend endpoint** (Pro): browser fetch requests to the configured API URL (typically an AWS API deployed to the customer’s AWS account).
- **Amazon Cognito** (optional; when used via Gatey-protected APIs): browser flows that call Cognito Identity / Cognito IDP to acquire tokens.

---

## License

MIT License

---

If you encounter issues or want to contribute, feel free to open an issue or pull request.
