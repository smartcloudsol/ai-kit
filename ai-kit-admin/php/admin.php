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

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly.
}
if (file_exists(filename: SMARTCLOUD_AI_KIT_PATH . 'admin/model.php')) {
    require_once SMARTCLOUD_AI_KIT_PATH . 'admin/model.php';
}
class Admin
{
    private AiKitSettings $settings;
    public function __construct()
    {
        $defaultSettings = new AiKitSettings(
            sharedContext: "",
            reCaptchaSiteKey: "",
            useRecaptchaEnterprise: false,
            useRecaptchaNet: false,
            enablePoweredBy: false,
            defaultOutputLanguage: "",
            reCaptchaChatTtlSeconds: 120,
        );

        // WP can return array/object depending on previous versions / serialization.
        $raw = get_option(SMARTCLOUD_AI_KIT_SLUG, $defaultSettings);
        $this->settings = AiKitSettings::fromMixed($raw);
        $this->registerRestRoutes();
    }
    public function getSettings(): AiKitSettings
    {
        return $this->settings;
    }

    public function addMenu()
    {
        $settings_page = add_submenu_page(
            SMARTCLOUD_WPSUITE_SLUG,
            __('AI-Kit Settings', 'smartcloud-ai-kit'),
            __('AI-Kit Settings', 'smartcloud-ai-kit'),
            'manage_options',
            SMARTCLOUD_AI_KIT_SLUG,
            array($this, 'renderAiKitSettingsPage'),
        );

        $diagnostics_page = add_submenu_page(
            SMARTCLOUD_WPSUITE_SLUG,
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

            $script_asset = array();
            if (file_exists(filename: SMARTCLOUD_AI_KIT_PATH . 'admin/index.asset.php')) {
                $script_asset = require_once(SMARTCLOUD_AI_KIT_PATH . 'admin/index.asset.php');
            }
            $script_asset['dependencies'] = array_merge($script_asset['dependencies'], array('smartcloud-wpsuite-webcrypto-vendor', 'smartcloud-wpsuite-mantine-vendor'));
            $res = wp_enqueue_script('smartcloud-ai-kit-admin-script', SMARTCLOUD_AI_KIT_URL . 'admin/index.js', $script_asset['dependencies'], SMARTCLOUD_AI_KIT_VERSION, true);
            // Make the blocks translatable.
            if (function_exists('wp_set_script_translations')) {
                wp_set_script_translations('smartcloud-ai-kit-admin-script', 'smartcloud-ai-kit', SMARTCLOUD_AI_KIT_PATH . 'languages');
            }

            if ($hook === $settings_page) {
                $page = 'settings';
            } elseif ($hook === $diagnostics_page) {
                $page = 'diagnostics';
            } else {
                $page = '';
            }
            $js = '__aikitGlobal.WpSuite.plugins.aiKit.view = ' . wp_json_encode($page) . ';';
            wp_add_inline_script('smartcloud-ai-kit-admin-script', $js, 'before');

            wp_enqueue_style('smartcloud-ai-kit-admin-style', SMARTCLOUD_AI_KIT_URL . 'admin/index.css', array(), SMARTCLOUD_AI_KIT_VERSION);
            wp_enqueue_style('smartcloud-mantine-vendor-style', SMARTCLOUD_AI_KIT_URL . 'assets/css/mantine-vendor.css', array(), \SmartCloud\WPSuite\Hub\VERSION_MANTINE);
        });
    }

    public function renderAiKitSettingsPage()
    {
        echo '<div id="smartcloud-ai-kit-admin"></div>';
    }

    public function initRestApi()
    {
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

        $sharedContext = isset($settings_param['sharedContext'])
            ? (string) $settings_param['sharedContext']
            : "";
        $reCaptchaSiteKey = isset($settings_param['reCaptchaSiteKey'])
            ? (string) $settings_param['reCaptchaSiteKey']
            : "";
        $defaultOutputLanguage = isset($settings_param['defaultOutputLanguage'])
            ? (string) $settings_param['defaultOutputLanguage']
            : "";

        $reCaptchaChatTtlSeconds = 120;
        if (isset($settings_param['reCaptchaChatTtlSeconds'])) {
            // Allow string/number payloads.
            $reCaptchaChatTtlSeconds = (int) $settings_param['reCaptchaChatTtlSeconds'];
        }
        // Clamp to a safe range (0..3600). 0 = disabled.
        if ($reCaptchaChatTtlSeconds < 0) {
            $reCaptchaChatTtlSeconds = 0;
        }
        if ($reCaptchaChatTtlSeconds > 3600) {
            $reCaptchaChatTtlSeconds = 3600;
        }

        $this->settings = new AiKitSettings(
            sharedContext: sanitize_textarea_field($sharedContext),
            reCaptchaSiteKey: sanitize_text_field($reCaptchaSiteKey),
            useRecaptchaEnterprise: (bool) ($settings_param['useRecaptchaEnterprise'] ?? false),
            useRecaptchaNet: (bool) ($settings_param['useRecaptchaNet'] ?? false),
            enablePoweredBy: (bool) ($settings_param['enablePoweredBy'] ?? false),
            defaultOutputLanguage: $defaultOutputLanguage,
            reCaptchaChatTtlSeconds: $reCaptchaChatTtlSeconds,
        );

        // Frissített beállítások mentése
        update_option(SMARTCLOUD_AI_KIT_SLUG, $this->settings);
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