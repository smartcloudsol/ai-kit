<?php
/**
 * Durable WordPress desired-state capture for automatic Knowledge Base sync.
 */

namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Match WordPress core's viewability rules, including the built-in `page`
 * type whose publicly_queryable flag is false even though public pages have
 * stable frontend permalinks.
 */
function knowledge_sync_post_type_is_viewable(mixed $post_type_object): bool
{
    if (!is_object($post_type_object)) {
        return false;
    }
    if (function_exists('is_post_type_viewable')) {
        return \is_post_type_viewable($post_type_object);
    }

    return !empty($post_type_object->publicly_queryable) ||
        (!empty($post_type_object->_builtin) && !empty($post_type_object->public));
}

final class KnowledgeSyncPolicyStore
{
    public const OPTION_NAME = 'smartcloud_ai_kit_kb_sync_policies';
    public const SCHEMA_VERSION = 1;

    /** @return array<string, mixed>|null */
    public function getForPostType(string $post_type): ?array
    {
        $policies = get_option(self::OPTION_NAME, array());
        if (!is_array($policies) || !isset($policies[$post_type]) || !is_array($policies[$post_type])) {
            return null;
        }

        return $this->normalizePolicy($post_type, $policies[$post_type]);
    }

    /** @param array<string, mixed> $policy */
    public function saveForPostType(string $post_type, array $policy): array
    {
        $normalized = $this->normalizePolicy($post_type, $policy);
        $policies = get_option(self::OPTION_NAME, array());
        if (!is_array($policies)) {
            $policies = array();
        }
        $previous = isset($policies[$post_type]) && is_array($policies[$post_type])
            ? $this->normalizePolicy($post_type, $policies[$post_type])
            : null;
        $policies[$post_type] = $normalized;
        update_option(self::OPTION_NAME, $policies, false);
        do_action('smartcloud_ai_kit_knowledge_sync_policy_changed', $post_type, $normalized, $previous);

        return $normalized;
    }

    /** @return array<string, array<string, mixed>> */
    public function getAll(): array
    {
        $stored = get_option(self::OPTION_NAME, array());
        if (!is_array($stored)) {
            return array();
        }

        $policies = array();
        foreach ($stored as $post_type => $policy) {
            if (!is_string($post_type) || !is_array($policy)) {
                continue;
            }
            try {
                $normalized = $this->normalizePolicy($post_type, $policy);
            } catch (\InvalidArgumentException) {
                continue;
            }
            $policies[$normalized['postType']] = $normalized;
        }
        ksort($policies, SORT_STRING);

        return $policies;
    }

    /** @param array<string, mixed> $policy */
    public function fingerprint(array $policy): string
    {
        $normalized = $this->normalizePolicy((string) ($policy['postType'] ?? ''), $policy);
        return hash('sha256', (string) wp_json_encode($normalized, JSON_UNESCAPED_SLASHES));
    }

    /** @param array<string, mixed> $policy
     *  @return array<string, mixed>
     */
    private function normalizePolicy(string $post_type, array $policy): array
    {
        $post_type = sanitize_key($post_type);
        if ($post_type === '') {
            throw new \InvalidArgumentException('Knowledge-sync post type is required.');
        }

        $allowed_fields = array(
            'schemaVersion', 'postType', 'enabled', 'autoEnableSource',
            'reviewPolicy', 'onPublish', 'onPublishedUpdate', 'onUnpublish',
            'metadataRefresh', 'includeTaxonomies', 'documentProfile',
        );
        foreach (array_keys($policy) as $field) {
            if (!is_string($field) || !in_array($field, $allowed_fields, true)) {
                throw new \InvalidArgumentException('Unsupported knowledge-sync policy field.');
            }
        }
        if (isset($policy['schemaVersion']) && (int) $policy['schemaVersion'] !== self::SCHEMA_VERSION) {
            throw new \InvalidArgumentException('Unsupported knowledge-sync policy schema version.');
        }
        if (isset($policy['postType']) && sanitize_key((string) $policy['postType']) !== $post_type) {
            throw new \InvalidArgumentException('Knowledge-sync policy post type does not match its scope.');
        }
        $fixed_actions = array(
            'onPublish' => 'upsert',
            'onPublishedUpdate' => 'upsert',
            'onUnpublish' => 'delete',
            'metadataRefresh' => 'reconcile',
        );
        foreach ($fixed_actions as $field => $expected) {
            if (isset($policy[$field]) && $policy[$field] !== $expected) {
                throw new \InvalidArgumentException('Unsupported knowledge-sync policy action.');
            }
        }

        $review_policy = (string) ($policy['reviewPolicy'] ?? 'disabled');
        if (!in_array($review_policy, array('wordpress-publish-is-approval', 'manual-kb-review', 'disabled'), true)) {
            throw new \InvalidArgumentException('Unsupported knowledge-sync review policy.');
        }

        $auto_enable_source = (string) ($policy['autoEnableSource'] ?? 'administrator');
        if (!in_array($auto_enable_source, array('administrator', 'migration', 'system'), true)) {
            throw new \InvalidArgumentException('Unsupported knowledge-sync auto-enable source.');
        }

        $taxonomies = array();
        foreach ((array) ($policy['includeTaxonomies'] ?? array()) as $taxonomy) {
            $taxonomy = sanitize_key((string) $taxonomy);
            if ($taxonomy !== '') {
                $taxonomies[$taxonomy] = true;
            }
        }
        $taxonomies = array_keys($taxonomies);
        sort($taxonomies, SORT_STRING);

        $profile = sanitize_key((string) ($policy['documentProfile'] ?? 'default'));

        return array(
            'schemaVersion' => self::SCHEMA_VERSION,
            'postType' => $post_type,
            'enabled' => !empty($policy['enabled']),
            'autoEnableSource' => $auto_enable_source,
            'reviewPolicy' => $review_policy,
            'onPublish' => 'upsert',
            'onPublishedUpdate' => 'upsert',
            'onUnpublish' => 'delete',
            'metadataRefresh' => 'reconcile',
            'includeTaxonomies' => $taxonomies,
            'documentProfile' => $profile !== '' ? $profile : 'default',
        );
    }
}

/**
 * Optional bridge to the versioned Static Publisher release contract.
 *
 * Static Publisher remains an optional peer plugin. All integration happens
 * through public WordPress hooks, so loading AI Kit never requires one of its
 * classes or tables to exist.
 */
final class KnowledgeSyncPublicReleaseGate
{
    public const MODE_DISABLED = 'disabled';
    public const MODE_STATIC_PUBLISHER = 'static-publisher';
    public const PROVIDER_STATE_FILTER = 'smartcloud_static_publisher_release_gate_state_v1';
    public const RELEASE_ACTION = 'smartcloud_static_publisher_public_release_v1';
    private const SELECTION_OPTION = 'smartcloud_ai_kit_kb_sync_publisher_consumer';

