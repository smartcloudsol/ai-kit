<?php
/**
 * Plugin Name:       AI-Kit – On-Device AI Tools
 * Plugin URI:        https://wpsuite.io/ai-kit/
 * Description:       Bring on-device, zero-cost AI directly into WordPress. Create, rewrite, translate, proofread, summarize, and SEO-optimize content using Chrome's built-in AI — no API keys, no cloud, no tokens, no data leaving the browser.
 * Requires at least: 6.2
 * Tested up to:      6.9
 * Requires PHP:      8.1
 * Version:           1.0.0
 * Author:            Smart Cloud Solutions Inc.
 * Author URI:        https://smart-cloud-solutions.com
 * License:           MIT
 * License URI:       https://mit-license.org/
 * Text Domain:       ai-kit
 *
 * @package           ai-kit
 */

namespace SmartCloud\WPSuite\AiKit;

const VERSION = '1.0.0';

if (!defined('ABSPATH')) {
    exit;
}

if (version_compare(PHP_VERSION, '8.1', '<')) {
    deactivate_plugins(plugin_basename(__FILE__));
    wp_die(
        esc_html__('AI-Kit requires PHP 8.1 or higher.', 'ai-kit'),
        esc_html__('Plugin dependency check', 'ai-kit'),
        array('back_link' => true)
    );
}

/**
 * Main plugin class.
 */
final class AiKit
{

    /** Singleton instance */
    private static ?AiKit $instance = null;

    /** Admin instance */
    private Admin $admin;

    private function __construct()
    {
        $this->defineConstants();
        $this->includes();
    }

    /**
     * Access the singleton instance.
     */
    public static function instance(): AiKit
    {
        return self::$instance ?? (self::$instance = new self());
    }

    /**
     * Define required constants.
     */
    /**
     * Init callback – registers blocks.
     */
    public function init(): void
    {
        add_action('add_meta_boxes', array($this, 'registerAttachmentMetabox'), 10);
        add_filter('bulk_actions-upload', array($this, 'registerMediaBulkActions'), 10, 1);
        add_filter('handle_bulk_actions-upload', array($this, 'handleMediaBulkAction'), 10, 3);

        // Register Gutenberg blocks (summarizer etc.)
        if (function_exists('register_block_type')) {
            register_block_type(AI_KIT_PATH . 'ai-kit-blocks/dist/ai-feature');
        }

        // Assets
        add_action('wp_enqueue_scripts', array($this, 'enqueueAssets'), 20);
        add_action('admin_init', array($this, 'enqueueAssets'), 20);
        add_action('elementor/preview/after_enqueue_scripts', array($this, 'enqueueAssets'), 20);

        add_action('enqueue_block_editor_assets', array($this, 'enqueueEditorAssets'), 20);
        add_action('admin_enqueue_scripts', array($this, 'enqueueAdminAssets'), 20);
        // Hooks.
        add_action('admin_menu', array($this, 'createAdminMenu'), 20);

        // Shortcodes
        add_shortcode('ai-kit-feature', array($this, 'shortcodeFeature'));
        //add_shortcode('ai-kit-chatbot', array($this, 'shortcodeChatbot'));

        // Category for custom blocks.
        add_filter('block_categories_all', array($this, 'registerBlockCategory'), 20, 2);

        add_filter('no_texturize_shortcodes', function ($shortcodes) {
            $shortcodes[] = 'ai-kit-feature';
            return $shortcodes;
        });
    }

    public function registerAttachmentMetabox()
    {
        add_meta_box(
            'ai_kit_generate_metadata',
            __('Generate SEO metadata', 'ai-kit'),
            function ($post) {
                if (!($post instanceof \WP_Post) || $post->post_type !== 'attachment') {
                    return;
                }
                echo '<div id="ai-kit-attachment-metabox-root" data-attachment-id="' . esc_attr((string) $post->ID) . '"></div>';
            },
            'attachment',
            'side',
            'high'
        );
    }

    public function registerMediaBulkActions($actions)
    {
        $actions['ai_kit_preview_ai_metadata'] = __('Preview SEO metadata', 'ai-kit');
        return $actions;
    }

