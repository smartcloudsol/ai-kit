<?php
/**
 * KB Admin - Main Controller Class
 *
 * Manages KB (Knowledge Base) sources, generation, overrides, and publishing.
 */

namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

if (!defined('ABSPATH')) {
    exit;
}

// Load dependencies
if (file_exists(SMARTCLOUD_AI_KIT_PATH . 'admin/kb/schema.php')) {
    require_once SMARTCLOUD_AI_KIT_PATH . 'admin/kb/schema.php';
}
if (file_exists(SMARTCLOUD_AI_KIT_PATH . 'admin/kb/repository.php')) {
    require_once SMARTCLOUD_AI_KIT_PATH . 'admin/kb/repository.php';
}
if (file_exists(SMARTCLOUD_AI_KIT_PATH . 'admin/kb/repositorydependencies.php')) {
    require_once SMARTCLOUD_AI_KIT_PATH . 'admin/kb/repositorydependencies.php';
}

use SmartCloud\WPSuite\AiKit\Logger;

class Admin
{
    private Repository $sources;
    private KBGeneratedRepository $generated;
    private KBOverrideRepository $overrides;
    private KBPublishStateRepository $publish_state;
    private RepositoryDependencies $dependencies;

    public function __construct()
    {
        $this->sources = new Repository();
        $this->generated = new KBGeneratedRepository();
        $this->overrides = new KBOverrideRepository();
        $this->publish_state = new KBPublishStateRepository();
        $this->dependencies = new RepositoryDependencies();
    }

    /**
     * Register all hooks
     */
    public function registerHooks(): void
    {
        // Plugin activation/deactivation
        register_activation_hook(SMARTCLOUD_AI_KIT_PATH . 'smartcloud-ai-kit.php', [$this, 'onActivate']);

        // Database version check - run immediately since plugins_loaded already fired
        $this->checkDatabaseVersion();

        // Admin notices for migration
        add_action('admin_notices', [$this, 'showMigrationNotice']);

        // AJAX handlers
        add_action('wp_ajax_smartcloud_ai_kit_run_db_migration', [$this, 'ajaxRunMigration']);
        add_action('wp_ajax_smartcloud_ai_kit_dismiss_migration_notice', [$this, 'ajaxDismissNotice']);
        add_action('wp_ajax_smartcloud_ai_kit_bulk_edit_kb_source', [$this, 'ajaxBulkEditKbSource']);

        // Post lifecycle hooks
        add_action('save_post', [$this, 'onPostSave'], 10, 3);
        add_action('before_delete_post', [$this, 'onPostDelete'], 10, 2);

        // Quick Edit & Bulk Edit integration
        add_action('admin_enqueue_scripts', [$this, 'enqueueQuickEditScript']);
        add_action('quick_edit_custom_box', [$this, 'renderQuickEditField'], 10, 2);
        add_action('bulk_edit_custom_box', [$this, 'renderBulkEditField'], 10, 2);
        add_action('manage_posts_custom_column', [$this, 'renderKbColumn'], 10, 2);
        add_action('manage_pages_custom_column', [$this, 'renderKbColumn'], 10, 2);
        add_filter('manage_posts_columns', [$this, 'addKbColumn']);
        add_filter('manage_pages_columns', [$this, 'addKbColumn']);

        // Bulk actions
        add_filter('bulk_actions-edit-post', [$this, 'addBulkActions']);
        add_filter('bulk_actions-edit-page', [$this, 'addBulkActions']);
        add_filter('handle_bulk_actions-edit-post', [$this, 'handleBulkActions'], 10, 3);
        add_filter('handle_bulk_actions-edit-page', [$this, 'handleBulkActions'], 10, 3);
        add_action('admin_notices', [$this, 'showBulkActionNotices']);

        foreach ($this->getKbAdminListPostTypes() as $post_type) {
            if ($post_type === 'post' || $post_type === 'page') {
                continue;
            }

            add_action("manage_{$post_type}_posts_custom_column", [$this, 'renderKbColumn'], 10, 2);
            add_filter("manage_{$post_type}_posts_columns", [$this, 'addKbColumn']);
            add_filter("bulk_actions-edit-{$post_type}", [$this, 'addBulkActions']);
            add_filter("handle_bulk_actions-edit-{$post_type}", [$this, 'handleBulkActions'], 10, 3);
        }

        // REST API
        add_action('rest_api_init', [$this, 'registerRestRoutes']);

        // Note: KB Admin UI is rendered as a tab in the main AI-Kit Settings page
        // No separate admin menu is needed
    }

    /**
     * Plugin activation - create tables
     */
    public function onActivate(): void
    {
        Schema::createTables();
        update_option('smartcloud_ai_kit_db_version', SMARTCLOUD_AI_KIT_DB_VERSION);
    }

    /**
     * Check database version and create/update tables if needed
     * This runs on every plugin load to handle updates when the plugin was already active
     */
    public function checkDatabaseVersion(): void
    {
        $current_db_version = get_option('smartcloud_ai_kit_db_version', '0');

        // If DB version is outdated or not set, check if we should auto-migrate
        if (version_compare($current_db_version, SMARTCLOUD_AI_KIT_DB_VERSION, '<')) {
            // Check if auto-migration is allowed (not dismissed)
            $dismissed = get_option('smartcloud_ai_kit_db_migration_dismissed', false);

            if (!$dismissed) {
                // Auto-migrate in background (safe operation with dbDelta)
                $this->runMigration();
            }
        }
    }

    /**
     * Run database migration
     */
    private function runMigration(): bool
    {
        try {
            Schema::createTables();
            update_option('smartcloud_ai_kit_db_version', SMARTCLOUD_AI_KIT_DB_VERSION);
            update_option('smartcloud_ai_kit_db_migration_dismissed', false);
            return true;
        } catch (\Exception $e) {
            Logger::error('DB Migration Error: ' . $e->getMessage(), [
                'exception' => get_class($e),
                'trace' => $e->getTraceAsString()
            ]);
            return false;
        }
    }

    /**
     * Show admin notice for database migration
     */
    public function showMigrationNotice(): void
    {
        // Only show to administrators
        if (!current_user_can('manage_options')) {
            return;
        }

        $current_db_version = get_option('smartcloud_ai_kit_db_version', '0');
        $dismissed = get_option('smartcloud_ai_kit_db_migration_dismissed', false);

        // Show notice if migration is needed and not dismissed
        if (version_compare($current_db_version, SMARTCLOUD_AI_KIT_DB_VERSION, '<') && !$dismissed) {
            $migration_status = get_option('smartcloud_ai_kit_db_migration_status', 'pending');

            if ($migration_status === 'running') {
                echo '<div class="notice notice-info"><p>';
                echo '<strong>' . esc_html__('AI-Kit:', 'smartcloud-ai-kit') . '</strong> ';
                echo esc_html__('Database migration is running in the background...', 'smartcloud-ai-kit');
                echo '</p></div>';
                return;
            }

            echo '<div class="notice notice-warning is-dismissible aikit-migration-notice" data-nonce="' . esc_attr(wp_create_nonce('smartcloud_ai_kit_migration')) . '">';
            echo '<p><strong>' . esc_html__('AI-Kit Database Update Required', 'smartcloud-ai-kit') . '</strong></p>';
            echo '<p>' . esc_html__('AI-Kit needs to update its database structure for the new Knowledge Base Editor feature.', 'smartcloud-ai-kit') . '</p>';
            echo '<p>';
            echo '<button type="button" class="button button-primary" id="aikit-run-migration">' . esc_html__('Update Database Now', 'smartcloud-ai-kit') . '</button> ';
            echo '<button type="button" class="button" id="aikit-dismiss-migration">' . esc_html__('Remind Me Later', 'smartcloud-ai-kit') . '</button>';
            echo '</p></div>';

            // Add inline script for AJAX handling
            echo '<script>
            jQuery(document).ready(function($) {
                $("#aikit-run-migration").on("click", function() {
                    var btn = $(this);
                    btn.prop("disabled", true).text("' . esc_js(__('Updating...', 'smartcloud-ai-kit')) . '");

                    $.post(ajaxurl, {
                        action: "smartcloud_ai_kit_run_db_migration",
                        nonce: $(".aikit-migration-notice").data("nonce")
                    }, function(response) {
                        if (response.success) {
                            $(".aikit-migration-notice").removeClass("notice-warning").addClass("notice-success");
                            $(".aikit-migration-notice p").html("<strong>" + response.data.message + "</strong>");
                            setTimeout(function() { location.reload(); }, 2000);
                        } else {
                            alert(response.data.message);
                            btn.prop("disabled", false).text("' . esc_js(__('Update Database Now', 'smartcloud-ai-kit')) . '");
                        }
                    });
                });

                $("#aikit-dismiss-migration").on("click", function() {
                    $.post(ajaxurl, {
                        action: "smartcloud_ai_kit_dismiss_migration_notice",
                        nonce: $(".aikit-migration-notice").data("nonce")
                    }, function() {
                        $(".aikit-migration-notice").fadeOut();
                    });
                });
            });
            </script>';
        }
    }

