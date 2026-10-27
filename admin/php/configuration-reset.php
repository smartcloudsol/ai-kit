<?php
namespace SmartCloud\WPSuite\AiKit;

use SmartCloud\WPSuite\Hub\ConfigurationReset;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncRunnerLock;
use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncRuntime;

if (!defined('ABSPATH')) { exit; }
require_once __DIR__ . '/kb/backend-profile-state.php';

/** Reset configuration without publishing deletions or removing synchronization records. */
final class LocalConfigurationReset
{
    private const REQUEST_LOCK = 'smartcloud_ai_kit_kb_sync_full_resync_request_lock';

    public static function descriptor(): array
    {
        return array(
            'options' => self::options(),
            'title' => __('Reset all AI-Kit WordPress settings?', 'smartcloud-ai-kit'),
            'consequences' => array(
                __('Clears Answers setup completion so the onboarding can start again.', 'smartcloud-ai-kit'),
                __('Restores all WordPress-stored AI-Kit preferences and removes knowledge-source policies, synchronization settings, publisher selection and the document base URL override.', 'smartcloud-ai-kit'),
                __('Scheduled knowledge synchronization stops until source policies are configured again. Existing pending source updates are retained.', 'smartcloud-ai-kit'),
            ),
            'preserved' => array(
                __('Source content, knowledge records, synchronization queues, audit history and backend registration are preserved. No remote documents or AWS resources are deleted.', 'smartcloud-ai-kit'),
                __('The shared site connection and cloud-managed chatbot, conversation profile and backend settings remain unchanged and can reappear when connected.', 'smartcloud-ai-kit'),
            ),
            'reset' => array(self::class, 'reset'),
        );
    }

    public static function options(): array
    {
        return array_map([\SmartCloud\WPSuite\AiKit\KnowledgeBase\BackendProfileState::class, 'optionName'], array(SMARTCLOUD_AI_KIT_SLUG, 'smartcloud_ai_kit_kb_sync_policies', 'smartcloud_ai_kit_kb_sync_settings', 'smartcloud_ai_kit_kb_sync_publisher_consumer', 'smartcloud_ai_kit_kb_base_url_override', 'smartcloud_ai_kit_answers_setup_completed'));
    }

    public static function reset(string $revision): bool|\WP_Error
    {
        if (!current_user_can('manage_options')) { return self::error(__('Forbidden', 'smartcloud-ai-kit'), 403); }
        require_once __DIR__ . '/kb/knowledge-sync-runtime.php';
        $lock = new KnowledgeSyncRunnerLock();
        $token = $lock->acquire();
        if ($token === null) { return self::error(__('Knowledge synchronization is running. Wait for it to finish before resetting settings.', 'smartcloud-ai-kit'), 409); }
        $requestLocked = false;
        try {
            // Share the producer's request lock so a new full resync cannot begin during reset.
            $expires = (int) get_option(\SmartCloud\WPSuite\AiKit\KnowledgeBase\BackendProfileState::optionName(self::REQUEST_LOCK), 0);
            if ($expires > 0 && $expires <= time()) { delete_option(\SmartCloud\WPSuite\AiKit\KnowledgeBase\BackendProfileState::optionName(self::REQUEST_LOCK)); }
            $requestLocked = add_option(\SmartCloud\WPSuite\AiKit\KnowledgeBase\BackendProfileState::optionName(self::REQUEST_LOCK), time() + 30, '', false);
            if (!$requestLocked) { return self::error(__('A full synchronization request is being prepared. Retry after it finishes.', 'smartcloud-ai-kit'), 409); }
            $job = get_option(\SmartCloud\WPSuite\AiKit\KnowledgeBase\BackendProfileState::optionName(KnowledgeSyncRuntime::FULL_RESYNC_OPTION), null);
            if (is_array($job) && isset($job['id']) && ($job['state'] ?? '') !== 'complete' && !(($job['state'] ?? '') === 'attention-required' && ($job['reason'] ?? '') === 'full_resync_scope_changed')) {
                return self::error(__('A full knowledge synchronization is pending or running. Resolve it before resetting settings.', 'smartcloud-ai-kit'), 409);
            }
            if (!hash_equals(ConfigurationReset::revision(self::descriptor()), $revision)) { return self::error(__('Settings changed. Reload the confirmation before resetting.', 'smartcloud-ai-kit'), 409); }
            foreach (array(KnowledgeSyncRuntime::CRON_HOOK, KnowledgeSyncRuntime::FULL_RESYNC_CRON_HOOK) as $hook) {
                $cleared = wp_clear_scheduled_hook($hook, \SmartCloud\WPSuite\AiKit\KnowledgeBase\BackendProfileState::cronArgs(), true);
                if (is_wp_error($cleared) || $cleared === false) { return self::error(__('Synchronization scheduling could not be fully stopped. No configuration was reset, but some scheduled events may already have stopped. Review knowledge-sync scheduling and WP-Cron before retrying.', 'smartcloud-ai-kit'), 500); }
            }
            // Deliberately bypass policy setters: disabling a policy through those setters enqueues remote deletion.
            $result = ConfigurationReset::deleteOptions(self::options());
            if (is_wp_error($result)) {
                return self::error(__('Settings could not be reset. Scheduled knowledge synchronization has stopped; reload and review knowledge-sync scheduling before retrying.', 'smartcloud-ai-kit'), 500);
            }
            return $result;
        } finally {
            if ($requestLocked) { delete_option(\SmartCloud\WPSuite\AiKit\KnowledgeBase\BackendProfileState::optionName(self::REQUEST_LOCK)); }
            $lock->release($token);
        }
    }

    private static function error(string $message, int $status): \WP_Error
    {
        return new \WP_Error('ai_kit_configuration_reset', $message, array('status' => $status));
    }
}