    public static function mode(): string
    {
        $stored = get_option('smartcloud_ai_kit_kb_sync_settings', array());
        $mode = is_array($stored) && is_string($stored['publicReleaseGate'] ?? null)
            ? $stored['publicReleaseGate']
            : self::MODE_DISABLED;
        return $mode === self::MODE_STATIC_PUBLISHER ? $mode : self::MODE_DISABLED;
    }

    public static function enabled(): bool
    {
        return self::mode() === self::MODE_STATIC_PUBLISHER;
    }

    public static function selectedConsumerId(): string
    {
        $consumer_id = get_option(self::SELECTION_OPTION, '');
        return is_string($consumer_id) && preg_match('/^[A-Za-z0-9._:-]+$/', $consumer_id) === 1
            ? $consumer_id
            : '';
    }

    public static function selectConsumer(string $consumer_id): bool
    {
        $consumer_id = trim($consumer_id);
        if ($consumer_id === '' || preg_match('/^[A-Za-z0-9._:-]+$/', $consumer_id) !== 1) {
            return false;
        }
        return update_option(self::SELECTION_OPTION, $consumer_id, false);
    }

    public static function clearSelection(): void
    {
        delete_option(self::SELECTION_OPTION);
    }

    /**
     * Resolve the journal event that Static Publisher recorded earlier in the
     * same WordPress hook. Null deliberately means fail closed when the gate is
     * enabled; it never falls back to an AI Kit-local source counter.
     */
    public static function desiredSequence(int $blog_id, string $post_type, int $post_id): ?int
    {
        return self::desiredPosition($blog_id, $post_type, $post_id)['sequence'] ?? null;
    }

    /** @return array{consumerId:string,sequence:int}|null */
    public static function desiredPosition(int $blog_id, string $post_type, int $post_id): ?array
    {
        if (!self::enabled()) {
            return null;
        }
        $state = apply_filters(self::PROVIDER_STATE_FILTER, null, array(
            'contractVersion' => 1,
            'blogId' => $blog_id,
            'postType' => sanitize_key($post_type),
            'postId' => $post_id,
        ));
        if (!is_array($state) || (int) ($state['contractVersion'] ?? 0) !== 1 || empty($state['available'])) {
            return null;
        }
        $sequence = $state['lastPostEventSequence'] ?? null;
        $configured_consumers = self::configuredConsumerIds($state);
        if ($configured_consumers === null) {
            return null;
        }
        $consumers = array();
        foreach ((array) ($state['verifiedReleases'] ?? array()) as $release) {
            if (
                !is_array($release) ||
                !self::releaseCoversBlog($release, $blog_id) ||
                !is_string($release['consumerId'] ?? null)
            ) {
                continue;
            }
            $consumer_id = trim($release['consumerId']);
            if ($consumer_id !== '' && in_array($consumer_id, $configured_consumers, true)) {
                $consumers[$consumer_id] = true;
            }
        }
        $selected_consumer_id = self::selectedConsumerId();
        $cursor = (new KnowledgeSyncReleaseCursorRepository())->verifiedCursor($blog_id, $post_type);
        $consumer_id = $selected_consumer_id !== '' && isset($consumers[$selected_consumer_id])
            ? $selected_consumer_id
            : ($selected_consumer_id === '' && $cursor && isset($consumers[(string) $cursor->consumer_id])
                ? (string) $cursor->consumer_id
                : ($selected_consumer_id === '' && count($consumers) === 1
                    ? (string) array_key_first($consumers)
                    : ''));
        if (!is_numeric($sequence) || (int) $sequence <= 0 || $consumer_id === '') {
            return null;
        }
        return array(
            'consumerId' => $consumer_id,
            'sequence' => (int) $sequence,
        );
    }

    /**
     * Decide whether a published post belongs to the verified public snapshot.
     * Null means that the provider could not prove eligibility, so callers must
     * pause instead of advancing their baseline cursor.
     */
    public static function postCoveredByCursor(
        int $blog_id,
        string $post_type,
        int $post_id,
        object $cursor
    ): ?bool {
        if (!self::enabled()) {
            return true;
        }
        $consumer_id = is_string($cursor->consumer_id ?? null) ? trim($cursor->consumer_id) : '';
        $baseline_id = is_string($cursor->baseline_id ?? null) ? trim($cursor->baseline_id) : '';
        $scope_fingerprint = is_string($cursor->scope_fingerprint ?? null)
            ? trim($cursor->scope_fingerprint)
            : '';
        $verified_sequence = $cursor->verified_sequence ?? null;
        if (
            $consumer_id === '' ||
            $baseline_id === '' ||
            $scope_fingerprint === '' ||
            !is_numeric($verified_sequence)
        ) {
            return null;
        }

        $post_type = sanitize_key($post_type);
        $state = self::providerState(array(
            'consumerId' => $consumer_id,
            'blogId' => $blog_id,
            'postType' => $post_type,
            'postId' => $post_id,
        ));
        if ($state === null) {
            return null;
        }
        $configured_consumers = self::configuredConsumerIds($state);
        if ($configured_consumers === null || !in_array($consumer_id, $configured_consumers, true)) {
            return null;
        }

        $release_verified = false;
        foreach ((array) ($state['verifiedReleases'] ?? array()) as $release) {
            if (
                !is_array($release) ||
                ($release['consumerId'] ?? '') !== $consumer_id ||
                !self::releaseCoversBlog($release, $blog_id) ||
                ($release['baselineId'] ?? '') !== $baseline_id ||
                ($release['scopeFingerprint'] ?? '') !== $scope_fingerprint ||
                !is_numeric($release['committedSequence'] ?? null) ||
                (int) $release['committedSequence'] < (int) $verified_sequence
            ) {
                continue;
            }
            $covered_post_types = array_values(array_unique(array_filter(array_map(
                static fn(mixed $value): string => sanitize_key((string) $value),
                is_array($release['postTypes'] ?? null) ? $release['postTypes'] : array()
            ))));
            if (in_array($post_type, $covered_post_types, true)) {
                $release_verified = true;
                break;
            }
        }
        $post_sequence = $state['lastPostEventSequence'] ?? null;
        if (!$release_verified || !is_numeric($post_sequence) || (int) $post_sequence < 0) {
            return null;
        }

        // Zero means the post predates the retained journal. The verified full
        // baseline is authoritative for it; later events always have a sequence.
        return (int) $post_sequence === 0 || (int) $post_sequence <= (int) $verified_sequence;
    }

    /** @param array<string, mixed> $query
     *  @return array<string, mixed>|null
     */
    public static function providerState(array $query = array()): ?array
    {
        $state = apply_filters(self::PROVIDER_STATE_FILTER, null, array_merge(
            array('contractVersion' => 1),
            $query
        ));
        return is_array($state) &&
            (int) ($state['contractVersion'] ?? 0) === 1 &&
            ($state['provider'] ?? '') === 'smartcloud-static-publisher' &&
            !empty($state['available'])
                ? $state
                : null;
    }

