<?php
/**
 * SmartCloud AI-Kit uninstall cleanup.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

function smartcloud_ai_kit_uninstall_site(): void
{
    global $wpdb;

    foreach (array(
        'smartcloud-ai-kit',
        'smartcloud_ai_kit_db_version',
        'smartcloud_ai_kit_db_migration_dismissed',
        'smartcloud_ai_kit_db_migration_status',
        'smartcloud_ai_kit_kb_base_url_override',
        'smartcloud_ai_kit_kb_review_notice_pending',
        'smartcloud_ai_kit_kb_sync_policies',
        'smartcloud_ai_kit_kb_sync_settings',
        'smartcloud_ai_kit_kb_sync_runner_lock',
        'smartcloud_ai_kit_kb_sync_private_keys',
        'smartcloud_ai_kit_kb_sync_registration',
    ) as $option) {
        delete_option($option);
    }

    foreach (array(
        'smartcloud_ai_kit_kb_sources',
        'smartcloud_ai_kit_kb_generated',
        'smartcloud_ai_kit_kb_overrides',
        'smartcloud_ai_kit_kb_publish_state',
        'smartcloud_ai_kit_kb_dependencies',
        'smartcloud_ai_kit_kb_sync_outbox',
        'smartcloud_ai_kit_kb_sync_baselines',
        'smartcloud_ai_kit_kb_sync_audit',
    ) as $suffix) {
        $table = esc_sql($wpdb->prefix . $suffix);
        $wpdb->query("DROP TABLE IF EXISTS {$table}"); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange -- Explicit uninstall of plugin-owned tables.
    }

    if (function_exists('wp_cache_flush_group')) {
        wp_cache_flush_group('smartcloud_ai_kit_abilities');
    }

    wp_clear_scheduled_hook('smartcloud_ai_kit_knowledge_sync_tick');

    if (defined('SMARTCLOUD_AI_KIT_KB_SYNC_KEY_DIRECTORY')) {
        $configured = constant('SMARTCLOUD_AI_KIT_KB_SYNC_KEY_DIRECTORY');
        $directory = is_string($configured) ? realpath($configured) : false;
        $webroot = realpath(ABSPATH);
        if (
            $directory !== false &&
            is_dir($directory) &&
            ($webroot === false || (
                $directory !== $webroot &&
                !str_starts_with($directory . DIRECTORY_SEPARATOR, $webroot . DIRECTORY_SEPARATOR)
            ))
        ) {
            $base = $directory . DIRECTORY_SEPARATOR . 'knowledge-sync-blog-' . get_current_blog_id();
            foreach (array($base . '.pem', $base . '.pending.pem') as $private_key_path) {
                if (is_file($private_key_path)) {
                    unlink($private_key_path);
                }
            }
        }
    }
}

if (is_multisite()) {
    foreach (get_sites(array('fields' => 'ids', 'number' => 0)) as $smartcloud_ai_kit_site_id) {
        switch_to_blog((int) $smartcloud_ai_kit_site_id);
        smartcloud_ai_kit_uninstall_site();
        restore_current_blog();
    }
} else {
    smartcloud_ai_kit_uninstall_site();
}
