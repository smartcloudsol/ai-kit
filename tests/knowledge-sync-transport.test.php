<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/wordpress-root/');
define('AUTH_KEY', 'transport-test-auth-key');
define('SECURE_AUTH_KEY', 'transport-test-secure-auth-key');

$options = array(
    'smartcloud-wpsuite/site-settings' => array(
        'accountId' => 'workspace-17',
        'siteId' => 'site-42',
    ),
);
$requests = array();
$registered_public_key = '';
$registered_public_keys = array();
$enrollment_failure_mode = '';
$enrollment_hook = null;
$reject_signed = false;
$verify_identity_mismatch = false;
$uuid_sequence = 0;

$transients = [];
function get_transient(string $key): mixed { return $GLOBALS['transients'][$key] ?? false; }
function set_transient(string $key, mixed $value, int $ttl): bool {
    transport_expect($ttl === 60, 'Capability cache must expire after 60 seconds.');
    $GLOBALS['transients'][$key] = $value;
    return true;
}

function transport_expect(bool $condition, string $message): void
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
    transport_expect($autoload === false, 'Sensitive transport options must not autoload.');
    if ($name === 'smartcloud_ai_kit_kb_sync_registration' && !empty($GLOBALS['fail_registration_commit'])) {
        $GLOBALS['fail_registration_commit'] = false;
        return false;
    }
    if ($name === 'smartcloud_ai_kit_kb_sync_settings' && !empty($GLOBALS['fail_settings_commit']) && ($value['backendBaseUrl'] ?? '') === 'https://api.example.com/next-base') {
        $GLOBALS['fail_settings_commit'] = false;
        return false;
    }
    $options[$name] = $value;
    return true;
}

function add_option(string $name, mixed $value, string $deprecated = '', bool $autoload = false): bool
{
    if (array_key_exists($name, $GLOBALS['options'])) return false;
    return update_option($name, $value, $autoload);
}

function delete_option(string $name): bool
{
    global $options;
    unset($options[$name]);
    return true;
}

function is_multisite(): bool
{
    return false;
}

function get_current_blog_id(): int
{
    return 1;
}

function absint(mixed $value): int
{
    return abs((int) $value);
}

function sanitize_key(string $value): string
{
    return preg_replace('/[^a-z0-9_-]/', '', strtolower($value)) ?? '';
}

function untrailingslashit(string $value): string
{
    return rtrim($value, '/\\');
}

function esc_url_raw(string $value): string
{
    return filter_var($value, FILTER_SANITIZE_URL) ?: '';
}

function wp_parse_url(string $value): array|false
{
    return parse_url($value);
}

function do_action(string $hook, mixed ...$arguments): void
{
    unset($hook, $arguments);
}

function wp_json_encode(mixed $value, int $flags = 0): string|false
{
    return json_encode($value, $flags);
}

function wp_generate_uuid4(): string
{
    global $uuid_sequence;
    $uuid_sequence++;
    return '00000000-0000-4000-8000-' . str_pad((string) $uuid_sequence, 12, '0', STR_PAD_LEFT);
}

function is_wp_error(mixed $value): bool
{
    unset($value);
    return false;
}

function wp_remote_retrieve_response_code(array $response): int
{
    return $response['response']['code'];
}

function wp_remote_retrieve_body(array $response): string
{
    return $response['body'];
}

/** @param array<string, mixed> $arguments
 *  @return array{response:array{code:int},body:string}
 */
