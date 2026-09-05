<?php
/**
 * Local baseline, scheduling, and recovery runtime for Knowledge Base sync.
 */

namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

if (!defined('ABSPATH')) {
    exit;
}

/** Resolves authored base-document metadata independently of markdown locking. */
final class KnowledgeSyncDocumentMetadata
{
    public static function baseUrlOverride(): string
    {
        return rtrim(trim((string) get_option('smartcloud_ai_kit_kb_base_url_override', '')), '/');
    }

    /** @param array<string, mixed>|null $overrides
     *  @return array<string, mixed>
     */
    public static function resolve(\WP_Post $post, ?array $overrides = null): array
    {
        if ($overrides === null) {
            $row = (new KBOverrideRepository())->get((int) $post->ID, 'post-' . $post->ID . '/base', 'main');
            $decoded = $row && $row->override_meta_json ? json_decode($row->override_meta_json, true) : null;
            $overrides = is_array($decoded) ? $decoded : array();
        }
        $text = static fn(string $key): string => is_string($overrides[$key] ?? null) ? trim($overrides[$key]) : '';
        $url = $text('postUrl');
        if ($url === '') {
            $url = (string) get_permalink($post);
            $base = self::baseUrlOverride();
            if ($base !== '') {
                $parts = wp_parse_url($url);
                $url = $base . (is_array($parts)
                    ? ($parts['path'] ?? '')
                        . (isset($parts['query']) ? '?' . $parts['query'] : '')
                        . (isset($parts['fragment']) ? '#' . $parts['fragment'] : '')
                    : '');
            }
        }
        $classification = array();
        foreach (array('category', 'subcategory') as $key) {
            if ($text($key) !== '') {
                $classification[$key] = $text($key);
            }
        }
        if (is_array($overrides['tags'] ?? null)) {
            $classification['tags'] = array_values(array_unique(array_filter(array_map(
                static fn(mixed $tag): string => is_string($tag) ? trim($tag) : '',
                $overrides['tags']
            ), static fn(string $tag): bool => $tag !== '')));
        }
        return array(
            'canonicalUrl' => $url,
            'title' => $text('title') !== '' ? $text('title') : trim(wp_strip_all_tags(get_the_title($post))),
            'excerpt' => $text('description') !== '' ? $text('description') : trim(wp_strip_all_tags(get_the_excerpt($post))),
            'classification' => $classification,
        );
    }
}

final class KnowledgeSyncSettingsStore
{
    public const OPTION_NAME = 'smartcloud_ai_kit_kb_sync_settings';

    /** @return array{includeSubsites:bool,baselinePageSize:int,transportBatchSize:int,backendBaseUrl:string,keyStorageMode:string,environment:string} */
    public function get(): array
    {
        $stored = get_option(self::OPTION_NAME, array());
        if (!is_array($stored)) {
            $stored = array();
        }

        return array(
            'includeSubsites' => is_multisite() && !empty($stored['includeSubsites']),
            'baselinePageSize' => max(10, min(200, absint($stored['baselinePageSize'] ?? 50))),
            'transportBatchSize' => max(1, min(100, absint($stored['transportBatchSize'] ?? 25))),
            'backendBaseUrl' => $this->normalizeBackendBaseUrl($stored['backendBaseUrl'] ?? ''),
            'keyStorageMode' => $this->normalizeKeyStorageMode($stored['keyStorageMode'] ?? 'disabled'),
            'environment' => $this->normalizeEnvironment($stored['environment'] ?? 'prod'),
        );
    }

    /** @param array<string, mixed> $settings
     *  @return array{includeSubsites:bool,baselinePageSize:int,transportBatchSize:int,backendBaseUrl:string,keyStorageMode:string,environment:string}
     */
    public function save(array $settings): array
    {
        $previous = $this->get();
        foreach (array_keys($settings) as $field) {
            if (!is_string($field) || !in_array($field, array(
                'includeSubsites',
                'baselinePageSize',
                'transportBatchSize',
                'backendBaseUrl',
                'keyStorageMode',
                'environment',
            ), true)) {
                throw new \InvalidArgumentException('Unsupported knowledge-sync setting.');
            }
        }
        if (!empty($settings['includeSubsites']) && !$this->canIncludeSubsites()) {
            throw new \InvalidArgumentException(
                'Following subsites requires a multisite network-active AI Kit installation.'
            );
        }
        $normalized = array(
            'includeSubsites' => is_multisite() && !empty($settings['includeSubsites']),
            'baselinePageSize' => max(10, min(200, absint($settings['baselinePageSize'] ?? 50))),
            'transportBatchSize' => max(1, min(100, absint($settings['transportBatchSize'] ?? 25))),
            'backendBaseUrl' => $this->normalizeBackendBaseUrl($settings['backendBaseUrl'] ?? ''),
            'keyStorageMode' => $this->normalizeKeyStorageMode($settings['keyStorageMode'] ?? 'disabled'),
            'environment' => $this->normalizeEnvironment($settings['environment'] ?? 'prod'),
        );
        update_option(self::OPTION_NAME, $normalized, false);
        if ($previous['backendBaseUrl'] !== $normalized['backendBaseUrl']) {
            KnowledgeSyncVocabularyService::invalidate();
        }
        do_action('smartcloud_ai_kit_knowledge_sync_settings_changed', $normalized);

        return $normalized;
    }

    private function canIncludeSubsites(): bool
    {
        if (!is_multisite()) {
            return false;
        }
        if (!function_exists('is_plugin_active_for_network')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        return function_exists('is_plugin_active_for_network') && is_plugin_active_for_network(
            plugin_basename(SMARTCLOUD_AI_KIT_PATH . 'smartcloud-ai-kit.php')
        );
    }

    private function normalizeBackendBaseUrl(mixed $value): string
    {
        if (!is_string($value) || trim($value) === '') {
            return '';
        }
        $url = untrailingslashit(esc_url_raw(trim($value)));
        $parts = wp_parse_url($url);
        if (
            !is_array($parts) ||
            ($parts['scheme'] ?? '') !== 'https' ||
            empty($parts['host']) ||
            isset($parts['user']) ||
            isset($parts['pass']) ||
            isset($parts['query']) ||
            isset($parts['fragment'])
        ) {
            throw new \InvalidArgumentException('Knowledge-sync backend URL must be an HTTPS origin or base path.');
        }
        return $url;
    }

    private function normalizeKeyStorageMode(mixed $value): string
    {
        $mode = is_string($value) ? $value : 'disabled';
        if (!in_array($mode, array('disabled', 'file', 'encrypted-option'), true)) {
            throw new \InvalidArgumentException('Unsupported knowledge-sync key storage mode.');
        }
        return $mode;
    }

    private function normalizeEnvironment(mixed $value): string
    {
        $environment = is_string($value) ? sanitize_key($value) : 'prod';
        if (!in_array($environment, array('dev', 'staging', 'prod'), true)) {
            throw new \InvalidArgumentException('Unsupported knowledge-sync environment.');
        }
        return $environment;
    }
}

final class KnowledgeSyncBaselineRepository
{
    /** Resolve against the currently selected multisite blog. */
    private function tableName(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'smartcloud_ai_kit_kb_sync_baselines';
    }

