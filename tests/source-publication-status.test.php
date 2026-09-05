<?php

declare(strict_types=1);

namespace SmartCloud\WPSuite\AiKit\KnowledgeBase {
    final class KnowledgeSyncPolicyStore
    {
        public function getForPostType(string $post_type): ?array
        {
            return $GLOBALS['policies'][$post_type] ?? null;
        }
    }
}

namespace {
    define('ABSPATH', __DIR__ . '/');
    define('SMARTCLOUD_AI_KIT_PATH', __DIR__ . '/nonexistent-layout/');
    define('SMARTCLOUD_AI_KIT_SLUG', 'smartcloud-ai-kit');

    function current_user_can(string $capability): bool { return true; }
    function get_option(string $name, mixed $default = false): mixed { return $GLOBALS['options'][$name] ?? $default; }
    function delete_option(string $name): bool { unset($GLOBALS['options'][$name]); return true; }
    function wp_nonce_url(string $url, string $action, string $name): string { return $url; }
    function add_query_arg(array $args, string $url): string { return $url; }
    function admin_url(string $path): string { return 'https://example.test/wp-admin/' . $path; }
    function esc_html__(string $text, string $domain): string { return $text; }
    function esc_url(string $url): string { return $url; }

    function expect(bool $condition, string $message): void
    {
        if (!$condition) {
            throw new RuntimeException($message);
        }
    }

    function get_post(int $post_id): ?object
    {
        return $GLOBALS['posts'][$post_id] ?? null;
    }

    function get_current_blog_id(): int
    {
        return $GLOBALS['blog_id'];
    }

    final class PublicationStatusDatabase
    {
        public string $prefix = 'wp_';
        public array $queries = [];
        public array $rows = [];
        public array $docs = [];
        public array $states = [];
        public bool $stale = false;
        public array $source_ids = [];

        public function prepare(string $query, mixed ...$args): string
        {
            $key = (string) count($this->queries);
            $this->queries[$key] = ['sql' => $query, 'args' => $args];
            return $key;
        }

        public function get_row(string $query): ?object
        {
            $args = $this->queries[$query]['args'];
            return $this->rows[implode('|', $args)] ?? null;
        }

        public function get_col(string $query): array
        {
            if (str_contains($this->queries[$query]['sql'], 'SELECT post_id FROM')) {
                return $this->source_ids;
            }
            return $this->docs;
        }

        public function get_results(string $query): array
        {
            return $this->states;
        }

        public function get_var(string $query): ?int
        {
            return $this->stale ? 1 : null;
        }
    }

    require_once __DIR__ . '/../admin/php/kb/source-publication-status.php';
    require_once __DIR__ . '/../admin/php/kb/review-notice.php';
    require_once __DIR__ . '/../admin/php/kb/admin.php';

    use SmartCloud\WPSuite\AiKit\KnowledgeBase\SourcePublicationStatus;

    $automatic = ['enabled' => true, 'reviewPolicy' => 'wordpress-publish-is-approval'];
    $manual = ['enabled' => true, 'reviewPolicy' => 'manual-kb-review'];
    $complete = (object) ['state' => 'complete', 'desired_operation' => 'upsert', 'desired_generation' => 12, 'leased_generation' => null, 'last_error_code' => null];

    expect(SourcePublicationStatus::automatic(null, $complete, 'publish') === null, 'No policy must retain manual publication.');
    expect(SourcePublicationStatus::automatic(['enabled' => false, 'reviewPolicy' => 'wordpress-publish-is-approval'], $complete, 'publish') === null, 'Disabling auto-sync must not reuse old successful delivery.');
    expect(SourcePublicationStatus::automatic(['enabled' => true, 'reviewPolicy' => 'disabled'], $complete, 'publish') === null, 'Disabled review policy must retain manual publication.');
    expect(SourcePublicationStatus::automatic($automatic, null, 'publish') === 'sync_pending', 'New auto source must wait for baseline, not manual review.');
    expect(SourcePublicationStatus::automatic($manual, null, 'publish') === 'needs_review', 'Manual policy must require approval before initial delivery.');
    expect(SourcePublicationStatus::automatic($automatic, null, 'draft') === 'sync_removed', 'Unpublished source without delivery is not published.');
    expect(SourcePublicationStatus::automatic($automatic, $complete, 'publish') === 'sync_delivered', 'Current completed generation confirms delivery, not indexing.');
    expect(SourcePublicationStatus::automatic($manual, $complete, 'publish') === 'sync_delivered', 'An approved completed manual-policy generation must not require review again.');