    /**
     * Refresh AI Kit's durable cursor cache from the provider's authoritative
     * state. An unavailable or unconfigured result makes the runtime fail
     * closed for this blog.
     *
     * @param string[] $post_types
     */
    public static function refresh(int $blog_id, array $post_types): array
    {
        $cursors = new KnowledgeSyncReleaseCursorRepository();
        $post_types = array_values(array_filter(array_unique(array_map('sanitize_key', $post_types))));
        if ($post_types === array()) {
            return array(
                'available' => self::providerState(array('blogId' => $blog_id)) !== null,
                'configured' => false,
                'reason' => 'no-enabled-policies',
            );
        }
        $existing_coverage = array();
        foreach ($cursors->listAll() as $cursor) {
            $cursor_blog_id = (int) ($cursor->blog_id ?? 0);
            $cursor_post_type = sanitize_key((string) ($cursor->post_type ?? ''));
            $cursor_consumer_id = (string) ($cursor->consumer_id ?? '');
            if ($cursor_blog_id === $blog_id && in_array($cursor_post_type, $post_types, true)) {
                $existing_coverage[$cursor_consumer_id][$cursor_post_type] = true;
            }
        }
        $selected = array_keys(array_filter(
            $existing_coverage,
            static fn(array $coverage): bool => array_diff($post_types, array_keys($coverage)) === array()
        ));
        $persisted_selection = self::selectedConsumerId();
        if ($persisted_selection !== '') {
            $selected = array($persisted_selection);
        } elseif (count($selected) === 1 && $selected[0] !== '') {
            self::selectConsumer($selected[0]);
        }
        $query = array('blogId' => $blog_id);
        if (count($selected) === 1 && $selected[0] !== '') {
            $query['consumerId'] = $selected[0];
        }
        $state = self::providerState($query);
        if ($state === null) {
            return array('available' => false, 'configured' => false, 'reason' => 'provider-unavailable');
        }
        $configured_consumers = self::configuredConsumerIds($state);
        if ($configured_consumers === null) {
            return array('available' => true, 'configured' => false, 'reason' => 'provider-release-contract-incomplete');
        }
        if (
            count($selected) === 1 &&
            $selected[0] !== '' &&
            !in_array($selected[0], $configured_consumers, true)
        ) {
            foreach ($post_types as $post_type) {
                $cursors->clearScope($blog_id, $post_type);
            }
            return array('available' => true, 'configured' => false, 'reason' => 'selected-consumer-no-longer-configured');
        }
        if ($configured_consumers === array()) {
            foreach ($post_types as $post_type) {
                $cursors->clearScope($blog_id, $post_type);
            }
            return array('available' => true, 'configured' => false, 'reason' => 'content-sync-consumer-not-configured');
        }
        $candidates = array();
        foreach ((array) ($state['verifiedReleases'] ?? array()) as $receipt) {
            if (
                !is_array($receipt) ||
                !self::releaseCoversBlog($receipt, $blog_id) ||
                !is_string($receipt['consumerId'] ?? null)
            ) {
                continue;
            }
            $covered = array_values(array_unique(array_map(
                static fn(mixed $value): string => sanitize_key((string) $value),
                is_array($receipt['postTypes'] ?? null) ? $receipt['postTypes'] : array()
            )));
            if (array_diff($post_types, $covered) !== array()) {
                continue;
            }
            $consumer_id = trim($receipt['consumerId']);
            if ($consumer_id !== '' && in_array($consumer_id, $configured_consumers, true)) {
                $candidates[$consumer_id][] = $receipt;
            }
        }
        foreach ($post_types as $post_type) {
            $cursors->clearScope($blog_id, $post_type);
        }
        if (count($candidates) !== 1) {
            return array(
                'available' => true,
                'configured' => false,
                'reason' => count($candidates) === 0
                    ? 'verified-release-required'
                    : 'ambiguous-content-sync-consumer',
            );
        }
        $consumer_id = (string) array_key_first($candidates);
        self::selectConsumer($consumer_id);
        $receipts = $candidates[$consumer_id];
        usort($receipts, static fn(array $left, array $right): int =>
            (int) ($right['committedSequence'] ?? -1) <=> (int) ($left['committedSequence'] ?? -1));
        $receipt = $receipts[0];
        $receipt['contractVersion'] = 1;
        $receipt['postTypes'] = $post_types;
        if (!$cursors->acknowledge($receipt, $blog_id)) {
            return array('available' => true, 'configured' => false, 'reason' => 'cursor-write-failed');
        }
        return array(
            'available' => true,
            'configured' => true,
            'reason' => null,
            'consumerId' => $consumer_id,
        );
    }

    /** @param string[] $post_types
     *  @return array<string, mixed>
     */
    public static function status(array $post_types): array
    {
        $mode = self::mode();
        $blog_id = get_current_blog_id();
        $post_types = array_values(array_filter(array_unique(array_map('sanitize_key', $post_types))));
        $state = self::providerState(array('blogId' => $blog_id));
        $matching_consumers = array();
        if ($state !== null) {
            $configured_consumer_ids = self::configuredConsumerIds($state) ?? array();
            foreach ((array) ($state['verifiedReleases'] ?? array()) as $release) {
                if (
                    !is_array($release) ||
                    !self::releaseCoversBlog($release, $blog_id) ||
                    !is_string($release['consumerId'] ?? null)
                ) {
                    continue;
                }
                $covered = array_values(array_unique(array_map(
                    static fn(mixed $value): string => sanitize_key((string) $value),
                    is_array($release['postTypes'] ?? null) ? $release['postTypes'] : array()
                )));
                if (array_diff($post_types, $covered) === array()) {
                    $consumer_id = trim($release['consumerId']);
                    if (in_array($consumer_id, $configured_consumer_ids, true)) {
                        $matching_consumers[$consumer_id] = true;
                    }
                }
            }
        }
        unset($matching_consumers['']);
        $gate = $mode === self::MODE_STATIC_PUBLISHER
            ? self::refresh($blog_id, $post_types)
            : array(
                'available' => $state !== null,
                'configured' => count($matching_consumers) === 1,
                'reason' => null,
            );
        $configured = !empty($gate['configured']);
        $reason = isset($gate['reason']) && is_string($gate['reason']) ? $gate['reason'] : null;

        $grouped = array();
        foreach ((new KnowledgeSyncReleaseCursorRepository())->listAll() as $cursor) {
            if ((int) ($cursor->blog_id ?? 0) !== $blog_id) {
                continue;
            }
            $key = implode('|', array(
                (string) ($cursor->consumer_id ?? ''),
                (string) ($cursor->baseline_id ?? ''),
                (string) ($cursor->verified_sequence ?? '0'),
                (string) ($cursor->acknowledged_gmt ?? ''),
            ));
            if (!isset($grouped[$key])) {
                $grouped[$key] = array(
                    'consumerId' => (string) ($cursor->consumer_id ?? ''),
                    'baselineId' => (string) ($cursor->baseline_id ?? ''),
                    'committedSequence' => (int) ($cursor->verified_sequence ?? 0),
                    'acknowledgedGmt' => is_string($cursor->acknowledged_gmt ?? null) && $cursor->acknowledged_gmt !== ''
                        ? $cursor->acknowledged_gmt
                        : null,
                    'postTypes' => array(),
                );
            }
            $grouped[$key]['postTypes'][] = sanitize_key((string) ($cursor->post_type ?? ''));
        }
        foreach ($grouped as &$cursor) {
            $cursor['postTypes'] = array_values(array_filter(array_unique($cursor['postTypes'])));
            sort($cursor['postTypes'], SORT_STRING);
        }
        unset($cursor);

        return array(
            'mode' => $mode,
            'providerAvailable' => !empty($gate['available']),
            'configured' => $configured,
            'reason' => $reason,
            'waitingCount' => $mode === self::MODE_STATIC_PUBLISHER
                ? (new KnowledgeSyncOutboxRepository())->releaseGateWaitingCount()
                : 0,
            'cursors' => array_values($grouped),
        );
    }

