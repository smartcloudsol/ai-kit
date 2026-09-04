<?php

use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncPolicyStore;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\Admin as KnowledgeBaseAdmin;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncBaselineRepository;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncBaselineService;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncOutboxRepository;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncRuntime;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\Schema;

const KNOWLEDGE_SYNC_TEST_POST_TYPE = 'kb_sync_test';

if (!defined('ABSPATH')) {
    throw new RuntimeException('Run this test through a booted WordPress instance.');
}

if (defined('WP_CLI') && WP_CLI) {
    set_exception_handler(static function (Throwable $error): void {
        WP_CLI::error(sprintf(
            "%s: %s\n%s",
            get_class($error),
            $error->getMessage(),
            $error->getTraceAsString()
        ));
    });
}

if (!class_exists(KnowledgeSyncPolicyStore::class) || !class_exists(Schema::class)) {
    throw new RuntimeException('SmartCloud AI Kit must be active before running this test.');
}
if (is_multisite()) {
    if (!function_exists('is_plugin_active_for_network')) {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
    }
    if (!is_plugin_active_for_network('smartcloud-ai-kit/smartcloud-ai-kit.php')) {
        throw new RuntimeException('Multisite verification requires SmartCloud AI Kit to be network active.');
    }
}

/** @param mixed $actual */
function knowledge_sync_expect(mixed $actual, mixed $expected, string $message): void
{
    if ($actual !== $expected) {
        throw new RuntimeException(
            $message . ' Expected ' . var_export($expected, true) .
            ', received ' . var_export($actual, true) . '.'
        );
    }
}

/** @return object|null */
function knowledge_sync_row(int $post_id): ?object
{
    global $wpdb;
    $table = $wpdb->prefix . 'smartcloud_ai_kit_kb_sync_outbox';

    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Integration-test assertion.
    return $wpdb->get_row(
        $wpdb->prepare(
            'SELECT * FROM %i WHERE blog_id = %d AND post_type = %s AND post_id = %d',
            $table,
            get_current_blog_id(),
            KNOWLEDGE_SYNC_TEST_POST_TYPE,
            $post_id
        )
    );
}

function knowledge_sync_clean_baseline(): void
{
    global $wpdb;
    $table = $wpdb->prefix . 'smartcloud_ai_kit_kb_sync_baselines';
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Integration-test cleanup.
    $wpdb->query($wpdb->prepare(
        'DELETE FROM %i WHERE blog_id = %d AND post_type = %s',
        $table,
        get_current_blog_id(),
        KNOWLEDGE_SYNC_TEST_POST_TYPE
    ));
}

function knowledge_sync_clean_scope(): void
{
    global $wpdb;
    foreach (get_posts(array(
        'post_type' => KNOWLEDGE_SYNC_TEST_POST_TYPE,
        'post_status' => array_keys(get_post_stati()),
        'numberposts' => -1,
        'fields' => 'ids',
    )) as $stale_post_id) {
        wp_delete_post((int) $stale_post_id, true);
    }
    $outbox_table = $wpdb->prefix . 'smartcloud_ai_kit_kb_sync_outbox';
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Integration-test cleanup.
    $wpdb->query($wpdb->prepare(
        'DELETE FROM %i WHERE blog_id = %d AND post_type = %s',
        $outbox_table,
        get_current_blog_id(),
        KNOWLEDGE_SYNC_TEST_POST_TYPE
    ));
    knowledge_sync_clean_baseline();
}

