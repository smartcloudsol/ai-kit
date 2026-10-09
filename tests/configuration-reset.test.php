<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/'); define('ARRAY_A', 'ARRAY_A');
foreach (['GATEY' => 'gatey', 'SMARTCLOUD_AI_KIT' => 'smartcloud-ai-kit', 'SMARTCLOUD_FLOW' => 'smartcloud-flow'] as $prefix => $slug) {
    define($prefix . '_SLUG', $slug); define($prefix . '_PATH', '/fixture/not-packaged/');
}
$options = []; $allowed = true; $checks = 0; $cron = []; $cronFailure = false; $failWrite = ''; $network = []; $actions = []; $rowLocks = [];
class WP_Error { public function __construct(public string $code, public string $message, public array $data = []) {} }
function __(string $value, string $domain = ''): string { return $value; }
function current_user_can(string $cap): bool { return $GLOBALS['allowed']; }
function admin_url(string $path): string { return 'https://example.test/wp-admin/' . $path; }
function add_action(...$args): void {}
function do_action(...$args): void { $GLOBALS['actions'][] = $args; }
function get_option(string $key, mixed $default = false): mixed { return $GLOBALS['options'][$key] ?? $default; }
function update_option(string $key, mixed $value, ...$args): bool { if ($GLOBALS['failWrite'] === $key) return false; $GLOBALS['options'][$key] = $value; return true; }
function add_option(string $key, mixed $value, ...$args): bool { if (isset($GLOBALS['options'][$key])) return false; return update_option($key, $value); }
function delete_option(string $key): bool { if ($GLOBALS['failWrite'] === $key) return false; unset($GLOBALS['options'][$key]); return true; }
function wp_cache_delete(...$args): void {}
function wp_salt(string $scheme): string { return 'fixture-salt'; }
function maybe_serialize(mixed $value): string { return is_array($value) || is_object($value) ? serialize($value) : (string) $value; }
function wp_generate_uuid4(): string { return 'fixture-lock'; }
function is_wp_error(mixed $value): bool { return $value instanceof WP_Error; }
function wp_clear_scheduled_hook(string $hook, ...$args): int|false { if ($GLOBALS['cronFailure']) return false; unset($GLOBALS['cron'][$hook]); return 1; }
function is_multisite(): bool { return true; }
function get_site_option(string $key, mixed $default = false): mixed { return $GLOBALS['network'][$key] ?? $default; }
function sanitize_key(string $value): string { return preg_replace('/[^a-z0-9_\-]/', '', strtolower($value)); }
function wp_json_encode(mixed $value): string { return json_encode($value); }
class FixtureDatabase {
    public string $options = 'fixture_options'; public string $last_error = ''; private array $snapshot = [];
    public function prepare(string $sql, mixed ...$args): array { return [$sql, $args]; }
    public function query(string $sql): bool { if ($sql === 'START TRANSACTION') $this->snapshot = $GLOBALS['options']; elseif ($sql === 'ROLLBACK') $GLOBALS['options'] = $this->snapshot; return true; }
    public function get_row(array $query, string $format): ?array { $key = $query[1][0]; if (str_contains($query[0], 'FOR UPDATE')) $GLOBALS['rowLocks'][] = $key; return isset($GLOBALS['options'][$key]) ? ['option_value' => maybe_serialize($GLOBALS['options'][$key])] : null; }
    public function get_var(array $query): mixed { $row = $this->get_row($query, ARRAY_A); return $row === null ? null : (str_contains($query[0], 'option_id') ? '1' : $row['option_value']); }
}
$wpdb = new FixtureDatabase();
function check(bool $value, string $message): void { $GLOBALS['checks']++; if (!$value) throw new RuntimeException($message); }
$root = dirname(__DIR__, 2);
require $root . '/common/wpsuite-admin/php/configuration-reset.php';
require $root . '/gatey/admin/php/admin.php';
require $root . '/flow/admin/php/admin.php';
require $root . '/ai-kit/admin/php/admin.php';
require $root . '/wpsuite-private-plugins/consent/includes/class-configuration.php';
require $root . '/wpsuite-private-plugins/consent/includes/class-admin.php';
require $root . '/wpsuite-private-plugins/content-relations/includes/class-configuration.php';
require $root . '/wpsuite-private-plugins/content-relations/includes/class-admin.php';
use SmartCloud\WPSuite\Hub\ConfigurationReset;
use SmartCloud\WPSuite\AiKit\LocalConfigurationReset;
use SmartCloud\WPSuite\Consent\Configuration as ConsentConfiguration;
$descriptors = [];
foreach (['Gatey', 'Flow', 'AiKit', 'Consent', 'ContentRelations'] as $namespace) {
    $admin = (new ReflectionClass('SmartCloud\\WPSuite\\' . $namespace . '\\Admin'))->newInstanceWithoutConstructor();
    foreach ($admin->registerHubCapabilities([]) as $entry) if (isset($entry['configuration_reset'])) $descriptors[$entry['id']] = $entry['configuration_reset'];
}
$expected = [
    'login-access' => ['gatey'], 'forms-workflows' => ['smartcloud-flow'],
    'answers' => ['smartcloud-ai-kit', 'smartcloud_ai_kit_kb_sync_policies', 'smartcloud_ai_kit_kb_sync_settings', 'smartcloud_ai_kit_kb_sync_publisher_consumer', 'smartcloud_ai_kit_kb_base_url_override', 'smartcloud_ai_kit_answers_setup_completed'],
    'consent' => ['smartcloud_consent_published', 'smartcloud_consent_draft'],
    'content-relations' => ['smartcloud_content_relations_configuration'],
];
check(count($descriptors) === 5, 'Five plugin-owned reset descriptors register without duplicate AI Tools ownership.');
foreach ($expected as $id => $keys) {
    $descriptor = $descriptors[$id];
    check($descriptor['options'] === $keys, $id . ' owns only exact configuration option names.');
    check(count($descriptor['consequences']) > 0 && count($descriptor['preserved']) > 0, $id . ' explicitly describes reset and preservation.');
}
check(str_contains(implode(' ', $descriptors['login-access']['consequences']), 'both user pool') && str_contains(implode(' ', $descriptors['login-access']['consequences']), 'WordPress login integration'), 'Gatey explicitly warns about secondary pools and integration.');
foreach (['login-access', 'forms-workflows', 'content-relations'] as $id) {
    $options = ['smartcloud-wpsuite/site-settings' => ['siteId' => 'keep'], 'another-plugin' => ['keep' => true], 'content-in-options' => ['keep'], $expected[$id][0] . '_unknown' => ['keep']];
    $preserved = $options;
    foreach ($expected[$id] as $key) $options[$key] = ['all-configuration' => ['secondary' => true, 'advanced' => true]];
    check(ConfigurationReset::deleteOptions($expected[$id]) === true && $options === $preserved, $id . ' removes full owned configuration and preserves shared, prefix-neighbor and unrelated options.');
}
$aiDescriptor = $descriptors['answers'];
$preserved = ['smartcloud-wpsuite/site-settings' => ['keep'], 'smartcloud_ai_kit_kb_sync_registration' => ['keep'], 'smartcloud_ai_kit_kb_sync_vocabulary_state' => ['keep'], 'smartcloud_ai_kit_db_version' => '5', 'smartcloud_ai_kit_kb_sync_last_run' => ['keep'], 'smartcloud_ai_kit_kb_sync_full_resync' => ['id' => 'previous', 'state' => 'complete']];
function seedAi(array $preserved): void { $GLOBALS['options'] = $preserved; foreach (LocalConfigurationReset::options() as $key) $GLOBALS['options'][$key] = ['fixture-config']; $GLOBALS['cron'] = ['smartcloud_ai_kit_knowledge_sync_tick' => true, 'smartcloud_ai_kit_knowledge_sync_full_resync_tick' => true]; }
seedAi($preserved); $revision = ConfigurationReset::revision($aiDescriptor);
check(LocalConfigurationReset::reset($revision) === true, 'AI-Kit reset completes with no active worker.');
check($options === $preserved && $cron === [] && $actions === [], 'AI-Kit preserves synchronization records and shared settings, stops cron, and never invokes policy/remote deletion hooks.');
foreach ([['smartcloud_ai_kit_kb_sync_runner_lock', ['token' => 'other', 'expires' => time() + 600]], ['smartcloud_ai_kit_kb_sync_full_resync_request_lock', time() + 600], ['smartcloud_ai_kit_kb_sync_full_resync', ['id' => 'active', 'state' => 'queued']], ['smartcloud_ai_kit_kb_sync_full_resync', ['id' => 'active', 'state' => 'attention-required']]] as [$key, $value]) {
    seedAi($preserved); $options[$key] = $value; $before = $options; $beforeCron = $cron;
    $result = LocalConfigurationReset::reset(ConfigurationReset::revision($aiDescriptor));
    check($result instanceof WP_Error && $result->data['status'] === 409 && $options === $before && $cron === $beforeCron, 'AI-Kit refuses concurrent worker or full resync without configuration changes.');
}
seedAi($preserved); $revision = ConfigurationReset::revision($aiDescriptor); $options['smartcloud-ai-kit'] = ['changed']; $before = $options;
check(LocalConfigurationReset::reset($revision) instanceof WP_Error && $options === $before, 'AI-Kit rechecks configuration after acquiring worker locks.');
seedAi($preserved); $before = $options; $cronFailure = true;
check(LocalConfigurationReset::reset(ConfigurationReset::revision($aiDescriptor)) instanceof WP_Error && $options === $before, 'Scheduling failure preserves configuration.'); $cronFailure = false;
seedAi($preserved); $before = $options; $failWrite = 'smartcloud_ai_kit_kb_sync_settings';
$result = LocalConfigurationReset::reset(ConfigurationReset::revision($aiDescriptor));
check($result instanceof WP_Error && $options === $before, 'AI-Kit configuration deletion failure rolls back every owned setting.');
check(str_contains($result->message, 'synchronization has stopped') && $cron === [], 'AI-Kit reports stopped scheduling when configuration reset fails after cron removal.'); $failWrite = '';
$consent = $descriptors['consent']['reset'];
$network = [ConsentConfiguration::NETWORK_OPTION => ['cookieName' => 'network_cookie', 'services' => [['id' => 'network-service']]]];
$options = [ConsentConfiguration::OPTION_PUBLISHED => ['services' => [['id' => 'site-service']]], ConsentConfiguration::OPTION_DRAFT => ['services' => [['id' => 'draft-service']]], ConsentConfiguration::OPTION_HISTORY => ['retain'], ConsentConfiguration::OPTION_PENDING => ['retain'], ConsentConfiguration::OPTION_IGNORED => ['retain'], 'smartcloud-wpsuite/site-settings' => ['keep']];
$before = $options; $beforeNetwork = $network;
$rowLocks = [];
check($consent(ConfigurationReset::revision($descriptors['consent'])) === true && ConsentConfiguration::getPublished() === ConsentConfiguration::defaults() && ConsentConfiguration::getDraft() === ConsentConfiguration::defaults(), 'Consent resets effective site settings to explicit factory defaults without inheriting network configuration.');
check($rowLocks === [ConsentConfiguration::OPTION_DRAFT, ConsentConfiguration::OPTION_PUBLISHED], 'Consent locks exactly the draft and published option rows in stable order.');
foreach ([ConsentConfiguration::OPTION_HISTORY, ConsentConfiguration::OPTION_PENDING, ConsentConfiguration::OPTION_IGNORED, 'smartcloud-wpsuite/site-settings'] as $key) check($options[$key] === $before[$key], 'Consent preserves audit, crawl and shared state.');
check($network === $beforeNetwork && $actions === [], 'Consent preserves all network settings and avoids publication hooks.');
$options = $before;
$staleRevision = ConfigurationReset::revision($descriptors['consent']);
$options[ConsentConfiguration::OPTION_DRAFT] = ['services' => [['id' => 'concurrent-edit']]];
$concurrent = $options;
$result = $consent($staleRevision);
check($result instanceof WP_Error && $result->data['status'] === 409 && $options === $concurrent, 'Consent rechecks the revision while holding row locks and preserves concurrent edits.');
$options = $before; $failWrite = ConsentConfiguration::OPTION_DRAFT;
check($consent(ConfigurationReset::revision($descriptors['consent'])) instanceof WP_Error && $options === $before, 'Consent failure rolls back published and draft settings together.'); $failWrite = '';
$allowed = false; $before = $options;
check($consent(ConfigurationReset::revision($descriptors['consent'])) instanceof WP_Error && LocalConfigurationReset::reset('fixture') instanceof WP_Error && $options === $before, 'Custom reset adapters enforce administrator authorization.');
echo "Plugin reset adapters: $checks checks passed.\n";
