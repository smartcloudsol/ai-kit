<?php
/**
 * KB Admin Database Repository
 *
 * Provides data access methods for KB Admin tables.
 */

namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * KB Source Repository - manages smartcloud_ai_kit_kb_sources table
 */
class Repository
{
    private string $table_name;

    public function __construct()
    {
        global $wpdb;
        $this->table_name = $wpdb->prefix . 'smartcloud_ai_kit_kb_sources';
    }

    /**
     * Get KB source by post_id
     */
    public function getByPostId(int $post_id): ?object
    {
        global $wpdb;
        return $wpdb->get_row( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare('SELECT * FROM %i WHERE post_id = %d', $this->table_name, $post_id)
        );
    }

    /**
     * Check if post is enabled as KB source
     */
    public function isEnabled(int $post_id): bool
    {
        $source = $this->getByPostId($post_id);
        return $source && (bool) $source->enabled;
    }

    /**
     * Enable post as KB source
     */
    public function enable(int $post_id, string $post_type, array $options = []): bool
    {
        global $wpdb;

        $existing = $this->getByPostId($post_id);
        $now = current_time('mysql');

        $data = [
            'post_id' => $post_id,
            'post_type' => $post_type,
            'enabled' => 1,
            'default_doc_mode' => $options['default_doc_mode'] ?? 'base_only',
            'taxonomy_mapping' => isset($options['taxonomy_mapping'])
                ? wp_json_encode($options['taxonomy_mapping'])
                : null,
            'updated_at' => $now
        ];

        if ($existing) {
            return $wpdb->update( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
                $this->table_name,
                $data,
                ['post_id' => $post_id],
                ['%d', '%s', '%d', '%s', '%s', '%s'],
                ['%d']
            ) !== false;
        } else {
            $data['created_at'] = $now;
            return $wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
                $this->table_name,
                $data,
                ['%d', '%s', '%d', '%s', '%s', '%s', '%s']
            ) !== false;
        }
    }

    /**
     * Disable post as KB source
     */
    public function disable(int $post_id): bool
    {
        global $wpdb;
        return $wpdb->update( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $this->table_name,
            ['enabled' => 0, 'updated_at' => current_time('mysql')],
            ['post_id' => $post_id],
            ['%d', '%s'],
            ['%d']
        ) !== false;
    }

    /**
     * Delete KB source
     */
    public function delete(int $post_id): bool
    {
        global $wpdb;
        return $wpdb->delete( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $this->table_name,
            ['post_id' => $post_id],
            ['%d']
        ) !== false;
    }

    /**
     * Get all enabled KB sources
     */
    public function getAllEnabled(): array
    {
        global $wpdb;
        return $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare('SELECT * FROM %i WHERE enabled = 1 ORDER BY updated_at DESC', $this->table_name)
        );
    }
}

/**
 * KB Generated Repository - manages smartcloud_ai_kit_kb_generated table
 */
class KBGeneratedRepository
{
    private string $table_name;

    public function __construct()
    {
        global $wpdb;
        $this->table_name = $wpdb->prefix . 'smartcloud_ai_kit_kb_generated';
    }

