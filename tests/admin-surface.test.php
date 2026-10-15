<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
define('SMARTCLOUD_AI_KIT_SLUG', 'smartcloud-ai-kit');
$options = []; $writes = []; $allowed = true; $checks = 0; $requests = []; $restStatus = 200; $permissions = [];
function __(string $text, string $domain = ''): string { return $text; }
function current_user_can(string $cap): bool { return $GLOBALS['allowed'] && ($GLOBALS['permissions'][$cap] ?? true); }
function get_option(string $key, mixed $default = false): mixed { return array_key_exists($key, $GLOBALS['options']) ? $GLOBALS['options'][$key] : $default; }
function update_option(string $key, mixed $value): bool { $GLOBALS['options'][$key] = $value; $GLOBALS['writes'][] = $key; return true; }
function admin_url(string $path): string { return 'https://example.test/wp-admin/' . $path; }
class WP_Error { public function __construct(public string $code, public string $message, public array $data) {} }
function is_wp_error(mixed $value): bool { return $value instanceof WP_Error; }
class WP_REST_Request {
    public array $params = [];
    public function __construct(public string $method, public string $path) {}
    public function set_param(string $key, mixed $value): void { $this->params[$key] = $value; }
}
class WP_REST_Response {
    public function __construct(private array $data, private int $status) {}
    public function get_data(): array { return $this->data; }
    public function get_status(): int { return $this->status; }
}
function rest_do_request(WP_REST_Request $request): WP_REST_Response {
    $GLOBALS['requests'][] = $request;
    if (isset($GLOBALS['restFixtures'][$request->path])) { return new WP_REST_Response($GLOBALS['restFixtures'][$request->path], $GLOBALS['restStatus']); }
    return new WP_REST_Response(['total' => 7, 'outbox' => ['pending' => 3, 'blocked' => 2, 'retry_wait' => 1]], $GLOBALS['restStatus']);
}
function check(bool $condition, string $message): void { $GLOBALS['checks']++; if (!$condition) { throw new RuntimeException($message); } }
require __DIR__ . '/../admin/php/model.php';
require __DIR__ . '/../admin/php/surface.php';
use SmartCloud\WPSuite\AiKit\AdminSurface;

