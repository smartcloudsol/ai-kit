<?php
declare(strict_types=1);

namespace SmartCloud\WPSuite\Hub {
    /** Fixture of the parent manager's validated job-context contract. */
    final class BackendProfiles {
        public static function legacyContext(): array { return ['id' => 'development', 'bindingRevision' => 1]; }
        public static function runWithContext(array $context, callable $callback): mixed {
            if (!in_array($context['id'] ?? '', ['production', 'development'], true) || ($context['bindingRevision'] ?? 0) !== 1) throw new \RuntimeException('stale fixture binding');
            $before = $GLOBALS['profile'];
            $GLOBALS['profile'] = ['enabled' => true, 'id' => $context['id'], 'bindingRevision' => 1, 'namespace' => $context['id'] === 'development' ? '' : 'production', 'legacyStateOwner' => 'development'];
            try { return $callback(); } finally { $GLOBALS['profile'] = $before; }
        }
    }
}
namespace {
    $fixture = sys_get_temp_dir() . '/aikit-profile-test-' . bin2hex(random_bytes(8));
    mkdir($fixture, 0700); mkdir($fixture . '/webroot', 0700); mkdir($fixture . '/keys', 0700);
    define('ABSPATH', $fixture . '/webroot/'); define('SMARTCLOUD_AI_KIT_KB_SYNC_KEY_DIRECTORY', $fixture . '/keys');
    define('AUTH_KEY', 'synthetic-key-not-a-real-wordpress-secret'); define('SECURE_AUTH_KEY', 'synthetic-other-key-not-a-real-wordpress-secret');
    $profile = null; $options = []; $checks = 0;
    function apply_filters(string $hook, mixed $value, mixed ...$args): mixed { return $hook === 'smartcloud_wpsuite_backend_profile_context' ? $GLOBALS['profile'] : $value; }
    function get_option(string $name, mixed $default = false): mixed { return $GLOBALS['options'][$name] ?? $default; }
    function update_option(string $name, mixed $value, mixed ...$args): bool { $GLOBALS['options'][$name] = $value; return true; }
    function delete_option(string $name): bool { unset($GLOBALS['options'][$name]); return true; }
    function current_time(string $type, bool $gmt = false): string { return '2026-10-27 00:00:00'; }
    function sanitize_key(string $name): string { return preg_replace('/[^a-z0-9_-]/', '', strtolower($name)); }
    function check(bool $value, string $message): void { $GLOBALS['checks']++; if (!$value) throw new RuntimeException($message); }
    final class ProfileDatabase {
        public string $prefix = 'wp_'; public array $prepared = [];
        public function prepare(string $sql, mixed ...$args): string { $this->prepared[] = ['sql' => $sql, 'args' => $args]; return $sql; }
        public function get_col(string $sql): array { return []; }
        public function get_row(string $sql): mixed { return null; }
    }
    $wpdb = new ProfileDatabase();
    require __DIR__ . '/../admin/php/kb/backend-profile-state.php';
    require __DIR__ . '/../admin/php/kb/knowledge-sync.php';
    require __DIR__ . '/../admin/php/kb/knowledge-sync-transport.php';
    require __DIR__ . '/../admin/php/kb/repository.php';
    use SmartCloud\WPSuite\AiKit\KnowledgeBase\BackendProfileState;
    use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncOutboxRepository;
    use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncEncryptedOptionPrivateKeyStore;
    use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncFilePrivateKeyStore;
    use SmartCloud\WPSuite\AiKit\KnowledgeBase\Repository;
    try {
        check(BackendProfileState::optionName('smartcloud-ai-kit') === 'smartcloud-ai-kit', 'Unprofiled option identity must remain exact.');
        $outbox = new KnowledgeSyncOutboxRepository(); $sources = new Repository();
        $outbox->claimBatch(2, 60, 'fixture', 1, 'post');
        check(end($wpdb->prepared)['args'][0] === 'wp_smartcloud_ai_kit_kb_sync_outbox', 'Legacy table is unchanged.');
        $fileOwner = new KnowledgeSyncFilePrivateKeyStore(1);
        $fileOwner->writePending('synthetic-development-file'); $fileOwner->promotePending();
        $owner = new KnowledgeSyncEncryptedOptionPrivateKeyStore(1);
        $owner->writePending('synthetic-development-option'); $owner->promotePending();
        $originalOptions = $options;
        $profile = ['enabled' => true, 'id' => 'production', 'namespace' => 'production', 'bindingRevision' => 1, 'legacyStateOwner' => 'development'];
        $outbox->claimBatch(2, 60, 'fixture', 1, 'post');
        check(end($wpdb->prepared)['args'][0] === 'wp_smartcloud_ai_kit_bp_p_kb_sync_outbox', 'An existing repository must never claim another profile\'s queued rows.');
        $sources->getByPostId(1);
        check(end($wpdb->prepared)['args'][0] === 'wp_smartcloud_ai_kit_bp_p_kb_sources', 'All source repositories must follow the captured profile dynamically.');
        $production = new KnowledgeSyncEncryptedOptionPrivateKeyStore(1);
        check($production->readCurrent() === null, 'Another profile cannot inherit an enrollment key.');
        $production->writePending('synthetic-production-option'); $production->promotePending();
        check($production->readCurrent() === 'synthetic-production-option', 'Isolated encrypted storage must round trip.');
        check(isset($options['wpsuite-profile/production/smartcloud_ai_kit_kb_sync_private_keys']), 'Production enrollment must use a distinct encrypted option.');
        check($options['smartcloud_ai_kit_kb_sync_private_keys'] === $originalOptions['smartcloud_ai_kit_kb_sync_private_keys'], 'Original ciphertext must remain byte-for-byte preserved.');
        $fileProduction = new KnowledgeSyncFilePrivateKeyStore(1);
        check($fileProduction->readCurrent() === null, 'File key mode must isolate profiles too.');
        $fileProduction->writePending('synthetic-production-file'); $fileProduction->promotePending();
        check($fileOwner->readCurrent() === 'synthetic-development-file', 'Writing production file keys must not replace legacy files.');
        check(BackendProfileState::cronArgs() === [['id' => 'production', 'bindingRevision' => 1]], 'Cron identity must capture stable profile binding, excluding active generation.');
        $result = BackendProfileState::runScheduled(['id' => 'development', 'bindingRevision' => 1], function () use ($outbox): string {
            $outbox->claimBatch(2, 60, 'fixture', 1, 'post');
            return BackendProfileState::table('kb_sync_outbox');
        });
        check($result === 'wp_smartcloud_ai_kit_kb_sync_outbox', 'Queued work must execute on its captured backend after a switch.');
        check($profile['id'] === 'production', 'Pinned work must restore the request\'s previous context.');
        check(BackendProfileState::runScheduled(null, fn() => BackendProfileState::context()['id']) === 'development', 'Pre-existing argless cron must stay on its original owner.');
        $rejected = false; try { BackendProfileState::runScheduled(['id' => 'production', 'bindingRevision' => 2], fn() => true); } catch (RuntimeException $error) { $rejected = true; }
        check($rejected, 'Changed bindings must fail rather than silently retarget queued work.');
        $production->deleteAll(); $fileProduction->deleteAll();
        check($options === $originalOptions && $fileOwner->readCurrent() === 'synthetic-development-file', 'Deleting one profile must preserve the other profile\'s key records.');
        $profile = ['enabled' => true, 'id' => 'development', 'namespace' => '', 'bindingRevision' => 1, 'legacyStateOwner' => 'development'];
        check((new KnowledgeSyncEncryptedOptionPrivateKeyStore(1))->readCurrent() === 'synthetic-development-option', 'Switching back must recover the exact previous enrolled key.');
        check(BackendProfileState::fileSuffix() === '' && BackendProfileState::tablePrefix() === 'wp_smartcloud_ai_kit_', 'Legacy owner paths/tables remain unchanged.');
        echo "AI Kit backend profile isolation: {$checks} checks PASS\n";
    } finally {
        foreach (glob($fixture . '/keys/*') as $path) unlink($path);
        rmdir($fixture . '/keys'); rmdir($fixture . '/webroot'); rmdir($fixture);
    }
}