    /**
     * Get all generated sections for a post
     */
    public function getByPost(int $post_id): array
    {
        global $wpdb;
        return $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                'SELECT * FROM %i WHERE post_id = %d ORDER BY sort_order ASC',
                $this->table_name,
                $post_id
            )
        );
    }

    /**
     * Get all generated sections for a specific document
     */
    public function getByDoc(int $post_id, string $doc_id): array
    {
        global $wpdb;
        return $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                'SELECT * FROM %i WHERE post_id = %d AND doc_id = %s ORDER BY sort_order ASC',
                $this->table_name,
                $post_id,
                $doc_id
            )
        );
    }

    /**
     * Get a specific section
     */
    public function getSection(int $post_id, string $doc_id, string $section_id): ?object
    {
        global $wpdb;
        return $wpdb->get_row( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                'SELECT * FROM %i WHERE post_id = %d AND doc_id = %s AND section_id = %s',
                $this->table_name,
                $post_id,
                $doc_id,
                $section_id
            )
        );
    }

    /**
     * Save/update generated section
     */
    public function saveSection(array $section): bool
    {
        global $wpdb;

        $existing = $this->getSection(
            $section['post_id'],
            $section['doc_id'],
            $section['section_id']
        );

        $data = [
            'post_id' => $section['post_id'],
            'doc_id' => $section['doc_id'],
            'section_id' => $section['section_id'],
            'mode' => $section['mode'] ?? 'inherit',
            'sort_order' => $section['sort_order'] ?? 0,
            'title' => $section['title'] ?? null,
            'category' => $section['category'] ?? null,
            'subcategory' => $section['subcategory'] ?? null,
            'tags_json' => isset($section['tags']) ? wp_json_encode($section['tags']) : null,
            'md' => $section['md'] ?? '',
            'origin_hash' => $section['origin_hash'] ?? hash('sha256', $section['md'] ?? ''),
            'generated_at' => $section['generated_at'] ?? current_time('mysql'),
            'source_updated_at' => $section['source_updated_at'] ?? current_time('mysql'),
            'extra_meta_json' => isset($section['extra_meta']) ? wp_json_encode($section['extra_meta']) : null
        ];

        if ($existing) {
            return $wpdb->update( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
                $this->table_name,
                $data,
                [
                    'post_id' => $section['post_id'],
                    'doc_id' => $section['doc_id'],
                    'section_id' => $section['section_id']
                ],
                ['%d', '%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s'],
                ['%d', '%s', '%s']
            ) !== false;
        } else {
            return $wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
                $this->table_name,
                $data,
                ['%d', '%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s']
            ) !== false;
        }
    }

    /**
     * Delete all generated sections for a post
     */
    public function deleteByPost(int $post_id): bool
    {
        global $wpdb;
        return $wpdb->delete( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $this->table_name,
            ['post_id' => $post_id],
            ['%d']
        ) !== false;
    }

    /**
     * Delete all generated sections for a document
     */
    public function deleteByDoc(int $post_id, string $doc_id): bool
    {
        global $wpdb;
        return $wpdb->delete( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $this->table_name,
            ['post_id' => $post_id, 'doc_id' => $doc_id],
            ['%d', '%s']
        ) !== false;
    }
}

/**
 * KB Override Repository - manages smartcloud_ai_kit_kb_overrides table
 */
class KBOverrideRepository
{
    private string $table_name;

    public function __construct()
    {
        global $wpdb;
        $this->table_name = $wpdb->prefix . 'smartcloud_ai_kit_kb_overrides';
    }

    /**
     * Get override for a section
     */
    public function get(int $post_id, string $doc_id, string $section_id): ?object
    {
        global $wpdb;
        return $wpdb->get_row( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                'SELECT * FROM %i WHERE post_id = %d AND doc_id = %s AND section_id = %s',
                $this->table_name,
                $post_id,
                $doc_id,
                $section_id
            )
        );
    }

    /**
     * Get all overrides for a document
     */
    public function getByDoc(int $post_id, string $doc_id): array
    {
        global $wpdb;
        return $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                'SELECT * FROM %i WHERE post_id = %d AND doc_id = %s',
                $this->table_name,
                $post_id,
                $doc_id
            )
        );
    }

    /**
     * Save or update override
     */
    public function save(array $override): bool
    {
        global $wpdb;

        $existing = $this->get(
            $override['post_id'],
            $override['doc_id'],
            $override['section_id']
        );

        $data = [
            'post_id' => $override['post_id'],
            'doc_id' => $override['doc_id'],
            'section_id' => $override['section_id'],
            'override_md' => $override['override_md'] ?? '',
            'override_meta_json' => isset($override['override_meta'])
                ? wp_json_encode($override['override_meta'])
                : null,
            'locked' => isset($override['locked']) ? (int) $override['locked'] : 1,
            'origin_hash_at_override' => $override['origin_hash_at_override'] ?? '',
            'updated_at' => current_time('mysql')
        ];

        if ($existing) {
            return $wpdb->update( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
                $this->table_name,
                $data,
                [
                    'post_id' => $override['post_id'],
                    'doc_id' => $override['doc_id'],
                    'section_id' => $override['section_id']
                ],
                ['%d', '%s', '%s', '%s', '%s', '%d', '%s', '%s'],
                ['%d', '%s', '%s']
            ) !== false;
        } else {
            return $wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
                $this->table_name,
                $data,
                ['%d', '%s', '%s', '%s', '%s', '%d', '%s', '%s']
            ) !== false;
        }
    }

    /**
     * Delete override
     */
    public function delete(int $post_id, string $doc_id, string $section_id): bool
    {
        global $wpdb;
        return $wpdb->delete( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $this->table_name,
            [
                'post_id' => $post_id,
                'doc_id' => $doc_id,
                'section_id' => $section_id
            ],
            ['%d', '%s', '%s']
        ) !== false;
    }

    /**
     * Delete all overrides for a post
     */
    public function deleteByPost(int $post_id): bool
    {
        global $wpdb;
        return $wpdb->delete( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $this->table_name,
            ['post_id' => $post_id],
            ['%d']
        ) !== false;
    }
}