    /** @param array<string, mixed> $release */
    public static function releaseCoversBlog(array $release, int $blog_id): bool
    {
        $root_blog_id = absint($release['rootBlogId'] ?? 0);
        return $root_blog_id === $blog_id || ($root_blog_id > 0 && !empty($release['includeSubsites']));
    }

    /** @param array<string, mixed> $state
     *  @return string[]|null
     */
    private static function configuredConsumerIds(array $state): ?array
    {
        if (!is_array($state['configuredConsumerIds'] ?? null)) {
            return null;
        }
        $ids = array_values(array_unique(array_filter(array_map(
            static fn(mixed $value): string => is_string($value) ? trim($value) : '',
            $state['configuredConsumerIds']
        ))));
        return array_values(array_filter(
            $ids,
            static fn(string $value): bool => preg_match('/^[A-Za-z0-9._:-]+$/', $value) === 1
        ));
    }
}

final class KnowledgeSyncReleaseCursorRepository
{
    private function tableName(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'smartcloud_ai_kit_kb_sync_release_cursors';
    }

    /** @param array<string, mixed> $receipt */
    public function acknowledge(array $receipt, ?int $blog_id = null): bool
    {
        global $wpdb;
        if ((int) ($receipt['contractVersion'] ?? 0) !== 1) {
            return false;
        }
        $consumer_id = $this->safeIdentifier($receipt['consumerId'] ?? '', 190);
        $scope_fingerprint = $this->safeIdentifier($receipt['scopeFingerprint'] ?? '', 128);
        $baseline_id = $this->safeIdentifier($receipt['baselineId'] ?? '', 64);
        $sequence = $receipt['committedSequence'] ?? null;
        $post_types = array_values(array_unique(array_filter(array_map(
            static fn(mixed $post_type): string => sanitize_key((string) $post_type),
            is_array($receipt['postTypes'] ?? null) ? $receipt['postTypes'] : array()
        ))));
        if (
            $consumer_id === '' || $scope_fingerprint === '' || $baseline_id === '' ||
            !is_numeric($sequence) || (int) $sequence < 0 || $post_types === array()
        ) {
            return false;
        }

        $blog_id = $blog_id ?? get_current_blog_id();
        $acknowledged = $this->mysqlTime($receipt['acknowledgedGmt'] ?? null);
        $now = current_time('mysql', true);
        $success = true;
        foreach ($post_types as $post_type) {
            $sql = $wpdb->prepare(
                "INSERT INTO %i
                    (blog_id, post_type, consumer_id, scope_fingerprint,
                     baseline_id, verified_sequence, acknowledged_gmt, updated_gmt)
                 VALUES (%d, %s, %s, %s, %s, %d, %s, %s)
                 ON DUPLICATE KEY UPDATE
                     verified_sequence = IF(
                         consumer_id = VALUES(consumer_id) AND baseline_id = VALUES(baseline_id),
                         GREATEST(verified_sequence, VALUES(verified_sequence)),
                         VALUES(verified_sequence)
                     ),
                     consumer_id = VALUES(consumer_id),
                     scope_fingerprint = VALUES(scope_fingerprint),
                     baseline_id = VALUES(baseline_id),
                     acknowledged_gmt = VALUES(acknowledged_gmt),
                     updated_gmt = VALUES(updated_gmt)",
                $this->tableName(),
                $blog_id,
                $post_type,
                $consumer_id,
                $scope_fingerprint,
                $baseline_id,
                (int) $sequence,
                $acknowledged,
                $now
            );
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Durable verified release cursor cache.
            $success = $wpdb->query($sql) !== false && $success;
        }
        return $success;
    }

    public function verifiedCursor(int $blog_id, string $post_type): ?object
    {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Exact release scope lookup.
        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM %i WHERE blog_id = %d AND post_type = %s ORDER BY verified_sequence DESC LIMIT 1',
            $this->tableName(),
            $blog_id,
            sanitize_key($post_type)
        ));
        return is_object($row) ? $row : null;
    }

    public function clearScope(int $blog_id, string $post_type): void
    {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Replace one provider-owned eligibility scope from authoritative state.
        $wpdb->query($wpdb->prepare(
            'DELETE FROM %i WHERE blog_id = %d AND post_type = %s',
            $this->tableName(),
            $blog_id,
            sanitize_key($post_type)
        ));
    }

    /** @return object[] */
    public function listAll(): array
    {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Operational release cursor summary.
        return (array) $wpdb->get_results($wpdb->prepare(
            'SELECT * FROM %i ORDER BY blog_id ASC, post_type ASC',
            $this->tableName()
        ));
    }

    private function safeIdentifier(mixed $value, int $max_length): string
    {
        if (!is_string($value)) {
            return '';
        }
        $value = trim($value);
        if ($value === '' || preg_match('/^[A-Za-z0-9._:-]+$/', $value) !== 1) {
            return '';
        }
        return substr($value, 0, $max_length);
    }

    private function mysqlTime(mixed $value): string
    {
        if (is_string($value) && $value !== '') {
            $timestamp = strtotime($value);
            if ($timestamp !== false) {
                return gmdate('Y-m-d H:i:s', $timestamp);
            }
        }
        return current_time('mysql', true);
    }
}

final class KnowledgeSyncOutboxRepository
{
    /**
     * Resolve the table lazily so a repository created on the main site keeps
     * following $wpdb after switch_to_blog() changes the active table prefix.
     */
    private function tableName(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'smartcloud_ai_kit_kb_sync_outbox';
    }

