<?php
/**
 * KB Content Parser - Parse WordPress posts into KB sections
 *
 * Detects Gutenberg blocks and Elementor widgets, extracts sections,
 * and prepares content for Knowledge Base ingestion.
 */

namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

if (!defined('ABSPATH')) {
    exit;
}

class Parser
{
    private Converter $converter;
    private ?\WP_Post $current_post = null;

    public function __construct()
    {
        $this->converter = new Converter();
    }

    /**
     * Parse a WordPress post into KB sections grouped by doc_id
     *
     * @return array Sections grouped by doc_id: ['post-123/base' => [section1, section2...], ...]
     */
    public function parsePost(\WP_Post $post): array
    {
        $this->current_post = $post;

        // Detect content type
        if ($this->isElementorPost($post)) {
            return $this->parseElementorPost($post);
        } elseif ($this->isGutenbergPost($post)) {
            return $this->parseGutenbergPost($post);
        } else {
            return $this->parseClassicPost($post);
        }
    }

    /**
     * Check if post uses Gutenberg blocks
     */
    private function isGutenbergPost(\WP_Post $post): bool
    {
        return has_blocks($post->post_content);
    }

    /**
     * Check if post uses Elementor
     */
    private function isElementorPost(\WP_Post $post): bool
    {
        // Check if Elementor data exists
        $elementor_data = get_post_meta($post->ID, '_elementor_data', true);
        return !empty($elementor_data);
    }

    /**
     * Parse Gutenberg post with block detection
     */
    private function parseGutenbergPost(\WP_Post $post): array
    {
        $blocks = parse_blocks($post->post_content);

        // Check if there are any smartcloud-ai-kit/kb-section blocks
        $has_kb_sections = $this->hasKbSectionBlocks($blocks);

        if ($has_kb_sections) {
            return $this->parseGutenbergWithSections($post, $blocks);
        } else {
            return $this->parseGutenbergSimple($post, $blocks);
        }
    }

