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
$uuid_sequence = 0;

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
    $options[$name] = $value;
    return true;
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
    global $capability_mode, $registered_public_key, $requests;
    $requests[] = array('url' => $url, 'arguments' => $arguments);
    $path = (string) parse_url($url, PHP_URL_PATH);
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
                'capabilities' => array('knowledge.automation' => $capability_mode === 'v4' ? 4 : 5),
            ), JSON_THROW_ON_ERROR),
        );
    }

    if ($path === '/base/automation/kb/enroll') {
        transport_expect(!isset($arguments['headers']['X-WPSuite-Signature']), 'Enrollment must not pretend to be signed.');
        $registered_public_key = (string) $body['publicKey'];
        return array(
            'response' => array('code' => 201),
            'body' => json_encode(array(
                'keyId' => 'ak_test_current',
                'workspaceId' => 'workspace-17',
                'siteId' => 'site-42',
                'environment' => 'dev',
                'algorithm' => 'ES256',
                'allowedScopes' => array('knowledge:status', 'knowledge:key-rotate', 'knowledge:write', 'knowledge:metadata'),
                'producerPrefix' => 'documents/workspace-17/site-42/',
            ), JSON_THROW_ON_ERROR),
        );
    }

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
        is_string($signature) && openssl_verify($canonical, $signature, $registered_public_key, OPENSSL_ALGO_SHA256) === 1,
        'The backend must be able to verify the WordPress ES256 signature.'
    );

    if ($path === '/base/automation/kb/keys/rotate') {
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
            'workspaceId' => 'workspace-17',
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
$settings->save(array(
    'backendBaseUrl' => 'https://api.example.com/next-base',
    'keyStorageMode' => 'encrypted-option',
    'environment' => 'dev',
));
transport_expect(
    !isset($options['smartcloud_ai_kit_kb_sync_vocabulary_state']),
    'Changing the API Settings backend snapshot must force a vocabulary baseline.'
);
$settings->save(array(
    'backendBaseUrl' => 'https://api.example.com/base/',
    'keyStorageMode' => 'encrypted-option',
    'environment' => 'dev',
));
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
$capability_mode = 'v5';
transport_expect(KnowledgeSyncTransport::create()->isContentDeliveryAvailable(), 'Capability v5 must enable authored-metadata delivery for enrolled sites.');
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
