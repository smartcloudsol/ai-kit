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
    ) as $option) {
        delete_option($option);
    }

    foreach (array(
        'smartcloud_ai_kit_kb_sources',
        'smartcloud_ai_kit_kb_generated',
        'smartcloud_ai_kit_kb_overrides',
        'smartcloud_ai_kit_kb_publish_state',
        'smartcloud_ai_kit_kb_dependencies',
    ) as $suffix) {
        $table = esc_sql($wpdb->prefix . $suffix);
        $wpdb->query("DROP TABLE IF EXISTS {$table}"); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange -- Explicit uninstall of plugin-owned tables.
    }

    if (function_exists('wp_cache_flush_group')) {
        wp_cache_flush_group('smartcloud_ai_kit_abilities');
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
