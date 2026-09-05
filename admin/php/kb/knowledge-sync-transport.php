<?php
/**
 * Cognito-independent site enrollment and signed knowledge-sync transport.
 */

namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

if (!defined('ABSPATH')) {
    exit;
}

final class KnowledgeSyncTransportException extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message)
    {
        parent::__construct($message);
    }
}

interface KnowledgeSyncPrivateKeyStore
{
    public function readCurrent(): ?string;

    public function readPending(): ?string;

    public function writePending(string $private_key): void;

    public function promotePending(): void;

    public function discardPending(): void;

    public function deleteAll(): void;
}

final class KnowledgeSyncFilePrivateKeyStore implements KnowledgeSyncPrivateKeyStore
{
    private string $current_path;
    private string $pending_path;

    public function __construct(int $blog_id)
    {
        if (!defined('SMARTCLOUD_AI_KIT_KB_SYNC_KEY_DIRECTORY')) {
            throw new KnowledgeSyncTransportException(
                'key_directory_not_configured',
                'Define SMARTCLOUD_AI_KIT_KB_SYNC_KEY_DIRECTORY before using file key storage.'
            );
        }
        $configured = constant('SMARTCLOUD_AI_KIT_KB_SYNC_KEY_DIRECTORY');
        if (!is_string($configured) || trim($configured) === '') {
            throw new KnowledgeSyncTransportException('invalid_key_directory', 'The configured key directory is invalid.');
        }
        $directory = realpath($configured);
        $webroot = realpath(ABSPATH);
        if ($directory === false || !is_dir($directory) || !is_writable($directory)) {
            throw new KnowledgeSyncTransportException('invalid_key_directory', 'The key directory must already exist and be writable.');
        }
        if (
            $webroot !== false &&
            ($directory === $webroot || str_starts_with($directory . DIRECTORY_SEPARATOR, $webroot . DIRECTORY_SEPARATOR))
        ) {
            throw new KnowledgeSyncTransportException('unsafe_key_directory', 'The private-key directory must be outside the WordPress webroot.');
        }
        $base = $directory . DIRECTORY_SEPARATOR . 'knowledge-sync-blog-' . $blog_id;
        $this->current_path = $base . '.pem';
        $this->pending_path = $base . '.pending.pem';
    }

    public function readCurrent(): ?string
    {
        return $this->read($this->current_path);
    }

    public function readPending(): ?string
    {
        return $this->read($this->pending_path);
    }

    public function writePending(string $private_key): void
    {
        $temporary = $this->pending_path . '.' . bin2hex(random_bytes(8)) . '.tmp';
        $written = file_put_contents($temporary, $private_key, LOCK_EX);
        if ($written !== strlen($private_key) || !chmod($temporary, 0600) || !rename($temporary, $this->pending_path)) {
            if (is_file($temporary)) {
                unlink($temporary);
            }
            throw new KnowledgeSyncTransportException('key_write_failed', 'The pending private key could not be stored.');
        }
    }

    public function promotePending(): void
    {
        if (!is_file($this->pending_path)) {
            throw new KnowledgeSyncTransportException('key_promotion_failed', 'The enrolled private key could not be promoted.');
        }
        $backup = $this->current_path . '.' . bin2hex(random_bytes(8)) . '.backup';
        $has_current = is_file($this->current_path);
        if ($has_current && !rename($this->current_path, $backup)) {
            throw new KnowledgeSyncTransportException('key_promotion_failed', 'The current private key could not be preserved for rotation.');
        }
        if (!rename($this->pending_path, $this->current_path)) {
            if ($has_current && is_file($backup)) {
                rename($backup, $this->current_path);
            }
            throw new KnowledgeSyncTransportException('key_promotion_failed', 'The enrolled private key could not be promoted.');
        }
        if ($has_current && is_file($backup)) {
            unlink($backup);
        }
        chmod($this->current_path, 0600);
    }

    public function discardPending(): void
    {
        if (is_file($this->pending_path)) {
            unlink($this->pending_path);
        }
    }

