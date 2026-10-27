<?php
namespace SmartCloud\WPSuite\AiKit;

if (!defined('ABSPATH')) { exit; }
require_once __DIR__ . '/kb/backend-profile-state.php';

/** Local setup completion is independent of enabled features and cloud access. */
final class AnswersOnboarding
{
    public const OPTION = 'smartcloud_ai_kit_answers_setup_completed';

    public static function permission(): bool|\WP_Error
    {
        return current_user_can('manage_options') ? true : new \WP_Error('ai_kit_answers_onboarding', __('Forbidden', 'smartcloud-ai-kit'), array('status' => 403));
    }

    public static function read(): array|\WP_Error
    {
        $permission = self::permission();
        if (is_wp_error($permission)) { return $permission; }
        return array('completed' => in_array(get_option(\SmartCloud\WPSuite\AiKit\KnowledgeBase\BackendProfileState::optionName(self::OPTION), false), array(true, 1, '1'), true));
    }

    public static function save(\WP_REST_Request $request): array|\WP_Error
    {
        $permission = self::permission();
        if (is_wp_error($permission)) { return $permission; }
        if (!wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest')) {
            return new \WP_Error('ai_kit_answers_onboarding', __('Refresh this page before finishing setup.', 'smartcloud-ai-kit'), array('status' => 403));
        }
        $input = $request->get_json_params();
        if (!is_array($input) || array_keys($input) !== array('completed') || $input['completed'] !== true) {
            return new \WP_Error('ai_kit_answers_onboarding', __('Unsupported setup completion request.', 'smartcloud-ai-kit'), array('status' => 400));
        }
        update_option(\SmartCloud\WPSuite\AiKit\KnowledgeBase\BackendProfileState::optionName(self::OPTION), true, false);
        if (!in_array(get_option(\SmartCloud\WPSuite\AiKit\KnowledgeBase\BackendProfileState::optionName(self::OPTION), false), array(true, 1, '1'), true)) {
            return new \WP_Error('ai_kit_answers_onboarding', __('Setup completion could not be saved. Retry finishing setup.', 'smartcloud-ai-kit'), array('status' => 500));
        }
        return array('completed' => true);
    }
}
