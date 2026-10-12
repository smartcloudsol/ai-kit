<?php
declare(strict_types=1);

// Reuse the durable capture/projection WordPress fixture and run its regressions too.
require __DIR__ . '/knowledge-sync-outbox.test.php';

use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncStructuredContent as Structured;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncProjectionException;

function get_registered_meta_keys(string $object_type, string $subtype = ''): array
{
    expect($object_type === 'post', 'Discovery must only inspect registered post metadata.');
    return $GLOBALS['structured_registered'][$subtype] ?? [];
}
function metadata_exists(string $type, int $post_id, string $key): bool
{
    return $type === 'post' && array_key_exists($key, $GLOBALS['structured_values'][$post_id] ?? []);
}
function get_post_meta(int $post_id, string $key, bool $single = false): mixed
{
    expect($single, 'Read only a single selected metadata key.');
    $GLOBALS['structured_reads'][] = [$post_id, $key];
    return $GLOBALS['structured_values'][$post_id][$key] ?? null;
}
function post_type_supports(string $post_type, string $feature): bool
{
    return $post_type === 'post' && !in_array($feature, $GLOBALS['structured_unsupported_features'] ?? [], true);
}
function get_post_thumbnail_id(int $post_id): int { return (int) ($GLOBALS['structured_values'][$post_id]['_thumbnail_id'] ?? 0); }
function wp_attachment_is_image(int $post_id): bool { return $post_id === 501; }
function wp_get_attachment_image_url(int $post_id, string $size): string|false
{
    expect($size === 'full', 'Native image projection must request the real full-size source.');
    return $GLOBALS['structured_image_urls'][$post_id] ?? false;
}
function get_posts(array $args): array
{
    $GLOBALS['structured_reference_queries'][] = $args;
    if ($args['post_type'] === 'attachment') { return array_slice($GLOBALS['structured_child_attachments'] ?? [], $args['offset'], $args['posts_per_page']); }
    return array_slice($GLOBALS['structured_reference_posts'] ?? [], $args['offset'], $args['posts_per_page']);
}
function structured_reject(callable $callback, string $expected): void
{
    try { $callback(); }
    catch (InvalidArgumentException $error) {
        expect($expected === 'policy', 'Unexpected policy failure.'); return;
    }
    catch (KnowledgeSyncProjectionException $error) {
        expect($error->error_code === $expected, 'Expected diagnostic ' . $expected . ', got ' . $error->error_code); return;
    }
    throw new RuntimeException('Invalid structured content was accepted: ' . $expected);
}

