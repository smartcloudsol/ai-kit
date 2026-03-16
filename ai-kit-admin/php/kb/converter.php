<?php
/**
 * KB Content Converter - HTML to Markdown conversion
 *
 * Converts WordPress post content (HTML, Gutenberg blocks, Elementor) to Markdown
 * for Knowledge Base documents.
 */

namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

use League\HTMLToMarkdown\HtmlConverter;
use League\HTMLToMarkdown\Environment;
use SmartCloud\WPSuite\AiKit\Logger;

if (!defined('ABSPATH')) {
    exit;
}

class Converter
{
    private HtmlConverter $converter;

    public function __construct()
    {
        $this->converter = new HtmlConverter([
            'strip_tags' => true,  // Strip unknown/unsupported HTML tags
            'hard_break' => true,
            'header_style' => 'atx', // Use # headers
            'bold_style' => '**',
            'italic_style' => '_',
            'remove_nodes' => 'script style',
            'suppress_errors' => true, // Suppress DOMDocument warnings for invalid HTML5 tags
        ]);
    }

    /**
     * Convert HTML to Markdown
     */
    public function htmlToMarkdown(string $html): string
    {
        if (empty($html)) {
            return '';
        }

        Logger::debug('Converting HTML to Markdown', [
            'html_length' => strlen($html)
        ]);

        // Pre-process: fix WordPress-specific HTML
        $html = $this->preprocessHtml($html);
        // Convert to markdown
        $markdown = $this->converter->convert($html);
        // Post-process: cleanup
        $markdown = $this->postprocessMarkdown($markdown);

        Logger::debug('HTML to Markdown conversion completed', [
            'markdown_length' => strlen($markdown)
        ]);

        return $markdown;
    }

    /**
     * Convert Gutenberg blocks to Markdown
     * Recursively processes blocks and their inner blocks
     */
    public function blocksToMarkdown(array $blocks, int $depth = 0): string
    {
        if ($depth === 0) {
            Logger::debug('Converting Gutenberg blocks to Markdown', [
                'block_count' => count($blocks)
            ]);
        }

        $markdown = '';

        foreach ($blocks as $block) {
            // Skip empty blocks
            if (empty($block['blockName']) && empty(trim($block['innerHTML'] ?? ''))) {
                continue;
            }

            // Process by block type
            $block_md = $this->renderBlockAsMarkdown($block, $depth);

            if (!empty($block_md)) {
                $markdown .= $block_md . "\n\n";
            }
        }

        return trim($markdown);
    }