function wp_remote_request(string $url, array $arguments): array
{
    global $capability_mode, $registered_public_key, $registered_public_keys, $requests, $enrollment_failure_mode, $enrollment_hook, $reject_signed, $verify_identity_mismatch;
    $requests[] = array('url' => $url, 'arguments' => $arguments);
    $actual_path = (string) parse_url($url, PHP_URL_PATH);
    $backend_prefix = str_starts_with($actual_path, '/next-base/') ? '/next-base' : '/base';
    $path = preg_replace('~^/next-base/~', '/base/', $actual_path);
    $query = (string) parse_url($url, PHP_URL_QUERY);
    $body = json_decode((string) ($arguments['body'] ?? ''), true);
    $body = is_array($body) ? $body : array();

    if ($path === '/base/meta/capabilities') {
        transport_expect($arguments['method'] === 'GET', 'Capability discovery must use GET.');
        if ($capability_mode === 'legacy') {
            return array(
                'response' => array('code' => 404),
                'body' => '{"message":"Not Found"}',
            );
        }
        return array(
            'response' => array('code' => 200),
            'body' => json_encode(array(
                'schemaVersion' => 1,
                'product' => 'smartcloud-ai-kit-backend',
                'release' => '1.0.75',
                'apiSchemaVersion' => 7,
                'capabilities' => array(
                    ...($capability_mode === 'paths' ? ['knowledge.taxonomy-paths' => 1] : ($capability_mode === 'invalid-paths' ? ['knowledge.taxonomy-paths' => '1'] : [])),
                    ...(in_array($capability_mode, ['structured', 'structured-document', 'invalid-structured-document', 'structured-text-formats', 'invalid-structured-text-formats'], true) ? ['knowledge.structured-content' => 1] : ($capability_mode === 'invalid-structured' ? ['knowledge.structured-content' => '1'] : [])),
                    ...($capability_mode === 'structured-document' ? ['knowledge.structured-content.document-v2' => 1] : ($capability_mode === 'invalid-structured-document' ? ['knowledge.structured-content.document-v2' => '1'] : [])),
                    ...($capability_mode === 'structured-text-formats' ? ['knowledge.structured-content.text-formats' => 1] : ($capability_mode === 'invalid-structured-text-formats' ? ['knowledge.structured-content.text-formats' => '1'] : [])),
                    'knowledge.automation' => $capability_mode === 'v4'
                        ? 4
                        : ($capability_mode === 'v5' ? 5 : 6),
                ),
            ), JSON_THROW_ON_ERROR),
        );
    }

    if ($path === '/base/automation/kb/enroll') {
        transport_expect(!isset($arguments['headers']['X-WPSuite-Signature']), 'Enrollment must not pretend to be signed.');
        if ($enrollment_failure_mode === 'reject') return array('response' => array('code' => 401), 'body' => '{"message":"Unauthorized"}');
        $registered_public_keys[$backend_prefix] = (string) $body['publicKey'];
        $registered_public_key = (string) $body['publicKey'];
        if (is_callable($enrollment_hook)) $enrollment_hook();
        return array(
            'response' => array('code' => 201),
            'body' => json_encode(array(
                'keyId' => 'ak_test_current',
                'workspaceId' => $enrollment_failure_mode === 'wrong-identity' ? 'foreign-workspace' : $body['workspaceId'],
                'siteId' => $body['siteId'],
                'environment' => $body['environment'],
                'algorithm' => 'ES256',
                'allowedScopes' => array('knowledge:status', 'knowledge:key-rotate', 'knowledge:write', 'knowledge:metadata'),
                'producerPrefix' => 'documents/workspace-17/site-42/',
            ), JSON_THROW_ON_ERROR),
        );
    }

    if ($reject_signed) return array('response' => array('code' => 401), 'body' => '{"message":"Unauthorized"}');
    $headers = $arguments['headers'];
    $content = (string) $arguments['body'];
    transport_expect(hash('sha256', $content) === $headers['X-WPSuite-Content-SHA256'], 'The signed content hash must match the exact HTTP body.');
    $canonical = implode("\n", array(
        'WPSUITE-AIKIT-V1',
        $headers['X-WPSuite-Key-Id'],
        $arguments['method'],
        str_replace('/base', '', $path),
        $query,
        $headers['X-WPSuite-Content-SHA256'],
        $headers['X-WPSuite-Timestamp'],
        $headers['X-WPSuite-Nonce'],
        $headers['Idempotency-Key'],
    ));
    $signature = base64_decode(strtr($headers['X-WPSuite-Signature'], '-_', '+/'), true);
    transport_expect(
        is_string($signature) && openssl_verify($canonical, $signature, $registered_public_keys[$backend_prefix] ?? $registered_public_key, OPENSSL_ALGO_SHA256) === 1,
        'The backend must be able to verify the WordPress ES256 signature.'
    );

    if ($path === '/base/automation/kb/keys/rotate') {
        $registered_public_keys[$backend_prefix] = (string) $body['publicKey'];
        $registered_public_key = (string) $body['publicKey'];
        return array(
            'response' => array('code' => 200),
            'body' => json_encode(array(
                'keyId' => 'ak_test_rotated',
                'replacesKeyId' => 'ak_test_current',
                'algorithm' => 'ES256',
                'oldKeyValidUntil' => '2026-09-02T12:00:00Z',
            ), JSON_THROW_ON_ERROR),
        );
    }

    if ($path === '/base/automation/kb/keys/revoke') {
        return array(
            'response' => array('code' => 200),
            'body' => json_encode(array(
                'keyId' => $headers['X-WPSuite-Key-Id'],
                'status' => 'revoked',
            ), JSON_THROW_ON_ERROR),
        );
    }

    if ($path === '/base/automation/kb/metadata-inputs/wordpress') {
        transport_expect($arguments['method'] === 'PUT', 'Vocabulary reconciliation must use PUT.');
        transport_expect($body['sourceVersion'] === '1', 'Vocabulary source version must be preserved.');
        return array(
            'response' => array('code' => 200),
            'body' => '{"status":"accepted","changed":true}',
        );
    }

    return array(
        'response' => array('code' => 200),
        'body' => json_encode(array(
            'keyId' => $headers['X-WPSuite-Key-Id'],
            'workspaceId' => $verify_identity_mismatch ? 'foreign-workspace' : 'workspace-17',
            'siteId' => 'site-42',
            'environment' => 'dev',
            'status' => 'active',
        ), JSON_THROW_ON_ERROR),
    );
}