    public function ensure(
        string $consumer_id,
        int $blog_id,
        string $post_type,
        string $serializer_fingerprint,
        string $policy_fingerprint
    ): object {
        global $wpdb;
        $now = current_time('mysql', true);

        // Assign status/cursors before replacing fingerprints so MySQL compares
        // the previously stored contract values.
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Durable baseline state.
        $wpdb->query($wpdb->prepare(
            "INSERT INTO %i
                (consumer_id, blog_id, post_type, status, cursor_post_id,
                 high_water_post_id, serializer_fingerprint, policy_fingerprint,
                 last_error_code, started_gmt, verified_gmt, updated_gmt)
             VALUES (%s, %d, %s, 'required', 0, 0, %s, %s, NULL, NULL, NULL, %s)
             ON DUPLICATE KEY UPDATE
                 status = IF(
                     NOT (serializer_fingerprint <=> VALUES(serializer_fingerprint))
                     OR NOT (policy_fingerprint <=> VALUES(policy_fingerprint)),
                     'stale', status
                 ),
                 cursor_post_id = IF(
                     NOT (serializer_fingerprint <=> VALUES(serializer_fingerprint))
                     OR NOT (policy_fingerprint <=> VALUES(policy_fingerprint)),
                     0, cursor_post_id
                 ),
                 high_water_post_id = IF(
                     NOT (serializer_fingerprint <=> VALUES(serializer_fingerprint))
                     OR NOT (policy_fingerprint <=> VALUES(policy_fingerprint)),
                     0, high_water_post_id
                 ),
                 started_gmt = IF(
                     NOT (serializer_fingerprint <=> VALUES(serializer_fingerprint))
                     OR NOT (policy_fingerprint <=> VALUES(policy_fingerprint)),
                     NULL, started_gmt
                 ),
                 verified_gmt = IF(
                     NOT (serializer_fingerprint <=> VALUES(serializer_fingerprint))
                     OR NOT (policy_fingerprint <=> VALUES(policy_fingerprint)),
                     NULL, verified_gmt
                 ),
                 last_error_code = IF(
                     NOT (serializer_fingerprint <=> VALUES(serializer_fingerprint))
                     OR NOT (policy_fingerprint <=> VALUES(policy_fingerprint)),
                     'baseline_fingerprint_changed', last_error_code
                 ),
                 serializer_fingerprint = VALUES(serializer_fingerprint),
                 policy_fingerprint = VALUES(policy_fingerprint),
                 updated_gmt = VALUES(updated_gmt)",
            $this->tableName(),
            $consumer_id,
            $blog_id,
            $post_type,
            $serializer_fingerprint,
            $policy_fingerprint,
            $now
        ));

        $row = $this->get($consumer_id, $blog_id, $post_type);
        if (!$row) {
            throw new \RuntimeException('Knowledge-sync baseline row could not be created.');
        }
        return $row;
    }

    public function get(string $consumer_id, int $blog_id, string $post_type): ?object
    {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Baseline state read.
        return $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM %i WHERE consumer_id = %s AND blog_id = %d AND post_type = %s',
            $this->tableName(),
            $consumer_id,
            $blog_id,
            $post_type
        ));
    }

    public function begin(int $id, int $high_water_post_id): bool
    {
        global $wpdb;
        $now = current_time('mysql', true);
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Baseline state transition.
        return $wpdb->query($wpdb->prepare(
            "UPDATE %i SET status = 'building', cursor_post_id = 0,
             high_water_post_id = %d, last_error_code = NULL,
             started_gmt = %s, verified_gmt = NULL, updated_gmt = %s
             WHERE id = %d",
            $this->tableName(),
            $high_water_post_id,
            $now,
            $now,
            $id
        )) === 1;
    }

    public function advance(int $id, int $cursor_post_id, bool $complete): bool
    {
        global $wpdb;
        $now = current_time('mysql', true);
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Baseline checkpoint.
        return $wpdb->query($wpdb->prepare(
            "UPDATE %i SET status = %s, cursor_post_id = %d,
             verified_gmt = IF(%d = 1, %s, NULL), last_error_code = NULL,
             updated_gmt = %s WHERE id = %d AND status = 'building'",
            $this->tableName(),
            $complete ? 'ready' : 'building',
            $cursor_post_id,
            $complete ? 1 : 0,
            $now,
            $now,
            $id
        )) === 1;
    }

    public function markError(int $id, string $error_code): void
    {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Baseline error state.
        $wpdb->query($wpdb->prepare(
            "UPDATE %i SET status = 'error', last_error_code = %s, updated_gmt = %s WHERE id = %d",
            $this->tableName(),
            sanitize_key($error_code),
            current_time('mysql', true),
            $id
        ));
    }

    /** @return object[] */
    public function listAll(): array
    {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Operational baseline summary.
        return (array) $wpdb->get_results($wpdb->prepare(
            'SELECT * FROM %i ORDER BY blog_id ASC, post_type ASC',
            $this->tableName()
        ));
    }
}

final class KnowledgeSyncBaselineService
{
    public const SERIALIZER_VERSION = 'knowledge-sync-document-v2-authored-metadata';

    public static function serializerFingerprint(): string
    {
        return hash('sha256', self::SERIALIZER_VERSION . ':' . KnowledgeSyncDocumentMetadata::baseUrlOverride());
    }

    public function __construct(
        private readonly KnowledgeSyncPolicyStore $policies,
        private readonly KnowledgeSyncOutboxRepository $outbox,
        private readonly KnowledgeSyncBaselineRepository $baselines
    ) {
    }

