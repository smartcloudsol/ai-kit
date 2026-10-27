<?php
/**
 * Admin class to create settings page and  REST API endpoint to handle parameter updates coming from the settings front-end,
 * and load the settings.
 *
 */

namespace SmartCloud\WPSuite\AiKit;

use WP_REST_Request;
use WP_REST_Response;
use WP_Error;
use SmartCloud\WPSuite\AiKit\Logger;

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly.
}
require_once __DIR__ . '/kb/backend-profile-state.php';
if (file_exists(filename: SMARTCLOUD_AI_KIT_PATH . 'admin/model.php')) {
    require_once SMARTCLOUD_AI_KIT_PATH . 'admin/model.php';
}

class Admin
{
    private AiKitSettings $settings;
    public function __construct()
    {
        $defaultSettings = new AiKitSettings(
            enablePoweredBy: false,
            defaultOutputLanguage: "",
            debugLoggingEnabled: false
        );

        // WP can return array/object depending on previous versions / serialization.
        $raw = get_option(\SmartCloud\WPSuite\AiKit\KnowledgeBase\BackendProfileState::optionName(SMARTCLOUD_AI_KIT_SLUG));

        // Merge missing properties from defaultSettings
        $merged = array_merge(
            (array) $defaultSettings,
            is_object($raw) ? (array) $raw : (is_array($raw) ? $raw : [])
        );

        $this->settings = AiKitSettings::fromMixed($merged);
        add_filter('smartcloud_wpsuite_admin_capabilities', array($this, 'registerHubCapabilities'));
        $this->registerRestRoutes();
    }
    /** Register navigation without depending on a particular hub generation. */
    public function registerHubCapabilities(array $capabilities): array
    {
        require_once __DIR__ . '/surface.php';
        require_once __DIR__ . '/configuration-reset.php';
        $capabilities[] = array(
            'schema_version' => 1,
            'id' => 'answers',
            'configuration_reset' => LocalConfigurationReset::descriptor(),
            'surface_provider' => array(AdminSurface::class, 'answers'),
            'surface_extension' => 'answers',
            'detail_page' => SMARTCLOUD_AI_KIT_SLUG,
            'detail_enqueue' => array(self::class, 'enqueueDetailedSurface'),
            'backend_enqueue' => array(self::class, 'enqueueBackendCheck'),
            'surface_enqueue' => array(self::class, 'enqueueAnswersSurface'),
            'surface_action' => array(AdminSurface::class, 'action'),
            'surface_capability' => 'manage_options',
            'product_id' => 'smartcloud-ai-kit',
            'label' => __('Answers', 'smartcloud-ai-kit'),
            'product' => __('SmartCloud AI Kit', 'smartcloud-ai-kit'),
            'description' => __('Answer visitor questions from your WordPress content with a site-wide chatbot or an embedded semantic search component.', 'smartcloud-ai-kit'),
            'order' => 10,
            'primary_url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG),
            'primary_label' => __('Configure Answers', 'smartcloud-ai-kit'),
            'required_capability' => 'manage_options',
            'advanced_links' => array(
                array('label' => __('General preferences', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG), 'required_capability' => 'manage_options'),
                array('label' => __('API settings', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG . '&section=api-settings'), 'required_capability' => 'manage_options'),
                array('label' => __('Chatbot settings', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG . '&section=chatbot-settings'), 'required_capability' => 'manage_options'),
                array('label' => __('Conversation profile', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG . '&section=conversation-profile'), 'required_capability' => 'manage_options'),
                array('label' => __('Knowledge base', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG . '&section=kb-admin'), 'required_capability' => 'manage_options'),
                array('label' => __('AI-Kit Diagnostics', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG . '-diagnostics'), 'required_capability' => 'manage_options'),
            ),
            'quick_links' => array(
                array('label' => __('Review source content', 'smartcloud-ai-kit'), 'url' => admin_url('edit.php'), 'required_capability' => 'manage_options'),
            ),
            'legacy_menu_slugs' => array(SMARTCLOUD_AI_KIT_SLUG, SMARTCLOUD_AI_KIT_SLUG . '-diagnostics'),
        );
        $capabilities[] = array(
            'schema_version' => 1,
            'id' => 'ai-tools',
            'show_in_menu' => false,
            'surface_provider' => array(AdminSurface::class, 'tools'),
            'surface_save' => array(AdminSurface::class, 'save'),
            'surface_capability' => 'manage_options',
            'product_id' => 'smartcloud-ai-kit',
            'label' => __('AI Tools', 'smartcloud-ai-kit'),
            'product' => __('SmartCloud AI Kit', 'smartcloud-ai-kit'),
            'description' => __('Write, rewrite, translate and prepare content with AI.', 'smartcloud-ai-kit'),
            'order' => 20,
            'primary_url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG),
            'primary_label' => __('Configure AI Tools', 'smartcloud-ai-kit'),
            'required_capability' => 'manage_options',
            'advanced_links' => array(
                array('label' => __('General preferences', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG), 'required_capability' => 'manage_options'),
                array('label' => __('API settings', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG . '&section=api-settings'), 'required_capability' => 'manage_options'),
                array('label' => __('Chatbot settings', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG . '&section=chatbot-settings'), 'required_capability' => 'manage_options'),
                array('label' => __('Conversation profile', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG . '&section=conversation-profile'), 'required_capability' => 'manage_options'),
                array('label' => __('Knowledge base', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG . '&section=kb-admin'), 'required_capability' => 'manage_options'),
                array('label' => __('AI-Kit Diagnostics', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG . '-diagnostics'), 'required_capability' => 'manage_options'),
            ),
            'quick_links' => array(
                array('label' => __('Write with AI in the post editor', 'smartcloud-ai-kit'), 'url' => admin_url('post-new.php'), 'required_capability' => 'manage_options'),
                array('label' => __('Image metadata in the Media Library', 'smartcloud-ai-kit'), 'url' => admin_url('upload.php'), 'required_capability' => 'manage_options'),
            ),
            'legacy_menu_slugs' => array(SMARTCLOUD_AI_KIT_SLUG, SMARTCLOUD_AI_KIT_SLUG . '-diagnostics'),
        );
        return $capabilities;
    }