require_once __DIR__ . '/../admin/php/kb/knowledge-sync-runtime.php';
require_once __DIR__ . '/../admin/php/kb/knowledge-sync-transport.php';

use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncFilePrivateKeyStore;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncSettingsStore;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncSigner;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncTransport;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncTransportException;

$settings = new KnowledgeSyncSettingsStore();
$transients = [];
$capability_mode = 'verified';
transport_expect($settings->get()['keyStorageMode'] === 'disabled', 'Signed transport must default to disabled.');
$settings->save(array(
    'backendBaseUrl' => 'https://api.example.com/base/',
    'keyStorageMode' => 'encrypted-option',
    'environment' => 'dev',
));

$signer = new KnowledgeSyncSigner();
$canonical = $signer->canonicalRequest(
    'ak_test',
    'post',
    '/automation/kb/status',
    array('z' => 'last', 'a' => array('two words', '!')),
    str_repeat('a', 64),
    '1788343200',
    'nonce-1',
    'operation-1'
);
transport_expect(
    $canonical === "WPSUITE-AIKIT-V1\nak_test\nPOST\n/automation/kb/status\na=%21&a=two%20words&z=last\n" . str_repeat('a', 64) . "\n1788343200\nnonce-1\noperation-1",
    'PHP and Node must share the exact canonical request grammar.'
);