    public function handleMediaBulkAction($redirect_to, $doaction, $post_ids)
    {
        if ($doaction !== 'ai_kit_preview_ai_metadata') {
            return $redirect_to;
        }

        if (!current_user_can('upload_files')) {
            return $redirect_to;
        }

        if (
            empty($_REQUEST['_wpnonce']) ||
            !wp_verify_nonce(
                sanitize_text_field(wp_unslash($_REQUEST['_wpnonce'])),
                'bulk-media'
            )
        ) {
            return $redirect_to;
        }

        $ids = [];
        if (!empty($_REQUEST['media']) && is_array($_REQUEST['media'])) {
            $ids = array_map('absint', wp_unslash($_REQUEST['media']));
        } elseif (!empty($post_ids) && is_array($post_ids)) {
            $ids = array_map('absint', $post_ids);
        }

        $ids = array_values(array_filter($ids, fn($n) => $n > 0));

        $ids = array_values(array_filter($ids, fn($id) => current_user_can('edit_post', $id)));

        if (!$ids) {
            return $redirect_to;
        }

        return add_query_arg([
            'ai_kit_preview' => 1,
            'ai_kit_ids' => implode(',', $ids),
        ], $redirect_to);
    }
    /**
     * Include admin classes or additional files.
     */
    public function registerWidgets(): void
    {
        if (file_exists(AI_KIT_PATH . 'ai-kit-elementor-widgets.php')) {
            add_action('elementor/init', static function () {
                require_once AI_KIT_PATH . 'ai-kit-elementor-widgets.php';
            });
        }
    }

    /**
     * Register custom block category.
     */
    public function registerBlockCategory(array $categories, \WP_Block_Editor_Context $context): array
    {
        $categories[] = array(
            'slug' => 'wpsuite-ai-kit',
            'title' => __('WPSuite-AI Kit', 'ai-kit'),
            'icon' => null,
        );
        return $categories;
    }

    /**
     * Enqueue inline scripts that expose PHP constants to JS.
     */
    public function enqueueAssets(): void
    {
        wp_register_script(
            'wpsuite-webcrypto-vendor',
            AI_KIT_URL . 'assets/js/wpsuite-webcrypto-vendor.min.js',
            array(),
            \SmartCloud\WPSuite\Hub\VERSION_WEBCRYPTO,
            false
        );

        wp_register_script(
            'wpsuite-mantine-vendor',
            AI_KIT_URL . 'assets/js/wpsuite-mantine-vendor.min.js',
            array("react", "react-dom"),
            \SmartCloud\WPSuite\Hub\VERSION_MANTINE,
            false
        );

        $main_script_asset = array();
        if (file_exists(filename: AI_KIT_PATH . 'ai-kit-main/dist/index.asset.php')) {
            $main_script_asset = require(AI_KIT_PATH . 'ai-kit-main/dist/index.asset.php');
        }
        $main_script_asset['dependencies'] = array_merge($main_script_asset['dependencies'], array('wpsuite-webcrypto-vendor', 'wpsuite-mantine-vendor'));
        wp_enqueue_script('ai-kit-main-script', AI_KIT_URL . 'ai-kit-main/dist/index.js', $main_script_asset['dependencies'], AI_KIT_VERSION, false);
        //wp_enqueue_style('ai-kit-main-style', AI_KIT_URL . 'ai-kit-main/dist/index.css', array(), AI_KIT_VERSION);
        //add_editor_style(AI_KIT_URL . 'ai-kit-main/dist/index.css');

        $blocks_script_asset = array();
        if (file_exists(filename: AI_KIT_PATH . 'ai-kit-blocks/dist/index.asset.php')) {
            $blocks_script_asset = require(AI_KIT_PATH . 'ai-kit-blocks/dist/index.asset.php');
        }
        $blocks_script_asset['dependencies'] = array_merge($blocks_script_asset['dependencies'], array('ai-kit-main-script', 'wpsuite-mantine-vendor'));
        wp_enqueue_script('ai-kit-blocks-script', AI_KIT_URL . 'ai-kit-blocks/dist/index.js', $blocks_script_asset['dependencies'], AI_KIT_VERSION, false);
        wp_enqueue_style('ai-kit-blocks-style', AI_KIT_URL . 'ai-kit-blocks/dist/index.css', array(), AI_KIT_VERSION);
        add_editor_style(AI_KIT_URL . 'ai-kit-blocks/dist/index.css');

        // Build data passed to JS.
        $settings = $this->admin->getSettings();
        $data = array(
            'key' => AI_KIT_SLUG,
            'version' => AI_KIT_VERSION,
            'status' => 'initializing',
            'plugin' => array(),
            'settings' => $settings,
            'restUrl' => rest_url(AI_KIT_SLUG . '/v1'),
            'nonce' => wp_create_nonce('wp_rest'),
        );
        $js = 'const __aikitGlobal = (typeof globalThis !== "undefined") ? globalThis : window;
__aikitGlobal.WpSuite.plugins.aiKit = {};
Object.assign(__aikitGlobal.WpSuite.plugins.aiKit, ' . wp_json_encode($data) . ');
__aikitGlobal.WpSuite.constants = __aikitGlobal.WpSuite.constants ?? {};
__aikitGlobal.WpSuite.constants.aiKit = {
    mantineCssHref: "' . AI_KIT_URL . 'assets/css/wpsuite-mantine-vendor.css",
    aiKitUiCssHref: "' . AI_KIT_URL . 'ai-kit-main/dist/index.css"
};
';
        wp_add_inline_script('ai-kit-main-script', $js, 'before');
    }