$snapshot = AdminSurface::tools();
check(!$snapshot['configured'], 'Fresh setup is accessible without Pro/site settings.');
foreach ([[], new stdClass(), null, '', 'legacy', ['debugLoggingEnabled' => true], ['enablePoweredBy' => null], ['defaultOutputLanguage' => false], ['defaultOutputLanguage' => '<invalid>']] as $empty) {
    $options['smartcloud-ai-kit'] = $empty;
    check(!AdminSurface::tools()['configured'], 'Empty, invalid or unrelated settings retain onboarding.');
}
foreach ([['enablePoweredBy' => false], (object) ['enablePoweredBy' => false], ['defaultOutputLanguage' => '']] as $saved) {
    $options['smartcloud-ai-kit'] = $saved;
    check(AdminSurface::tools()['configured'], 'Saved false preference or explicit language default completes onboarding.');
}
unset($options['smartcloud-ai-kit']);
$result = AdminSurface::save(['defaultOutputLanguage' => 'fr', 'enablePoweredBy' => true], $snapshot['revision']);
check(is_array($result) && $result['configured'], 'Local settings save.');
$options['smartcloud-ai-kit'] = ['defaultOutputLanguage' => 'de', 'debugLoggingEnabled' => true, 'futureField' => ['retain' => true]];
$options['pro'] = ['enableChatbot' => true];
$snapshot = AdminSurface::tools(); $before = $options['smartcloud-ai-kit'];
$result = AdminSurface::save(['defaultOutputLanguage' => 'hu'], $snapshot['revision']);
check($options['smartcloud-ai-kit'] === array_merge($before, ['defaultOutputLanguage' => 'hu']), 'Debug and unknown advanced fields survive.');
$options['smartcloud-ai-kit']['debugLoggingEnabled'] = false;
$error = AdminSurface::save(['enablePoweredBy' => false], $result['revision']);
check($error instanceof WP_Error && $error->data['status'] === 409, 'Concurrent Advanced changes conflict.');
$revision = AdminSurface::tools()['revision'];
foreach ([['enablePoweredBy' => 1], ['enableChatbot' => true], ['defaultOutputLanguage' => '<script>'], ['backendApiName' => 'other'], []] as $invalid) {
    $before = serialize($options); $count = count($writes);
    check(AdminSurface::save($invalid, $revision) instanceof WP_Error, 'Invalid/Pro fields rejected.');
    check(serialize($options) === $before && count($writes) === $count, 'Rejected input never writes.');
}
$before = serialize($options); $count = count($writes); $beforeRequests = count($requests);
$tools = AdminSurface::tools();
$placement = $tools['use_on_site'];
check(array_column($placement['items'], 'id') === ['post-editor', 'media-library', 'ai-feature'], 'AI Tools exposes editor, media and the existing frontend PRO block separately.');
check(str_contains($placement['items'][0]['description'], 'AI-Kit Sidebar') && str_contains($placement['items'][0]['description'], 'AI-Kit Tools'), 'Editor guidance uses the actual sidebar and toolbar invocation names.');
check(str_contains($placement['items'][0]['description'], 'proofread, translate or rewrite'), 'Toolbar guidance lists only existing text-block operations.');
check(str_contains($placement['items'][1]['description'], 'Generate SEO metadata') && str_contains($placement['items'][1]['description'], 'Preview SEO metadata'), 'Media guidance names the existing attachment and batch commands.');
check(str_contains($placement['description'], 'supported browser features') && !isset($placement['items'][0]['status']), 'PHP guidance does not fabricate browser runtime availability.');
check(array_column($placement['items'][0]['links'], 'url') === [admin_url('edit.php'), admin_url('post-new.php')] && $placement['items'][1]['links'][0]['url'] === admin_url('upload.php'), 'Cards open existing WordPress destinations without inserting content.');
check(array_column($tools['links'], 'url') === [admin_url('admin.php?page=smartcloud-ai-kit-diagnostics')], 'Placement destinations do not repeat in the technical footer.');
check(serialize($options) === $before && count($writes) === $count && count($requests) === $beforeRequests, 'Guidance reads neither mutate any config nor dispatch backend requests.');
$permissions = ['edit_posts' => false, 'upload_files' => false, 'edit_pages' => false];
$placement = AdminSurface::tools()['use_on_site'];
check(!$placement['items'][0]['links'] && !$placement['items'][1]['links'] && !$placement['items'][2]['links'], 'Missing editor/media permissions remove destinations independently of manage_options.');
$permissions = ['upload_files' => false];
$placement = AdminSurface::tools()['use_on_site'];
check(count($placement['items'][0]['links']) === 2 && !$placement['items'][1]['links'], 'Media permission is independent of post-editor permission.');
check(str_contains($placement['items'][2]['description'], 'write, rewrite, proofread, summarize or translate') && str_contains($placement['items'][2]['description'], 'requires Pro and a configured backend'), 'Frontend card states exact supported operations and prerequisites.');
$permissions = [];
$answers = AdminSurface::answers();
$shopifyHelp = array_values(array_filter($answers['help'], static fn(array $topic): bool => $topic['id'] === 'answers-shopify-storefront'));
check(count($shopifyHelp) === 1, 'Answers exposes one focused Shopify help topic.');
$shopifyCopy = implode(' ', $shopifyHelp[0]['paragraphs']);
check(str_contains($shopifyCopy, 'UCP catalog') && str_contains($shopifyCopy, 'Storefront GraphQL'), 'Shopify help distinguishes the existing catalog preset from a complementary Storefront integration.');
check(str_contains($shopifyCopy, 'secure backend credential references') && str_contains($shopifyCopy, 'Authentication alone does not add'), 'Shopify help explains secure references and does not promise unsupported filters from authentication alone.');
check(str_contains($shopifyCopy, 'does not install an app') && str_contains($shopifyCopy, 'explicit visitor action') && !isset($shopifyHelp[0]['links']), 'Help is informational, warns against implicit mutations and contains no premature documentation link.');
check(!$answers['can_edit'] && !$answers['steps'], 'Answers has no invented local chatbot wizard.');
check(array_column($answers['metrics'], 'value') === [7, 3, 2, 1], 'Counts come from canonical local API responses.');
check(count($requests) === 2 && $requests[0]->method === 'GET' && $requests[1]->method === 'GET', 'Provider performs only read-only local dispatches.');
$before = count($requests);
check(AdminSurface::action('sync-sources', ['unknown' => true]) instanceof WP_Error, 'Unrecognized action inputs rejected.');
check(AdminSurface::action('other', []) instanceof WP_Error && count($requests) === $before, 'Unrecognized action causes no dispatch.');
check(is_array(AdminSurface::action('sync-sources', [])), 'Explicit action dispatches canonical sync handler.');
check($requests[count($requests)-2]->method === 'POST' && $requests[count($requests)-2]->path === '/smartcloud-ai-kit/v1/kb/knowledge-sync/run', 'Only allowed canonical action route can be called.');
check(end($requests)->method === 'GET', 'Sync action reads the remaining queue after the pass.');
$runPath = '/smartcloud-ai-kit/v1/kb/knowledge-sync/run';
$statusPath = '/smartcloud-ai-kit/v1/kb/knowledge-sync/status';
foreach (['waiting-public-release' => 'verified Static Publisher release', 'transport-unavailable' => 'transport is unavailable', 'error' => 'operations failed', 'mass-delete-review-required' => 'removals need review'] as $state => $expected) {
    $GLOBALS['restFixtures'][$runPath] = ['status' => 'success', 'blogs' => [['status' => $state]]];
    $result = AdminSurface::action('sync-sources', []);
    check($result['severity'] === 'warning' && str_contains($result['message'], $expected), 'Top-level success does not hide ' . $state);
    check(str_contains($result['message'], '3 queued, 2 blocked, 1 waiting to retry'), 'Current queue counts remain visible.');
}
$GLOBALS['restFixtures'][$runPath] = ['status' => 'success', 'blogs' => [['status' => 'outbox-processed', 'processed' => 3]]];
$GLOBALS['restFixtures'][$statusPath] = ['outbox' => ['pending' => 0, 'blocked' => 0, 'retry_wait' => 0, 'leased' => 0]];
$result = AdminSurface::action('sync-sources', []);
check($result['severity'] === 'success' && str_contains($result['message'], 'Backend ingestion may finish later'), 'Empty queue does not claim backend ingestion is complete.');
$GLOBALS['restFixtures'][$statusPath] = ['outbox' => ['pending' => 3], 'publicReleaseGate' => ['mode' => 'static-publisher', 'waitingCount' => 3]];
$GLOBALS['restFixtures'][$runPath] = ['status' => 'success', 'blogs' => [['status' => 'outbox-idle', 'processed' => 0]]];
$result = AdminSurface::action('sync-sources', []);
check($result['severity'] === 'warning' && str_contains($result['message'], '3 queued updates are waiting'), 'Idle worker explains updates held behind the verified-release gate.');
$metrics = AdminSurface::answers()['metrics'];
check(end($metrics)['label'] === 'Waiting for site publication' && end($metrics)['value'] === 3, 'Summary identifies the queued subset waiting for site publication.');
$GLOBALS['restFixtures'][$runPath] = ['status' => 'locked'];
check(AdminSurface::action('sync-sources', []) instanceof WP_Error, 'Concurrent sync pass returns an error.');
unset($GLOBALS['restFixtures']);
$policyPath = '/smartcloud-ai-kit/v1/kb/knowledge-sync/status';
$sourcePath = '/smartcloud-ai-kit/v1/kb/sources';
$preserved = serialize($options); $writeCount = count($writes);
foreach (array(
    array(array(), false),
    array(array('page' => array('enabled' => false, 'reviewPolicy' => 'manual-kb-review')), false),
    array(array('page' => array('enabled' => true, 'reviewPolicy' => 'disabled')), false),
    array(array('page' => array('enabled' => true, 'reviewPolicy' => 'manual-kb-review')), true),
) as [$policies, $configured]) {
    foreach (array(0, 68) as $total) {
        $GLOBALS['restFixtures'][$policyPath] = array('policies' => $policies, 'outbox' => array('pending' => 3));
        $GLOBALS['restFixtures'][$sourcePath] = array('total' => $total);
        $beforeRequests = count($requests);
        $state = AdminSurface::answers();
        check($state['configured'] === $configured && $state['status']['state'] === ($configured ? 'ready' : 'needs_setup'), 'Source selection drives setup state independently of preserved record counts and queues.');
        check($state['can_setup'] && !$state['can_edit'] && !$state['steps'], 'Answers advertises its own setup without enabling generic settings writes.');
        check(count($requests) === $beforeRequests + 2, 'Setup state uses existing canonical local queries only.');
    }
}
check(serialize($options) === $preserved && count($writes) === $writeCount, 'Setup status never changes preferences, policies or shared configuration.');
unset($GLOBALS['restFixtures']);
$restStatus = 503;
check(AdminSurface::answers()['status']['state'] === 'unavailable', 'Unavailable local APIs do not show fabricated healthy counts.');
check(AdminSurface::action('sync-sources', []) instanceof WP_Error, 'Action failure is propagated.');
check(array_unique($writes) === ['smartcloud-ai-kit'], 'No Pro/shared option writes.');
$allowed = false; $before = count($requests);
check(AdminSurface::tools() instanceof WP_Error && AdminSurface::answers() instanceof WP_Error, 'Both reads require manage_options.');
check(AdminSurface::action('sync-sources', []) instanceof WP_Error && count($requests) === $before, 'Action permission independently checked before dispatch.');

$allowed = true; $restStatus = 200; $restFixtures['/smartcloud-ai-kit/v1/kb/knowledge-sync/status'] = ['policies' => []];
$options['smartcloud_ai_kit_answers_setup_completed'] = '1';
$state = AdminSurface::answers();
check($state['configured'] && $state['status']['label'] === 'Setup completed', 'Completed setup remains complete with no enabled source policy.');
unset($options['smartcloud_ai_kit_answers_setup_completed']);
check(AdminSurface::answers()['status']['state'] === 'needs_setup', 'Reset clears completion and restores fresh onboarding state.');
foreach (['false', ['completed' => true], 2] as $invalidMarker) {
    $options['smartcloud_ai_kit_answers_setup_completed'] = $invalidMarker;
    check(AdminSurface::answers()['status']['state'] === 'needs_setup', 'Malformed markers do not complete setup.');
}
echo "AI Kit admin surface: {$checks} checks passed.\n";