    /** @return array<string, mixed> */
    public function reconcilePage(string $post_type, int $limit): array
    {
        $policy = $this->policies->getForPostType($post_type);
        if ($policy === null || empty($policy['enabled']) || $policy['reviewPolicy'] === 'disabled') {
            return array('status' => 'disabled', 'processed' => 0, 'postType' => $post_type);
        }

        $blog_id = get_current_blog_id();
        $consumer_id = 'wordpress-blog-' . $blog_id;
        $serializer_fingerprint = self::serializerFingerprint();
        $policy_fingerprint = $this->policies->fingerprint($policy);
        $baseline = $this->baselines->ensure(
            $consumer_id,
            $blog_id,
            $post_type,
            $serializer_fingerprint,
            $policy_fingerprint
        );
        if ($baseline->status === 'ready') {
            return array('status' => 'ready', 'processed' => 0, 'postType' => $post_type);
        }

        if ($baseline->status !== 'building') {
            $this->baselines->begin((int) $baseline->id, $this->highestPublishedPostId($post_type));
            $baseline = $this->baselines->get($consumer_id, $blog_id, $post_type);
        }
        if (!$baseline) {
            throw new \RuntimeException('Knowledge-sync baseline disappeared during reconciliation.');
        }

        $limit = max(10, min(200, $limit));
        $post_ids = $this->publishedPostIds(
            $post_type,
            (int) $baseline->cursor_post_id,
            (int) $baseline->high_water_post_id,
            $limit
        );
        $cursor = (int) $baseline->cursor_post_id;
        foreach ($post_ids as $post_id) {
            $post = get_post($post_id);
            if (!$post instanceof \WP_Post || $post->post_status !== 'publish') {
                continue;
            }
            $manual_review = $policy['reviewPolicy'] === 'manual-kb-review';
            $url = get_permalink($post);
            $this->outbox->enqueue(
                $blog_id,
                $post_type,
                $post_id,
                'upsert',
                wp_generate_uuid4(),
                $manual_review ? 'blocked' : 'pending',
                is_string($url) && !str_contains($url, '__trashed') ? $url : null,
                $manual_review ? 'manual_review_required' : null
            );
            $cursor = max($cursor, $post_id);
        }

        $complete = count($post_ids) < $limit || $cursor >= (int) $baseline->high_water_post_id;
        $this->baselines->advance((int) $baseline->id, $cursor, $complete);

        return array(
            'status' => $complete ? 'ready' : 'building',
            'processed' => count($post_ids),
            'cursorPostId' => $cursor,
            'highWaterPostId' => (int) $baseline->high_water_post_id,
            'postType' => $post_type,
        );
    }

    private function highestPublishedPostId(string $post_type): int
    {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Stable baseline high-water boundary.
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COALESCE(MAX(ID), 0) FROM %i WHERE post_type = %s AND post_status = 'publish'",
            $wpdb->posts,
            $post_type
        ));
    }

    /** @return int[] */
    private function publishedPostIds(string $post_type, int $after_id, int $through_id, int $limit): array
    {
        global $wpdb;
        if ($through_id === 0) {
            return array();
        }
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Paginated baseline source scan.
        return array_map('intval', $wpdb->get_col($wpdb->prepare(
            "SELECT ID FROM %i WHERE post_type = %s AND post_status = 'publish'
             AND ID > %d AND ID <= %d ORDER BY ID ASC LIMIT %d",
            $wpdb->posts,
            $post_type,
            $after_id,
            $through_id,
            $limit
        )));
    }
}

final class KnowledgeSyncAuditRepository
{
    /** Resolve against the currently selected multisite blog. */
    private function tableName(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'smartcloud_ai_kit_kb_sync_audit';
    }

    /** @param array<string, scalar|null> $details */
    public function record(string $event_type, string $status, array $details = array()): void
    {
        global $wpdb;
        $consumer_id = isset($details['consumerId']) ? (string) $details['consumerId'] : '';
        $post_type = isset($details['postType']) ? sanitize_key((string) $details['postType']) : '';
        $correlation_id = isset($details['correlationId']) ? (string) $details['correlationId'] : '';
        $error_code = isset($details['errorCode']) ? sanitize_key((string) $details['errorCode']) : '';
        $post_id = isset($details['postId']) ? absint($details['postId']) : 0;
        $safe_details = array_diff_key($details, array_flip(array('content', 'privateKey', 'signature', 'pairingCode')));

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Append-only operational audit.
        $wpdb->query($wpdb->prepare(
            "INSERT INTO %i
             (blog_id, event_type, status, consumer_id, post_type, post_id,
              correlation_id, error_code, details_json, recorded_gmt)
             VALUES (%d, %s, %s, NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%d, 0),
                     NULLIF(%s, ''), NULLIF(%s, ''), %s, %s)",
            $this->tableName(),
            get_current_blog_id(),
            sanitize_key($event_type),
            sanitize_key($status),
            $consumer_id,
            $post_type,
            $post_id,
            $correlation_id,
            $error_code,
            wp_json_encode($safe_details, JSON_UNESCAPED_SLASHES),
            current_time('mysql', true)
        ));
    }
}

final class KnowledgeSyncProjectionException extends \RuntimeException
{
    public function __construct(public readonly string $error_code, string $message)
    {
        parent::__construct($message);
    }
}