    public function deleteAll(): void
    {
        foreach (array($this->current_path, $this->pending_path) as $path) {
            if (is_file($path) && !unlink($path)) {
                throw new KnowledgeSyncTransportException('key_delete_failed', 'The local private key could not be removed.');
            }
        }
    }

    private function read(string $path): ?string
    {
        if (!is_file($path)) {
            return null;
        }
        $value = file_get_contents($path);
        if (!is_string($value) || $value === '') {
            throw new KnowledgeSyncTransportException('key_read_failed', 'The private key could not be read.');
        }
        return $value;
    }
}

final class KnowledgeSyncEncryptedOptionPrivateKeyStore implements KnowledgeSyncPrivateKeyStore
{
    private const OPTION_NAME = 'smartcloud_ai_kit_kb_sync_private_keys';

    public function __construct(private readonly int $blog_id)
    {
        if (!extension_loaded('openssl') || !in_array('aes-256-gcm', openssl_get_cipher_methods(), true)) {
            throw new KnowledgeSyncTransportException('encryption_unavailable', 'AES-256-GCM is unavailable on this host.');
        }
        if (!defined('AUTH_KEY') || !defined('SECURE_AUTH_KEY')) {
            throw new KnowledgeSyncTransportException('encryption_key_unavailable', 'WordPress authentication salts are required.');
        }
    }

    public function readCurrent(): ?string
    {
        return $this->decryptSlot('current');
    }

    public function readPending(): ?string
    {
        return $this->decryptSlot('pending');
    }

    public function writePending(string $private_key): void
    {
        $stored = $this->stored();
        $stored['pending'] = $this->encrypt($private_key);
        update_option(self::OPTION_NAME, $stored, false);
    }

    public function promotePending(): void
    {
        $stored = $this->stored();
        if (!isset($stored['pending']) || !is_array($stored['pending'])) {
            throw new KnowledgeSyncTransportException('key_promotion_failed', 'No pending private key is available.');
        }
        $stored['current'] = $stored['pending'];
        unset($stored['pending']);
        update_option(self::OPTION_NAME, $stored, false);
    }

    public function discardPending(): void
    {
        $stored = $this->stored();
        unset($stored['pending']);
        update_option(self::OPTION_NAME, $stored, false);
    }

    public function deleteAll(): void
    {
        delete_option(self::OPTION_NAME);
    }

    /** @return array<string, mixed> */
    private function stored(): array
    {
        $stored = get_option(self::OPTION_NAME, array());
        return is_array($stored) ? $stored : array();
    }

    private function decryptSlot(string $slot): ?string
    {
        $stored = $this->stored();
        $payload = $stored[$slot] ?? null;
        if (!is_array($payload)) {
            return null;
        }
        foreach (array('ciphertext', 'iv', 'tag') as $field) {
            if (!isset($payload[$field]) || !is_string($payload[$field])) {
                throw new KnowledgeSyncTransportException('key_decryption_failed', 'The encrypted private-key record is invalid.');
            }
        }
        $plaintext = openssl_decrypt(
            base64_decode($payload['ciphertext'], true) ?: '',
            'aes-256-gcm',
            $this->encryptionKey(),
            OPENSSL_RAW_DATA,
            base64_decode($payload['iv'], true) ?: '',
            base64_decode($payload['tag'], true) ?: '',
            'wpsuite-ai-kit-knowledge-sync-v1'
        );
        if (!is_string($plaintext) || $plaintext === '') {
            throw new KnowledgeSyncTransportException('key_decryption_failed', 'The private key could not be decrypted.');
        }
        return $plaintext;
    }

    /** @return array{ciphertext:string,iv:string,tag:string} */
    private function encrypt(string $plaintext): array
    {
        $iv = random_bytes(12);
        $tag = '';
        $ciphertext = openssl_encrypt(
            $plaintext,
            'aes-256-gcm',
            $this->encryptionKey(),
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            'wpsuite-ai-kit-knowledge-sync-v1',
            16
        );
        if (!is_string($ciphertext) || strlen($tag) !== 16) {
            throw new KnowledgeSyncTransportException('key_encryption_failed', 'The private key could not be encrypted.');
        }
        return array(
            'ciphertext' => base64_encode($ciphertext),
            'iv' => base64_encode($iv),
            'tag' => base64_encode($tag),
        );
    }