function knowledge_sync_test_blog(int $blog_id): array
{
    $switched = is_multisite() && $blog_id !== get_current_blog_id();
    if ($switched) {
        switch_to_blog($blog_id);
    }

    $policy_option = KnowledgeSyncPolicyStore::OPTION_NAME;
    $original_policies = get_option($policy_option, null);
    $original_cron = wp_next_scheduled(KnowledgeSyncRuntime::CRON_HOOK);
    $post_id = 0;
    $term_id = 0;
    $http_requests = 0;
    $lease_owner_prefix = 'knowledge-sync-test-' . wp_generate_uuid4();
    $block_http = static function (mixed $preempt) use (&$http_requests): WP_Error {
        unset($preempt);
        $http_requests++;
        return new WP_Error('knowledge_sync_test_http_blocked', 'Unexpected HTTP request during save hook.');
    };

    try {
        knowledge_sync_expect(
            knowledge_sync_post_type_is_viewable(get_post_type_object('page')),
            true,
            'The built-in page post type was not recognized as publicly viewable.'
        );
        register_post_type(KNOWLEDGE_SYNC_TEST_POST_TYPE, array(
            'public' => true,
            'publicly_queryable' => true,
            'show_ui' => false,
            'supports' => array('title', 'editor'),
        ));
        register_taxonomy_for_object_type('post_tag', KNOWLEDGE_SYNC_TEST_POST_TYPE);
        Schema::createTables();
        update_option($policy_option, array(), false);
        knowledge_sync_clean_scope();
        $policies = new KnowledgeSyncPolicyStore();
        $policies->saveForPostType(KNOWLEDGE_SYNC_TEST_POST_TYPE, array(
            'enabled' => true,
            'reviewPolicy' => 'wordpress-publish-is-approval',
            'includeTaxonomies' => array('post_tag'),
        ));

        add_filter('pre_http_request', $block_http, PHP_INT_MIN, 1);
        $post_id = wp_insert_post(array(
            'post_type' => KNOWLEDGE_SYNC_TEST_POST_TYPE,
            'post_status' => 'draft',
            'post_title' => 'Temporary knowledge sync boot test ' . wp_generate_uuid4(),
            'post_content' => 'Temporary integration-test content.',
        ), true);
        if (is_wp_error($post_id)) {
            throw new RuntimeException($post_id->get_error_message());
        }
        $post_id = (int) $post_id;
        knowledge_sync_expect(knowledge_sync_row($post_id), null, 'Draft creation produced outbox work.');

        wp_update_post(array('ID' => $post_id, 'post_status' => 'publish'));
        $published = knowledge_sync_row($post_id);
        knowledge_sync_expect($published?->desired_operation, 'upsert', 'Publish did not request upsert.');
        $publish_generation = (int) $published->desired_generation;
        $public_url = (string) $published->last_public_url;
        if ($public_url === '' || str_contains($public_url, '__trashed')) {
            throw new RuntimeException('Publish did not preserve the stable public URL.');
        }

        $baselines = new KnowledgeSyncBaselineRepository();
        $baseline_result = (new KnowledgeSyncBaselineService(
            $policies,
            new KnowledgeSyncOutboxRepository(),
            $baselines
        ))->reconcilePage(KNOWLEDGE_SYNC_TEST_POST_TYPE, 10);
        knowledge_sync_expect($baseline_result['status'], 'ready', 'Single-page baseline did not become ready.');
        $baseline = $baselines->get(
            'wordpress-blog-' . get_current_blog_id(),
            get_current_blog_id(),
            KNOWLEDGE_SYNC_TEST_POST_TYPE
        );
        knowledge_sync_expect($baseline?->status, 'ready', 'Verified baseline was not persisted.');

        wp_update_post(array('ID' => $post_id, 'post_content' => 'Updated integration-test content.'));
        $updated = knowledge_sync_row($post_id);
        if ((int) $updated->desired_generation <= $publish_generation) {
            throw new RuntimeException('Published update did not advance the desired generation.');
        }

        $term = wp_insert_term('Knowledge sync test ' . wp_generate_uuid4(), 'post_tag');
        if (is_wp_error($term)) {
            throw new RuntimeException($term->get_error_message());
        }
        $term_id = (int) $term['term_id'];
        $before_taxonomy = (int) $updated->desired_generation;
        wp_set_post_terms($post_id, array($term_id), 'post_tag', false);
        $after_taxonomy = knowledge_sync_row($post_id);
        if ((int) $after_taxonomy->desired_generation <= $before_taxonomy) {
            throw new RuntimeException('Selected taxonomy change did not advance the desired generation.');
        }

        $outbox = new KnowledgeSyncOutboxRepository();
        $leased = $outbox->claimBatch(
            10,
            60,
            $lease_owner_prefix . '-a',
            get_current_blog_id(),
            KNOWLEDGE_SYNC_TEST_POST_TYPE
        );
        knowledge_sync_expect(count($leased), 1, 'Pending desired state was not leased exactly once.');
        $leased_row = $leased[0];
        wp_update_post(array('ID' => $post_id, 'post_content' => 'Changed while the outbox row is leased.'));
        if (!$outbox->completeLease((int) $leased_row->id, $lease_owner_prefix . '-a', str_repeat('a', 64))) {
            throw new RuntimeException('Owned lease could not be completed.');
        }
        $trailing = knowledge_sync_row($post_id);
        knowledge_sync_expect($trailing?->state, 'pending', 'Mid-lease change did not leave one trailing demand.');

        $leased_again = $outbox->claimBatch(
            10,
            60,
            $lease_owner_prefix . '-b',
            get_current_blog_id(),
            KNOWLEDGE_SYNC_TEST_POST_TYPE
        );
        knowledge_sync_expect(count($leased_again), 1, 'Trailing demand was not claimable.');
        global $wpdb;
        $outbox_table = $wpdb->prefix . 'smartcloud_ai_kit_kb_sync_outbox';
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Simulated lease expiry.
        $wpdb->query($wpdb->prepare(
            'UPDATE %i SET lease_expires_gmt = %s WHERE id = %d',
            $outbox_table,
            '2000-01-01 00:00:00',
            (int) $leased_again[0]->id
        ));
        $recovered = $outbox->claimBatch(
            10,
            60,
            $lease_owner_prefix . '-c',
            get_current_blog_id(),
            KNOWLEDGE_SYNC_TEST_POST_TYPE
        );
        knowledge_sync_expect(count($recovered), 1, 'Expired lease was not recovered.');
        knowledge_sync_expect($recovered[0]->last_error_code, 'lease_expired', 'Lease recovery lost its reason.');
        if (!$outbox->retryLease((int) $recovered[0]->id, $lease_owner_prefix . '-c', 'transport_unavailable')) {
            throw new RuntimeException('Owned lease could not enter retry-wait.');
        }
        knowledge_sync_expect(knowledge_sync_row($post_id)?->state, 'retry_wait', 'Retry did not persist retry-wait.');
        wp_update_post(array('ID' => $post_id, 'post_content' => 'Newer change supersedes retry delay.'));
        knowledge_sync_expect(knowledge_sync_row($post_id)?->state, 'pending', 'New demand did not supersede retry-wait.');

        wp_trash_post($post_id);
        $trashed = knowledge_sync_row($post_id);
        knowledge_sync_expect($trashed?->desired_operation, 'delete', 'Trash did not request delete.');
        knowledge_sync_expect($trashed?->last_public_url, $public_url, 'Trash lost the last stable public URL.');

        wp_untrash_post($post_id);
        $after_restore = knowledge_sync_row($post_id);
        knowledge_sync_expect($after_restore?->desired_operation, 'delete', 'Draft restore must not republish KB content.');

        wp_update_post(array('ID' => $post_id, 'post_status' => 'publish'));
        $republished = knowledge_sync_row($post_id);
        knowledge_sync_expect($republished?->desired_operation, 'upsert', 'Republish did not supersede tombstone.');
        if (str_contains((string) $republished->last_public_url, '__trashed')) {
            throw new RuntimeException('Republish retained a WordPress trash alias.');
        }

        wp_delete_post($post_id, true);
        $deleted = knowledge_sync_row($post_id);
        knowledge_sync_expect($deleted?->desired_operation, 'delete', 'Permanent delete did not request tombstone.');

        for ($index = 0; $index < 9; $index++) {
            $mass_post_id = wp_insert_post(array(
                'post_type' => KNOWLEDGE_SYNC_TEST_POST_TYPE,
                'post_status' => 'publish',
                'post_title' => 'Temporary mass delete guard ' . $index . ' ' . wp_generate_uuid4(),
                'post_content' => 'Temporary integration-test content.',
            ), true);
            if (is_wp_error($mass_post_id)) {
                throw new RuntimeException($mass_post_id->get_error_message());
            }
            wp_trash_post((int) $mass_post_id);
        }
        $deletion_summary = $outbox->deletionSafetySummary();
        if ($deletion_summary['deletes'] < 10 || $deletion_summary['unreviewedDeletes'] < 10) {
            throw new RuntimeException('Mass deletion guard did not observe the complete unreviewed tombstone set.');
        }
        $mass_lease_owner = $lease_owner_prefix . '-mass';
        $mass_leases = $outbox->claimBatch(100, 60, $mass_lease_owner);
        if (count($mass_leases) < 10) {
            throw new RuntimeException('Mass deletion test could not lease the expected tombstones.');
        }
        $blocked_deletes = $outbox->blockUnreviewedMassDeletion($mass_lease_owner);
        if ($blocked_deletes < 10) {
            throw new RuntimeException('Mass deletion guard did not block every current tombstone generation.');
        }
        $approved_deletes = $outbox->approveMassDeletion();
        knowledge_sync_expect($approved_deletes, $blocked_deletes, 'Mass deletion approval did not release the blocked set.');
        $reviewed_leases = $outbox->claimBatch(100, 60, $lease_owner_prefix . '-mass-approved');
        foreach ($reviewed_leases as $reviewed_lease) {
            if (
                ($reviewed_lease->leased_operation ?? null) === 'delete' &&
                (int) ($reviewed_lease->reviewed_generation ?? 0) < (int) ($reviewed_lease->leased_generation ?? 0)
            ) {
                throw new RuntimeException('Mass deletion approval was not bound to the leased generation.');
            }
        }
        knowledge_sync_expect($http_requests, 0, 'A save hook attempted backend I/O.');

        return array(
            'blogId' => $blog_id,
            'finalGeneration' => (int) $deleted->desired_generation,
            'sourceVersion' => (string) $deleted->source_version,
        );
    } finally {
        remove_filter('pre_http_request', $block_http, PHP_INT_MIN);
        if ($post_id > 0) {
            wp_delete_post($post_id, true);
        }
        knowledge_sync_clean_scope();
        if ($term_id > 0) {
            wp_delete_term($term_id, 'post_tag');
        }
        if ($original_policies === null) {
            delete_option($policy_option);
        } else {
            update_option($policy_option, $original_policies, false);
        }
        if ($original_cron === false) {
            wp_clear_scheduled_hook(KnowledgeSyncRuntime::CRON_HOOK);
        }
        if ($switched) {
            restore_current_blog();
        }
    }
}