$transport = KnowledgeSyncTransport::create();
$compatibility = $transport->backendCompatibility();
transport_expect($compatibility['status'] === 'verified', 'Backend capability discovery must be reported.');
transport_expect($compatibility['release'] === '1.0.75', 'Backend release must be exposed to WordPress.');
$options['smartcloud_ai_kit_kb_sync_vocabulary_state'] = array(
    'fingerprint' => str_repeat('a', 64),
    'sourceVersion' => 7,
);
$registration = $transport->enroll('single-use-pairing-code');
transport_expect($registration['keyId'] === 'ak_test_current', 'Enrollment must persist the backend key ID.');
transport_expect(
    !isset($options['smartcloud_ai_kit_kb_sync_vocabulary_state']),
    'Enrollment must force a vocabulary baseline against the newly paired backend.'
);
$options['smartcloud_ai_kit_kb_sync_vocabulary_state'] = array(
    'fingerprint' => str_repeat('b', 64),
    'sourceVersion' => 8,
);
$before_retarget_settings = $settings->get();
$retarget_rejected = false;
try {
    $settings->save(array('backendBaseUrl' => 'https://api.example.com/next-base', 'keyStorageMode' => 'encrypted-option', 'environment' => 'dev'));
} catch (InvalidArgumentException $error) {
    $retarget_rejected = true;
}
transport_expect($retarget_rejected && $settings->get() === $before_retarget_settings, 'An enrolled connection cannot be silently retargeted by mirroring API Settings.');
transport_expect(isset($options['smartcloud_ai_kit_kb_sync_vocabulary_state']), 'Rejected retarget must also preserve the existing vocabulary baseline.');
$serialized_keys = serialize($options['smartcloud_ai_kit_kb_sync_private_keys']);
transport_expect(!str_contains($serialized_keys, 'PRIVATE KEY'), 'The database fallback must never store plaintext private key material.');
transport_expect($transport->verifyStatus()['status'] === 'active', 'A signed status request must complete.');

$rotated = $transport->rotate(120);
transport_expect($rotated['keyId'] === 'ak_test_rotated', 'Rotation must promote the new site key only after backend acceptance.');
transport_expect($transport->verifyStatus()['keyId'] === 'ak_test_rotated', 'Subsequent requests must use the promoted key.');
$vocabulary = $transport->dispatchVocabulary(null, array(
    'schemaVersion' => 2,
    'sourceVersion' => '1',
    'blogId' => '1',
    'enabled' => true,
    'namespaces' => array('category' => array(
        array('slug' => 'company', 'label' => 'Company'),
        array('slug' => 'about-wp-suite', 'label' => 'About WP Suite', 'parentSlug' => 'company'),
    )),
));
transport_expect($vocabulary['status'] === 'accepted' && $vocabulary['changed'], 'Signed WordPress vocabulary reconciliation must complete.');
$before_guard_requests = count($requests);
$transients = [];
$capability_mode = 'v4';
$v4_transport = KnowledgeSyncTransport::create();
transport_expect(!$v4_transport->isContentDeliveryAvailable(), 'Capability v4 must not silently drop authored document metadata.');
$v4_dispatch_rejected = false;
try {
    $v4_transport->dispatchBatch(null, []);
} catch (KnowledgeSyncTransportException $error) {
    $v4_dispatch_rejected = $error->errorCode === 'backend_capability_unavailable';
}
transport_expect($v4_dispatch_rejected, 'Direct batch dispatch must also reject capability v4.');
$transients = [];
$capability_mode = 'v5';
transport_expect(!KnowledgeSyncTransport::create()->isContentDeliveryAvailable(), 'Capability v5 must not accept locale-aware content projections.');
$v5_dispatch_rejected = false;
try {
    KnowledgeSyncTransport::create()->dispatchBatch(null, []);
} catch (KnowledgeSyncTransportException $error) {
    $v5_dispatch_rejected = $error->errorCode === 'backend_capability_unavailable';
}
transport_expect($v5_dispatch_rejected, 'Direct batch dispatch must reject capability v5 for locale-aware projections.');
$transients = [];
$capability_mode = 'verified';
transport_expect(KnowledgeSyncTransport::create()->isContentDeliveryAvailable(), 'Capability v6 must enable locale-aware content delivery for enrolled sites.');
$guard_requests = count($requests) - $before_guard_requests;
$revoked = $transport->revoke();
transport_expect($revoked['status'] === 'revoked', 'The current site key must be revocable over signed transport.');
transport_expect(!isset($options['smartcloud_ai_kit_kb_sync_registration']), 'Revocation must remove the local registration.');
transport_expect(!isset($options['smartcloud_ai_kit_kb_sync_private_keys']), 'Revocation must remove local private-key material.');

