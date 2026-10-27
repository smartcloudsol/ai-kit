=== SmartCloud AI-Kit – Chatbot and Semantic Search ===
Contributors: smartcloud
Tags: ai, chatbot, semantic search, knowledge base, summarizer
Requires at least: 6.9
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 1.7.0
License: MIT
License URI: https://mit-license.org/
Text Domain: smartcloud-ai-kit

Help visitors find answers in your content with a chatbot and semantic search. Pro connects to your own AI backend.

== Description ==

Help visitors get answers from your WordPress content, documentation and connected services. AI-Kit combines a site-wide chatbot with an embeddable DocSearch component, supported by a shared knowledge base and a backend you control.

**Answers for your visitors**
* **Site-wide chatbot (Pro):** Add an assistant that visitors can open from any page. Configure its appearance, role, tone, topics and response guidance.
* **DocSearch (Pro):** Place semantic search in a page or other Gutenberg block area. Show a concise AI summary above a broad set of relevant knowledge sources. DocSearch applies category and tag filters only when the visitor explicitly selects them; it does not silently narrow the search with model-inferred taxonomy filters.
* **Knowledge content:** Select public posts, pages and supported public custom post types. Configure approval policies and inspect synchronization and backend ingestion separately.
* **Connected information (Pro):** Extend chatbot answers with shop or service data through administrator-approved, read-only REST and MCP tools. Optional Shopify shipping quotes use a separate, visibly confirmed step that may create a cart but cannot order or pay. Enable web grounding for selected, allowed HTTPS sources when current information is needed. These integrations require compatible endpoints and backend configuration; installing the plugin does not connect them automatically.
* **Response controls (Pro):** Set evidence and citation requirements, topic boundaries and behavior when evidence is missing. Review answers against your actual content and use cases.
* **Page summaries (Pro):** Give visitors a convenient way to summarize longer content with the AI-Kit Feature block or shortcode.

**Setup that explains what is ready**
Open **SmartCloud → Answers** for guided setup, source status and backend-access guidance. The wizard saves its choices when you finish, and can be reopened with existing values. Detailed settings remain available on the same product page.

A connected WP Suite site, a Pro subscription and a configured, compatible AI-Kit backend are required for visitor chat and DocSearch. The backend is typically deployed into your own AWS account. A WP Suite site connection alone does not deploy that backend or grant access to its protected administration APIs.

**Additional tools for authors**
Free editor and Media Library tools use supported Chrome on-device AI when available: generate image and post metadata, draft text, and rewrite, translate or proofread selected content. Browser and device support determine which local tools are available. Pro can provide backend processing for supported tools. These authoring tools complement the visitor-facing Answers experience.

**WordPress integration**
* Gutenberg blocks and shortcodes for visitor search and AI features.
* Shared translation overrides under **SmartCloud → Platform Settings → Translations** and frontend language/direction controls.
* JavaScript APIs for developers integrating the supported features into their own interfaces.

AI-Kit is part of WP Suite by Smart Cloud Solutions, Inc. WordPress remains your content and editing system; optional connected services provide the AI backend and integrations.

