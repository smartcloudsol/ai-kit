=== SmartCloud AI-Kit – On-Device AI Tools ===
Contributors: smartcloud
Tags: ai, chrome, seo, language, tools
Requires at least: 6.2
Tested up to: 6.9
Requires PHP: 8.1
Stable tag: 1.0.8
License: MIT
License URI: https://mit-license.org/
Text Domain: smartcloud-ai-kit

Add private, on-device AI to WordPress (write, translate, rewrite, proofread, summarize). Free runs locally; Pro connects to your own AWS backend.

== Description ==

AI-Kit brings practical AI helpers to WordPress while keeping privacy first.

WPSuite is a commercial platform by Smart Cloud Solutions, Inc., providing optional shared services for SmartCloud WordPress plugins.

**Free (local-only) mode**
AI-Kit uses Chrome’s built-in on-device AI capabilities (when available). In this mode, content is processed locally in the browser.

**Key features**
* **Media Library: SEO image metadata generation**
  * Works in the **Media Library list view** and **grid view**
  * Supports both the **attachment details panel** and the **attachment edit screen**
  * Includes **bulk workflows** (preview and accept/save items one-by-one)
* **Gutenberg: AI-Kit Sidebar**
  * **Post metadata generation**
  * **Text generation** (topic + instructions + tone + length + language)
* **Gutenberg: Inline tools (toolbar group)**
  * Proofread, rewrite, and translate selected/editable text blocks
* **Gutenberg: SEO Metadata panel for image-like blocks**
  * Adds a dedicated panel for core/image, core/cover and core/media-text, to generate SEO metadata for images
* **PRO: AI-Kit Chatbot**
  * Add an on-site chatbot widget configurable from WP Admin (appearance, labels, behavior)
  * Customize chat UI labels (e.g., title and placeholder), language and text direction (LTR/RTL/auto)
  * Customize the open button (position, label, optional base64 icon)
  * Use **Preview** to instantly try your current settings without saving
* **PRO: AI-Kit Feature block**
  * Add front-end buttons to **summarize, write, rewrite, translate, and proofread**
* **PRO: [ai-kit-feature] shortcode**
  * Use the same “AI-Kit Feature” functionality in other editors/builders via a shortcode
* **Developer API**
  * AI-Kit exposes a small JS surface under `globalThis.WpSuite.plugins.aiKit.features` so developers can integrate AI-Kit features in their own plugins and custom code.

You can find the plugin’s continuously expanding documentation at:

[WP Suite – Docs](https://wpsuite.io/docs/)

This plugin is not affiliated with or endorsed by Google, Amazon Web Services, or the WordPress Foundation. All trademarks are property of their respective owners.

== Free and Premium Usage Notice ==

AI-Kit works in **Free mode** without registration or subscription, using **local-only (on-device) AI** inside supported desktop Chrome browsers.

**Pro features** are optional and become available after connecting your WordPress site to a WPSuite.io workspace:
* **AI-Kit Chatbot** (on-site widget + customizable settings + Preview)
* Front-end **AI-Kit Feature** Gutenberg block
* Front-end **[ai-kit-feature]** shortcode
* Optional **backend-only / backend-fallback** modes (when on-device AI is unavailable or when you explicitly choose backend processing)

When backend is used, requests go to an API endpoint you configure — typically an AWS API deployed into **your own AWS account** using the “wpsuite-ai-kit” SAR template.

== Installation ==

1. Upload the plugin ZIP (or install via the WordPress plugin repository).
2. Activate the plugin through the “Plugins” screen in WordPress.
3. Go to **WP Admin → SmartCloud → AI-Kit Settings** and review the defaults.
4. Open:
   - **Media → Library** (for image metadata generation), or
   - the **Gutenberg editor** (for the editor tools and blocks).

== Machine-readable resources ==

* AI plugin manifest: https://wpsuite.io/.well-known/ai-plugin.json
* OpenAPI spec: https://wpsuite.io/.well-known/openapi.yaml

== Frequently Asked Questions ==

= What browsers are supported? =
Free (local-only) mode requires a recent **desktop Chrome** with on-device AI enabled (availability depends on Chrome version, OS, and device capabilities).

= Does AI-Kit send my content to third parties? =
In Free mode, AI-Kit is designed to run locally in the browser. If you enable reCAPTCHA or configure backend usage (Pro), the plugin will perform external network calls — see “External Services” below.

= What happens if on-device AI is not available in my browser? =
In Free mode, AI features that require on-device AI may be unavailable. In Pro, you can enable **backend-only** or **backend fallback** so features keep working even when on-device AI is unavailable.

= Do I need API keys? =
No for Free local-only mode. For Pro backend usage, your backend may require authentication depending on how you deployed/configured it (API key / IAM / JWT / Cognito).

= Will it work with static exports? =
Yes. AI-Kit runs in the browser.

* In local-only mode, all processing happens on-device in Chrome.
* In backend-only / backend-fallback modes (Pro), requests are sent directly from the visitor’s browser (front-end) or the admin/editor UI to your configured API endpoint.

WordPress/PHP does not proxy these calls — your site does not need server-side connectivity to the API, but the user’s browser must be able to reach the endpoint.
This also means your hosting environment does not need outbound access to the AI API; only the client’s network matters.

= Does this work outside Gutenberg? =
Yes — Pro includes the **[ai-kit-feature]** shortcode so you can use AI-Kit Feature in other editors/builders. Developers can also integrate the JavaScript APIs directly.

== Screenshots ==

1. AI-Kit Settings screen
2. AI-Kit onboarding panel (quick feature tour)
3. AI-Kit Diagnostics screen
4. Media Library (List) – bulk “Preview AI metadata” workflow
5. Media Library – attachment details panel (generate SEO fields)
6. Gutenberg – AI-Kit Sidebar: Post metadata generation
7. Gutenberg – AI-Kit Sidebar: Text generation (topic + tone + length + language)
8. Gutenberg – toolbar group: Proofread / Rewrite / Translate
9. Gutenberg – “SEO Metadata” panel in image-like blocks
10. DEV – Using renderFeature function on front-end
11. PRO – AI-Kit Feature block preview (summarize/write/rewrite/translate/proofread)
12. PRO – [ai-kit-feature] shortcode usage in a page builder
13. PRO – Chatbot Settings (Preview + configuration)
14. PRO – Chatbot widget (front-end)

== External Services ==

This plugin may integrate with the following external services, depending on configuration:

1. **Google reCAPTCHA v3**
   - **What it is & what it’s used for:**
     Client-side bot detection. If enabled, AI-Kit can request reCAPTCHA tokens in the browser to protect certain interactions.
   - **What data is sent & when:**
     The browser may contact Google to retrieve a reCAPTCHA token (client-side).
   - **Configuration in WordPress:**
     Enter your reCAPTCHA site key in **AI-Kit → Settings** (or the relevant WPSuite settings screen, depending on your setup).
   - **Links:**
     - About reCAPTCHA: https://www.google.com/recaptcha/about/
     - Google Terms: https://policies.google.com/terms
     - Google Privacy: https://policies.google.com/privacy

2. **Customer-configured AI backend endpoint (Pro only)**
   - **What it is & what it’s used for:**
     An API endpoint you configure for **backend-only** or **backend fallback** processing when on-device AI is unavailable or when you choose to run on the backend.
   - **What data is sent & when:**
     Text and/or image-related inputs required to fulfill the specific feature request (e.g., rewrite input, summarization text, metadata prompts).
   - **Where it goes:**
     Requests are sent to the **API URL you provide** — typically an AWS API deployed to **your own AWS account** (e.g., via the “wpsuite-ai-kit” SAR template).
   - **How it’s called:**
     Standard HTTPS requests (fetch) from the browser.

3. **WPSuite platform connection (optional; site/workspace linking & shared features)**
   - **When it applies:**
     When you use **WP Admin → SmartCloud → Connect your Site to WPSuite** to link this WordPress site to a WPSuite workspace, or to switch/disconnect later.
   - **What it’s used for:**
     Storing and retrieving Pro feature configuration (e.g., API/chatbot/feature settings) and enabling an admin-side preview experience so you can try Pro features in WP Admin before enabling them on the live site.
   - **What data may be sent:**
     Minimal account/session data required for authentication, and minimal site/workspace linking data required to associate a WordPress site with a workspace (e.g., site/workspace identifiers and the site’s URL/domain).
   - **Where it goes / how it’s called:**
     Secure HTTPS requests from the browser to WPSuite.io services (e.g. **wpsuite.io** and **api.wpsuite.io**).
   - **Links:**
     - WPSuite.io Privacy Policy: https://wpsuite.io/privacy-policy
     - WPSuite.io Terms of Use: https://wpsuite.io/terms-of-use

4. **Amazon Cognito (optional; authentication for WPSuite Hub and/or protected APIs)**
   - **When it applies:**
     - When using the **WPSuite.io Hub**, users authenticate (sign in / sign up) before creating/selecting a workspace and linking a site.
     - If a plugin is configured to access protected endpoints that rely on Cognito, authentication/token flows may also be used for those requests.
   - **What it’s used for:**
     User authentication and token-based authorization for subsequent API calls (e.g., to WPSuite.io APIs).
   - **Links:**
     - AWS Service Terms: https://aws.amazon.com/service-terms/
     - AWS Privacy: https://aws.amazon.com/privacy/

== Trademark Notice ==

Google Chrome and reCAPTCHA are trademarks of Google LLC.  
Amazon Web Services, AWS, Amazon Cognito, and Amazon Bedrock are trademarks of Amazon.com, Inc. or its affiliates.

AI-Kit is an independent project and is **not affiliated with, sponsored by, or endorsed by** Google, Amazon Web Services, or the WordPress Foundation.

== Source & Build ==

**Public (free) source code:**
All code that ships in the public (free) version of AI-Kit is available here: https://github.com/smartcloudsol/ai-kit

**Build & distribution:**
AI-Kit is shipped to WordPress.org as a pre-built distribution. Build steps and developer notes are maintained in the GitHub repository documentation.

**Shared WPSuite components:**
Some admin UI modules may originate from shared WP Suite components to support workspace linking, license validation, and subscription management across WP Suite plugins.

**Pro-only features (source availability):**
AI-Kit Pro includes additional functionality (such as the AI-Kit Chatbot, backend-powered processing, and the front-end Feature block/shortcode experience). The code that enables these paid-only features is distributed to Pro users but is not published in the public repository.

== Changelog ==

= 1.0.8 =
Fix: Improved WebCrypto polyfill initialization so AI-Kit works reliably even in insecure (non-HTTPS) environments where crypto.subtle may be unavailable during early boot.

= 1.0.7 =
Improved: Doc Search modal view now uses a wider dialog for a better search-focused layout.

= 1.0.6 =
PRO: Added **Doc Search** (Knowledge Base research) UI surface:
* New **AI-Kit Doc Search** Gutenberg block (`smartcloud-ai-kit/doc-search`)
* New **[smartcloud-ai-kit-doc-search]** shortcode for Classic Editor / page builders
* New developer helper: `renderSearchComponent()` (UI injection) and `sendSearchMessage()` for programmatic KB search

= 1.0.5 =
Perf: Chatbot requests now reuse a successful reCAPTCHA verification for a short time window to reduce latency and verification costs.
Admin: Added a “reCAPTCHA chat verification window (seconds)” setting (default: 120s).

= 1.0.4 =
Fix: Fixed translation of some AI Feature results into the requested language. In certain cases the translation context (admin vs frontend) was missing, causing translations to be routed through the admin context unintentionally.

= 1.0.3 =
UX: During backend calls, AiFeature and AiChatbot now display the same user-friendly status messages as the on-device flow (e.g. “Generating text…” instead of “Sending request…” / “Waiting for backend…”).
Admin: The chatbot “Assistant is thinking…” text can be overridden in the admin UI.

= 1.0.2 =
Fixed the pre-run language detection/translation flow for AiFeature blocks so it now respects the configured context.

= 1.0.1 =
* Improved backend error diagnostics (including clearer reCAPTCHA failures)
* Added chat history retention controls + fixes for persisted image attachments/preview

= 1.0.0 =
* Initial release: Media Library metadata generation, Gutenberg tools, and onboarding UI.
* Pro features: Chatbot, frontend Feature block/shortcode, and backend-only/fallback hooks.

== Upgrade Notice ==

= 1.0.8 =
Recommended update if you use AI-Kit on non-HTTPS / non-secure contexts (e.g. local dev, staging, embedded previews). Ensures WebCrypto polyfills load deterministically and prevents missing crypto.subtle initialization issues.

= 1.0.7 =
No action required. Clear any page/CDN cache if the modal size doesn’t update immediately.

= 1.0.6 =
If you use AI-Kit Pro, this update adds the new **Doc Search** front-end UI (block + shortcode) and the matching JavaScript helper (`renderSearchComponent`) for Knowledge Base search experiences.

= 1.0.5 =
Recommended if you use the Chatbot with reCAPTCHA: reduces repeated verification calls (lower latency and cost) via a short verification window, and adds Classic reCAPTCHA support.

= 1.0.4 =
Recommended update if you use AI Features with result translation: ensures translations run in the correct context (admin vs frontend) and reliably translate outputs to the requested language.

= 1.0.3 =
Improved UX: backend processing now shows more natural on-device style status messages.

= 1.0.2 =
This update fixes language detection/translation that runs before individual AiFeature executions. 
If you use any AiFeature that relies on automatic language detection or translation, update is recommended.

= 1.0.1 =
Includes the new chatbot history retention control plus stability fixes for
image attachments. Update if you rely on persisted chat history or need clearer
error reporting (especially around reCAPTCHA).

= 1.0.0 =
First stable release.