$blog_ids = array(get_current_blog_id());
if (is_multisite()) {
    $network_blog_ids = get_sites(array('fields' => 'ids', 'number' => 2));
    foreach ($network_blog_ids as $network_blog_id) {
        if (!in_array((int) $network_blog_id, $blog_ids, true)) {
            $blog_ids[] = (int) $network_blog_id;
            break;
        }
    }
}

$results = array_map('knowledge_sync_test_blog', $blog_ids);
$status = (new KnowledgeBaseAdmin())->restGetKnowledgeSyncStatus()->get_data();
$available_post_types = array_column($status['availablePostTypes'] ?? array(), 'value');
knowledge_sync_expect(
    in_array('page', $available_post_types, true),
    true,
    'The built-in Page post type is missing from Knowledge Sync policy choices.'
);
knowledge_sync_expect(
    in_array('attachment', $available_post_types, true),
    false,
    'Media attachments must not be offered as Knowledge Sync content policies.'
);
$original_page_policies = get_option(KnowledgeSyncPolicyStore::OPTION_NAME, null);
try {
    $page_policy_request = new WP_REST_Request(
        'PUT',
        '/smartcloud-ai-kit/v1/kb/knowledge-sync/policies/page'
    );
    $page_policy_request->set_param('post_type', 'page');
    $page_policy_request->set_header('content-type', 'application/json');
    $page_policy_request->set_body((string) wp_json_encode(array(
        'enabled' => true,
        'reviewPolicy' => 'wordpress-publish-is-approval',
    )));
    $page_policy_response = (new KnowledgeBaseAdmin())->restUpdateKnowledgeSyncPolicy(
        $page_policy_request
    );
    knowledge_sync_expect(
        is_wp_error($page_policy_response),
        false,
        'The built-in Page policy was rejected by the REST save endpoint.'
    );
} finally {
    if ($original_page_policies === null) {
        delete_option(KnowledgeSyncPolicyStore::OPTION_NAME);
    } else {
        update_option(KnowledgeSyncPolicyStore::OPTION_NAME, $original_page_policies, false);
    }
}
$message = 'Booted knowledge-sync integration passed: ' . wp_json_encode($results);
if (defined('WP_CLI') && WP_CLI) {
    WP_CLI::success($message);
} else {
    echo $message . PHP_EOL;
}