final class KnowledgeSyncProjectionBuilder
{
    /** @return array<string, mixed> */
    public function build(object $lease): array
    {
        $operation = (string) ($lease->leased_operation ?? '');
        $source_version = (string) ($lease->leased_source_version ?? '');
        $correlation_id = (string) ($lease->leased_correlation_id ?? '');
        if (
            !in_array($operation, array('upsert', 'delete'), true) ||
            !preg_match('/^[1-9][0-9]*$/', $source_version) ||
            preg_match('/^[A-Za-z0-9._:-]+$/', $correlation_id) !== 1
        ) {
            throw new KnowledgeSyncProjectionException('invalid_lease_snapshot', 'Lease snapshot is incomplete.');
        }

        $site_id = $this->siteId();
        $projection = array(
            'schemaVersion' => 1,
            'source' => array(
                'producer' => 'wordpress',
                'siteId' => $site_id,
                'blogId' => (string) (int) $lease->blog_id,
                'postType' => sanitize_key((string) $lease->post_type),
                'postId' => (string) (int) $lease->post_id,
            ),
            'sourceVersion' => $source_version,
            'correlationId' => $correlation_id,
            'observedAt' => gmdate('c'),
            'operation' => $operation,
        );

        if ($operation === 'delete') {
            $projection['document'] = null;
            $last_public_url = (string) ($lease->last_public_url ?? '');
            if ($last_public_url !== '') {
                $projection['lastPublicUrl'] = $last_public_url;
            }
            return $projection;
        }

        $post = get_post((int) $lease->post_id);
        if (!$post instanceof \WP_Post || $post->post_status !== 'publish') {
            throw new KnowledgeSyncProjectionException(
                'source_no_longer_public',
                'Leased upsert source is no longer public; its newer desired state must be processed.'
            );
        }
        $policy = (new KnowledgeSyncPolicyStore())->getForPostType($post->post_type);
        if ($policy === null || empty($policy['enabled']) || $policy['reviewPolicy'] === 'disabled') {
            throw new KnowledgeSyncProjectionException('policy_scope_changed', 'Source is no longer in policy scope.');
        }

        $resolved_metadata = KnowledgeSyncDocumentMetadata::resolve($post);
        $title = $resolved_metadata['title'];
        if ($title === '') {
            $title = sprintf('Untitled WordPress source %d', (int) $post->ID);
        }
        $rendered_html = apply_filters('the_content', $post->post_content);
        $markdown = (new Converter())->htmlToMarkdown((string) $rendered_html);
        if (trim($markdown) === '') {
            $markdown = '# ' . $title;
        }
        $url = $resolved_metadata['canonicalUrl'];
        if (!is_string($url) || $url === '' || str_contains($url, '__trashed')) {
            throw new KnowledgeSyncProjectionException('invalid_public_url', 'Public source has no stable canonical URL.');
        }
        $modified = get_post_modified_time('c', true, $post);
        if (!is_string($modified) || $modified === '') {
            $modified = gmdate('c');
        }

        $projection['document'] = array(
            'profile' => (string) $policy['documentProfile'],
            'canonicalUrl' => $url,
            'title' => $title,
            'excerpt' => $resolved_metadata['excerpt'],
            'content' => $markdown,
            'contentType' => 'text/markdown',
            'contentSha256' => hash('sha256', $markdown),
            'modifiedGmt' => $modified,
            'metadata' => $this->metadata((int) $post->ID, $policy['includeTaxonomies']),
        );

        if ($resolved_metadata['classification'] !== array()) {
            $projection['document']['classification'] = $resolved_metadata['classification'];
        }

        return $projection;
    }

    private function siteId(): string
    {
        $settings = get_option('smartcloud-wpsuite/site-settings');
        if ($settings === false) {
            $settings = get_option('hub-for-wpsuiteio/site-settings');
        }
        $site_id = is_object($settings)
            ? (string) ($settings->siteId ?? '')
            : (is_array($settings) ? (string) ($settings['siteId'] ?? '') : '');
        if ($site_id === '' || preg_match('/^[A-Za-z0-9._:-]+$/', $site_id) !== 1) {
            throw new KnowledgeSyncProjectionException(
                'site_not_connected',
                'Connect this WordPress site before dispatching knowledge-sync work.'
            );
        }
        return $site_id;
    }

    /** @param string[] $taxonomies
     *  @return array<int, array{namespace:string,slug:string,label:string}>
     */
    private function metadata(int $post_id, array $taxonomies): array
    {
        $metadata = array();
        foreach ($taxonomies as $taxonomy) {
            $terms = wp_get_object_terms($post_id, $taxonomy);
            if (is_wp_error($terms)) {
                throw new KnowledgeSyncProjectionException('taxonomy_read_failed', 'Selected taxonomy could not be read.');
            }
            foreach ($terms as $term) {
                $slug = sanitize_key((string) $term->slug);
                if ($slug === '') {
                    $slug = 'term-' . (int) $term->term_id;
                }
                $metadata[] = array(
                    'namespace' => sanitize_key($taxonomy),
                    'slug' => $slug,
                    'label' => trim((string) $term->name) !== '' ? (string) $term->name : $slug,
                );
            }
        }
        usort($metadata, static fn(array $left, array $right): int => strcmp(
            $left['namespace'] . ':' . $left['slug'],
            $right['namespace'] . ':' . $right['slug']
        ));
        return $metadata;
    }
}

final class KnowledgeSyncBatchDispatcher
{
    public function isAvailable(): bool
    {
        return (bool) apply_filters('smartcloud_ai_kit_knowledge_sync_transport_available', false);
    }

    /**
     * The Stage 2 signed transport registers this internal filter. Returning
     * anything outside the narrow item-result grammar fails the batch closed.
     *
     * @param array<int, array<string, mixed>> $projections Outbox ID => projection.
     * @param array<int, string> $reviewed_delete_generations Outbox ID => reviewed source version.
     * @return array<int, array{status:string,errorCode?:string}>
     */
    public function dispatch(array $projections, array $reviewed_delete_generations = array()): array
    {
        $response = apply_filters(
            'smartcloud_ai_kit_knowledge_sync_dispatch_batch',
            null,
            $projections,
            $reviewed_delete_generations
        );
        if (!is_array($response)) {
            throw new KnowledgeSyncProjectionException('transport_invalid_response', 'Knowledge-sync transport returned an invalid response.');
        }

        $normalized = array();
        foreach ($projections as $outbox_id => $_projection) {
            $item = $response[$outbox_id] ?? $response[(string) $outbox_id] ?? null;
            if (!is_array($item) || !in_array(($item['status'] ?? ''), array('accepted', 'retry', 'blocked'), true)) {
                throw new KnowledgeSyncProjectionException('transport_partial_response', 'Knowledge-sync transport omitted an item result.');
            }
            $normalized[$outbox_id] = array(
                'status' => (string) $item['status'],
                ...(!empty($item['errorCode']) ? array('errorCode' => sanitize_key((string) $item['errorCode'])) : array()),
            );
        }
        return $normalized;
    }
}

final class KnowledgeSyncVocabularyService
{
    public const OPTION_NAME = 'smartcloud_ai_kit_kb_sync_vocabulary_state';

    public static function invalidate(): void
    {
        delete_option(self::OPTION_NAME);
    }

