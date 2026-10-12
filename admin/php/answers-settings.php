<?php
namespace SmartCloud\WPSuite\AiKit;

if (!defined('ABSPATH')) { exit; }

/** Presentation-only adapter over the existing canonical cloud site settings. */
final class AnswersSettings
{
    public static function permission(): bool|\WP_Error
    {
        return current_user_can('manage_options') ? true : self::error(__('Forbidden', 'smartcloud-ai-kit'), 403);
    }

    private static function error(string $message, int $status = 400): \WP_Error
    {
        return new \WP_Error('ai_kit_answers_settings', $message, array('status' => $status));
    }

    /** @return array<string,string>|\WP_Error */
    private static function connection(): array|\WP_Error
    {
        $raw = get_option('smartcloud-wpsuite/site-settings', false);
        if (false === $raw) { $raw = get_option('hub-for-wpsuiteio/site-settings', false); }
        $settings = is_object($raw) ? get_object_vars($raw) : (is_array($raw) ? $raw : array());
        $result = array();
        foreach (array('accountId', 'siteId', 'siteKey') as $key) {
            if (!is_string($settings[$key] ?? null) || '' === trim($settings[$key])) {
                return self::error(__('Connect this site to WP Suite to save assistant settings.', 'smartcloud-ai-kit'), 409);
            }
            $result[$key] = $settings[$key];
        }
        $base = 'https://api.wpsuite.io' . (wp_parse_url(get_site_url(), PHP_URL_HOST) === 'dev.wpsuite.io' ? '/dev' : '');
        $result['endpoint'] = $base . '/account/' . rawurlencode($result['accountId']) . '/site/' . rawurlencode($result['siteId']) . '/settings';
        return $result;
    }

    /** Never return remote error bodies, credentials or arbitrary configuration. */
    private static function remote(array $connection, ?array $settings = null): array|\WP_Error
    {
        $args = array('timeout' => 20, 'redirection' => 0, 'headers' => array('X-Site-Key' => $connection['siteKey'], 'X-Plugin' => 'ai-kit'));
        if (null === $settings) {
            $response = wp_remote_get($connection['endpoint'], $args);
        } else {
            unset($settings['subscriptionType']);
            $args['method'] = 'PUT';
            $args['headers']['Content-Type'] = 'application/json';
            $args['body'] = wp_json_encode(array('settings' => $settings));
            $response = wp_remote_request($connection['endpoint'], $args);
        }
        if (is_wp_error($response)) { return self::error(__('The WP Suite settings service could not be reached. Retry without discarding your edits.', 'smartcloud-ai-kit'), 502); }
        $status = wp_remote_retrieve_response_code($response);
        $data = json_decode(wp_remote_retrieve_body($response), true);
        if (200 !== $status) {
            /* translators: %d: HTTP response status from the settings service. */
            return self::error(sprintf(__('WP Suite settings request failed (HTTP %d).', 'smartcloud-ai-kit'), $status), $status >= 400 && $status < 500 ? $status : 502);
        }
        if (!is_array($data) || ($data['accountId'] ?? null) !== $connection['accountId'] || ($data['siteId'] ?? null) !== $connection['siteId'] || !is_array($data['settings'] ?? null)) {
            return self::error(__('The settings response did not match the connected site. Reload the connection before saving.', 'smartcloud-ai-kit'), 502);
        }
        return $data;
    }

    private static function revision(array $data, array $connection): string
    {
        return hash('sha256', serialize(array($connection, $data['settings'])));
    }

    private static function projection(array $data, array $connection): array
    {
        $config = $data['settings'];
        $chatbot = is_array($config['chatbot'] ?? null) ? $config['chatbot'] : array();
        $values = array('enableChatbot' => ($config['enableChatbot'] ?? false) === true);
        foreach (array('title', 'greeting', 'placeholder') as $field) {
            $values[$field] = is_string($chatbot[$field] ?? null) ? $chatbot[$field] : '';
        }
        $values['openButtonPosition'] = is_string($chatbot['openButtonPosition'] ?? null) ? $chatbot['openButtonPosition'] : 'bottom-right';
        $colors = is_array($chatbot['colors'] ?? null) ? $chatbot['colors'] : array();
        $values['brandColor'] = is_string($colors[$chatbot['primaryColor'] ?? ''] ?? null) ? $colors[$chatbot['primaryColor']] : '';
        return array('connected' => true, 'revision' => self::revision($data, $connection), 'values' => $values,
            'plan' => is_string($data['subscriptionType'] ?? null) ? $data['subscriptionType'] : '',
            'backend_configured' => !empty($config['backendApiName']) || !empty($config['backendBaseUrl']), 'can_edit_pages' => current_user_can('edit_pages'), 'preview_url' => home_url('/'));  
    }

