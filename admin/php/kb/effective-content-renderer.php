<?php
/**
 * Resolve the effective, public-facing content of a WordPress source.
 *
 * Block-theme templates can own meaningful content that is not persisted in
 * post_content, including server-rendered dynamic blocks. Knowledge Base
 * generation must render that content while excluding shared site chrome.
 */

namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

use SmartCloud\WPSuite\AiKit\Logger;

if (!defined('ABSPATH')) {
    exit;
}

final class EffectiveContentRenderer
{
    /**
     * Render the content visitors receive for a post, without global header,
     * footer, navigation, or template-part chrome.
     */
    public function render(\WP_Post $post): string
    {
        $fallback = $this->renderPostContent($post);
        $template = $this->resolveBlockTemplate($post);

        if (!is_object($template) || !isset($template->content) || !is_string($template->content)) {
            return $fallback;
        }

        $blocks = parse_blocks($template->content);
        if (!is_array($blocks) || $blocks === array()) {
            return $fallback;
        }

        $main_blocks = $this->findSemanticMainBlocks($blocks);
        $content_blocks = $main_blocks !== array()
            ? $main_blocks
            : array_values(array_filter($blocks, fn(array $block): bool => !$this->isSharedChrome($block)));

        if ($content_blocks === array()) {
            return $fallback;
        }

        $previous_post = $GLOBALS['post'] ?? null;
        $rendered = '';

        try {
            $GLOBALS['post'] = $post;
            setup_postdata($post);

            foreach ($content_blocks as $block) {
                $rendered .= render_block($block);
            }
        } catch (\Throwable $error) {
            Logger::warning('Failed to render the effective block-template content', array(
                'post_id' => (int) $post->ID,
                'exception' => get_class($error),
            ));
            $rendered = '';
        } finally {
            if ($previous_post instanceof \WP_Post) {
                $GLOBALS['post'] = $previous_post;
                setup_postdata($previous_post);
            } else {
                unset($GLOBALS['post']);
                wp_reset_postdata();
            }
        }

        /**
         * Filters public-facing HTML before Knowledge Base conversion.
         *
         * This is a generic extension boundary for builders and dynamic block
         * providers. Implementations must not assume a particular site, post
         * type, or template slug.
         *
         * @param string      $rendered Rendered source HTML.
         * @param \WP_Post    $post     Source post.
         * @param object|null $template Resolved block template.
         */
        $rendered = (string) apply_filters(
            'smartcloud_ai_kit_kb_rendered_source_html',
            $rendered,
            $post,
            $template
        );

        return trim(wp_strip_all_tags($rendered)) !== '' ? $rendered : $fallback;
    }

    private function renderPostContent(\WP_Post $post): string
    {
        // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound
        return (string) apply_filters('the_content', $post->post_content);
    }

    private function resolveBlockTemplate(\WP_Post $post): ?object
    {
        if (!function_exists('get_block_template') || !function_exists('get_stylesheet')) {
            return null;
        }

        $theme = (string) get_stylesheet();
        if ($theme === '') {
            return null;
        }

        $candidates = $this->templateCandidates($post);

        /**
         * Filters the ordered block-template slugs considered for a post.
         *
         * @param string[] $candidates Template slugs in resolution order.
         * @param \WP_Post $post       Source post.
         */
        $candidates = apply_filters('smartcloud_ai_kit_kb_block_template_candidates', $candidates, $post);
        if (!is_array($candidates)) {
            return null;
        }

        foreach (array_unique(array_filter(array_map('sanitize_title', $candidates))) as $slug) {
            $template = get_block_template($theme . '//' . $slug, 'wp_template');
            if (is_object($template)) {
                return $template;
            }
        }

        return null;
    }

    /** @return string[] */
    private function templateCandidates(\WP_Post $post): array
    {
        $candidates = array();
        $explicit = function_exists('get_page_template_slug')
            ? (string) get_page_template_slug($post->ID)
            : '';

        if ($explicit !== '' && $explicit !== 'default') {
            $candidates[] = $explicit;
        }

        $slug = (string) $post->post_name;
        $post_type = (string) $post->post_type;

        if ($post_type === 'page') {
            if ($slug !== '') {
                $candidates[] = 'page-' . $slug;
            }
            $candidates[] = 'page-' . (int) $post->ID;
            $candidates[] = 'page';
        } elseif ($post_type !== '') {
            if ($slug !== '') {
                $candidates[] = 'single-' . $post_type . '-' . $slug;
            }
            $candidates[] = 'single-' . $post_type;
            $candidates[] = 'single';
        }

        $candidates[] = 'singular';
        $candidates[] = 'index';

        return $candidates;
    }

    /**
     * Prefer semantic main containers wherever the template provides them.
     *
     * @return array<int, array<string, mixed>>
     */
    private function findSemanticMainBlocks(array $blocks): array
    {
        $main_blocks = array();

        foreach ($blocks as $block) {
            if (!is_array($block)) {
                continue;
            }

            $attrs = isset($block['attrs']) && is_array($block['attrs']) ? $block['attrs'] : array();
            if (strtolower((string) ($attrs['tagName'] ?? '')) === 'main') {
                $main_blocks[] = $block;
                continue;
            }

            if (!empty($block['innerBlocks']) && is_array($block['innerBlocks'])) {
                $main_blocks = array_merge($main_blocks, $this->findSemanticMainBlocks($block['innerBlocks']));
            }
        }

        return $main_blocks;
    }

    private function isSharedChrome(array $block): bool
    {
        $name = (string) ($block['blockName'] ?? '');
        if ($name === 'core/template-part' || $name === 'core/navigation') {
            return true;
        }

        $attrs = isset($block['attrs']) && is_array($block['attrs']) ? $block['attrs'] : array();
        return in_array(strtolower((string) ($attrs['tagName'] ?? '')), array('header', 'footer', 'nav'), true);
    }
}