    public function enqueue(
        int $blog_id,
        string $post_type,
        int $post_id,
        string $operation,
        string $correlation_id,
        string $state = 'pending',
        ?string $last_public_url = null,
        ?string $last_error_code = null,
        bool $publisher_gate_required = false,
        ?string $desired_publisher_consumer_id = null,
        ?int $desired_publisher_sequence = null
    ): bool {
        global $wpdb;

        if (!in_array($operation, array('upsert', 'delete'), true)) {
            throw new \InvalidArgumentException('Unsupported knowledge-sync operation.');
        }
        if (!in_array($state, array('pending', 'blocked'), true)) {
            throw new \InvalidArgumentException('Unsupported initial knowledge-sync state.');
        }

        $consumer_id = 'wordpress-blog-' . $blog_id;
        $now = current_time('mysql', true);
        $sql = $wpdb->prepare(
            "INSERT INTO %i
                (consumer_id, blog_id, post_type, post_id, desired_operation,
                 desired_generation, leased_generation, source_sequence,
                 source_version, payload_fingerprint, state, attempt_count,
                 next_attempt_gmt, lease_expires_gmt, last_public_url,
                 correlation_id, last_error_code, publisher_gate_required,
                 desired_publisher_consumer_id, desired_publisher_sequence,
                 created_gmt, updated_gmt)
             VALUES (%s, %d, %s, %d, %s, 1, NULL, 1, '1', NULL, %s, 0,
                     NULL, NULL, NULLIF(%s, ''), %s, NULLIF(%s, ''), %d,
                     NULLIF(%s, ''), NULLIF(%s, ''), %s, %s)
             ON DUPLICATE KEY UPDATE
                 desired_operation = VALUES(desired_operation),
                 source_version = CAST(source_sequence + 1 AS CHAR),
                 source_sequence = source_sequence + 1,
                 desired_generation = desired_generation + 1,
                 state = IF(state = 'leased', 'leased', VALUES(state)),
                 attempt_count = IF(state = 'leased', attempt_count, 0),
                 next_attempt_gmt = IF(state = 'leased', next_attempt_gmt, NULL),
                 last_public_url = COALESCE(VALUES(last_public_url), last_public_url),
                 correlation_id = VALUES(correlation_id),
                 last_error_code = IF(state = 'leased', last_error_code, VALUES(last_error_code)),
                 publisher_gate_required = IF(
                     state = 'complete', VALUES(publisher_gate_required),
                     GREATEST(publisher_gate_required, VALUES(publisher_gate_required))
                 ),
                 desired_publisher_sequence = IF(
                     VALUES(publisher_gate_required) = 1,
                     VALUES(desired_publisher_sequence),
                     IF(state = 'complete', NULL, desired_publisher_sequence)
                 ),
                 desired_publisher_consumer_id = IF(
                     VALUES(publisher_gate_required) = 1,
                     VALUES(desired_publisher_consumer_id),
                     IF(state = 'complete', NULL, desired_publisher_consumer_id)
                 ),
                 updated_gmt = VALUES(updated_gmt)",
            $this->tableName(),
            $consumer_id,
            $blog_id,
            $post_type,
            $post_id,
            $operation,
            $state,
            $last_public_url,
            $correlation_id,
            $last_error_code,
            $publisher_gate_required ? 1 : 0,
            $desired_publisher_consumer_id ?? '',
            $desired_publisher_sequence === null ? '' : (string) max(0, $desired_publisher_sequence),
            $now,
            $now
        );

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.NotPrepared -- Atomic desired-state coalescing query prepared above.
        return $wpdb->query($sql) !== false;
    }