    private function encryptionKey(): string
    {
        return hash_hkdf(
            'sha256',
            (string) constant('AUTH_KEY') . (string) constant('SECURE_AUTH_KEY'),
            32,
            'wpsuite-ai-kit-knowledge-sync-blog-' . $this->blog_id
        );
    }
}

final class KnowledgeSyncPrivateKeyStoreFactory
{
    public function create(string $mode): KnowledgeSyncPrivateKeyStore
    {
        return match ($mode) {
            'file' => new KnowledgeSyncFilePrivateKeyStore(get_current_blog_id()),
            'encrypted-option' => new KnowledgeSyncEncryptedOptionPrivateKeyStore(get_current_blog_id()),
            default => throw new KnowledgeSyncTransportException('key_storage_disabled', 'Knowledge-sync key storage is disabled.'),
        };
    }
}

final class KnowledgeSyncSiteIdentity
{
    /** @return array{workspaceId:string,siteId:string} */
    public function get(): array
    {
        $settings = get_option('smartcloud-wpsuite/site-settings');
        if ($settings === false) {
            $settings = get_option('hub-for-wpsuiteio/site-settings');
        }
        $read = static function (mixed $source, string $name): string {
            $value = is_object($source)
                ? ($source->{$name} ?? '')
                : (is_array($source) ? ($source[$name] ?? '') : '');
            return is_string($value) ? trim($value) : '';
        };
        $workspace_id = $read($settings, 'workspaceId');
        if ($workspace_id === '') {
            $workspace_id = $read($settings, 'accountId');
        }
        $site_id = $read($settings, 'siteId');
        if (!$this->validIdentifier($workspace_id) || !$this->validIdentifier($site_id)) {
            throw new KnowledgeSyncTransportException('site_not_connected', 'Connect this site before knowledge-sync enrollment.');
        }
        return array('workspaceId' => $workspace_id, 'siteId' => $site_id);
    }

    private function validIdentifier(string $value): bool
    {
        return $value !== '' && strlen($value) <= 190 && preg_match('/^[A-Za-z0-9._:-]+$/', $value) === 1;
    }
}

final class KnowledgeSyncSigner
{
    public const PROTOCOL = 'WPSUITE-AIKIT-V1';
    public const ALGORITHM = 'ES256';

    /** @return array{privateKey:string,publicKey:string} */
    public function generateKeyPair(): array
    {
        $resource = openssl_pkey_new(array(
            'private_key_type' => OPENSSL_KEYTYPE_EC,
            'curve_name' => 'prime256v1',
        ));
        if ($resource === false) {
            throw new KnowledgeSyncTransportException('key_generation_failed', 'An ES256 key pair could not be generated.');
        }
        $private_key = '';
        if (!openssl_pkey_export($resource, $private_key)) {
            throw new KnowledgeSyncTransportException('key_generation_failed', 'The ES256 private key could not be exported.');
        }
        $details = openssl_pkey_get_details($resource);
        $public_key = is_array($details) ? ($details['key'] ?? null) : null;
        if (!is_string($public_key) || $public_key === '') {
            throw new KnowledgeSyncTransportException('key_generation_failed', 'The ES256 public key could not be exported.');
        }
        return array('privateKey' => $private_key, 'publicKey' => $public_key);
    }

    public function publicKey(string $private_key): string
    {
        $resource = openssl_pkey_get_private($private_key);
        $details = $resource !== false ? openssl_pkey_get_details($resource) : false;
        $public_key = is_array($details) ? ($details['key'] ?? null) : null;
        if (!is_string($public_key) || $public_key === '') {
            throw new KnowledgeSyncTransportException('invalid_private_key', 'The stored private key is invalid.');
        }
        return $public_key;
    }

    /** @param array<string, string|string[]> $query */
    public function canonicalRequest(
        string $key_id,
        string $method,
        string $path,
        array $query,
        string $content_sha256,
        string $timestamp,
        string $nonce,
        string $idempotency_key
    ): string {
        if (!str_starts_with($path, '/') || str_contains($path, "\n") || str_contains($path, "\r")) {
            throw new KnowledgeSyncTransportException('invalid_canonical_path', 'The signed request path is invalid.');
        }
        return implode("\n", array(
            self::PROTOCOL,
            $key_id,
            strtoupper($method),
            $path,
            $this->canonicalQuery($query),
            strtolower($content_sha256),
            $timestamp,
            $nonce,
            $idempotency_key,
        ));
    }