    public function getSettings(): AiKitSettings
    {
        return $this->settings;
    }

    public function addMenu()
    {
        $settings_page = add_submenu_page(
            SMARTCLOUD_WPSUITE_CANONICAL_SLUG,
            __('AI-Kit Settings', 'smartcloud-ai-kit'),
            __('AI-Kit Settings', 'smartcloud-ai-kit'),
            'manage_options',
            SMARTCLOUD_AI_KIT_SLUG,
            array($this, 'renderAiKitSettingsPage'),
        );

        $diagnostics_page = add_submenu_page(
            SMARTCLOUD_WPSUITE_CANONICAL_SLUG,
            __('AI-Kit Diagnostics', 'smartcloud-ai-kit'),
            __('AI-Kit Diagnostics', 'smartcloud-ai-kit'),
            'manage_options',
            SMARTCLOUD_AI_KIT_SLUG . '-diagnostics',
            array($this, 'renderAiKitSettingsPage'),
        );

        add_action('admin_enqueue_scripts', function ($hook) use ($settings_page, $diagnostics_page) {
            if ($hook !== $settings_page && $hook !== $diagnostics_page) {
                return;
            }

            $this->enqueueAdminView($hook === $diagnostics_page ? 'diagnostics' : 'settings');
        });
    }

    public static function enqueueAnswersSurface(): void
    {
        self::enqueueAdminView('answers');
    }

    public static function enqueueBackendCheck(): void
    {
        aiKit()->enqueueAdminRuntimeAssets();
        $assetPath = SMARTCLOUD_AI_KIT_PATH . 'admin/backend-readiness.asset.php';
        if (!file_exists($assetPath)) { return; }
        $asset = require $assetPath;
        wp_enqueue_script('smartcloud-ai-kit-backend-check', SMARTCLOUD_AI_KIT_URL . 'admin/backend-readiness.js',
            array_merge($asset['dependencies'] ?? array(), array('smartcloud-ai-kit-main-script')),
            $asset['version'] ?? SMARTCLOUD_AI_KIT_VERSION, array('in_footer' => true, 'strategy' => 'defer'));
    }

    public static function enqueueDetailedSurface(): void
    {
        self::enqueueAdminView('settings');
    }

