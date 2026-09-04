<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');

function wp_rand(): int
{
    return 1234;
}

function wp_json_encode($value): string
{
    return (string) json_encode($value);
}

function esc_attr($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function get_block_wrapper_attributes(): string
{
    return 'class="wp-block-test"';
}

function wp_kses_data($value): string
{
    return (string) $value;
}

function wp_kses_post($value): string
{
    return (string) $value;
}

final class TestInnerBlock
{
    public function __construct(public string $name, private string $html)
    {
    }

    public function render(): string
    {
        return $this->html;
    }
}

function renderTemplate(string $template, array $innerBlocks): string
{
    $attributes = ['mode' => 'openButton'];
    $content = '<p>configuration child</p>';
    $block = (object) ['inner_blocks' => $innerBlocks];

    ob_start();
    include $template;
    return (string) ob_get_clean();
}

function expect(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }
}

$fallback = new TestInnerBlock('wpsuite/react-fallback', '<div data-wpsuite-react-fallback><fallback-placeholder data-fallback-marker></fallback-placeholder></div>');
$other = new TestInnerBlock('core/paragraph', '<p>configuration child</p>');

foreach (['ai-feature', 'doc-search'] as $blockName) {
    $template = dirname(__DIR__) . '/src/' . $blockName . '/render.php';
    $withFallback = renderTemplate($template, [$fallback, $other]);
    $withoutFallback = renderTemplate($template, []);

    expect(str_contains($withFallback, 'data-wpsuite-react-fallback'), $blockName . ' must render its authored fallback.');
    expect(str_contains($withFallback, 'data-fallback-marker'), $blockName . ' must preserve native rendered child-block markup without a second allowlist.');
    $mountClass = $blockName === 'ai-feature'
        ? 'smartcloud-ai-kit-feature__mount'
        : 'smartcloud-ai-kit-doc-search__mount';
    expect(str_contains($withFallback, $mountClass), $blockName . ' must expose a dedicated React mount.');
    expect(!str_contains($withFallback, 'configuration child'), $blockName . ' must not expose configuration children.');
    expect(str_contains($withoutFallback, 'data-config='), $blockName . ' must remain mountable without a fallback.');
}

$pluginSource = (string) file_get_contents(dirname(__DIR__, 2) . '/smartcloud-ai-kit.php');
$widgetSource = (string) file_get_contents(dirname(__DIR__, 2) . '/elementor-ai-kit-widgets.php');

expect(str_contains($pluginSource, "renderShortcodeBlock('smartcloud-ai-kit/feature'"), 'AI feature shortcode must retain its block renderer.');
expect(str_contains($pluginSource, "renderShortcodeBlock('smartcloud-ai-kit/doc-search'"), 'Doc Search shortcode must retain its block renderer.');
expect(str_contains($pluginSource, "'aiDisclosure' => null"), 'Doc Search shortcode must accept an AI disclosure override.');
expect(str_contains($widgetSource, "\$this->add_control('aiDisclosure'"), 'Elementor Doc Search must expose an AI disclosure override.');
expect(str_contains($widgetSource, "'aiDisclosure',"), 'Elementor Doc Search must pass the AI disclosure override to the shortcode.');
expect(str_contains($widgetSource, "smartcloud_ai_kit_do_shortcode('smartcloud-ai-kit-feature'"), 'AI feature Elementor widget must retain its shortcode adapter.');
expect(str_contains($widgetSource, "smartcloud_ai_kit_do_shortcode('smartcloud-ai-kit-doc-search'"), 'Doc Search Elementor widget must retain its shortcode adapter.');

fwrite(STDOUT, "AI Kit fallback, shortcode and Elementor compatibility checks passed.\n");
