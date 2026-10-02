# SmartCloud AI-Kit Abilities Provider

SmartCloud AI-Kit registers an optional native WordPress Abilities API provider when the WordPress Abilities API and the shared `smartcloud-wpsuite/abilities.php` layer are available. Missing API support is silent and does not change existing plugin behavior.

## Abilities

- `smartcloud-ai-kit/get-runtime-capabilities`
- `smartcloud-ai-kit/list-components`
- `smartcloud-ai-kit/get-component-schema`
- `smartcloud-ai-kit/materialize-component`
- `smartcloud-ai-kit/validate-block-tree`
- `smartcloud-ai-kit/list-knowledge-metadata`
- `smartcloud-ai-kit/get-knowledge-sync-policy`
- `smartcloud-ai-kit/get-knowledge-sync-status`
- `smartcloud-ai-kit/get-knowledge-metadata-diff`
- `smartcloud-ai-kit/request-knowledge-sync`

The discovery and status abilities are read-only, non-destructive, and idempotent. `request-knowledge-sync` is a non-destructive, idempotent mutation which only schedules the normal runner. It requires literal review-boundary confirmation, a verified automation-capable backend, enrollment, and at least one enabled policy. It cannot approve blocked content or bypass a manual review policy. All abilities use `show_in_rest=false` and `mcp.public=false`.

## Components

- `feature`
- `doc-search`
- `kb-section`

No chatbot Gutenberg component is exposed because the current source does not register a chatbot block.

## Runtime Readiness

The provider reports block registration, local/on-device AI as `browser-check-required`, backend/admin route readiness as server-observable states, and KB metadata availability. It does not perform model calls during discovery, schema retrieval, validation, or materialization.

## Knowledge Metadata

`list-knowledge-metadata` reads safe vocabulary values from AI-Kit's own KB metadata tables: categories, subcategories, and tags. It does not expose private KB documents, prompts, bearer tokens, API keys, signed URLs, raw settings, or backend responses.

These values are suggestions from generated documents, not an exhaustive identifier registry. KB section category, subcategory, and tag overrides are authored labels; existing slug-like values remain valid even when the discovery list contains display names. Validation enforces the backend limits of 256 UTF-8 bytes per non-empty label and at most 100 tags, without rewriting authored content.

`get-knowledge-metadata-diff` compares the current WordPress-derived taxonomy vocabulary with the last version accepted by the signed backend transport. `get-knowledge-sync-status` exposes only operational policy, queue, baseline, schedule, enrollment, compatibility, and ingestion state; private key material and content payloads are excluded.

Remote manifest drift is checked on demand and at least daily by the normal Knowledge Sync runner. Missing or hash-mismatched public sources are re-queued individually, while remote WordPress sources that are no longer eligible locally are converted to manifest-proven tombstones. Large deletion sets stop at a generation-bound administrator approval gate instead of being dispatched automatically.

## Direct PHP Example

```php
$ability = function_exists('wp_get_ability') ? wp_get_ability('smartcloud-ai-kit/list-components') : null;
$result = $ability ? $ability->execute(array()) : null;
```

## Provider Manifest

When all advertised abilities register successfully, AI-Kit contributes a data-only manifest through `smartcloud_composer_provider_profiles` for the SmartCloud Agent Composer. AI-Kit does not depend on Composer and does not create an MCP server.
