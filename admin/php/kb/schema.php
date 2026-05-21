<?php
/**
 * KB Admin Database Schema
 *
 * Contains DDL and migration logic for KB Admin tables.
 */

namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

use SmartCloud\WPSuite\AiKit\Logger;

if (!defined('ABSPATH')) {
    exit;
}

class Schema
{
    /**
     * Create or update KB Admin tables using dbDelta.
     */
    public static function createTables(): void
    {
        global $wpdb;

        $charset_collate = $wpdb->get_charset_collate();
        $prefix = $wpdb->prefix . 'smartcloud_ai_kit_';

        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');

        // Table 1: kb_sources
        $sql_sources = "CREATE TABLE {$prefix}kb_sources (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            post_id BIGINT UNSIGNED NOT NULL,
            post_type VARCHAR(50) NOT NULL,
            enabled TINYINT(1) NOT NULL DEFAULT 0,
            default_doc_mode VARCHAR(20) NOT NULL DEFAULT 'base_only',
            taxonomy_mapping LONGTEXT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_post_id (post_id)
        ) $charset_collate;";

        // Table 2: kb_generated
        $sql_generated = "CREATE TABLE {$prefix}kb_generated (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            post_id BIGINT UNSIGNED NOT NULL,
            doc_id VARCHAR(190) NOT NULL,
            section_id VARCHAR(190) NOT NULL,
            mode VARCHAR(20) NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            title TEXT NULL,
            category VARCHAR(190) NULL,
            subcategory VARCHAR(190) NULL,
            tags_json LONGTEXT NULL,
            md LONGTEXT NOT NULL,
            origin_hash CHAR(64) NOT NULL,
            generated_at DATETIME NOT NULL,
            source_updated_at DATETIME NOT NULL,
            extra_meta_json LONGTEXT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_post_doc_section (post_id, doc_id, section_id),
            KEY ix_post_doc (post_id, doc_id),
            KEY ix_post_section (post_id, section_id)
        ) $charset_collate;";

        // Table 3: kb_overrides
        $sql_overrides = "CREATE TABLE {$prefix}kb_overrides (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            post_id BIGINT UNSIGNED NOT NULL,
            doc_id VARCHAR(190) NOT NULL,
            section_id VARCHAR(190) NOT NULL,
            override_md LONGTEXT NOT NULL,
            override_meta_json LONGTEXT NULL,
            locked TINYINT(1) NOT NULL DEFAULT 1,
            origin_hash_at_override CHAR(64) NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_post_doc_section (post_id, doc_id, section_id),
            KEY ix_post_doc (post_id, doc_id)
        ) $charset_collate;";

        // Table 4: kb_publish_state
        $sql_publish = "CREATE TABLE {$prefix}kb_publish_state (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            post_id BIGINT UNSIGNED NOT NULL,
            doc_id VARCHAR(190) NOT NULL,
            effective_hash CHAR(64) NOT NULL,
            last_published_at DATETIME NULL,
            last_backend_status VARCHAR(50) NULL,
            last_backend_details_json LONGTEXT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_post_doc (post_id, doc_id),
            KEY ix_post (post_id)
        ) $charset_collate;";

        // Table 5: kb_dependencies
        // Tracks which KB sources reference which posts (for invalidation on post updates)
        $sql_dependencies = "CREATE TABLE {$prefix}kb_dependencies (
            kb_source_post_id BIGINT UNSIGNED NOT NULL,
            referenced_post_id BIGINT UNSIGNED NOT NULL,
            reference_type VARCHAR(50) NOT NULL DEFAULT 'content',
            PRIMARY KEY (kb_source_post_id, referenced_post_id),
            KEY ix_referenced (referenced_post_id),
            KEY ix_source (kb_source_post_id)
        ) $charset_collate;";

        dbDelta($sql_sources);
        dbDelta($sql_generated);
        dbDelta($sql_overrides);
        dbDelta($sql_publish);
        dbDelta($sql_dependencies);

        Logger::info('KB Admin database tables created/updated', [
            'db_version' => SMARTCLOUD_AI_KIT_DB_VERSION ?? 'unknown'
        ]);
    }

    /**
     * Drop all KB Admin tables (on uninstall).
     */
    public static function dropTables(): void
    {
        global $wpdb;
        $prefix = $wpdb->prefix . 'smartcloud_ai_kit_';

        $tables = [
            "{$prefix}kb_sources",
            "{$prefix}kb_generated",
            "{$prefix}kb_overrides",
            "{$prefix}kb_publish_state",
            "{$prefix}kb_dependencies"
        ];

        Logger::info('Dropping KB Admin tables', ['tables' => $tables]);

        foreach ($tables as $table) {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange
            $wpdb->query($wpdb->prepare('DROP TABLE IF EXISTS %i', $table));
        }
    }
}