    /** @return array{status:string,changed?:bool,errorCode?:string} */
    public function reconcile(): array
    {
        if (!(bool) apply_filters('smartcloud_ai_kit_knowledge_sync_transport_available', false)) {
            return array('status' => 'transport-unavailable');
        }

        $namespaces = $this->desiredNamespaces();
        $desired = array(
            'schemaVersion' => 2,
            'blogId' => (string) get_current_blog_id(),
            'enabled' => $namespaces !== array(),
            'namespaces' => $namespaces,
        );
        $encoded = wp_json_encode($desired, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($encoded)) {
            throw new KnowledgeSyncProjectionException(
                'vocabulary_encode_failed',
                'The WordPress vocabulary input could not be encoded.'
            );
        }
        $fingerprint = hash('sha256', $encoded);
        $stored = get_option(self::OPTION_NAME, array());
        if (!is_array($stored)) {
            $stored = array();
        }
        if (hash_equals((string) ($stored['fingerprint'] ?? ''), $fingerprint)) {
            return array('status' => 'unchanged', 'changed' => false);
        }

        $version = max(0, absint($stored['sourceVersion'] ?? 0)) + 1;
        $input = array_merge($desired, array('sourceVersion' => (string) $version));
        $response = apply_filters(
            'smartcloud_ai_kit_knowledge_sync_dispatch_vocabulary',
            null,
            $input
        );
        if (!is_array($response) || !isset($response['status'])) {
            throw new KnowledgeSyncProjectionException(
                'transport_invalid_response',
                'Knowledge-sync transport returned an invalid vocabulary response.'
            );
        }
        if ($response['status'] === 'accepted') {
            update_option(self::OPTION_NAME, array(
                'fingerprint' => $fingerprint,
                'sourceVersion' => $version,
                'acceptedGmt' => gmdate('c'),
                'namespaces' => $namespaces,
            ), false);
        }

        return array(
            'status' => (string) $response['status'],
            ...(isset($response['changed']) ? array('changed' => (bool) $response['changed']) : array()),
            ...(!empty($response['errorCode'])
                ? array('errorCode' => sanitize_key((string) $response['errorCode']))
                : array()),
        );
    }

    /** @return array<string, array<int, array{slug:string,label:string,parentSlug?:string}>> */
    public function desiredNamespaces(): array
    {
        $selected = array();
        foreach ((new KnowledgeSyncPolicyStore())->getAll() as $policy) {
            if (empty($policy['enabled']) || $policy['reviewPolicy'] === 'disabled') {
                continue;
            }
            foreach ((array) $policy['includeTaxonomies'] as $taxonomy) {
                $selected[sanitize_key((string) $taxonomy)] = true;
            }
        }

        $namespaces = array();
        foreach (array_keys($selected) as $taxonomy) {
            $object = get_taxonomy($taxonomy);
            if (!$object instanceof \WP_Taxonomy || empty($object->public)) {
                continue;
            }
            $terms_by_id = array();
            $page_size = 500;
            $offset = 0;
            do {
                $terms = get_terms(array(
                    'taxonomy' => $taxonomy,
                    'hide_empty' => false,
                    'number' => $page_size,
                    'offset' => $offset,
                    'orderby' => 'term_id',
                    'order' => 'ASC',
                ));
                if (is_wp_error($terms)) {
                    throw new KnowledgeSyncProjectionException(
                        'taxonomy_read_failed',
                        'Selected taxonomy vocabulary could not be read.'
                    );
                }
                foreach ($terms as $term) {
                    $slug = sanitize_key((string) $term->slug);
                    $slug = $slug !== '' ? $slug : 'term-' . (int) $term->term_id;
                    $label = sanitize_text_field((string) $term->name);
                    $terms_by_id[(int) $term->term_id] = array(
                        'slug' => $slug,
                        'label' => $label !== '' ? $label : $slug,
                        'parentId' => (int) ($term->parent ?? 0),
                    );
                }
                $offset += count($terms);
            } while (count($terms) === $page_size);

            $values = array();
            foreach ($terms_by_id as $term_id => $term) {
                $value = array(
                    'slug' => $term['slug'],
                    'label' => $term['label'],
                );
                if (!empty($object->hierarchical) && $term['parentId'] > 0) {
                    if ($term['parentId'] === $term_id || !isset($terms_by_id[$term['parentId']])) {
                        throw new KnowledgeSyncProjectionException(
                            'taxonomy_parent_invalid',
                            'Selected taxonomy contains an invalid parent relationship.'
                        );
                    }
                    $value['parentSlug'] = $terms_by_id[$term['parentId']]['slug'];
                }
                $values[$term['slug']] = $value;
            }
            ksort($values, SORT_STRING);
            $values = array_values($values);
            if ($values !== array()) {
                $namespaces[$taxonomy] = $values;
            }
        }
        ksort($namespaces, SORT_STRING);
        return $namespaces;
    }

    /** @return array{status:string,sourceVersion:int,additions:array<int,array{namespace:string,slug:string,label:string}>,removals:array<int,array{namespace:string,slug:string,label:string}>,changes:array<int,array{namespace:string,slug:string,fromLabel:string,toLabel:string}>} */
    public function metadataDiff(): array
    {
        $stored = get_option(self::OPTION_NAME, array());
        $stored = is_array($stored) ? $stored : array();
        $accepted = isset($stored['namespaces']) && is_array($stored['namespaces'])
            ? $stored['namespaces']
            : null;
        $desired = $this->desiredNamespaces();
        $desired_terms = $this->flattenNamespaces($desired);
        $accepted_terms = $accepted === null ? array() : $this->flattenNamespaces($accepted);
        $changes = array();
        foreach (array_intersect_key($desired_terms, $accepted_terms) as $key => $desired_term) {
            $accepted_term = $accepted_terms[$key];
            if (
                $desired_term['label'] === $accepted_term['label'] &&
                ($desired_term['parentSlug'] ?? null) === ($accepted_term['parentSlug'] ?? null)
            ) {
                continue;
            }
            $changes[] = array(
                'namespace' => $desired_term['namespace'],
                'slug' => $desired_term['slug'],
                'fromLabel' => $accepted_term['label'],
                'toLabel' => $desired_term['label'],
                'fromParentSlug' => $accepted_term['parentSlug'] ?? null,
                'toParentSlug' => $desired_term['parentSlug'] ?? null,
            );
        }

        return array(
            'status' => $accepted === null
                ? 'baseline-required'
                : ($desired_terms === $accepted_terms ? 'clean' : 'changed'),
            'sourceVersion' => max(0, absint($stored['sourceVersion'] ?? 0)),
            'additions' => array_values(array_diff_key($desired_terms, $accepted_terms)),
            'removals' => array_values(array_diff_key($accepted_terms, $desired_terms)),
            'changes' => $changes,
        );
    }

