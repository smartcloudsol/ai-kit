<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
$allowed = true; $checks = 0; $queryCalls = 0; $posts = []; $urls = []; $hook = []; $localeProvider = 'none'; $site = 'https://site.example/shop/'; $wooCalls = [];
function __(string $text, string $domain = ''): string { return $text; }
function current_user_can(string $cap): bool { return $GLOBALS['allowed'] && $cap === 'manage_options'; }
function wp_verify_nonce(string $nonce, string $action): bool { return $nonce === 'fixture' && $action === 'wp_rest'; }
class WP_Error { public function __construct(public string $code, public string $message, public array $data) {} }
function is_wp_error(mixed $value): bool { return $value instanceof WP_Error; }
class WP_REST_Request {
    public function __construct(public array $input = [], public string $nonce = 'fixture') {}
    public function get_header(string $name): string { return $this->nonce; }
    public function get_param(string $name): mixed { return $this->input[$name] ?? null; }
}
class WP_Post {
    public function __construct(public int $ID, public string $post_type = 'page', public string $post_status = 'publish', public string $post_password = '') {}
}
class WP_Query {
    public array $posts;
    public function __construct(array $args) {
        $GLOBALS['queryCalls']++; $GLOBALS['queryArgs'] = $args;
        $this->posts = array_slice($GLOBALS['posts'], $args['offset'], $args['posts_per_page']);
    }
}
function home_url(string $path): string { return $GLOBALS['site']; }
function wp_parse_url(string $url, int $part = -1): mixed { return parse_url($url, $part); }
function wp_json_encode(mixed $value): string|false { return json_encode($value); }
function get_post_types(array $args, string $output): array {
    check($args === ['public' => true] && $output === 'objects', 'Only public post types requested.');
    return array_map(fn($name) => (object) ['name' => $name], ['page', 'post', 'product', 'attachment', 'unviewable']);
}
function is_post_type_viewable(object $type): bool { return $type->name !== 'unviewable'; }
function get_permalink(WP_Post $post): string { return $GLOBALS['urls'][$post->ID] ?? 'https://site.example/shop/pages/' . $post->ID; }
function get_the_title(WP_Post $post): string { return '<strong>Page ' . $post->ID . '</strong>'; }
function wp_strip_all_tags(string $value): string { return strip_tags($value); }
function wc_get_product(int $id): object {
    $GLOBALS['wooCalls'][] = $id;
    return new class($id) { public function __construct(private int $id) {} public function get_id(): int { return $this->id; } };
}
function pll_get_post_language(int $id, string $field): mixed { check($field === 'locale', 'Preserve actual Polylang locale.'); return $GLOBALS['localeProvider'] === 'polylang' ? 'en_GB' : false; }
function has_filter(string $name): bool { return $name === 'wpml_post_language_details' && $GLOBALS['localeProvider'] === 'wpml'; }
function apply_filters(string $name, mixed $value, mixed $post): mixed {
    if ($name === 'wpml_post_language_details') { return ['locale' => 'pt_BR', 'language_code' => 'pt']; }
    check($name === 'smartcloud_ai_kit_product_page_identities' && $value === [] && $post instanceof WP_Post, 'Identity hook starts empty and receives actual public post.');
    if ($GLOBALS['hook'] === 'throw') { throw new RuntimeException('Provider failed'); }
    return $GLOBALS['hook'];
}
function update_option(...$args): never { throw new RuntimeException('Discovery must never write options.'); }
function wp_update_post(...$args): never { throw new RuntimeException('Discovery must never write posts.'); }
function render_block(...$args): never { throw new RuntimeException('Discovery must never render blocks.'); }
function wp_remote_get(...$args): never { throw new RuntimeException('Discovery must never call remote providers.'); }
function check(bool $condition, string $message): void { $GLOBALS['checks']++; if (!$condition) { throw new RuntimeException($message); } }
require __DIR__ . '/../admin/php/answers-product-pages.php';
use SmartCloud\WPSuite\AiKit\AnswersProductPages;
$allowed = false;
check(AnswersProductPages::read(new WP_REST_Request()) instanceof WP_Error && $queryCalls === 0, 'Non-administrators cannot discover pages.');
$allowed = true;
foreach (['', 'invalid'] as $nonce) { check(AnswersProductPages::read(new WP_REST_Request([], $nonce)) instanceof WP_Error && $queryCalls === 0, 'Discovery requires a valid REST nonce.'); }
foreach ([['page' => 0], ['page' => 1001], ['page' => []], ['page' => true], ['page' => 1.0], ['perPage' => 21], ['perPage' => '0'], ['search' => []], ['search' => str_repeat('x', 201)], ['search' => "bad\nquery"], ['search' => "\xff"]] as $input) {
    check(AnswersProductPages::read(new WP_REST_Request($input)) instanceof WP_Error && $queryCalls === 0, 'Malformed or unbounded inputs rejected before query.');
}
$posts = [new WP_Post(1), new WP_Post(2, 'product'), new WP_Post(3, 'page', 'draft'), new WP_Post(4, 'page', 'private'), new WP_Post(5, 'page', 'publish', 'password'), new WP_Post(6, 'attachment'), new WP_Post(7, 'secret'), new WP_Post(8, 'product_variation')];
$result = AnswersProductPages::read(new WP_REST_Request(['search' => str_repeat('ő', 200)]));
check(array_column($result['pages'], 'postId') === [1, 2], 'Recheck publication/password/type even if a query hook returns unsafe posts.');
check($result['siteUrl'] === $site && $result['page'] === 1 && $result['hasMore'] === false, 'Discovery response contract.');
check($queryArgs['post_status'] === 'publish' && $queryArgs['has_password'] === false && $queryArgs['no_found_rows'] && $queryArgs['posts_per_page'] === 21, 'Bounded public query with one lookahead and no count query.');
check($queryArgs['post_type'] === ['page', 'post', 'product'], 'Attachment and nonviewable types excluded.');
check($result['pages'][0]['title'] === 'Page 1' && !isset($result['pages'][0]['locale']), 'Plain title and no guessed locale.');
check($result['pages'][1]['identities'] === [['providerId' => 'woocommerce', 'sourceOrigin' => 'https://site.example/shop/', 'productId' => '2']] && $wooCalls === [2], 'Only actual WooCommerce product IDs scoped to the full site base and no variant guesses.');
$posts = [new WP_Post(10)];
foreach (['http://site.example/shop/a', 'https://other.example/shop/a', 'https://site.example/outside', 'https://user:pass@site.example/shop/a', 'https://site.example:444/shop/a', 'https://site.example/shop/admin/a', 'https://site.example/shop/%61dmin/a', 'https://site.example/shop/ADMIN/a', 'https://site.example/shop/wp-admin/a', 'https://site.example/shop/wp-json/a', 'https://site.example/shop/api/a', 'https://site.example/shop/cart/a', 'https://site.example/shop/checkout', 'https://site.example/shop/%77p-admin/a', 'https://site.example/shop/%2e%2e/a', 'https://site.example/shop/%00bad', 'https://site.example/shop/a#fragment', 'https://site.example/shop/a?add-to-cart=10', 'https://site.example/shop/a?token=private'] as $url) {
    $urls[10] = $url; $result = AnswersProductPages::read(new WP_REST_Request());
    check($result['pages'] === [], 'Unsafe canonical URL omitted: ' . $url);
}
$urls[10] = 'https://site.example/shop/?page_id=10&lang=en';
check(count(AnswersProductPages::read(new WP_REST_Request())['pages']) === 1, 'Canonical plain permalink and explicit language query are supported.');
$urls = []; $localeProvider = 'polylang';
check(AnswersProductPages::read(new WP_REST_Request())['pages'][0]['locale'] === 'en-GB', 'Polylang regional locale preserved.');
$localeProvider = 'wpml';
check(AnswersProductPages::read(new WP_REST_Request())['pages'][0]['locale'] === 'pt-BR', 'WPML regional locale preserved.');
$localeProvider = 'none';
$valid = ['providerId' => 'catalog', 'sourceOrigin' => 'https://CATALOG.example:443/', 'productId' => 'opaque:product/10'];
$hook = [$valid, $valid, [...$valid, 'providerId' => 'other'], [...$valid, 'sourceOrigin' => 'https://second.example'], ['providerId' => 'bad', 'sourceOrigin' => 'https://catalog.example', 'productId' => []], [...$valid, 'secret' => 'never return'], [...$valid, 'providerId' => 'Invalid Provider'], [...$valid, 'productId' => "bad\nID"], [...$valid, 'productId' => ' '], [...$valid, 'sourceOrigin' => 'https://catalog.example/api'], [...$valid, 'sourceOrigin' => 'https://127.0.0.1'], [...$valid, 'sourceOrigin' => 'https://catalog.local']];
$identities = AnswersProductPages::read(new WP_REST_Request())['pages'][0]['identities'];
check(count($identities) === 3, 'Identity tuple collisions deduplicate exact matches but preserve provider/source namespace.');
check($identities[0] === ['providerId' => 'catalog', 'sourceOrigin' => 'https://catalog.example/', 'productId' => 'opaque:product/10'], 'Source bases normalized; opaque identifiers preserved exactly.');
$hook = [[...$valid, 'sourceOrigin' => 'https://catalog.example/shop-one'], [...$valid, 'sourceOrigin' => 'https://catalog.example/shop-two/']];
$identities = AnswersProductPages::read(new WP_REST_Request())['pages'][0]['identities'];
check(count($identities) === 2 && $identities[0]['sourceOrigin'] === 'https://catalog.example/shop-one/' && $identities[1]['sourceOrigin'] === 'https://catalog.example/shop-two/', 'Independent catalogs sharing a host retain separate source namespaces.');
$hook = [[...$valid, 'productId' => "bad\xff"], [...$valid, 'sourceOrigin' => "https://catalog.example/bad\xff"], [...$valid, 'productId' => str_repeat('x', 257)]];
check(AnswersProductPages::read(new WP_REST_Request())['pages'][0]['identities'] === [], 'Malformed UTF-8 and oversized identity strings cannot poison response encoding.');
foreach ([null, 'invalid', 'throw'] as $invalid) { $hook = $invalid; check(AnswersProductPages::read(new WP_REST_Request())['pages'][0]['identities'] === [], 'Malformed/failed identity hooks cannot break lookup.'); }
$hook = array_map(fn($i) => [...$valid, 'productId' => (string) $i], range(1, 40));
check(count(AnswersProductPages::read(new WP_REST_Request())['pages'][0]['identities']) === 8, 'Identity hook output remains bounded.');
$hook = [];
$posts = array_map(fn($i) => new WP_Post($i), range(1, 23));
$first = AnswersProductPages::read(new WP_REST_Request(['page' => '1', 'perPage' => '20']));
check(count($first['pages']) === 20 && $first['hasMore'], 'First page has bounded lookahead.');
$second = AnswersProductPages::read(new WP_REST_Request(['page' => '2', 'perPage' => '20']));
check(array_column($second['pages'], 'postId') === [21, 22, 23] && !$second['hasMore'] && $queryArgs['offset'] === 20, 'Second page avoids overlap.');
$site = 'http://site.example/';
check(AnswersProductPages::read(new WP_REST_Request()) instanceof WP_Error, 'HTTP site cannot supply product-page links.');
$route = file_get_contents(__DIR__ . '/../admin/php/admin.php');
check(str_contains($route, "'/answers-product-pages'") && str_contains($route, "AnswersProductPages::class, 'permission'"), 'Read-only route is registered with permission callback.');
echo "Answers product pages: $checks checks passed.\n";