    public function enqueueAdminAssets($hook): void
    {
        if ($hook !== 'upload.php' && $hook !== 'post.php') {
            return;
        }

        // post.php-n csak attachmentnél:
        if ($hook === 'post.php') {
            $screen = function_exists('get_current_screen') ? get_current_screen() : null;
            if (!$screen || $screen->id !== 'attachment')
                return;
        }

        $script_asset = array();
        if (file_exists(filename: AI_KIT_PATH . 'ai-kit-admin/dist/media.asset.php')) {
            $script_asset = require_once(AI_KIT_PATH . 'ai-kit-admin/dist/media.asset.php');
        }
        $script_asset['dependencies'] = array_merge($script_asset['dependencies'], array('ai-kit-main-script'));
        wp_enqueue_script('ai-kit-media-script', AI_KIT_URL . 'ai-kit-admin/dist/media.js', $script_asset['dependencies'], AI_KIT_VERSION, true);

        //wp_enqueue_style('ai-kit-components-style', AI_KIT_URL . 'ai-kit-admin/dist/components.css', array(), AI_KIT_VERSION);
        //add_editor_style(AI_KIT_URL . 'ai-kit-admin/dist/components.css');
    }

    /**
     * Enqueue inline editor scripts that expose PHP constants to JS.
     */
    public function enqueueEditorAssets(): void
    {
        $script_asset = array();
        if (file_exists(filename: AI_KIT_PATH . 'ai-kit-admin/dist/media.asset.php')) {
            $script_asset = require_once(AI_KIT_PATH . 'ai-kit-admin/dist/media.asset.php');
        }
        $script_asset['dependencies'] = array_merge($script_asset['dependencies'], array('ai-kit-main-script'));
        wp_enqueue_script('ai-kit-media-script', AI_KIT_URL . 'ai-kit-admin/dist/media.js', $script_asset['dependencies'], AI_KIT_VERSION, true);

        $script_asset = array();
        if (file_exists(filename: AI_KIT_PATH . 'ai-kit-admin/dist/sidebar.asset.php')) {
            $script_asset = require_once(AI_KIT_PATH . 'ai-kit-admin/dist/sidebar.asset.php');
        }
        $script_asset['dependencies'] = array_merge($script_asset['dependencies'], array('wpsuite-webcrypto-vendor'));
        wp_enqueue_script('ai-kit-sidebar-script', AI_KIT_URL . 'ai-kit-admin/dist/sidebar.js', $script_asset['dependencies'], AI_KIT_VERSION, true);

        $script_asset = array();
        if (file_exists(filename: AI_KIT_PATH . 'ai-kit-admin/dist/langutils.asset.php')) {
            $script_asset = require_once(AI_KIT_PATH . 'ai-kit-admin/dist/langutils.asset.php');
        }
        $script_asset['dependencies'] = array_merge($script_asset['dependencies'], array('wpsuite-webcrypto-vendor'));
        wp_enqueue_script('ai-kit-langutils-script', AI_KIT_URL . 'ai-kit-admin/dist/langutils.js', $script_asset['dependencies'], AI_KIT_VERSION, true);

        $script_asset = array();
        if (file_exists(filename: AI_KIT_PATH . 'ai-kit-admin/dist/imgextra.asset.php')) {
            $script_asset = require_once(AI_KIT_PATH . 'ai-kit-admin/dist/imgextra.asset.php');
        }
        $script_asset['dependencies'] = array_merge($script_asset['dependencies'], array('wpsuite-webcrypto-vendor'));
        wp_enqueue_script('ai-kit-imgextra-script', AI_KIT_URL . 'ai-kit-admin/dist/imgextra.js', $script_asset['dependencies'], AI_KIT_VERSION, true);

        //wp_enqueue_style('ai-kit-components-style', AI_KIT_URL . 'ai-kit-admin/dist/components.css', array(), AI_KIT_VERSION);
        //add_editor_style(AI_KIT_URL . 'ai-kit-admin/dist/components.css');
    }