    /**
     * @param array<string, mixed> $namespaces
     * @return array<string, array{namespace:string,slug:string,label:string,parentSlug?:string}>
     */
    private function flattenNamespaces(array $namespaces): array
    {
        $terms = array();
        foreach ($namespaces as $namespace => $values) {
            $namespace = sanitize_key((string) $namespace);
            if ($namespace === '' || !is_array($values)) {
                continue;
            }
            foreach ($values as $value) {
                if (!is_array($value)) {
                    continue;
                }
                $slug = sanitize_key((string) ($value['slug'] ?? ''));
                if ($slug === '') {
                    continue;
                }
                $term = array(
                    'namespace' => $namespace,
                    'slug' => $slug,
                    'label' => sanitize_text_field((string) ($value['label'] ?? $slug)),
                );
                $parent_slug = sanitize_key((string) ($value['parentSlug'] ?? ''));
                if ($parent_slug !== '') {
                    $term['parentSlug'] = $parent_slug;
                }
                $terms[$namespace . ':' . $slug] = $term;
            }
        }
        ksort($terms, SORT_STRING);
        return $terms;
    }
}

final class KnowledgeSyncRunnerLock
{
    private const OPTION_NAME = 'smartcloud_ai_kit_kb_sync_runner_lock';

    public function acquire(int $ttl_seconds = 300): ?string
    {
        $now = time();
        $existing = get_option(self::OPTION_NAME, null);
        if (is_array($existing) && (int) ($existing['expires'] ?? 0) <= $now) {
            delete_option(self::OPTION_NAME);
        }

        $token = wp_generate_uuid4();
        $created = add_option(self::OPTION_NAME, array(
            'token' => $token,
            'expires' => $now + max(60, min(900, $ttl_seconds)),
        ), '', false);
        return $created ? $token : null;
    }

    public function release(string $token): void
    {
        $existing = get_option(self::OPTION_NAME, null);
        if (is_array($existing) && hash_equals((string) ($existing['token'] ?? ''), $token)) {
            delete_option(self::OPTION_NAME);
        }
    }
}

final class KnowledgeSyncRuntime
{
    public const CRON_HOOK = 'smartcloud_ai_kit_knowledge_sync_tick';
    public const LAST_RUN_OPTION = 'smartcloud_ai_kit_kb_sync_last_run';
    private const CRON_SCHEDULE = 'smartcloud_ai_kit_five_minutes';
    private const DRIFT_CHECK_OPTION = 'smartcloud_ai_kit_kb_sync_last_drift_check';
    private const DRIFT_CURSOR_OPTION = 'smartcloud_ai_kit_kb_sync_drift_cursor';
    private const MASS_DELETE_MINIMUM = 10;
    private const MASS_DELETE_RATIO = 0.5;

    public function registerHooks(): void
    {
        add_filter('cron_schedules', array($this, 'addCronSchedule'));
        add_action('init', array($this, 'ensureScheduled'));
        add_action(self::CRON_HOOK, array($this, 'run'));
        add_action('smartcloud_ai_kit_knowledge_sync_policy_changed', array($this, 'onPolicyChanged'), 10, 3);
        add_action('smartcloud_ai_kit_knowledge_sync_settings_changed', array($this, 'ensureScheduled'));
    }

    /** @param array<string, array<string, int|string>> $schedules
     *  @return array<string, array<string, int|string>>
     */
    public function addCronSchedule(array $schedules): array
    {
        $schedules[self::CRON_SCHEDULE] = array(
            'interval' => 300,
            'display' => __('Every five minutes (AI Kit knowledge sync)', 'smartcloud-ai-kit'),
        );
        return $schedules;
    }

    public function ensureScheduled(): void
    {
        if (!$this->hasEnabledPolicyInScope()) {
            wp_clear_scheduled_hook(self::CRON_HOOK);
            return;
        }
        if (!wp_next_scheduled(self::CRON_HOOK)) {
            wp_schedule_event(time() + 60, self::CRON_SCHEDULE, self::CRON_HOOK);
        }
    }

    /** @param array<string, mixed> $policy
     *  @param array<string, mixed>|null $previous
     */
    public function onPolicyChanged(string $post_type, array $policy, ?array $previous): void
    {
        $was_enabled = $previous !== null && !empty($previous['enabled']) && $previous['reviewPolicy'] !== 'disabled';
        $is_enabled = !empty($policy['enabled']) && $policy['reviewPolicy'] !== 'disabled';
        if ($was_enabled && !$is_enabled) {
            (new KnowledgeSyncOutboxRepository())->enqueueScopeDeletion(
                get_current_blog_id(),
                $post_type,
                wp_generate_uuid4()
            );
        }
        $this->ensureScheduled();
    }

