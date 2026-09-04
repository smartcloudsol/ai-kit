<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');

final class WP_Post
{
    public function __construct(
        public int $ID,
        public string $post_type,
        public string $post_status
    ) {
    }
}

final class WP_Taxonomy
{
    public function __construct(
        public bool $public = true,
        public bool $hierarchical = false
    ) {
    }
}

final class KnowledgeSyncTestWpdb
{
    public string $prefix = 'wp_';
    /** @var list<array<int, mixed>> */
    public array $preparedArguments = [];
    public int $queryCount = 0;

    public function prepare(string $query, mixed ...$arguments): string
    {
        $this->preparedArguments[] = $arguments;
        return $query;
    }

    public function query(string $query): int|false
    {
        unset($query);
        $this->queryCount++;
        return 1;
    }
}

$options = [];
$post_type_objects = [
    'post' => (object) ['public' => true, 'publicly_queryable' => true, '_builtin' => true],
    'page' => (object) ['public' => true, 'publicly_queryable' => false, '_builtin' => true],
    'private_note' => (object) ['public' => false, 'publicly_queryable' => false, '_builtin' => false],
];
$posts = [];
$taxonomy_terms = [];
$wpdb = new KnowledgeSyncTestWpdb();

function expect(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function get_option(string $name, mixed $default = false): mixed
{
    global $options;
    return $options[$name] ?? $default;
}

function update_option(string $name, mixed $value, ?bool $autoload = null): bool
{
    global $options;
    unset($autoload);
    $options[$name] = $value;
    return true;
}

function sanitize_key(string $value): string
{
    return preg_replace('/[^a-z0-9_-]/', '', strtolower($value)) ?? '';
}

function absint(mixed $value): int
{
    return abs((int) $value);
}

function is_multisite(): bool
{
    return false;
}

function current_time(string $type, bool $gmt = false): string
{
    unset($type, $gmt);
    return '2026-09-02 08:00:00';
}

function add_action(string $hook, callable $callback, int $priority = 10, int $accepted_args = 1): void
{
    unset($hook, $callback, $priority, $accepted_args);
}

function do_action(string $hook, mixed ...$args): void
{
    unset($hook, $args);
}

function wp_json_encode(mixed $value, int $flags = 0): string|false
{
    return json_encode($value, $flags);
}

function wp_is_post_revision(int $post_id): bool
{
    unset($post_id);
    return false;
}

function wp_is_post_autosave(int $post_id): bool
{
    unset($post_id);
    return false;
}

function get_current_blog_id(): int
{
    return 1;
}

function get_post_type_object(string $post_type): ?object
{
    global $post_type_objects;
    return $post_type_objects[$post_type] ?? null;
}

function is_post_type_viewable(object $post_type): bool
{
    return !empty($post_type->publicly_queryable) ||
        (!empty($post_type->_builtin) && !empty($post_type->public));
}

function get_post(int $post_id): ?WP_Post
{
    global $posts;
    return $posts[$post_id] ?? null;
}

function get_taxonomy(string $taxonomy): ?WP_Taxonomy
{
    return match ($taxonomy) {
        'category' => new WP_Taxonomy(true, true),
        'post_tag' => new WP_Taxonomy(true, false),
        default => null,
    };
}

function get_terms(array $arguments): array
{
    global $taxonomy_terms;
    $terms = $taxonomy_terms[(string) ($arguments['taxonomy'] ?? '')] ?? [];
    $offset = (int) ($arguments['offset'] ?? 0);
    $number = (int) ($arguments['number'] ?? count($terms));
    return array_slice($terms, $offset, $number);
}

function is_wp_error(mixed $value): bool
{
    unset($value);
    return false;
}

function sanitize_text_field(string $value): string
{
    return trim(strip_tags($value));
}

function get_permalink(WP_Post $post): string
{
    return "https://example.com/{$post->post_type}/{$post->ID}/";
}

function wp_generate_uuid4(): string
{
    static $sequence = 0;
    $sequence++;
    return '00000000-0000-4000-8000-' . str_pad((string) $sequence, 12, '0', STR_PAD_LEFT);
}

require_once __DIR__ . '/../admin/php/kb/knowledge-sync.php';
require_once __DIR__ . '/../admin/php/kb/knowledge-sync-runtime.php';

use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncCapture;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncOutboxRepository;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncPolicyStore;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncRetryPolicy;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncSettingsStore;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncVocabularyService;

$policies = new KnowledgeSyncPolicyStore();
$outbox = new KnowledgeSyncOutboxRepository();
$capture = new KnowledgeSyncCapture($policies, $outbox);

$draft = new WP_Post(42, 'post', 'draft');
$published = new WP_Post(42, 'post', 'publish');
$posts[42] = $published;
$capture->onAfterInsertPost(42, $draft, false, null);
expect($wpdb->queryCount === 0, 'Draft creation must not create outbox work.');

$policy = $policies->saveForPostType('post', [
    'enabled' => true,
    'reviewPolicy' => 'wordpress-publish-is-approval',
    'includeTaxonomies' => ['post_tag', 'category', 'category'],
]);
expect($policy['includeTaxonomies'] === ['category', 'post_tag'], 'Taxonomy scope must be normalized.');
expect(strlen($policies->fingerprint($policy)) === 64, 'Policy fingerprint must be a SHA-256 digest.');
expect(KnowledgeSyncRetryPolicy::delaySeconds(1) === 30, 'First retry delay must be 30 seconds.');
expect(KnowledgeSyncRetryPolicy::delaySeconds(20, 30) === 3630, 'Retry delay must be bounded at one hour plus bounded jitter.');
$strict_policy_rejected = false;
try {
    $policies->saveForPostType('post', [
        'enabled' => true,
        'reviewPolicy' => 'wordpress-publish-is-approval',
        'objectKey' => 'documents/unsafe.md',
    ]);
} catch (InvalidArgumentException) {
    $strict_policy_rejected = true;
}
expect($strict_policy_rejected, 'Policy input must reject caller-selected storage keys and unknown fields.');

$settings = new KnowledgeSyncSettingsStore();
expect($settings->get()['includeSubsites'] === false, 'Subsite following must default to disabled.');
$subsite_setting_rejected = false;
try {
    $settings->save(['includeSubsites' => true]);
} catch (InvalidArgumentException) {
    $subsite_setting_rejected = true;
}
expect($subsite_setting_rejected, 'A non-multisite installation must reject subsite following.');

$capture->onAfterInsertPost(42, $published, true, $draft);
expect($wpdb->queryCount === 1, 'Draft to publish must enqueue one desired-state upsert.');
$publish_args = $wpdb->preparedArguments[0];
expect($publish_args[5] === 'upsert', 'Published content must request an upsert.');
expect($publish_args[6] === 'pending', 'Approved publish must be pending, not blocked.');

$capture->onAfterInsertPost(42, $published, true, $published);
expect($wpdb->queryCount === 2, 'A published update must advance the same desired-state row.');

$capture->onSetObjectTerms(42, [], [11], 'post_tag', false, []);
expect($wpdb->queryCount === 3, 'A selected taxonomy change on public content must enqueue an upsert.');
$capture->onSetObjectTerms(42, [], [11], 'unselected_taxonomy', false, []);
expect($wpdb->queryCount === 3, 'An unselected taxonomy must not enqueue knowledge-sync work.');

$capture->onAfterInsertPost(42, $draft, true, $published);
$unpublish_args = $wpdb->preparedArguments[3];
expect($unpublish_args[5] === 'delete', 'Unpublish must request a delete tombstone.');

$policies->saveForPostType('post', [
    'enabled' => true,
    'reviewPolicy' => 'manual-kb-review',
]);
$capture->onAfterInsertPost(42, $published, true, $draft);
$manual_args = $wpdb->preparedArguments[4];
expect($manual_args[6] === 'blocked', 'Manual-review upserts must remain blocked.');
expect($manual_args[9] === 'manual_review_required', 'Blocked work must retain an actionable reason.');

$policies->saveForPostType('private_note', [
    'enabled' => true,
    'reviewPolicy' => 'wordpress-publish-is-approval',
]);
$capture->onAfterInsertPost(51, new WP_Post(51, 'private_note', 'publish'), true, null);
expect($wpdb->queryCount === 5, 'Non-public post types must not create knowledge-sync work.');

$policies->saveForPostType('page', [
    'enabled' => true,
    'reviewPolicy' => 'wordpress-publish-is-approval',
]);
$page = new WP_Post(52, 'page', 'publish');
$posts[52] = $page;
$capture->onAfterInsertPost(52, $page, true, null);
expect($wpdb->queryCount === 6, 'The built-in publicly viewable page type must create knowledge-sync work.');

$taxonomy_terms['post_tag'] = [(object) [
    'term_id' => 7,
    'slug' => 'ai-kit',
    'name' => 'AI Kit',
    'parent' => 0,
]];
$policies->saveForPostType('post', [
    'enabled' => true,
    'reviewPolicy' => 'wordpress-publish-is-approval',
    'includeTaxonomies' => ['post_tag'],
]);
$options['smartcloud_ai_kit_kb_sync_vocabulary_state'] = [
    'sourceVersion' => 4,
    'namespaces' => [
        'post_tag' => [[
            'slug' => 'ai-kit',
            'label' => 'AI kit',
        ]],
    ],
];
$metadata_diff = (new KnowledgeSyncVocabularyService())->metadataDiff();
expect($metadata_diff['status'] === 'changed', 'A display-label change must make the metadata diff dirty.');
expect($metadata_diff['additions'] === [], 'A display-label change must not be reported as an addition.');
expect($metadata_diff['removals'] === [], 'A display-label change must not be reported as a removal.');
expect($metadata_diff['changes'] === [[
    'namespace' => 'post_tag',
    'slug' => 'ai-kit',
    'fromLabel' => 'AI kit',
    'toLabel' => 'AI Kit',
    'fromParentSlug' => null,
    'toParentSlug' => null,
]], 'A display-label change must preserve its before and after values.');

$taxonomy_terms['category'] = [
    (object) ['term_id' => 10, 'slug' => 'company', 'name' => 'Company', 'parent' => 0],
    (object) ['term_id' => 11, 'slug' => 'about-wp-suite', 'name' => 'About WP Suite', 'parent' => 10],
    (object) ['term_id' => 12, 'slug' => 'history', 'name' => 'History', 'parent' => 11],
];
$policies->saveForPostType('post', [
    'enabled' => true,
    'reviewPolicy' => 'wordpress-publish-is-approval',
    'includeTaxonomies' => ['category'],
]);
$category_namespace = (new KnowledgeSyncVocabularyService())->desiredNamespaces()['category'] ?? [];
expect($category_namespace === [
    ['slug' => 'about-wp-suite', 'label' => 'About WP Suite', 'parentSlug' => 'company'],
    ['slug' => 'company', 'label' => 'Company'],
    ['slug' => 'history', 'label' => 'History', 'parentSlug' => 'about-wp-suite'],
], 'Hierarchical taxonomies must retain every direct parent slug.');

echo "Knowledge-sync policy and outbox capture tests passed.\n";
