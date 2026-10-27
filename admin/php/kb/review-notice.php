<?php
/**
 * Persistent, site-wide Knowledge Base review notice state.
 */

namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/backend-profile-state.php';

final class ReviewNotice
{
    private const OPTION_NAME = 'smartcloud_ai_kit_kb_review_notice_pending';

    /**
     * Mark the notice as pending, without creating duplicate records.
     *
     * add_option() is atomic at the database level because option names are
     * unique, so concurrent bulk saves can still create at most one notice.
     */
    public static function markPending(): bool
    {
        return add_option(BackendProfileState::optionName(self::OPTION_NAME), current_time('mysql'), '', false);
    }

    public static function isPending(): bool
    {
        return get_option(BackendProfileState::optionName(self::OPTION_NAME), false) !== false;
    }

    public static function acknowledge(): void
    {
        delete_option(BackendProfileState::optionName(self::OPTION_NAME));
    }
}
