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

- `ai-kit-core/`  
  Shared JavaScript modules and feature logic.  
  **Premium build:** `@smart-cloud/ai-kit-core`

- `ai-kit-ui/`  
  Shared UI kit (Mantine components, modals, editors, onboarding assets, etc.).  
  **Premium build:** `@smart-cloud/ai-kit-ui`

- `ai-kit-main/`  
  Base runtime JavaScript and CSS features loaded where needed (plugin “main” entry point).

- `ai-kit-admin/`  
  WordPress admin interface (settings, diagnostics, onboarding UI, etc.).

- `ai-kit-blocks/`  
  Gutenberg integrations (sidebar, toolbar tools, inspector panels, Pro feature block integration).

- `wpsuite-admin/`  
  Shared WP Suite admin interface used across WP Suite plugins.  
  Source repo: https://github.com/smartcloudsol/hub-for-wpsuiteio  
  (Build and linking workflow matches the Gatey repository.)

- `assets/`  
  Static plugin assets.

- `dist/` folders  
  Compiled and minified frontend output used by the WordPress plugin.

- Plugin PHP code and metadata (e.g. `ai-kit.php`, `readme.txt`) are located in the **project root**.

⚠️ **Note:**  
`wpsuite-core` is published on npm as `@smart-cloud/wpsuite-core`.  
If you also work on the Hub codebase, you may build and link a local version instead (same workflow as Gatey).

---

## Installation and Build Guide

### Prerequisites
- Node.js (>= 16.x)
- Yarn or npm
- PHP >= 8.1
- Git

### 1) Clone the repositories

You typically want AI-Kit **and** the Hub repository (for `wpsuite-core` and `wpsuite-admin`) side-by-side:

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
  ai-kit/
    ai-kit-core/
    ai-kit-ui/
    ai-kit-main/
    ai-kit-admin/
    ai-kit-blocks/
```

### 2) Install JavaScript dependencies

```bash
# Hub repo
cd hub-for-wpsuiteio/wpsuite-core
yarn install

cd ../wpsuite-admin
yarn install

# AI-Kit repo
cd ../../ai-kit/ai-kit-core
yarn install

cd ../ai-kit-ui
yarn install

cd ../ai-kit-main
yarn install

cd ../ai-kit-admin
yarn install

cd ../ai-kit-blocks
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
cd ../../ai-kit/ai-kit-core
yarn run build
npm link @smart-cloud/wpsuite-core
npm link
```

Build/link `ai-kit-ui` (often depends on `ai-kit-core` + `wpsuite-core`):

```bash
cd ../ai-kit-ui
yarn run build
npm link @smart-cloud/wpsuite-core
npm link @smart-cloud/ai-kit-core
npm link
```

Then link the packages into other AI-Kit projects:

```bash
# e.g. ai-kit-admin / ai-kit-blocks / ai-kit-main
npm link @smart-cloud/ai-kit-core
npm link @smart-cloud/ai-kit-ui
```

### 4) Build frontend modules for WordPress

Each module that ships WordPress bundles should build into its own `dist/` folder:

```bash
cd ai-kit-main
yarn run build-wp dist

cd ../ai-kit-admin
yarn run build-wp dist

cd ../ai-kit-blocks
yarn run build-wp dist
```

If you build `wpsuite-admin` locally, do it from the Hub repository using the same approach as in the Gatey build guide.

### 5) Development workflow
- Rebuild the module you changed (`yarn run build` / `yarn run build-wp dist`).
- If you changed `wpsuite-core`, `ai-kit-core`, or `ai-kit-ui`, re-build and re-link as needed.
- PHP changes are loaded by WordPress immediately.

---

## Packaging for Deployment

Once all components have been successfully built, archive the project into a deployable WordPress plugin ZIP:

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
