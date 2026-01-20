=== AI-Kit – On-Device AI Tools ===
Contributors: smartcloud
Tags: ai, chrome, seo, language, tools
Requires at least: 6.2
Tested up to: 6.9
Requires PHP: 8.1
Stable tag: 1.0.0
License: MIT
License URI: https://mit-license.org/
Text Domain: ai-kit

Add private, on-device AI to WordPress (write, translate, rewrite, proofread, summarize). Free runs locally; Pro connects to your own AWS backend.

== Description ==

AI-Kit brings practical AI helpers to WordPress while keeping privacy first.

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
* Front-end **AI-Kit Feature** Gutenberg block
* Front-end **[ai-kit-feature]** shortcode
* Optional **backend-only / backend-fallback** modes (when on-device AI is unavailable or when you explicitly choose backend processing)

When backend is used, requests go to an API endpoint you configure — typically an AWS API deployed into **your own AWS account** using the “wpsuite-ai-kit” SAR template.

== Installation ==

1. Upload the plugin ZIP (or install via the WordPress plugin repository).
2. Activate the plugin through the “Plugins” screen in WordPress.
3. Go to **WP Admin → WPSuite.io → AI-Kit Settings** and review the defaults.
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

1. AI-Kit onboarding panel (quick feature tour)
2. Media Library (List) – bulk “Preview AI metadata” workflow
3. Media Library – attachment details panel (generate SEO fields)
4. Attachment edit screen – generate metadata for an image
5. Gutenberg – AI-Kit Sidebar: Post metadata generation
6. Gutenberg – AI-Kit Sidebar: Text generation (topic + tone + length)
7. Gutenberg – toolbar group: Proofread / Rewrite / Translate
8. Gutenberg – “SEO Metadata” panel in image-like blocks
9. PRO – AI-Kit Feature block preview (summarize/write/rewrite/translate/proofread)
10. PRO – [ai-kit-feature] shortcode usage in a page builder
11. AI-Kit Settings screen
12. AI-Kit Diagnostics screen

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

3. **Amazon Cognito (optional; only when Gatey-protected APIs are selected)**
   - **When it applies:**
     If you configure AI-Kit to call an API via the **Gatey plugin** (e.g., selecting an API from Gatey’s configured API list) and that API uses Cognito-based auth, AI-Kit may trigger Cognito flows in the browser.
   - **What it’s used for:**
     Token acquisition/identity flows required to call your protected API.
   - **Links:**
     - AWS Service Terms: https://aws.amazon.com/service-terms/
     - AWS Privacy: https://aws.amazon.com/privacy/

== Trademark Notice ==

Google Chrome and reCAPTCHA are trademarks of Google LLC.  
Amazon Web Services, AWS, Amazon Cognito, and Amazon Bedrock are trademarks of Amazon.com, Inc. or its affiliates.

AI-Kit is an independent project and is **not affiliated with, sponsored by, or endorsed by** Google, Amazon Web Services, or the WordPress Foundation.

== Source & Build ==

**Public (free) source code:**
All code that ships in the public (free) version of AI-Kit is available here: https://github.com/scsinfo/ai-kit

**Build & distribution:**
AI-Kit is shipped to WordPress.org as a pre-built distribution. Build steps and developer notes are maintained in the GitHub repository documentation.

**Shared WPSuite components:**
Some admin UI modules may originate from shared WP Suite components to support workspace linking, license validation, and subscription management across WP Suite plugins.

**Pro-only features (source availability):**
AI-Kit Pro includes additional functionality (such as backend-powered processing and the front-end Feature block/shortcode experience). The code that enables these paid-only features is distributed to Pro users but is not published in the public repository.

== Changelog ==

= 1.0.0 =
* Initial release: Media Library metadata generation, Gutenberg tools, and onboarding UI.
* Pro hooks prepared for frontend Feature block/shortcode and backend-only/fallback usage.

== Upgrade Notice ==

= 1.0.0 =
First stable release.