Documentation: [WP Suite – Docs](https://wpsuite.io/docs/)

This plugin is not affiliated with or endorsed by Google, Amazon Web Services, or the WordPress Foundation. All trademarks are property of their respective owners.

== Free and Premium Usage Notice ==

**Free:** Use supported on-device editor and Media Library tools without a WP Suite account, subscription or AI backend. You can also choose knowledge-source policies in WordPress; selecting content does not by itself deliver documents to a backend or enable visitor answers.

**Pro:** An active subscription on the connected WP Suite site enables the paid runtime for the chatbot, DocSearch, frontend AI Feature block/shortcodes and backend processing. Visitor answers and search additionally require a compatible, configured backend with accessible, indexed knowledge content. Chatbot REST/MCP tools and web grounding require their own explicit configuration.

Backend services normally run in your AWS account. AWS usage and any external service charges are separate. Authentication and permissions depend on the configured backend. For protected administration APIs, sign in to the site's configured Cognito pool with the required role, or use the Gatey WordPress login integration. WP Suite workspace sign-in and a WordPress administrator session do not automatically authorize that backend.

== Installation ==

1. Upload the plugin ZIP or install it from the WordPress plugin repository.
2. Activate it through **Plugins** in WordPress.
3. Open **SmartCloud → Answers** and follow the setup steps to select your knowledge content.
4. For visitor answers, connect the site to WP Suite with Pro, deploy/configure a compatible backend, and complete any required backend sign-in. Review the backend-access guidance on the Answers page.
5. Enable and configure the site-wide chatbot, or add the **AI-Kit Doc Search** block to a page. Synchronize and index approved knowledge content, then test visitor questions and source links.
6. For free authoring tools, open Gutenberg or **Media → Library** in a supported browser.

== Machine-readable resources ==

* AI plugin manifest: https://wpsuite.io/.well-known/ai-plugin.json
* OpenAPI spec: https://wpsuite.io/.well-known/openapi.yaml

== Frequently Asked Questions ==

= Can visitors use the chatbot or DocSearch for free? =
Visitor chat and DocSearch need Pro and a compatible backend. Free tools cover supported on-device editor and Media Library workflows. You can prepare knowledge-source choices before connecting a backend.

= What is the difference between the chatbot and DocSearch? =
The chatbot works towards answering the question, using configured behavior, appropriate knowledge-category filters and approved tools to reduce irrelevant context. DocSearch explores relevant sources broadly and presents them below an AI summary; taxonomy filters apply only when the visitor selects them. Both can use the same indexed site content; external REST/MCP tools and web grounding extend the chatbot's conversations.

= Can it answer questions about my shop or other services? =
Yes, when you provide suitable content or configure approved read-only REST/MCP integrations on a compatible backend. Shop and service connections are not automatic. Optional Shopify shipping quotes use a separate visitor-confirmed action that may create a cart; ordinary product search never does. This action does not place an order or make a payment, and it does not enable arbitrary external write tools.

= Does a connected WP Suite site mean my backend is ready? =
No. The backend must be deployed, configured and reachable, with the required authentication. The backend-access check verifies a protected administration request; it does not verify visitor replies, answer quality or completed knowledge ingestion.

= What browsers support the free tools? =
On-device tools require supported desktop Chrome AI APIs. Availability depends on the browser, operating system, device and requested feature. Pro backend processing can support configured features when local AI is unavailable. Chatbot and DocSearch use the backend rather than on-device AI.

= Does AI-Kit send my content to external services? =
On-device processing happens in the browser. Backend features send the inputs needed for the request to your configured API. Knowledge Sync sends approved source content and metadata from WordPress to the configured backend. Approved chatbot tools may send relevant arguments to their configured services. See External Services below.

= Will it work with static exports? =
The frontend components run in the browser and can call the configured backend from a static site, subject to its origin and authentication settings. WordPress remains responsible for source management and server-side Knowledge Sync. Maintain the required runtime configuration and entitlement refresh for your exported site.

= How is automatic Knowledge Sync scheduled? =
AI-Kit registers a WordPress cron event that becomes due every five minutes. Normal WP-Cron traffic can execute it. For predictable operation on low-traffic sites or installations with WP-Cron disabled, run `wp cron event run --due-now` from the system scheduler every five minutes. AI-Kit uses a runner lock to prevent overlapping work. Delivery and backend indexing are separate stages.

= Can I embed search or summaries without the site-wide chatbot? =
Yes. Use the **AI-Kit Doc Search** or **AI-Kit Feature** Gutenberg block, or the **[smartcloud-ai-kit-doc-search]** and **[smartcloud-ai-kit-feature]** shortcodes. These visitor-facing components require Pro and the appropriate runtime/backend configuration.

== Screenshots ==

1. Pro: The site-wide chatbot welcomes visitors and invites questions.
2. Pro: Frontend summarizer options before generating a summary of page content.
3. Pro: Chatbot appearance settings, including its name, greeting and presentation.
4. Choose WordPress content types in the Answers guided setup.
5. Pro: An embedded DocSearch component, ready for a visitor's search query.
6. Answers setup, knowledge content and backend access guidance in the shared admin.

== External Services ==

This plugin may integrate with the following external services, depending on configuration:

1. **Google reCAPTCHA v3**
   - **What it is & what it’s used for:**
     Client-side bot detection. If enabled, AI-Kit can request reCAPTCHA tokens in the browser to protect certain interactions.
   - **What data is sent & when:**
     The browser may contact Google to retrieve a reCAPTCHA token (client-side).
   - **Configuration in WordPress:**
     Enter your reCAPTCHA site key in **SmartCloud → Platform Settings → reCAPTCHA**.
   - **Links:**
     - About reCAPTCHA: https://www.google.com/recaptcha/about/
     - Google Terms: https://policies.google.com/terms
     - Google Privacy: https://policies.google.com/privacy

2. **Customer-configured AI backend endpoint (Pro only)**
   - **What it is & what it’s used for:**
     An API endpoint you configure for visitor chat, semantic search, knowledge synchronization and backend AI processing.
   - **What data is sent & when:**
     Chat messages, search queries, text and/or image-related inputs required for the requested feature. Knowledge Sync sends approved source content, metadata and site-specific synchronization information from WordPress. Conversation settings and approved tool arguments are sent when those features are used.
   - **Where it goes:**
     Requests are sent to the **API URL you provide** — typically an AWS API deployed to **your own AWS account** (e.g., via the “wpsuite-ai-kit” SAR template).
   - **How it’s called:**
     HTTPS requests from the browser for interactive features, and signed server-side HTTPS requests from WordPress for Knowledge Sync. Configured REST/MCP tools and web grounding make backend-to-service requests to administrator-approved destinations; review those services and their privacy terms before enabling them. Enabled display templates may load approved source image URLs directly in the visitor's browser, disclosing the visitor's IP address to that image host; images use no-referrer requests. Opening a navigation link visits its configured destination and does not execute a purchase or booking.

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

6. **Shopify (optional; administrator-configured catalog and shipping quotes, Pro only)**
   - **What it is & what it is used for:**
     Read products, supported options, prices and available inventory from the configured merchant. Shipping quotes are separately enabled and require visible visitor confirmation; that action may create a Shopify cart solely to read shipping estimates. It does not order or pay.
   - **What data is sent & when:**
     Catalog queries, filters and market context are sent during product searches. Only after the visitor submits the shipping-quote form are the displayed product variants, quantities and supplied delivery address sent through the configured backend to the configured Shopify store. Private Storefront authentication can also require forwarding the trusted visitor IP address. Do not put an address in the ordinary chat message.
   - **Storage and limitations:**
     Structured address inputs are not added to model prompts, visible chat history or browser conversation storage. The backend processes confirmed inputs privately and retains a private cart reference for bounded quote retries; Shopify may retain the resulting cart and address according to the merchant's configuration and applicable policies. General card brands or wallets do not prove checkout eligibility; missing delivery dates or payment options remain unknown.
   - **Configuration and links:**
     Review the exact merchant domain, Shopify app permissions, runtime credential reference and quote setting in advanced conversation-profile Tools. Installing the plugin does not install an app, grant Shopify permissions or activate a connection.
     - Terms: https://www.shopify.com/legal/terms
     - Privacy: https://www.shopify.com/legal/privacy
     - Also review the configured merchant's terms and privacy policy.

== Trademark Notice ==

Google Chrome and reCAPTCHA are trademarks of Google LLC.  
Amazon Web Services, AWS, Amazon Cognito, and Amazon Bedrock are trademarks of Amazon.com, Inc. or its affiliates.

AI-Kit is an independent project and is **not affiliated with, sponsored by, or endorsed by** Google, Amazon Web Services, or the WordPress Foundation.

== Source & Build ==

**Public (free) source code:**
All code that ships in the public (free) version of AI-Kit is available here: https://github.com/smartcloudsol/ai-kit

**Build & distribution:**
AI-Kit is shipped to WordPress.org as a pre-built distribution. Build steps and developer notes are maintained in the GitHub repository documentation.

**Shared WP Suite admin and localization:**
The bundled WP Suite Hub admin originates from the `wpsuite-admin/` module in https://github.com/smartcloudsol/smartcloud-wpsuite and is packaged under `smartcloud-wpsuite/`. It owns the site-wide custom translation catalog used by Gatey, AI-Kit, and Flow, alongside shared workspace linking, licence validation, and subscription management.

**Pro-only features (source availability):**
AI-Kit Pro includes additional functionality such as the chatbot, DocSearch, backend processing, and the frontend Feature block/shortcode experience. The code that enables these paid-only features is distributed to Pro users but is not published in the public repository.

== Changelog ==

= 1.7.0 =
* Keep Knowledge Base registration, pairing material, synchronization state and scheduled jobs bound to their backend profile while preserving shared WordPress content.
* Reject stale classic-editor, Quick Edit, Bulk Edit and AJAX changes before they can affect another selected backend.
* Keep plugin settings and configuration resets scoped to the selected backend; support explicit workspace API connections alongside legacy connections.
* Update AI Kit Core to 1.5.26, UI to 1.5.44 and shared Hub to 2.7.0. Installing the plugin does not deploy or migrate a backend.

Full release history and detailed upgrade guidance: https://github.com/smartcloudsol/ai-kit/blob/main/CHANGELOG-HISTORY.md

= 1.6.11 =
* Keep visitor-confirmed shipping forms compact, with responsive fields and expandable optional address fields that retain their values.
* On compatible backends, select a source-provided delivery country by its localized name and show clearer shipping-check and estimate labels with expandable supplementary details.
* Translate new frontend controls through all supported UI catalogs while preserving product names, source values and the separate answer language.
* Negotiate visitor-action v2 for HTTP, streaming and saved results while retaining legacy backend compatibility and explicit visitor confirmation before a shipping calculation.
* Update AI Kit Core to 1.5.25 and UI to 1.5.43; retain Hub 2.6.1. Backend deployment and static-asset publication remain separate operator steps.

= 1.6.10 =
* Make display-template creation explicit, show readable multi-content-type sources and suggest approved field pointers without changing source permissions.
* Edit template mappings, tool workflow inputs and steps, suggested visitor actions and MCP tools in compact lists with independent private drafts and explicit Apply/Cancel controls. Keep multiple collapsible editors open while adding, applying, moving or removing sibling rows.
* Close unchanged rows immediately and confirm discarding modified rows on Cancel or collapse. Keep header enable switches independent of form edits, reserve distinct pending-row IDs, enforce list limits across pending additions, and prevent stale drafts from overwriting externally changed or removed rows.
* Use a single local confirmation for removal and discarded changes; keep nested Escape handling scoped to the active editor.
* Fix duplicate WordPress checkbox marks in dialogs and align row inputs even when labels wrap onto several lines.
* Clarify automatic Knowledge Sync, manual source review and metadata layers; protect unsaved content policies when switching content types and distinguish field inspection from approval.
* Honor explicitly excluded KB sections during automatic template rendering and nested content conversion without hiding those sections on the public page.
* Keep AI Kit Core 1.5.24, UI 1.5.42 and Hub 2.6.1. The separate filtered-page, source-count and answer-recovery backend corrections require orchestration v1.0.130 or equivalent.

= 1.6.9 =
* Structured sources: Review explicit plain-text, HTML or Markdown formats with a compatible backend. Preserve original values; declared HTML defaults to readable plain text. Separately opt a structured display template into restricted rich-text formatting without enabling links, images or raw HTML.
* Configure authenticated Shopify Storefront reads for supported product, option, price and inventory filters; report incomplete or unsupported coverage honestly.
* Request shipping estimates through a separate visible visitor-confirmed form. It may create a cart but never orders or pays; normal catalog searches stay read-only.
* Browse verified catalog pages with previous/next controls on compatible backends; show a total only when supplied by the source.
* Keep larger result groups in an accessible carousel and bound Markdown images with a keyboard-accessible enlarged preview.
* Keep saved Markdown text, images and links in reading order, and align card buttons at the bottom with or without images.
* Style catalog page navigation, show references below it and hide redundant internal display markers beside verified cards in saved replies.
* Explain Shopify UCP capabilities in Answers setup and open reviewed advanced connection settings without discarding the setup draft.
* Configure catalog, carousel and image labels in chatbot settings. Preserve compatibility with backends without pagination support.
* Resolve card headings, field and action labels, and catalog/carousel navigation through the shared translation catalog in the chatbot UI language. Preserve source values and the answer language.
* Support JSON-encoded OAuth client-credentials token requests alongside the existing form encoding.
* Update AI Kit Core to 1.5.24 and UI to 1.5.42; retain Hub 2.6.1.

== Upgrade Notice ==

= 1.7.0 =
Update the WP Suite plugins together. New backend profiles use separate Knowledge Base state and need their own enrollment. Existing single-backend sites keep their configuration.

= 1.6.11 =
Country selection and compact quotes need a separate WP Suite Cloud Deployment update (not public v1.0.130). Republish static assets; review translations. Legacy backends remain compatible. Shipping checks require form submission, do not order or pay, and do not promise immediate cart deletion.

= 1.6.10 =
KB exclusions need marked source sections, reviewed resync and ingestion; saved template overrides take precedence. Installation does not rewrite old KB text. Backend paging, source counts and answer recovery need orchestration v1.0.130 or equivalent, deployed separately.

= 1.6.9 =
Storefront, confirmed shipping quotes and text formats need orchestration v1.0.129 or equivalent. Rich text needs template opt-in. Review Shopify grants, credentials, address privacy, paging and translations; resync format changes. Deploy the backend and republish static assets separately.

= 1.6.8 =
Existing field approvals and mappings are preserved; no new fields are automatically enabled. The separate omitted-search recovery and accurate source-validation activity need orchestration v1.0.125 or equivalent. Backend deployment is not automatic.

= 1.6.7 =
Document totals need orchestration v1.0.124 or equivalent. Older backends retain progress without misleading chunk totals. Unused prompt settings are hidden. Review saved Shopify schemas after a backend upgrade for larger catalog pages. Backend deployment is not automatic.

= 1.6.6 =
Progress feedback works with existing streaming backends. The separate bounded answer-completion retry needs orchestration v1.0.123 or equivalent. Citation rules remain enforced; structured fields and price records are not newly required. Backend deployment is not automatic.

= 1.6.5 =
Nested sync needs document-v2 capability; tool-control and empty-reply fixes need orchestration v1.0.122. Review schemas, mappings and profile access, then complete approved sync/ingestion. Aggregates need a site-owned producer. Backend deployment is not automatic.

= 1.6.4 =
Generated CTA links need orchestration v1.0.119 or display-policy capability 3. Native fields remain opt-in. Review mappings and complete sync/ingestion after source changes. Existing profiles are preserved; backend deployment is not automatic.

= 1.6.3 =
Typed display presets require orchestration v1.0.118 or presentation capability 2; older backends retain fallback. Static export needs exporter/workers 1.1.84 or later. Purge source caches and recrawl missing assets. Review source mappings; backend updates are not automatic.

= 1.6.2 =
Structured sync needs orchestration v1.0.117 or equivalent; display templates need answerPresentation support. Review fields, mappings, permissions and URL prefixes. Complete sync/ingestion; await acknowledgment of removals. See release history for full guidance. Backend not auto-deployed.

= 1.6.1 =
Local product links need orchestration v1.0.116 with product-page resolution, including existing v1.0.116 stacks. Review presets, shared profiles and page mappings; approve new external evidence sources. Backend not auto-deployed; cart/checkout not enabled. See release history.

= 1.6.0 =
Use SmartCloud > Answers. Existing settings and URLs remain; setup preserves unrelated settings, but confirmed Reset clears configuration. Chatbot/DocSearch require Pro and a compatible backend. Taxonomy filtering needs its backend update. The plugin does not deploy it. See release history.

= 1.5.9 =
Ingestion resume and cost details need orchestration v1.0.109 or equivalent backend updates. Full metadata resync runs in scheduled batches; wait for both the WordPress scan and backend ingestion before relying on refreshed results.

= 1.5.8 =
Source metadata is resynchronized. Release-gated sources wait for an acknowledged public release; Bedrock ingestion must finish before corrected search links appear. No orchestration update is required for this URL fix.

= 1.5.7 =
Category paths need the matching backend update. Enable migration mode, reconcile WordPress/docs metadata, complete ingestion, then enable ready mode. Capability/hierarchy changes reset the WordPress baseline, not ingestion completion. Legacy backends retain primary-category behavior.

= 1.5.6 =
Regenerate and review enrolled Knowledge Base sources whose public content comes from block-theme templates or dynamic blocks before publishing them again. Generated documents now capture server-rendered source content and exclude shared site chrome; no backend schema migration is required.

= 1.5.5 =
To show the new greeting and starter questions in each visitor language, add each authored source string and its translations to the shared WP Suite translation catalog. Existing chatbot settings continue to work without changes.

= 1.5.4 =
Update the AI Kit backend to Deployment Access orchestration v1.0.103, or apply the equivalent AI handler and authorizer fixes to a legacy deployment, to receive the response-format and Cognito authorizer repairs. The UI contrast improvement works independently.

= 1.5.3 =
Streaming chat requires an AI Kit backend built from Deployment Access orchestration v1.0.102 or later with chat streaming enabled. Without that optional backend capability, the chatbot continues to use the existing HTTP path.

= 1.5.2 =
Update the AI Kit backend to Deployment Access orchestration v1.0.100 or the equivalent legacy backend release before using the new cost reconciliation details. Historical AWS billing can cover the AWS account beyond this backend and is delayed; unavailable billing data does not mean zero spending.

= 1.5.0 =
Refresh the backend and capability manifest for profiles, grounded chat, isolated execution and spend controls. Resave pre-release Conversation Profiles with HTTPS URL prefixes; the old host-only grounding field is not retained.

= 1.4.26 =
Release gating needs Static Publisher 1.0.20 and one content-sync rule covering all enabled Knowledge Sync types. Leave it disabled for public WordPress. After enabling, complete a successful publish to bind the verified target; unreleased work stays queued.

= 1.4.25 =
Requires AI Kit backend 1.0.91 with API schema 12 and knowledge.automation capability 6. Run a Knowledge Base baseline synchronization after upgrading so existing WordPress documents receive locale metadata and language-specific document IDs.

= 1.4.21 =
Unifies metadata editors as YAML. Backend 1.0.86 also uses YAML for stored configuration layers; existing layer files require operator conversion before that backend update. Document .metadata.json sidecars remain unchanged.

= 1.4.20 =
Corrects misleading Needs Review warnings for auto-synchronized KB sources. Delivered confirms backend receipt, not completed indexing. Manual review requirements remain intact. No additional backend update is required over 1.4.19.

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
