# AI Kit release history

This archive preserves the original changelog and upgrade guidance verbatim. The WordPress.org readme keeps recent release entries and concise notices within its display limits.

== Changelog ==

= 1.6.6 =
* Keep a localized response-generation status visible after source checks and completed tool operations while the reply is still being prepared.
* Preserve operation history without duplicating active progress or retaining pending status after the request ends.
* Update AI Kit UI to 1.5.36; retain Core 1.5.21 and Hub 2.6.1.

= 1.6.5 =
* Synchronize explicitly registered nested objects and typed arrays with bounded schemas, selected fields and existing publication approval.
* Keep message entry compact at every screen size; focus restores the editor and labelled actions. Expand card navigation buttons to the card width.
* Show localized operation-specific progress without technical tool names or repeated historical thinking rows.
* Merge duplicate public source links and omit raw structured-record JSON from citation previews while retaining internal grounding.
* Configure simple read-only tool sequences and parallel dependencies with private modal drafts on compatible backends.
* Update AI Kit Core to 1.5.21 and UI to 1.5.35; retain Hub 2.6.1.

= 1.6.4 =
* Improve display-template editing with a compact list, private modal drafts, confirmed removal, field guidance and explicit apply/save steps.
* Add opt-in synchronization of public featured images, alternative text and authored excerpts alongside registered own fields.
* Support profile-owned, conditional navigation destinations and encoded source identifiers on compatible backends, without provider-specific logic.
* Preserve existing display profiles and client response formats; missing or unverified facts do not create images, identifiers or booking availability.

= 1.6.3 =
* Answers: Add reusable product, comparison, recommendation and status presets with source-bound money, currency, units and explicit availability semantics.
* Chatbot: Improve mobile tables, compact message entry and navigation buttons; hide technical provenance while preserving verified links and history.
* Static export: Declare shadow UI styles safely before asynchronous initialization; retain shadow isolation.
* Compatibility: Bundle Core 1.5.19, UI 1.5.33 and Hub 2.6.1; improve PHP translations, SQL bindings and readme history.

= 1.6.2 =
* Knowledge sources: Explicitly select registered, public custom fields and map them to neutral typed fields for structured synchronization.
* Answers: Enable profile-scoped own-content record and schema tools on a compatible backend, bound to the current Knowledge Base result and source version.
* Admin: Check backend compatibility before enabling structured synchronization and preserve existing settings when that capability is unavailable.
* Answers: Display verified own-content, MCP/UCP and REST results using configurable lists, cards or carousels while preserving the text answer.
* Admin: Configure source-bound display templates and field mappings, and preview actual approved read results without granting additional tool permissions.
* Chatbot: Preserve bounded display snapshots, source references and check times across streaming, reconnects and saved history.
* Dependencies: Update AI Kit Core to 1.5.18 and AI Kit UI to 1.5.32.

= 1.6.1 =
* Answers: Start with a reviewed assistant preset for site guidance, services, product discovery or customer support, then tailor it to your business before saving.
* Answers: Set up supported live catalog connections with guided fields, connection checks and explicit read-only approval instead of assembling MCP JSON.
* Answers: Pair live catalog products with published WordPress pages through guided search, with language-specific mappings and a choice of original, local-first or local-only links.
* Answers: Review page suggestions from verified local integrations while preserving product identity, live prices, variants and availability from the catalog.
* Answers: Discover approved web sources during setup, with explicit review of the required evidence policy and preservation of existing detailed settings.
* Admin: Keep large JSON fields manageable with bounded, resizable local editors and expanded connection setup help.
* Admin: Keep setup menus visible, derive connection details from the selected backend, and recognize existing service endpoints to prevent duplicate connections.
* Chatbot: Show concise tool names, provider or source website, and distinct running, completed, failed and interrupted activity states.
* Chatbot: Add visitor-language configuration for approved MCP tools and preserve source product names and readable references with a compatible backend.
* Dependencies: Update AI Kit UI to 1.5.31.

= 1.6.0 =
* Keep backend mode, resolved API URL and access guidance in one compact Status panel.
* Show current DocSearch and summarizer screenshots in the Getting started guide, with accessible image dialogs.
* Present chatbot and semantic search as the primary visitor experience, with clear Free, Pro and backend requirements.
* Remember completed Answers setup even when the chatbot and knowledge synchronization remain disabled.
* Explain backend access with contextual sign-in and configuration guidance instead of an unexplained authorization error.
* Improve shared navigation alignment, connection details, inline help and setup field guidance.
* Explain scheduled knowledge synchronization results and sources waiting for verified site publication.
* Combine Answers onboarding, status and detailed settings on one product page; show AI Tools as an informational panel.
* Stage assistant appearance, conversation guidance and knowledge-source selections until the final setup step, with partial-save recovery.
* Use the saved Chatbot Settings name for conversation identity instead of asking for a second assistant name.
* Add shared product navigation and separate Platform Settings with reCAPTCHA, Styling and Translations tabs.
* Preserve existing admin links, permissions and compatibility with older plugin menus.