$base_registration = ['single' => true, 'show_in_rest' => true, 'type' => 'string', 'description' => 'A source-owned external reference'];
$GLOBALS['structured_registered'] = [
    '' => ['public_reference' => $base_registration, 'global_field' => $base_registration],
    'post' => [
        'public_reference' => array_replace($base_registration, ['description' => 'Subtype overrides global']),
        'list_field' => ['single' => true, 'show_in_rest' => ['schema' => ['type' => 'array', 'items' => ['type' => 'string']]], 'type' => 'array'],
        'number_field' => array_replace($base_registration, ['type' => 'number']),
        'boolean_field' => array_replace($base_registration, ['type' => 'boolean']),
        'integer_field' => array_replace($base_registration, ['type' => 'integer']),
        'secret_token' => $base_registration,
        'private_field' => array_replace($base_registration, ['show_in_rest' => false]),
        'write_only' => array_replace($base_registration, ['show_in_rest' => ['schema' => ['writeOnly' => true]]]),
        'multiple_field' => array_replace($base_registration, ['single' => false]),
        'object_field' => array_replace($base_registration, ['type' => 'object']),
    ],
];
$GLOBALS['structured_values'][42] = ['public_reference' => 'https://booking.example.org/location?providerId=31', 'secret_token' => 'do-not-export'];
$GLOBALS['structured_reads'] = [];
$discovered = Structured::candidates('post');
$candidates = array_column(array_filter($discovered, static fn(array $field): bool => isset($field['sourceMetaKey'])), null, 'sourceMetaKey');
expect(count($candidates) === 6 && $candidates['public_reference']['description'] === 'Subtype overrides global', 'Discovery merges registrations and excludes unsafe/unreadable/untyped/non-single fields.');
$native_candidates = array_column(array_filter($discovered, static fn(array $field): bool => isset($field['sourcePostField'])), null, 'sourcePostField');
expect(array_keys($native_candidates) === ['featuredImageUrl', 'featuredImageAlt', 'excerpt'], 'Only the fixed supported native sources are discoverable.');
expect($GLOBALS['structured_reads'] === [], 'Discovery must never read values.');
$mapping = ['sourceMetaKey' => 'public_reference', 'targetKey' => 'external_reference', 'type' => 'url', 'description' => 'Reference URL supplied by this content record'];
$selection = ['enabled' => true, 'fields' => [$mapping]];
foreach ([['status' => 'verified'], ['status' => 'legacy'], ['status' => 'verified', 'version' => '1'], ['status' => 'unconfigured']] as $unsupported) {
    $GLOBALS['structured_test_capability'] = $unsupported;
    structured_reject(fn() => $policies->saveForPostType('post', ['enabled' => true, 'reviewPolicy' => 'wordpress-publish-is-approval', 'structuredContent' => $selection]), 'policy');
    expect(!isset($policies->getForPostType('post')['structuredContent']), 'Unsupported backend cannot create a newly enabled mapping.');
}
$GLOBALS['structured_test_capability'] = ['status' => 'verified', 'version' => 1];
$policy = $policies->saveForPostType('post', ['enabled' => true, 'reviewPolicy' => 'wordpress-publish-is-approval', 'structuredContent' => $selection]);
expect($policy['structuredContent'] === $selection, 'Opt-in policy retains exact authored field semantics.');
foreach ([['status' => 'verified'], ['status' => 'legacy'], ['status' => 'verified', 'version' => '1'], ['status' => 'unconfigured']] as $unsupported) {
    $GLOBALS['structured_test_capability'] = $unsupported;
    $modified = array_replace($policy, ['structuredContent' => ['enabled' => true, 'fields' => [array_replace($mapping, ['description' => 'Changed description'])]]]);
    structured_reject(fn() => $policies->saveForPostType('post', $modified), 'policy');
    expect($policies->getForPostType('post') === $policy, 'Unsupported save must preserve existing mapping unchanged.');
    expect($policies->saveForPostType('post', $policy) === $policy, 'Unchanged existing policy remains readable and savable without capability.');
}
$GLOBALS['structured_test_capability'] = ['status' => 'verified', 'version' => 1];
$second_mapping = ['sourceMetaKey' => 'global_field', 'targetKey' => 'secondary_reference', 'type' => 'string', 'description' => 'A second source-owned reference'];
$extended_policy = $policies->saveForPostType('post', array_replace($policy, ['structuredContent' => ['enabled' => true, 'fields' => [$mapping, $second_mapping]]]));
$GLOBALS['structured_test_capability'] = ['status' => 'legacy'];
foreach (['description' => 'Changed meaning', 'sourceMetaKey' => 'global_field', 'type' => 'string', 'targetKey' => 'another_reference'] as $field => $replacement) {
    $edited_subset = array_replace($extended_policy, ['structuredContent' => ['enabled' => true, 'fields' => [array_replace($mapping, [$field => $replacement])]]]);
    structured_reject(fn() => $policies->saveForPostType('post', $edited_subset), 'policy');
    expect($policies->getForPostType('post') === $extended_policy, 'A removal combined with any retained-field edit must fail closed.');
}
expect($policies->saveForPostType('post', $policy) === $policy, 'Strict field-only subset removal is allowed without backend capability.');
structured_reject(fn() => $policies->saveForPostType('post', $extended_policy), 'policy');
$inactive_policy = $policies->saveForPostType('post', array_replace($policy, ['enabled' => false]));
structured_reject(fn() => $policies->saveForPostType('post', $policy), 'policy');
expect(!$policies->getForPostType('post')['enabled'], 'Re-enabling a KB policy carrying structured fields still requires backend capability.');
$GLOBALS['structured_test_capability'] = ['status' => 'verified', 'version' => 1];
$policy = $policies->saveForPostType('post', $policy);
$before_fingerprint = $policies->fingerprint($policy);
$posts[42] = new WP_Post(42, 'post', 'publish');
$projection = $builder->build($lease);
expect($projection['schemaVersion'] === 3 && $projection['document']['locale'] !== '', 'Opt-in document is v3 and preserves v2 locale.');
expect((array) $projection['document']['structuredContent']['fields'] === ['external_reference' => $GLOBALS['structured_values'][42]['public_reference']], 'Only selected typed own fields are projected.');
expect($projection['source']['postId'] === '42' && $projection['source']['postType'] === 'post', 'Protected entity identity remains unchanged.');
expect($GLOBALS['structured_reads'] === [[42, 'public_reference']], 'No unrelated metadata is read.');
$GLOBALS['structured_values'][42]['public_reference'] = 'https://booking.example.org/location?providerId=32';
$updated_projection = $builder->build($lease);
expect(json_encode($projection['document']['structuredContent']) !== json_encode($updated_projection['document']['structuredContent']), 'Own-field-only edits change serialized desired state even when Markdown is unchanged.');
unset($GLOBALS['structured_values'][42]['public_reference']);
$cleared_projection = $builder->build($lease);
expect((array) $cleared_projection['document']['structuredContent']['fields'] === [], 'Missing field clears remote value rather than preserving old value.');
expect(isset($cleared_projection['document']['structuredContent']['fieldSchema']->external_reference), 'Missing field retains selected field semantics.');
$GLOBALS['structured_values'][42]['public_reference'] = '';
expect((array) Structured::project(42, 'post', $selection)['fields'] === [], 'An explicitly empty optional URL clears without blocking.');
foreach (['source_url', 'site_id', 'release_version', 'taxonomy_custom', '__proto__', 'constructor', 'workspace_scope', 'entity_ref'] as $key) {
    structured_reject(fn() => Structured::normalizePolicy('post', ['enabled' => true, 'fields' => [array_replace($mapping, ['targetKey' => $key])]], true), 'policy');
}
structured_reject(fn() => Structured::normalizePolicy('post', ['enabled' => true, 'fields' => [$mapping, $mapping]], true), 'policy');
structured_reject(fn() => Structured::normalizePolicy('post', ['enabled' => true, 'fields' => [array_replace($mapping, ['sourceMetaKey' => 'secret_token'])]], true), 'policy');
structured_reject(fn() => Structured::normalizePolicy('post', ['enabled' => true, 'fields' => [array_replace($mapping, ['type' => 'number'])]], true), 'policy');
foreach (['javascript:alert(1)', 'https://user:password@example.org/', 'https://example.org/ a', 12, null, str_repeat('x', 4097)] as $bad) {
    $GLOBALS['structured_values'][42]['public_reference'] = $bad;
    structured_reject(fn() => Structured::project(42, 'post', $selection), 'structured_content_value_invalid');
}
foreach (['number_field' => ['number', 12.5, '+12.5'], 'boolean_field' => ['boolean', true, 'true'], 'list_field' => ['string-list', ['a', 'b'], ['a', 2]]] as $key => [$type, $good, $bad]) {
    $typed_policy = ['enabled' => true, 'fields' => [['sourceMetaKey' => $key, 'targetKey' => 'typed_value', 'type' => $type, 'description' => 'Typed source value']]];
    $GLOBALS['structured_values'][42][$key] = $good;
    expect(((array) Structured::project(42, 'post', $typed_policy)['fields'])['typed_value'] === $good, 'Typed value must not be converted.');
    $GLOBALS['structured_values'][42][$key] = $bad;
    structured_reject(fn() => Structured::project(42, 'post', $typed_policy), 'structured_content_value_invalid');
}
foreach (['number_field' => ['number', ['12.5' => 12.5, '1e2' => 100.0]], 'integer_field' => ['number', ['17' => 17]], 'boolean_field' => ['boolean', ['1' => true, '' => false]]] as $key => [$type, $values]) {
    $typed_policy = ['enabled' => true, 'fields' => [['sourceMetaKey' => $key, 'targetKey' => 'typed_value', 'type' => $type, 'description' => 'Typed source value']]];
    foreach ($values as $stored => $expected) {
        $GLOBALS['structured_values'][42][$key] = (string) $stored;
        expect(((array) Structured::project(42, 'post', $typed_policy)['fields'])['typed_value'] === $expected, 'Registered scalar canonical WordPress storage is decoded deterministically.');
    }
    foreach ($key === 'integer_field' ? ['1.5', '9007199254740992', '01', ' 1'] : ($key === 'number_field' ? ['01', ' 1', '1e999', '9007199254740993'] : ['0', 'false', 'yes', 1]) as $bad) {
        $GLOBALS['structured_values'][42][$key] = $bad;
        structured_reject(fn() => Structured::project(42, 'post', $typed_policy), 'structured_content_value_invalid');
    }
}
$list_policy = ['enabled' => true, 'fields' => [['sourceMetaKey' => 'list_field', 'targetKey' => 'labels', 'type' => 'string-list', 'description' => 'Labels']]];
$GLOBALS['structured_values'][42]['list_field'] = array_fill(0, 65, 'x');
structured_reject(fn() => Structured::project(42, 'post', $list_policy), 'structured_content_value_invalid');
$GLOBALS['structured_values'][42]['list_field'] = array_fill(0, 3, str_repeat('x', 4096));
structured_reject(fn() => Structured::project(42, 'post', $list_policy), 'structured_content_too_large');

