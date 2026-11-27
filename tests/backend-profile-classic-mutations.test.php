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
function wp_is_post_revision(int $id): bool { return $id === 2; }
function wp_doing_ajax(): bool { return $GLOBALS['fixture_ajax'] ?? true; }
function get_post_types(array $args = [], string $output = 'names'): array { return ['post', 'page']; }
function post_type_exists(string $type): bool { return false; }
function esc_html(string $value): string { return htmlspecialchars($value, ENT_QUOTES); }
function check_ajax_referer(string $action, string $field): void { $GLOBALS['native_nonce_checks'][] = [$action, $field]; }
class AjaxReply extends RuntimeException { public function __construct(public mixed $payload, public int $status, public bool $success) { parent::__construct('AJAX_RESPONSE'); } }
function wp_send_json_error(mixed $data = null, int $status = 200): never { throw new AjaxReply($data, $status, false); }
function wp_send_json_success(mixed $data = null, int $status = 200): never { throw new AjaxReply($data, $status, true); }
class WP_Post {
    public function __construct(public string $post_type = 'post', public string $post_status = 'publish', public int $ID = 1) {}
}
function get_post(int $id): ?WP_Post { return $GLOBALS['fixture_posts'][$id] ?? null; }
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
foreach ([$oldTab, '', '{broken', ['id' => 'production']] as $payload) {
    $_POST = ['smartcloud_ai_kit_backend_profile' => $payload, 'smartcloud_ai_kit_kb_source_action' => 'enable']; $_GET = [];
    foreach ($callbacks as $callback) {
        $denied = false;
        try { $callback(); } catch (AjaxReply $reply) { $denied = !$reply->success && $reply->status === 409; }
        check($denied, 'Classic/AJAX stale or missing profile reached backend mutation');
        check(serialize($GLOBALS['options']) === $before, 'Classic rejection changed backend options');
    }
}
check(count($GLOBALS['native_nonce_checks']) === 12, 'Native AJAX nonce checks were bypassed');
// Passive callbacks may receive no profile tuple, or one from a stale editor form.
$_SERVER['REQUEST_METHOD'] = 'POST';
foreach (['', $oldTab] as $payload) {
    $_POST = ['smartcloud_ai_kit_backend_profile' => $payload];
    $capture->onStructuredMetadataChanged(1, 3, '_wp_attached_file', 'ordinary.zip');
    $capture->onAfterInsertPost(2, new WP_Post('revision', 'inherit', 2), true, null);
    $capture->onFeaturedAttachmentChanged(3);
    $capture->onSetObjectTerms(1, [], [2], 'category', false, [2]);
    check(serialize($GLOBALS['options']) === $before, 'Passive lifecycle callbacks changed profile options');
}
unset($_SERVER['REQUEST_METHOD']);
// Headers must not become valid only after sanitization or slash removal.
$_POST = ['smartcloud_ai_kit_backend_profile' => BackendProfileState::requestContextJson()];
foreach (['production ', '<b>production</b>', "pro\\duction"] as $badHeader) {
    $_SERVER['HTTP_X_WPSUITE_BACKEND_PROFILE'] = $badHeader;
    $denied = false;
    try { BackendProfileState::assertClassicMutation(); } catch (AjaxReply $reply) { $denied = !$reply->success && $reply->status === 409; }
    check($denied, 'Normalized invalid backend header accepted');
}
unset($_SERVER['HTTP_X_WPSUITE_BACKEND_PROFILE']);
// Matching classic request reaches only its own scoped option; native authentication remains in place.
$_POST = ['smartcloud_ai_kit_backend_profile' => BackendProfileState::requestContextJson()];
try { $admin->ajaxDismissNotice(); } catch (AjaxReply $reply) { check($reply->success, 'Matching profile mutation was blocked'); }
check(get_option('wpsuite-profile/production/smartcloud_ai_kit_db_migration_dismissed') === true && !isset($GLOBALS['options']['smartcloud_ai_kit_db_migration_dismissed']), 'Matching AJAX mutated owner profile');
$_POST = [];
$activeRegistry = $GLOBALS['options'][BackendProfiles::OPTION]; unset($GLOBALS['options'][BackendProfiles::OPTION]);
check(BackendProfileState::requestContextJson() === '', 'Legacy pages gained a required profile payload');
BackendProfileState::assertClassicMutation();
$GLOBALS['options'][BackendProfiles::OPTION] = $activeRegistry;
echo "AI classic/AJAX profile guard: stale/missing/malformed, native nonce, scoped valid save, passive hooks and legacy compatibility PASS.\n";
