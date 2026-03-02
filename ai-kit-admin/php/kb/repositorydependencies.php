<?php
/**
 * KB Dependencies Repository
 * 
 * Manages post dependency tracking for KB sources.
 * When a referenced post changes, we can efficiently find and invalidate
 * all KB sources that include content from that post.
 */

namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

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

        // Start transaction
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

                $sql = "INSERT INTO {$this->table} 
                        (kb_source_post_id, referenced_post_id, reference_type) 
                        VALUES " . implode(', ', $placeholders);

                // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared
                $wpdb->query($wpdb->prepare($sql, $values));
            }

            $wpdb->query('COMMIT');
            return true;
        } catch (\Exception $e) {
            $wpdb->query('ROLLBACK');
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
            "SELECT DISTINCT kb_source_post_id FROM {$this->table} WHERE referenced_post_id = %d",
            $referenced_post_id
        ));

        return array_map('intval', $results);
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
            "SELECT DISTINCT referenced_post_id FROM {$this->table} WHERE kb_source_post_id = %d",
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
