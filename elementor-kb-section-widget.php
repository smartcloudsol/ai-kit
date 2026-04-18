<?php
/**
 * Elementor KB Section Widget
 *
 * Provides an Elementor container widget for designating KB sections.
 */

namespace SmartCloud\WPSuite\AiKit;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Register Elementor KB Section Widget
 */
class ElementorKBSectionWidget
{
    /**
     * Initialize the widget registration
     */
    public static function init(): void
    {
        // Only register if Elementor is active
        if (!did_action('elementor/loaded')) {
            return;
        }

        // Add KB Section controls to existing Section/Container elements
        add_action('elementor/element/section/section_advanced/after_section_end', [__CLASS__, 'add_kb_controls'], 10, 2);
        add_action('elementor/element/container/section_layout/after_section_end', [__CLASS__, 'add_kb_controls'], 10, 2);

        // Add frontend rendering
        add_action('elementor/frontend/section/before_render', [__CLASS__, 'before_render_section']);
        add_action('elementor/frontend/container/before_render', [__CLASS__, 'before_render_section']);
    }

    /**
     * Add KB Section controls to Section/Container elements
     */
    public static function add_kb_controls($element, $args): void
    {
        $element->start_controls_section(
            'kb_section_settings',
            [
                'label' => __('KB Section', 'smartcloud-ai-kit'),
                'tab' => \Elementor\Controls_Manager::TAB_ADVANCED,
            ]
        );

        $element->add_control(
            'kb_enabled',
            [
                'label' => __('Enable KB Section', 'smartcloud-ai-kit'),
                'type' => \Elementor\Controls_Manager::SWITCHER,
                'default' => '',
                'description' => __('Mark this section as a Knowledge Base section', 'smartcloud-ai-kit'),
            ]
        );

        $element->add_control(
            'kb_mode',
            [
                'label' => __('Mode', 'smartcloud-ai-kit'),
                'type' => \Elementor\Controls_Manager::SELECT,
                'default' => 'inherit',
                'options' => [
                    'inherit' => __('Inherit (part of base doc)', 'smartcloud-ai-kit'),
                    'separate_doc' => __('Separate Document', 'smartcloud-ai-kit'),
                    // phpcs:ignore WordPressVIPMinimum.Performance.WPQueryParams.PostNotIn_exclude -- This is an Elementor control option value, not a query parameter
                    'exclude' => __('Exclude from KB', 'smartcloud-ai-kit'),
                ],
                'condition' => [
                    'kb_enabled' => 'yes',
                ],
            ]
        );

        $element->add_control(
            'kb_doc_key',
            [
                'label' => __('Document Key', 'smartcloud-ai-kit'),
                'type' => \Elementor\Controls_Manager::TEXT,
                'placeholder' => __('e.g., pricing, faq', 'smartcloud-ai-kit'),
                'description' => __('Unique identifier for this document', 'smartcloud-ai-kit'),
                'condition' => [
                    'kb_enabled' => 'yes',
                    'kb_mode' => 'separate_doc',
                ],
            ]
        );

        $element->add_control(
            'kb_doc_title',
            [
                'label' => __('Document Title', 'smartcloud-ai-kit'),
                'type' => \Elementor\Controls_Manager::TEXT,
                'placeholder' => __('e.g., Pricing Information', 'smartcloud-ai-kit'),
                'description' => __('Title for this separate document', 'smartcloud-ai-kit'),
                'condition' => [
                    'kb_enabled' => 'yes',
                    'kb_mode' => 'separate_doc',
                ],
            ]
        );

        $element->add_control(
            'kb_doc_description',
            [
                'label' => __('Document Description', 'smartcloud-ai-kit'),
                'type' => \Elementor\Controls_Manager::TEXTAREA,
                'placeholder' => __('Short summary shown in Doc Search results', 'smartcloud-ai-kit'),
                'description' => __('Optional description stored in document metadata. Leave empty to use the source post excerpt.', 'smartcloud-ai-kit'),
                'condition' => [
                    'kb_enabled' => 'yes',
                    'kb_mode' => 'separate_doc',
                ],
            ]
        );

        $element->add_control(
            'kb_post_url',
            [
                'label' => __('Source URL', 'smartcloud-ai-kit'),
                'type' => \Elementor\Controls_Manager::URL,
                'placeholder' => ['url' => 'https://example.com/custom-page'],
                'description' => __('Optional URL stored in document metadata. Leave empty so separate documents can inherit the base document URL.', 'smartcloud-ai-kit'),
                'show_external' => false,
                'condition' => [
                    'kb_enabled' => 'yes',
                    'kb_mode' => 'separate_doc',
                ],
            ]
        );

        $element->add_control(
            'kb_section_key',
            [
                'label' => __('Section Key', 'smartcloud-ai-kit'),
                'type' => \Elementor\Controls_Manager::TEXT,
                'placeholder' => __('Optional custom identifier', 'smartcloud-ai-kit'),
                'description' => __('Leave empty to auto-generate', 'smartcloud-ai-kit'),
                'condition' => [
                    'kb_enabled' => 'yes',
                ],
            ]
        );

        $element->add_control(
            'kb_title',
            [
                'label' => __('Title Override', 'smartcloud-ai-kit'),
                'type' => \Elementor\Controls_Manager::TEXT,
                'condition' => [
                    'kb_enabled' => 'yes',
                    'kb_mode!' => 'separate_doc',
                ],
            ]
        );

        $element->add_control(
            'kb_category',
            [
                'label' => __('Category', 'smartcloud-ai-kit'),
                'type' => \Elementor\Controls_Manager::TEXT,
                'condition' => [
                    'kb_enabled' => 'yes',
                ],
            ]
        );

        $element->add_control(
            'kb_subcategory',
            [
                'label' => __('Subcategory', 'smartcloud-ai-kit'),
                'type' => \Elementor\Controls_Manager::TEXT,
                'condition' => [
                    'kb_enabled' => 'yes',
                ],
            ]
        );

        $element->add_control(
            'kb_tags',
            [
                'label' => __('Tags', 'smartcloud-ai-kit'),
                'type' => \Elementor\Controls_Manager::TEXTAREA,
                'placeholder' => __('tag1, tag2, tag3', 'smartcloud-ai-kit'),
                'condition' => [
                    'kb_enabled' => 'yes',
                ],
            ]
        );

        $element->add_control(
            'kb_priority',
            [
                'label' => __('Priority', 'smartcloud-ai-kit'),
                'type' => \Elementor\Controls_Manager::NUMBER,
                'condition' => [
                    'kb_enabled' => 'yes',
                ],
            ]
        );

        $element->end_controls_section();
    }

    /**
     * Add data attributes before rendering
     */
    public static function before_render_section($element): void
    {
        $settings = $element->get_settings();

        if (empty($settings['kb_enabled']) || $settings['kb_enabled'] !== 'yes') {
            return;
        }

        $mode = $settings['kb_mode'] ?? 'inherit';

        $element->add_render_attribute('_wrapper', 'class', 'wpsaik-kb-section');
        $element->add_render_attribute('_wrapper', 'data-mode', $mode);

        if (!empty($settings['kb_doc_key'])) {
            $element->add_render_attribute('_wrapper', 'data-doc-key', $settings['kb_doc_key']);
        }

        if (!empty($settings['kb_section_key'])) {
            $element->add_render_attribute('_wrapper', 'data-section-key', $settings['kb_section_key']);
        }

        if (!empty($settings['kb_doc_title'])) {
            $element->add_render_attribute('_wrapper', 'data-doc-title', $settings['kb_doc_title']);
        }
    }
}

// Initialize
ElementorKBSectionWidget::init();