    /**
     * Shortcode handler for [ai-kit-feature]
     */
    public function shortcodeFeature($atts = array(), $content = null): string
    {
        global $block;

        $attribute_defaults = array(
            'mode' => null,
            'editable' => null,
            'autoRun' => null,
            'default' => null,
            'allowOverride' => null,
            'optionsDisplay' => null,
            'inputSelector' => null,
            'outputSelector' => null,
            'variation' => 'default',
            'title' => null,
            'openButtonTitle' => null,
            'showOpenButtonTitle' => null,
            'openButtonIcon' => null,
            'showOpenButtonIcon' => null,
            'showRegenerateOnBackendButton' => null,
            'acceptButtonTitle' => null,
            'language' => 'system',
            'direction' => 'auto',
            'colorMode' => 'light',
            'primaryColor' => null,
            'primaryShade' => null,
            'colors' => null,
            'uid' => strtolower(\function_exists('wp_generate_password') ? \wp_generate_password(8, false, false) : substr(md5(uniqid('', true)), 0, 8)),
            'customCSS' => null,
            'styleText' => null,
        );

        $provided_atts = array_change_key_case((array) $atts, CASE_LOWER);
        $block_attrs = array();
        if (is_array($block) && isset($block['attrs']) && is_array($block['attrs'])) {
            $block_attrs = $block['attrs'];
        }

        $is_preview = is_admin();
        if (!$is_preview && did_action('elementor/loaded') && class_exists('\\Elementor\\Plugin')) {
            $plugin = \Elementor\Plugin::$instance;
            if (isset($plugin->preview) && method_exists($plugin->preview, 'is_preview_mode')) {
                $is_preview = $plugin->preview->is_preview_mode();
            }
        }

        $attrs = array();
        foreach ($attribute_defaults as $attr_name => $default_value) {
            $slugged = preg_replace('/([a-z])([A-Z])/', '$1-$2', $attr_name);
            $shortcode_keys = array_unique(
                array(
                    strtolower($attr_name),
                    strtolower(str_replace('-', '_', $slugged)),
                    strtolower($slugged),
                )
            );

            $has_shortcode_value = false;
            $shortcode_value = null;
            foreach ($shortcode_keys as $candidate_key) {
                if (array_key_exists($candidate_key, $provided_atts)) {
                    $shortcode_value = $provided_atts[$candidate_key];
                    $has_shortcode_value = true;
                    break;
                }
            }

            $block_value = array_key_exists($attr_name, $block_attrs) ? $block_attrs[$attr_name] : null;
            $value = $has_shortcode_value ? $shortcode_value : ($block_value ?? $default_value);

            if (is_string($value)) {
                $trimmed = trim($value);
                if ($trimmed !== '' && in_array($attr_name, array('allowOverride', 'default', 'colors', 'primaryShade'), true)) {
                    $decoded = json_decode($value, true);
                    if (json_last_error() === JSON_ERROR_NONE) {
                        $value = $decoded;
                    }
                }
            }

            if (in_array($attr_name, array('allowOverride', 'default', 'colors', 'primaryShade'), true) && is_object($value)) {
                $value = json_decode(wp_json_encode($value), true);
            }

            if ($attr_name === 'allowOverride' && is_array($value)) {
                foreach ($value as $allow_key => $allow_value) {
                    if (is_string($allow_value)) {
                        $lower = strtolower($allow_value);
                        if (in_array($lower, array('true', '1', 'yes'), true)) {
                            $value[$allow_key] = true;
                        } elseif (in_array($lower, array('false', '0', 'no'), true)) {
                            $value[$allow_key] = false;
                        }
                    } elseif (is_numeric($allow_value)) {
                        $value[$allow_key] = ((int) $allow_value) === 1;
                    }
                }
            }

            if ($attr_name === 'colors' && is_array($value) && isset($value['name'], $value['color']) && count($value) === 2) {
                $value = array(
                    $value['name'] => $value['color'],
                );
            }

            $attrs[$attr_name] = $value;
        }

        // Content-based config (human friendly mini-YAML)
        $normalized_content = $this->normalize_shortcode_content($content);
        if (is_string($normalized_content) && trim($normalized_content) !== '') {
            // base64 (standard, not url-safe)
            $attrs['configB64'] = base64_encode($normalized_content);

            // optional: versioning to allow changing format later
            $attrs['configFormat'] = 'yaml.v1';
        }

        $newBlock = [
            'blockName' => 'ai-kit/feature',
            'attrs' => $attrs,
        ];
        $content = render_block($newBlock);
        $content = str_replace("ai-kit-is-preview", ($is_preview ? 'true' : 'false'), $content);
        return $content;
    }