    /** @return array<string, mixed> */
    public function run(bool $force_drift_check = false): array
    {
        $root_blog_id = get_current_blog_id();
        $lock = new KnowledgeSyncRunnerLock();
        $token = $lock->acquire();
        if ($token === null) {
            return array('status' => 'locked', 'blogs' => array());
        }

        $results = array();
        $had_error = false;
        try {
            foreach ($this->blogIdsInScope() as $blog_id) {
                $switched = is_multisite() && $blog_id !== get_current_blog_id();
                if ($switched) {
                    switch_to_blog($blog_id);
                }
                try {
                    if (
                        defined('SMARTCLOUD_AI_KIT_DB_VERSION') &&
                        version_compare(
                            (string) get_option('smartcloud_ai_kit_db_version', '0'),
                            (string) SMARTCLOUD_AI_KIT_DB_VERSION,
                            '<'
                        )
                    ) {
                        Schema::createTables();
                        update_option('smartcloud_ai_kit_db_version', SMARTCLOUD_AI_KIT_DB_VERSION);
                    }
                    $policies = new KnowledgeSyncPolicyStore();
                    $settings = (new KnowledgeSyncSettingsStore())->get();
                    $service = new KnowledgeSyncBaselineService(
                        $policies,
                        new KnowledgeSyncOutboxRepository(),
                        new KnowledgeSyncBaselineRepository()
                    );
                    foreach ($policies->getAll() as $post_type => $policy) {
                        if (empty($policy['enabled']) || $policy['reviewPolicy'] === 'disabled') {
                            continue;
                        }
                        $results[] = array_merge(
                            array('blogId' => $blog_id),
                            $service->reconcilePage($post_type, $settings['baselinePageSize'])
                        );
                    }
                    $vocabulary = (new KnowledgeSyncVocabularyService())->reconcile();
                    if ($vocabulary['status'] !== 'transport-unavailable') {
                        $results[] = array_merge(
                            array('blogId' => $blog_id, 'operation' => 'metadata-vocabulary'),
                            $vocabulary
                        );
                    }
                    $dispatch = $this->dispatchOutbox($settings['transportBatchSize']);
                    if ($dispatch !== null) {
                        $results[] = array_merge(array('blogId' => $blog_id), $dispatch);
                    }
                    $last_drift_check = absint(get_option(self::DRIFT_CHECK_OPTION, 0));
                    if ($force_drift_check || $last_drift_check + DAY_IN_SECONDS <= time()) {
                        $drift = $this->repairRemoteDrift();
                        if ($drift !== null) {
                            $results[] = array_merge(array('blogId' => $blog_id), $drift);
                            if ($drift['status'] === 'complete') {
                                update_option(self::DRIFT_CHECK_OPTION, time(), false);
                            }
                        }
                    }
                } catch (\Throwable $error) {
                    $had_error = true;
                    $error_code = $error instanceof KnowledgeSyncProjectionException
                        ? $error->error_code
                        : ($error instanceof KnowledgeSyncTransportException
                            ? $error->errorCode
                            : 'knowledge_sync_run_failed');
                    (new KnowledgeSyncAuditRepository())->record('baseline-page', 'failed', array(
                        'errorCode' => $error_code,
                    ));
                    $results[] = array(
                        'blogId' => $blog_id,
                        'status' => 'error',
                        'errorCode' => $error_code,
                    );
                } finally {
                    if ($switched) {
                        restore_current_blog();
                    }
                }
            }
        } finally {
            if (get_current_blog_id() !== $root_blog_id && is_multisite()) {
                while (ms_is_switched()) {
                    restore_current_blog();
                }
            }
            $lock->release($token);
        }

        $result = array(
            'status' => $had_error ? 'partial-failure' : 'success',
            'completedGmt' => gmdate('c'),
            'blogs' => $results,
        );
        update_option(self::LAST_RUN_OPTION, $result, false);
        return $result;
    }

    /** @return array<string, mixed>|null */
    private function repairRemoteDrift(): ?array
    {
        if (!class_exists(KnowledgeSyncTransport::class)) {
            return null;
        }
        $transport = KnowledgeSyncTransport::create();
        $outbox = new KnowledgeSyncOutboxRepository();
        $policies = new KnowledgeSyncPolicyStore();
        $stored_page_token = get_option(self::DRIFT_CURSOR_OPTION, null);
        $page_token = is_string($stored_page_token) && $stored_page_token !== ''
            ? $stored_page_token
            : null;
        $pages = 0;
        $checked = 0;
        $queued = 0;
        $orphaned = 0;
        do {
            $remote = $transport->verifyStatus($page_token, 100);
            $manifest = is_array($remote['manifest'] ?? null) ? $remote['manifest'] : array();
            foreach ((array) ($manifest['sources'] ?? array()) as $source) {
                if (!is_array($source)) {
                    continue;
                }
                $checked++;
                $parts = explode('#', (string) ($source['sourceKey'] ?? ''));
                if (count($parts) !== 3) {
                    continue;
                }
                [$blog_id, $post_type, $post_id] = $parts;
                if ((int) $blog_id !== get_current_blog_id() || !ctype_digit($post_id)) {
                    continue;
                }
                $post_type = sanitize_key($post_type);
                $policy = $policies->getForPostType($post_type);
                $post = get_post((int) $post_id);
                $is_orphaned_remote_source =
                    $policy === null ||
                    empty($policy['enabled']) ||
                    ($policy['reviewPolicy'] ?? 'disabled') === 'disabled' ||
                    !$post instanceof \WP_Post ||
                    $post->post_status !== 'publish' ||
                    $post->post_type !== $post_type;
                if ($is_orphaned_remote_source) {
                    if (($source['status'] ?? '') === 'tombstoned') {
                        continue;
                    }
                    $outbox->enqueue(
                        get_current_blog_id(),
                        $post_type,
                        (int) $post_id,
                        'delete',
                        wp_generate_uuid4()
                    );
                    $orphaned++;
                    $queued++;
                    continue;
                }
                if (!in_array(($source['status'] ?? ''), array('remote-missing', 'hash-mismatch'), true)) {
                    continue;
                }
                $manual_review = $policy['reviewPolicy'] === 'manual-kb-review';
                $url = get_permalink($post);
                $outbox->enqueue(
                    get_current_blog_id(),
                    $post_type,
                    (int) $post->ID,
                    'upsert',
                    wp_generate_uuid4(),
                    $manual_review ? 'blocked' : 'pending',
                    is_string($url) && !str_contains($url, '__trashed') ? $url : null,
                    $manual_review ? 'manual_review_required' : null
                );
                $queued++;
            }
            $page_token = isset($manifest['nextPageToken']) && is_string($manifest['nextPageToken'])
                ? $manifest['nextPageToken']
                : null;
            $pages++;
        } while ($page_token !== null && $page_token !== '' && $pages < 20);

        if ($page_token !== null && $page_token !== '') {
            update_option(self::DRIFT_CURSOR_OPTION, $page_token, false);
        } else {
            delete_option(self::DRIFT_CURSOR_OPTION);
        }

        (new KnowledgeSyncAuditRepository())->record('drift-reconciliation', 'completed', array(
            'pages' => $pages,
            'driftedSources' => $checked,
            'queuedRepairs' => $queued,
            'orphanRemoteSources' => $orphaned,
            'truncated' => $page_token !== null && $page_token !== '',
        ));
        return array(
            'operation' => 'drift-reconciliation',
            'status' => $page_token !== null && $page_token !== '' ? 'truncated' : 'complete',
            'pages' => $pages,
            'driftedSources' => $checked,
            'queuedRepairs' => $queued,
            'orphanRemoteSources' => $orphaned,
        );
    }

