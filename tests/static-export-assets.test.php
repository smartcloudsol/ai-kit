<?php
/**
 * Behavioral static-export asset contract: load the actual plugin bootstrap,
 * without WordPress or a browser, and inspect its inert JSON output.
 *
 * Run: php tests/static-export-assets.test.php
 */

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');
define('SmartCloud\\WPSuite\\Hub\\VERSION_MANTINE', 'fixture-mantine');

final class StaticExportFixtureAdmin
{
    public function getSettings(): object
    {
        return (object) array('integrateWpLogin' => false);
    }
}

class_alias(StaticExportFixtureAdmin::class, 'SmartCloud\\WPSuite\\AiKit\\Admin');

$GLOBALS['fixture_admin'] = false;
$GLOBALS['fixture_plural'] = array();
$GLOBALS['fixture_singular'] = null;
$GLOBALS['fixture_scripts'] = array();
$GLOBALS['fixture_style_calls'] = 0;

function add_action(...$args): void {}
function is_admin(): bool { return $GLOBALS['fixture_admin']; }
function apply_filters(string $hook, $default)
{
    return match ($hook) {
        'smartcloud_wpsuite_theme_css_urls' => $GLOBALS['fixture_plural'],
        'smartcloud_wpsuite_theme_css_url' => $GLOBALS['fixture_singular'],
        default => $default,
    };
}
function rest_url(string $path): string { return 'https://origin.example/wp-json/' . $path; }
function home_url(string $path): string { return 'https://origin.example' . $path; }
function wp_create_nonce(string $action): string { return 'fixture-nonce'; }
function add_query_arg(string $key, string $value, string $url): string
{
    return $url . (str_contains($url, '?') ? '&' : '?') . rawurlencode($key) . '=' . rawurlencode($value);
}
function wp_json_encode($value, int $flags = 0): string { return json_encode($value, $flags | JSON_THROW_ON_ERROR); }
function wp_kses_post(string $value): string { return $value; }
function wp_print_inline_script_tag(string $text, array $attributes = array()): void
{
    $GLOBALS['fixture_scripts'][] = array('text' => $text, 'attributes' => $attributes);
}
function wp_enqueue_style(...$args): void
{
    $GLOBALS['fixture_style_calls']++;
    throw new RuntimeException('Shadow dependencies must not be enqueued into the document.');
}
function wp_register_style(...$args): void
{
    $GLOBALS['fixture_style_calls']++;
    throw new RuntimeException('Asset declaration must not register a document stylesheet.');
}

function expect(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$fixturePath = sys_get_temp_dir() . '/wpsuite-shadow-assets-' . bin2hex(random_bytes(12)) . '/';
expect(mkdir($fixturePath, 0700), 'Create isolated temporary fixture.');
define('SMARTCLOUD_AI_KIT_PATH', $fixturePath);
define('SMARTCLOUD_AI_KIT_URL', 'https://origin.example/wp-content/plugins/smartcloud-ai-kit/');
define('SMARTCLOUD_AI_KIT_SLUG', 'smartcloud-ai-kit');
define('SMARTCLOUD_AI_KIT_VERSION', 'fixture-version');
define('SMARTCLOUD_WPSUITE_URL', 'https://origin.example/smartcloud-wpsuiteio/');

try {

    require dirname(__DIR__) . '/smartcloud-ai-kit.php';
    $reflection = new ReflectionClass('SmartCloud\\WPSuite\\AiKit\\AiKit');
    $plugin = $reflection->newInstanceWithoutConstructor();
    $reflection->getProperty('admin')->setValue($plugin, new StaticExportFixtureAdmin());

    $invoke = static function (array $plural, ?string $singular, bool $admin = false) use ($plugin): array {
        $GLOBALS['fixture_plural'] = $plural;
        $GLOBALS['fixture_singular'] = $singular;
        $GLOBALS['fixture_admin'] = $admin;
        $GLOBALS['fixture_scripts'] = array();
        $plugin->addMainScript();
        return $GLOBALS['fixture_scripts'];
    };
    $declarations = static function (array $scripts): array {
        return array_values(array_filter($scripts, static function (array $script): bool {
            return array_key_exists('data-static-export-assets', $script['attributes']);
        }));
    };
    $constantsFrom = static function (array $scripts): array {
        foreach ($scripts as $script) {
            if (preg_match('/WpSuite\.constants\.aiKit = (\{[^\n]*\});/', $script['text'], $match)) {
                return json_decode($match[1], true, 512, JSON_THROW_ON_ERROR);
            }
        }
        throw new RuntimeException('Actual JavaScript runtime constants not emitted.');
    };

    $shared = 'https://origin.example/theme.css?theme=shared';
    $singular = 'https://origin.example/ignored-singular.css';
    $scripts = $invoke(array($shared, $shared, '', null, 42), $singular);
    $declaration = $declarations($scripts);
    expect(count($declaration) === 1, 'Frontend must emit exactly one inert declaration.');
    expect($declaration[0]['attributes']['type'] === 'application/json', 'Declaration must be inert JSON.');
    expect($declaration[0]['attributes']['data-static-export-assets'] === '', 'Declaration marker must have no executable payload.');
    $payload = json_decode($declaration[0]['text'], true, 512, JSON_THROW_ON_ERROR);
    $constants = $constantsFrom($scripts);
    $own = array($constants['mantineCssHref'], $constants['aiKitUiCssHref']);
    expect($payload === array('schemaVersion' => 1, 'assets' => array_merge($own, array($shared))), 'Actual own stylesheet URLs and deduplicated shared plurality must be declared.');
    expect(!in_array($singular, $payload['assets'], true), 'Plural theme assets must take precedence over singular fallback.');

    $fallback = 'https://origin.example/fallback.css';
    $scripts = $invoke(array(), $fallback);
    $payload = json_decode($declarations($scripts)[0]['text'], true, 512, JSON_THROW_ON_ERROR);
    expect($payload['assets'] === array_merge($own, array($fallback)), 'Empty plurality must use singular fallback.');
    $scripts = $invoke(array(), null);
    $payload = json_decode($declarations($scripts)[0]['text'], true, 512, JSON_THROW_ON_ERROR);
    expect($payload['assets'] === $own, 'Empty shared styles must not add invalid URLs.');

    $hostile = 'https://origin.example/</script><script>alert("x")</script>?a=1&quote=\'árvíz';
    $scripts = $invoke(array($hostile, $hostile), null);
    $json = $declarations($scripts)[0]['text'];
    expect(!str_contains($json, '<') && !str_contains($json, '>') && !str_contains($json, '&'), 'Asset JSON must not allow script termination or HTML injection.');
    foreach (array('\u003C', '\u003E', '\u0026', '\u0027', '\u0022') as $encoded) {
        expect(str_contains($json, $encoded), 'All hostile HTML and quote characters must be encoded: ' . $encoded);
    }
    $payload = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    expect($payload['assets'] === array_merge($own, array($hostile)), 'Hostile and Unicode URLs must round-trip exactly.');

    expect($declarations($invoke(array($shared), $fallback, true)) === array(), 'Admin must not emit a frontend export declaration.');
    expect($GLOBALS['fixture_style_calls'] === 0, 'No document style enqueue/registration calls may occur.');
    fwrite(STDOUT, "AiKit static export asset/security contract: PASS\n");
} finally {

    rmdir($fixturePath);
}

