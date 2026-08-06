<?php

declare(strict_types=1);

namespace SmartCloud\WPSuite\Hub\Abilities {
    abstract class Product_Provider_Base
    {
        public function __construct(...$args)
        {
        }

        public function bootstrap(): void
        {
        }

        protected function count_blocks(array $blocks): int
        {
            $count = 0;
            foreach ($blocks as $block) {
                ++$count;
                $count += $this->count_blocks(is_array($block['innerBlocks'] ?? null) ? $block['innerBlocks'] : array());
            }
            return $count;
        }

        protected function validation_issue(string $code, string $message, string $path): array
        {
            return compact('code', 'message', 'path');
        }
    }
}

namespace SmartCloud\WPSuite\AiKit\Abilities {
    define('ABSPATH', __DIR__ . '/');

    require_once dirname(__DIR__) . '/includes/abilities-provider.php';

    function expect(bool $condition, string $message): void
    {
        if (!$condition) {
            fwrite(STDERR, $message . PHP_EOL);
            exit(1);
        }
    }

    $reflection = new \ReflectionClass(Provider::class);
    $provider = $reflection->newInstanceWithoutConstructor();
    $validateNodes = $reflection->getMethod('validate_nodes');
    $fallback = array(
        'blockName' => 'wpsuite/react-fallback',
        'attrs' => array(),
        'innerBlocks' => array(array('blockName' => 'core/paragraph', 'attrs' => array())),
    );

    foreach (array('smartcloud-ai-kit/feature', 'smartcloud-ai-kit/doc-search') as $parent) {
        $errors = array();
        $args = array(array($fallback), '', &$errors, $parent);
        $validateNodes->invokeArgs($provider, $args);
        expect($errors === array(), $parent . ' must accept a direct React fallback and its native Gutenberg children.');
    }

    $invalidErrors = array();
    $invalidArgs = array(array($fallback), '', &$invalidErrors, null);
    $validateNodes->invokeArgs($provider, $invalidArgs);
    expect(($invalidErrors[0]['code'] ?? '') === 'smartcloud_ai_kit_fallback_parent_invalid', 'React fallback must remain restricted to supported AI Kit roots.');

    $pluginSource = file_get_contents(dirname(__DIR__) . '/smartcloud-ai-kit.php');
    $loaderSource = file_get_contents(dirname(__DIR__) . '/hub-loader.php');
    expect(is_string($pluginSource) && is_string($loaderSource), 'AI Kit runtime contract sources must be readable.');
    expect(str_contains($pluginSource, "smartcloud-wpsuite/abilities.php"), 'AI Kit must load Abilities from the renamed runtime directory.');
    expect(str_contains($loaderSource, "SMARTCLOUD_WPSUITE_RUNTIME_DIRECTORY"), 'AI Kit Hub loader must separate the runtime directory from stable identifiers.');
    expect(str_contains($loaderSource, "'smartcloud-wpsuite'"), 'AI Kit Hub loader must target the renamed runtime directory.');
    expect(str_contains($loaderSource, "'smartcloud-wpsuite'"), 'AI Kit must use the canonical WP Suite admin and state slug.');
    expect(str_contains($loaderSource, "'hub-for-wpsuiteio'"), 'AI Kit must retain the legacy WP Suite slug alias during migration.');
    expect(str_contains($pluginSource, "get_option('smartcloud-wpsuite/site-settings')"), 'AI Kit must read the canonical site-settings option.');
    expect(str_contains($pluginSource, "get_option('hub-for-wpsuiteio/site-settings')"), 'AI Kit must retain a legacy site-settings fallback.');
    expect(str_contains($pluginSource, "'/smartcloud-wpsuite/v1/update-site-settings'"), 'AI Kit must use the canonical site-settings REST route.');
    $uninstallSource = file_get_contents(dirname(__DIR__) . '/uninstall.php');
    expect(is_string($uninstallSource), 'AI Kit uninstall cleanup must be packaged.');
    expect(str_contains($uninstallSource, 'smartcloud_ai_kit_kb_dependencies'), 'AI Kit uninstall must remove its Knowledge Base tables.');
    expect(!str_contains($uninstallSource, 'smartcloud-wpsuiteio/license-jws'), 'AI Kit uninstall must not remove shared WP Suite licences.');

    fwrite(STDOUT, "AI Kit abilities fallback and runtime compatibility checks passed.\n");
}