    /** @return array<string, mixed>|null */
    private function dispatchOutbox(int $batch_size): ?array
    {
        $dispatcher = new KnowledgeSyncBatchDispatcher();
        if (!$dispatcher->isAvailable()) {
            return null;
        }

        $lease_owner = wp_generate_uuid4();
        $outbox = new KnowledgeSyncOutboxRepository();
        $leases = $outbox->claimBatch($batch_size, 300, $lease_owner);
        if ($leases === array()) {
            return array('status' => 'outbox-idle', 'processed' => 0);
        }

        $builder = new KnowledgeSyncProjectionBuilder();
        $audit = new KnowledgeSyncAuditRepository();
        $deletion_summary = $outbox->deletionSafetySummary();
        $mass_delete =
            $deletion_summary['unreviewedDeletes'] >= self::MASS_DELETE_MINIMUM &&
            $deletion_summary['deletes'] / max(1, $deletion_summary['active']) >= self::MASS_DELETE_RATIO;
        if ($mass_delete) {
            $blocked_deletes = $outbox->blockUnreviewedMassDeletion($lease_owner);
            $safe_leases = array_values(array_filter(
                $leases,
                static fn(object $lease): bool =>
                    ($lease->leased_operation ?? null) !== 'delete' ||
                    (int) ($lease->reviewed_generation ?? 0) >= (int) ($lease->leased_generation ?? 0)
            ));
            $audit->record('mass-delete-guard', 'blocked', array(
                'activeDesiredStates' => $deletion_summary['active'],
                'deleteDesiredStates' => $deletion_summary['deletes'],
                'unreviewedDeletes' => $deletion_summary['unreviewedDeletes'],
                'blockedDeletes' => $blocked_deletes,
            ));
            $leases = $safe_leases;
            if ($leases === array()) {
                return array(
                    'status' => 'mass-delete-review-required',
                    'processed' => 0,
                    'blockedDeletes' => $blocked_deletes,
                );
            }
        }
        $projections = array();
        $fingerprints = array();
        $reviewed_delete_generations = array();
        $processed = 0;
        foreach ($leases as $lease) {
            try {
                $projection = $builder->build($lease);
                $encoded = wp_json_encode($projection, JSON_UNESCAPED_SLASHES);
                if (!is_string($encoded)) {
                    throw new KnowledgeSyncProjectionException('projection_encode_failed', 'Projection could not be encoded.');
                }
                $projections[(int) $lease->id] = $projection;
                $fingerprints[(int) $lease->id] = hash('sha256', $encoded);
                if (
                    ($lease->leased_operation ?? null) === 'delete' &&
                    (int) ($lease->reviewed_generation ?? 0) >= (int) ($lease->leased_generation ?? 0)
                ) {
                    $reviewed_delete_generations[(int) $lease->id] = (string) $lease->leased_source_version;
                }
            } catch (KnowledgeSyncProjectionException $error) {
                $permanent = in_array($error->error_code, array(
                    'invalid_lease_snapshot', 'site_not_connected', 'policy_scope_changed',
                    'invalid_public_url', 'taxonomy_read_failed',
                ), true);
                if ($permanent) {
                    $outbox->blockLease((int) $lease->id, $lease_owner, $error->error_code);
                } else {
                    $outbox->retryLease((int) $lease->id, $lease_owner, $error->error_code, random_int(0, 30));
                }
                $audit->record('projection-build', $permanent ? 'blocked' : 'retry', array(
                    'consumerId' => (string) $lease->consumer_id,
                    'postType' => (string) $lease->post_type,
                    'postId' => (int) $lease->post_id,
                    'correlationId' => (string) ($lease->leased_correlation_id ?? ''),
                    'errorCode' => $error->error_code,
                ));
                $processed++;
            }
        }

        if ($projections === array()) {
            return array('status' => 'projection-failed', 'processed' => $processed);
        }

        try {
            $responses = $dispatcher->dispatch($projections, $reviewed_delete_generations);
        } catch (\Throwable $error) {
            $error_code = $error instanceof KnowledgeSyncProjectionException
                ? $error->error_code
                : 'transport_exception';
            foreach ($projections as $outbox_id => $_projection) {
                $outbox->retryLease($outbox_id, $lease_owner, $error_code, random_int(0, 30));
            }
            return array(
                'status' => 'transport-retry',
                'processed' => $processed + count($projections),
                'errorCode' => $error_code,
            );
        }

        foreach ($responses as $outbox_id => $response) {
            $status = $response['status'];
            $error_code = $response['errorCode'] ?? 'transport_rejected';
            if ($status === 'accepted') {
                $outbox->completeLease($outbox_id, $lease_owner, $fingerprints[$outbox_id]);
            } elseif ($status === 'blocked') {
                $outbox->blockLease($outbox_id, $lease_owner, $error_code);
            } else {
                $outbox->retryLease($outbox_id, $lease_owner, $error_code, random_int(0, 30));
            }
            $processed++;
        }

        return array('status' => 'outbox-processed', 'processed' => $processed);
    }

    /** @return int[] */
    private function blogIdsInScope(): array
    {
        $current = get_current_blog_id();
        $settings = (new KnowledgeSyncSettingsStore())->get();
        if (!is_multisite() || !$settings['includeSubsites']) {
            return array($current);
        }

        $ids = array_map('intval', get_sites(array(
            'fields' => 'ids',
            'number' => 0,
            'deleted' => 0,
            'archived' => 0,
            'spam' => 0,
        )));
        if (!in_array($current, $ids, true)) {
            array_unshift($ids, $current);
        }
        return array_values(array_unique($ids));
    }

    private function hasEnabledPolicyInScope(): bool
    {
        $root_blog_id = get_current_blog_id();
        $settings = (new KnowledgeSyncSettingsStore())->get();
        $blog_ids = is_multisite() && $settings['includeSubsites']
            ? array_map('intval', get_sites(array('fields' => 'ids', 'number' => 0)))
            : array($root_blog_id);

        foreach ($blog_ids as $blog_id) {
            $switched = is_multisite() && $blog_id !== get_current_blog_id();
            if ($switched) {
                switch_to_blog($blog_id);
            }
            try {
                foreach ((new KnowledgeSyncPolicyStore())->getAll() as $policy) {
                    if (!empty($policy['enabled']) && $policy['reviewPolicy'] !== 'disabled') {
                        return true;
                    }
                }
                $counts = (new KnowledgeSyncOutboxRepository())->counts();
                if ($counts['pending'] > 0 || $counts['leased'] > 0 || $counts['retry_wait'] > 0) {
                    return true;
                }
            } finally {
                if ($switched) {
                    restore_current_blog();
                }
            }
        }
        return false;
    }
}