    /**
     * Shortcode handler for [ai-kit-chatbot]
     */
    public function shortcodeChatbot($atts = array(), $content = null): string
    {
        $a = shortcode_atts(
            array(
                'component' => null,
            ),
            $atts
        );
        $is_preview = is_admin();
        if (!$is_preview && did_action('elementor/loaded') && class_exists('\Elementor\Plugin')) {
            $plugin = \Elementor\Plugin::$instance;
            if (isset($plugin->preview) && method_exists($plugin->preview, 'is_preview_mode')) {
                $is_preview = $plugin->preview->is_preview_mode();
            }
        }
        $attrs = array(
            'component' => $a['component'] ?? $block['attrs']['component'] ?? 'div',
        );
        $newBlock = [
            'blockName' => 'ai-kit/chatbot',
            'attrs' => $attrs,
        ];
        $content = render_block($newBlock);
        $content = str_replace("ai-kit-is-preview", ($is_preview ? 'true' : 'false'), $content);
        return $content;
    }

    /**
     * Add settings page in wp-admin.
     */
    public function createAdminMenu(): void
    {
        $this->admin->addMenu();
    }

    private function defineConstants(): void
    {
        define('AI_KIT_VERSION', VERSION);
        define('AI_KIT_SLUG', 'ai-kit');

        define('AI_KIT_PATH', plugin_dir_path(__FILE__));
        define('AI_KIT_URL', plugin_dir_url(__FILE__));
    }

    /**
     * Include admin classes or additional files.
     */
    private function includes(): void
    {
        // Hub admin classes.
        if (file_exists(AI_KIT_PATH . 'hub-loader.php')) {
            require_once AI_KIT_PATH . 'hub-loader.php';
        }

        // Admin classes.
        if (file_exists(AI_KIT_PATH . 'ai-kit-admin/index.php')) {
            require_once AI_KIT_PATH . 'ai-kit-admin/index.php';
        }
        if (class_exists('\SmartCloud\WPSuite\AiKit\Admin')) {
            $this->admin = new \SmartCloud\WPSuite\AiKit\Admin();
        }
    }
    private function normalize_shortcode_content(?string $content): string
    {
        if (!is_string($content) || $content === '') {
            return '';
        }

        // Decode entities (editors sometimes entity-encode quotes etc.)
        $text = html_entity_decode($content, ENT_QUOTES, get_bloginfo('charset'));

        // Normalize newlines
        $text = str_replace("\r\n", "\n", $text);

        // Remove wpautop/editor wrapper tags while preserving line structure
        // </p><p> -> newline
        $text = preg_replace('~</p>\s*<p[^>]*>~i', "\n", $text);

        // <br> -> newline
        $text = preg_replace('~<br\s*/?>~i', "\n", $text);

        // Remove remaining <p> wrappers
        $text = preg_replace('~</?p[^>]*>~i', '', $text);

        // Common wrappers from some editors
        $text = preg_replace('~</?div[^>]*>~i', '', $text);
        $text = preg_replace('~</?span[^>]*>~i', '', $text);

        // NBSP -> space
        $text = str_replace("\xC2\xA0", ' ', $text);

        return trim($text);
    }
}

// Bootstrap plugin.
if (defined('AI_KIT_BOOTSTRAPPED')) {
    return;
}
define('AI_KIT_BOOTSTRAPPED', true);

add_action('init', 'SmartCloud\WPSuite\AiKit\aikitInit', 15);
add_action('plugins_loaded', 'SmartCloud\WPSuite\AiKit\aikitLoaded', 20);
function aikitInit()
{
    $instance = aikit();
    if (class_exists('\SmartCloud\WPSuite\Hub\AiKitHubLoader')) {
        $loader = loader();
        $loader->init();
    }
    $instance->init();
}
function aikitLoaded()
{
    $instance = aikit();
    if (class_exists('\SmartCloud\WPSuite\Hub\AiKitHubLoader')) {
        $loader = loader();
        $loader->check();
    }
}

/**
 * Accessor function
 *
 * @return \SmartCloud\WPSuite\AiKit\AiKit
 */
function aikit()
{
    return AiKit::instance();
}

/**
 * Accessor function
 *
 * @return \SmartCloud\WPSuite\Hub\AiKitHubLoader
 */
function loader()
{
    return \SmartCloud\WPSuite\Hub\AiKitHubLoader::instance('ai-kit/ai-kit.php', 'ai-kit');
}