    foreach (['pending' => 'sync_pending', 'retry_wait' => 'sync_error', 'blocked' => 'sync_blocked', 'unexpected' => 'sync_blocked'] as $state => $expected) {
        $row = clone $complete;
        $row->state = $state;
        $row->last_error_code = 'backend_unavailable';
        expect(SourcePublicationStatus::automatic($automatic, $row, 'publish') === $expected, 'Incorrect mapping for ' . $state);
    }
    $row = clone $complete;
    $row->state = 'blocked';
    $row->last_error_code = 'manual_review_required';
    expect(SourcePublicationStatus::automatic($manual, $row, 'publish') === 'needs_review', 'Explicit blocked approval must remain review.');
    $row->state = 'leased';
    $row->leased_generation = 12;
    expect(SourcePublicationStatus::automatic($automatic, $row, 'publish') === 'sync_running', 'Current leased generation is running.');
    $row->desired_generation = 13;
    expect(SourcePublicationStatus::automatic($automatic, $row, 'publish') === 'sync_pending', 'Slug or metadata change during a lease must show pending latest generation.');
    $row = clone $complete;
    $row->desired_operation = 'delete';
    expect(SourcePublicationStatus::automatic($automatic, $row, 'draft') === 'sync_removed', 'Completed removal is not successful publication.');
    expect(SourcePublicationStatus::automatic($automatic, $row, 'publish') === 'sync_pending', 'A republished source cannot reuse completed removal.');
    expect(SourcePublicationStatus::automatic($automatic, $complete, 'draft') === 'sync_pending', 'An unpublished source cannot reuse completed upsert.');

    $base = 'post-42/base';
    $extra = 'post-42/faq';
    $published = (object) ['last_backend_status' => 'success'];
    $pending = (object) ['last_backend_status' => 'pending'];
    expect(SourcePublicationStatus::combine(42, 'sync_delivered', [$base], [], false) === 'sync_delivered', 'Auto base must not require a fabricated manual publication row.');
    expect(SourcePublicationStatus::combine(42, 'sync_pending', [], [], false) === 'sync_pending', 'Auto source without generated manual sections is pending.');
    expect(SourcePublicationStatus::combine(42, 'sync_delivered', [$base, $extra], [], false) === 'needs_review', 'Unreviewed independent manual document must remain visible.');
    expect(SourcePublicationStatus::combine(42, 'sync_delivered', [$base, $extra], [$extra => $pending], false) === 'ready_to_publish', 'Reviewed extra document must still be manually published.');
    expect(SourcePublicationStatus::combine(42, 'sync_delivered', [$base, $extra], [$extra => $published], false) === 'sync_delivered', 'Published extras must not cause false review.');
    expect(SourcePublicationStatus::combine(42, 'sync_delivered', [$base], [], true) === 'needs_review', 'A stale locked override must not be hidden by automatic delivery.');
    expect(SourcePublicationStatus::combine(42, null, [$base], [], false) === 'needs_review', 'Legacy missing publication state remains review.');
    expect(SourcePublicationStatus::combine(42, null, [$base], [$base => $pending], false) === 'ready_to_publish', 'Legacy pending publication remains ready.');
    expect(SourcePublicationStatus::combine(42, null, [$base], [$base => $published], false) === 'published', 'Legacy successful publication remains published.');
    expect(SourcePublicationStatus::combine(42, null, [], [], false) === 'needs_review', 'Empty manual source requires review.');
    expect(SourcePublicationStatus::combine(42, 'sync_error', [$base, $extra], [$extra => $pending], false) === 'sync_error', 'Sync error must be visible over ready manual documents.');
    expect(SourcePublicationStatus::combine(42, 'sync_delivered', ['post-99/base'], [], false) === 'needs_review', 'Only the exact current post base document is auto-managed.');

