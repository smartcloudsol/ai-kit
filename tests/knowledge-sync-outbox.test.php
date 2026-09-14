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

final class KnowledgeSyncTestOverrideRepository
{
    public function get(int $post_id, string $doc_id, string $section_id): ?object
    {
        $GLOBALS['last_override_identity'] = [$post_id, $doc_id, $section_id];
        return (object) ['locked' => false, 'override_meta_json' => json_encode(['postUrl' => 'https://authored.example.com/base'])];
    }
}
class_alias(KnowledgeSyncTestOverrideRepository::class, 'SmartCloud\\WPSuite\\AiKit\\KnowledgeBase\\KBOverrideRepository');

final class KnowledgeSyncTestWpdb
{
    public string $prefix = 'wp_';
    /** @var list<array<int, mixed>> */
    public array $preparedArguments = [];
    /** @var list<string> */
    public array $preparedQueries = [];
    public int $queryCount = 0;

    public function prepare(string $query, mixed ...$arguments): string
    {
        $this->preparedArguments[] = $arguments;
        $this->preparedQueries[] = $query;
        return $query;
    }

    public function query(string $query): int|false
    {
        unset($query);
        $this->queryCount++;
        return 1;
    }

    public function get_row(string $query): ?object
    {
        unset($query);
        return null;
    }

    public function get_col(string $query): array
    {
        unset($query);
        return [];
    }

