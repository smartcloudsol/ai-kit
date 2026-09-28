<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/wordpress-root/');

final class WP_Post
{
    public function __construct(
        public int $ID,
        public string $post_type,
        public string $post_name,
        public string $post_content,
        public string $post_title
    ) {
    }
}

$GLOBALS['effective_content_has_template'] = true;

function apply_filters(string $hook, mixed $value, mixed ...$args): mixed
{
    if ($hook === 'the_content') {
        return '<p>Filtered ' . $value . '</p>';
    }

    return $value;
}

function get_stylesheet(): string
{
    return 'test-theme';
}

function get_page_template_slug(int $post_id): string
{
    return 'custom-layout';
}

function sanitize_title(string $value): string
{
    return strtolower(preg_replace('/[^a-z0-9-]+/i', '-', trim($value)) ?? '');
}

function get_block_template(string $id, string $type): ?object
{
    if (empty($GLOBALS['effective_content_has_template']) || $id !== 'test-theme//custom-layout') {
        return null;
    }

    return (object) array('content' => 'parsed-template');
}

function parse_blocks(string $content): array
{
    return array(
        array('blockName' => 'core/template-part', 'attrs' => array('slug' => 'header'), 'innerBlocks' => array()),
        array(
            'blockName' => 'core/group',
            'attrs' => array('tagName' => 'main'),
            'innerBlocks' => array(
                array('blockName' => 'core/paragraph', 'attrs' => array(), 'innerBlocks' => array(), 'innerHTML' => '<p>Template introduction</p>'),
                array('blockName' => 'example/dynamic-records', 'attrs' => array(), 'innerBlocks' => array(), 'innerHTML' => ''),
            ),
            'innerHTML' => '',
        ),
        array('blockName' => 'core/template-part', 'attrs' => array('slug' => 'footer'), 'innerBlocks' => array()),
    );
}

function render_block(array $block): string
{
    if (($block['blockName'] ?? '') === 'example/dynamic-records') {
        return '<p>Dynamic content for ' . ($GLOBALS['post']->post_title ?? 'missing') . '</p>';
    }

    $html = (string) ($block['innerHTML'] ?? '');
    foreach (($block['innerBlocks'] ?? array()) as $inner_block) {
        $html .= render_block($inner_block);
    }
    return $html;
}

function setup_postdata(WP_Post $post): void
{
}

function wp_reset_postdata(): void
{
}

function wp_strip_all_tags(string $value): string
{
    return strip_tags($value);
}

require_once __DIR__ . '/../admin/php/kb/effective-content-renderer.php';

$original = new WP_Post(7, 'post', 'original', 'original body', 'Original');
$source = new WP_Post(42, 'page', 'source', 'stored body', 'Source page');
$GLOBALS['post'] = $original;

$renderer = new SmartCloud\WPSuite\AiKit\KnowledgeBase\EffectiveContentRenderer();
$rendered = $renderer->render($source);

if (!str_contains($rendered, 'Template introduction') || !str_contains($rendered, 'Dynamic content for Source page')) {
    throw new RuntimeException('The effective renderer did not include template-owned static and dynamic content.');
}
if (str_contains($rendered, 'header') || str_contains($rendered, 'footer')) {
    throw new RuntimeException('The effective renderer included shared template chrome.');
}
if (($GLOBALS['post'] ?? null) !== $original) {
    throw new RuntimeException('The effective renderer did not restore the previous global post.');
}

$GLOBALS['effective_content_has_template'] = false;
$fallback = $renderer->render($source);
if ($fallback !== '<p>Filtered stored body</p>') {
    throw new RuntimeException('The effective renderer did not fall back to filtered post_content.');
}

echo "Effective content renderer tests passed.\n";