    /**
     * AJAX handler: Run database migration
     */
    public function ajaxRunMigration(): void
    {
        check_ajax_referer('smartcloud_ai_kit_migration', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => __('Permission denied.', 'smartcloud-ai-kit')]);
        }

        update_option('smartcloud_ai_kit_db_migration_status', 'running');

        $success = $this->runMigration();

        if ($success) {
            delete_option('smartcloud_ai_kit_db_migration_status');
            wp_send_json_success([
                'message' => __('Database updated successfully!', 'smartcloud-ai-kit'),
                'version' => SMARTCLOUD_AI_KIT_DB_VERSION
            ]);
        } else {
            update_option('smartcloud_ai_kit_db_migration_status', 'failed');
            wp_send_json_error([
                'message' => __('Database update failed. Please check error logs.', 'smartcloud-ai-kit')
            ]);
        }
    }

    /**
     * AJAX handler: Dismiss migration notice
     */
    public function ajaxDismissNotice(): void
    {
        check_ajax_referer('smartcloud_ai_kit_migration', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error();
        }

        update_option('smartcloud_ai_kit_db_migration_dismissed', true);
        wp_send_json_success();
    }

    /**
     * AJAX handler: Bulk Edit KB Source
     * Fallback handler for when WordPress native bulk edit doesn't work properly
     */
    public function ajaxBulkEditKbSource(): void
    {
        check_ajax_referer('smartcloud_ai_kit_kb_quick_edit', 'nonce');

        if (!current_user_can('edit_posts')) {
            wp_send_json_error(['message' => 'Insufficient permissions']);
        }

        $post_ids = isset($_POST['post_ids']) ? array_map('intval', wp_unslash($_POST['post_ids'])) : [];
        $action = isset($_POST['kb_action']) ? sanitize_text_field(wp_unslash($_POST['kb_action'])) : '';

        if (empty($post_ids) || empty($action)) {
            wp_send_json_error(['message' => 'Missing post IDs or action']);
        }

        $success_count = 0;
        $errors = [];

        foreach ($post_ids as $post_id) {
            $post = get_post($post_id);
            if (!$post) {
                $errors[] = "Post $post_id not found";
                continue;
            }

            if (!$this->isKbAdminListPostType($post->post_type)) {
                $errors[] = "Post $post_id has unsupported post type {$post->post_type}";
                continue;
            }

            if (!current_user_can('edit_post', $post_id)) {
                $errors[] = "Cannot edit post $post_id";
                continue;
            }

            try {
                if ($action === 'enable') {
                    $this->sources->enable($post_id, $post->post_type, [
                        'default_doc_mode' => 'separate_doc',
                        'taxonomy_mapping' => null
                    ]);
                    $this->regeneratePost($post_id);
                    $success_count++;
                } elseif ($action === 'disable') {
                    $this->sources->disable($post_id);

                    $kb_status = $this->calculate_kb_publish_status($post_id);
                    if ($kb_status !== 'published') {
                        $this->publish_state->deleteByPost($post_id);
                    }
                    $success_count++;
                }
            } catch (\Exception $e) {
                $errors[] = "Error processing post $post_id: " . $e->getMessage();
            }
        }

        wp_send_json_success([
            'message' => sprintf('Updated %d posts', $success_count),
            'success_count' => $success_count,
            'errors' => $errors
        ]);
    }

    /**
     * Hook: save_post - trigger regeneration for KB sources
     */
    public function onPostSave(int $post_id, \WP_Post $post, bool $update): void
    {
        // Skip autosaves and revisions
        if (wp_is_post_autosave($post_id) || wp_is_post_revision($post_id)) {
            return;
        }

        // Handle Quick Edit / Bulk Edit KB source actions
        if (isset($_POST['smartcloud_ai_kit_kb_source_action']) || isset($_POST['smartcloud_ai_kit_kb_source_bulk_action'])) {
            if (!$this->isKbAdminListPostType($post->post_type)) {
                return;
            }

            // Verify nonce for Quick Edit (uses _inline_edit nonce)
            // Bulk Edit posts don't have _inline_edit nonce, but they do have standard WP nonces
            if (isset($_POST['_inline_edit'])) {
                if (!wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['_inline_edit'])), 'inlineeditnonce')) {
                    return;
                }
            }
            // For bulk edit, WordPress handles nonce verification automatically
            // Just check if we're in admin context
            if (!is_admin()) {
                return;
            }

            $action = isset($_POST['smartcloud_ai_kit_kb_source_action'])
                ? sanitize_text_field(wp_unslash($_POST['smartcloud_ai_kit_kb_source_action']))
                : sanitize_text_field(wp_unslash($_POST['smartcloud_ai_kit_kb_source_bulk_action'] ?? ''));

            // Skip if no action selected (bulk edit "No Change" option)
            if (empty($action)) {
                return;
            }

            // Debug logging
            Logger::info(
                sprintf(
                    'KB source quick/bulk edit action for post %d: %s',
                    $post_id,
                    $action
                ),
                ['post_id' => $post_id, 'action' => $action, 'is_bulk' => isset($_POST['smartcloud_ai_kit_kb_source_bulk_action'])]
            );

            if ($action === 'enable') {
                // Enable KB source with default settings
                $this->sources->enable($post_id, $post->post_type, [
                    'default_doc_mode' => 'separate_doc',
                    'taxonomy_mapping' => null
                ]);

                // Regenerate KB content
                $this->regeneratePost($post_id);
            } elseif ($action === 'disable') {
                // Disable the KB source
                $this->sources->disable($post_id);

                // Check if post has published content in backend (S3)
                $kb_status = $this->calculate_kb_publish_status($post_id);

                if ($kb_status === 'published') {
                    // Keep publish_state so user can see published content in KB Admin UI
                    // and delete from S3 using their credentials via frontend
                    // The disabled source will appear in KB sources list as "disabled but published"
                    Logger::info(
                        sprintf(
                            'KB source disabled for post %d via quick/bulk edit - publish_state preserved (has published content)',
                            $post_id
                        ),
                        ['post_id' => $post_id, 'kb_status' => $kb_status]
                    );
                } else {
                    // No published content or only pending/error - safe to delete publish_state
                    $this->publish_state->deleteByPost($post_id);
                    Logger::info(
                        sprintf(
                            'KB source disabled for post %d via quick/bulk edit - publish_state cleared (no published content)',
                            $post_id
                        ),
                        ['post_id' => $post_id, 'kb_status' => $kb_status]
                    );
                }
            }

            return;
        }

        // Check if this post is a KB source
        if ($this->sources->isEnabled($post_id)) {
            // This is a KB source - regenerate its content
            $this->regeneratePost($post_id);
        } else {
            // This is NOT a KB source - check if any KB sources reference this post
            $dependent_sources = $this->dependencies->getSourcesReferencingPost($post_id);

            if (!empty($dependent_sources)) {
                Logger::info(
                    sprintf(
                        'Post %d changed - invalidating %d dependent KB source(s)',
                        $post_id,
                        count($dependent_sources)
                    ),
                    [
                        'changed_post_id' => $post_id,
                        'dependent_sources' => $dependent_sources
                    ]
                );

                foreach ($dependent_sources as $source_post_id) {
                    // Delete publish_state to mark as needs review
                    $this->publish_state->deleteByPost($source_post_id);

                    Logger::info(
                        sprintf(
                            'KB source %d invalidated (needs re-review) due to referenced post %d change',
                            $source_post_id,
                            $post_id
                        ),
                        [
                            'kb_source_post_id' => $source_post_id,
                            'referenced_post_id' => $post_id
                        ]
                    );

                    // Optional: Auto-regenerate the dependent KB source
                    // Uncomment if you want automatic regeneration instead of just invalidation
                    $this->regeneratePost($source_post_id);
                }
            }
        }
    }

    /**
     * Hook: before_delete_post - cleanup KB data
     */
    public function onPostDelete(int $post_id, ?\WP_Post $post): void
    {
        if (!$post) {
            return;
        }

        // Clean up all KB data for this post
        $this->sources->delete($post_id);
        $this->generated->deleteByPost($post_id);
        $this->overrides->deleteByPost($post_id);
        $this->publish_state->deleteByPost($post_id);

        // Clean up dependencies (both as source and as referenced post)
        $this->dependencies->deleteBySource($post_id);
        $this->dependencies->deleteByReferencedPost($post_id);
    }

    /**
     * Register REST API routes
     */
    public function registerRestRoutes(): void
    {
        $namespace = SMARTCLOUD_AI_KIT_SLUG . '/v1';

        // Get all KB sources
        register_rest_route($namespace, '/kb/sources', [
            'methods' => 'GET',
            'callback' => [$this, 'restGetSources'],
            'permission_callback' => [$this, 'checkManagePermission'],
            'args' => [
                'page' => [
                    'required' => false,
                    'type' => 'integer',
                    'default' => 1,
                    'minimum' => 1,
                    'sanitize_callback' => 'absint'
                ],
                'per_page' => [
                    'required' => false,
                    'type' => 'integer',
                    'default' => 20,
                    'minimum' => 1,
                    'maximum' => 100,
                    'sanitize_callback' => 'absint'
                ],
                'search' => [
                    'required' => false,
                    'type' => 'string',
                    'default' => '',
                    'sanitize_callback' => 'sanitize_text_field'
                ],
                'status' => [
                    'required' => false,
                    'type' => 'string',
                    'default' => 'all',
                    'enum' => ['all', 'publish', 'draft'],
                    'sanitize_callback' => 'sanitize_text_field'
                ],
                'type' => [
                    'required' => false,
                    'type' => 'string',
                    'default' => 'all',
                    'sanitize_callback' => 'sanitize_text_field'
                ],
                'kb_status' => [
                    'required' => false,
                    'type' => 'string',
                    'default' => 'all',
                    'enum' => ['all', 'needs_review', 'ready_to_publish', 'published'],
                    'sanitize_callback' => 'sanitize_text_field'
                ]
            ]
        ]);

        // Search posts for KB sources
        register_rest_route($namespace, '/kb/posts/search', [
            'methods' => 'GET',
            'callback' => [$this, 'restSearchPosts'],
            'permission_callback' => [$this, 'checkManagePermission'],
            'args' => [
                'query' => [
                    'required' => false,
                    'type' => 'string',
                    'default' => '',
                    'sanitize_callback' => 'sanitize_text_field'
                ],
                'limit' => [
                    'required' => false,
                    'type' => 'integer',
                    'default' => 10,
                    'sanitize_callback' => 'absint'
                ]
            ]
        ]);

        // Get KB data for a specific post
        register_rest_route($namespace, '/kb/posts/(?P<post_id>\d+)', [
            'methods' => 'GET',
            'callback' => [$this, 'restGetPostKbData'],
            'permission_callback' => [$this, 'checkManagePermission'],
            'args' => [
                'post_id' => [
                    'required' => true,
                    'validate_callback' => function ($param) {
                        return is_numeric($param);
                    }
                ]
            ]
        ]);

        // Enable/disable post as KB source
        register_rest_route($namespace, '/kb/posts/(?P<post_id>\d+)/source', [
            'methods' => 'PUT',
            'callback' => [$this, 'restUpdateSource'],
            'permission_callback' => [$this, 'checkManagePermission'],
            'args' => [
                'post_id' => [
                    'required' => true,
                    'validate_callback' => function ($param) {
                        return is_numeric($param);
                    }
                ]
            ]
        ]);

        // Save override for a section
        register_rest_route($namespace, '/kb/posts/(?P<post_id>\d+)/overrides', [
            'methods' => 'PUT',
            'callback' => [$this, 'restSaveOverride'],
            'permission_callback' => [$this, 'checkManagePermission'],
            'args' => [
                'post_id' => [
                    'required' => true,
                    'validate_callback' => function ($param) {
                        return is_numeric($param);
                    }
                ]
            ]
        ]);

        // Delete override
        register_rest_route($namespace, '/kb/posts/(?P<post_id>\d+)/overrides', [
            'methods' => 'DELETE',
            'callback' => [$this, 'restDeleteOverride'],
            'permission_callback' => [$this, 'checkManagePermission'],
            'args' => [
                'post_id' => [
                    'required' => true,
                    'validate_callback' => function ($param) {
                        return is_numeric($param);
                    }
                ]
            ]
        ]);

        // Regenerate KB content for post
        register_rest_route($namespace, '/kb/posts/(?P<post_id>\d+)/regenerate', [
            'methods' => 'POST',
            'callback' => [$this, 'restRegenerate'],
            'permission_callback' => [$this, 'checkManagePermission'],
            'args' => [
                'post_id' => [
                    'required' => true,
                    'validate_callback' => function ($param) {
                        return is_numeric($param);
                    }
                ]
            ]
        ]);

        // Publish KB document (deprecated, use publish-state instead)
        register_rest_route($namespace, '/kb/posts/(?P<post_id>\d+)/publish', [
            'methods' => 'POST',
            'callback' => [$this, 'restPublish'],
            'permission_callback' => [$this, 'checkManagePermission'],
            'args' => [
                'post_id' => [
                    'required' => true,
                    'validate_callback' => function ($param) {
                        return is_numeric($param);
                    }
                ]
            ]
        ]);

        // Update publish state after backend upload
        register_rest_route($namespace, '/kb/posts/(?P<post_id>\d+)/publish-state', [
            'methods' => 'PUT',
            'callback' => [$this, 'restUpdatePublishState'],
            'permission_callback' => [$this, 'checkManagePermission'],
            'args' => [
                'post_id' => [
                    'required' => true,
                    'validate_callback' => function ($param) {
                        return is_numeric($param);
                    }
                ]
            ]
        ]);

        // Delete publish state after backend deletion (e.g., S3 cleanup)
        register_rest_route($namespace, '/kb/posts/(?P<post_id>\d+)/publish-state', [
            'methods' => 'DELETE',
            'callback' => [$this, 'restDeletePublishState'],
            'permission_callback' => [$this, 'checkManagePermission'],
            'args' => [
                'post_id' => [
                    'required' => true,
                    'validate_callback' => function ($param) {
                        return is_numeric($param);
                    }
                ]
            ]
        ]);

        // Mark post as reviewed (approve all docs for publishing)
        register_rest_route($namespace, '/kb/posts/(?P<post_id>\d+)/approve', [
            'methods' => 'POST',
            'callback' => [$this, 'restApproveForPublishing'],
            'permission_callback' => [$this, 'checkManagePermission'],
            'args' => [
                'post_id' => [
                    'required' => true,
                    'validate_callback' => function ($param) {
                        return is_numeric($param);
                    }
                ]
            ]
        ]);

        // Get KB settings
        register_rest_route($namespace, '/kb/settings', [
            'methods' => 'GET',
            'callback' => [$this, 'restGetSettings'],
            'permission_callback' => [$this, 'checkManagePermission']
        ]);

        // Update KB settings
        register_rest_route($namespace, '/kb/settings', [
            'methods' => 'PUT',
            'callback' => [$this, 'restUpdateSettings'],
            'permission_callback' => [$this, 'checkManagePermission']
        ]);

        // Note: debug_logging_enabled is managed in the main admin.php at root level

        // Derive metadata config structure from KB sources
        register_rest_route($namespace, '/kb/metadata-config/derive', [
            'methods' => 'GET',
            'callback' => [$this, 'restDeriveMetadataFromSources'],
            'permission_callback' => [$this, 'checkManagePermission']
        ]);
    }

    /**
     * Permission callback for REST endpoints
     */
    public function checkManagePermission(): bool
    {
        return current_user_can('manage_options');
    }

    /**
     * REST: Get all KB sources
     */
    public function restGetSources(\WP_REST_Request $request): \WP_REST_Response
    {
        global $wpdb;

        $page = $request->get_param('page');
        $per_page = $request->get_param('per_page');
        $search = $request->get_param('search');
        $status_filter = $request->get_param('status');
        $type_filter = $request->get_param('type');

        $offset = ($page - 1) * $per_page;

        // Build query
        $sources_table = $wpdb->prefix . 'smartcloud_ai_kit_kb_sources';
        $posts_table = $wpdb->posts;
        $generated_table = $wpdb->prefix . 'smartcloud_ai_kit_kb_generated';
        $publish_state_table = $wpdb->prefix . 'smartcloud_ai_kit_kb_publish_state';
        $kb_status_filter = $request->get_param('kb_status');

        // Include both enabled sources AND disabled sources that still have published content
        // This allows users to delete published content from the backend even after disabling the source
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name is safe (wpdb prefix + constant)
        $where_clauses = [
            "(s.enabled = 1 OR EXISTS (
            SELECT 1 
            FROM {$publish_state_table} ps 
            WHERE ps.post_id = s.post_id 
            AND ps.last_backend_status = 'success'
        ))"
        ];
        $where_values = [];

        // Search filter
        if (!empty($search)) {
            $where_clauses[] = '(p.post_title LIKE %s OR p.ID = %d)';
            $where_values[] = '%' . $wpdb->esc_like($search) . '%';
            $where_values[] = is_numeric($search) ? intval($search) : 0;
        }

        // Status filter
        if ($status_filter !== 'all') {
            $where_clauses[] = 'p.post_status = %s';
            $where_values[] = $status_filter;
        }

        // Type filter
        if ($type_filter !== 'all') {
            $where_clauses[] = 'p.post_type = %s';
            $where_values[] = $type_filter;
        }

        $where_sql = implode(' AND ', $where_clauses);

        // If we have a KB status filter, we need to fetch ALL results first, then filter in PHP
        // because kb_publish_status is calculated in PHP, not in SQL
        $needs_kb_status_filtering = $kb_status_filter && $kb_status_filter !== 'all';

        if ($needs_kb_status_filtering) {
            // Get ALL results without pagination (we'll paginate in PHP after filtering)
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- $where_sql contains safe placeholders
            $results_sql_template = "SELECT s.*, p.post_title, p.post_status, p.post_type
                                     FROM %i s
                                     INNER JOIN %i p ON s.post_id = p.ID
                                     WHERE {$where_sql}
                                     ORDER BY s.updated_at DESC";

            $query_params = array_merge([$sources_table, $posts_table], $where_values);
            // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Template contains interpolated WHERE clause with placeholders
            $results_sql = $wpdb->prepare($results_sql_template, ...$query_params);

            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter
            $sources = $wpdb->get_results($results_sql);
        } else {
            // No KB status filter - use normal pagination in SQL
            // Count total (use %i for table names - WordPress 6.2+)
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- $where_sql contains safe placeholders
            $count_sql_template = "SELECT COUNT(*) 
                                   FROM %i s
                                   INNER JOIN %i p ON s.post_id = p.ID
                                   WHERE {$where_sql}";

            $count_params = array_merge([$sources_table, $posts_table], $where_values);
            // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Template contains interpolated WHERE clause with placeholders
            $count_sql = $wpdb->prepare($count_sql_template, ...$count_params);

            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter
            $total = (int) $wpdb->get_var($count_sql);

            // Get paginated results with KB publish status calculation
            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- $where_sql contains safe placeholders
            $results_sql_template = "SELECT s.*, p.post_title, p.post_status, p.post_type
                                     FROM %i s
                                     INNER JOIN %i p ON s.post_id = p.ID
                                     WHERE {$where_sql}
                                     ORDER BY s.updated_at DESC
                                     LIMIT %d OFFSET %d";

            $query_params = array_merge([$sources_table, $posts_table], $where_values, [$per_page, $offset]);
            // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Template contains interpolated WHERE clause with placeholders
            $results_sql = $wpdb->prepare($results_sql_template, ...$query_params);

            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter
            $sources = $wpdb->get_results($results_sql);
        }

        $result = [];
        foreach ($sources as $source) {
            $post_id = (int) $source->post_id;

            // Calculate KB publish status
            $kb_publish_status = $this->calculate_kb_publish_status($post_id);

            // Filter by KB status if specified
            if ($kb_status_filter && $kb_status_filter !== 'all' && $kb_status_filter !== $kb_publish_status) {
                continue;
            }

            $result[] = [
                'post_id' => $post_id,
                'post_type' => $source->post_type,
                'post_type_label' => $this->getKbPostTypeLabel($source->post_type),
                'post_title' => $source->post_title,
                'post_status' => $source->post_status,
                'enabled' => (bool) $source->enabled,
                'is_disabled_but_published' => !(bool) $source->enabled && $kb_publish_status === 'published',
                'default_doc_mode' => $source->default_doc_mode,
                'updated_at' => $source->updated_at,
                'kb_publish_status' => $kb_publish_status
            ];
        }

        // If we filtered by KB status, we need to:
        // 1. Calculate total from filtered results
        // 2. Paginate in PHP (not in SQL)
        if ($needs_kb_status_filtering) {
            $total = count($result);

            // Sort by KB publish status if needed
            // (for filtered results, sorting was already implicit in the filter)

            // Paginate in PHP
            $result = array_slice($result, $offset, $per_page);
        } else {
            // Sort by KB publish status if no KB status filter (needs_review first, then ready_to_publish, then published)
            usort($result, function ($a, $b) {
                $statusOrder = ['needs_review' => 1, 'ready_to_publish' => 2, 'published' => 3];
                $orderA = $statusOrder[$a['kb_publish_status']] ?? 4;
                $orderB = $statusOrder[$b['kb_publish_status']] ?? 4;
                return $orderA - $orderB;
            });
        }

        return new \WP_REST_Response([
            'items' => $result,
            'post_type_options' => $this->getKbPostTypeOptions(),
            'total' => $total,
            'page' => $page,
            'per_page' => $per_page,
            'total_pages' => ceil($total / $per_page)
        ], 200);
    }

    /**
     * Calculate KB publish status for a post
     * @return string 'needs_review' | 'ready_to_publish' | 'published'
     */
    private function calculate_kb_publish_status(int $post_id): string
    {
        global $wpdb;

        $generated_table = $wpdb->prefix . 'smartcloud_ai_kit_kb_generated';
        $publish_state_table = $wpdb->prefix . 'smartcloud_ai_kit_kb_publish_state';

        // Get all distinct doc_ids for this post (use %i for table names)
        $doc_ids = $wpdb->get_col( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                'SELECT DISTINCT doc_id FROM %i WHERE post_id = %d',
                $generated_table,
                $post_id
            )
        );

        if (empty($doc_ids)) {
            return 'needs_review'; // No content generated
        }

        // Get publish states for all docs
        $publish_states = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->prepare(
                'SELECT doc_id, effective_hash, last_backend_status
                 FROM %i
                 WHERE post_id = %d',
                $publish_state_table,
                $post_id
            )
        );

        // Build a map of doc_id => publish_state
        $state_map = [];
        foreach ($publish_states as $state) {
            $state_map[$state->doc_id] = $state;
        }

        $has_needs_review = false;
        $has_ready_to_publish = false;
        $has_published = false;

        // Check each document
        foreach ($doc_ids as $doc_id) {
            if (!isset($state_map[$doc_id])) {
                // No publish state for this doc - needs review
                $has_needs_review = true;
            } else {
                $state = $state_map[$doc_id];
                if ($state->last_backend_status === 'success') {
                    // Successfully published to backend
                    $has_published = true;
                } else {
                    // Status is 'pending' or 'error' - ready to publish
                    $has_ready_to_publish = true;
                }
            }
        }

        // Priority: needs_review > ready_to_publish > published
        if ($has_needs_review) {
            return 'needs_review';
        }
        if ($has_ready_to_publish) {
            return 'ready_to_publish';
        }
        if ($has_published) {
            return 'published';
        }

        // Fallback (shouldn't reach here)
        return 'needs_review';
    }

    /**
     * REST: Search posts for KB sources
     * Searches by post title or ID
     */
    public function restSearchPosts(\WP_REST_Request $request): \WP_REST_Response
    {
        $query = $request->get_param('query') ?? '';
        $limit = $request->get_param('limit') ?? 10;

        $args = [
            'post_type' => $this->getKbSearchablePostTypes(),
            'post_status' => 'publish',
            'posts_per_page' => min($limit, 50),
            'orderby' => 'title',
            'order' => 'ASC',
            'no_found_rows' => true,
            'update_post_meta_cache' => false,
            'update_post_term_cache' => false,
        ];

        // If query is numeric, search by ID too
        if (is_numeric($query)) {
            $args['post__in'] = [absint($query)];
            $args['orderby'] = 'post__in';
        } else if (!empty($query)) {
            $args['s'] = $query;
        }

        $wp_query = new \WP_Query($args);
        $result = [];

        foreach ($wp_query->posts as $post) {
            // Get excerpt
            $excerpt = has_excerpt($post->ID)
                ? get_the_excerpt($post->ID)
                : wp_trim_words($post->post_content, 20, '...');

            // Get featured image thumbnail (small size)
            $featured_image_url = null;
            if (has_post_thumbnail($post->ID)) {
                $thumbnail = wp_get_attachment_image_src(get_post_thumbnail_id($post->ID), 'thumbnail');
                if ($thumbnail) {
                    $featured_image_url = $thumbnail[0];
                }
            }

            $result[] = [
                'post_id' => $post->ID,
                'post_title' => $post->post_title,
                'post_type' => $post->post_type,
                'post_type_label' => $this->getKbPostTypeLabel($post->post_type),
                'post_status' => $post->post_status,
                'post_excerpt' => $excerpt,
                'featured_image_url' => $featured_image_url,
            ];
        }

        return new \WP_REST_Response($result, 200);
    }

    /**
     * Resolve the post types that can be searched and enabled as KB sources.
     *
     * Includes normal UI-managed content types and Elementor templates, while
     * excluding internal/system records that should never appear in the picker.
     *
     * @return string[]
     */
    private function getKbSearchablePostTypes(): array
    {
        $post_types = get_post_types(['show_ui' => true], 'names');

        if (post_type_exists('elementor_library')) {
            $post_types[] = 'elementor_library';
        }

        $excluded = [
            'attachment',
            'custom_css',
            'customize_changeset',
            'nav_menu_item',
            'oembed_cache',
            'revision',
            'user_request',
            'wp_block',
            'wp_font_face',
            'wp_font_family',
            'wp_global_styles',
            'wp_navigation',
            'wp_template_part',
        ];

        $post_types = array_values(array_unique(array_diff($post_types, $excluded)));

        return apply_filters('smartcloud_ai_kit_kb_search_post_types', $post_types);
    }

    /**
     * Resolve the post types that support KB source controls on edit.php screens.
     *
     * @return string[]
     */
    private function getKbAdminListPostTypes(): array
    {
        $post_types = $this->getKbSearchablePostTypes();

        return apply_filters('smartcloud_ai_kit_kb_admin_post_types', $post_types);
    }

    /**
     * Check whether a post type supports KB source controls in wp-admin lists.
     */
    private function isKbAdminListPostType(string $post_type): bool
    {
        return in_array($post_type, $this->getKbAdminListPostTypes(), true);
    }

    /**
     * Get the human-readable label for a post type.
     */
    private function getKbPostTypeLabel(string $post_type): string
    {
        $post_type_object = get_post_type_object($post_type);

        if ($post_type_object && !empty($post_type_object->labels->singular_name)) {
            return $post_type_object->labels->singular_name;
        }

        if ($post_type_object && !empty($post_type_object->label)) {
            return $post_type_object->label;
        }

        return $post_type;
    }

    /**
     * Build Select options for supported KB post types.
     *
     * @return array<int, array{value:string,label:string}>
     */
    private function getKbPostTypeOptions(): array
    {
        $options = [];

        foreach ($this->getKbAdminListPostTypes() as $post_type) {
            $options[] = [
                'value' => $post_type,
                'label' => $this->getKbPostTypeLabel($post_type),
            ];
        }

        usort($options, static function (array $left, array $right): int {
            return strcasecmp($left['label'], $right['label']);
        });

        return $options;
    }

    /**
     * Build the effective metadata for a section, applying metadata overrides
     * even when the markdown itself is not locked.
     *
     * @param object $section
     * @param object|null $override
     * @return array<string, mixed>
     */
    private function getEffectiveSectionMetadata(object $section, ?object $override): array
    {
        $metadata = [];
        $extra_meta = $section->extra_meta_json ? json_decode($section->extra_meta_json, true) : null;

        if ($section->title) {
            $metadata['title'] = $section->title;
        }
        if (is_array($extra_meta) && !empty($extra_meta['description']) && is_string($extra_meta['description'])) {
            $metadata['description'] = $extra_meta['description'];
        }
        if (is_array($extra_meta) && !empty($extra_meta['postUrl']) && is_string($extra_meta['postUrl'])) {
            $metadata['postUrl'] = $extra_meta['postUrl'];
        }
        if ($section->category) {
            $metadata['category'] = $section->category;
        }
        if ($section->subcategory) {
            $metadata['subcategory'] = $section->subcategory;
        }
        if ($section->tags_json) {
            $metadata['tags'] = json_decode($section->tags_json, true);
        }

        if ($override && $override->override_meta_json) {
            $override_meta = json_decode($override->override_meta_json, true);
            if (is_array($override_meta)) {
                $metadata = array_merge($metadata, $override_meta);
            }
        }

        return $metadata;
    }

    /**
     * Resolve the effective markdown for a section.
     *
     * Only locked overrides replace the generated markdown.
     *
     * @param object $section
     * @param object|null $override
     */
    private function getEffectiveSectionMarkdown(object $section, ?object $override): string
    {
        if ($override && $override->locked) {
            return $override->override_md;
        }

        return $section->md;
    }

    /**
     * Build the final markdown and metadata payload for a document.
     *
     * @param array<int, object> $sections
     * @return array{markdown:string, metadata:array<string, mixed>}
     */
    private function buildEffectiveDocumentPayload(int $post_id, string $doc_id, array $sections, bool $acknowledge_locked_overrides = false): array
    {
        $final_md = '';
        $final_meta = [];

        foreach ($sections as $section) {
            if ($section->mode === 'exclude') {
                continue;
            }

            $override = $this->overrides->get($post_id, $doc_id, $section->section_id);

            if ($acknowledge_locked_overrides && $override && $override->locked && $override->origin_hash_at_override !== $section->origin_hash) {
                $this->overrides->save([
                    'post_id' => $post_id,
                    'doc_id' => $doc_id,
                    'section_id' => $section->section_id,
                    'override_md' => $override->override_md,
                    'override_meta' => $override->override_meta_json
                        ? json_decode($override->override_meta_json, true)
                        : null,
                    'locked' => $override->locked,
                    'origin_hash_at_override' => $section->origin_hash
                ]);
            }

            $final_md .= $this->getEffectiveSectionMarkdown($section, $override) . "\n\n";
            $final_meta = array_merge($final_meta, $this->getEffectiveSectionMetadata($section, $override));
        }

        return [
            'markdown' => $final_md,
            'metadata' => $final_meta,
        ];
    }

    /**
     * REST: Get KB data for a specific post
     */
    public function restGetPostKbData(\WP_REST_Request $request): \WP_REST_Response
    {
        $post_id = (int) $request['post_id'];

        $post = get_post($post_id);
        if (!$post) {
            return new \WP_REST_Response(['error' => 'Post not found'], 404);
        }

        $source = $this->sources->getByPostId($post_id);
        $generated = $this->generated->getByPost($post_id);
        $publish_states = $this->publish_state->getByPost($post_id);

        // Group by doc_id
        $docs = [];
        foreach ($generated as $section) {
            $doc_id = $section->doc_id;

            if (!isset($docs[$doc_id])) {
                $docs[$doc_id] = [
                    'doc_id' => $doc_id,
                    'sections' => [],
                    'publish_state' => null
                ];
            }

            // Get override if exists
            $override = $this->overrides->get($post_id, $doc_id, $section->section_id);

            $section_data = [
                'section_id' => $section->section_id,
                'mode' => $section->mode,
                'sort_order' => (int) $section->sort_order,
                'title' => $section->title,
                'category' => $section->category,
                'subcategory' => $section->subcategory,
                'tags' => $section->tags_json ? json_decode($section->tags_json, true) : null,
                'md' => $section->md,
                'origin_hash' => $section->origin_hash,
                'generated_at' => $section->generated_at,
                'extra_meta' => $section->extra_meta_json
                    ? json_decode($section->extra_meta_json, true)
                    : null,
                'has_override' => (bool) $override,
                'needs_review' => false
            ];

            if ($override) {
                $section_data['override'] = [
                    'override_md' => $override->override_md,
                    'override_meta' => $override->override_meta_json
                        ? json_decode($override->override_meta_json, true)
                        : null,
                    'locked' => (bool) $override->locked,
                    'origin_hash_at_override' => $override->origin_hash_at_override,
                    'updated_at' => $override->updated_at
                ];

                // Check if needs review (generated changed since override)
                $section_data['needs_review'] = $override->locked
                    && $override->origin_hash_at_override !== $section->origin_hash;
            }

            $docs[$doc_id]['sections'][] = $section_data;
        }

        // Add publish states
        foreach ($publish_states as $state) {
            if (isset($docs[$state->doc_id])) {
                $docs[$state->doc_id]['publish_state'] = [
                    'effective_hash' => $state->effective_hash,
                    'last_published_at' => $state->last_published_at,
                    'last_backend_status' => $state->last_backend_status,
                    'last_backend_details' => $state->last_backend_details_json
                        ? json_decode($state->last_backend_details_json, true)
                        : null
                ];
            }
        }

        return new \WP_REST_Response([
            'post_id' => $post_id,
            'post_title' => $post->post_title,
            'post_excerpt' => has_excerpt($post_id)
                ? get_the_excerpt($post_id)
                : wp_trim_words(wp_strip_all_tags($post->post_content), 30, '...'),
            'post_type' => $post->post_type,
            'post_url' => get_permalink($post_id),
            'source' => $source ? [
                'enabled' => (bool) $source->enabled,
                'default_doc_mode' => $source->default_doc_mode,
                'taxonomy_mapping' => $source->taxonomy_mapping
                    ? json_decode($source->taxonomy_mapping, true)
                    : null
            ] : null,
            'docs' => array_values($docs)
        ], 200);
    }

    /**
     * REST: Enable/disable post as KB source
     */
    public function restUpdateSource(\WP_REST_Request $request): \WP_REST_Response
    {
        $post_id = (int) $request['post_id'];
        $params = $request->get_json_params();

        $post = get_post($post_id);
        if (!$post) {
            return new \WP_REST_Response(['error' => 'Post not found'], 404);
        }

        $enabled = $params['enabled'] ?? true;

        if ($enabled) {
            $options = [
                'default_doc_mode' => $params['default_doc_mode'] ?? 'base_only',
                'taxonomy_mapping' => $params['taxonomy_mapping'] ?? null
            ];

            $success = $this->sources->enable($post_id, $post->post_type, $options);

            if ($success) {
                // Check if this is a "re-enable after disable" scenario
                // by checking for existing publish_state (indicates previously published content)
                $existing_publish_states = $this->publish_state->getByPost($post_id);

                if (!empty($existing_publish_states)) {
                    // This is a "mark as resolved" scenario for disabled but published source
                    // Preserve existing publish_state and don't regenerate
                    // (regeneration would delete publish_state)
                    Logger::info(
                        sprintf(
                            'Re-enabled disabled but published KB source for post %d - publish_state preserved',
                            $post_id
                        ),
                        ['post_id' => $post_id, 'publish_states_count' => count($existing_publish_states)]
                    );
                } else {
                    // No publish_state exists - check if we need to generate initial content
                    $existing_content = $this->generated->getByPost($post_id);
                    if (empty($existing_content)) {
                        // First time enabling - generate initial content
                        $this->regeneratePost($post_id);
                    }
                    // If re-enabling (already has content but no publish_state), 
                    // preserve existing generated content
                    // User can manually regenerate if needed
                }
            }
        } else {
            $success = $this->sources->disable($post_id);

            // Auto-cleanup publish_state when disable is requested
            // This handles the "delete published KB source" workflow where:
            // 1. Frontend deletes documents from S3 (using user credentials)
            // 2. Frontend calls this disable endpoint
            // 3. We cleanup publish_state automatically so source disappears from list
            //
            // Frontend can explicitly control this with delete_publish_state parameter:
            // - delete_publish_state=true: Always delete (default for most cases)
            // - delete_publish_state=false: Keep publish_state (advanced use case)
            $should_delete_publish_state = $params['delete_publish_state'] ?? true;

            if ($success && $should_delete_publish_state) {
                $this->publish_state->deleteByPost($post_id);
                Logger::info(
                    sprintf('Publish state deleted for disabled KB source post %d', $post_id),
                    ['post_id' => $post_id, 'requested_by' => 'rest_api']
                );
            }
        }

        return new \WP_REST_Response([
            'success' => $success,
            'message' => $success
                ? __('KB source updated successfully.', 'smartcloud-ai-kit')
                : __('Failed to update KB source.', 'smartcloud-ai-kit')
        ], $success ? 200 : 500);
    }

    /**
     * REST: Save override for a section
     */
    public function restSaveOverride(\WP_REST_Request $request): \WP_REST_Response
    {
        $post_id = (int) $request['post_id'];
        $params = $request->get_json_params();

        // Check if source is enabled - disabled sources cannot be modified
        $source = $this->sources->getByPostId($post_id);
        if (!$source || !$source->enabled) {
            return new \WP_REST_Response([
                'error' => 'Cannot modify disabled KB source',
                'message' => __('This KB source is disabled. Re-enable it first to make changes.', 'smartcloud-ai-kit')
            ], 403);
        }

        $doc_id = $params['doc_id'] ?? '';
        $section_id = $params['section_id'] ?? '';

        if (empty($doc_id) || empty($section_id)) {
            return new \WP_REST_Response(['error' => 'doc_id and section_id required'], 400);
        }

        // Get the generated section to capture current hash
        $generated = $this->generated->getSection($post_id, $doc_id, $section_id);
        if (!$generated) {
            return new \WP_REST_Response(['error' => 'Generated section not found'], 404);
        }

        $override_md = $params['override_md'] ?? '';

        $override = [
            'post_id' => $post_id,
            'doc_id' => $doc_id,
            'section_id' => $section_id,
            'override_md' => $override_md,
            'override_meta' => $params['override_meta'] ?? null,
            'locked' => $params['locked'] ?? true,
            'origin_hash_at_override' => $generated->origin_hash
        ];

        // Check if source is disabled - if so, re-enable it automatically
        $source = $this->sources->getByPostId($post_id);
        $was_disabled = $source && !$source->enabled;

        if ($was_disabled) {
            $post = get_post($post_id);
            if ($post) {
                // Prepare taxonomy_mapping (decode JSON if stored as string)
                $taxonomy_mapping = null;
                if (!empty($source->taxonomy_mapping)) {
                    $taxonomy_mapping = is_string($source->taxonomy_mapping)
                        ? json_decode($source->taxonomy_mapping, true)
                        : $source->taxonomy_mapping;
                }

                // Re-enable the source with existing settings
                $enable_success = $this->sources->enable($post_id, $post->post_type, [
                    'default_doc_mode' => $source->default_doc_mode ?? 'separate_doc',
                    'taxonomy_mapping' => $taxonomy_mapping
                ]);

                Logger::info(
                    sprintf(
                        'Auto-enabled disabled KB source for post %d after override save - enable_success: %s',
                        $post_id,
                        $enable_success ? 'true' : 'false'
                    ),
                    [
                        'post_id' => $post_id,
                        'doc_id' => $doc_id,
                        'section_id' => $section_id,
                        'source_enabled_before' => $source->enabled,
                        'enable_result' => $enable_success
                    ]
                );
            }
        }

        $success = $this->overrides->save($override);

        if ($success) {
            // Only delete publish state if source was NOT disabled
            // If it was disabled, preserve publish_state (keeps published status)
            if (!$was_disabled) {
                // Delete publish state for this document since content changed
                // This resets the KB status back to 'needs_review'
                $this->publish_state->delete($post_id, $doc_id);
            }
        }

        return new \WP_REST_Response([
            'success' => $success,
            'message' => $success
                ? __('Override saved successfully.', 'smartcloud-ai-kit')
                : __('Failed to save override.', 'smartcloud-ai-kit'),
            'debug' => [
                'was_disabled' => $was_disabled,
                'source_enabled_after' => $was_disabled ? $this->sources->isEnabled($post_id) : null,
                'publish_state_deleted' => !$was_disabled
            ]
        ], $success ? 200 : 500);
    }

    /**
     * REST: Delete override
     */
    public function restDeleteOverride(\WP_REST_Request $request): \WP_REST_Response
    {
        $post_id = (int) $request['post_id'];
        $params = $request->get_json_params();

        // Check if source is enabled - disabled sources cannot be modified
        $source = $this->sources->getByPostId($post_id);
        if (!$source || !$source->enabled) {
            return new \WP_REST_Response([
                'error' => 'Cannot modify disabled KB source',
                'message' => __('This KB source is disabled. Re-enable it first to make changes.', 'smartcloud-ai-kit')
            ], 403);
        }

        $doc_id = $params['doc_id'] ?? '';
        $section_id = $params['section_id'] ?? '';

        if (empty($doc_id) || empty($section_id)) {
            return new \WP_REST_Response(['error' => 'doc_id and section_id required'], 400);
        }

        // Check if source is disabled - if so, re-enable it automatically
        $source = $this->sources->getByPostId($post_id);
        $was_disabled = $source && !$source->enabled;

        if ($was_disabled) {
            $post = get_post($post_id);
            if ($post) {
                // Prepare taxonomy_mapping (decode JSON if stored as string)
                $taxonomy_mapping = null;
                if (!empty($source->taxonomy_mapping)) {
                    $taxonomy_mapping = is_string($source->taxonomy_mapping)
                        ? json_decode($source->taxonomy_mapping, true)
                        : $source->taxonomy_mapping;
                }

                // Re-enable the source with existing settings
                $enable_success = $this->sources->enable($post_id, $post->post_type, [
                    'default_doc_mode' => $source->default_doc_mode ?? 'separate_doc',
                    'taxonomy_mapping' => $taxonomy_mapping
                ]);

                Logger::info(
                    sprintf(
                        'Auto-enabled disabled KB source for post %d after override delete - enable_success: %s',
                        $post_id,
                        $enable_success ? 'true' : 'false'
                    ),
                    [
                        'post_id' => $post_id,
                        'doc_id' => $doc_id,
                        'section_id' => $section_id,
                        'source_enabled_before' => $source->enabled,
                        'enable_result' => $enable_success
                    ]
                );
            }
        }

        $success = $this->overrides->delete($post_id, $doc_id, $section_id);

        if ($success) {
            // Only delete publish state if source was NOT disabled
            // If it was disabled, preserve publish_state (keeps published status)
            if (!$was_disabled) {
                // Delete publish state for this document since content changed
                // This resets the KB status back to 'needs_review'
                $this->publish_state->delete($post_id, $doc_id);
            }
        }

        return new \WP_REST_Response([
            'success' => $success,
            'message' => $success
                ? __('Override deleted successfully.', 'smartcloud-ai-kit')
                : __('Failed to delete override.', 'smartcloud-ai-kit'),
            'debug' => [
                'was_disabled' => $was_disabled,
                'source_enabled_after' => $was_disabled ? $this->sources->isEnabled($post_id) : null,
                'publish_state_deleted' => !$was_disabled
            ]
        ], $success ? 200 : 500);
    }

    /**
     * REST: Regenerate KB content for post
     */
    public function restRegenerate(\WP_REST_Request $request): \WP_REST_Response
    {
        $post_id = (int) $request['post_id'];
        $params = $request->get_json_params();

        $post = get_post($post_id);
        if (!$post) {
            return new \WP_REST_Response(['error' => 'Post not found'], 404);
        }

        // Check if this is a re-enable request
        $is_reenable = $params['reenable'] ?? false;

        $source = $this->sources->getByPostId($post_id);

        if (!$source || !$source->enabled) {
            // Disabled source - only allow if explicit re-enable
            if (!$is_reenable) {
                return new \WP_REST_Response([
                    'error' => 'Cannot regenerate disabled KB source',
                    'message' => __('This KB source is disabled. Re-enable it first to regenerate content.', 'smartcloud-ai-kit')
                ], 403);
            }

            // Re-enable the source
            $taxonomy_mapping = null;
            if (!empty($source->taxonomy_mapping)) {
                $taxonomy_mapping = is_string($source->taxonomy_mapping)
                    ? json_decode($source->taxonomy_mapping, true)
                    : $source->taxonomy_mapping;
            }

            $enable_success = $this->sources->enable($post_id, $post->post_type, [
                'default_doc_mode' => $source->default_doc_mode ?? 'separate_doc',
                'taxonomy_mapping' => $taxonomy_mapping
            ]);

            if (!$enable_success) {
                return new \WP_REST_Response([
                    'error' => 'Failed to re-enable source',
                    'message' => __('Failed to re-enable KB source.', 'smartcloud-ai-kit')
                ], 500);
            }

            Logger::info(
                sprintf('Re-enabled disabled KB source for post %d', $post_id),
                ['post_id' => $post_id]
            );
        }

        // Regenerate with optional preserve_publish_state flag
        $preserve_publish_state = $params['preserve_publish_state'] ?? false;
        $success = $this->regeneratePost($post_id, $preserve_publish_state);

        return new \WP_REST_Response([
            'success' => $success,
            'message' => $success
                ? __('KB content regenerated successfully.', 'smartcloud-ai-kit')
                : __('Failed to regenerate KB content.', 'smartcloud-ai-kit')
        ], $success ? 200 : 500);
    }

    /**
     * REST: Publish KB document
     */
    public function restPublish(\WP_REST_Request $request): \WP_REST_Response
    {
        $post_id = (int) $request['post_id'];
        $params = $request->get_json_params();
        $doc_id = $params['doc_id'] ?? '';

        if (empty($doc_id)) {
            return new \WP_REST_Response(['error' => 'doc_id required'], 400);
        }

        // Check if source is enabled - disabled sources cannot be published
        $source = $this->sources->getByPostId($post_id);
        if (!$source || !$source->enabled) {
            return new \WP_REST_Response([
                'error' => 'Cannot publish disabled KB source',
                'message' => __('This KB source is disabled. Re-enable it first to publish.', 'smartcloud-ai-kit')
            ], 403);
        }

        $result = $this->publishDocument($post_id, $doc_id);

        return new \WP_REST_Response($result, $result['success'] ? 200 : 500);
    }

    /**
     * REST: Update publish state after backend upload
     * Called by frontend after successful backend document upload
     */
    public function restUpdatePublishState(\WP_REST_Request $request): \WP_REST_Response
    {
        $post_id = (int) $request['post_id'];
        $params = $request->get_json_params();

        // Expecting array of uploaded documents from backend
        $uploaded_docs = $params['uploaded_documents'] ?? [];

        if (empty($uploaded_docs)) {
            return new \WP_REST_Response(['error' => 'uploaded_documents required'], 400);
        }

        $results = [];
        $all_success = true;

        foreach ($uploaded_docs as $doc_info) {
            $doc_id = $doc_info['doc_id'] ?? '';

            if (empty($doc_id)) {
                $results[] = ['doc_id' => 'unknown', 'success' => false, 'error' => 'Missing doc_id'];
                $all_success = false;
                continue;
            }

            // Get all sections for this document to calculate effective hash
            $sections = $this->generated->getByDoc($post_id, $doc_id);

            if (empty($sections)) {
                $results[] = ['doc_id' => $doc_id, 'success' => false, 'error' => 'No sections found'];
                $all_success = false;
                continue;
            }

            $payload = $this->buildEffectiveDocumentPayload($post_id, $doc_id, $sections);
            $final_md = $payload['markdown'];
            $final_meta = $payload['metadata'];

            // Calculate effective hash
            $effective_hash = hash('sha256', $final_md . wp_json_encode($final_meta));

            // Save publish state
            $state = [
                'post_id' => $post_id,
                'doc_id' => $doc_id,
                'effective_hash' => $effective_hash,
                'last_published_at' => current_time('mysql'),
                'last_backend_status' => 'success',
                'last_backend_details' => [
                    's3_key' => $doc_info['s3_key'] ?? null,
                    'length' => strlen($final_md),
                    'sections' => count($sections),
                    'uploaded_at' => $doc_info['uploaded_at'] ?? null,
                ]
            ];

            $success = $this->publish_state->save($state);

            $results[] = [
                'doc_id' => $doc_id,
                'success' => $success,
                'effective_hash' => $effective_hash
            ];

            if (!$success) {
                $all_success = false;
            }
        }

        return new \WP_REST_Response([
            'success' => $all_success,
            'message' => $all_success
                ? __('Publish state updated successfully.', 'smartcloud-ai-kit')
                : __('Some publish states failed to update.', 'smartcloud-ai-kit'),
            'results' => $results
        ], $all_success ? 200 : 207); // 207 Multi-Status for partial success
    }

    /**
     * REST: Delete publish state after backend deletion
     * Called by frontend after successfully deleting documents from S3
     * This removes the publish_state records, resetting the KB status to 'needs_review' or removing from list
     */
    public function restDeletePublishState(\WP_REST_Request $request): \WP_REST_Response
    {
        $post_id = (int) $request['post_id'];
        $params = $request->get_json_params();

        $post = get_post($post_id);
        if (!$post) {
            return new \WP_REST_Response(['error' => 'Post not found'], 404);
        }

        // Optional: array of specific doc_ids to delete
        // If not provided, delete all publish states for this post
        $doc_ids = $params['doc_ids'] ?? null;

        if ($doc_ids && is_array($doc_ids)) {
            // Delete specific documents
            $all_success = true;
            $results = [];

            foreach ($doc_ids as $doc_id) {
                $success = $this->publish_state->delete($post_id, $doc_id);
                $results[] = [
                    'doc_id' => $doc_id,
                    'success' => $success
                ];

                if (!$success) {
                    $all_success = false;
                }
            }

            return new \WP_REST_Response([
                'success' => $all_success,
                'message' => $all_success
                    ? __('Publish states deleted successfully.', 'smartcloud-ai-kit')
                    : __('Some publish states failed to delete.', 'smartcloud-ai-kit'),
                'results' => $results
            ], $all_success ? 200 : 207);
        } else {
            // Delete all publish states for this post
            $success = $this->publish_state->deleteByPost($post_id);

            return new \WP_REST_Response([
                'success' => $success,
                'message' => $success
                    ? __('All publish states deleted successfully.', 'smartcloud-ai-kit')
                    : __('Failed to delete publish states.', 'smartcloud-ai-kit')
            ], $success ? 200 : 500);
        }
    }

    /**
     * REST: Mark post as reviewed (approve all docs for publishing)
     * Creates publish_state entries with current hashes but without backend upload
     * This changes status from 'needs_review' to 'ready_to_publish'
     */
    public function restApproveForPublishing(\WP_REST_Request $request): \WP_REST_Response
    {
        $post_id = (int) $request['post_id'];

        $post = get_post($post_id);
        if (!$post) {
            return new \WP_REST_Response(['error' => 'Post not found'], 404);
        }

        // Check if source is enabled - disabled sources cannot be approved
        $source = $this->sources->getByPostId($post_id);
        if (!$source || !$source->enabled) {
            return new \WP_REST_Response([
                'error' => 'Cannot approve disabled KB source',
                'message' => __('This KB source is disabled. Re-enable it first to approve for publishing.', 'smartcloud-ai-kit')
            ], 403);
        }

        // Get all generated sections grouped by doc_id
        $all_sections = $this->generated->getByPost($post_id);

        if (empty($all_sections)) {
            return new \WP_REST_Response([
                'error' => 'No KB content found for this post'
            ], 400);
        }

        // Group by doc_id
        $docs = [];
        foreach ($all_sections as $section) {
            $doc_id = $section->doc_id;
            if (!isset($docs[$doc_id])) {
                $docs[$doc_id] = [];
            }
            $docs[$doc_id][] = $section;
        }

        $results = [];
        $all_success = true;

        // For each document, calculate effective hash and create publish_state
        foreach ($docs as $doc_id => $sections) {
            $payload = $this->buildEffectiveDocumentPayload($post_id, $doc_id, $sections, true);
            $final_md = $payload['markdown'];
            $final_meta = $payload['metadata'];

            // Calculate effective hash
            $effective_hash = hash('sha256', $final_md . wp_json_encode($final_meta));

            // Create publish state with 'pending' status (not yet uploaded to backend)
            $state = [
                'post_id' => $post_id,
                'doc_id' => $doc_id,
                'effective_hash' => $effective_hash,
                'last_published_at' => null, // Not yet published
                'last_backend_status' => 'pending', // Approved but not uploaded
                'last_backend_details' => [
                    'approved_at' => current_time('mysql'),
                    'approved_by' => get_current_user_id(),
                    'sections' => count($sections)
                ]
            ];

            $success = $this->publish_state->save($state);

            $results[] = [
                'doc_id' => $doc_id,
                'success' => $success,
                'effective_hash' => $effective_hash
            ];

            if (!$success) {
                $all_success = false;
            }
        }

        return new \WP_REST_Response([
            'success' => $all_success,
            'message' => $all_success
                ? __('Post approved for publishing. Status changed to "Ready to Publish".', 'smartcloud-ai-kit')
                : __('Some documents failed to approve.', 'smartcloud-ai-kit'),
            'results' => $results,
            'docs_approved' => count($results)
        ], $all_success ? 200 : 207);
    }

    /**
     * Regenerate KB content for a post
     * 
     * @param int $post_id The post ID to regenerate
     * @param bool $preserve_publish_state If true, keeps existing publish_state (for re-enabling disabled sources)
     */
    public function regeneratePost(int $post_id, bool $preserve_publish_state = false): bool
    {
        $post = get_post($post_id);
        if (!$post) {
            return false;
        }

        // Use the new content parser
        $parser = new Parser();

        try {
            $sections_by_doc = $parser->parsePost($post);
        } catch (\Exception $e) {
            Logger::error('KB Parser Error: ' . $e->getMessage(), [
                'post_id' => $post_id,
                'exception' => get_class($e)
            ]);
            return false;
        }

        // Delete old generated sections for this post
        $this->generated->deleteByPost($post_id);

        // Delete publish state records to reset status to 'needs_review'
        // When content changes, previous approval/publish status is no longer valid
        // UNLESS we're explicitly preserving it (e.g., during re-enable of disabled source)
        if (!$preserve_publish_state) {
            $this->publish_state->deleteByPost($post_id);
        }

        // Save all new sections
        $success = true;
        foreach ($sections_by_doc as $doc_id => $sections) {
            foreach ($sections as $section_data) {
                // Ensure tags are JSON encoded
                if (isset($section_data['tags']) && is_array($section_data['tags'])) {
                    $section_data['tags'] = $section_data['tags'];
                }

                // Save extra_meta as JSON
                if (isset($section_data['extra_meta'])) {
                    $section_data['extra_meta'] = $section_data['extra_meta'];
                }

                $result = $this->generated->saveSection($section_data);

                if (!$result) {
                    $success = false;
                    Logger::warning(
                        sprintf(
                            'Failed to save section %s for doc %s',
                            $section_data['section_id'],
                            $doc_id
                        ),
                        [
                            'post_id' => $post_id,
                            'doc_id' => $doc_id,
                            'section_id' => $section_data['section_id']
                        ]
                    );
                }
            }
        }

        // Store dependencies (post references extracted during parsing)
        $referenced_post_ids = $parser->getReferencedPostIds();
        if (!empty($referenced_post_ids)) {
            $deps_saved = $this->dependencies->storeDependencies($post_id, $referenced_post_ids);

            Logger::info(
                sprintf(
                    'Stored %d post reference(s) for KB source %d',
                    count($referenced_post_ids),
                    $post_id
                ),
                [
                    'kb_source_post_id' => $post_id,
                    'referenced_posts' => $referenced_post_ids,
                    'deps_saved' => $deps_saved
                ]
            );
        } else {
            // No references - clear existing dependencies
            $this->dependencies->deleteBySource($post_id);
        }

        return $success;
    }

    /**
     * Publish a KB document to backend
     */
    public function publishDocument(int $post_id, string $doc_id): array
    {
        // Get all sections for this document
        $sections = $this->generated->getByDoc($post_id, $doc_id);

        if (empty($sections)) {
            return [
                'success' => false,
                'message' => __('No sections found for document.', 'smartcloud-ai-kit')
            ];
        }

        $payload = $this->buildEffectiveDocumentPayload($post_id, $doc_id, $sections);
        $final_md = $payload['markdown'];
        $final_meta = $payload['metadata'];

        // Calculate effective hash
        $effective_hash = hash('sha256', $final_md . wp_json_encode($final_meta));

        $state = [
            'post_id' => $post_id,
            'doc_id' => $doc_id,
            'effective_hash' => $effective_hash,
            'last_published_at' => current_time('mysql'),
            'last_backend_status' => 'success',
            'last_backend_details' => [
                'length' => strlen($final_md),
                'sections' => count($sections)
            ]
        ];

        $success = $this->publish_state->save($state);

        return [
            'success' => $success,
            'message' => $success
                ? __('Document published successfully.', 'smartcloud-ai-kit')
                : __('Failed to publish document.', 'smartcloud-ai-kit'),
            'effective_hash' => $effective_hash
        ];
    }



    /**
     * Get KB settings
     */
    public function restGetSettings(\WP_REST_Request $request): \WP_REST_Response
    {
        $settings = [
            'base_url_override' => get_option('smartcloud_ai_kit_kb_base_url_override', '')
        ];

        return new \WP_REST_Response($settings, 200);
    }

    /**
     * Update KB settings
     */
    public function restUpdateSettings(\WP_REST_Request $request): \WP_REST_Response
    {
        $params = $request->get_json_params();

        $base_url_override = $params['base_url_override'] ?? '';

        // Sanitize and validate URL if provided
        if ($base_url_override !== '') {
            $base_url_override = esc_url_raw($base_url_override);
            // Remove trailing slash for consistency
            $base_url_override = rtrim($base_url_override, '/');
        }

        update_option('smartcloud_ai_kit_kb_base_url_override', $base_url_override);

        return new \WP_REST_Response([
            'success' => true,
            'message' => __('Settings saved successfully.', 'smartcloud-ai-kit'),
            'settings' => [
                'base_url_override' => $base_url_override
            ]
        ], 200);
    }

    /**
     * Derive metadata config structure from existing KB sources
     * Returns YAML format with categories, subcategories, and tags found in generated KB sections
     */
    public function restDeriveMetadataFromSources(\WP_REST_Request $request): \WP_REST_Response
    {
        $categories = [];
        $tags_set = [];
        $sources = $this->sources->getAllEnabled();
        $analyzed_sections = 0;

        foreach ($sources as $source) {
            $sections = $this->generated->getByPost((int) $source->post_id);

            foreach ($sections as $section) {
                if (($section->mode ?? 'inherit') === 'exclude') {
                    continue;
                }

                $override = $this->overrides->get(
                    (int) $source->post_id,
                    (string) $section->doc_id,
                    (string) $section->section_id
                );
                $metadata = $this->getEffectiveSectionMetadata($section, $override);

                $category = isset($metadata['category']) && is_string($metadata['category'])
                    ? trim($metadata['category'])
                    : '';
                $subcategory = isset($metadata['subcategory']) && is_string($metadata['subcategory'])
                    ? trim($metadata['subcategory'])
                    : '';
                $tags = is_array($metadata['tags'] ?? null) ? $metadata['tags'] : [];

                if ($category !== '') {
                    if (!isset($categories[$category])) {
                        $categories[$category] = [];
                    }

                    if ($subcategory !== '' && !in_array($subcategory, $categories[$category], true)) {
                        $categories[$category][] = $subcategory;
                    }
                }

                foreach ($tags as $tag) {
                    if (!is_string($tag)) {
                        continue;
                    }

                    $normalized_tag = trim($tag);
                    if ($normalized_tag === '') {
                        continue;
                    }

                    $tags_set[$normalized_tag] = true;
                }

                if ($category !== '' || $subcategory !== '' || !empty($tags)) {
                    $analyzed_sections++;
                }
            }
        }

        ksort($categories, SORT_NATURAL | SORT_FLAG_CASE);
        foreach ($categories as &$subcategories) {
            sort($subcategories, SORT_NATURAL | SORT_FLAG_CASE);
        }
        unset($subcategories);

        // Build YAML structure
        $yaml_lines = [];
        $yaml_lines[] = 'allowedCategories:';

        foreach ($categories as $category => $subcategories) {
            $yaml_lines[] = "  {$category}:";
            if (empty($subcategories)) {
                $yaml_lines[] = "    - Overview";
            } else {
                foreach ($subcategories as $subcategory) {
                    $yaml_lines[] = "    - {$subcategory}";
                }
            }
        }

        $yaml_lines[] = 'allowedTags:';
        if (!empty($tags_set)) {
            $tags_array = array_keys($tags_set);
            usort($tags_array, 'strnatcasecmp');
            foreach ($tags_array as $tag) {
                $yaml_lines[] = "  - {$tag}";
            }
        }

        $yaml_lines[] = 'defaults:';
        $yaml_lines[] = '  requiresGrounding: true';
        $yaml_lines[] = '  allowFallbackWithoutKb: false';
        $yaml_lines[] = '  precision: true';

        $yaml_content = implode("\n", $yaml_lines);

        return new \WP_REST_Response([
            'success' => true,
            'yaml' => $yaml_content,
            'stats' => [
                'categories' => count($categories),
                'tags' => count($tags_set),
                'total_sections_analyzed' => $analyzed_sections
            ]
        ], 200);
    }

    // ===============================================
    // Quick Edit & Bulk Edit Integration
    // ===============================================

    /**
     * Add KB Source column to post list
     */
    public function addKbColumn(array $columns): array
    {
        // Insert after title column
        $new_columns = [];
        foreach ($columns as $key => $value) {
            $new_columns[$key] = $value;
            if ($key === 'title') {
                $new_columns['kb_source'] = __('KB Source', 'smartcloud-ai-kit');
            }
        }
        return $new_columns;
    }

    /**
     * Render KB Source column content
     */
    public function renderKbColumn(string $column_name, int $post_id): void
    {
        if ($column_name !== 'kb_source') {
            return;
        }

        $source = $this->sources->getByPostId($post_id);
        $enabled = $source && $source->enabled;

        if ($enabled) {
            echo '<span class="aikit-kb-status" style="color: #46b450; font-weight: 600;">✓ ' . esc_html__('Enabled', 'smartcloud-ai-kit') . '</span>';
        } else {
            echo '<span class="aikit-kb-status" style="color: #999;">—</span>';
        }

        // Store current state in hidden field for quick edit
        echo '<input type="hidden" class="aikit-kb-enabled-value" value="' . ($enabled ? '1' : '0') . '" />';
    }

    /**
     * Enqueue Quick Edit JavaScript
     */
    public function enqueueQuickEditScript(string $hook): void
    {
        // Only load on post list screens
        if (!in_array($hook, ['edit.php'], true)) {
            return;
        }

        // Check if we're on a supported post type
        $screen = get_current_screen();
        if (!$screen || !$this->isKbAdminListPostType((string) $screen->post_type)) {
            return;
        }

        $script_url = plugins_url('assets/js/kb-quick-edit.js', SMARTCLOUD_AI_KIT_PATH . 'smartcloud-ai-kit.php');
        wp_enqueue_script(
            'aikit-kb-quick-edit',
            $script_url,
            ['jquery', 'inline-edit-post'],
            '1.0.0',
            true
        );

        wp_localize_script('aikit-kb-quick-edit', 'aikitKBQuickEdit', [
            'nonce' => wp_create_nonce('smartcloud_ai_kit_kb_quick_edit'),
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'enabledText' => __('Enabled', 'smartcloud-ai-kit'),
            'disabledText' => __('Disabled', 'smartcloud-ai-kit'),
        ]);
    }

    /**
     * Render Quick Edit field
     */
    public function renderQuickEditField(string $column_name, string $post_type): void
    {
        if ($column_name !== 'kb_source') {
            return;
        }

        if (!$this->isKbAdminListPostType($post_type)) {
            return;
        }

        ?>
        <fieldset class="inline-edit-col-right inline-edit-kb-source">
            <div class="inline-edit-col">
                <label class="inline-edit-group">
                    <span class="title"><?php esc_html_e('KB Source', 'smartcloud-ai-kit'); ?></span>
                    <select name="smartcloud_ai_kit_kb_source_action" class="aikit-kb-source-select">
                        <option value=""><?php esc_html_e('— No Change —', 'smartcloud-ai-kit'); ?></option>
                        <option value="enable"><?php esc_html_e('Enable', 'smartcloud-ai-kit'); ?></option>
                        <option value="disable"><?php esc_html_e('Disable', 'smartcloud-ai-kit'); ?></option>
                    </select>
                </label>
            </div>
        </fieldset>
        <?php
    }

    /**
     * Render Bulk Edit field
     */
    public function renderBulkEditField(string $column_name, string $post_type): void
    {
        if ($column_name !== 'kb_source') {
            return;
        }

        if (!$this->isKbAdminListPostType($post_type)) {
            return;
        }

        ?>
        <fieldset class="inline-edit-col-right inline-edit-kb-source-bulk">
            <div class="inline-edit-col">
                <label class="inline-edit-group">
                    <span class="title"><?php esc_html_e('KB Source', 'smartcloud-ai-kit'); ?></span>
                    <select name="smartcloud_ai_kit_kb_source_bulk_action" class="aikit-kb-source-bulk-select">
                        <option value=""><?php esc_html_e('— No Change —', 'smartcloud-ai-kit'); ?></option>
                        <option value="enable"><?php esc_html_e('Enable', 'smartcloud-ai-kit'); ?></option>
                        <option value="disable"><?php esc_html_e('Disable', 'smartcloud-ai-kit'); ?></option>
                    </select>
                </label>
            </div>
        </fieldset>
        <?php
    }

    /**
     * Add custom bulk actions to post/page list
     */
    public function addBulkActions(array $actions): array
    {
        $actions['smartcloud_ai_kit_kb_enable'] = __('Enable as KB Source', 'smartcloud-ai-kit');
        $actions['smartcloud_ai_kit_kb_disable'] = __('Disable as KB Source', 'smartcloud-ai-kit');
        return $actions;
    }

    /**
     * Handle custom bulk actions
     */
    public function handleBulkActions(string $redirect_to, string $doaction, array $post_ids): string
    {
        if (!in_array($doaction, ['smartcloud_ai_kit_kb_enable', 'smartcloud_ai_kit_kb_disable'])) {
            return $redirect_to;
        }

        $processed = 0;

        foreach ($post_ids as $post_id) {
            $post = get_post($post_id);
            if (!$post) {
                continue;
            }

            if (!$this->isKbAdminListPostType($post->post_type)) {
                continue;
            }

            if ($doaction === 'smartcloud_ai_kit_kb_enable') {
                $this->sources->enable($post_id, $post->post_type, [
                    'default_doc_mode' => 'separate_doc',
                    'taxonomy_mapping' => null
                ]);
                $this->regeneratePost($post_id);
                $processed++;
            } elseif ($doaction === 'smartcloud_ai_kit_kb_disable') {
                $this->sources->disable($post_id);

                // Only delete publish_state if no published content in backend
                // If published, keep it so user can delete from S3 via KB Admin UI
                $kb_status = $this->calculate_kb_publish_status($post_id);
                if ($kb_status !== 'published') {
                    $this->publish_state->deleteByPost($post_id);
                }

                $processed++;
            }
        }

        $redirect_to = add_query_arg('smartcloud_ai_kit_kb_bulk_action', $doaction, $redirect_to);
        $redirect_to = add_query_arg('smartcloud_ai_kit_kb_bulk_count', $processed, $redirect_to);
        $redirect_to = add_query_arg('smartcloud_ai_kit_kb_bulk_nonce', wp_create_nonce('smartcloud_ai_kit_kb_bulk_action'), $redirect_to);

        return $redirect_to;
    }

    /**
     * Show bulk action notices
     */
    public function showBulkActionNotices(): void
    {
        if (!isset($_GET['smartcloud_ai_kit_kb_bulk_action']) || !isset($_GET['smartcloud_ai_kit_kb_bulk_count']) || !isset($_GET['smartcloud_ai_kit_kb_bulk_nonce'])) {
            return;
        }

        // Verify nonce
        if (!wp_verify_nonce(sanitize_text_field(wp_unslash($_GET['smartcloud_ai_kit_kb_bulk_nonce'])), 'smartcloud_ai_kit_kb_bulk_action')) {
            return;
        }

        $action = sanitize_text_field(wp_unslash($_GET['smartcloud_ai_kit_kb_bulk_action']));
        $count = intval($_GET['smartcloud_ai_kit_kb_bulk_count']);

        if ($count === 0) {
            return;
        }

        $message = '';
        if ($action === 'smartcloud_ai_kit_kb_enable') {
            /* translators: %d: number of posts */
            $message = sprintf(_n('%d post enabled as KB source.', '%d posts enabled as KB sources.', $count, 'smartcloud-ai-kit'), $count);
        } elseif ($action === 'smartcloud_ai_kit_kb_disable') {
            /* translators: %d: number of posts */
            $message = sprintf(_n('%d post disabled as KB source.', '%d posts disabled as KB sources.', $count, 'smartcloud-ai-kit'), $count);
        }

        if ($message) {
            printf('<div class="notice notice-success is-dismissible"><p>%s</p></div>', esc_html($message));
        }
    }
}