= 1.5.10 =
* Knowledge Base: Initialize the optional publisher cursor when the public release gate is disabled, preventing warnings during baseline reconciliation without changing release eligibility or review requirements.

= 1.5.9 =
* Knowledge Base: Add a durable full resynchronization action with batch progress and automatic follow-up passes after taxonomy or backend capability changes.
* Knowledge Base: Show backend ingestion states and allow an administrator to resume a coordinator paused for review once its cause has been resolved.
* AI spend policy: Show the previous month's reconciled usage and signed corrections from delayed AWS Cost Explorer data.
* Composer validation: Accept authored Knowledge Base category, subcategory, and tag values independently of generated suggestions, including existing slug-based overrides, while enforcing backend metadata limits.
* Dependencies: Refresh the bundled admin DOMPurify dependency for the latest security fix.

= 1.5.8 =
* Composer compatibility: Accept standard Gutenberg block metadata when validating governed AI Kit blocks, while continuing to reject unknown custom attributes.
* Composer validation: Read the canonical category and subcategory vocabulary keys when validating governed Knowledge Base sections.
* Shared styling: Load the site's additional stylesheet URL list after WP Suite Theme CSS inside AI Kit frontend shadow roots.
* Dependencies: Bundle WP Suite Hub 2.5.17, AI Kit Core 1.5.16, and AI Kit UI 1.5.29.
* Chatbot and DocSearch: Decode HTML-escaped citation titles, descriptions, and displayed source links; normalize encoded ampersands in safe source URLs without changing unrelated query parameters.
* Knowledge Base: Apply the configured public Base URL Override to source links even when the Static Publisher release gate supplies the last released path.
* Knowledge Base: Preserve an explicit per-document source URL ahead of the release-gated permalink.
* Knowledge Base: Refresh synchronization baselines so existing source metadata can receive the corrected public URL.

= 1.5.7 =
* Knowledge Base: Synchronize every assigned category branch and its ancestors through canonical category paths, including deeply nested categories.
* Knowledge Base: Preserve the primary category and subcategory for compatibility with existing integrations and authored overrides.
* Knowledge Base: Detect backend taxonomy capability and hierarchy changes, refresh synchronization baselines, and show when metadata needs resynchronization.
* Dependencies: Update AI Kit core and UI packages for the category-path contract.

= 1.5.6 =
* Knowledge Base: Render the effective block-theme content for every supported post type, including server-rendered dynamic blocks stored in templates.
* Knowledge Base: Exclude shared header, footer, navigation, and template-part chrome from generated source documents.
* Add guarded PHP extension points for dynamic knowledge-base markdown and its referenced WordPress records.
* Recalculate generated-section origin hashes after dynamic content providers contribute canonical content.
* Prevent editor asset loading from failing when an optional build manifest has no dependency list.

= 1.5.5 =
* Chatbot: Configure a welcome greeting and up to six starter questions; visitors can send a localized question with one click.
* Chatbot: Wrap longer starter questions, show live thinking steps above the typing dots, and keep references collapsed until opened.
* Localization: Resolve authored welcome text and starter questions through the active site translation catalog.
* Dependencies: Refresh AI Kit core and UI packages for the updated chatbot configuration.

= 1.5.4 =
* Chat readability: Improve muted text contrast in dark themes, including expanded activity details on mobile.
* Backend compatibility: Pair with orchestration v1.0.103 for stronger response-format recovery and reliable Cognito authorizer updates.

= 1.5.3 =
* Chat streaming: Add a WebSocket client for incremental answers and tool activity, with the existing HTTP chat path retained when streaming is unavailable.
* Chat experience: Keep partial answers when a turn is cancelled, show precise failures and retry options, and summarize completed Knowledge Base searches without cluttering the live response.
* Sources and localization: Clean up citation previews and localize the new chat activity and error messages across all supported interface languages.
* Conversation Profile: Clarify action kinds in the editor and contextual help, including examples for links, contact actions, and handoffs.

= 1.5.2 =
* Cost visibility: Distinguish backend-recorded AI usage from historical AWS account billing and show the scope and freshness of each figure. Unavailable or delayed billing data is shown as unknown rather than zero.
* Cost controls: Clarify monthly spend status, remaining allowance, and reconciliation information in API Settings.
* Error messages: Distinguish spending limits, an explicit AI pause, and temporary service or request failures in frontend feedback.

