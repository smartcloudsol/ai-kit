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
        ?string $last_error_code = null
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
                 correlation_id, last_error_code, created_gmt, updated_gmt)
             VALUES (%s, %d, %s, %d, %s, 1, NULL, 1, '1', NULL, %s, 0,
                     NULL, NULL, NULLIF(%s, ''), %s, NULLIF(%s, ''), %s, %s)
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
        ?string $post_type = null
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
            $scope_sql .= ' AND blog_id = %d';
            $scope_args[] = $blog_id;
        }
        if ($post_type !== null) {
            $scope_sql .= ' AND post_type = %s';
            $scope_args[] = sanitize_key($post_type);
        }

        $select = "SELECT id FROM %i
             WHERE ((state IN ('pending', 'retry_wait') AND (next_attempt_gmt IS NULL OR next_attempt_gmt <= %s))
                    OR (state = 'leased' AND lease_expires_gmt <= %s))
             {$scope_sql}
             ORDER BY updated_gmt ASC, id ASC
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
        $update = "UPDATE %i
                   SET attempt_count = IF(state = 'leased', attempt_count + 1, attempt_count),
                       last_error_code = IF(state = 'leased', 'lease_expired', last_error_code),
                       state = 'leased', leased_generation = desired_generation,
                       leased_operation = desired_operation,
                       leased_source_version = source_version,
                       leased_correlation_id = correlation_id,
                       lease_owner = %s, lease_expires_gmt = %s, updated_gmt = %s
                   WHERE id IN ({$id_placeholders})
                     AND ((state IN ('pending', 'retry_wait') AND (next_attempt_gmt IS NULL OR next_attempt_gmt <= %s))
                          OR (state = 'leased' AND lease_expires_gmt <= %s))";
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
                 last_error_code = NULL, updated_gmt = %s
             WHERE id = %d AND state = 'leased' AND lease_owner = %s",
            $this->tableName(),
            $payload_fingerprint,
            $now,
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
            $this->outbox->enqueue(
                get_current_blog_id(),
                $post->post_type,
                $post_id,
                'upsert',
                $this->correlationId(),
                $manual_review ? 'blocked' : 'pending',
                $this->publicPermalink($post),
                $manual_review ? 'manual_review_required' : null
            );
            return;
        }

        if ($before_status === 'publish') {
            $this->outbox->enqueue(
                get_current_blog_id(),
                $post->post_type,
                $post_id,
                'delete',
                $this->correlationId(),
                'pending'
            );
        }
    }

    public function onBeforeDeletePost(int $post_id, \WP_Post $post): void
    {
        if ($this->eligiblePolicy($post->post_type) === null) {
            return;
        }

        $this->outbox->enqueue(
            get_current_blog_id(),
            $post->post_type,
            $post_id,
            'delete',
            $this->correlationId(),
            'pending',
            $this->publicPermalink($post)
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
        $this->outbox->enqueue(
            get_current_blog_id(),
            $post->post_type,
            $object_id,
            'upsert',
            $this->correlationId(),
            $manual_review ? 'blocked' : 'pending',
            $this->publicPermalink($post),
            $manual_review ? 'manual_review_required' : null
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