    public static function read(): array|\WP_Error
    {
        $permission = self::permission(); if (is_wp_error($permission)) { return $permission; }
        $connection = self::connection();
        if (is_wp_error($connection)) { return array('connected' => false, 'revision' => '', 'plan' => '', 'backend_configured' => false, 'can_edit_pages' => current_user_can('edit_pages'), 'preview_url' => home_url('/'), 'values' => array('enableChatbot' => false, 'title' => '', 'greeting' => '', 'placeholder' => '')); }
        $data = self::remote($connection);
        return is_wp_error($data) ? $data : self::projection($data, $connection);
    }

    public static function save(\WP_REST_Request $request): array|\WP_Error
    {
        $permission = self::permission(); if (is_wp_error($permission)) { return $permission; }
        $input = $request->get_json_params();
        if (!is_array($input) || array_diff(array_keys($input), array('revision', 'values')) || !is_string($input['revision'] ?? null) || !is_array($input['values'] ?? null) || !$input['values'] || array_diff(array_keys($input['values']), array('enableChatbot', 'title', 'greeting', 'placeholder', 'openButtonPosition', 'brandColor'))) {
            return self::error(__('Unsupported assistant setting.', 'smartcloud-ai-kit'));
        }
        foreach ($input['values'] as $key => $value) {
            if ($key === 'enableChatbot' ? !is_bool($value) : (!is_string($value) || strlen($value) > ($key === 'greeting' ? 4000 : 500) || preg_match('/[<>\x00-\x08\x0b\x0c\x0e-\x1f]/', $value))) {
                return self::error(__('Invalid assistant setting.', 'smartcloud-ai-kit'));
            }
        }
        if (isset($input['values']['openButtonPosition']) && !in_array($input['values']['openButtonPosition'], array('bottom-right', 'bottom-left', 'top-right', 'top-left'), true)) { return self::error(__('Invalid assistant position.', 'smartcloud-ai-kit')); }
        if (isset($input['values']['brandColor']) && $input['values']['brandColor'] !== '' && !preg_match('/^#[0-9a-fA-F]{6}$/D', $input['values']['brandColor'])) { return self::error(__('Use a six-digit hex brand color.', 'smartcloud-ai-kit')); }
        $connection = self::connection(); if (is_wp_error($connection)) { return $connection; }
        $current = self::remote($connection); if (is_wp_error($current)) { return $current; }
        if (!hash_equals(self::revision($current, $connection), $input['revision']) || self::connection() !== $connection) { return self::error(__('Settings or connection changed. Reload before saving; your edits have been retained.', 'smartcloud-ai-kit'), 409); }
        $next = $current['settings'];
        foreach ($input['values'] as $field => $value) {
            if ($field === 'enableChatbot') { $next[$field] = $value; }
            elseif ($field === 'brandColor') {
                $next['chatbot'] = is_array($next['chatbot'] ?? null) ? $next['chatbot'] : array();
                $next['chatbot']['colors'] = is_array($next['chatbot']['colors'] ?? null) ? $next['chatbot']['colors'] : array();
                if ($value !== '') {
                    $next['chatbot']['colors']['wpsuiteBrand'] = $value;
                    $next['chatbot']['primaryColor'] = 'wpsuiteBrand';
                } else {
                    unset($next['chatbot']['colors']['wpsuiteBrand']);
                    $next['chatbot']['primaryColor'] = 'blue';
                }
            }
            else { $next['chatbot'] = is_array($next['chatbot'] ?? null) ? $next['chatbot'] : array(); $next['chatbot'][$field] = $value; }
        }
        // This detects changes before PUT; the legacy settings API has no atomic revision contract.
        $updated = self::remote($connection, $next); if (is_wp_error($updated)) { return $updated; }
        $result = self::projection($updated, $connection);
        foreach ($input['values'] as $field => $value) {
            if ($result['values'][$field] !== $value) { return self::error(__('The service did not confirm the requested settings. Reload before retrying.', 'smartcloud-ai-kit'), 502); }
        }
        $refresh = new \WP_REST_Request('POST', '/smartcloud-wpsuite/v1/update-site-settings');
        $raw = get_option('smartcloud-wpsuite/site-settings', false);
        if (false === $raw) { $raw = get_option('hub-for-wpsuiteio/site-settings', false); }
        $body = is_object($raw) ? get_object_vars($raw) : (is_array($raw) ? $raw : array());
        if (self::connection() !== $connection) {
            $result['runtime_refresh_requested'] = false;
        } else {
            $body['lastUpdate'] = (int) round(microtime(true) * 1000);
            $refresh->set_body((string) wp_json_encode($body));
            $refresh->set_header('Content-Type', 'application/json');
            $response = rest_do_request($refresh);
            $result['runtime_refresh_requested'] = !is_wp_error($response) && $response->get_status() >= 200 && $response->get_status() < 300;
        }
        return $result;
    }
}