    /**
     * Claim a bounded batch. The site-level runner lock is the primary
     * serialization boundary; the conditional update also prevents a stale
     * selector from stealing a live lease.
     *
     * @return object[]
     */
    public function claimBatch(
        int $limit,
        int $lease_seconds,
        string $lease_owner,
        ?int $blog_id = null,
        ?string $post_type = null,
        bool $public_release_gate = false
    ): array
    {
        global $wpdb;

        $limit = max(1, min(100, $limit));
        $lease_seconds = max(30, min(900, $lease_seconds));
        $now = current_time('mysql', true);
        $expires = gmdate('Y-m-d H:i:s', time() + $lease_seconds);

        $scope_sql = '';
        $scope_args = array();
        if ($blog_id !== null) {
            $scope_sql .= ' AND o.blog_id = %d';
            $scope_args[] = $blog_id;
        }
        if ($post_type !== null) {
            $scope_sql .= ' AND o.post_type = %s';
            $scope_args[] = sanitize_key($post_type);
        }

        $gate_sql = $public_release_gate
            ? " AND (o.publisher_gate_required = 0 OR (
                    o.desired_publisher_consumer_id IS NOT NULL AND
                    o.desired_publisher_sequence IS NOT NULL AND EXISTS (
                        SELECT 1 FROM {$this->releaseCursorTableName()} AS rc
                        WHERE rc.blog_id = o.blog_id AND rc.post_type = o.post_type
                          AND rc.consumer_id = o.desired_publisher_consumer_id
                          AND rc.verified_sequence >= o.desired_publisher_sequence
                    )
                ))"
            : '';
        $update_gate_sql = $gate_sql;
        $select = "SELECT o.id FROM %i AS o
             WHERE ((o.state IN ('pending', 'retry_wait') AND (o.next_attempt_gmt IS NULL OR o.next_attempt_gmt <= %s))
                    OR (o.state = 'leased' AND o.lease_expires_gmt <= %s))
             {$scope_sql}
             {$gate_sql}
             ORDER BY o.updated_gmt ASC, o.id ASC
             LIMIT %d";
        $select_args = array_merge(
            array($this->tableName(), $now, $now),
            $scope_args,
            array($limit)
        );

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Durable queue claim.
        $ids = array_map('intval', $wpdb->get_col($wpdb->prepare($select, ...$select_args)));
        if ($ids === array()) {
            return array();
        }

        $id_placeholders = implode(', ', array_fill(0, count($ids), '%d'));
        $update = "UPDATE %i AS o
                   SET attempt_count = IF(state = 'leased', attempt_count + 1, attempt_count),
                       last_error_code = IF(state = 'leased', 'lease_expired', last_error_code),
                       state = 'leased', leased_generation = desired_generation,
                       leased_operation = desired_operation,
                       leased_source_version = source_version,
                       leased_publisher_consumer_id = desired_publisher_consumer_id,
                       leased_publisher_sequence = desired_publisher_sequence,
                       leased_correlation_id = correlation_id,
                       lease_owner = %s, lease_expires_gmt = %s, updated_gmt = %s
                   WHERE o.id IN ({$id_placeholders})
                     AND ((o.state IN ('pending', 'retry_wait') AND (o.next_attempt_gmt IS NULL OR o.next_attempt_gmt <= %s))
                          OR (o.state = 'leased' AND o.lease_expires_gmt <= %s))
                     {$update_gate_sql}";
        $update_args = array_merge(
            array($this->tableName(), $lease_owner, $expires, $now),
            $ids,
            array($now, $now)
        );
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.NotPrepared -- Dynamic ID placeholders are prepared below.
        $wpdb->query($wpdb->prepare($update, ...$update_args));

        $read_back = "SELECT * FROM %i
                      WHERE lease_owner = %s AND id IN ({$id_placeholders})
                      ORDER BY updated_gmt ASC, id ASC";
        $read_back_args = array_merge(array($this->tableName(), $lease_owner), $ids);

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.NotPrepared -- Read back only IDs selected and won by this lease attempt.
        return (array) $wpdb->get_results($wpdb->prepare($read_back, ...$read_back_args));
    }

    public function completeLease(int $id, string $lease_owner, string $payload_fingerprint): bool
    {
        global $wpdb;
        $now = current_time('mysql', true);
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Conditional lease completion.
        return $wpdb->query($wpdb->prepare(
            "UPDATE %i
             SET payload_fingerprint = IF(desired_generation = leased_generation, %s, payload_fingerprint),
                 state = IF(desired_generation = leased_generation, 'complete', 'pending'),
                 attempt_count = IF(desired_generation = leased_generation, 0, attempt_count),
                 next_attempt_gmt = NULL, lease_expires_gmt = NULL,
                 lease_owner = NULL, leased_generation = NULL, leased_operation = NULL,
                 leased_source_version = NULL, leased_correlation_id = NULL,
                 leased_publisher_consumer_id = NULL,
                 leased_publisher_sequence = NULL,
                 last_error_code = NULL, updated_gmt = %s
             WHERE id = %d AND state = 'leased' AND lease_owner = %s",
            $this->tableName(),
            $payload_fingerprint,
            $now,
            $id,
            $lease_owner
        )) === 1;
    }

    public function leaseIsCurrentAndEligible(int $id, string $lease_owner, bool $public_release_gate): bool
    {
        global $wpdb;
        $gate_sql = $public_release_gate
            ? " AND (o.publisher_gate_required = 0 OR (
                    o.desired_publisher_consumer_id IS NOT NULL
                    AND o.desired_publisher_sequence IS NOT NULL
                    AND o.desired_publisher_consumer_id = o.leased_publisher_consumer_id
                    AND o.desired_publisher_sequence = o.leased_publisher_sequence
                    AND EXISTS (
                        SELECT 1 FROM {$this->releaseCursorTableName()} AS rc
                        WHERE rc.blog_id = o.blog_id AND rc.post_type = o.post_type
                          AND rc.consumer_id = o.leased_publisher_consumer_id
                          AND rc.verified_sequence >= o.leased_publisher_sequence
                    )
                ))"
            : '';
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Last-moment generation and release eligibility check for an owned lease.
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM %i AS o
             WHERE o.id = %d AND o.state = 'leased' AND o.lease_owner = %s
               AND o.desired_generation = o.leased_generation{$gate_sql}",
            $this->tableName(),
            $id,
            $lease_owner
        )) === 1;
    }

    public function retryLease(int $id, string $lease_owner, string $error_code, int $jitter_seconds = 0): bool
    {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Inspect owned lease before transition.
        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT desired_generation, leased_generation, attempt_count FROM %i WHERE id = %d AND state = \'leased\' AND lease_owner = %s',
            $this->tableName(),
            $id,
            $lease_owner
        ));
        if (!$row) {
            return false;
        }

        $has_trailing = (int) $row->desired_generation > (int) $row->leased_generation;
        $attempt = (int) $row->attempt_count + 1;
        $next_attempt = $has_trailing
            ? null
            : gmdate('Y-m-d H:i:s', time() + KnowledgeSyncRetryPolicy::delaySeconds($attempt, $jitter_seconds));
        $now = current_time('mysql', true);

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Conditional lease retry transition.
        return $wpdb->query($wpdb->prepare(
            "UPDATE %i
             SET state = %s, attempt_count = %d, next_attempt_gmt = NULLIF(%s, ''),
                 lease_expires_gmt = NULL, lease_owner = NULL, leased_generation = NULL,
                 leased_operation = NULL, leased_source_version = NULL,
                 leased_publisher_consumer_id = NULL,
                 leased_publisher_sequence = NULL,
                 leased_correlation_id = NULL,
                 last_error_code = %s, updated_gmt = %s
             WHERE id = %d AND state = 'leased' AND lease_owner = %s",
            $this->tableName(),
            $has_trailing ? 'pending' : 'retry_wait',
            $has_trailing ? 0 : $attempt,
            $next_attempt ?? '',
            sanitize_key($error_code),
            $now,
            $id,
            $lease_owner
        )) === 1;
    }

    public function blockLease(int $id, string $lease_owner, string $error_code): bool
    {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Conditional operator-review transition.
        return $wpdb->query($wpdb->prepare(
            "UPDATE %i SET state = 'blocked', next_attempt_gmt = NULL,
             lease_expires_gmt = NULL, lease_owner = NULL, leased_generation = NULL,
             leased_operation = NULL, leased_source_version = NULL,
             leased_publisher_consumer_id = NULL,
             leased_publisher_sequence = NULL,
             leased_correlation_id = NULL, last_error_code = %s, updated_gmt = %s
             WHERE id = %d AND state = 'leased' AND lease_owner = %s",
            $this->tableName(),
            sanitize_key($error_code),
            current_time('mysql', true),
            $id,
            $lease_owner
        )) === 1;
    }

    public function approveManualReview(?string $post_type = null): int
    {
        global $wpdb;

        $scope_sql = '';
        $args = array($this->tableName(), current_time('mysql', true));
        if ($post_type !== null && $post_type !== '') {
            $scope_sql = ' AND post_type = %s';
            $args[] = sanitize_key($post_type);
        }

        $sql = "UPDATE %i
                SET state = 'pending', attempt_count = 0, next_attempt_gmt = NULL,
                    last_error_code = NULL, updated_gmt = %s
                WHERE state = 'blocked'
                  AND last_error_code = 'manual_review_required'{$scope_sql}";

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.NotPrepared -- Explicit administrator approval transitions only manual-review rows.
        $updated = $wpdb->query($wpdb->prepare($sql, ...$args));
        return $updated === false ? 0 : (int) $updated;
    }

    public function approveMassDeletion(?string $post_type = null): int
    {
        global $wpdb;

        $scope_sql = '';
        $args = array($this->tableName(), current_time('mysql', true));
        if ($post_type !== null && $post_type !== '') {
            $scope_sql = ' AND post_type = %s';
            $args[] = sanitize_key($post_type);
        }
        $sql = "UPDATE %i
                SET state = 'pending', reviewed_generation = desired_generation,
                    attempt_count = 0, next_attempt_gmt = NULL,
                    last_error_code = NULL, updated_gmt = %s
                WHERE state = 'blocked'
                  AND last_error_code = 'mass_delete_review_required'{$scope_sql}";
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.NotPrepared -- Explicit administrator approval marks only the current delete generation.
        $updated = $wpdb->query($wpdb->prepare($sql, ...$args));
        return $updated === false ? 0 : (int) $updated;
    }

    /**
     * Retry the legacy catch-all projection failures once after upgrading to
     * the backend contract that returns stable, actionable validation codes.
     */
    public function retryLegacyProjectionFailures(): int
    {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- One-time versioned migration of legacy catch-all failures.
        $updated = $wpdb->query($wpdb->prepare(
            "UPDATE %i
             SET state = 'pending', attempt_count = 0, next_attempt_gmt = NULL,
                 last_error_code = NULL, updated_gmt = %s
             WHERE state = 'blocked' AND last_error_code = 'invalid_projection'",
            $this->tableName(),
            current_time('mysql', true)
        ));
        return $updated === false ? 0 : (int) $updated;
    }

    public function blockUnreviewedMassDeletion(string $lease_owner): int
    {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- One safety transition blocks the complete current deletion set for operator review.
        $updated = $wpdb->query($wpdb->prepare(
            "UPDATE %i
             SET state = 'blocked', next_attempt_gmt = NULL,
                 lease_expires_gmt = NULL, lease_owner = NULL,
                 leased_generation = NULL, leased_operation = NULL,
                 leased_publisher_consumer_id = NULL,
                 leased_publisher_sequence = NULL,
                 leased_source_version = NULL, leased_correlation_id = NULL,
                 last_error_code = 'mass_delete_review_required', updated_gmt = %s
             WHERE desired_operation = 'delete'
               AND COALESCE(reviewed_generation, 0) < desired_generation
               AND (state IN ('pending', 'retry_wait') OR (state = 'leased' AND lease_owner = %s))",
            $this->tableName(),
            current_time('mysql', true),
            $lease_owner
        ));
        return $updated === false ? 0 : (int) $updated;
    }

    /** @return array{active:int,deletes:int,unreviewedDeletes:int} */
    public function deletionSafetySummary(): array
    {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Bounded aggregate over the durable desired-state table.
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT COUNT(*) AS active_count,
                    SUM(desired_operation = 'delete') AS delete_count,
                    SUM(desired_operation = 'delete' AND COALESCE(reviewed_generation, 0) < desired_generation) AS unreviewed_delete_count
             FROM %i
             WHERE state IN ('pending', 'retry_wait', 'leased', 'blocked')",
            $this->tableName()
        ));
        return array(
            'active' => (int) ($row->active_count ?? 0),
            'deletes' => (int) ($row->delete_count ?? 0),
            'unreviewedDeletes' => (int) ($row->unreviewed_delete_count ?? 0),
        );
    }

    /** @return array<string, int> */
    public function blockedReasonCounts(): array
    {
        global $wpdb;
        $result = array();
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Operational blocked-reason summary only.
        foreach ((array) $wpdb->get_results($wpdb->prepare(
            "SELECT last_error_code, COUNT(*) AS item_count
             FROM %i WHERE state = 'blocked' GROUP BY last_error_code",
            $this->tableName()
        )) as $row) {
            $reason = sanitize_key((string) ($row->last_error_code ?? 'unknown'));
            $result[$reason !== '' ? $reason : 'unknown'] = (int) $row->item_count;
        }
        ksort($result, SORT_STRING);
        return $result;
    }

    /** @return array<string, int> */
    public function counts(): array
    {
        global $wpdb;
        $result = array_fill_keys(array('pending', 'leased', 'retry_wait', 'blocked', 'complete'), 0);
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Operational queue summary.
        foreach ((array) $wpdb->get_results($wpdb->prepare(
            'SELECT state, COUNT(*) AS item_count FROM %i GROUP BY state',
            $this->tableName()
        )) as $row) {
            if (isset($result[$row->state])) {
                $result[$row->state] = (int) $row->item_count;
            }
        }
        return $result;
    }

    public function releaseGateWaitingCount(): int
    {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Operational blocked-by-release aggregate.
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM %i AS o
             WHERE o.state IN ('pending', 'retry_wait', 'leased', 'blocked')
               AND o.publisher_gate_required = 1
               AND (o.desired_publisher_consumer_id IS NULL OR
                    o.desired_publisher_sequence IS NULL OR NOT EXISTS (
                   SELECT 1 FROM {$this->releaseCursorTableName()} AS rc
                   WHERE rc.blog_id = o.blog_id AND rc.post_type = o.post_type
                     AND rc.consumer_id = o.desired_publisher_consumer_id
                     AND rc.verified_sequence >= o.desired_publisher_sequence
               ))",
            $this->tableName()
        ));
    }

    /**
     * Fail closed when an existing site enables release-aware operation. A
     * later verified baseline or journal event will attach the authoritative
     * consumer and cutoff to these coalesced desired states.
     */
    public function requireReleaseForActiveRows(): int
    {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- One-time mode transition over active desired states only.
        $updated = $wpdb->query($wpdb->prepare(
            "UPDATE %i SET publisher_gate_required = 1,
             desired_publisher_consumer_id = NULL,
             desired_publisher_sequence = NULL,
             updated_gmt = %s
             WHERE state <> 'complete'",
            $this->tableName(),
            current_time('mysql', true)
        ));
        return $updated === false ? 0 : (int) $updated;
    }

    private function releaseCursorTableName(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'smartcloud_ai_kit_kb_sync_release_cursors';
    }

    public function enqueueScopeDeletion(int $blog_id, string $post_type, string $correlation_id): int
    {
        global $wpdb;
        $now = current_time('mysql', true);
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Policy-scope removal is one atomic desired-state rewrite.
        $updated = $wpdb->query($wpdb->prepare(
            "UPDATE %i SET desired_operation = 'delete',
             source_version = CAST(source_sequence + 1 AS CHAR),
             source_sequence = source_sequence + 1,
             desired_generation = desired_generation + 1,
             state = IF(state = 'leased', 'leased', 'pending'),
             attempt_count = IF(state = 'leased', attempt_count, 0),
             next_attempt_gmt = IF(state = 'leased', next_attempt_gmt, NULL),
             correlation_id = %s,
             last_error_code = IF(state = 'leased', last_error_code, NULL),
             updated_gmt = %s
             WHERE blog_id = %d AND post_type = %s",
            $this->tableName(),
            $correlation_id,
            $now,
            $blog_id,
            sanitize_key($post_type)
        ));
        return $updated === false ? 0 : (int) $updated;
    }
}