/**
 * KB Publish State Repository - manages smartcloud_ai_kit_kb_publish_state table
 */
class KBPublishStateRepository
{
    private string $table_name;

    public function __construct()
    {
        global $wpdb;
        $this->table_name = $wpdb->prefix . 'smartcloud_ai_kit_kb_publish_state';
    }

    /**
     * Get publish state for a document
     */
    public function get(int $post_id, string $doc_id): ?object
    {
        global $wpdb;
        return $wpdb->get_row( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                'SELECT * FROM %i WHERE post_id = %d AND doc_id = %s',
                $this->table_name,
                $post_id,
                $doc_id
            )
        );
    }

    /**
     * Get all publish states for a post
     */
    public function getByPost(int $post_id): array
    {
        global $wpdb;
        return $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                'SELECT * FROM %i WHERE post_id = %d',
                $this->table_name,
                $post_id
            )
        );
    }

    /**
     * Save or update publish state
     */
    public function save(array $state): bool
    {
        global $wpdb;

        $existing = $this->get($state['post_id'], $state['doc_id']);

        $data = [
            'post_id' => $state['post_id'],
            'doc_id' => $state['doc_id'],
            'effective_hash' => $state['effective_hash'] ?? '',
            'last_published_at' => $state['last_published_at'] ?? null,
            'last_backend_status' => $state['last_backend_status'] ?? null,
            'last_backend_details_json' => isset($state['last_backend_details'])
                ? wp_json_encode($state['last_backend_details'])
                : null
        ];

        if ($existing) {
            return $wpdb->update( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
                $this->table_name,
                $data,
                [
                    'post_id' => $state['post_id'],
                    'doc_id' => $state['doc_id']
                ],
                ['%d', '%s', '%s', '%s', '%s', '%s'],
                ['%d', '%s']
            ) !== false;
        } else {
            return $wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
                $this->table_name,
                $data,
                ['%d', '%s', '%s', '%s', '%s', '%s']
            ) !== false;
        }
    }

    /**
     * Delete publish state
     */
    public function delete(int $post_id, string $doc_id): bool
    {
        global $wpdb;
        return $wpdb->delete( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $this->table_name,
            ['post_id' => $post_id, 'doc_id' => $doc_id],
            ['%d', '%s']
        ) !== false;
    }

    /**
     * Delete all publish states for a post
     */
    public function deleteByPost(int $post_id): bool
    {
        global $wpdb;
        return $wpdb->delete( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $this->table_name,
            ['post_id' => $post_id],
            ['%d']
        ) !== false;
    }

    /**
     * Check if document needs publishing (hash changed)
     */
    public function needsPublish(int $post_id, string $doc_id, string $current_hash): bool
    {
        $state = $this->get($post_id, $doc_id);

        if (!$state) {
            return true; // Never published
        }

        return $state->effective_hash !== $current_hash;
    }
}
