<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
define('SMARTCLOUD_AI_KIT_SLUG', 'smartcloud-ai-kit');
$allowed = true; $checks = 0; $requests = []; $refresh = 200; $http = 200; $wrongIdentity = false; $duringRead = false;
$connection = ['accountId'=>'workspace-1', 'siteId'=>'site-1', 'siteKey'=>'fixture-only-placeholder', 'subscriber'=>true];
$remote = ['accountId'=>'workspace-1', 'siteId'=>'site-1', 'subscriptionType'=>'pro', 'settings'=>['enableChatbot'=>false, 'chatbot'=>['title'=>'Original', 'language'=>'fr', 'starterQuestions'=>['Keep this?'], 'futureField'=>['retain'=>true]], 'futureConfig'=>['retain'=>true], 'backendBaseUrl'=>'']];
function __(string $text, string $domain): string { return $text; }
function current_user_can(string $cap): bool { return $GLOBALS['allowed']; }
function get_option(string $key, mixed $default = false): mixed { return $key === 'smartcloud-wpsuite/site-settings' ? $GLOBALS['connection'] : $default; }
function home_url(string $path): string { return 'https://dev.example.test/site-home' . $path; }
function admin_url(string $path): string { return 'https://dev.example.test/wordpress/wp-admin/' . $path; }
function get_site_url(): string { return 'https://dev.wpsuite.io'; }
function wp_parse_url(string $url, int $component): mixed { return parse_url($url, $component); }
function wp_json_encode(mixed $value): string { return json_encode($value, JSON_THROW_ON_ERROR); }
class WP_Error { public function __construct(public string $code, public string $message, public array $data = []) {} }
function is_wp_error(mixed $value): bool { return $value instanceof WP_Error; }
class WP_REST_Request {
    public array $input = [];
    public function __construct(public string $method, public string $route) {}
    public function get_json_params(): array { return $this->input; }
    public function set_body(string $body): void { $this->input = json_decode($body, true); }
    public function set_header(string $key, string $value): void {}
}
class WP_REST_Response { public function __construct(private int $status) {} public function get_status(): int { return $this->status; } }
function rest_do_request(WP_REST_Request $request): WP_REST_Response { $GLOBALS['requests'][] = $request; return new WP_REST_Response($GLOBALS['refresh']); }
function wp_remote_get(string $url, array $args): array {
    $GLOBALS['requests'][] = ['GET', $url, $args];
    $data = $GLOBALS['remote'];
    if ($GLOBALS['wrongIdentity']) $data['siteId'] = 'another-site';
    if ($GLOBALS['duringRead']) $GLOBALS['connection']['siteId'] = 'new-site';
    return ['status'=>$GLOBALS['http'], 'body'=>json_encode($data)];
}
function wp_remote_request(string $url, array $args): array {
    $GLOBALS['requests'][] = ['PUT', $url, $args];
    if ($GLOBALS['http'] === 200) $GLOBALS['remote']['settings'] = json_decode($args['body'], true)['settings'];
    return ['status'=>$GLOBALS['http'], 'body'=>json_encode($GLOBALS['remote'])];
}
function wp_remote_retrieve_response_code(array $response): int { return $response['status']; }
function wp_remote_retrieve_body(array $response): string { return $response['body']; }
function check(bool $ok, string $message): void { $GLOBALS['checks']++; if (!$ok) throw new RuntimeException($message); }
function request(string $revision, array $values): WP_REST_Request { $r = new WP_REST_Request('POST','answers-settings'); $r->input = ['revision'=>$revision,'values'=>$values]; return $r; }
require __DIR__ . '/../admin/php/answers-settings.php';
use SmartCloud\WPSuite\AiKit\AnswersSettings;
$state = AnswersSettings::read();
check($state['preview_url'] === 'https://dev.example.test/site-home/', 'Preview follows the WordPress home URL rather than the install directory.');
check($state['advanced_tools_url'] === 'https://dev.example.test/wordpress/wp-admin/admin.php?page=smartcloud-ai-kit&section=conversation-profile&profile-section=tools#conversation-profile-tools-settings', 'Advanced tools destination follows the WordPress admin URL including a subdirectory install.');
check($state['connected'] && !$state['backend_configured'], 'Connected settings load without an AI backend.');
check(!str_contains(json_encode($state), 'fixture-only-placeholder') && !str_contains(json_encode($state), 'futureConfig'), 'Projection never returns credentials or unknown advanced settings.');
check($requests[0][1] === 'https://api.wpsuite.io/dev/account/workspace-1/site/site-1/settings', 'Existing cloud dev endpoint is authoritative.');
check($requests[0][2]['redirection'] === 0 && $requests[0][2]['headers']['X-Plugin'] === 'ai-kit', 'Credentials cannot follow redirects and projection selects AI Kit config.');
$before = $remote['settings'];
$saved = AnswersSettings::save(request($state['revision'], ['enableChatbot'=>true]));
check(is_array($saved) && $saved['values']['enableChatbot'], 'Frontend enabled flag saves without an answering backend.');
check($remote['settings'] === array_merge($before, ['enableChatbot'=>true]), 'Activation preserves all presentation and unknown advanced fields.');
check($saved['runtime_refresh_requested'], 'Runtime refresh request is reported separately from backend health.');
check(end($requests) instanceof WP_REST_Request && end($requests)->route === '/smartcloud-wpsuite/v1/update-site-settings', 'Existing canonical runtime refresh path reused.');
$state = AnswersSettings::read();
$saved = AnswersSettings::save(request($state['revision'], ['placeholder'=>'Ask here', 'greeting'=>'Bonjour', 'title'=>'My title']));
check(is_array($saved) && $saved['values']['placeholder'] === 'Ask here', 'Appearance fields save independent of submission key order.');
check($remote['settings']['chatbot']['language'] === 'fr' && $remote['settings']['chatbot']['futureField']['retain'] && $remote['settings']['chatbot']['starterQuestions'] === ['Keep this?'], 'Nested appearance patches preserve localization, starter questions and future fields.');
$remote['settings']['futureConfig']['changed'] = true; $before = $remote;
$count = count($requests);
$error = AnswersSettings::save(request($saved['revision'], ['enableChatbot'=>false]));
check($error instanceof WP_Error && $error->data['status'] === 409 && $remote === $before && count($requests) === $count+1, 'Concurrent Advanced change conflicts before PUT and is preserved.');
$state = AnswersSettings::read();
foreach ([['backendBaseUrl'=>'https://bad.test'], ['title'=>'<script>'], ['greeting'=>str_repeat('x',4001)], ['enableChatbot'=>1], []] as $values) {
    $count = count($requests); $error = AnswersSettings::save(request($state['revision'],$values));
    check($error instanceof WP_Error && count($requests) === $count, 'Invalid or non-presentation fields are rejected without network writes.');
}
$wrongIdentity = true; $count = count($requests);
check(AnswersSettings::read() instanceof WP_Error, 'Wrong-site GET response rejected rather than shown as empty configuration.');
check(AnswersSettings::save(request($state['revision'], ['title'=>'No'])) instanceof WP_Error && count($requests) === $count+2, 'Wrong-site snapshot cannot be written.');
$wrongIdentity = false; $duringRead = true;
check(AnswersSettings::save(request($state['revision'], ['title'=>'No'])) instanceof WP_Error, 'Reconnect during fresh read blocks the old-site write.');
$duringRead = false; $connection['siteId'] = 'site-1';
$http = 503; check(AnswersSettings::read() instanceof WP_Error, 'Cloud service outage stays an error.'); $http = 200;
$refresh = 503; $state = AnswersSettings::read();
$saved = AnswersSettings::save(request($state['revision'], ['title'=>'Saved despite refresh failure']));
check(is_array($saved) && !$saved['runtime_refresh_requested'] && $remote['settings']['chatbot']['title'] === 'Saved despite refresh failure', 'Refresh failure honestly reports a successful remote save without rollback.');
$remote['subscriptionType'] = ''; $state = AnswersSettings::read();
check(is_array(AnswersSettings::save(request($state['revision'], ['enableChatbot'=>false]))), 'Free plan presentation/flag settings remain configurable independently of backend.');
$connection = []; $count = count($requests); $state = AnswersSettings::read();
check(!$state['connected'] && count($requests) === $count, 'Unconnected state requires no cloud request.');
check($state['advanced_tools_url'] === admin_url('admin.php?page=smartcloud-ai-kit&section=conversation-profile&profile-section=tools#conversation-profile-tools-settings'), 'Unconnected projection retains the same permission-protected admin destination.');
check(AnswersSettings::save(request('', ['enableChatbot'=>true])) instanceof WP_Error && count($requests) === $count, 'Unconnected save returns an actionable connection error.');
$connection = ['accountId'=>'workspace-1', 'siteId'=>'site-1', 'siteKey'=>'fixture-only-placeholder'];
$state = AnswersSettings::read();
$saved = AnswersSettings::save(request($state['revision'], ['openButtonPosition'=>'top-left', 'brandColor'=>'#123abc']));
check(is_array($saved) && $saved['values']['openButtonPosition'] === 'top-left' && $saved['values']['brandColor'] === '#123abc', 'Wizard position and brand color use canonical presentation fields.');
check($remote['settings']['chatbot']['colors']['wpsuiteBrand'] === '#123abc' && $remote['settings']['chatbot']['primaryColor'] === 'wpsuiteBrand', 'Brand uses a custom palette without replacing existing colors.');
foreach ([['openButtonPosition'=>'center'], ['brandColor'=>'red'], ['brandColor'=>'#fff'], ['brandColor'=>'url(bad)']] as $values) {
    $count = count($requests); check(AnswersSettings::save(request($saved['revision'], $values)) instanceof WP_Error && count($requests) === $count, 'Invalid position/color fails before a remote write.');
}
$saved = AnswersSettings::save(request($saved['revision'], ['brandColor'=>'']));
check(is_array($saved) && $remote['settings']['chatbot']['primaryColor'] === 'blue', 'Clearing the custom brand selects the default palette.');
$count = count($requests);
$allowed = false; check(AnswersSettings::read() instanceof WP_Error && AnswersSettings::save(request('', ['title'=>'No'])) instanceof WP_Error && count($requests) === $count, 'Denied administrators cannot read or mutate cloud configuration.');
echo "Answers settings: $checks checks passed.\n";