final class KnowledgeSyncRetryPolicy
{
    public static function delaySeconds(int $attempt, int $jitter_seconds = 0): int
    {
        $attempt = max(1, $attempt);
        $jitter_seconds = max(0, min(30, $jitter_seconds));
        return min(3600, 30 * (2 ** min(7, $attempt - 1))) + $jitter_seconds;
    }
}

final class KnowledgeSyncCapture
{
    public function __construct(
        private readonly KnowledgeSyncPolicyStore $policies,
        private readonly KnowledgeSyncOutboxRepository $outbox
    ) {
    }

    public function registerHooks(): void
    {
        add_action('wp_after_insert_post', array($this, 'onAfterInsertPost'), 20, 4);
        add_action('before_delete_post', array($this, 'onBeforeDeletePost'), 20, 2);
        add_action('set_object_terms', array($this, 'onSetObjectTerms'), 20, 6);
    }

    public function onAfterInsertPost(int $post_id, \WP_Post $post, bool $update, ?\WP_Post $post_before): void
    {
        unset($update);

        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
            return;
        }

        $policy = $this->eligiblePolicy($post->post_type);
        if ($policy === null) {
            return;
        }

        $before_status = $post_before instanceof \WP_Post ? $post_before->post_status : 'new';
        if ($post->post_status === 'publish') {
            $manual_review = $policy['reviewPolicy'] === 'manual-kb-review';
            $gate_required = KnowledgeSyncPublicReleaseGate::enabled();
            $publisher_position = $gate_required
                ? KnowledgeSyncPublicReleaseGate::desiredPosition(get_current_blog_id(), $post->post_type, $post_id)
                : null;
            $this->outbox->enqueue(
                get_current_blog_id(),
                $post->post_type,
                $post_id,
                'upsert',
                $this->correlationId(),
                $manual_review ? 'blocked' : 'pending',
                $this->publicPermalink($post),
                $manual_review ? 'manual_review_required' : null,
                $gate_required,
                $publisher_position['consumerId'] ?? null,
                $publisher_position['sequence'] ?? null
            );
            return;
        }

