<?php
/**
 * KB Dependencies Repository
 * 
 * Manages post dependency tracking for KB sources.
 * When a referenced post changes, we can efficiently find and invalidate
 * all KB sources that include content from that post.
 */

namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

use SmartCloud\WPSuite\AiKit\Logger;

if (!defined('ABSPATH')) {
    exit;
}

class RepositoryDependencies
{
    private string $table;

    public function __construct()
    {
        global $wpdb;
        $this->table = $wpdb->prefix . 'smartcloud_ai_kit_kb_dependencies';
    }

    /**
     * Store dependencies for a KB source
     * Replaces all existing dependencies for the given source
     * 
     * @param int $kb_source_post_id The KB source post ID
     * @param array $referenced_post_ids Array of post IDs that are referenced
     * @param string $reference_type Type of reference (content, taxonomy, etc.)
     */
    public function storeDependencies(int $kb_source_post_id, array $referenced_post_ids, string $reference_type = 'content'): bool
    {
        global $wpdb;

        // Remove duplicates
        $referenced_post_ids = array_unique(array_filter($referenced_post_ids));

        Logger::debug('Storing KB dependencies', [
            'kb_source_post_id' => $kb_source_post_id,
            'dependency_count' => count($referenced_post_ids),
            'reference_type' => $reference_type
        ]);

        // Start transaction
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $wpdb->query('START TRANSACTION');

        try {
            // Delete existing dependencies for this source
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->delete(
                $this->table,
                ['kb_source_post_id' => $kb_source_post_id],
                ['%d']
            );

            // Insert new dependencies (if any)
            if (!empty($referenced_post_ids)) {
                $values = [];
                $placeholders = [];

                foreach ($referenced_post_ids as $ref_id) {
                    $values[] = $kb_source_post_id;
                    $values[] = $ref_id;
                    $values[] = $reference_type;
                    $placeholders[] = '(%d, %d, %s)';
                }

                // Prepare table name and values separately
                // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, PluginCheck.Security.DirectDB.UnescapedDBParameter
                $wpdb->query($wpdb->prepare(
                    "INSERT INTO %i (kb_source_post_id, referenced_post_id, reference_type) VALUES " . implode(', ', $placeholders), // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Dynamic placeholder building for bulk insert
                    array_merge([$this->table], $values)
                ));
            }

            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->query('COMMIT');

            Logger::info('KB dependencies stored successfully', [
                'kb_source_post_id' => $kb_source_post_id,
                'dependency_count' => count($referenced_post_ids)
            ]);

            return true;
        } catch (\Exception $e) {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->query('ROLLBACK');

            Logger::error('Failed to store KB dependencies', [
                'kb_source_post_id' => $kb_source_post_id,
                'error' => $e->getMessage()
            ]);

            return false;
        }
    }

    /**
     * Get all KB sources that reference a specific post
     * 
     * @param int $referenced_post_id The post ID that was referenced
     * @return array Array of KB source post IDs
     */
    public function getSourcesReferencingPost(int $referenced_post_id): array
    {
        global $wpdb;

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $results = $wpdb->get_col($wpdb->prepare(
            "SELECT DISTINCT kb_source_post_id FROM %i WHERE referenced_post_id = %d",
            $this->table,
            $referenced_post_id
        ));

        $sources = array_map('intval', $results);

        if (!empty($sources)) {
            Logger::debug('Found KB sources referencing post', [
                'referenced_post_id' => $referenced_post_id,
                'source_count' => count($sources),
                'sources' => $sources
            ]);
        }

        return $sources;
    }

    /**
     * Get all posts referenced by a KB source
     * 
     * @param int $kb_source_post_id The KB source post ID
     * @return array Array of referenced post IDs
     */
    public function getReferencedPosts(int $kb_source_post_id): array
    {
        global $wpdb;

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $results = $wpdb->get_col($wpdb->prepare(
            "SELECT DISTINCT referenced_post_id FROM %i WHERE kb_source_post_id = %d",
            $this->table,
            $kb_source_post_id
        ));

        return array_map('intval', $results);
    }

    /**
     * Delete all dependencies for a KB source
     * 
     * @param int $kb_source_post_id The KB source post ID
     */
    public function deleteBySource(int $kb_source_post_id): bool
    {
        global $wpdb;

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        return (bool) $wpdb->delete(
            $this->table,
            ['kb_source_post_id' => $kb_source_post_id],
            ['%d']
        );
    }

    /**
     * Delete all dependencies referencing a specific post
     * (Called when a post is permanently deleted)
     * 
     * @param int $referenced_post_id The referenced post ID
     */
    public function deleteByReferencedPost(int $referenced_post_id): bool
    {
        global $wpdb;

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        return (bool) $wpdb->delete(
            $this->table,
            ['referenced_post_id' => $referenced_post_id],
            ['%d']
        );
    }
}