    public function sign(string $private_key, string $canonical): string
    {
        $signature = '';
        if (!openssl_sign($canonical, $signature, $private_key, OPENSSL_ALGO_SHA256)) {
            throw new KnowledgeSyncTransportException('signature_failed', 'The request could not be signed.');
        }
        return rtrim(strtr(base64_encode($signature), '+/', '-_'), '=');
    }

    /** @param array<string, string|string[]> $query */
    private function canonicalQuery(array $query): string
    {
        $pairs = array();
        foreach ($query as $key => $raw_value) {
            foreach (is_array($raw_value) ? $raw_value : array($raw_value) as $value) {
                $pairs[] = array(rawurlencode((string) $key), rawurlencode((string) $value));
            }
        }
        usort($pairs, static fn(array $left, array $right): int => strcmp($left[0], $right[0]) ?: strcmp($left[1], $right[1]));
        return implode('&', array_map(
            static fn(array $pair): string => $pair[0] . '=' . $pair[1],
            $pairs
        ));
    }
}

final class KnowledgeSyncTransport
{
    private const REGISTRATION_OPTION = 'smartcloud_ai_kit_kb_sync_registration';
    private const CAPABILITY_PATH = '/meta/capabilities';

    /** @var array<string, mixed>|null */
    private ?array $compatibility_cache = null;

    public function __construct(
        private readonly KnowledgeSyncSettingsStore $settings,
        private readonly KnowledgeSyncPrivateKeyStoreFactory $key_stores,
        private readonly KnowledgeSyncSiteIdentity $identity,
        private readonly KnowledgeSyncSigner $signer
    ) {
    }

    public static function create(): self
    {
        return new self(
            new KnowledgeSyncSettingsStore(),
            new KnowledgeSyncPrivateKeyStoreFactory(),
            new KnowledgeSyncSiteIdentity(),
            new KnowledgeSyncSigner()
        );
    }

    public function registerHooks(): void
    {
        add_filter(
            'smartcloud_ai_kit_knowledge_sync_transport_available',
            array($this, 'isContentDeliveryAvailable')
        );
        add_filter(
            'smartcloud_ai_kit_knowledge_sync_dispatch_batch',
            array($this, 'dispatchBatch'),
            10,
            3
        );
        add_filter(
            'smartcloud_ai_kit_knowledge_sync_dispatch_vocabulary',
            array($this, 'dispatchVocabulary'),
            10,
            2
        );
    }

    public function isContentDeliveryAvailable(bool $available = false): bool
    {
        if ($available) {
            return true;
        }
        $local = $this->localStatus();
        $version = $local['backendCompatibility']['capabilities']['knowledge.automation'] ?? null;
        return !empty($local['configured']) && !empty($local['enrolled']) && is_int($version) && $version >= 5;
    }

