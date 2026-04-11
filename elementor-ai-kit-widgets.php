<?php
/**
 * Elementor AI-Kit Widgets
 * 
 * Provides Elementor widgets for AI-Kit Feature and Doc Search blocks
 */
namespace SmartCloud\WPSuite\AiKit;

if (!defined('ABSPATH')) {
    exit;
}

use SmartCloud\WPSuite\AiKit\Logger;

/**
 * Helper function to render AI-Kit shortcodes
 * 
 * @param string $tag Shortcode tag
 * @param array $atts Shortcode attributes
 * @param string $body Shortcode body content (YAML)
 */
if (!function_exists('smartcloud_ai_kit_do_shortcode')) {
    function smartcloud_ai_kit_do_shortcode(string $tag, array $atts = [], string $body = '')
    {
        $shortcode = sprintf(
            '[%s %s]',
            esc_attr($tag),
            implode(' ', array_map(
                fn($k, $v) => sprintf('%s="%s"', esc_attr($k), esc_attr($v)),
                array_keys($atts),
                $atts
            ))
        );

        if (!empty($body)) {
            $shortcode = sprintf(
                '[%s %s]%s[/%s]',
                esc_attr($tag),
                implode(' ', array_map(
                    fn($k, $v) => sprintf('%s="%s"', esc_attr($k), esc_attr($v)),
                    array_keys($atts),
                    $atts
                )),
                $body,
                esc_attr($tag)
            );
        }

        echo do_shortcode($shortcode);
    }
}

// Register AI-Kit category for Elementor
add_action('elementor/elements/categories_registered', static function ($manager) {
    $manager->add_category('smartcloud-ai-kit', [
        'title' => __('SmartCloud - AI-Kit', 'smartcloud-ai-kit'),
        'icon' => 'fa fa-magic',
    ]);
});

/**
 * Base class for AI-Kit widgets
 */
abstract class AiKit_Base_Widget extends \Elementor\Widget_Base
{
    protected static array $MODES;

    protected static array $COLOR_MODES;
    protected static array $LANGUAGES;
    protected static array $DIRECTIONS;
    protected static array $VARIATIONS;
    protected static array $LENGTHS;
    protected static array $REWRITE_LENGTHS;
    protected static array $TONES;
    protected static array $REWRITE_TONES;
    protected static array $TYPES;