        if ($before_status === 'publish') {
            $gate_required = KnowledgeSyncPublicReleaseGate::enabled();
            $publisher_position = $gate_required
                ? KnowledgeSyncPublicReleaseGate::desiredPosition(get_current_blog_id(), $post->post_type, $post_id)
                : null;
            $this->outbox->enqueue(
                get_current_blog_id(),
                $post->post_type,
                $post_id,
                'delete',
                $this->correlationId(),
                'pending',
                null,
                null,
                $gate_required,
                $publisher_position['consumerId'] ?? null,
                $publisher_position['sequence'] ?? null
            );
        }
    }

    /** Metadata edits do not fire WordPress post-save hooks. */
    public function onBaseMetadataChanged(int $post_id, string $doc_id, string $section_id): void
    {
        if ($doc_id !== 'post-' . $post_id . '/base' || $section_id !== 'main') {
            return;
        }
        $post = get_post($post_id);
        if ($post instanceof \WP_Post && $post->post_status === 'publish') {
            $policy = $this->eligiblePolicy($post->post_type);
            if ($policy === null) {
                return;
            }
            $manual_review = $policy['reviewPolicy'] === 'manual-kb-review';
            // Authored AI metadata does not alter public WordPress content.
            // It may bypass the release gate only for an already-public URL.
            $this->outbox->enqueue(
                get_current_blog_id(),
                $post->post_type,
                $post_id,
                'upsert',
                $this->correlationId(),
                $manual_review ? 'blocked' : 'pending',
                $this->publicPermalink($post),
                $manual_review ? 'manual_review_required' : null,
                false,
                null,
                null
            );
        }
    }

    public function onBeforeDeletePost(int $post_id, \WP_Post $post): void
    {
        if ($this->eligiblePolicy($post->post_type) === null) {
            return;
        }

        $gate_required = KnowledgeSyncPublicReleaseGate::enabled();
        $publisher_position = $gate_required
            ? KnowledgeSyncPublicReleaseGate::desiredPosition(get_current_blog_id(), $post->post_type, $post_id)
            : null;
        $this->outbox->enqueue(
            get_current_blog_id(),
            $post->post_type,
            $post_id,
            'delete',
            $this->correlationId(),
            'pending',
            $this->publicPermalink($post),
            null,
            $gate_required,
            $publisher_position['consumerId'] ?? null,
            $publisher_position['sequence'] ?? null
        );
    }

    /**
     * Taxonomy assignment happens independently from post persistence. Record
     * it only when the selected taxonomy can affect an already-public source.
     *
     * @param int[] $term_taxonomy_ids
     * @param int[] $old_term_taxonomy_ids
     */
    public function onSetObjectTerms(
        int $object_id,
        mixed $terms,
        array $term_taxonomy_ids,
        string $taxonomy,
        bool $append,
        array $old_term_taxonomy_ids
    ): void {
        unset($terms, $append);

        if ($term_taxonomy_ids === $old_term_taxonomy_ids) {
            return;
        }

        $post = get_post($object_id);
        if (!$post instanceof \WP_Post || $post->post_status !== 'publish') {
            return;
        }

        $policy = $this->eligiblePolicy($post->post_type);
        if (
            $policy === null ||
            !in_array(sanitize_key($taxonomy), $policy['includeTaxonomies'], true)
        ) {
            return;
        }

        $manual_review = $policy['reviewPolicy'] === 'manual-kb-review';
        $gate_required = KnowledgeSyncPublicReleaseGate::enabled();
        $publisher_position = $gate_required
            ? KnowledgeSyncPublicReleaseGate::desiredPosition(get_current_blog_id(), $post->post_type, $object_id)
            : null;
        $this->outbox->enqueue(
            get_current_blog_id(),
            $post->post_type,
            $object_id,
            'upsert',
            $this->correlationId(),
            $manual_review ? 'blocked' : 'pending',
            $this->publicPermalink($post),
            $manual_review ? 'manual_review_required' : null,
            $gate_required,
            $publisher_position['consumerId'] ?? null,
            $publisher_position['sequence'] ?? null
        );
    }

    /** @return array<string, mixed>|null */
    private function eligiblePolicy(string $post_type): ?array
    {
        $policy = $this->policies->getForPostType($post_type);
        if (
            $policy === null ||
            empty($policy['enabled']) ||
            $policy['reviewPolicy'] === 'disabled'
        ) {
            return null;
        }
        $object = get_post_type_object($post_type);
        if (!knowledge_sync_post_type_is_viewable($object)) {
            return null;
        }

        return $policy;
    }

    private function publicPermalink(\WP_Post $post): ?string
    {
        $url = get_permalink($post);
        if (!is_string($url) || $url === '' || str_contains($url, '__trashed')) {
            return null;
        }
        return $url;
    }

    private function correlationId(): string
    {
        return function_exists('wp_generate_uuid4')
            ? wp_generate_uuid4()
            : hash('sha256', microtime(true) . ':' . random_int(0, PHP_INT_MAX));
    }
}
