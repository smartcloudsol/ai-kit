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
$GLOBALS['effective_content_filters'] = array();
$GLOBALS['effective_content_fixtures'] = array();
$GLOBALS['excluded_dynamic_calls'] = 0;

function add_filter(string $hook, callable $callback, int $priority = 10, int $accepted_args = 1): void
{
    $GLOBALS['effective_content_filters'][$hook][$priority][] = array($callback, $accepted_args);
}

function remove_filter(string $hook, callable $callback, int $priority = 10): void
{
    foreach ($GLOBALS['effective_content_filters'][$hook][$priority] ?? array() as $key => $entry) {
        if ($entry[0] === $callback) {
            unset($GLOBALS['effective_content_filters'][$hook][$priority][$key]);
        }
    }
}

function apply_filters(string $hook, mixed $value, mixed ...$args): mixed
{
    if ($hook === 'the_content') {
        if (!empty($GLOBALS['effective_content_throw_fallback'])) {
            throw new RuntimeException('Deliberate fallback failure.');
        }
        if (isset($GLOBALS['effective_content_fixtures'][$value])) {
            return implode('', array_map('render_block', parse_blocks($value)));
        }
        return '<p>Filtered ' . $value . '</p>';
    }

    $priorities = $GLOBALS['effective_content_filters'][$hook] ?? array();
    ksort($priorities);
    foreach ($priorities as $entries) {
        foreach ($entries as [$callback, $accepted_args]) {
            $value = $callback(...array_slice(array_merge(array($value), $args), 0, $accepted_args));
        }
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
    if (isset($GLOBALS['effective_content_fixtures'][$content])) {
        return $GLOBALS['effective_content_fixtures'][$content];
    }
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
    $pre_render = apply_filters('pre_render_block', null, $block, null);
    if ($pre_render !== null) {
        return $pre_render;
    }
    if (($block['blockName'] ?? '') === 'example/excluded-recommendations') {
        $GLOBALS['excluded_dynamic_calls']++;
        return '<p>EXCLUDED recommendation text</p>';
    }
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

$paragraph = static fn(string $text): array => array('blockName' => 'core/paragraph', 'attrs' => array(), 'innerBlocks' => array(), 'innerHTML' => '<p>' . $text . '</p>');
$excluded = array('blockName' => 'smartcloud-ai-kit/kb-section', 'attrs' => array('mode' => 'exclude'),
    'innerBlocks' => array(array('blockName' => 'example/excluded-recommendations', 'attrs' => array(), 'innerBlocks' => array(), 'innerHTML' => '')),
    'innerHTML' => '');
$included = array('blockName' => 'smartcloud-ai-kit/kb-section', 'attrs' => array('mode' => 'inherit'),
    'innerBlocks' => array($paragraph('Retained main content'), $excluded, $paragraph('Retained final paragraph')), 'innerHTML' => '');
$GLOBALS['effective_content_has_template'] = true;
$GLOBALS['effective_content_fixtures']['parsed-template'] = array(array('blockName' => 'core/group', 'attrs' => array('tagName' => 'main'),
    'innerBlocks' => array($included), 'innerHTML' => ''));
$rendered = $renderer->render($source);
if (!str_contains($rendered, 'Retained main content') || !str_contains($rendered, 'Retained final paragraph') ||
    str_contains($rendered, 'EXCLUDED') || $GLOBALS['excluded_dynamic_calls'] !== 0) {
    throw new RuntimeException('Nested template exclusions must prevent rendering, not merely hide converted text.');
}

$GLOBALS['effective_content_has_template'] = false;
$GLOBALS['effective_content_fixtures']['source-with-exclusions'] = array($included);
$source->post_content = 'source-with-exclusions';
$rendered = $renderer->render($source);
if (!str_contains($rendered, 'Retained main content') || str_contains($rendered, 'EXCLUDED') || $GLOBALS['excluded_dynamic_calls'] !== 0) {
    throw new RuntimeException('Post-content fallback must honor nested exclusions.');
}

$GLOBALS['effective_content_has_template'] = true;
$GLOBALS['effective_content_fixtures']['only-excluded'] = array($excluded);
$source->post_content = 'only-excluded';
$excluded_main = $excluded;
$excluded_main['innerBlocks'] = array(array('blockName' => 'core/group', 'attrs' => array('tagName' => 'main'),
    'innerBlocks' => array($paragraph('EXCLUDED semantic main')), 'innerHTML' => ''));
$GLOBALS['effective_content_fixtures']['parsed-template'] = array($excluded_main);
if (trim($renderer->render($source)) !== '' || $GLOBALS['excluded_dynamic_calls'] !== 0) {
    throw new RuntimeException('Excluded ancestors cannot be bypassed by main selection or empty-result fallback.');
}

// This is a render-scope guard, not a persistent frontend filter.
if (!str_contains(render_block($excluded), 'EXCLUDED') || $GLOBALS['excluded_dynamic_calls'] !== 1) {
    throw new RuntimeException('Normal frontend rendering must still display excluded recommendations.');
}
$GLOBALS['effective_content_throw_fallback'] = true;
try {
    $renderer->render($source);
    throw new RuntimeException('Expected deliberate fallback failure.');
} catch (RuntimeException $error) {
    if ($error->getMessage() !== 'Deliberate fallback failure.') {
        throw $error;
    }
} finally {
    $GLOBALS['effective_content_throw_fallback'] = false;
}
if (!str_contains(render_block($excluded), 'EXCLUDED') || $GLOBALS['excluded_dynamic_calls'] !== 2) {
    throw new RuntimeException('Render failure must not leak the exclusion guard into frontend requests.');
}

echo "Effective content renderer tests passed.\n";