    public function __construct($data = [], $args = null)
    {
        parent::__construct($data, $args);

        self::$COLOR_MODES = [
            'auto' => __('System', 'smartcloud-ai-kit'),
            'light' => __('Light', 'smartcloud-ai-kit'),
            'dark' => __('Dark', 'smartcloud-ai-kit'),
        ];

        self::$LANGUAGES = [
            'ar' => __('Arabic', 'smartcloud-ai-kit'),
            'zh' => __('Chinese', 'smartcloud-ai-kit'),
            'nl' => __('Dutch', 'smartcloud-ai-kit'),
            'en' => __('English', 'smartcloud-ai-kit'),
            'fr' => __('French', 'smartcloud-ai-kit'),
            'de' => __('German', 'smartcloud-ai-kit'),
            'he' => __('Hebrew', 'smartcloud-ai-kit'),
            'hi' => __('Hindi', 'smartcloud-ai-kit'),
            'hu' => __('Hungarian', 'smartcloud-ai-kit'),
            'id' => __('Indonesian', 'smartcloud-ai-kit'),
            'it' => __('Italian', 'smartcloud-ai-kit'),
            'ja' => __('Japanese', 'smartcloud-ai-kit'),
            'ko' => __('Korean', 'smartcloud-ai-kit'),
            'nb' => __('Norwegian', 'smartcloud-ai-kit'),
            'pl' => __('Polish', 'smartcloud-ai-kit'),
            'pt' => __('Portuguese', 'smartcloud-ai-kit'),
            'ru' => __('Russian', 'smartcloud-ai-kit'),
            'es' => __('Spanish', 'smartcloud-ai-kit'),
            'sv' => __('Swedish', 'smartcloud-ai-kit'),
            'th' => __('Thai', 'smartcloud-ai-kit'),
            'tr' => __('Turkish', 'smartcloud-ai-kit'),
            'ua' => __('Ukrainian', 'smartcloud-ai-kit'),
        ];

        self::$DIRECTIONS = [
            'auto' => __('Auto (by language)', 'smartcloud-ai-kit'),
            'ltr' => __('Left to Right', 'smartcloud-ai-kit'),
            'rtl' => __('Right to Left', 'smartcloud-ai-kit'),
        ];

        self::$VARIATIONS = [
            'default' => __('Default (inline)', 'smartcloud-ai-kit'),
            'modal' => __('Modal', 'smartcloud-ai-kit'),
        ];

        self::$LENGTHS = [
            '' => __('Short', 'smartcloud-ai-kit'),
            'medium' => __('Medium', 'smartcloud-ai-kit'),
            'long' => __('Long', 'smartcloud-ai-kit'),
        ];

        self::$REWRITE_LENGTHS = [
            'as-is' => __('As-is', 'smartcloud-ai-kit'),
            'shorter' => __('Shorter', 'smartcloud-ai-kit'),
            'longer' => __('Longer', 'smartcloud-ai-kit'),
        ];

        self::$TONES = [
            'neutral' => __('Neutral', 'smartcloud-ai-kit'),
            'formal' => __('Formal', 'smartcloud-ai-kit'),
            'casual' => __('Casual', 'smartcloud-ai-kit'),
        ];

        self::$REWRITE_TONES = [
            'as-is' => __('As-is', 'smartcloud-ai-kit'),
            'more-formal' => __('More Formal', 'smartcloud-ai-kit'),
            'more-casual' => __('More Casual', 'smartcloud-ai-kit'),
        ];

        self::$TYPES = [
            'key-points' => __('Key Points', 'smartcloud-ai-kit'),
            'headline' => __('Headline', 'smartcloud-ai-kit'),
            'teaser' => __('Teaser', 'smartcloud-ai-kit'),
            'tldr' => __('TL;DR', 'smartcloud-ai-kit'),
        ];

        self::$MODES = [
            '' => '',
            'write' => __('Write', 'smartcloud-ai-kit'),
            'rewrite' => __('Rewrite', 'smartcloud-ai-kit'),
            'translate' => __('Translate', 'smartcloud-ai-kit'),
            'proofread' => __('Proofread', 'smartcloud-ai-kit'),
            'summarize' => __('Summarize', 'smartcloud-ai-kit'),
        ];
    }

    public function get_categories()
    {
        return ['smartcloud-ai-kit'];
    }
}

/**
 * AI-Kit Feature Widget
 */
class AiKit_Feature_Widget extends AiKit_Base_Widget
{
    public function get_name()
    {
        return 'smartcloud_ai_kit_feature';
    }

    public function get_title()
    {
        return __('AI Feature (PRO)', 'smartcloud-ai-kit');
    }

    public function get_icon()
    {
        return 'eicon-ai';
    }

