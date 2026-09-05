=== SmartCloud AI-Kit – On-Device AI Tools ===
Contributors: smartcloud
Tags: ai, chrome, seo, language, tools
Requires at least: 6.9
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 1.4.19
License: MIT
License URI: https://mit-license.org/
Text Domain: smartcloud-ai-kit

Add private, on-device AI to WordPress (write, translate, rewrite, proofread, summarize). Free runs locally; Pro connects to your own AWS backend.

== Description ==

AI-Kit brings practical AI helpers to WordPress while keeping privacy first.

AI-Kit is part of the WP Suite product family by Smart Cloud Solutions, Inc. WP Suite keeps WordPress as the CMS and editing layer, while optional connected features can extend selected workflows into modular AWS-backed services for identity, AI, APIs, workflows, protected routes, and static delivery. The free AI-Kit features described here do not require a WP Suite account, subscription, or AWS backend unless you explicitly configure an external service or upgrade-only backend feature.

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
* **PRO: Knowledge Base automation**
  * Enroll WordPress with a short-lived pairing code and signed, site-specific transport
  * Synchronize selected public post types and taxonomies through a durable, resumable outbox
  * Merge manual policy, fixed external vocabularies, and WordPress-derived vocabulary without one producer erasing another
  * Inspect the effective metadata configuration, provenance, baseline, queue, and last runner result in WP Admin
* **PRO: AI-Kit Feature block**
  * Add front-end buttons to **summarize, write, rewrite, translate, and proofread**
* **PRO: [smartcloud-ai-kit-feature] shortcode**
  * Use the same “AI-Kit Feature” functionality in other editors/builders via a shortcode
* **Developer API**
  * AI-Kit exposes a small JS surface under `globalThis.WpSuite.plugins.aiKit.features` so developers can integrate AI-Kit features in their own plugins and custom code.

You can find the plugin’s continuously expanding documentation at:

