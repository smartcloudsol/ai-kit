<?php
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
$options = []; $allowed = true; $fail = false; $checks = 0;
function __(string $text, string $domain = ''): string { return $text; }
function current_user_can(string $cap): bool { return $GLOBALS['allowed'] && $cap === 'manage_options'; }
function get_option(string $key, mixed $default = false): mixed { return $GLOBALS['options'][$key] ?? $default; }
function update_option(string $key, mixed $value, bool $autoload): bool { if ($GLOBALS['fail']) return false; $GLOBALS['options'][$key] = (string) $value; return true; }
class WP_Error { public function __construct(public string $code, public string $message, public array $data) {} }
function is_wp_error(mixed $value): bool { return $value instanceof WP_Error; }
function wp_verify_nonce(string $nonce, string $action): bool { return $nonce === 'fixture' && $action === 'wp_rest'; }
class WP_REST_Request { public function __construct(public mixed $input, public string $nonce = 'fixture') {} public function get_header(string $key): string { return $this->nonce; } public function get_json_params(): mixed { return $this->input; } }
function check(bool $condition, string $message): void { $GLOBALS['checks']++; if (!$condition) throw new RuntimeException($message); }
require __DIR__ . '/../admin/php/answers-onboarding.php';
use SmartCloud\WPSuite\AiKit\AnswersOnboarding;
check(AnswersOnboarding::read() === ['completed' => false], 'Fresh install is incomplete.');
foreach ([null, [], ['completed' => false], ['completed' => 1], ['completed' => 'true'], ['completed' => true, 'siteId' => 'bad']] as $input) {
    check(AnswersOnboarding::save(new WP_REST_Request($input)) instanceof WP_Error && $options === [], 'Strict completion payload required.');
}
$allowed = false;
check(AnswersOnboarding::read() instanceof WP_Error && AnswersOnboarding::save(new WP_REST_Request(['completed' => true])) instanceof WP_Error && $options === [], 'Both routes require administrator permissions.');
$allowed = true; $fail = true;
check(AnswersOnboarding::save(new WP_REST_Request(['completed' => true])) instanceof WP_Error && AnswersOnboarding::read() === ['completed' => false], 'Failed persistence never reports completion.');
$fail = false;
check(AnswersOnboarding::save(new WP_REST_Request(['completed' => true], '')) instanceof WP_Error && AnswersOnboarding::save(new WP_REST_Request(['completed' => true], 'invalid')) instanceof WP_Error && $options === [], 'Write requires a valid REST nonce.');
foreach (['false', [], ['completed' => true]] as $invalid) { $options[AnswersOnboarding::OPTION] = $invalid; check(AnswersOnboarding::read() === ['completed' => false], 'Malformed persisted marker cannot indicate completion.'); }
$options = [];
check(AnswersOnboarding::save(new WP_REST_Request(['completed' => true])) === ['completed' => true], 'Empty local configuration can complete without cloud access.');
check(AnswersOnboarding::read() === ['completed' => true] && count($options) === 1, 'WordPress string serialization remains complete; only marker written.');
check(AnswersOnboarding::save(new WP_REST_Request(['completed' => true])) === ['completed' => true], 'Completion is idempotent.');
echo "Answers onboarding: $checks checks passed.\n";