$unsafe_directory_rejected = false;
if (!is_dir(ABSPATH)) {
    mkdir(ABSPATH, 0700, true);
}
define('SMARTCLOUD_AI_KIT_KB_SYNC_KEY_DIRECTORY', ABSPATH);
try {
    new KnowledgeSyncFilePrivateKeyStore(1);
} catch (KnowledgeSyncTransportException $error) {
    $unsafe_directory_rejected = $error->errorCode === 'unsafe_key_directory';
}
transport_expect($unsafe_directory_rejected, 'File key storage must reject the WordPress webroot.');

transport_expect(count($requests) - $guard_requests === 7, 'Capability discovery, enrollment, status, rotation, promoted-key status, vocabulary reconciliation, and revocation must each make one request.');

$transients = [];
$capability_mode = 'legacy';
unset($options['smartcloud_ai_kit_kb_sync_registration']);
$legacy_rejected = false;
try {
    KnowledgeSyncTransport::create()->enroll('single-use-pairing-code');
} catch (KnowledgeSyncTransportException $error) {
    $legacy_rejected = $error->errorCode === 'backend_capability_unavailable';
}
transport_expect($legacy_rejected, 'Knowledge automation must stay disabled until the backend advertises its capability.');

echo "Knowledge-sync signed transport tests passed.\n";

$transients = [];
$capability_mode = 'paths';
$before_capability_requests = count($requests);
transport_expect(KnowledgeSyncTransport::create()->supportsTaxonomyPaths(), 'Verified independent capability must enable paths.');
transport_expect(KnowledgeSyncTransport::create()->supportsTaxonomyPaths(), 'A second transport must share capability cache.');
transport_expect(count($requests) === $before_capability_requests + 1, 'Per-document transports must not cause per-document network discovery.');
$transients = [];
$capability_mode = 'invalid-paths';
transport_expect(!KnowledgeSyncTransport::create()->supportsTaxonomyPaths(), 'String capability version must fail closed.');
$transients = [];
$capability_mode = 'verified';
transport_expect(!KnowledgeSyncTransport::create()->supportsTaxonomyPaths(), 'Automation v6 alone must not imply path support.');
$transients = [];
$capability_mode = 'legacy';
transport_expect(!KnowledgeSyncTransport::create()->supportsTaxonomyPaths(), 'Unavailable manifest must preserve legacy projections.');
echo "Category path capability tests passed.\n";

$transients = [];
$capability_mode = 'structured';
$before_capability_requests = count($requests);
transport_expect($transport->supportsStructuredContent(), 'Verified structured-content v1 must enable own-field support.');
transport_expect(KnowledgeSyncTransport::create()->supportsStructuredContent(), 'Structured-content capability must reuse shared discovery cache.');
transport_expect(count($requests) === $before_capability_requests + 1, 'Structured field support uses one cached manifest lookup.');
foreach (['invalid-structured', 'verified', 'legacy'] as $mode) {
    $transients = [];
    $capability_mode = $mode;
    transport_expect(!$transport->supportsStructuredContent(), 'Unknown, missing or nonnumeric structured capability must fail closed.');
}
// The capability check precedes enrollment/key access: a legacy backend must
// receive neither enabled data nor a misleading downgraded revocation.
$transients = [];
$capability_mode = 'verified';
foreach ([true, false] as $enabled) {
    $blocked = false;
    try {
        $transport->dispatchBatch(null, [42 => ['schemaVersion' => 3, 'document' => ['structuredContent' => ['schemaVersion' => 1, 'enabled' => $enabled, 'fields' => (object) [], 'fieldSchema' => (object) []]]]]);
    } catch (KnowledgeSyncTransportException $error) {
        $blocked = $error->errorCode === 'backend_capability_unavailable';
    }
    transport_expect($blocked, 'Unsupported backend cannot receive schema3 enabled or disabled projections.');
}
echo "Structured-content backend capability and delivery guards passed.\n";

