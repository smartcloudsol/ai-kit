<?php
/** Smoke-test the actual canonical assembled trees, whose admin/php source directory is flattened. */
declare(strict_types=1);
$packages = $argv[1] ?? '';
if ($packages === '' || !is_dir($packages)) { fwrite(STDERR, "Usage: php packaged-profile-requires.php <canonical-packages-directory>\n"); exit(64); }
$packages = realpath($packages);
define('ABSPATH', sys_get_temp_dir() . '/wpsuite-packaged-smoke/');
function trailingslashit(string $value): string { return rtrim($value, '/') . '/'; }
function apply_filters(string $hook, mixed $value): mixed { return $value; }
function add_action(string $hook, callable $callback, int $priority = 10, int $accepted = 1): void { $GLOBALS['packaged_hooks'][$hook][] = $callback; }
function add_filter(string $hook, callable $callback, int $priority = 10, int $accepted = 1): void { $GLOBALS['packaged_hooks'][$hook][] = $callback; }
$products = [
    ['smartcloud-ai-kit', 'SmartCloud\\WPSuite\\AiKit\\Abilities\\Provider', 'SmartCloud\\WPSuite\\AiKit\\KnowledgeBase\\BackendProfileState', 'kb/backend-profile-state.php'],
    ['smartcloud-flow', 'SmartCloud\\WPSuite\\Flow\\Abilities\\Provider', 'SmartCloud\\WPSuite\\Flow\\BackendProfileState', 'backend-profile-state.php'],
];
foreach ($products as [$slug, $provider, $helper, $relative]) {
    $root = $packages . '/' . $slug;
    if (is_dir($root . '/admin/php') || !is_file($root . '/admin/' . $relative)) throw new RuntimeException('Expected canonical flattened admin layout for ' . $slug);
    require_once $root . '/smartcloud-wpsuite/abilities.php';
    require_once $root . '/includes/abilities-provider.php';
    foreach (['wp_abilities_api_categories_init', 'wp_abilities_api_init', 'smartcloud_composer_execution_providers', 'smartcloud_composer_provider_profiles'] as $hook) {
        $callbacks = $GLOBALS['packaged_hooks'][$hook] ?? [];
        $last = end($callbacks);
        if (!is_array($last) || !$last[0] instanceof $provider) throw new RuntimeException('Actual packaged provider bootstrap did not register ' . $hook);
    }
    $instance = new $provider();
    if (!$instance instanceof SmartCloud\WPSuite\Hub\Abilities\Product_Provider_Base) throw new RuntimeException('Packaged provider did not load its actual bundled base');
    if (realpath((new ReflectionClass($helper))->getFileName()) !== realpath($root . '/admin/' . $relative)) throw new RuntimeException('Packaged provider resolved a source-tree helper');
    if ($helper::optionName('fixture') !== 'fixture') throw new RuntimeException('Packaged legacy helper could not execute');
    echo $slug . " actual assembled provider/helper load PASS.\n";
}