    protected function register_controls()
    {
        // Basic Settings
        $this->start_controls_section('basic_section', [
            'label' => __('Basic Settings', 'smartcloud-ai-kit'),
        ]);

        $this->add_control('mode', [
            'label' => __('Mode', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => self::$MODES,
        ]);

        $this->add_control('variation', [
            'label' => __('Variation', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => self::$VARIATIONS,
            'default' => 'default',
        ]);

        $this->add_control('editable', [
            'label' => __('Editable', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => 'true',
        ]);

        $this->add_control('autoRun', [
            'label' => __('Auto Run', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => 'true',
        ]);

        $this->add_control('onDeviceTimeout', [
            'label' => __('On-Device Timeout (ms)', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::NUMBER,
        ]);

        $this->add_control('showRegenerateOnBackendButton', [
            'label' => __('Show Regenerate On Backend Button', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => 'true',
        ]);

        $this->add_control('inputSelector', [
            'label' => __('Input Selector', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::TEXT,
            'description' => __('CSS selector for input element', 'smartcloud-ai-kit'),
        ]);

        $this->add_control('outputSelector', [
            'label' => __('Output Selector', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::TEXT,
            'description' => __('CSS selector for output element', 'smartcloud-ai-kit'),
        ]);

        $this->end_controls_section();

        // Default Values
        $this->start_controls_section('default_section', [
            'label' => __('Default Values', 'smartcloud-ai-kit'),
        ]);

        $this->add_control('default_text', [
            'label' => __('Text', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::TEXTAREA,
            'condition' => [
                'mode' => 'write',
            ],
        ]);

        $this->add_control('allowOverride_text', [
            'label' => __('Allow Override', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => 'true',
            'condition' => [
                'mode' => 'write',
            ],
        ]);

        $this->add_control('divider_text', [
            'type' => \Elementor\Controls_Manager::DIVIDER,
            'condition' => [
                'mode' => 'write',
            ],
        ]);

        $this->add_control('default_instructions', [
            'label' => __('Instructions', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::TEXTAREA,
            'condition' => [
                'mode' => ['write', 'rewrite'],
            ],
        ]);

        $this->add_control('allowOverride_instructions', [
            'label' => __('Allow Override', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => 'true',
            'condition' => [
                'mode' => ['write', 'rewrite'],
            ],
        ]);

        $this->add_control('divider_instructions', [
            'type' => \Elementor\Controls_Manager::DIVIDER,
            'condition' => [
                'mode' => ['write', 'rewrite'],
            ],
        ]);

        $this->add_control('default_tone', [
            'label' => __('Tone', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => self::$TONES,
            'default' => 'neutral',
            'condition' => [
                'mode' => ['write'],
            ],
        ]);

        $this->add_control('default_rewrite_tone', [
            'label' => __('Tone', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => self::$REWRITE_TONES,
            'default' => 'as-is',
            'condition' => [
                'mode' => ['rewrite'],
            ],
        ]);

        $this->add_control('allowOverride_tone', [
            'label' => __('Allow Override', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => 'true',
            'condition' => [
                'mode' => ['write', 'rewrite'],
            ],
        ]);

        $this->add_control('divider_tone', [
            'type' => \Elementor\Controls_Manager::DIVIDER,
            'condition' => [
                'mode' => ['write', 'rewrite'],
            ],
        ]);

        $this->add_control('default_length', [
            'label' => __('Length', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => self::$LENGTHS,
            'default' => 'short',
            'condition' => [
                'mode' => ['write', 'summarize'],
            ],
        ]);

        $this->add_control('default_rewrite_length', [
            'label' => __('Length', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => self::$REWRITE_LENGTHS,
            'default' => 'as-is',
            'condition' => [
                'mode' => ['rewrite'],
            ],
        ]);

        $this->add_control('allowOverride_length', [
            'label' => __('Allow Override', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => 'true',
            'condition' => [
                'mode' => ['write', 'rewrite', 'summarize'],
            ],
        ]);

        $this->add_control('divider_length', [
            'type' => \Elementor\Controls_Manager::DIVIDER,
            'condition' => [
                'mode' => ['write', 'rewrite', 'summarize'],
            ],
        ]);

        $this->add_control('default_type', [
            'label' => __('Type', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => self::$TYPES,
            'default' => 'key-points',
            'condition' => [
                'mode' => 'summarize',
            ],
        ]);

        $this->add_control('allowOverride_type', [
            'label' => __('Allow Override', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => 'true',
            'condition' => [
                'mode' => 'summarize',
            ],
        ]);

        $this->add_control('divider_type', [
            'type' => \Elementor\Controls_Manager::DIVIDER,
            'condition' => [
                'mode' => 'summarize',
            ],
        ]);

        $this->add_control('default_outputLanguage', [
            'label' => __('Output Language', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => array_merge(['' => ''], self::$LANGUAGES),
            'condition' => [
                'mode' => ['write', 'rewrite', 'translate', 'summarize'],
            ],
        ]);

        $this->add_control('allowOverride_outputLanguage', [
            'label' => __('Allow Override', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => 'true',
            'condition' => [
                'mode' => ['write', 'rewrite', 'translate', 'summarize'],
            ],
        ]);

        $this->add_control('divider_outputLanguage', [
            'type' => \Elementor\Controls_Manager::DIVIDER,
            'condition' => [
                'mode' => ['write', 'rewrite', 'translate', 'summarize'],
            ],
        ]);

        $this->add_control('default_outputFormat', [
            'label' => __('Output Format', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => [
                'markdown' => __('Markdown', 'smartcloud-ai-kit'),
                'plain-text' => __('Plain Text', 'smartcloud-ai-kit'),
                'html' => __('HTML', 'smartcloud-ai-kit'),
            ],
            'default' => 'markdown',
        ]);

        $this->end_controls_section();

        // UI Settings
        $this->start_controls_section('ui_section', [
            'label' => __('UI Settings', 'smartcloud-ai-kit'),
        ]);

        $this->add_control('language', [
            'label' => __('Language', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => self::$LANGUAGES,
            'default' => 'en',
        ]);

        $this->add_control('direction', [
            'label' => __('Direction', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => self::$DIRECTIONS,
            'default' => 'auto',
        ]);

        $this->add_control('title', [
            'label' => __('Title', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::TEXT,
        ]);

        $this->add_control('openButtonTitle', [
            'label' => __('Open Button Title', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::TEXT,
        ]);

        $this->add_control('openButtonIcon', [
            'label' => __('Open Button Icon', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::TEXT,
        ]);

        $this->add_control('showOpenButtonTitle', [
            'label' => __('Show Open Button Title', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => 'true',
        ]);

        $this->add_control('showOpenButtonIcon', [
            'label' => __('Show Open Button Icon', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => 'true',
        ]);

        $this->add_control('acceptButtonTitle', [
            'label' => __('Accept Button Title', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::TEXT,
        ]);

        $this->add_control('optionsDisplay', [
            'label' => __('Options Display', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => [
                'collapse' => __('Collapse', 'smartcloud-ai-kit'),
                'vertical' => __('Vertical', 'smartcloud-ai-kit'),
                'horizontal' => __('Horizontal', 'smartcloud-ai-kit'),
            ],
            'default' => 'collapse',
            'description' => __('Choose how options are displayed: collapsed, vertical, or horizontal.', 'smartcloud-ai-kit'),
        ]);

        $this->end_controls_section();

        // Appearance
        $this->start_controls_section('appearance_section', [
            'label' => __('Appearance', 'smartcloud-ai-kit'),
        ]);

        $this->add_control('colorMode', [
            'label' => __('Color Mode', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => self::$COLOR_MODES,
            'default' => 'auto',
        ]);

        $this->add_control('primaryColor', [
            'label' => __('Primary Color', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => [
                'cyan' => __('Cyan', 'smartcloud-ai-kit'),
                'blue' => __('Blue', 'smartcloud-ai-kit'),
                'indigo' => __('Indigo', 'smartcloud-ai-kit'),
                'violet' => __('Violet', 'smartcloud-ai-kit'),
                'grape' => __('Grape', 'smartcloud-ai-kit'),
                'pink' => __('Pink', 'smartcloud-ai-kit'),
                'red' => __('Red', 'smartcloud-ai-kit'),
                'orange' => __('Orange', 'smartcloud-ai-kit'),
                'yellow' => __('Yellow', 'smartcloud-ai-kit'),
                'lime' => __('Lime', 'smartcloud-ai-kit'),
                'green' => __('Green', 'smartcloud-ai-kit'),
                'teal' => __('Teal', 'smartcloud-ai-kit'),
                'gray' => __('Gray', 'smartcloud-ai-kit'),
                'dark' => __('Dark', 'smartcloud-ai-kit'),
                'custom' => __('Custom', 'smartcloud-ai-kit'),
            ],
            'description' => __('Mantine theme color name', 'smartcloud-ai-kit'),
            'default' => 'blue',

        ]);

        $this->add_control('customColor', [
            'label' => __('Custom Color', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::COLOR,
            'description' => __('Custom color hex value (used when Primary Color is set to Custom)', 'smartcloud-ai-kit'),
            'condition' => [
                'primaryColor' => 'custom',
            ],
        ]);

        $this->add_control('primaryShade_light', [
            'label' => __('Primary Shade (Light)', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => [
                '' => __('Default', 'smartcloud-ai-kit'),
                '0' => '0',
                '1' => '1',
                '2' => '2',
                '3' => '3',
                '4' => '4',
                '5' => '5',
                '6' => '6',
                '7' => '7',
                '8' => '8',
                '9' => '9',
            ],
            'description' => __('Primary shade for light mode (0-9)', 'smartcloud-ai-kit'),
        ]);

        $this->add_control('primaryShade_dark', [
            'label' => __('Primary Shade (Dark)', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => [
                '' => __('Default', 'smartcloud-ai-kit'),
                '0' => '0',
                '1' => '1',
                '2' => '2',
                '3' => '3',
                '4' => '4',
                '5' => '5',
                '6' => '6',
                '7' => '7',
                '8' => '8',
                '9' => '9',
            ],
            'description' => __('Primary shade for dark mode (0-9)', 'smartcloud-ai-kit'),
        ]);

        $this->add_control('themeOverrides', [
            'label' => __('Theme Overrides (CSS)', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::TEXTAREA,
            'description' => __('Custom CSS for theming', 'smartcloud-ai-kit'),
        ]);

        $this->end_controls_section();
    }

    protected function render()
    {
        $all = $this->get_settings_for_display();

        // Simple attributes that go in shortcode attributes
        $simple_attrs = [
            'mode',
            'variation',
            'editable',
            'autoRun',
            'onDeviceTimeout',
            'showRegenerateOnBackendButton',
            'title',
            'openButtonTitle',
            'openButtonIcon',
            'showOpenButtonTitle',
            'showOpenButtonIcon',
            'acceptButtonTitle',
            'optionsDisplay',
            'colorMode',
            'language',
            'direction',
            'primaryColor',
        ];

        // SWITCHER fields that need explicit boolean values
        $switcher_fields = ['editable', 'autoRun', 'showRegenerateOnBackendButton', 'showOpenButtonTitle', 'showOpenButtonIcon'];

        // Filter settings to only include allowed attributes with non-empty values
        $atts = array_intersect_key($all, array_flip($simple_attrs));

        // Handle SWITCHER fields explicitly: convert to 'true' or 'false'
        foreach ($switcher_fields as $field) {
            $atts[$field] = $atts[$field] === 'true' ? 'true' : 'false';
        }

        // Filter out empty values except for explicit SWITCHER fields
        $atts = array_filter(
            $atts,
            fn($v, $k) =>
            in_array($k, $switcher_fields) || (!is_array($v) && !is_object($v) && $v !== ''),
            ARRAY_FILTER_USE_BOTH
        );

        // Build YAML body for complex attributes
        $yaml_parts = [];

        // default object
        $default = [];
        $default_fields = ['text', 'instructions', 'tone', 'length', 'type', 'outputLanguage', 'outputFormat'];
        foreach ($default_fields as $field) {
            // Special case: if mode is 'rewrite' and field is 'length', use 'default_rewrite_length'
            if ($field === 'length' && isset($all['mode']) && $all['mode'] === 'rewrite') {
                if (!empty($all['default_rewrite_length'])) {
                    $default[$field] = $all['default_rewrite_length'];
                }
            } else if ($field === 'tone' && isset($all['mode']) && $all['mode'] === 'rewrite') {
                if (!empty($all['default_rewrite_tone'])) {
                    $default[$field] = $all['default_rewrite_tone'];
                }
            } else {
                if (!empty($all["default_$field"])) {
                    $default[$field] = $all["default_$field"];
                }
            }
        }
        if (!empty($default)) {
            $yaml_parts[] = 'default:';
            foreach ($default as $key => $value) {
                $yaml_parts[] = "  $key: " . $this->yaml_encode_value($value);
            }
        }

        // allowOverride object
        $allow_override = [];
        $override_fields = ['text', 'instructions', 'tone', 'length', 'type', 'outputLanguage'];
        foreach ($override_fields as $field) {
            if (isset($all["allowOverride_$field"])) {
                $allow_override[$field] = $all["allowOverride_$field"] === 'true';
            }
        }
        if (!empty($allow_override)) {
            $yaml_parts[] = 'allowOverride:';
            foreach ($allow_override as $key => $value) {
                $yaml_parts[] = "  $key: " . ($value ? 'true' : 'false');
            }
        }

        // colors object
        $colors = [];

        // If customColor is set and primaryColor is 'custom', add it to colors
        if (!empty($all['customColor']) && !empty($all['primaryColor']) && $all['primaryColor'] === 'custom') {
            $custom_color = $all['customColor'];
            // Ensure it's a valid hex color (with or without #)
            if (preg_match('/^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/', $custom_color)) {
                // Add # prefix if missing
                $colors['custom'] = (strpos($custom_color, '#') === 0) ? $custom_color : '#' . $custom_color;
            }
        }

        // Also include any existing colors array
        if (!empty($all['colors']) && is_array($all['colors'])) {
            $colors = array_merge($colors, $all['colors']);
        }

        if (!empty($colors)) {
            $yaml_parts[] = 'colors:';
            foreach ($colors as $key => $value) {
                $yaml_parts[] = "  $key: " . $this->yaml_encode_value($value);
            }
        }

        // primaryShade object
        if (!empty($all['primaryShade_light']) || !empty($all['primaryShade_dark'])) {
            $yaml_parts[] = 'primaryShade:';
            if (!empty($all['primaryShade_light'])) {
                $yaml_parts[] = '  light: ' . intval($all['primaryShade_light']);
            }
            if (!empty($all['primaryShade_dark'])) {
                $yaml_parts[] = '  dark: ' . intval($all['primaryShade_dark']);
            }
        }

        // themeOverrides
        if (!empty($all['themeOverrides'])) {
            // Escape and indent the CSS content
            $theme_overrides = trim($all['themeOverrides']);
            $yaml_parts[] = 'themeOverrides: |';
            foreach (explode("\n", $theme_overrides) as $line) {
                $yaml_parts[] = '  ' . $line;
            }
        }

        // inputSelector and outputSelector should also be included in YAML if set
        if (!empty($all['inputSelector'])) {
            $yaml_parts[] = 'inputSelector: ' . $this->yaml_encode_value($all['inputSelector']);
        }
        if (!empty($all['outputSelector'])) {
            $yaml_parts[] = 'outputSelector: ' . $this->yaml_encode_value($all['outputSelector']);
        }

        $body = !empty($yaml_parts) ? implode("\n", $yaml_parts) : '';
        smartcloud_ai_kit_do_shortcode('smartcloud-ai-kit-feature', $atts, $body);
    }

    private function yaml_encode_value($value)
    {
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_numeric($value)) {
            return $value;
        }
        // Escape special characters and quote strings
        if (strpos($value, ':') !== false || strpos($value, '#') !== false || strpos($value, '"') !== false) {
            return '"' . str_replace('"', '\\"', $value) . '"';
        }
        return $value;
    }
}

/**
 * AI-Kit Doc Search Widget
 */
class AiKit_DocSearch_Widget extends AiKit_Base_Widget
{
    public function get_name()
    {
        return 'smartcloud_ai_kit_doc_search';
    }

    public function get_title()
    {
        return __('Doc Search (PRO)', 'smartcloud-ai-kit');
    }

    public function get_icon()
    {
        return 'eicon-search';
    }

    protected function register_controls()
    {
        // Basic Settings
        $this->start_controls_section('basic_section', [
            'label' => __('Basic Settings', 'smartcloud-ai-kit'),
        ]);

        $this->add_control('variation', [
            'label' => __('Variation', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => self::$VARIATIONS,
            'default' => 'default',
        ]);

        $this->add_control('autoRun', [
            'label' => __('Auto Run', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
        ]);

        $this->add_control('title', [
            'label' => __('Title', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::TEXT,
        ]);

        $this->add_control('inputSelector', [
            'label' => __('Input Selector', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::TEXT,
            'description' => __('CSS selector for input element', 'smartcloud-ai-kit'),
        ]);

        $this->add_control('showOpenButton', [
            'label' => __('Show Open Button', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => '',
        ]);

        $this->add_control('openButtonTitle', [
            'label' => __('Open Button Title', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::TEXT,
            'condition' => [
                'showOpenButton' => 'true',
            ],
        ]);

        $this->add_control('showOpenButtonTitle', [
            'label' => __('Show Open Button Title', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => 'true',
            'condition' => [
                'showOpenButton' => 'true',
            ],
        ]);

        $this->add_control('openButtonIcon', [
            'label' => __('Open Button Icon', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::TEXT,
            'condition' => [
                'showOpenButton' => 'true',
            ],
        ]);

        $this->add_control('showOpenButtonIcon', [
            'label' => __('Show Open Button Icon', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => 'true',
            'condition' => [
                'showOpenButton' => 'true',
            ],
        ]);

        $this->end_controls_section();

        // Search Settings
        $this->start_controls_section('search_section', [
            'label' => __('Search Settings', 'smartcloud-ai-kit'),
        ]);

        $this->add_control('topK', [
            'label' => __('Top K Results', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::NUMBER,
            'default' => 10,
            'min' => 1,
            'max' => 50,
        ]);

        $this->add_control('snippetMaxChars', [
            'label' => __('Snippet Max Characters', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::NUMBER,
            'default' => 160,
            'min' => 50,
            'max' => 500,
        ]);

        $this->add_control('searchButtonIcon', [
            'label' => __('Search Button Icon', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::TEXT,
        ]);

        $this->add_control('showSearchButtonTitle', [
            'label' => __('Show Search Button Title', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => 'true',
        ]);

        $this->add_control('showSearchButtonIcon', [
            'label' => __('Show Search Button Icon', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => 'true',
        ]);

        $this->end_controls_section();

        // User Filters (PRO feature)
        $this->start_controls_section('user_filters_section', [
            'label' => __('User Filters', 'smartcloud-ai-kit'),
        ]);

        $this->add_control('enableUserFilters', [
            'label' => __('Enable Category/Tag Filters', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'return_value' => 'true',
            'default' => '',
            'description' => __('Allow users to select categories and tags for filtering results', 'smartcloud-ai-kit'),
        ]);

        $this->add_control('user_filters_note', [
            'type' => \Elementor\Controls_Manager::RAW_HTML,
            'raw' => __('When enabled, filter options are loaded from your backend metadata-config.yaml. Users can select categories, subcategories, and tags to narrow search results.', 'smartcloud-ai-kit'),
            'content_classes' => 'elementor-panel-alert elementor-panel-alert-info',
        ]);

        $this->end_controls_section();

        // Appearance
        $this->start_controls_section('appearance_section', [
            'label' => __('Appearance', 'smartcloud-ai-kit'),
        ]);

        $this->add_control('colorMode', [
            'label' => __('Color Mode', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => self::$COLOR_MODES,
            'default' => 'auto',
        ]);

        $this->add_control('language', [
            'label' => __('Language', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => self::$LANGUAGES,
            'default' => 'en',
        ]);

        $this->add_control('direction', [
            'label' => __('Direction', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => self::$DIRECTIONS,
            'default' => 'auto',
        ]);

        $this->add_control('primaryColor', [
            'label' => __('Primary Color', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => [
                'cyan' => __('Cyan', 'smartcloud-ai-kit'),
                'blue' => __('Blue', 'smartcloud-ai-kit'),
                'indigo' => __('Indigo', 'smartcloud-ai-kit'),
                'violet' => __('Violet', 'smartcloud-ai-kit'),
                'grape' => __('Grape', 'smartcloud-ai-kit'),
                'pink' => __('Pink', 'smartcloud-ai-kit'),
                'red' => __('Red', 'smartcloud-ai-kit'),
                'orange' => __('Orange', 'smartcloud-ai-kit'),
                'yellow' => __('Yellow', 'smartcloud-ai-kit'),
                'lime' => __('Lime', 'smartcloud-ai-kit'),
                'green' => __('Green', 'smartcloud-ai-kit'),
                'teal' => __('Teal', 'smartcloud-ai-kit'),
                'gray' => __('Gray', 'smartcloud-ai-kit'),
                'dark' => __('Dark', 'smartcloud-ai-kit'),
                'custom' => __('Custom', 'smartcloud-ai-kit'),
            ],
            'description' => __('Mantine theme color name', 'smartcloud-ai-kit'),
            'default' => 'blue',
        ]);

        $this->add_control('customColor', [
            'label' => __('Custom Color', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::COLOR,
            'description' => __('Custom color hex value (used when Primary Color is set to Custom)', 'smartcloud-ai-kit'),
            'condition' => [
                'primaryColor' => 'custom',
            ],
        ]);

        $this->add_control('primaryShade_light', [
            'label' => __('Primary Shade (Light)', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => [
                '' => __('Default', 'smartcloud-ai-kit'),
                '0' => '0',
                '1' => '1',
                '2' => '2',
                '3' => '3',
                '4' => '4',
                '5' => '5',
                '6' => '6',
                '7' => '7',
                '8' => '8',
                '9' => '9',
            ],
            'description' => __('Primary shade for light mode (0-9)', 'smartcloud-ai-kit'),
        ]);

        $this->add_control('primaryShade_dark', [
            'label' => __('Primary Shade (Dark)', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::SELECT,
            'options' => [
                '' => __('Default', 'smartcloud-ai-kit'),
                '0' => '0',
                '1' => '1',
                '2' => '2',
                '3' => '3',
                '4' => '4',
                '5' => '5',
                '6' => '6',
                '7' => '7',
                '8' => '8',
                '9' => '9',
            ],
            'description' => __('Primary shade for dark mode (0-9)', 'smartcloud-ai-kit'),
        ]);

        $this->add_control('themeOverrides', [
            'label' => __('Theme Overrides (CSS)', 'smartcloud-ai-kit'),
            'type' => \Elementor\Controls_Manager::TEXTAREA,
            'description' => __('Custom CSS for theming', 'smartcloud-ai-kit'),
        ]);

        $this->end_controls_section();
    }

    protected function render()
    {
        $all = $this->get_settings_for_display();

        // Simple attributes that go in shortcode attributes
        $simple_attrs = [
            'variation',
            'autoRun',
            'enableUserFilters',
            'title',
            'showOpenButton',
            'openButtonTitle',
            'showOpenButtonTitle',
            'openButtonIcon',
            'showOpenButtonIcon',
            'searchButtonIcon',
            'showSearchButtonTitle',
            'showSearchButtonIcon',
            'language',
            'direction',
            'colorMode',
            'primaryColor',
            'topK',
            'snippetMaxChars'
        ];

        // SWITCHER fields that need explicit boolean values
        $switcher_fields = ['autoRun', 'enableUserFilters', 'showOpenButton', 'showOpenButtonTitle', 'showOpenButtonIcon', 'showSearchButtonTitle', 'showSearchButtonIcon'];

        // Filter settings to only include allowed attributes with non-empty values
        $atts = array_intersect_key($all, array_flip($simple_attrs));

        // Handle SWITCHER fields explicitly: convert to 'true' or 'false'
        foreach ($switcher_fields as $field) {
            $atts[$field] = $atts[$field] === 'true' ? 'true' : 'false';
        }

        // Filter out empty values except for explicit SWITCHER fields
        $atts = array_filter(
            $atts,
            fn($v, $k) =>
            in_array($k, $switcher_fields) || (!is_array($v) && !is_object($v) && $v !== ''),
            ARRAY_FILTER_USE_BOTH
        );

        // Build YAML body for complex attributes
        $yaml_parts = [];

        // colors object
        $colors = [];

        // If customColor is set and primaryColor is 'custom', add it to colors
        if (!empty($all['customColor']) && !empty($all['primaryColor']) && $all['primaryColor'] === 'custom') {
            $custom_color = $all['customColor'];
            // Ensure it's a valid hex color (with or without #)
            if (preg_match('/^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/', $custom_color)) {
                // Add # prefix if missing
                $colors['custom'] = (strpos($custom_color, '#') === 0) ? $custom_color : '#' . $custom_color;
            }
        }

        // Also include any existing colors array
        if (!empty($all['colors']) && is_array($all['colors'])) {
            $colors = array_merge($colors, $all['colors']);
        }

        if (!empty($colors)) {
            $yaml_parts[] = 'colors:';
            foreach ($colors as $key => $value) {
                $yaml_parts[] = "  $key: " . $this->yaml_encode_value($value);
            }
        }

        // primaryShade object
        if (!empty($all['primaryShade_light']) || !empty($all['primaryShade_dark'])) {
            $yaml_parts[] = 'primaryShade:';
            if (!empty($all['primaryShade_light'])) {
                $yaml_parts[] = '  light: ' . intval($all['primaryShade_light']);
            }
            if (!empty($all['primaryShade_dark'])) {
                $yaml_parts[] = '  dark: ' . intval($all['primaryShade_dark']);
            }
        }

        // themeOverrides
        if (!empty($all['themeOverrides'])) {
            // Escape and indent the CSS content
            $theme_overrides = trim($all['themeOverrides']);
            $yaml_parts[] = 'themeOverrides: |';
            foreach (explode("\n", $theme_overrides) as $line) {
                $yaml_parts[] = '  ' . $line;
            }
        }

        // inputSelector should also be included in YAML if set
        if (!empty($all['inputSelector'])) {
            $yaml_parts[] = 'inputSelector: ' . $this->yaml_encode_value($all['inputSelector']);
        }

        $body = !empty($yaml_parts) ? implode("\n", $yaml_parts) : '';

        smartcloud_ai_kit_do_shortcode('smartcloud-ai-kit-doc-search', $atts, $body);
    }

    private function yaml_encode_value($value)
    {
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_numeric($value)) {
            return $value;
        }
        // Escape special characters and quote strings
        if (strpos($value, ':') !== false || strpos($value, '#') !== false || strpos($value, '"') !== false) {
            return '"' . str_replace('"', '\\"', $value) . '"';
        }
        return $value;
    }
}

// Register widgets
add_action('elementor/widgets/register', static function ($widgets_manager) {
    $widgets_manager->register(new \SmartCloud\WPSuite\AiKit\AiKit_Feature_Widget());
    $widgets_manager->register(new \SmartCloud\WPSuite\AiKit\AiKit_DocSearch_Widget());
});
