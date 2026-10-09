<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');

final class WP_Error
{
    public function __construct(public string $code, public string $message = '')
    {
    }
}

final class WP_REST_Request
{
    public function __construct(public string $method, public string $route)
    {
    }

    public function set_header(string $name, string $value): void
    {
    }

    public function set_body(string $body): void
    {
    }
}

final class WP_REST_Response
{
    public function get_status(): int
    {
        return 200;
    }
}

$GLOBALS['welcome_test_settings'] = array(
    'enableChatbot' => true,
    'chatbot' => array('language' => 'hu', 'title' => 'Existing title'),
    'unrelated' => 'preserved',
);
$GLOBALS['welcome_test_writes'] = array();
$GLOBALS['welcome_test_can_manage'] = true;
$GLOBALS['welcome_test_fail_refresh'] = false;

function add_action(...$args): void
{
}

function current_user_can(string $capability): bool
{
    return $capability === 'manage_options' && $GLOBALS['welcome_test_can_manage'];
}

function __(string $text, string $domain): string
{
    return $text;
}

function is_wp_error(mixed $value): bool
{
    return $value instanceof WP_Error;
}

function get_option(string $name): mixed
{
    return $name === 'smartcloud-wpsuite/site-settings'
        ? array('accountId' => 'test-account', 'siteId' => 'test-site', 'siteKey' => 'test-placeholder')
        : false;
}

function get_site_url(): string
{
    return 'https://dev.example.test';
}

function wp_remote_get(string $url, array $args): array
{
    return array('status' => 200, 'body' => json_encode(array('settings' => $GLOBALS['welcome_test_settings'])));
}

function wp_remote_request(string $url, array $args): array
{
    $settings = json_decode($args['body'], true)['settings'];
    $GLOBALS['welcome_test_settings'] = $settings;
    $GLOBALS['welcome_test_writes'][] = $settings;
    return array('status' => 200, 'body' => json_encode(array('settings' => $settings)));
}

function wp_remote_retrieve_response_code(array $response): int
{
    return $response['status'];
}

function wp_remote_retrieve_body(array $response): string
{
    return $response['body'];
}

function wp_json_encode(mixed $value): string
{
    return json_encode($value, JSON_THROW_ON_ERROR);
}

function rest_do_request(WP_REST_Request $request): WP_REST_Response|WP_Error
{
    if ($GLOBALS['welcome_test_fail_refresh']) {
        $GLOBALS['welcome_test_fail_refresh'] = false;
        return new WP_Error('refresh_failed');
    }
    return new WP_REST_Response();
}

require_once dirname(__DIR__) . '/smartcloud-ai-kit.php';

function expect(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }
}

$reflection = new ReflectionClass(\SmartCloud\WPSuite\AiKit\AiKit::class);
$plugin = $reflection->newInstanceWithoutConstructor();
$spec = array(
    'greeting' => ' Üdvözöljük! Miben segíthetünk? ',
    'starterQuestions' => array(' Hol foglalhatok időpontot? ', 'Mennyibe kerül a vizsgálat?'),
);
$result = $plugin->applyChatbotWelcome(null, $spec);
expect(is_array($result) && $result['applied'] === true, 'Valid welcome copy must be saved.');
expect($result['welcome']['greeting'] === 'Üdvözöljük! Miben segíthetünk?', 'Greeting must be trimmed.');
expect($GLOBALS['welcome_test_settings']['chatbot']['starterQuestions'][0] === 'Hol foglalhatok időpontot?', 'Starter questions must be trimmed.');
expect($GLOBALS['welcome_test_settings']['chatbot']['language'] === 'hu', 'Existing chatbot fields must be preserved.');
expect($GLOBALS['welcome_test_settings']['unrelated'] === 'preserved', 'Unrelated settings must be preserved.');
expect(count($GLOBALS['welcome_test_writes']) === 1, 'Valid welcome copy must cause one remote write.');

$writes = count($GLOBALS['welcome_test_writes']);
$invalid = $plugin->applyChatbotWelcome(null, array('greeting' => '<script>bad</script>', 'starterQuestions' => array('Hello?')));
expect($invalid instanceof WP_Error && $invalid->code === 'smartcloud_ai_kit_chatbot_welcome_invalid', 'Markup in welcome copy must be rejected.');
$invalid = $plugin->applyChatbotWelcome(null, array('greeting' => 'Hello', 'starterQuestions' => array('Same?', 'Same?')));
expect($invalid instanceof WP_Error && $invalid->code === 'smartcloud_ai_kit_chatbot_welcome_invalid', 'Duplicate starter questions must be rejected.');
expect(count($GLOBALS['welcome_test_writes']) === $writes, 'Invalid copy must not write remote settings.');

$GLOBALS['welcome_test_can_manage'] = false;
$denied = $plugin->applyChatbotWelcome(null, $spec);
expect($denied instanceof WP_Error && $denied->code === 'smartcloud_ai_kit_chatbot_welcome_forbidden', 'Only site administrators may update welcome copy.');
$GLOBALS['welcome_test_can_manage'] = true;

$previous = $GLOBALS['welcome_test_settings'];
$GLOBALS['welcome_test_fail_refresh'] = true;
$failed = $plugin->applyChatbotWelcome(null, array('greeting' => 'Second greeting', 'starterQuestions' => array('Second question?')));
expect($failed instanceof WP_Error && $failed->code === 'refresh_failed', 'A failed local refresh must be reported.');
expect($GLOBALS['welcome_test_settings'] === $previous, 'A failed local refresh must restore the remote settings.');
expect(count($GLOBALS['welcome_test_writes']) === $writes + 2, 'A failed refresh must be compensated with a second remote write.');

fwrite(STDOUT, "AI Kit chatbot welcome settings checks passed.\n");