    /**
     * Render a single block as Markdown
     */
    private function renderBlockAsMarkdown(array $block, int $depth = 0): string
    {
        $block_name = $block['blockName'] ?? '';
        $attrs = $block['attrs'] ?? [];
        $inner_html = $block['innerHTML'] ?? '';
        $inner_blocks = $block['innerBlocks'] ?? [];

        // Special handling for certain block types
        switch ($block_name) {
            case 'core/list':
                // Lists: build from innerBlocks (each list-item block)
                if (!empty($inner_blocks)) {
                    $ordered = ($attrs['ordered'] ?? false);
                    $tag = $ordered ? 'ol' : 'ul';

                    $list_html = "<{$tag}>";
                    foreach ($inner_blocks as $item_block) {
                        // Each innerBlock's innerHTML already contains <li>content</li>
                        $item_html = $item_block['innerHTML'] ?? '';
                        $item_html = trim($item_html);
                        if (!empty($item_html)) {
                            // Just append the <li> as-is (Gutenberg already includes the tags)
                            $list_html .= $item_html;
                        }
                    }
                    $list_html .= "</{$tag}>";

                    return $this->htmlToMarkdown($list_html);
                }
                return '';

            case 'core/image':
                // Images: URL and alt text are in attributes
                $url = $attrs['url'] ?? '';
                $alt = $attrs['alt'] ?? '';
                $caption = $attrs['caption'] ?? '';

                if (empty($url) && !empty($inner_html)) {
                    // Fallback: extract from HTML
                    if (preg_match('/<img[^>]+src="([^"]+)"/', $inner_html, $matches)) {
                        $url = $matches[1];
                    }
                    if (preg_match('/<img[^>]+alt="([^"]+)"/', $inner_html, $matches)) {
                        $alt = $matches[1];
                    }
                }

                if (empty($url)) {
                    return '';
                }

                $md = "![{$alt}]({$url})";
                if (!empty($caption)) {
                    $caption_text = wp_strip_all_tags($caption);
                    $md .= "\n*{$caption_text}*";
                }
                return $md;

            case 'core/heading':
                // Headings: level is in attributes
                $level = $attrs['level'] ?? 2;
                $text = trim(wp_strip_all_tags($inner_html)); // Extract text only
                return str_repeat('#', $level) . ' ' . $text;

            case 'core/quote':
                // Quotes: convert to markdown blockquote
                $text = $this->htmlToMarkdown($inner_html);
                $lines = array_filter(explode("\n", trim($text)));
                $quoted = array_map(fn($line) => '> ' . trim($line), $lines);
                return implode("\n", $quoted);

            case 'core/code':
                // Code blocks: use content attribute directly
                $code = $attrs['content'] ?? '';
                if (empty($code) && !empty($inner_html)) {
                    // Fallback: extract from HTML
                    $code = wp_strip_all_tags($inner_html);
                }
                return "```\n" . $code . "\n```";

            case 'core/preformatted':
                // Preformatted: extract text content
                $code = wp_strip_all_tags($inner_html);
                return "```\n" . $code . "\n```";

            case 'core/separator':
                return '---';

            case 'core/spacer':
                return '';

            case 'core/columns':
            case 'core/column':
            case 'core/group':
                // Container blocks: process inner blocks recursively
                if (!empty($inner_blocks)) {
                    return $this->blocksToMarkdown($inner_blocks, $depth + 1);
                }
                // Fallback to innerHTML
                if (!empty($inner_html)) {
                    return $this->htmlToMarkdown($inner_html);
                }
                return '';

            case '': // Classic block or freeform
                if (!empty($inner_html)) {
                    return $this->htmlToMarkdown($inner_html);
                }
                return '';
        }

        // For all other blocks: use innerHTML and convert to Markdown
        // This handles headings, paragraphs, lists, quotes, images, tables, etc.
        if (!empty($inner_html)) {
            return $this->htmlToMarkdown($inner_html);
        }

        // If no innerHTML, try inner blocks
        if (!empty($inner_blocks)) {
            return $this->blocksToMarkdown($inner_blocks, $depth + 1);
        }

        return '';
    }

    /**
     * Pre-process HTML before conversion
     */
    private function preprocessHtml(string $html): string
    {
        // Remove WordPress-specific wrapper divs and attributes that don't affect content
        $html = preg_replace('/\s+class="[^"]*"/', '', $html);
        $html = preg_replace('/\s+id="[^"]*"/', '', $html);
        $html = preg_replace('/\s+data-[a-z\-]+="[^"]*"/i', '', $html);

        // Remove empty paragraphs
        $html = preg_replace('/<p>\s*<\/p>/', '', $html);

        // Remove WordPress shortcodes (if not already processed)
        $html = preg_replace('/\[([^\]]+)\]/', '', $html);

        return $html;
    }

    /**
     * Post-process Markdown after conversion
     */
    private function postprocessMarkdown(string $markdown): string
    {
        // Remove excessive blank lines (more than 2)
        $markdown = preg_replace('/\n{3,}/', "\n\n", $markdown);

        // Trim whitespace
        $markdown = trim($markdown);

        // Apply filters for extensibility
        $markdown = apply_filters('smartcloud_ai_kit_kb_markdown_postprocess', $markdown);

        return $markdown;
    }

    /**
     * Extract text content from Gutenberg blocks (no markdown formatting)
     * Useful for summaries or metadata extraction
     */
    public function blocksToText(array $blocks): string
    {
        $text = '';

        foreach ($blocks as $block) {
            $inner_html = $block['innerHTML'] ?? '';
            $inner_blocks = $block['innerBlocks'] ?? [];

            if (!empty($inner_blocks)) {
                $text .= $this->blocksToText($inner_blocks) . ' ';
            } elseif (!empty($inner_html)) {
                $text .= wp_strip_all_tags($inner_html) . ' ';
            }
        }

        return trim($text);
    }
}