// Reuse the existing publisher cursor fixture to prove selected-field hooks cannot bypass approval.
$options['smartcloud_ai_kit_kb_sync_settings'] = ['publicReleaseGate' => 'static-publisher'];
$GLOBALS['release_gate_provider_state'] = [
    'contractVersion' => 1, 'provider' => 'smartcloud-static-publisher', 'available' => true,
    'configuredConsumerIds' => ['content-sync:production'], 'lastPostEventSequence' => 71,
    'verifiedReleases' => [['consumerId' => 'content-sync:production', 'rootBlogId' => 1, 'includeSubsites' => false, 'postTypes' => ['post']]],
];
$before_queries = $wpdb->queryCount;
$capture->onStructuredMetadataChanged(1, 42, 'unselected_field', 'ignored');
expect($wpdb->queryCount === $before_queries, 'Unselected field changes do not enqueue.');
$capture->onStructuredMetadataChanged(1, 42, 'public_reference', 'changed');
$args = end($wpdb->preparedArguments);
expect($wpdb->queryCount === $before_queries + 1 && $args[10] === 1 && $args[6] === 'blocked' && $args[9] === 'structured_content_publication_event_missing' && $args[12] === '', 'Nonadvancing journal fails closed rather than reusing a released cursor.');
$GLOBALS['test_action_handler'] = static function (string $hook, array $args): void {
    if ($hook !== 'smartcloud_static_publisher_resource_changed_v1') { return; }
    expect($args[0]['postId'] === 42 && $args[0]['blogId'] === 1 && count($args[0]['renderUrls']) === 1, 'Resource journal bridge names exact changed source and its public render URL.');
    $GLOBALS['release_gate_provider_state']['lastPostEventSequence']++;
};
$capture->onStructuredMetadataChanged(1, 42, 'public_reference', 'first');
$args = end($wpdb->preparedArguments);
expect($args[6] === 'pending' && $args[10] === 1 && $args[12] === '72', 'Successful metadata journal bridge captures new unpublished sequence.');
$capture->onStructuredMetadataChanged(2, 42, 'public_reference', 'final');
$args = end($wpdb->preparedArguments);
expect($args[12] === '73', 'Sequential metabox saves coalesce on the latest publication event, not an intermediate released sequence.');
$GLOBALS['test_action_handler'] = static function (): void { throw new RuntimeException('Simulated journal failure'); };
$capture->onStructuredMetadataChanged(3, 42, 'public_reference', 'failure');
$args = end($wpdb->preparedArguments);
expect($args[6] === 'blocked' && $args[12] === '', 'Throwing journal cannot silently fall back to previous approval.');
unset($GLOBALS['release_gate_provider_state'], $GLOBALS['test_action_handler']);
$capture->onStructuredMetadataChanged(4, 42, 'public_reference', 'no-provider');
$args = end($wpdb->preparedArguments);
expect($args[6] === 'blocked' && $args[12] === '', 'Absent Publisher provider fails closed.');
$options['smartcloud_ai_kit_kb_sync_settings'] = ['publicReleaseGate' => 'disabled'];
$capture->onStructuredMetadataChanged(5, 42, 'public_reference', 'wordpress-approved');
$args = end($wpdb->preparedArguments);
expect($args[6] === 'pending' && $args[10] === 0, 'Without release gate, WordPress publication remains the approval path.');