= 1.5.1 =
* Localization: Show accurate localized messages for grounding failures, request timeouts, and backend errors.

= 1.5.0 =
* Conversation profiles: Replace request-carried shared context with a structured, server-owned profile for site scope, response policy, escalation guidance, action catalog, Knowledge Base behavior, grounding, memory, and agent controls.
* Conversation profile editor: Keep multiline topic and policy fields editable, make them vertically resizable, and add contextual help throughout the profile.
* Restricted web grounding: Replace host-wide rules with exact HTTPS URL prefixes so administrators can allow a whole site or only a path such as the AWS Marketplace section.
* Admin compatibility: Remove duplicate checkbox marks caused by overlapping WordPress and Mantine styles.
* Grounded chat: Add evidence-aware conversation behavior, bounded answer repair, citation finalization, topic-aware memory, compact source previews, and safe recovery when a model proposes an unsupported Knowledge Base metadata filter.
* Agent tools: Advertise the optional isolated script runner and Knowledge Base tool capabilities without granting the browser or WordPress process code-execution privileges.
* Escalation: Add visitor-language safety responses and a structured backend handoff event for support workflows.
* Cost safety: Add an API Settings editor for the backend-wide monthly AI spend circuit breaker, including a lower operational limit, explicit emergency pause, estimated UTC-month usage, remaining allowance, and graceful API status responses. The infrastructure hard cap remains authoritative.

= 1.4.28 =
* Dependencies: Bundle WP Suite Hub 2.5.16 so Static Publisher is notified when the shared translation catalog changes.

= 1.4.27 =
* Composer validation: Treat Knowledge Base sections as semantic containers that may wrap governed Gutenberg and Canvas blocks while keeping Feature and Doc Search child validation strict.

= 1.4.26 =
* Knowledge Sync scheduling: Configure how often WordPress sends queued content changes to the Knowledge Base backend, from 5 minutes to 24 hours; changing the interval automatically replaces the previous WP-Cron recurrence.
* Optional public release gate: Sites using Static Publisher can hold content-bound Knowledge Sync work until a verified publish baseline or targeted content-sync acknowledgement covers the corresponding journal sequence. Directly served WordPress sites keep the existing periodic behavior by default.
* Release safety: Bind baseline, queued, and leased changes to one exact Static Publisher consumer and revalidate its committed sequence before delivery; posts newer than the verified publish cursor wait for the next release, while unavailable, incomplete, or ambiguous publisher configuration fails closed without making Static Publisher a required dependency.
* Operational status: Explain source verification, tombstones, local baselines, outbox work, vocabulary state, and WordPress versus Bedrock processing directly in the admin UI.
* Ingestion counters: Identify committed/requested generation values as coordination counters rather than document totals, avoiding confusion with S3 and Bedrock document counts.

= 1.4.25 =
* Knowledge Base localization: Synchronize each WordPress language mutation as an independently searchable document with its normalized locale and localized URL, title, and excerpt.
* Metadata overrides: Switch between linked Polylang or WPML translations in the same source editor and maintain independent title, description, taxonomy, tag, and section overrides for every locale.
* Search and chat: Send the resolved site locale to the backend so retrieval stays inside one language, with deterministic locale and English fallback behavior.
* Request transport: Preserve the resolved locale through the frontend request allowlist so DocSearch and chat calls reach the backend with their BCP 47 language tag.
* AI agent responses: Generate end-user-facing prose and structured string values in the locale propagated by Flow.
* DocSearch: Translate taxonomy filter labels before locale-aware sorting.
* Chat citations: Accept the current structured document/chunk citation payload while retaining compatibility with legacy flat citations during rolling backend upgrades.
* Localization: Correct block text domains and formalize key English, German, Spanish, French, and Hungarian frontend copy.
* Compatibility: Require Knowledge Automation capability 6 and use the version 2 delivery contract for locale-aware documents; legacy version 1 records remain readable by the backend.

= 1.4.24 =
* Dependencies: Bundled WP Suite Hub 2.5.15 with the Amplify preview.3 runtime that supplies the corrected Authenticator translations.
* Compatibility: Guard shared Hub constants when another WP Suite plugin already owns the runtime, avoiding duplicate-constant warnings during updates and CLI operations.

= 1.4.23 =
* Localization: Added the shared site translation catalog so custom strings resolve consistently across WP Suite plugins and site locales.
* Settings: Added an opt-in setting for the AI Feature language-switcher in the Chatbot, defaulting to off on fresh installs.
* Dependencies: Updated AI Kit Core to 1.5.9, AI Kit UI to 1.5.16, WP Suite Core to 2.4.2, and the bundled WP Suite Hub to 2.5.14 with the Amplify preview.2 catalogue corrections.