    /**
     * @param mixed $previous
     * @param array<int, array<string, mixed>> $projections
     * @param array<int, string> $reviewed_delete_generations
     * @return array<int, array{status:string,errorCode?:string}>
     */
    public function dispatchBatch(
        mixed $previous,
        array $projections,
        array $reviewed_delete_generations = array()
    ): array
    {
        unset($previous);
        $settings = $this->configuredSettings();
        $this->requireCapability('knowledge.automation', $settings['backendBaseUrl'], 5);
        $registration = $this->requiredRegistration();
        $items = array();
        foreach ($projections as $outbox_id => $projection) {
            $items[] = array(
                'clientItemId' => (string) $outbox_id,
                'projection' => $projection,
            );
        }
        $body = array(
            'schemaVersion' => 1,
            'items' => $items,
            ...($reviewed_delete_generations !== array()
                ? array('deletionReview' => array(
                    'approvedItems' => (object) $reviewed_delete_generations,
                ))
                : array()),
        );
        $encoded = wp_json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($encoded)) {
            throw new KnowledgeSyncTransportException('json_encoding_failed', 'The content batch could not be encoded.');
        }
        $response = $this->signedRequest(
            'POST',
            '/automation/kb/content-batches',
            $body,
            $registration,
            $settings['backendBaseUrl'],
            'content-batch-' . hash('sha256', $encoded)
        );
        if (!is_array($response['items'] ?? null)) {
            throw new KnowledgeSyncTransportException('invalid_backend_response', 'The content batch response omitted item results.');
        }
        $results = array();
        foreach ($response['items'] as $item) {
            if (!is_array($item) || !isset($item['clientItemId'], $item['status'])) {
                continue;
            }
            $outbox_id = absint($item['clientItemId']);
            if (!isset($projections[$outbox_id])) {
                continue;
            }
            $results[$outbox_id] = array(
                'status' => (string) $item['status'],
                ...(!empty($item['errorCode'])
                    ? array('errorCode' => sanitize_key((string) $item['errorCode']))
                    : array()),
            );
        }
        return $results;
    }

    /**
     * @param mixed $previous
     * @param array<string, mixed> $input
     * @return array{status:string,changed?:bool,errorCode?:string}
     */
    public function dispatchVocabulary(mixed $previous, array $input): array
    {
        unset($previous);
        $settings = $this->configuredSettings();
        $this->requireCapability('knowledge.automation', $settings['backendBaseUrl'], 4);
        $registration = $this->requiredRegistration();
        $encoded = wp_json_encode($input, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($encoded)) {
            throw new KnowledgeSyncTransportException('json_encoding_failed', 'The WordPress vocabulary input could not be encoded.');
        }
        $response = $this->signedRequest(
            'PUT',
            '/automation/kb/metadata-inputs/wordpress',
            $input,
            $registration,
            $settings['backendBaseUrl'],
            'wordpress-vocabulary-' . hash('sha256', $encoded)
        );
        if (!in_array(($response['status'] ?? ''), array('accepted', 'retry', 'blocked'), true)) {
            throw new KnowledgeSyncTransportException('invalid_backend_response', 'The vocabulary response is invalid.');
        }
        return array(
            'status' => (string) $response['status'],
            ...(isset($response['changed']) ? array('changed' => (bool) $response['changed']) : array()),
            ...(!empty($response['errorCode'])
                ? array('errorCode' => sanitize_key((string) $response['errorCode']))
                : array()),
        );
    }

    /** @return array<string, mixed> */
    public function localStatus(): array
    {
        $settings = $this->settings->get();
        $registration = $this->registration();
        $compatibility = $settings['backendBaseUrl'] === ''
            ? array('status' => 'unconfigured')
            : $this->backendCompatibility($settings['backendBaseUrl']);
        $remote_status = null;
        $remote_error = null;
        if ($registration !== null && $settings['backendBaseUrl'] !== '') {
            try {
                $remote_status = $this->verifyStatus();
            } catch (\Throwable $error) {
                $remote_error = $error->getMessage();
            }
        }
        return array(
            'configured' => $settings['backendBaseUrl'] !== '' && $settings['keyStorageMode'] !== 'disabled',
            'enrolled' => $registration !== null,
            'keyId' => $registration['keyId'] ?? null,
            'workspaceId' => $registration['workspaceId'] ?? null,
            'siteId' => $registration['siteId'] ?? null,
            'environment' => $registration['environment'] ?? $settings['environment'],
            'algorithm' => $registration['algorithm'] ?? null,
            'keyStorageMode' => $settings['keyStorageMode'],
            'backendCompatibility' => $compatibility,
            'remoteStatus' => $remote_status,
            'remoteError' => $remote_error,
        );
    }

    /**
     * Discover the backend contract without requiring Cognito or an enrolled
     * site key. Missing endpoints are treated as a legacy backend so features
     * that existed before capability discovery remain usable.
     *
     * @return array<string, mixed>
     */
    public function backendCompatibility(?string $base_url = null): array
    {
        if ($this->compatibility_cache !== null) {
            return $this->compatibility_cache;
        }
        if ($base_url === null) {
            $base_url = $this->settings->get()['backendBaseUrl'];
        }
        if ($base_url === '') {
            return array('status' => 'unconfigured');
        }

        $response = wp_remote_request($base_url . self::CAPABILITY_PATH, array(
            'method' => 'GET',
            'timeout' => 5,
            'redirection' => 0,
            'headers' => array('Accept' => 'application/json'),
        ));
        if (is_wp_error($response)) {
            return $this->compatibility_cache = array(
                'status' => 'legacy',
                'reason' => 'Capability manifest is unavailable.',
            );
        }
        $status = wp_remote_retrieve_response_code($response);
        $decoded = json_decode(wp_remote_retrieve_body($response), true);
        if (
            $status < 200 || $status >= 300 ||
            !is_array($decoded) ||
            ($decoded['schemaVersion'] ?? null) !== 1 ||
            ($decoded['product'] ?? null) !== 'smartcloud-ai-kit-backend' ||
            !is_string($decoded['release'] ?? null) ||
            !is_array($decoded['capabilities'] ?? null)
        ) {
            return $this->compatibility_cache = array(
                'status' => 'legacy',
                'reason' => 'Backend does not advertise a supported capability manifest.',
            );
        }

        return $this->compatibility_cache = array(
            'status' => 'verified',
            'release' => $decoded['release'],
            'apiSchemaVersion' => is_int($decoded['apiSchemaVersion'] ?? null)
                ? $decoded['apiSchemaVersion']
                : null,
            'capabilities' => $decoded['capabilities'],
        );
    }

    /** @return array<string, mixed> */
    public function enroll(string $pairing_code): array
    {
        if ($this->registration() !== null) {
            throw new KnowledgeSyncTransportException('already_enrolled', 'Rotate or revoke the existing site key before enrolling again.');
        }
        $settings = $this->configuredSettings();
        $this->requireCapability('knowledge.automation', $settings['backendBaseUrl']);
        $identity = $this->identity->get();
        $pairing_code = trim($pairing_code);
        if ($pairing_code === '' || strlen($pairing_code) > 128) {
            throw new KnowledgeSyncTransportException('invalid_pairing_code', 'The pairing code is invalid.');
        }
        $store = $this->key_stores->create($settings['keyStorageMode']);
        $pair = $this->signer->generateKeyPair();
        $store->writePending($pair['privateKey']);
        try {
            $response = $this->request(
                'POST',
                '/automation/kb/enroll',
                array(
                    'pairingCode' => $pairing_code,
                    'publicKey' => $pair['publicKey'],
                    'algorithm' => KnowledgeSyncSigner::ALGORITHM,
                    'workspaceId' => $identity['workspaceId'],
                    'siteId' => $identity['siteId'],
                    'environment' => $settings['environment'],
                ),
                null,
                null,
                $settings['backendBaseUrl']
            );
            foreach (array('keyId', 'workspaceId', 'siteId', 'environment', 'algorithm') as $field) {
                if (!isset($response[$field]) || !is_string($response[$field]) || $response[$field] === '') {
                    throw new KnowledgeSyncTransportException('invalid_enrollment_response', 'The enrollment response is incomplete.');
                }
            }
            if (
                $response['workspaceId'] !== $identity['workspaceId'] ||
                $response['siteId'] !== $identity['siteId'] ||
                $response['environment'] !== $settings['environment'] ||
                $response['algorithm'] !== KnowledgeSyncSigner::ALGORITHM
            ) {
                throw new KnowledgeSyncTransportException('enrollment_identity_mismatch', 'The enrollment response identity does not match this site.');
            }
            $store->promotePending();
            $registration = array(
                'keyId' => $response['keyId'],
                'workspaceId' => $response['workspaceId'],
                'siteId' => $response['siteId'],
                'environment' => $response['environment'],
                'algorithm' => $response['algorithm'],
                'allowedScopes' => is_array($response['allowedScopes'] ?? null) ? $response['allowedScopes'] : array(),
                'producerPrefix' => is_string($response['producerPrefix'] ?? null) ? $response['producerPrefix'] : '',
                'enrolledGmt' => gmdate('c'),
            );
            update_option(self::REGISTRATION_OPTION, $registration, false);
            // The local fingerprint belongs to the previously enrolled remote
            // producer (if any). Force the first runner pass to establish the
            // WordPress vocabulary on this newly enrolled backend.
            KnowledgeSyncVocabularyService::invalidate();
            return $registration;
        } catch (\Throwable $error) {
            $store->discardPending();
            throw $error;
        }
    }

    /** @return array<string, mixed> */
    public function verifyStatus(?string $page_token = null, int $limit = 25): array
    {
        $settings = $this->configuredSettings();
        $this->requireCapability('knowledge.automation', $settings['backendBaseUrl']);
        $registration = $this->requiredRegistration();
        $query = array('limit' => (string) max(1, min(100, $limit)));
        if (is_string($page_token) && $page_token !== '') {
            $query['pageToken'] = $page_token;
        }
        return $this->signedRequest(
            'GET',
            '/automation/kb/status',
            array(),
            $registration,
            $settings['backendBaseUrl'],
            null,
            $query
        );
    }

    /** @return array<string, mixed> */
    public function rotate(int $overlap_seconds = 300): array
    {
        $settings = $this->configuredSettings();
        $this->requireCapability('knowledge.automation', $settings['backendBaseUrl']);
        $registration = $this->requiredRegistration();
        $store = $this->key_stores->create($settings['keyStorageMode']);
        $pair = $this->signer->generateKeyPair();
        $store->writePending($pair['privateKey']);
        try {
            $response = $this->signedRequest(
                'POST',
                '/automation/kb/keys/rotate',
                array(
                    'publicKey' => $pair['publicKey'],
                    'algorithm' => KnowledgeSyncSigner::ALGORITHM,
                    'overlapSeconds' => max(0, min(900, $overlap_seconds)),
                    'workspaceId' => $registration['workspaceId'],
                    'siteId' => $registration['siteId'],
                    'environment' => $registration['environment'],
                ),
                $registration,
                $settings['backendBaseUrl']
            );
            $next_key_id = $response['keyId'] ?? null;
            if (!is_string($next_key_id) || $next_key_id === '') {
                throw new KnowledgeSyncTransportException('invalid_rotation_response', 'The rotation response is incomplete.');
            }
            $store->promotePending();
            $registration['keyId'] = $next_key_id;
            $registration['rotatedGmt'] = gmdate('c');
            update_option(self::REGISTRATION_OPTION, $registration, false);
            return $registration;
        } catch (\Throwable $error) {
            $store->discardPending();
            throw $error;
        }
    }

    /** @return array<string, mixed> */
    public function revoke(): array
    {
        $settings = $this->configuredSettings();
        $this->requireCapability('knowledge.automation', $settings['backendBaseUrl']);
        $registration = $this->requiredRegistration();
        $response = $this->signedRequest(
            'POST',
            '/automation/kb/keys/revoke',
            array(),
            $registration,
            $settings['backendBaseUrl']
        );
        if (($response['status'] ?? null) !== 'revoked') {
            throw new KnowledgeSyncTransportException('invalid_revocation_response', 'The site-key revocation response is invalid.');
        }
        $store = $this->key_stores->create($settings['keyStorageMode']);
        $store->deleteAll();
        delete_option(self::REGISTRATION_OPTION);
        return $response;
    }

    /** @param array<string, mixed> $body
     *  @param array<string, mixed> $registration
     *  @return array<string, mixed>
     */
    private function signedRequest(
        string $method,
        string $path,
        array $body,
        array $registration,
        string $base_url,
        ?string $logical_idempotency_key = null,
        array $query = array()
    ): array
    {
        $store = $this->key_stores->create($this->settings->get()['keyStorageMode']);
        $private_key = $store->readCurrent();
        if ($private_key === null) {
            throw new KnowledgeSyncTransportException('private_key_missing', 'The enrolled private key is missing.');
        }
        $json = $body === array() ? '' : wp_json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($json)) {
            throw new KnowledgeSyncTransportException('json_encoding_failed', 'The signed request body could not be encoded.');
        }
        $timestamp = (string) time();
        $nonce = str_replace('-', '', wp_generate_uuid4());
        $idempotency_key = $logical_idempotency_key ?? 'kb-' . str_replace('-', '', wp_generate_uuid4());
        $content_hash = hash('sha256', $json);
        $canonical = $this->signer->canonicalRequest(
            (string) $registration['keyId'],
            $method,
            $path,
            $query,
            $content_hash,
            $timestamp,
            $nonce,
            $idempotency_key
        );
        $headers = array(
            'X-WPSuite-Key-Id' => (string) $registration['keyId'],
            'X-WPSuite-Timestamp' => $timestamp,
            'X-WPSuite-Nonce' => $nonce,
            'X-WPSuite-Content-SHA256' => $content_hash,
            'X-WPSuite-Signature' => $this->signer->sign($private_key, $canonical),
            'Idempotency-Key' => $idempotency_key,
        );
        return $this->request($method, $path, $body, $json, $headers, $base_url, $query);
    }

    /** @param array<string, mixed> $body
     *  @param array<string, string>|null $headers
     *  @return array<string, mixed>
     */
    private function request(
        string $method,
        string $path,
        array $body,
        ?string $encoded_body,
        ?array $headers,
        string $base_url,
        array $query = array()
    ): array {
        $json = $encoded_body;
        if ($json === null) {
            $json = wp_json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }
        if (!is_string($json)) {
            throw new KnowledgeSyncTransportException('json_encoding_failed', 'The request body could not be encoded.');
        }
        $request_headers = array_merge(array(
            'Accept' => 'application/json',
            'Content-Type' => 'application/json',
        ), $headers ?? array());
        $url = $base_url . $path;
        if ($query !== array()) {
            $url .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        }
        $response = wp_remote_request($url, array(
            'method' => $method,
            'timeout' => 20,
            'redirection' => 0,
            'headers' => $request_headers,
            'body' => $json,
        ));
        if (is_wp_error($response)) {
            throw new KnowledgeSyncTransportException('transport_unavailable', 'The knowledge-sync backend could not be reached.');
        }
        $status = wp_remote_retrieve_response_code($response);
        $response_body = wp_remote_retrieve_body($response);
        $decoded = json_decode($response_body, true);
        if (!is_array($decoded)) {
            throw new KnowledgeSyncTransportException('invalid_backend_response', 'The knowledge-sync backend returned invalid JSON.');
        }
        if ($status < 200 || $status >= 300) {
            $code = isset($decoded['code']) && is_string($decoded['code'])
                ? sanitize_key($decoded['code'])
                : 'backend_rejected';
            throw new KnowledgeSyncTransportException($code, 'The knowledge-sync backend rejected the request.');
        }
        return $decoded;
    }

    /** @return array{backendBaseUrl:string,keyStorageMode:string,environment:string,includeSubsites:bool,baselinePageSize:int,transportBatchSize:int} */
    private function configuredSettings(): array
    {
        $settings = $this->settings->get();
        if ($settings['backendBaseUrl'] === '') {
            throw new KnowledgeSyncTransportException('backend_not_configured', 'Configure the knowledge-sync backend URL first.');
        }
        if ($settings['keyStorageMode'] === 'disabled') {
            throw new KnowledgeSyncTransportException('key_storage_disabled', 'Choose a private-key storage mode first.');
        }
        return $settings;
    }

    private function requireCapability(string $capability, string $base_url, int $minimum_version = 1): void
    {
        $compatibility = $this->backendCompatibility($base_url);
        $version = $compatibility['capabilities'][$capability] ?? null;
        if (!is_int($version) || $version < $minimum_version) {
            throw new KnowledgeSyncTransportException(
                'backend_capability_unavailable',
                'The configured AI Kit backend does not support ' . $capability . '.'
            );
        }
    }

    /** @return array<string, mixed>|null */
    private function registration(): ?array
    {
        $registration = get_option(self::REGISTRATION_OPTION, null);
        return is_array($registration) ? $registration : null;
    }

    /** @return array<string, mixed> */
    private function requiredRegistration(): array
    {
        $registration = $this->registration();
        if ($registration === null || empty($registration['keyId'])) {
            throw new KnowledgeSyncTransportException('site_not_enrolled', 'Enroll this site before using signed transport.');
        }
        return $registration;
    }
}