$image_mapping = ['sourcePostField' => 'featuredImageUrl', 'targetKey' => 'featured_image', 'type' => 'url', 'description' => 'Actual public featured image'];
$alt_mapping = ['sourcePostField' => 'featuredImageAlt', 'targetKey' => 'featured_image_alt', 'type' => 'string', 'description' => 'Authored image alternative text'];
$excerpt_mapping = ['sourcePostField' => 'excerpt', 'targetKey' => 'summary', 'type' => 'string', 'description' => 'Authored excerpt, not generated body text'];
$native_selection = ['enabled' => true, 'fields' => [$image_mapping, $alt_mapping, $excerpt_mapping]];
foreach ([array_replace($image_mapping, ['sourceMetaKey' => 'another']), array_replace($image_mapping, ['sourcePostField' => 'post_content']), array_replace($image_mapping, ['type' => 'string']), array_replace($alt_mapping, ['type' => 'url'])] as $bad) {
    structured_reject(fn() => Structured::normalizePolicy('post', ['enabled' => true, 'fields' => [$bad]], true), 'policy');
}
structured_reject(fn() => Structured::normalizePolicy('post', ['enabled' => true, 'fields' => [$image_mapping, array_replace($image_mapping, ['targetKey' => 'other_image'])]], true), 'policy');
$GLOBALS['structured_unsupported_features'] = ['thumbnail'];
structured_reject(fn() => Structured::normalizePolicy('post', ['enabled' => true, 'fields' => [$image_mapping]], true), 'policy');
expect(count(Structured::normalizePolicy('post', ['enabled' => false, 'fields' => [$image_mapping]], true)['fields']) === 1, 'Withdrawal remains possible after native source support disappears.');
unset($GLOBALS['structured_unsupported_features']);
$posts[501] = new WP_Post(501, 'attachment', 'inherit');
$GLOBALS['structured_values'][42]['_thumbnail_id'] = 501;
$GLOBALS['structured_values'][501]['_wp_attachment_image_alt'] = '<b>Actual portrait</b> &amp; clinic';
$GLOBALS['structured_image_urls'][501] = 'https://cdn.example.org/real-portrait.jpg';
$posts[42]->post_excerpt = '<p>Authored summary &amp; detail</p>';
$native = Structured::project(42, 'post', $native_selection);
expect((array) $native['fields'] === ['featured_image' => 'https://cdn.example.org/real-portrait.jpg', 'featured_image_alt' => 'Actual portrait & clinic', 'summary' => 'Authored summary & detail'], 'Native projection reads real featured media and strips authored text to plain values.');
$posts[501]->post_status = 'private';
expect((array) Structured::project(42, 'post', $native_selection)['fields'] === ['summary' => 'Authored summary & detail'], 'Private attachment is absent and withdraws image and alt.');
$posts[501]->post_status = 'inherit';
$posts[501]->post_parent = 502;
$posts[502] = new WP_Post(502, 'post', 'draft');
expect(!isset(Structured::project(42, 'post', $native_selection)['fields']->featured_image), 'Inherited attachment under unpublished parent cannot become public evidence.');
$posts[502]->post_status = 'publish';
$posts[502]->post_password = 'not-public';
expect(!isset(Structured::project(42, 'post', $native_selection)['fields']->featured_image), 'Password-protected attachment parent cannot become public evidence.');
$posts[501]->post_parent = 0;
unset($GLOBALS['structured_image_urls'][501]);
expect((array) Structured::project(42, 'post', $native_selection)['fields'] === ['summary' => 'Authored summary & detail'], 'Unavailable full image URL withdraws both image and alternative text.');
$GLOBALS['structured_image_urls'][501] = 'https://cdn.example.org/real-portrait.jpg';
unset($GLOBALS['structured_values'][42]['_thumbnail_id']);
$posts[42]->post_excerpt = '';
$missing_native = Structured::project(42, 'post', $native_selection);
expect((array) $missing_native['fields'] === [] && count((array) $missing_native['fieldSchema']) === 3, 'Missing featured image and cleared authored excerpt remove values without inventing body fallbacks.');
$GLOBALS['structured_values'][42]['_thumbnail_id'] = 501;
$GLOBALS['structured_image_urls'][501] = 'javascript:bad';
structured_reject(fn() => Structured::project(42, 'post', $native_selection), 'structured_content_value_invalid');
$GLOBALS['structured_image_urls'][501] = 'https://cdn.example.org/real-portrait.jpg';
$posts[42]->post_excerpt = str_repeat('x', 4097);
structured_reject(fn() => Structured::project(42, 'post', $native_selection), 'structured_content_value_invalid');
$posts[42]->post_excerpt = '';
$GLOBALS['structured_test_capability'] = ['status' => 'verified', 'version' => 1];
$native_policy = $policies->saveForPostType('post', array_replace($policy, ['structuredContent' => $native_selection]));
$before_queries = $wpdb->queryCount;
$capture->onStructuredMetadataChanged(1, 42, '_thumbnail_id', 501);
expect($wpdb->queryCount === $before_queries + 1, 'Selected thumbnail replacement uses normal capture.');
$GLOBALS['structured_reference_posts'] = [42];
$capture->onStructuredMetadataChanged(2, 501, '_wp_attachment_image_alt', 'changed');
expect($wpdb->queryCount === $before_queries + 2, 'Selected attachment alternative-text edits invalidate referencing source.');
$capture->onFeaturedAttachmentChanged(501);
expect($wpdb->queryCount === $before_queries + 3, 'Attachment deletion/file/visibility invalidation captures referencing content.');
$GLOBALS['structured_child_attachments'] = [501];
$capture->onAfterInsertPost(502, new WP_Post(502, 'post', 'draft'), true, new WP_Post(502, 'post', 'publish'));
expect($wpdb->queryCount >= $before_queries + 4, 'Inherited attachment parent visibility changes invalidate referencing public records.');
unset($GLOBALS['structured_child_attachments']);
$GLOBALS['structured_reference_posts'] = array_merge(range(1000, 1099), [42]);
$reference_query_count = count($GLOBALS['structured_reference_queries']);
$capture->onFeaturedAttachmentChanged(501);
expect(count($GLOBALS['structured_reference_queries']) === $reference_query_count + 2, 'Attachment invalidation uses bounded pages and reaches references after the first hundred.');
$GLOBALS['structured_reference_posts'] = [42];
$options['smartcloud_ai_kit_kb_sync_settings'] = ['publicReleaseGate' => 'static-publisher'];
$capture->onFeaturedAttachmentChanged(501);
$args = end($wpdb->preparedArguments);
expect($args[6] === 'blocked' && $args[10] === 1 && $args[12] === '', 'Native attachment invalidation cannot bypass unavailable Publisher approval.');
$options['smartcloud_ai_kit_kb_sync_settings'] = ['publicReleaseGate' => 'disabled'];
$GLOBALS['structured_test_capability'] = ['status' => 'legacy'];
expect($policies->saveForPostType('post', array_replace($native_policy, ['structuredContent' => ['enabled' => true, 'fields' => [$image_mapping]]]))['structuredContent']['enabled'], 'Native subset withdrawal is allowed without backend capability.');
$GLOBALS['structured_test_capability'] = ['status' => 'verified', 'version' => 1];
$policies->saveForPostType('post', $policy);
// Unregistered sources cannot silently remove a stored policy or prevent explicit revocation.
unset($GLOBALS['structured_registered']['post']['public_reference'], $GLOBALS['structured_registered']['']['public_reference']);
expect($policies->getForPostType('post')['structuredContent']['enabled'], 'Registration removal must not erase stored policy.');
structured_reject(fn() => $builder->build($lease), 'structured_content_policy_invalid');
$GLOBALS['structured_test_capability'] = ['status' => 'legacy'];
$disabled = $policies->saveForPostType('post', array_replace($policy, ['structuredContent' => ['enabled' => false, 'fields' => [$mapping]]]));
expect($policies->fingerprint($disabled) !== $before_fingerprint, 'Disable changes policy fingerprint, causing existing durable baseline reconcile.');
$disabled_projection = $builder->build($lease);
expect($disabled_projection['schemaVersion'] === 3 && $disabled_projection['document']['structuredContent']['enabled'] === false && (array) $disabled_projection['document']['structuredContent']['fields'] === [], 'Disable emits explicit v3 revocation while keeping the KB source.');
$before_removal_fingerprint = $policies->fingerprint($disabled);
$legacy_policy = $policies->saveForPostType('post', ['enabled' => true, 'reviewPolicy' => 'wordpress-publish-is-approval']);
expect($policies->fingerprint($legacy_policy) !== $before_removal_fingerprint, 'Entire-property removal changes durable baseline fingerprint so the newer v2 projection replaces prior structured state.');
expect($builder->build($lease)['schemaVersion'] === 2, 'Legacy policy without opt-in retains v2 behavior.');
echo "Structured-content registered-field policy, projection, revocation and gated capture tests passed.\n";