    private static function enqueueAdminView(string $view): void
    {
        aiKit()->enqueueAdminRuntimeAssets();
        $asset = file_exists(SMARTCLOUD_AI_KIT_PATH . 'admin/index.asset.php')
            ? require SMARTCLOUD_AI_KIT_PATH . 'admin/index.asset.php' : array();
        $asset_version = $asset['version'] ?? SMARTCLOUD_AI_KIT_VERSION;
        $dependencies = array_merge($asset['dependencies'] ?? array(), array('smartcloud-wpsuite-webcrypto-vendor', 'smartcloud-wpsuite-mantine-vendor'));
        wp_enqueue_script('smartcloud-ai-kit-admin-script', SMARTCLOUD_AI_KIT_URL . 'admin/index.js', $dependencies, $asset_version, array('in_footer' => true, 'strategy' => 'defer'));
        if (function_exists('wp_set_script_translations')) {
            wp_set_script_translations('smartcloud-ai-kit-admin-script', 'smartcloud-ai-kit', SMARTCLOUD_AI_KIT_PATH . 'languages');
        }
        wp_add_inline_script('smartcloud-ai-kit-admin-script', '__aikitGlobal.WpSuite.plugins.aiKit.view = ' . wp_json_encode($view) . ';', 'before');
        wp_enqueue_style('smartcloud-ai-kit-admin-style', SMARTCLOUD_AI_KIT_URL . 'admin/index.css', array(), $asset_version);
        wp_enqueue_style('smartcloud-mantine-vendor-style', SMARTCLOUD_WPSUITE_URL . 'assets/css/mantine-vendor.css', array(), \SmartCloud\WPSuite\Hub\VERSION_MANTINE);
    }

    public function renderAiKitSettingsPage()
    {
        echo '<div id="smartcloud-ai-kit-admin"></div>';
    }

    public function initRestApi()
    {
        require_once __DIR__ . '/answers-settings.php';
        require_once __DIR__ . '/answers-onboarding.php';
        require_once __DIR__ . '/answers-product-pages.php';
        register_rest_route(SMARTCLOUD_AI_KIT_SLUG . '/v1', '/answers-product-pages', array(
            'methods' => 'GET', 'callback' => array(AnswersProductPages::class, 'read'),
            'permission_callback' => array(AnswersProductPages::class, 'permission'),
        ));
        register_rest_route(SMARTCLOUD_AI_KIT_SLUG . '/v1', '/answers-onboarding', array(
            array('methods' => 'GET', 'callback' => array(AnswersOnboarding::class, 'read'), 'permission_callback' => array(AnswersOnboarding::class, 'permission')),
            array('methods' => 'POST', 'callback' => array(AnswersOnboarding::class, 'save'), 'permission_callback' => array(AnswersOnboarding::class, 'permission')),
        ));
        register_rest_route(SMARTCLOUD_AI_KIT_SLUG . '/v1', '/answers-settings', array(
            array('methods' => 'GET', 'callback' => array(AnswersSettings::class, 'read'), 'permission_callback' => array(AnswersSettings::class, 'permission')),
            array('methods' => 'POST', 'callback' => array(AnswersSettings::class, 'save'), 'permission_callback' => array(AnswersSettings::class, 'permission')),
        ));
        register_rest_route(
            SMARTCLOUD_AI_KIT_SLUG . '/v1',
            '/update-settings',
            array(
                'methods' => 'POST',
                'callback' => array($this, 'updateSettings'),
                'permission_callback' => function () {
                    if (!current_user_can('manage_options')) {
                        return new WP_Error('rest_forbidden', esc_html__('Forbidden', 'smartcloud-ai-kit'), array('status' => 403));
                    }
                    return true;
                },
            )
        );
    }

    public function updateSettings(WP_REST_Request $request)
    {
        $settings_param = $request->get_json_params();
        if (!is_array($settings_param) || empty($settings_param)) {
            // Fallback if body wasn't parsed as JSON for some reason.
            $decoded = json_decode($request->get_body(), true);
            $settings_param = is_array($decoded) ? $decoded : [];
        }

        $defaultOutputLanguage = isset($settings_param['defaultOutputLanguage'])
            ? (string) $settings_param['defaultOutputLanguage']
            : "";

        $debugLoggingEnabled = (bool) ($settings_param['debugLoggingEnabled'] ?? false);

        $this->settings = new AiKitSettings(
            enablePoweredBy: (bool) ($settings_param['enablePoweredBy'] ?? false),
            defaultOutputLanguage: $defaultOutputLanguage,
            debugLoggingEnabled: $debugLoggingEnabled
        );

        // Frissített beállítások mentése
        update_option(\SmartCloud\WPSuite\AiKit\KnowledgeBase\BackendProfileState::optionName(SMARTCLOUD_AI_KIT_SLUG), $this->settings);

        Logger::info('AI-Kit settings updated', [
            'debugLoggingEnabled' => $debugLoggingEnabled,
            'enablePoweredBy' => $this->settings->enablePoweredBy,
            'defaultOutputLanguage' => $defaultOutputLanguage
        ]);

        return new WP_REST_Response(array('success' => true, 'message' => __('Settings updated successfully.', 'smartcloud-ai-kit')), 200);
    }

    private function registerRestRoutes()
    {
        if (!class_exists('WP_REST_Controller')) {
            return;
        }

        add_action('rest_api_init', array($this, 'initRestApi'));
    }

}