    public function get_results(string $query): array
    {
        unset($query);
        return $GLOBALS['test_db_results'] ?? [];
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
$cron_schedule = false;
$cron_next = false;
$cron_clear_count = 0;

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

function delete_option(string $name): bool
{
    global $options;
    unset($options[$name]);
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

function apply_filters(string $hook, mixed $value, mixed ...$args): mixed
{
    unset($hook);
    $state = $GLOBALS['release_gate_provider_state'] ?? $value;
    $query = is_array($args[0] ?? null) ? $args[0] : [];
    if (is_array($state) && is_string($query['consumerId'] ?? null)) {
        $state['verifiedReleases'] = array_values(array_filter(
            $state['verifiedReleases'] ?? [],
            static fn(array $release): bool => ($release['consumerId'] ?? '') === $query['consumerId']
        ));
    }
    return $state;
}

function __(string $text, string $domain = 'default'): string
{
    unset($domain);
    return $text;
}

function wp_get_schedule(string $hook, array $args = array()): string|false
{
    global $cron_schedule;
    unset($hook, $args);
    return $cron_schedule;
}

function wp_next_scheduled(string $hook, array $args = array()): int|false
{
    global $cron_next;
    unset($hook, $args);
    return $cron_next;
}

function wp_schedule_event(int $timestamp, string $recurrence, string $hook, array $args = array()): bool
{
    global $cron_schedule, $cron_next;
    unset($hook, $args);
    $cron_schedule = $recurrence;
    $cron_next = $timestamp;
    return true;
}

function wp_clear_scheduled_hook(string $hook, array $args = array(), bool $wp_error = false): int|false
{
    global $cron_schedule, $cron_next, $cron_clear_count;
    unset($hook, $args, $wp_error);
    $cron_schedule = false;
    $cron_next = false;
    $cron_clear_count++;
    return 1;
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
    if (isset($GLOBALS['test_permalink'])) {
        return $GLOBALS['test_permalink'];
    }
    return "https://example.com/{$post->post_type}/{$post->ID}/";
}

function wp_parse_url(string $url): array|false { return parse_url($url); }
function wp_strip_all_tags(string $value): string { return strip_tags($value); }
function get_the_title(WP_Post $post): string { return 'Generated title'; }
function get_the_excerpt(WP_Post $post): string { return 'Generated excerpt'; }

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
expect($settings->get()['syncIntervalMinutes'] === 5, 'Knowledge sync must preserve the five-minute default interval.');
$saved_settings = $settings->save(['syncIntervalMinutes' => 60]);
expect($saved_settings['syncIntervalMinutes'] === 60, 'Knowledge sync interval must be configurable in minutes.');
$saved_settings = $settings->save(['syncIntervalMinutes' => 2000]);
expect($saved_settings['syncIntervalMinutes'] === 1440, 'Knowledge sync interval must be bounded to one day.');
$settings->save(['syncIntervalMinutes' => 60]);
$runtime = new \SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncRuntime();
$cron_schedules = $runtime->addCronSchedule(array());
expect(
    ($cron_schedules['smartcloud_ai_kit_knowledge_sync_60_minutes']['interval'] ?? 0) === 3600,
    'The configured interval must be registered as the WordPress cron recurrence.'
);
$runtime->ensureScheduled();
expect($cron_schedule === 'smartcloud_ai_kit_knowledge_sync_60_minutes', 'The runner must use the configured recurrence.');
expect(is_int($cron_next) && $cron_next >= time() + 3599, 'The first automatic run must wait for the configured interval.');
$settings->save(['syncIntervalMinutes' => 120]);
$runtime->ensureScheduled();
expect($cron_clear_count === 1, 'Changing the interval must clear the previous recurrence.');
expect($cron_schedule === 'smartcloud_ai_kit_knowledge_sync_120_minutes', 'Changing the interval must reschedule the runner.');
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

$metadata_class = \SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncDocumentMetadata::class;
$baseline_class = \SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncBaselineService::class;
expect($metadata_class::resolve($published)['canonicalUrl'] === 'https://authored.example.com/base', 'Persisted metadata overrides apply even when markdown is unlocked.');
expect($GLOBALS['last_override_identity'] === [42, 'post-42/base', 'main'], 'Auto sync must read the same base document override row as manual publishing.');
$before_fingerprint = $baseline_class::serializerFingerprint();
$GLOBALS['test_permalink'] = 'https://dev.example.com/blog/post/?preview=no#section';
$options['smartcloud_ai_kit_kb_base_url_override'] = 'https://www.example.com/root/';
$metadata = $metadata_class::resolve($published, []);
expect($metadata['canonicalUrl'] === 'https://www.example.com/root/blog/post/?preview=no#section', 'Global URL override must preserve path, query, and fragment.');
expect($baseline_class::serializerFingerprint() !== $before_fingerprint, 'URL settings changes must invalidate already-ready baselines.');
$metadata = $metadata_class::resolve($published, [
    'postUrl' => 'https://custom.example.org/authored?x=1#part',
    'title' => 'Authored title', 'description' => 'Authored description',
    'category' => 'Solutions', 'subcategory' => 'Solution Guide', 'tags' => ['Authored tag'],
]);
expect($metadata['canonicalUrl'] === 'https://custom.example.org/authored?x=1#part', 'Explicit source URL must take precedence without rewriting.');
expect($metadata['title'] === 'Authored title' && $metadata['excerpt'] === 'Authored description', 'Authored title and description must override generated values.');
expect($metadata['classification'] === ['category' => 'Solutions', 'subcategory' => 'Solution Guide', 'tags' => ['Authored tag']], 'Classification overrides must be independent from WordPress terms.');
$metadata = $metadata_class::resolve($published, ['postUrl' => ' ', 'title' => '', 'description' => '', 'category' => '', 'tags' => []]);
expect($metadata['title'] === 'Generated title' && $metadata['excerpt'] === 'Generated excerpt', 'Blank text overrides must fall back to generated metadata.');
expect($metadata['canonicalUrl'] === 'https://www.example.com/root/blog/post/?preview=no#section', 'Blank source URL must fall back to global override.');
expect($metadata['classification'] === ['tags' => []], 'Explicit empty tags must preserve manual clearing semantics.');
unset($options['smartcloud_ai_kit_kb_base_url_override']);
expect($metadata_class::resolve($published, [])['canonicalUrl'] === $GLOBALS['test_permalink'], 'Without either override use the original permalink.');
unset($GLOBALS['test_permalink']);

$posts[42] = $published;
$before_queries = $wpdb->queryCount;
$capture->onBaseMetadataChanged(42, 'post-42/base', 'main');
expect($wpdb->queryCount === $before_queries + 1, 'Metadata-only edits must enqueue eligible published sources.');
$policies->saveForPostType('post', ['enabled' => true, 'reviewPolicy' => 'manual-kb-review']);
$capture->onBaseMetadataChanged(42, 'post-42/base', 'main');
$last_args = end($wpdb->preparedArguments);
expect($last_args[6] === 'blocked' && $last_args[9] === 'manual_review_required', 'Metadata changes must preserve manual approval requirements.');
$before_queries = $wpdb->queryCount;
$capture->onBaseMetadataChanged(42, 'post-42/other', 'main');
$posts[42] = $draft;
$capture->onBaseMetadataChanged(42, 'post-42/base', 'main');
$posts[51] = new WP_Post(51, 'private_note', 'publish');
$capture->onBaseMetadataChanged(51, 'post-51/base', 'main');
$posts[42] = $published;
$policies->saveForPostType('post', ['enabled' => false]);
$capture->onBaseMetadataChanged(42, 'post-42/base', 'main');
expect($wpdb->queryCount === $before_queries, 'Separate documents, drafts, private types and disabled policies must not enqueue base sync.');

$invalid_gate_rejected = false;
try {
    $settings->save(['publicReleaseGate' => 'unknown-provider']);
} catch (InvalidArgumentException) {
    $invalid_gate_rejected = true;
}
expect($invalid_gate_rejected, 'Unknown public release gate providers must be rejected.');

$before_queries = $wpdb->queryCount;
$gated_settings = $settings->save(['publicReleaseGate' => 'static-publisher']);
expect($gated_settings['publicReleaseGate'] === 'static-publisher', 'Static Publisher release gating must be explicitly selectable.');
expect($wpdb->queryCount === $before_queries + 1, 'Enabling the gate must fail-close already-active outbox rows.');
$transition_query = end($wpdb->preparedQueries);
expect(str_contains($transition_query, "WHERE state <> 'complete'"), 'The enable transition must preserve completed rows.');
expect(str_contains($transition_query, 'desired_publisher_sequence = NULL'), 'The enable transition must await an authoritative cutoff.');

$GLOBALS['release_gate_provider_state'] = [
    'contractVersion' => 1,
    'provider' => 'smartcloud-static-publisher',
    'available' => true,
    'configuredConsumerIds' => ['content-sync:production'],
    'lastPostEventSequence' => 73,
    'verifiedReleases' => [[
        'consumerId' => 'content-sync:production',
        'rootBlogId' => 1,
        'includeSubsites' => false,
        'scopeFingerprint' => str_repeat('a', 64),
        'baselineId' => str_repeat('b', 64),
        'committedSequence' => 70,
        'postTypes' => ['post'],
        'acknowledgedGmt' => '2026-09-14T08:00:00Z',
    ]],
];
$release_cursor = (object) [
    'consumer_id' => 'content-sync:production',
    'scope_fingerprint' => str_repeat('a', 64),
    'baseline_id' => str_repeat('b', 64),
    'verified_sequence' => 70,
];
$gate_class = \SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncPublicReleaseGate::class;
expect(
    $gate_class::postCoveredByCursor(1, 'post', 42, $release_cursor) === false,
    'A post journaled after the verified publish cursor must not enter the baseline early.'
);
$GLOBALS['release_gate_provider_state']['lastPostEventSequence'] = 69;
expect(
    $gate_class::postCoveredByCursor(1, 'post', 42, $release_cursor) === true,
    'A post at or before the verified publish cursor may enter the baseline.'
);
$GLOBALS['release_gate_provider_state']['lastPostEventSequence'] = 0;
expect(
    $gate_class::postCoveredByCursor(1, 'post', 42, $release_cursor) === true,
    'A post predating the retained journal is covered by the verified full baseline.'
);
$GLOBALS['release_gate_provider_state']['lastPostEventSequence'] = 73;
$policies->saveForPostType('post', ['enabled' => true, 'reviewPolicy' => 'wordpress-publish-is-approval']);
$capture->onAfterInsertPost(42, $published, true, $published);
$gated_args = end($wpdb->preparedArguments);
expect($gated_args[10] === 1, 'Content-bound work must record that public release eligibility is required.');
expect($gated_args[11] === 'content-sync:production', 'Desired work must bind to the selected publisher consumer.');
expect($gated_args[12] === '73', 'Desired work must retain the publisher journal sequence.');

$GLOBALS['release_gate_provider_state']['verifiedReleases'][] = array_merge(
    $GLOBALS['release_gate_provider_state']['verifiedReleases'][0],
    ['consumerId' => 'content-sync:staging']
);
$GLOBALS['release_gate_provider_state']['configuredConsumerIds'][] = 'content-sync:staging';
$capture->onAfterInsertPost(42, $published, true, $published);
$ambiguous_args = end($wpdb->preparedArguments);
expect($ambiguous_args[11] === '' && $ambiguous_args[12] === '', 'Ambiguous publisher consumers must fail closed.');

$capture->onBaseMetadataChanged(42, 'post-42/base', 'main');
$metadata_args = end($wpdb->preparedArguments);
expect($metadata_args[10] === 0, 'AI-only metadata for an existing public URL may remain ungated.');

$outbox->claimBatch(25, 300, 'gate-test', null, null, true);
$claim_query = end($wpdb->preparedQueries);
expect(str_contains($claim_query, 'rc.consumer_id = o.desired_publisher_consumer_id'), 'A gated claim must bind its cutoff to the exact publisher consumer.');
expect(str_contains($claim_query, 'rc.verified_sequence >= o.desired_publisher_sequence'), 'A gated claim must require a verified cutoff at or beyond the desired event.');

$GLOBALS['release_gate_provider_state']['verifiedReleases'] = [
    $GLOBALS['release_gate_provider_state']['verifiedReleases'][0],
];
$GLOBALS['release_gate_provider_state']['configuredConsumerIds'] = ['content-sync:production'];
$gate_state = \SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncPublicReleaseGate::refresh(1, ['post']);
expect($gate_state['configured'] === true, 'Exactly one verified consumer covering the complete policy scope must configure the gate.');
$GLOBALS['release_gate_provider_state']['verifiedReleases'][] = array_merge(
    $GLOBALS['release_gate_provider_state']['verifiedReleases'][0],
    ['consumerId' => 'content-sync:staging']
);
$GLOBALS['release_gate_provider_state']['configuredConsumerIds'][] = 'content-sync:staging';
\SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncPublicReleaseGate::clearSelection();
$gate_state = \SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncPublicReleaseGate::refresh(1, ['post']);
expect($gate_state['configured'] === false, 'Multiple unselected consumers covering the same scope must fail closed.');
expect($gate_state['reason'] === 'ambiguous-content-sync-consumer', 'Ambiguous coverage must expose an actionable status reason.');
unset($GLOBALS['release_gate_provider_state']['configuredConsumerIds']);
$gate_state = \SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncPublicReleaseGate::refresh(1, ['post']);
expect($gate_state['configured'] === false, 'An older provider without active-consumer discovery must fail closed.');
expect($gate_state['reason'] === 'provider-release-contract-incomplete', 'An incomplete provider contract must be visible in status.');
$GLOBALS['release_gate_provider_state']['configuredConsumerIds'] = [];
$gate_state = \SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncPublicReleaseGate::refresh(1, ['post']);
expect($gate_state['reason'] === 'content-sync-consumer-not-configured', 'An empty active-consumer list must report missing content-sync configuration.');

$GLOBALS['test_db_results'] = [(object) [
    'blog_id' => 1,
    'post_type' => 'post',
    'consumer_id' => 'content-sync:production',
]];
\SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncPublicReleaseGate::selectConsumer('content-sync:production');
$GLOBALS['release_gate_provider_state']['configuredConsumerIds'] = ['content-sync:staging'];
$gate_state = \SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncPublicReleaseGate::refresh(1, ['post']);
expect($gate_state['configured'] === false, 'Removing the selected active consumer must fail closed.');
expect($gate_state['reason'] === 'selected-consumer-no-longer-configured', 'A removed selection must expose its dedicated status reason.');
$GLOBALS['test_db_results'] = [];
$gate_state = \SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncPublicReleaseGate::refresh(1, ['post']);
expect($gate_state['reason'] === 'selected-consumer-no-longer-configured', 'A removed selection must not fall back to another historical consumer on a later run.');
unset($GLOBALS['test_db_results']);

echo "Knowledge-sync policy and outbox capture tests passed.\n";
