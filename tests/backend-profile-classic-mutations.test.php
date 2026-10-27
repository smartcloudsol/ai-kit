<?php
declare(strict_types=1);
// Use the real Hub profile/lease implementation with its synthetic storage fixture, never a live site.
$sharedFixture = dirname(__DIR__, 2) . '/common/wpsuite-admin/tests/backend-profiles.test.php';
if (!is_file($sharedFixture)) $sharedFixture = dirname(__DIR__, 2) . '/hub-for-wpsuiteio/wpsuite-admin/tests/backend-profiles.test.php';
require $sharedFixture;
define('SMARTCLOUD_AI_KIT_PATH', dirname(__DIR__) . '/');
define('SMARTCLOUD_AI_KIT_SLUG', 'smartcloud-ai-kit');
function __(string $text, string $domain = ''): string { return $text; }
function is_admin(): bool { return true; }
function wp_is_post_autosave(int $id): bool { return false; }
function wp_is_post_revision(int $id): bool { return false; }
function wp_doing_cron(): bool { return $GLOBALS['fixture_cron'] ?? false; }
function wp_doing_ajax(): bool { return $GLOBALS['fixture_ajax'] ?? true; }
function wp_unslash(mixed $value): mixed { return $value; }
function check_ajax_referer(string $action, string $field): void { $GLOBALS['native_nonce_checks'][] = [$action, $field]; }
class AjaxReply extends RuntimeException { public function __construct(public mixed $payload, public int $status, public bool $success) { parent::__construct('AJAX_RESPONSE'); } }
function wp_send_json_error(mixed $data = null, int $status = 200): never { throw new AjaxReply($data, $status, false); }
function wp_send_json_success(mixed $data = null, int $status = 200): never { throw new AjaxReply($data, $status, true); }
class WP_Post { public string $post_type = 'post'; }
class WP_REST_Request extends Request {
    public function __construct(string $method = 'GET', string $route = '') { parent::__construct([], $method, $route); }
    public function set_header(string $key, string $value): void { $this->headers[$key] = $value; }
}
require dirname(__DIR__) . '/admin/php/kb/backend-profile-state.php';
require dirname(__DIR__) . '/admin/php/kb/admin.php';
require dirname(__DIR__) . '/admin/php/kb/knowledge-sync.php';
use SmartCloud\WPSuite\AiKit\KnowledgeBase\BackendProfileState;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\Admin;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncCapture;
use SmartCloud\WPSuite\Hub\BackendProfiles;
$admin = (new ReflectionClass(Admin::class))->newInstanceWithoutConstructor();
$oldTab = BackendProfileState::requestContextJson();
BackendProfiles::setValidator(static fn() => ['jws' => 'YQ.Yg.Yw', 'config' => 'YQ:Yg']);
BackendProfiles::activate(['profileId' => 'production', 'expectedGeneration' => 3]);
$before = serialize($GLOBALS['options']);
$callbacks = [fn() => $admin->ajaxRunMigration(), fn() => $admin->ajaxDismissNotice(), fn() => $admin->ajaxBulkEditKbSource(),
    fn() => $admin->handleBulkActions('/wp-admin/edit.php', 'smartcloud_ai_kit_kb_enable', [1]),
    fn() => $admin->onPostSave(1, new WP_Post(), true)];
$capture = (new ReflectionClass(KnowledgeSyncCapture::class))->newInstanceWithoutConstructor();
$callbacks[] = fn() => $capture->onAfterInsertPost(1, new WP_Post(), true, null);
$callbacks[] = fn() => $capture->onSetObjectTerms(1, [], [2], 'category', false, [1]);
foreach ([$oldTab, '', '{broken', ['id' => 'production']] as $payload) {
    $_POST = ['smartcloud_ai_kit_backend_profile' => $payload]; $_GET = [];
    foreach ($callbacks as $callback) {
        $denied = false;
        try { $callback(); } catch (AjaxReply $reply) { $denied = !$reply->success && $reply->status === 409; }
        check($denied, 'Classic/AJAX stale or missing profile reached backend mutation');
        check(serialize($GLOBALS['options']) === $before, 'Classic rejection changed backend options');
    }
}
check(count($GLOBALS['native_nonce_checks']) === 12, 'Native AJAX nonce checks were bypassed');
// Matching classic request reaches only its own scoped option; native authentication remains in place.
$_POST = ['smartcloud_ai_kit_backend_profile' => BackendProfileState::requestContextJson()];
try { $admin->ajaxDismissNotice(); } catch (AjaxReply $reply) { check($reply->success, 'Matching profile mutation was blocked'); }
check(get_option('wpsuite-profile/production/smartcloud_ai_kit_db_migration_dismissed') === true && !isset($GLOBALS['options']['smartcloud_ai_kit_db_migration_dismissed']), 'Matching AJAX mutated owner profile');
// Cron has no browser tuple and retains its previously pinned execution context.
$_POST = []; $GLOBALS['fixture_cron'] = true;
BackendProfileState::assertClassicMutation();
$GLOBALS['fixture_cron'] = false;
$activeRegistry = $GLOBALS['options'][BackendProfiles::OPTION]; unset($GLOBALS['options'][BackendProfiles::OPTION]);
check(BackendProfileState::requestContextJson() === '', 'Legacy pages gained a required profile payload');
BackendProfileState::assertClassicMutation(true);
$GLOBALS['options'][BackendProfiles::OPTION] = $activeRegistry;
echo "AI classic/AJAX profile guard: stale/missing/malformed, native nonce, scoped valid save and cron/legacy compatibility PASS.\n";