foreach (['structured', 'invalid-structured-document', 'verified', 'legacy'] as $mode) {
    $transients = [];
    $capability_mode = $mode;
    transport_expect(!$transport->supportsStructuredContentDocument(), 'Nested document approval requires both verified integer capabilities.');
}
$transients = [];
$capability_mode = 'structured-document';
transport_expect($transport->supportsStructuredContentDocument(), 'Nested document capability is separately negotiated.');
$transients = [];
$capability_mode = 'structured';
$before_nested_requests = count($requests);
$nested_blocked = false;
try {
    $transport->dispatchBatch(null, [42 => ['schemaVersion' => 3, 'document' => ['structuredContent' => ['schemaVersion' => 2, 'enabled' => true, 'fields' => (object) [], 'fieldSchema' => (object) []]]]]);
} catch (KnowledgeSyncTransportException $error) {
    $nested_blocked = $error->errorCode === 'backend_capability_unavailable';
}
transport_expect($nested_blocked, 'Scalar capability alone must not dispatch a nested document or silently downgrade it.');
transport_expect(count($requests) === $before_nested_requests + 1, 'Nested capability rejection precedes signing or content dispatch.');
echo "Nested structured-document negotiation tests passed.\n";

foreach (['structured', 'structured-document', 'invalid-structured-text-formats', 'verified', 'legacy'] as $mode) {
    $transients = [];
    $capability_mode = $mode;
    transport_expect(!$transport->supportsStructuredContentTextFormats(), 'Text formats require a separately verified integer capability.');
}
$transients = [];
$capability_mode = 'structured-text-formats';
transport_expect($transport->supportsStructuredContentTextFormats(), 'Text-format capability is independently negotiated.');
$transients = [];
$capability_mode = 'structured-document';
$before_format_requests = count($requests);
$format_blocked = false;
try {
    $transport->dispatchBatch(null, [42 => ['schemaVersion' => 3, 'document' => ['structuredContent' => ['schemaVersion' => 3, 'enabled' => true, 'fields' => (object) ['detail' => '<p>Source</p>'], 'fieldSchema' => (object) ['detail' => ['type' => 'string', 'description' => 'Detail', 'contentFormat' => 'html']]]]]]);
} catch (KnowledgeSyncTransportException $error) {
    $format_blocked = $error->errorCode === 'backend_capability_unavailable';
}
transport_expect($format_blocked && count($requests) === $before_format_requests + 1, 'Formatted dispatch refuses old backend before signing, credentials or content transmission.');
echo "Structured text-format capability and dispatch guards passed.\n";

