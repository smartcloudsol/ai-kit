<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');

final class WP_Post
{
    public function __construct(
        public int $ID,
        public string $post_type = 'page',
        public string $post_status = 'publish',
        public string $post_title = ''
    ) {
    }
}

$posts = array(
    11 => new WP_Post(11, 'page', 'publish', 'English page'),
    12 => new WP_Post(12, 'page', 'publish', 'Magyar oldal'),
    13 => new WP_Post(13, 'page', 'draft', 'Deutsche Seite'),
);

function get_locale(): string
{
    return 'en_US';
}

function sanitize_key(string $value): string
{
    return preg_replace('/[^a-z0-9_-]/', '', strtolower($value)) ?? '';
}

function absint(mixed $value): int
{
    return abs((int) $value);
}

function get_post(int $postId): ?WP_Post
{
    global $posts;
    return $posts[$postId] ?? null;
}

function get_the_title(WP_Post $post): string
{
    return $post->post_title;
}

function wp_strip_all_tags(string $value): string
{
    return strip_tags($value);
}

function get_permalink(int $postId): string
{
    return 'https://example.test/post/' . $postId;
}

function wp_json_encode(mixed $value, int $flags = 0): string|false
{
    return json_encode($value, $flags);
}

function pll_get_post_language(int $postId, string $field = 'slug'): string
{
    unset($field);
    return array(11 => 'en', 12 => 'hu', 13 => 'de')[$postId] ?? 'en';
}

function pll_get_post_translations(int $postId): array
{
    unset($postId);
    return array('en' => 11, 'hu' => 12, 'de' => 13);
}

function pll_default_language(string $field = 'slug'): string
{
    unset($field);
    return 'en';
}

require_once __DIR__ . '/../admin/php/kb/localization.php';

$localizationClass = \SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeBaseLocalization::class;
$resolved = $localizationClass::describe($posts[12]);
if ($resolved['provider'] !== 'polylang' || $resolved['currentLocale'] !== 'hu') {
    throw new RuntimeException('Polylang current locale was not resolved.');
}
if ($resolved['defaultLocale'] !== 'en' || count($resolved['variants']) !== 3) {
    throw new RuntimeException('Polylang translation variants were not resolved.');
}
$ids = array_column($resolved['variants'], 'postId', 'locale');
if ($ids !== array('de' => 13, 'en' => 11, 'hu' => 12)) {
    throw new RuntimeException('Translation variants must preserve independent post IDs.');
}
if ($localizationClass::normalizeLocale('fr_FR') !== 'fr') {
    throw new RuntimeException('Locale normalization must resolve one base language.');
}

echo "KB localization tests passed.\n";
