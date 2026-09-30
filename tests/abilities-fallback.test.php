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

        protected function block_attributes(string $pluginPath, string $blockName): array
        {
            return $blockName === 'smartcloud-ai-kit/kb-section'
                ? array('mode' => array(), 'sectionKey' => array())
                : array();
        }
    }
}

namespace SmartCloud\WPSuite\AiKit\Abilities {
    define('ABSPATH', __DIR__ . '/');
    define('MINUTE_IN_SECONDS', 60);

    function get_option(string $name, mixed $default = false): mixed
    {
        return $default;
    }

    function wp_cache_get(string $key, string $group = ''): mixed
    {
        return false;
    }

    function wp_cache_set(string $key, mixed $value, string $group = '', int $expiration = 0): bool
    {
        return true;
    }

    function is_wp_error(mixed $value): bool
    {
        return $value instanceof \WP_Error;
    }

    require_once dirname(__DIR__) . '/includes/abilities-provider.php';

    function expect(bool $condition, string $message): void
    {
        if (!$condition) {
            fwrite(STDERR, $message . PHP_EOL);
            exit(1);
        }
    }

    $reflection = new \ReflectionClass(Provider::class);
    $provider = new Provider();
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

    $nativeTree = array(
        'blockName' => 'core/group',
        'attrs' => array('className' => 'smartcloud-canvas-section'),
        'innerBlocks' => array(
            array('blockName' => 'core/paragraph', 'attrs' => array(), 'innerBlocks' => array()),
        ),
    );
    $kbSectionErrors = array();
    $kbSectionArgs = array(array($nativeTree), '', &$kbSectionErrors, 'smartcloud-ai-kit/kb-section', true);
    $validateNodes->invokeArgs($provider, $kbSectionArgs);
    expect($kbSectionErrors === array(), 'KB sections must accept governed native Gutenberg and Canvas descendants.');

    $strictErrors = array();
    $strictArgs = array(array($nativeTree), '', &$strictErrors, 'smartcloud-ai-kit/feature', false);
    $validateNodes->invokeArgs($provider, $strictArgs);
    expect(($strictErrors[0]['code'] ?? '') === 'smartcloud_ai_kit_unknown_block', 'Native Gutenberg descendants must remain restricted outside KB section containers.');

    $kbRoot = array(
        'blockName' => 'smartcloud-ai-kit/kb-section',
        'attrs' => array(
            'mode' => 'include',
            'sectionKey' => 'overview',
            'metadata' => array(
                'name' => 'examination.overview',
                'wpsuiteAgentComposer' => array('nodeId' => 'examination.overview'),
            ),
        ),
        'innerBlocks' => array($nativeTree),
    );
    $metadataErrors = array();
    $metadataArgs = array(array($kbRoot), '', &$metadataErrors, null);
    $validateNodes->invokeArgs($provider, $metadataArgs);
    expect($metadataErrors === array(), 'AI Kit blocks must accept standard Gutenberg metadata used by governed Composer pattern instances.');

    $kbRoot['attrs']['unexpected'] = true;
    $unknownAttributeErrors = array();
    $unknownAttributeArgs = array(array($kbRoot), '', &$unknownAttributeErrors, null);
    $validateNodes->invokeArgs($provider, $unknownAttributeArgs);
    expect(($unknownAttributeErrors[0]['code'] ?? '') === 'smartcloud_ai_kit_unknown_attribute', 'AI Kit blocks must continue to reject non-standard unknown attributes.');

    $metadataValuesForField = $reflection->getMethod('metadata_values_for_field');
    $vocabulary = array(
        'categories' => array(array('id' => 'Orvosok', 'label' => 'Orvosok')),
        'subcategories' => array(array('id' => 'Gasztroenterológusok', 'label' => 'Gasztroenterológusok')),
    );
    expect(
        $metadataValuesForField->invoke($provider, $vocabulary, 'category') === $vocabulary['categories'],
        'Category validation must read the canonical categories vocabulary key.'
    );
    expect(
        $metadataValuesForField->invoke($provider, $vocabulary, 'subcategory') === $vocabulary['subcategories'],
        'Subcategory validation must read the canonical subcategories vocabulary key.'
    );