    $wpdb = new PublicationStatusDatabase();
    $blog_id = 1;
    $posts = [42 => (object) ['post_type' => 'post', 'post_status' => 'publish']];
    $policies = ['post' => $automatic];
    $wpdb->docs = [$base];
    $wpdb->rows['wp_smartcloud_ai_kit_kb_sync_outbox|wordpress-blog-1|1|post|42'] = $complete;
    expect(SourcePublicationStatus::forPost(42) === ['status' => 'sync_delivered', 'error' => null], 'Reader must use current source outbox state.');
    $query = $wpdb->queries[0];
    expect(str_contains($query['sql'], 'consumer_id = %s AND blog_id = %d AND post_type = %s AND post_id = %d'), 'Reader must scope tenant consumer, post type and post.');
    expect($query['args'] === ['wp_smartcloud_ai_kit_kb_sync_outbox', 'wordpress-blog-1', 1, 'post', 42], 'Reader must parameterize exact active source scope.');
    $blog_id = 2;
    $wpdb->prefix = 'wp_2_';
    expect(SourcePublicationStatus::forPost(42)['status'] === 'sync_pending', 'Same post ID on another blog must not inherit completed status.');
    $failure = clone $complete;
    $failure->state = 'blocked';
    $failure->last_error_code = 'invalid_projection';
    $wpdb->rows['wp_2_smartcloud_ai_kit_kb_sync_outbox|wordpress-blog-2|2|post|42'] = $failure;
    expect(SourcePublicationStatus::forPost(42) === ['status' => 'sync_blocked', 'error' => 'invalid_projection'], 'Specific backend failure must reach presentation.');
    $policies['post']['enabled'] = false;
    expect(SourcePublicationStatus::forPost(42) === ['status' => 'needs_review', 'error' => null], 'Disabled automatic policy must not leak stale automatic failure.');
    $wpdb->states = [(object) ['doc_id' => $base, 'last_backend_status' => 'success']];
    expect(SourcePublicationStatus::forPost(42)['status'] === 'published', 'Reader must still map legacy document states.');
    $wpdb->stale = true;
    expect(SourcePublicationStatus::forPost(42)['status'] === 'needs_review', 'Reader must preserve stale locked override review.');

    $notice_key = 'smartcloud_ai_kit_kb_review_notice_pending';
    $options = [$notice_key => '2026-09-05'];
    $admin = (new ReflectionClass(\SmartCloud\WPSuite\AiKit\KnowledgeBase\Admin::class))->newInstanceWithoutConstructor();
    ob_start();
    $admin->showKbReviewNotice();
    $notice = ob_get_clean();
    expect($notice === '' && !isset($options[$notice_key]), 'Persisted notice with no sources must be removed silently.');
    $wpdb->source_ids = [42];
    $wpdb->stale = false;
    $policies['post'] = $automatic;
    $wpdb->rows['wp_2_smartcloud_ai_kit_kb_sync_outbox|wordpress-blog-2|2|post|42'] = $complete;
    $options[$notice_key] = '2026-09-05';
    ob_start();
    $admin->showKbReviewNotice();
    $notice = ob_get_clean();
    expect($notice === '' && !isset($options[$notice_key]), 'Completed auto source must clear stale manual review notice.');
    $wpdb->docs = [$base, $extra];
    $options[$notice_key] = '2026-09-05';
    ob_start();
    $admin->showKbReviewNotice();
    $notice = ob_get_clean();
    expect(str_contains($notice, 'Knowledge Base review required') && isset($options[$notice_key]), 'Actual manual extra review must preserve and display notice.');

    echo "Source publication status tests passed.\n";
}