// Real transport/keystore regression: every credential is synthetic and only local fake HTTP is used.
$capability_mode = 'verified'; $transients = array();
$transport = KnowledgeSyncTransport::create();
$old_registration = $transport->enroll('synthetic-original-pairing');
$old_settings = $options['smartcloud_ai_kit_kb_sync_settings'];
$old_private = $options['smartcloud_ai_kit_kb_sync_private_keys'];
$old_hub = $options['smartcloud-wpsuite/site-settings'];
$replacement = array('expectedKeyId' => $old_registration['keyId'], 'backendBaseUrl' => 'https://api.example.com/next-base', 'workspaceId' => 'workspace-17', 'siteId' => 'site-42', 'environment' => 'dev');
function enrollment_rejects(callable $operation, string $expected): void {
    try { $operation(); } catch (KnowledgeSyncTransportException $error) { transport_expect($error->errorCode === $expected, 'Expected guarded enrollment error: ' . $expected); return; }
    throw new RuntimeException('Expected enrollment failure: ' . $expected);
}
function old_enrollment_unchanged(string $label): void {
    global $options, $old_registration, $old_settings, $old_private;
    transport_expect($options['smartcloud_ai_kit_kb_sync_registration'] === $old_registration, $label . ': original registration retained.');
    transport_expect($options['smartcloud_ai_kit_kb_sync_settings'] === $old_settings, $label . ': original settings retained.');
    transport_expect($options['smartcloud_ai_kit_kb_sync_private_keys'] === $old_private, $label . ': original encrypted key retained byte-for-byte.');
}
$before = count($requests);
$options['smartcloud_ai_kit_kb_sync_settings']['backendBaseUrl'] = 'https://api.example.com/next-base';
// Deliberately corrupt stored ciphertext: a binding error must win BEFORE key decryption.
$options['smartcloud_ai_kit_kb_sync_private_keys'] = array('current' => array('ciphertext' => 'bad'));
enrollment_rejects(fn() => $transport->verifyStatus(), 'enrollment_backend_mismatch');
transport_expect(count(array_filter(array_slice($requests, $before), fn($r) => str_contains($r['url'], '/automation/'))) === 0, 'Retarget guard must prevent all signed requests.');
$options['smartcloud_ai_kit_kb_sync_settings'] = $old_settings; $options['smartcloud_ai_kit_kb_sync_private_keys'] = $old_private;
$options['smartcloud-wpsuite/site-settings'] = array('workspaceId' => 'other-workspace', 'siteId' => 'other-site');
enrollment_rejects(fn() => $transport->verifyStatus(), 'enrollment_identity_mismatch');
$options['smartcloud-wpsuite/site-settings'] = $old_hub;
$legacy_registration = $old_registration; unset($legacy_registration['backendBaseUrl'], $legacy_registration['keyStorageMode']);
$options['smartcloud_ai_kit_kb_sync_registration'] = $legacy_registration;
enrollment_rejects(fn() => $transport->verifyStatus(), 'enrollment_backend_unverified');
$reject_signed = true;
enrollment_rejects(fn() => $transport->verifyStatus(null, 25, true), 'backend_authentication_failed');
transport_expect($options['smartcloud_ai_kit_kb_sync_registration'] === $legacy_registration, 'Failed explicit verify must not adopt an old unknown backend.');
$reject_signed = false;
$verify_identity_mismatch = true;
enrollment_rejects(fn() => $transport->verifyStatus(null, 25, true), 'enrollment_identity_mismatch');
transport_expect($options['smartcloud_ai_kit_kb_sync_registration'] === $legacy_registration, 'Foreign status receipt must never adopt an old backend binding.');
$verify_identity_mismatch = false;
transport_expect($transport->verifyStatus(null, 25, true)['status'] === 'active', 'Explicit signed verify can prove an old same-site enrollment.');
transport_expect($options['smartcloud_ai_kit_kb_sync_registration'] == $old_registration, 'Only successful explicit verification binds the existing backend tuple.');
$old_registration = $options['smartcloud_ai_kit_kb_sync_registration'];
// A stale local binding wins even with a cold/unavailable capability manifest.
// No HTTP request, private-key read, pending key or capability cache write is allowed.
$saved_transients = $transients; $saved_capability_mode = $capability_mode;
foreach (array('identity', 'backend') as $mismatch) {
    $options['smartcloud-wpsuite/site-settings'] = $mismatch === 'identity'
        ? array('workspaceId' => 'different-workspace', 'siteId' => 'different-site') : $old_hub;
    $options['smartcloud_ai_kit_kb_sync_settings'] = $old_settings;
    if ($mismatch === 'backend') $options['smartcloud_ai_kit_kb_sync_settings']['backendBaseUrl'] = 'https://api.example.com/next-base';
    $options['smartcloud_ai_kit_kb_sync_private_keys'] = array('current' => array('ciphertext' => 'deliberately-unreadable'));
    foreach (array('verify', 'rotate', 'revoke') as $operation) {
        $transients = array(); $capability_mode = 'legacy';
        $before_requests = count($requests); $before_options = $options;
        enrollment_rejects(
            fn() => $operation === 'verify' ? $transport->verifyStatus(null, 25, true) : $transport->{$operation}(),
            $mismatch === 'identity' ? 'enrollment_identity_mismatch' : 'enrollment_backend_mismatch'
        );
        transport_expect(count($requests) === $before_requests, 'Cold-cache ' . $operation . ' rejects stale ' . $mismatch . ' before ALL HTTP.');
        transport_expect($transients === array(), 'Stale binding does not populate a capability cache.');
        transport_expect($options === $before_options, 'Cold-cache guard preserves all options and releases its temporary lock.');
    }
}
$options['smartcloud-wpsuite/site-settings'] = $old_hub;
$options['smartcloud_ai_kit_kb_sync_settings'] = $old_settings;
$options['smartcloud_ai_kit_kb_sync_private_keys'] = $old_private;
$transients = $saved_transients; $capability_mode = $saved_capability_mode;
$reject_signed = true;
try {
    $transport->revoke();
    throw new RuntimeException('Expected a rejected signed revocation.');
} catch (KnowledgeSyncTransportException $error) {
    transport_expect($error->errorCode === 'backend_authentication_failed', 'Rejected signed revoke has a specific authentication diagnostic.');
    transport_expect(str_contains($error->getMessage(), 'explicitly pair the selected backend'), 'Authentication errors explain the supported explicit recovery action.');
}
old_enrollment_unchanged('rejected signed revocation');
$reject_signed = false;
$before = count($requests);
enrollment_rejects(fn() => $transport->enroll('synthetic-new-pairing', array_merge($replacement, array('expectedKeyId' => 'stale-id'))), 'already_enrolled');
transport_expect(count($requests) === $before, 'Stale replacement CAS fails before HTTP.'); old_enrollment_unchanged('stale CAS');
$enrollment_failure_mode = 'reject';
enrollment_rejects(fn() => $transport->enroll('synthetic-new-pairing', $replacement), 'backend_authentication_failed'); old_enrollment_unchanged('remote rejection');
$enrollment_failure_mode = 'wrong-identity';
enrollment_rejects(fn() => $transport->enroll('synthetic-new-pairing', $replacement), 'enrollment_identity_mismatch'); old_enrollment_unchanged('foreign receipt');
$enrollment_failure_mode = '';
$enrollment_hook = function () use (&$options): void { $options['smartcloud-wpsuite/site-settings'] = array('workspaceId' => 'operator-changed', 'siteId' => 'operator-site'); };
enrollment_rejects(fn() => $transport->enroll('synthetic-new-pairing', $replacement), 'enrollment_changed'); old_enrollment_unchanged('operator changed selection');
transport_expect($options['smartcloud-wpsuite/site-settings']['workspaceId'] === 'operator-changed', 'A concurrent operator selection must never be restored over.');
$enrollment_hook = null; $options['smartcloud-wpsuite/site-settings'] = $old_hub;
$fail_registration_commit = true;
enrollment_rejects(fn() => $transport->enroll('synthetic-new-pairing', $replacement), 'enrollment_commit_failed'); old_enrollment_unchanged('local commit failure');
$fail_settings_commit = true;
enrollment_rejects(fn() => $transport->enroll('synthetic-new-pairing', $replacement), 'enrollment_commit_failed'); old_enrollment_unchanged('local settings commit failure');
$options['smartcloud_ai_kit_kb_sync_runner_lock'] = array('token' => 'synthetic-held-lock', 'expires' => time() + 300);
enrollment_rejects(fn() => $transport->enroll('synthetic-new-pairing', $replacement), 'enrollment_busy'); old_enrollment_unchanged('runner busy');
unset($options['smartcloud_ai_kit_kb_sync_runner_lock']);
$new_registration = $transport->enroll('synthetic-new-pairing', $replacement);
transport_expect($new_registration['backendBaseUrl'] === $replacement['backendBaseUrl'], 'Accepted replacement publishes the selected backend binding.');
transport_expect($options['smartcloud_ai_kit_kb_sync_settings']['backendBaseUrl'] === $replacement['backendBaseUrl'], 'Backend settings advance only after enrollment acceptance.');
transport_expect($options['smartcloud_ai_kit_kb_sync_private_keys']['current'] !== $old_private['current'] && !isset($options['smartcloud_ai_kit_kb_sync_private_keys']['pending']), 'Only successful replacement promotes the pending encrypted key.');
transport_expect($transport->verifyStatus()['status'] === 'active', 'The accepted new binding and promoted key must sign successfully.');
echo "Enrollment binding/re-pair: legacy adoption, retarget/identity/CAS guards, remote/local failure preservation, concurrency and successful replacement passed.\n";