[WP Suite – Docs](https://wpsuite.io/docs/)

This plugin is not affiliated with or endorsed by Google, Amazon Web Services, or the WordPress Foundation. All trademarks are property of their respective owners.

== Free and Premium Usage Notice ==

AI-Kit works in **Free mode** without registration or subscription, using **local-only (on-device) AI** inside supported desktop Chrome browsers.

**Pro features** are optional and become available after connecting your WordPress site to a WP Suite workspace:
* **AI-Kit Chatbot** (on-site widget + customizable settings + Preview)
* Front-end **AI-Kit Feature** Gutenberg block
* Front-end **smartcloud-** shortcode
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

= How is automatic Knowledge Sync scheduled? =
AI-Kit registers a WordPress cron event that becomes due every five minutes. Normal WP-Cron traffic can execute it. For predictable operation on low-traffic sites or installations with WP-Cron disabled, run `wp cron event run --due-now` from the system scheduler every five minutes. AI-Kit uses a runner lock, so overlapping invocations do not process the same work concurrently.

= Does this work outside Gutenberg? =
Yes — Pro includes the **[smartcloud-ai-kit-feature]** shortcode so you can use AI-Kit Feature in other editors/builders. Developers can also integrate the JavaScript APIs directly.

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
12. PRO – [smartcloud-ai-kit-feature] shortcode usage in a page builder
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
     Enter your reCAPTCHA site key in **AI-Kit → Settings** (or the relevant WP Suite settings screen, depending on your setup).
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

3. **WP Suite platform connection (optional; site/workspace linking & shared features)**
   - **When it applies:**
     When you use **WP Admin → SmartCloud → Connect your Site to WP Suite** to link this WordPress site to a WP Suite workspace, or to switch/disconnect later.
   - **What it’s used for:**
     Storing and retrieving Pro feature configuration (e.g., API/chatbot/feature settings) and enabling an admin-side preview experience so you can try Pro features in WP Admin before enabling them on the live site.
   - **What data may be sent:**
     Minimal account/session data required for authentication, and minimal site/workspace linking data required to associate a WordPress site with a workspace (e.g., site/workspace identifiers and the site’s URL/domain).
   - **Where it goes / how it’s called:**
     Secure HTTPS requests from the browser to WPSuite.io services (e.g. **wpsuite.io** and **api.wpsuite.io**).
   - **Links:**
     - WPSuite.io Privacy Policy: https://wpsuite.io/privacy-policy
     - WPSuite.io Terms of Use: https://wpsuite.io/terms-of-use

4. **Amazon Cognito (optional; authentication for WP Suite Hub and/or protected APIs)**
   - **When it applies:**
     - When using the **WP Suite Hub**, users authenticate (sign in / sign up) before creating/selecting a workspace and linking a site.
     - If a plugin is configured to access protected endpoints that rely on Cognito, authentication/token flows may also be used for those requests.
   - **What it’s used for:**
     User authentication and token-based authorization for subsequent API calls (e.g., to WPSuite.io APIs).
   - **Links:**
     - AWS Service Terms: https://aws.amazon.com/service-terms/
     - AWS Privacy: https://aws.amazon.com/privacy/

5. **Stripe (optional; subscription/purchase flow)**
   - **When it applies:** Only when the user opens the optional WP Suite subscription / purchase flow in the shared admin component.
   - **What it’s used for:** Displaying hosted pricing/subscription UI for optional paid features.
   - **What data may be sent:** Browser/session data required by Stripe to render the hosted purchase UI and process the purchase flow.
   - **Links:**
     - Terms: https://stripe.com/legal/consumer
     - Privacy: https://stripe.com/privacy

== Trademark Notice ==

Google Chrome and reCAPTCHA are trademarks of Google LLC.  
Amazon Web Services, AWS, Amazon Cognito, and Amazon Bedrock are trademarks of Amazon.com, Inc. or its affiliates.

AI-Kit is an independent project and is **not affiliated with, sponsored by, or endorsed by** Google, Amazon Web Services, or the WordPress Foundation.

== Source & Build ==

**Public (free) source code:**
All code that ships in the public (free) version of AI-Kit is available here: https://github.com/smartcloudsol/ai-kit

**Build & distribution:**
AI-Kit is shipped to WordPress.org as a pre-built distribution. Build steps and developer notes are maintained in the GitHub repository documentation.

**Shared WP Suite components:**
Some admin UI modules may originate from shared WP Suite components to support workspace linking, license validation, and subscription management across WP Suite plugins.

**Pro-only features (source availability):**
AI-Kit Pro includes additional functionality (such as the AI-Kit Chatbot, backend-powered processing, and the front-end Feature block/shortcode experience). The code that enables these paid-only features is distributed to Pro users but is not published in the public repository.

== Changelog ==

= 1.4.19 =
* Knowledge Sync metadata: Respect per-document source URL, title, description, category, subcategory and tag overrides; fall back to the KB Base URL Override for source links. Reconcile existing documents after upgrading or changing the base URL, and queue metadata-only edits with the configured approval policy.
* Compatibility: Require Knowledge Automation capability 5 for automatic document delivery so older backends cannot silently discard authored metadata overrides.

= 1.4.18 =
* Knowledge Sync: Added durable, multisite-aware WordPress change capture, baseline recovery, signed site enrollment, and resumable delivery foundations for automated Knowledge Base updates.
* Knowledge Base: Added admin controls for enrollment, post-type policies, optional multisite scope, manual review release, immediate sync runs, and operational status.
* Metadata: Added separately owned manual YAML, external JSON vocabulary, and WordPress-derived layers with effective-config and provenance previews.
* Metadata UX: Clarified layer ownership, merge rules, JSON producer shapes, provenance, and actionable WordPress vocabulary states.
* Connection: Made AI-Kit API Settings the sole backend source for Knowledge Sync, with automatic read-only endpoint mirroring for the server-side cron runner.
* Content policies: Included and accepted built-in WordPress pages, excluded media attachments, and clarified the advanced document-profile metadata label.
* Migration safety: Stage external and WordPress vocabulary inputs without changing a legacy live metadata config until an administrator reviews the proposed result and explicitly establishes the manual layer.
* Vocabulary: Force a fresh WordPress vocabulary baseline after enrollment or a resolved backend change.
* Vocabulary safety: Preserve hierarchical category parentage so subcategories remain grouped below their top-level category, and require a compatible backend before delivery.
* Metadata reliability: Keep the last-known-valid effective config intact when producer materialization or ingestion scheduling fails, and compact redundant taxonomy metadata before enforcing the S3 Vectors 1 KiB limit.
* Recovery: Requeue legacy catch-all `invalid_projection` failures once during the database upgrade so corrected backend validation can process them or return a precise reason.
* Operations: Added review-aware WordPress abilities for inspecting sync policy, queue/baseline state, and vocabulary changes, plus an explicitly confirmed request that schedules the normal policy-preserving runner.
* Reliability: Added terminal-success ingestion generations, durable leases, coalesced trailing runs, bounded recovery, and visible ingestion deletion statistics.
* Recovery: Added paginated remote manifest verification, targeted repair for missing or mismatched sources, and manifest-proven cleanup of orphaned WordPress sources.
* Safeguards: Added generation-bound administrator approval for high-count, high-ratio document deletion sets.
* Keys: Added signed self-revocation with local private-key cleanup and an explicit admin control alongside verification and rotation.
* Compatibility: Added backend capability discovery with legacy-safe fallback, per-feature enforcement, and backend release/schema details in diagnostics.
* Transparency: Added localized, configurable AI-generated content notices to the Chatbot and DocSearch interfaces, including chatbot-name interpolation.
* Safety: Disabled Chatbot image attachments by default so they must be explicitly enabled only for a multimodal frontend model.
* Errors: Added a localized explanation when the configured AI model cannot process image attachments.

= 1.4.17 =
* Packaging: Restored the generated AI-Kit admin JavaScript chunk omitted from the previous WordPress.org package.
* Cleanup: Removed the obsolete generated admin chunk left behind by the previous build.

= 1.4.16 =
* DocSearch: Added developer API options for initially selected categories, subcategories, and tags.

= 1.4.15 =
* Compatibility: Declared compatibility with WordPress 7.1.

= 1.4.14 =
* Mobile: Mount modal AI Feature and DocSearch interfaces in the document-level overlay even when opened from a header button, so their backdrop covers the complete viewport rather than only a sticky-header stacking context.

= 1.4.13 =
* Multisite: Store shared Hub ownership per site and recognize network-activated owners.

= 1.4.12 =
* Knowledge Base: Added one persistent, site-wide admin notice when previously reviewed or published source content changes and needs review again.
* Reliability: Deduplicated review notices across bulk and repeated saves, and preserved published state when dependent-source regeneration fails before making changes.

= 1.4.11 =
* Dependency: Replaced the deprecated SmartCloud Amplify UI 6.16.0 package line with exact supported 6.15.5/3.6.5/6.15.5 versions and rebuilt the shared vendor runtime.
* Reliability: Preserved reCAPTCHA classification and retryability metadata, and report temporary provider outages separately without exposing sensitive response data.

= 1.4.10 =
* Compatibility: Restored ownership-safe WP Suite Theme CSS fragment updates on WordPress-managed Custom CSS storage.

= 1.4.9 =
* Feature: Added native, server-rendered Gutenberg fallback content for AI Feature and Doc Search while their React interfaces initialize.
* Performance: Kept authored fallback content visible until React commits, reducing layout shifts and avoiding empty roots for crawlers.
* Compatibility: Preserved shortcode and Elementor rendering without requiring fallback content outside Gutenberg patterns.
* Compatibility: Allowed authored React fallback blocks and their native Gutenberg content in AI Feature and Doc Search Abilities validation.
* Editor: Added a visible inner-block inserter for adding fallback content to AI Feature and Doc Search blocks.
* Fix: Preserved native rendered Gutenberg child markup in fallback blocks and kept fallbacks visible until the actual React UI commits.
* Safety: Kept fallback blocks restricted to their supported direct parent roots.
* Packaging: Renamed the bundled shared runtime directory to `smartcloud-wpsuite`.
* Migration: Made `smartcloud-wpsuite` the canonical admin, option, and REST namespace while retaining legacy aliases and synchronized site settings for rolling upgrades.
* Cleanup: Added multisite-aware uninstall removal for AI-Kit settings, migration state, Knowledge Base tables, and cached discovery metadata without touching shared WP Suite licences.

= 1.4.8 =
* Maintenance: Refreshed the AI-Kit package chain, AWS Amplify UI integration, build tooling, and dependency security fixes.
* Compatibility: Updated the bundled shared Hub runtime to 2.5.7.

= 1.4.7 =
* Fix: Prevented duplicate Knowledge Base Source status output on custom post type list tables.
* Fix: Added visible, localized, and accessible frontend failure feedback for DocSearch, AI Feature, and Chatbot actions, including human-verification, authorization, throttling, network, and backend failures while preserving retry input.
* Privacy: Retained only safe status, error-code, and request-ID diagnostics in frontend failure feedback without exposing verification tokens or request data.
* Integration: Aligned AI Feature and DocSearch theming metadata with provider-based block materialization, including the historical AI Feature build-directory mapping.
* Theming: Aligned action hover, focus-visible, and disabled states with each block's resolved Mantine primary color and shared WP Suite shadow-root styling.
* Shared Hub: Added ownership-safe WP Suite Theme CSS fragment updates and hardened the frontend settings bootstrap for CSS-rich configuration values.
* Compatibility: Updated the bundled shared Hub runtime to 2.5.6.

= 1.4.6 =
* Fix: Made the shared WP Suite Abilities foundation safe to load from multiple product plugin paths without redeclaring its base provider class.
* Compatibility: Updated the bundled shared Hub runtime to 2.5.5 so existing sites re-elect a current Hub owner after upgrading.

= 1.4.5 =
* Feature: Added an optional native WordPress Abilities API provider for AI-Kit component discovery, schema inspection, validation, materialization, runtime capability reporting, and safe knowledge metadata listing.
* Compatibility: The provider loads only when the WordPress Abilities API and the shared WP Suite Hub abilities layer are available, so existing AI-Kit behavior is unchanged on older WordPress runtimes.
* Integration: Added a private provider profile for SmartCloud Agent Composer without adding a product-level MCP server or public MCP exposure.

= 1.4.4 =
* Compatibility: Refined paid-feature handling in preparation for upcoming WP Suite Agency subscriptions.

= 1.4.3 =
* Docs: Updated WP Suite brand wording and platform positioning across the readme.
* Fix: Improved Knowledge Base source parsing so posts are identified more accurately as Elementor-managed or Gutenberg content, including cases where stale Elementor metadata remains after a page is moved back to Gutenberg.

= 1.4.2 =
* Performance: Added schedule-after-initial-paint mounting so frontend UI yields the main thread sooner and improves early paint metrics where supported.
* Feature: AI-Kit now loads shared WP Suite Theme CSS inside supported shadow-root UI, making site-wide reusable component styling available alongside block-level overrides.
* Feature: Added pattern override support so synced patterns can override selected original block attributes without forking the source block structure.

= 1.4.1 =
* Performance: Moved frontend runtime scripts and shared vendor assets to the footer and enabled deferred loading where safe, reducing render-blocking work during initial page load.
* Internal: Improved script loading order so lightweight bootstrap data can be available early without forcing heavier frontend dependencies into the page head.

= 1.4.0 =
* Maintenance: Updated the admin UI dependency stack, including the shared UI React packages used by WP Suite admin screens.
* Maintenance: Updated shared Gatey Core and WP Suite Core dependencies used by AI-Kit integrations.
* Compatibility: Updated the "Tested up to" value for WordPress 7.0.
* Internal cleanup: Refreshed related frontend and shared runtime dependencies for better alignment across WP Suite plugins.

= 1.3.3 =
* Fixed Mantine CSS versioning to use the dedicated Mantine asset version for more accurate cache handling.

= 1.3.2 =
* Updated project dependencies.
* Improved site settings saving so global reCAPTCHA settings are no longer overwritten accidentally.
* Versioned CSS files loaded into rendered shadow roots for more reliable cache handling.

= 1.3.1 =
* Feature: Added an admin-configurable chatbot `maxTokens` setting, which is now passed through by the frontend in chatbot requests.
* Fix: Hardened client-side chatbot response handling for empty or truncated responses.
* Fix: Improved KB source markdown conversion by normalizing whitespace-only empty lines, resulting in cleaner generated markdown with fewer unnecessary blank lines.

= 1.3.0 =
* Compatibility: Updated AI-Kit packages for TypeScript 6 and newer shared dependency versions.
* Compatibility: Aligned admin and block code with current WordPress typings.
* Refactor: Updated the admin help-label flow to use the shared InfoLabelComponent pattern.
* Fix: Replaced legacy WordPress block-type usages so builds complete cleanly again.
* Internal: Improved overall typing stability across admin and block packages.

= 1.2.16 =
* Fix: Improved frontend block mounting so DocSearch and AiFeature can no longer mount multiple times in parallel on the same element.
* Refactor: Moved the shared race-condition protection into a unified shared helper for more consistent frontend initialization.
* Performance: Optimized DocSearch metadata-options loading so requests start only when the component is actually opened.
* Performance: Added client-side caching and in-flight request deduplication to prevent repeated unnecessary metadata requests.

= 1.2.15 =
* Feature: Extended Knowledge Base editing so separately defined KB sections can now override their own document title and URL.
* Feature: Metadata for KB section-based documents is now editable from the Knowledge Base admin screen, including category, subcategory, and tags.
* UX: Gives editors fuller control over section-level KB documents directly from the admin UI.

= 1.2.14 =
* Feature: Added a document description override option in the KB admin/editor UI.
* Feature: The overridden description is used as the excerpt shown below the title in DocSearch result lists.
* UX: Gives editors more control over how Knowledge Base documents appear in search results.

= 1.2.13 =
* Feature: Extended the KB admin editing UI for generated documents and sections.
* Feature: Base document metadata can now be overridden even for automatically enabled KB sources that do not have a dedicated KB Section override.
* Feature: The document title used in the Knowledge Base can now also be overridden from the admin UI.
* UX: Makes it easier to refine generated KB classification and naming without requiring a separate section-level override.

= 1.2.12 =
* Fix: Improved Elementor widget parameter handling for more reliable widget configuration and rendering.
* Fix: Added missing frontend translations to complete the user-facing UI in more cases.
* UX: Frontend AI-Kit components now behave more consistently across Elementor-based integrations.

= 1.2.11 =
* Fix: Stabilized loading of `admin/logger.php` and initialization of the `Logger` class in the admin environment.
* Fix: Prevented cases where admin PHP pages could break because the logger initialized later than required.
* Improvement: Monaco Editor is now fully bundled with the plugin instead of being loaded from an external CDN.
* Compliance: The editor loading is now fully contained in the plugin codebase and does not rely on remote third-party asset delivery.
* Stability: Ensures the logger is reliably available during admin page load across all affected admin screens.

= 1.2.10 =
* Security/Compliance: Replaced the previous custom Monaco loader shim with the editor loading approach recommended by the Monaco Editor developers.
* Security/Compliance: No external CDN calls are required for the editor; the loading behavior is fully contained in the published plugin source code.
* Compatibility: Switched Elementor widget loading to namespace-based registration under `SmartCloud\WPSuite\AiKit`.
* Stability: Improved shared hub loading and race-condition handling for more reliable startup together with other WP Suite / wpsuite.io plugins.

= 1.2.9 =
* Improved the robustness of script loading and dependency ordering for shared functions, blocks, and related assets.
* Added defer loading where possible so scripts no longer block page rendering unnecessarily.

= 1.2.8 =
* UX: The AI Feature UI language can now be changed while the component is already running.
  Behavior: The language change is applied immediately to the user interface, without interrupting the currently running task.
  Note: The active in-progress operation continues with its original settings; the new language selection applies to subsequent interactions and UI rendering.

= 1.2.7 =
* Stability: Improved plugin bootstrap order so AI-Kit can no longer initialize before the shared WP Suite hub when multiple WP Suite plugins load together.
* Internal: Adjusted hub-loader sequencing and hardened global `WpSuite` namespace initialization to prevent race conditions during startup.
* UX: Added a small per-component UI language switcher for AiFeature so the rendered component language can be changed directly in the UI.
* Behavior: Changing the displayed UI language now also updates `outputLanguage`, making front-end AI Feature experiences more consistent and user-friendly.

= 1.2.6 =
* Admin: Modified WP Suite site settings loading behavior.

= 1.2.5 =
* Fixed rendering of numeric DocSearch properties in the shortcode and Elementor widget integrations.

= 1.2.4 =
* Added and updated language files.
* Extended quota-aware chunked processing from summarizer mode to write and rewrite modes.
* When on-device limits are exceeded, AI-Kit now processes content in chunks and combines the intermediate results into a final output.

= 1.2.3 =
* Improved the DocSearch mobile layout by wrapping long source URLs.

= 1.2.2 =
* Fixed boolean block attributes handling

= 1.2.1 =
* Fixed missing kb-quick-edit.js

= 1.2.0 =
* Moved reCAPTCHA handling and script loading to the shared smartcloud-wpsuite package.
* Added optional admin-side PHP debug logging. Requires WP_DEBUG and WP_DEBUG_LOG to be enabled.
* Improved AiFeature input processing by converting selected HTML content to Markdown before AI handling.
* Added quota-aware chunking and result merging for summarize, rewrite, and translate modes.
* Added summary-of-summaries generation for chunked summarization.
* Added backend fallback for larger requests that would require more than two frontend iterations.
* Improved quota error messaging when backend fallback is unavailable.
* Updated AiKitSidebar, LanguageUtils, and GenerateMetadataBox to initialize renderAiFeature with the current WordPress language, with English fallback when no translation is available.

= 1.1.6 =
DocSearch & AI Feature: More accurate handling of property default values.

= 1.1.5 =
DocSearch: More accurate citation highlights. If a server-side span.end lands mid-word, it is adjusted to the start of the next word.
Backend: Improved span correction logic for span.start / span.end to keep citation ranges aligned with the generated response text.

= 1.1.4 =
DocSearch: Show the “Subcategories” label only when there are subcategory options for the selected categories.
Chatbot: Reset confirmation is now a true modal and overlays the chat content properly.
KB Admin: Fix missing WP Admin REST API changes from the previous release (restores full functionality).

= 1.1.3 =
DocSearch: Show the Filters section only when real categories or tags exist.
DocSearch/Backend: When enableUserFilters is on, always send userSelectedCategories (even as an empty array) so backend filtering is disabled and search runs across all documents.
DocSearch: Reset KB session when top-level categories change to avoid responses influenced by previous KB RAG context.

= 1.1.2 =
DocSearch: Optional user-facing search filters (categories/subcategories/tags). When enabled, backend search uses the filter parameters sent by the user instead of the query builder’s auto-generated KB filter.

= 1.1.1 =
DocSearch: showOpenButton support across Gutenberg block, shortcode, and Elementor widget.
Admin: Toggleable debug logging (writes to wp-content/debug.log when WP_DEBUG + WP_DEBUG_LOG are enabled).
KB Admin: Embedded post updates now trigger KB source regeneration / “needs review” when published as KB content.

= 1.1.0 =
Feature: Knowledge Base Admin — manage KB sources directly from WordPress (enable posts/pages as KB sources, generate markdown, and publish documents to your backend).
Feature: New “KB Source” bulk actions in the Posts list to quickly enable/disable items as knowledge base sources.
Feature: Full Elementor support for AI Feature and DocSearch (dedicated Elementor widgets, matching the Gutenberg blocks + shortcodes).
Feature: New “KB Section” block + Elementor widget to control KB ingestion per section:
- Exclude content from the Knowledge Base
- Split sections into separate KB documents with custom taxonomy/metadata
- Mark sections as overrideable so regenerated markdown won’t overwrite them

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

= 1.4.19 =
Knowledge Sync requires backend 1.0.85 or newer with knowledge.automation capability 5. Existing documents are automatically reconciled using URL and metadata overrides, subject to the configured approval policy.

= 1.4.16 =
Adds initial filter selection to the DocSearch JavaScript API.

= 1.4.15 =
Declares compatibility with WordPress 7.1.

= 1.4.13 =
Recommended for multisite installations using the shared WP Suite Hub.

= 1.4.12 =
Recommended update for editors using Knowledge Base sources. Content changes that require renewed review now produce one deduplicated admin notice with a direct link to Knowledge Base Admin.

= 1.4.11 =
Recommended dependency refresh away from deprecated SmartCloud Amplify UI releases.

= 1.4.10 =
Recommended compatibility update for Starter-managed WP Suite Theme CSS.

= 1.4.9 =
Recommended feature and compatibility update. Adds crawler-visible Gutenberg fallbacks, validates them through WordPress Abilities, migrates the shared runtime namespace, and adds plugin-owned uninstall cleanup while preserving shortcode, Elementor, and shared licence behavior.

= 1.4.7 =
Recommended update for actionable frontend AI errors, custom post type Knowledge Base screens, provider-based AI-Kit block theming, and safe shared WP Suite Theme CSS handling.

= 1.4.6 =
Recommended compatibility update for sites running multiple WP Suite plugins. It prevents a shared Abilities class redeclaration during plugin loading or updates.

= 1.4.5 =
Recommended update for SmartCloud Agent Composer provider integration testing. No configuration changes are required, and the new Abilities provider remains inactive when the WordPress Abilities API is unavailable.

= 1.4.4 =
Recommended compatibility update in preparation for upcoming WP Suite Agency subscriptions. No configuration changes are required.

= 1.4.3 =
No urgent update required for the documentation change. Update when convenient if you use Knowledge Base ingestion on sites that mix or migrate between Elementor and Gutenberg content.

= 1.4.2 =
Recommended feature update. Improves initial paint timing, adds shared WP Suite Theme CSS support for shadow-root UI, and lets synced patterns override selected block attributes.

= 1.4.1 =
Recommended performance update. Frontend scripts now load later and defer where safe, reducing render-blocking work while preserving existing plugin behavior.

= 1.4.0 =
Recommended update. Refreshes AI-Kit’s shared admin UI and WP Suite runtime dependencies, and marks compatibility with WordPress 7.0. No configuration changes are required.

= 1.3.3 =
This release fixes Mantine CSS versioning so the correct asset-specific version is used, improving cache invalidation for rendered styles.

= 1.3.2 =
This release updates dependencies, fixes site settings persistence so shared global reCAPTCHA settings are preserved correctly, and improves cache handling by versioning CSS files loaded into rendered shadow roots.

= 1.3.1 =
Adds a new admin setting for chatbot maxTokens, improves frontend handling of empty or truncated chatbot responses, and generates cleaner markdown from Knowledge Base sources by normalizing whitespace-only empty lines.

= 1.3.0 =
Recommended compatibility update. Modernizes AI-Kit admin and block packages for TypeScript 6 and current WordPress typings, and updates the admin help-label flow to the shared InfoLabelComponent pattern.

= 1.2.16 =
Recommended update. Improves frontend mounting reliability for DocSearch and AI Feature, and reduces unnecessary DocSearch metadata requests with lazy loading, client-side cache, and in-flight deduplication.

= 1.2.15 =
Expands Knowledge Base editing for section-based documents. You can now edit title, URL, and metadata such as category, subcategory, and tags directly for KB sections that are published as separate documents.

= 1.2.14 =
Adds a document description override option for Knowledge Base documents. The custom description is used as the excerpt shown under the title in DocSearch results.

= 1.2.13 =
Improves the KB admin editor for generated content. You can now override base document metadata and the Knowledge Base document title even for automatically enabled KB sources that do not have a dedicated KB Section override.

= 1.2.12 =
Recommended update. Improves Elementor widget parameter handling and fills in missing frontend translations for a more complete and reliable user experience.

= 1.2.11 =
Recommended update. Fixes an admin-side logger loading issue that could break affected PHP-based admin pages, and fully bundles Monaco Editor inside the plugin instead of loading it from an external CDN.

= 1.2.10 =
Recommended update. This release improves editor loading by adopting the Monaco team’s recommended integration approach without external CDN calls, updates Elementor widget loading to namespace-based registration, and makes shared hub loading more stable across WP Suite plugins.

= 1.2.9 =
This release improves how AI-Kit loads scripts and resolves dependencies, with broader use of deferred loading to reduce render-blocking during page load.

= 1.2.8 =
Improves AI Feature language switching. The UI language can now be changed even while the component is already running. The change takes effect immediately in the interface, while the current in-progress task continues uninterrupted with its original settings.

= 1.2.7 =
Recommended update. Improves startup reliability when multiple WP Suite plugins are active, preventing AI-Kit from initializing before the shared hub. Also adds a per-component UI language switcher to AI Feature, which updates the component language together with `outputLanguage`.

= 1.2.6 =
Improves how WP Suite site settings are loaded in the admin UI.

= 1.2.5 =
This release fixes how numeric DocSearch properties are rendered when the component is embedded via shortcode or Elementor widget.

= 1.2.4 =
This release updates language files and extends the chunked processing approach used by the summarizer to write and rewrite modes for better handling of larger inputs.

= 1.2.3 =
This release includes a small DocSearch mobile view fix to prevent long source URLs from breaking the layout.

= 1.2.2 =
This release fixes incorrect handling of boolean block attributes.

= 1.2.1 =
This release fixes missing kb-quick-edit.js.

= 1.2.0 =
This release moves reCAPTCHA integration into the shared WP Suite hub, adds optional PHP debug logging, improves AiFeature processing with Markdown conversion and chunk-aware handling, adds smarter backend fallback, and improves language-aware rendering based on the current WordPress language.

= 1.1.6 =
Improves default-value behavior for DocSearch and AI Feature settings.

= 1.1.5 =
Improves DocSearch citation rendering and fixes span alignment on the backend to prevent mid-word highlight breaks.

= 1.1.4 =
Recommended update if you use KB Admin: restores correct behavior by including the missing WP Admin REST API updates, plus small DocSearch/Chatbot UI fixes.

= 1.1.3 =
Improves DocSearch filter UX and makes category switching more reliable by resetting the KB session context.

= 1.1.2 =
Adds optional DocSearch filters. If enabled, search results are constrained by user-selected categories/subcategories/tags.

= 1.1.1 =
Improves DocSearch open-button behavior across all integrations, adds an admin debug logging toggle, and fixes KB updates for embedded content.

= 1.1.0 =
Recommended update if you use the AI-Kit backend Knowledge Base: this release adds WordPress-native KB source management and introduces KB Section controls (exclude/split/overrideable content). Also includes full Elementor widgets for AI Feature, DocSearch, and KB Section.

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