    $pluginSource = file_get_contents(dirname(__DIR__) . '/smartcloud-ai-kit.php');
    $loaderSource = file_get_contents(dirname(__DIR__) . '/hub-loader.php');
    expect(is_string($pluginSource) && is_string($loaderSource), 'AI Kit runtime contract sources must be readable.');
    expect(str_contains($pluginSource, "smartcloud-wpsuite/abilities.php"), 'AI Kit must load Abilities from the renamed runtime directory.');
    expect(str_contains($loaderSource, "SMARTCLOUD_WPSUITE_RUNTIME_DIRECTORY"), 'AI Kit Hub loader must separate the runtime directory from stable identifiers.');
    expect(str_contains($loaderSource, "'smartcloud-wpsuite'"), 'AI Kit Hub loader must target the renamed runtime directory.');
    expect(str_contains($loaderSource, "'smartcloud-wpsuite'"), 'AI Kit must use the canonical WP Suite admin and state slug.');
    expect(str_contains($loaderSource, "'hub-for-wpsuiteio'"), 'AI Kit must retain the legacy WP Suite slug alias during migration.');
    foreach (array('SMARTCLOUD_WPSUITE_VERSION', 'SMARTCLOUD_WPSUITE_PATH', 'SMARTCLOUD_WPSUITE_URL', 'SMARTCLOUD_WPSUITE_READY_HOOK') as $sharedConstant) {
        expect(str_contains($loaderSource, "if (!defined('{$sharedConstant}'))"), "AI Kit must guard the shared {$sharedConstant} declaration when another Hub owner already loaded it.");
    }
    expect(str_contains($pluginSource, "get_option('smartcloud-wpsuite/site-settings')"), 'AI Kit must read the canonical site-settings option.');
    expect(str_contains($pluginSource, "get_option('hub-for-wpsuiteio/site-settings')"), 'AI Kit must retain a legacy site-settings fallback.');
    expect(str_contains($pluginSource, "'/smartcloud-wpsuite/v1/update-site-settings'"), 'AI Kit must use the canonical site-settings REST route.');
    $providerSource = file_get_contents(dirname(__DIR__) . '/includes/abilities-provider.php');
    expect(is_string($providerSource), 'AI Kit abilities provider source must be readable.');
    expect(str_contains($providerSource, "'suffix' => 'get-knowledge-sync-policy'"), 'AI Kit must expose read-only knowledge-sync policy discovery.');
    expect(str_contains($providerSource, "'suffix' => 'get-knowledge-sync-status'"), 'AI Kit must expose read-only knowledge-sync operational status.');
    expect(str_contains($providerSource, "'suffix' => 'get-knowledge-metadata-diff'"), 'AI Kit must expose read-only WordPress vocabulary diff status.');
    expect(str_contains($providerSource, "'suffix' => 'request-knowledge-sync'"), 'AI Kit must expose the review-aware sync request ability.');
    expect(str_contains($providerSource, "'human_approval_required' => true"), 'The sync request ability must advertise its human approval boundary.');
    $uninstallSource = file_get_contents(dirname(__DIR__) . '/uninstall.php');
    expect(is_string($uninstallSource), 'AI Kit uninstall cleanup must be packaged.');
    expect(str_contains($uninstallSource, 'smartcloud_ai_kit_kb_dependencies'), 'AI Kit uninstall must remove its Knowledge Base tables.');
    expect(!str_contains($uninstallSource, 'smartcloud-wpsuiteio/license-jws'), 'AI Kit uninstall must not remove shared WP Suite licences.');

    fwrite(STDOUT, "AI Kit abilities fallback and runtime compatibility checks passed.\n");
}