    /**
     * Check if blocks contain smartcloud-ai-kit/kb-section blocks (recursively)
     */
    private function hasKbSectionBlocks(array $blocks): bool
    {
        foreach ($blocks as $block) {
            if (($block['blockName'] ?? '') === 'smartcloud-ai-kit/kb-section') {
                return true;
            }

            if (!empty($block['innerBlocks'])) {
                if ($this->hasKbSectionBlocks($block['innerBlocks'])) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Parse Gutenberg post with smartcloud-ai-kit/kb-section blocks
     * Sections are extracted and grouped by doc_id
     */
    private function parseGutenbergWithSections(\WP_Post $post, array $blocks): array
    {
        $sections_by_doc = [];
        $base_content_blocks = [];
        $sort_order = 0;

        foreach ($blocks as $block) {
            if (($block['blockName'] ?? '') === 'smartcloud-ai-kit/kb-section') {
                // This is a KB section block
                $section = $this->parseKbSectionBlock($post, $block, $sort_order);

                if ($section['mode'] !== 'exclude') {
                    $doc_id = $section['doc_id'];

                    if (!isset($sections_by_doc[$doc_id])) {
                        $sections_by_doc[$doc_id] = [];
                    }

                    $sections_by_doc[$doc_id][] = $section;
                    $sort_order++;
                }
            } else {
                // Regular content - goes to base doc
                $base_content_blocks[] = $block;
            }
        }

        // Process base content if any
        if (!empty($base_content_blocks)) {
            $base_doc_id = "post-{$post->ID}/base";

            $category_hierarchy = $this->getPostCategoryHierarchy($post);

            $base_section = [
                'post_id' => $post->ID,
                'doc_id' => $base_doc_id,
                'section_id' => 'main',
                'mode' => 'inherit',
                'sort_order' => 0,
                'title' => $post->post_title,
                'category' => $category_hierarchy['category'],
                'subcategory' => $category_hierarchy['subcategory'],
                'tags' => $this->getPostTags($post),
                'md' => $this->converter->blocksToMarkdown($base_content_blocks),
                'generated_at' => current_time('mysql'),
                'source_updated_at' => $post->post_modified,
            ];

            $base_section['origin_hash'] = $this->calculateOriginHash($base_section);

            if (!isset($sections_by_doc[$base_doc_id])) {
                $sections_by_doc[$base_doc_id] = [];
            }

            array_unshift($sections_by_doc[$base_doc_id], $base_section);
        }

        return $sections_by_doc;
    }

    /**
     * Parse a single smartcloud-ai-kit/kb-section block
     */
    private function parseKbSectionBlock(\WP_Post $post, array $block, int $sort_order): array
    {
        $attrs = $block['attrs'] ?? [];
        $inner_blocks = $block['innerBlocks'] ?? [];

        // Extract attributes
        $mode = $attrs['mode'] ?? 'inherit';
        $section_key = $attrs['sectionKey'] ?? null;
        $doc_key = $attrs['docKey'] ?? null;
        $title = $attrs['title'] ?? null;
        $tags = $attrs['tags'] ?? null;
        $category = $attrs['category'] ?? null;
        $subcategory = $attrs['subcategory'] ?? null;
        $priority = $attrs['priority'] ?? null;

        // Generate stable IDs
        $section_id = $section_key ?? $this->generateSectionId($block);

        // Determine doc_id
        if ($mode === 'separate_doc' && !empty($doc_key)) {
            $doc_id = "post-{$post->ID}/{$doc_key}";
        } else {
            $doc_id = "post-{$post->ID}/base";
        }

        // Convert inner blocks to markdown
        $md = $this->converter->blocksToMarkdown($inner_blocks);

        // Get category hierarchy if not overridden
        $category_hierarchy = $this->getPostCategoryHierarchy($post);

        // Build section data
        $section = [
            'post_id' => $post->ID,
            'doc_id' => $doc_id,
            'section_id' => $section_id,
            'mode' => $mode,
            'sort_order' => $sort_order,
            'title' => $title ?? $post->post_title,
            'category' => $category ?? $category_hierarchy['category'],
            'subcategory' => $subcategory ?? $category_hierarchy['subcategory'],
            'tags' => $tags ?? $this->getPostTags($post),
            'md' => $md,
            'generated_at' => current_time('mysql'),
            'source_updated_at' => $post->post_modified,
            'extra_meta' => [
                'block_type' => 'gutenberg',
                'priority' => $priority,
            ],
        ];

        $section['origin_hash'] = $this->calculateOriginHash($section);

        return $section;
    }

    /**
     * Parse Gutenberg post without KB sections (simple mode)
     */
    private function parseGutenbergSimple(\WP_Post $post, array $blocks): array
    {
        $doc_id = "post-{$post->ID}/base";

        $markdown = $this->converter->blocksToMarkdown($blocks);

        $category_hierarchy = $this->getPostCategoryHierarchy($post);

        $section = [
            'post_id' => $post->ID,
            'doc_id' => $doc_id,
            'section_id' => 'main',
            'mode' => 'inherit',
            'sort_order' => 0,
            'title' => $post->post_title,
            'category' => $category_hierarchy['category'],
            'subcategory' => $category_hierarchy['subcategory'],
            'tags' => $this->getPostTags($post),
            'md' => $markdown,
            'generated_at' => current_time('mysql'),
            'source_updated_at' => $post->post_modified,
        ];

        $section['origin_hash'] = $this->calculateOriginHash($section);

        return [$doc_id => [$section]];
    }

    /**
     * Parse Elementor post
     */
    private function parseElementorPost(\WP_Post $post): array
    {
        $elementor_data = get_post_meta($post->ID, '_elementor_data', true);

        if (empty($elementor_data)) {
            return $this->parseClassicPost($post);
        }

        $elements = json_decode($elementor_data, true);

        if (!is_array($elements)) {
            return $this->parseClassicPost($post);
        }

        // Check for KB section widgets
        $has_kb_widgets = $this->hasKbSectionWidgets($elements);

        if ($has_kb_widgets) {
            return $this->parseElementorWithSections($post, $elements);
        } else {
            return $this->parseElementorSimple($post, $elements);
        }
    }

    /**
     * Check if Elementor data contains KB section widgets or KB-enabled containers
     */
    private function hasKbSectionWidgets(array $elements): bool
    {
        foreach ($elements as $element) {
            $widget_type = $element['widgetType'] ?? $element['elType'] ?? '';

            // Check for standalone KB section widget (legacy)
            if ($widget_type === 'smartcloud_ai_kit_kb_section') {
                return true;
            }

            // Check for KB-enabled containers/sections
            $settings = $element['settings'] ?? [];
            if (!empty($settings['kb_enabled']) && $settings['kb_enabled'] === 'yes') {
                return true;
            }

            // Recursively check child elements
            if (!empty($element['elements'])) {
                if ($this->hasKbSectionWidgets($element['elements'])) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Parse Elementor post with KB section widgets
     */
    private function parseElementorWithSections(\WP_Post $post, array $elements): array
    {
        $sections_by_doc = [];
        $sort_order_counter = ['value' => 0];

        // Process all elements recursively
        $base_elements = $this->extractElementorKbSections($post, $elements, $sections_by_doc, $sort_order_counter);

        // Always create base doc if we have base elements OR if sections_by_doc is empty
        // (empty means we had KB sections but they were all excluded or separate_doc)
        if (!empty($base_elements) || empty($sections_by_doc)) {
            $base_doc_id = "post-{$post->ID}/base";

            $category_hierarchy = $this->getPostCategoryHierarchy($post);

            // If no base elements, still create empty base doc
            $markdown = '';
            if (!empty($base_elements)) {
                // Render base elements to HTML then convert to markdown
                $html = $this->renderElementorElements($post->ID, $base_elements);
                $markdown = $this->converter->htmlToMarkdown($html);
            }

            $base_section = [
                'post_id' => $post->ID,
                'doc_id' => $base_doc_id,
                'section_id' => 'main',
                'mode' => 'inherit',
                'sort_order' => 0,
                'title' => $post->post_title,
                'category' => $category_hierarchy['category'],
                'subcategory' => $category_hierarchy['subcategory'],
                'tags' => $this->getPostTags($post),
                'md' => $markdown,
                'generated_at' => current_time('mysql'),
                'source_updated_at' => $post->post_modified,
                'extra_meta' => [
                    'source_type' => 'elementor',
                ],
            ];

            $base_section['origin_hash'] = $this->calculateOriginHash($base_section);

            if (!isset($sections_by_doc[$base_doc_id])) {
                $sections_by_doc[$base_doc_id] = [];
            }

            // Base section should be first
            array_unshift($sections_by_doc[$base_doc_id], $base_section);
        }

        return $sections_by_doc;
    }

    /**
     * Recursively extract KB sections and return remaining base elements
     * 
     * @param \WP_Post $post The post being parsed
     * @param array $elements Array of Elementor elements
     * @param array &$sections_by_doc Reference to sections_by_doc array to populate
     * @param array &$sort_order_counter Reference to counter array ['value' => int]
     * @return array Elements that should go to base doc
     */
    private function extractElementorKbSections(\WP_Post $post, array $elements, array &$sections_by_doc, array &$sort_order_counter): array
    {
        $base_elements = [];

        foreach ($elements as $element) {
            $settings = $element['settings'] ?? [];
            $kb_enabled = $settings['kb_enabled'] ?? '';

            // Check if this element is KB-enabled
            if ($kb_enabled === 'yes') {
                $kb_mode = $settings['kb_mode'] ?? 'inherit';

                // Skip excluded sections
                if ($kb_mode === 'exclude') {
                    continue;
                }

                // Parse this KB section (including all its children)
                $section = $this->parseElementorKbSection($post, $element, $sort_order_counter['value']);

                if ($section) {
                    $doc_id = $section['doc_id'];

                    if (!isset($sections_by_doc[$doc_id])) {
                        $sections_by_doc[$doc_id] = [];
                    }

                    $sections_by_doc[$doc_id][] = $section;
                    $sort_order_counter['value']++;
                }
            } else {
                // This element goes to base, but check its children recursively
                if (!empty($element['elements'])) {
                    // Process child elements
                    $processed_children = $this->extractElementorKbSections(
                        $post,
                        $element['elements'],
                        $sections_by_doc,
                        $sort_order_counter
                    );

                    // Replace children with processed children
                    $element['elements'] = $processed_children;
                }

                $base_elements[] = $element;
            }
        }

        return $base_elements;
    }

    /**
     * Parse a single Elementor KB section element
     */
    private function parseElementorKbSection(\WP_Post $post, array $element, int $sort_order): ?array
    {
        $settings = $element['settings'] ?? [];

        // Extract KB settings
        $mode = $settings['kb_mode'] ?? 'inherit';
        $section_key = $settings['kb_section_key'] ?? null;
        $doc_key = $settings['kb_doc_key'] ?? null;
        $doc_title = $settings['kb_doc_title'] ?? null;
        $title = $settings['kb_title'] ?? null;
        $category = $settings['kb_category'] ?? null;
        $subcategory = $settings['kb_subcategory'] ?? null;
        $tags_string = $settings['kb_tags'] ?? null;
        $priority = $settings['kb_priority'] ?? null;

        // Parse tags if provided (comma-separated string)
        $tags = null;
        if (!empty($tags_string)) {
            $tags = array_map('trim', explode(',', $tags_string));
        }

        // Generate stable section ID
        $section_id = $section_key ?? $element['id'] ?? ('section-' . uniqid());

        // Determine doc_id
        if ($mode === 'separate_doc') {
            if (empty($doc_key)) {
                // Use section_id as doc_key if not provided
                $doc_key = $section_id;
            }
            $doc_id = "post-{$post->ID}/{$doc_key}";

            // For separate docs, doc_title is required, fallback to post title
            if (empty($doc_title)) {
                $doc_title = $post->post_title;
            }
        } else {
            $doc_id = "post-{$post->ID}/base";
        }

        // Render this element to HTML then convert to markdown
        $html = $this->renderElementorElements($post->ID, [$element]);
        $markdown = $this->converter->htmlToMarkdown($html);

        // Get category hierarchy if not overridden
        $category_hierarchy = $this->getPostCategoryHierarchy($post);

        // Build section data
        $section = [
            'post_id' => $post->ID,
            'doc_id' => $doc_id,
            'section_id' => $section_id,
            'mode' => $mode,
            'sort_order' => $sort_order,
            'title' => ($mode === 'separate_doc' ? $doc_title : ($title ?? $post->post_title)),
            'category' => $category ?? $category_hierarchy['category'],
            'subcategory' => $subcategory ?? $category_hierarchy['subcategory'],
            'tags' => $tags ?? $this->getPostTags($post),
            'md' => $markdown,
            'generated_at' => current_time('mysql'),
            'source_updated_at' => $post->post_modified,
            'extra_meta' => [
                'source_type' => 'elementor',
                'priority' => $priority,
            ],
        ];

        $section['origin_hash'] = $this->calculateOriginHash($section);

        return $section;
    }

    /**
     * Render Elementor elements to HTML without modifying the post
     */
    private function renderElementorElements(int $post_id, array $elements): string
    {
        // If Elementor is not available, return empty
        if (!class_exists('\Elementor\Plugin')) {
            return '';
        }

        // If no elements, return empty
        if (empty($elements)) {
            return '';
        }

        try {
            // Use Elementor's rendering directly without modifying post meta
            $html = '';

            foreach ($elements as $element) {
                $html .= $this->renderElementorElement($element);
            }

            return $html;
        } catch (\Exception $e) {
            //error_log('KB Parser: Failed to render Elementor elements: ' . $e->getMessage());
            return '';
        }
    }

    /**
     * Render a single Elementor element recursively
     */
    private function renderElementorElement(array $element_data): string
    {
        if (!class_exists('\Elementor\Plugin')) {
            return '';
        }

        try {
            $element_type = $element_data['elType'] ?? '';

            if (empty($element_type)) {
                return '';
            }

            // Get the element instance
            $element = \Elementor\Plugin::instance()->elements_manager->create_element_instance($element_data);

            if (!$element) {
                return '';
            }

            // Render the element
            ob_start();
            $element->print_element();
            $html = ob_get_clean();

            return $html;
        } catch (\Exception $e) {
            //error_log('KB Parser: Failed to render single Elementor element: ' . $e->getMessage());
            return '';
        }
    }

    /**
     * Parse Elementor post without KB sections (render to HTML)
     */
    private function parseElementorSimple(\WP_Post $post, array $elements): array
    {
        $doc_id = "post-{$post->ID}/base";

        // Try to get rendered HTML from Elementor
        $html = '';

        if (class_exists('\Elementor\Plugin')) {
            try {
                $html = \Elementor\Plugin::instance()->frontend->get_builder_content($post->ID, true);
            } catch (\Exception $e) {
                // Fallback to post content
                $html = $post->post_content;
            }
        } else {
            // Elementor not active, use post content
            $html = $post->post_content;
        }

        $markdown = $this->converter->htmlToMarkdown($html);

        $category_hierarchy = $this->getPostCategoryHierarchy($post);

        $section = [
            'post_id' => $post->ID,
            'doc_id' => $doc_id,
            'section_id' => 'main',
            'mode' => 'inherit',
            'sort_order' => 0,
            'title' => $post->post_title,
            'category' => $category_hierarchy['category'],
            'subcategory' => $category_hierarchy['subcategory'],
            'tags' => $this->getPostTags($post),
            'md' => $markdown,
            'generated_at' => current_time('mysql'),
            'source_updated_at' => $post->post_modified,
            'extra_meta' => [
                'source_type' => 'elementor',
            ],
        ];

        $section['origin_hash'] = $this->calculateOriginHash($section);

        return [$doc_id => [$section]];
    }

    /**
     * Parse classic post (no blocks, no Elementor)
     */
    private function parseClassicPost(\WP_Post $post): array
    {
        $doc_id = "post-{$post->ID}/base";

        // Apply WordPress content filters (using core WP filter)
        // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound
        $content = apply_filters('the_content', $post->post_content);

        $markdown = $this->converter->htmlToMarkdown($content);

        $category_hierarchy = $this->getPostCategoryHierarchy($post);

        $section = [
            'post_id' => $post->ID,
            'doc_id' => $doc_id,
            'section_id' => 'main',
            'mode' => 'inherit',
            'sort_order' => 0,
            'title' => $post->post_title,
            'category' => $category_hierarchy['category'],
            'subcategory' => $category_hierarchy['subcategory'],
            'tags' => $this->getPostTags($post),
            'md' => $markdown,
            'generated_at' => current_time('mysql'),
            'source_updated_at' => $post->post_modified,
        ];

        $section['origin_hash'] = $this->calculateOriginHash($section);

        return [$doc_id => [$section]];
    }

    /**
     * Get post category and subcategory from WordPress taxonomy
     * Returns array with 'category' and 'subcategory' (null if flat)
     */
    private function getPostCategoryHierarchy(\WP_Post $post): array
    {
        $categories = get_the_category($post->ID);

        if (empty($categories)) {
            return ['category' => null, 'subcategory' => null];
        }

        // Find the first category that has a parent
        foreach ($categories as $cat) {
            if ($cat->parent != 0) {
                $parent = get_category($cat->parent);
                if ($parent) {
                    return [
                        'category' => $parent->name,
                        'subcategory' => $cat->name
                    ];
                }
            }
        }

        // No hierarchical categories found, use first category
        return [
            'category' => $categories[0]->name,
            'subcategory' => null
        ];
    }

    /**
     * Get post tags as array
     */
    private function getPostTags(\WP_Post $post): ?array
    {
        $tags = get_the_tags($post->ID);

        if (empty($tags) || is_wp_error($tags)) {
            return null;
        }

        return array_map(fn($tag) => $tag->name, $tags);
    }

    /**
     * Generate a stable section ID from block data
     */
    private function generateSectionId(array $block): string
    {
        // Try to use clientId if available
        if (!empty($block['attrs']['clientId'])) {
            return $block['attrs']['clientId'];
        }

        // Generate from content hash
        $content = $block['innerHTML'] ?? '';
        $inner_blocks = $block['innerBlocks'] ?? [];

        if (!empty($inner_blocks)) {
            $content .= serialize($inner_blocks);
        }

        return 'section-' . substr(md5($content), 0, 12);
    }

    /**
     * Calculate origin hash for a section
     */
    private function calculateOriginHash(array $section): string
    {
        $data = $section['md'] .
            ($section['title'] ?? '') .
            ($section['category'] ?? '') .
            json_encode($section['tags'] ?? []);

        return hash('sha256', $data);
    }
}