= 1.4.22 =
* Localization: Resolve automatic frontend language from the active site locale before using the browser preference, and include complete AI-Kit translations for all 22 supported locales.
* Dependencies: Refresh the shared WP Suite, Gatey, AI-Kit UI, and Amplify runtimes, while retaining React 18 compatibility.

= 1.4.21 =
* Metadata editors: Use YAML consistently for manual policy, external vocabularies, WordPress-derived data, effective/proposed results, and provenance. Preserve the structured API contract and validate external vocabulary input before saving.

= 1.4.20 =
* KB status: Use automatic delivery state for synchronized base documents instead of incorrectly requiring manual publication. Preserve review requirements for separate manual documents and stale locked overrides.
* Admin: Add sync queue, delivery, removal, and failure statuses to KB Sources badges and filters; show sync error codes and distinguish delivery acknowledgement from KB indexing.
* Notices: Recheck current source states before displaying a persisted review warning, clearing it when no source needs review.

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

= 1.6.6 =
Progress feedback works with the existing streaming backend. The separate bounded answer-completion retry requires orchestration v1.0.123 or an equivalent backend update. Citation requirements remain enforced; no new structured-field or price-record requirement is imposed. Backend deployment is not automatic.

= 1.6.2 =
Structured content synchronization requires orchestration v1.0.117 or an equivalent backend providing knowledge.structured-content capability version 1. It is disabled by default. Review selected public fields, mappings, profile permissions and enrolled workspace/site identifiers before enabling it; a source workspace ID is not an AWS account ID. Complete source synchronization and Knowledge Base ingestion before testing record tools. Remote field removal or disabling is confirmed only after backend acknowledgment. Existing non-structured synchronization remains supported. This plugin update does not deploy the backend or enable provider-specific booking integrations.
Display templates also require a compatible backend reporting answerPresentation support. Review source bindings, field mappings, image/link URL prefixes and authored labels before enabling them. Preview performs an actual approved read. History retains earlier source snapshots, not current prices or availability. Navigation links do not execute purchases or bookings. Configured guardrails assess display output separately; blocked, masked or unavailable assessments omit cards while preserving the text answer.

= 1.6.1 =
Update the AI Kit backend to orchestration v1.0.116 with product-page resolution, or deploy the equivalent backend changes, before using local product-page links. Existing v1.0.116 stacks also need that capability update. Guided catalog checks and detailed tool activity require a compatible backend. Existing connections and detailed settings remain available. Review presets, connections and page mappings before saving; new external sources require explicit evidence-policy approval. Review saved pairs after moving or unpublishing pages. The profile is shared by clients using the same backend. This plugin update does not deploy the backend or enable cart or checkout actions.

= 1.6.0 =
Open SmartCloud → Answers for setup, status and Advanced settings and resources. Existing settings and bookmarked admin URLs remain available. Replaying setup preserves settings outside the wizard; the separate Reset settings action explicitly clears local configuration after confirmation. Chatbot and DocSearch still require Pro and a compatible backend; this plugin update does not deploy one. DocSearch’s broad retrieval with visitor-selected taxonomy filters requires the corresponding AI-Kit backend update; updating only the plugin does not change an older backend’s filtering behavior.

= 1.5.9 =
Update the AI Kit backend to orchestration v1.0.109, or deploy the equivalent backend changes, before using the ingestion resume action and cost reconciliation details. A full metadata resynchronization is processed in scheduled batches; wait for both the WordPress scan and backend ingestion to finish before relying on refreshed Knowledge Base results.

= 1.5.8 =
Knowledge Base source metadata is resynchronized after this update. Sources protected by the Static Publisher release gate still wait for an acknowledged public release, and Bedrock ingestion must complete before corrected links appear in search results. No orchestration template update is required for this URL correction.

= 1.5.7 =
Category-path search requires the corresponding AI Kit backend update. Enable its migration mode, reconcile all WordPress and documentation metadata, and complete Knowledge Base ingestion before enabling ready mode. Capability or hierarchy changes trigger a new WordPress synchronization baseline; this alone does not prove ingestion is complete. Legacy backends retain the existing primary-category behavior.

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
Refresh the AI Kit backend and its capability manifest before using conversation-profile administration, grounded agent chat, the optional isolated executor, or monthly AI spend controls. During the coordinated upgrade, resave the pre-release Conversation Profile with HTTPS URL prefixes; the former host-only web-grounding field is intentionally not retained.

= 1.4.26 =
The optional Static Publisher release gate requires Static Publisher 1.0.20 and one content-sync rule covering every enabled Knowledge Sync content type. Leave the gate disabled when WordPress itself is public. After enabling it, complete one successful publish to bind the verified public target; unreleased work remains queued until then.

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

