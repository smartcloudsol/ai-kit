<?php
namespace SmartCloud\WPSuite\AiKit;

if (!defined('ABSPATH')) { exit; }

/** Plugin-owned preferences, knowledge status and frontend guidance. */
final class AdminSurface
{
    private static function revision(mixed $raw): string { return hash('sha256', serialize($raw)); }
    private static function error(string $message, int $status = 400): \WP_Error
    {
        return new \WP_Error('ai_kit_surface', $message, array('status' => $status));
    }

    public static function tools(): array|\WP_Error
    {
        if (!current_user_can('manage_options')) { return self::error(__('Forbidden', 'smartcloud-ai-kit'), 403); }
        $raw = get_option(SMARTCLOUD_AI_KIT_SLUG, false);
        $settings = AiKitSettings::fromMixed($raw);
        $saved = is_object($raw) ? get_object_vars($raw) : (is_array($raw) ? $raw : array());
        $configured = (array_key_exists('enablePoweredBy', $saved) && is_bool($saved['enablePoweredBy']))
            || (array_key_exists('defaultOutputLanguage', $saved) && is_string($saved['defaultOutputLanguage'])
                && ($saved['defaultOutputLanguage'] === '' || preg_match('/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8}){0,3}$/D', $saved['defaultOutputLanguage']) === 1));
        return array(
            'schema_version' => 1, 'configured' => $configured, 'can_edit' => true, 'revision' => self::revision($raw),
            'status' => array('state' => $configured ? 'ready' : 'needs_setup', 'label' => $configured ? __('AI preferences configured', 'smartcloud-ai-kit') : __('Choose your AI preferences', 'smartcloud-ai-kit')),
            'notice' => __('These preferences need no subscription or site connection. AI execution depends on the installed build and supported browser or configured provider. Saving preferences does not enable unavailable AI features; check Diagnostics for actual availability.', 'smartcloud-ai-kit'),
            'metrics' => array(array('label' => __('Default output language', 'smartcloud-ai-kit'), 'help_id' => 'ai-tools-language', 'value' => $settings->defaultOutputLanguage ?: __('Feature default', 'smartcloud-ai-kit'))),
            'values' => array('defaultOutputLanguage' => $settings->defaultOutputLanguage, 'enablePoweredBy' => $settings->enablePoweredBy),
            'steps' => array(
                array('id' => 'language', 'title' => __('AI output preferences', 'smartcloud-ai-kit'), 'description' => __('This default is used for new AI requests. It does not translate or rewrite authored content.', 'smartcloud-ai-kit'), 'fields' => array(
                    array('id' => 'defaultOutputLanguage', 'label' => __('Default output language', 'smartcloud-ai-kit'), 'help_id' => 'ai-tools-language', 'type' => 'text', 'description' => __('Use a language code, for example en or de. Leave empty to keep the feature defaults.', 'smartcloud-ai-kit')),
                )),
                array('id' => 'appearance', 'title' => __('Attribution', 'smartcloud-ai-kit'), 'description' => __('Choose the display preference.', 'smartcloud-ai-kit'), 'fields' => array(
                    array('id' => 'enablePoweredBy', 'label' => __('Show Powered by attribution', 'smartcloud-ai-kit'), 'type' => 'checkbox'),
                )),
            ),
            'actions' => array(), 'links' => array(
                array('label' => __('Check AI availability', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG . '-diagnostics')),
            ),
            'use_on_site' => self::useTools(),
            'help' => self::toolsHelp(),
            'runtime_plugin' => 'aiKit', 'runtime_fields' => array(
                array('label' => __('Pro execution mode', 'smartcloud-ai-kit'), 'path' => 'mode', 'format' => 'text'),
                array('label' => __('Pro backend transport', 'smartcloud-ai-kit'), 'path' => 'backendTransport', 'format' => 'text'),
            ),
        );
    }

    /** Existing editor/media entry points; no frontend PRO block or activation. */
    private static function useTools(): array
    {
        $editorLinks = array();
        if (current_user_can('edit_posts')) {
            $editorLinks[] = array('label' => __('Open Posts', 'smartcloud-ai-kit'), 'url' => admin_url('edit.php'));
            $editorLinks[] = array('label' => __('Write a new post', 'smartcloud-ai-kit'), 'url' => admin_url('post-new.php'));
        }
        $mediaLinks = current_user_can('upload_files')
            ? array(array('label' => __('Open Media Library', 'smartcloud-ai-kit'), 'url' => admin_url('upload.php')))
            : array();
        return array(
            'description' => __('Use AI-Kit in the editor, Media Library or on a page. On-device execution depends on supported browser features.', 'smartcloud-ai-kit'),
            'items' => array(
                array('id' => 'post-editor', 'title' => __('In the post editor', 'smartcloud-ai-kit'),
                    'description' => __('Open AI-Kit Sidebar to generate text or suggested SEO title and excerpt. Select a supported text block and use AI-Kit Tools in its toolbar to proofread, translate or rewrite.', 'smartcloud-ai-kit'),
                    'links' => $editorLinks),
                array('id' => 'media-library', 'title' => __('In the Media Library', 'smartcloud-ai-kit'),
                    'description' => __('Open an image and choose Generate SEO metadata to prepare alt text, title, caption and description. For selected images, Preview SEO metadata opens the existing batch review.', 'smartcloud-ai-kit'),
                    'links' => $mediaLinks),
                array('id' => 'ai-feature', 'title' => __('On the frontend', 'smartcloud-ai-kit'), 'help_id' => 'ai-tools-frontend',
                    'description' => __('Add the AI-Kit Feature (PRO) block to a page for visitor actions: write, rewrite, proofread, summarize or translate. The existing frontend integration requires Pro and a configured backend.', 'smartcloud-ai-kit'),
                    'links' => current_user_can('edit_pages') ? array(array('label' => __('Add AI Feature to a page', 'smartcloud-ai-kit'), 'url' => admin_url('post-new.php?post_type=page')), array('label' => __('Browse pages', 'smartcloud-ai-kit'), 'url' => admin_url('edit.php?post_type=page'))) : array()),
            ),
        );
    }

    private static function toolsHelp(): array
    {
        return array(
            array('id' => 'ai-tools-editor', 'title' => __('Writing in Gutenberg', 'smartcloud-ai-kit'), 'summary' => __('AI-Kit works where you edit content.', 'smartcloud-ai-kit'), 'paragraphs' => array(__('Select text and use AI-Kit in the block toolbar for rewriting, proofreading and translation. Open the AI-Kit editor sidebar for content generation and post metadata. Review suggestions before inserting or updating content.', 'smartcloud-ai-kit'))),
            array('id' => 'ai-tools-media', 'title' => __('Image metadata', 'smartcloud-ai-kit'), 'summary' => __('Prepare metadata from the Media Library.', 'smartcloud-ai-kit'), 'paragraphs' => array(__('Open an attachment and use the AI-Kit metadata panel. In the Media Library grid, select several images and use the AI-Kit bulk action. Review the suggested titles, alt text and descriptions before applying them.', 'smartcloud-ai-kit'))),
            array('id' => 'ai-tools-execution', 'title' => __('AI execution', 'smartcloud-ai-kit'), 'summary' => __('Preferences do not determine browser or backend availability.', 'smartcloud-ai-kit'), 'paragraphs' => array(__('On-device features depend on supported browser APIs and models. Backend execution uses the configured provider. Diagnostics reports current availability.', 'smartcloud-ai-kit'))),
            array('id' => 'ai-tools-language', 'title' => __('Default output language', 'smartcloud-ai-kit'), 'summary' => __('A default for new AI requests.', 'smartcloud-ai-kit'), 'paragraphs' => array(__('Changing this preference does not translate authored WordPress content or block labels.', 'smartcloud-ai-kit'))),
            array('id' => 'ai-tools-frontend', 'title' => __('AI Feature on a page', 'smartcloud-ai-kit'), 'summary' => __('Visitor AI actions use the existing AI-Kit Feature block.', 'smartcloud-ai-kit'), 'paragraphs' => array(__('Choose write, rewrite, proofread, summarize or translate in the block settings. Frontend execution requires Pro and the configured backend; editor and Media Library availability is separate.', 'smartcloud-ai-kit'))),
        );
    }

    private static function answersHelp(): array
    {
        $topics = array(
            'answers-knowledge' => array('Knowledge sources', 'WordPress source counts describe synchronization records.', 'Run scheduled sync now runs one bounded pass of the same automatic-policy worker used by WordPress cron, with an additional drift check. It does not use browser-based manual publication, bypass review or wait for backend ingestion. Queued updates can remain until a verified static release, a working automatic-sync transport or a later batch. Blocked and retrying updates track publishing work. These counts do not prove backend ingestion has finished or that the assistant can answer. Setup selects public content types and includes their public taxonomies when there is no existing selection. Changes are staged until Finish setup. Disabling a previously enabled content type queues removal of its ingested knowledge; WordPress content is kept. Review detailed policies in Knowledge Base.'),
            'answers-environment' => array('Environment', 'Backend configuration and service health are different.', 'Answers uses the existing configured production backend. Evaluation onboarding is a separate future flow; opening this page never provisions backend resources.'),
            'answers-sitewide' => array('Site-wide assistant', 'One toggle controls the existing floating chatbot.', 'You can save the enabled flag without an answering backend. The existing frontend runtime requires Pro; visitor questions require a working backend. Saving configuration alone does not prove that answers are available.'),
            'answers-appearance' => array('Chat appearance', 'Authored presentation text belongs to the site.', 'The assistant name is the chat title. Saving behavior mirrors that title into the backend conversation identity; no separate name is edited. The wizard also sets button position, brand color, welcome text and question placeholder. Values are staged until Finish setup. Use the site translation catalog for authored text variants.'),
            'answers-profile' => array('Assistant behavior', 'The Conversation Profile owns identity and response language.', 'Creating the first profile requires an explicit role and site purpose. Set main tasks, tone and general context in setup. Knowledge base search is enabled for a new profile; an existing tool policy is preserved. A saved profile is shared by clients using this backend. Detailed tools, grounding, safety and model settings remain in the detailed settings.'),
            'answers-test' => array('Test Answers privately', 'An explicit admin question tests the saved configuration.', 'Testing does not enable the public assistant. It invokes the current production backend with admin authentication, can incur usage costs and stores a backend chat session. A result without citations is not evidence of a grounded knowledge answer.'),
            'answers-docsearch' => array('Answers on a page', 'DocSearch is separate from the floating assistant.', 'Add AI-Kit Doc Search in the page editor. The block searches the same knowledge base and requires the existing Pro runtime and backend. No content is created or published automatically.'),
        );
        $help = array();
        foreach ($topics as $id => $topic) { $help[] = array('id' => $id, 'title' => __($topic[0], 'smartcloud-ai-kit'), 'summary' => __($topic[1], 'smartcloud-ai-kit'), 'paragraphs' => array(__($topic[2], 'smartcloud-ai-kit'))); }
        return $help;
    }

    public static function save(array $values, string $revision): array|\WP_Error
    {
        if (!current_user_can('manage_options')) { return self::error(__('Forbidden', 'smartcloud-ai-kit'), 403); }
        $raw = get_option(SMARTCLOUD_AI_KIT_SLUG, false);
        if (!hash_equals(self::revision($raw), $revision)) { return self::error(__('Settings changed. Reload before saving.', 'smartcloud-ai-kit'), 409); }
        if (!$values || array_diff(array_keys($values), array('defaultOutputLanguage', 'enablePoweredBy'))) {
            return self::error(__('Unsupported AI preference.', 'smartcloud-ai-kit'));
        }
        foreach ($values as $key => $value) {
            $valid = $key === 'enablePoweredBy' ? is_bool($value) : (is_string($value) && ($value === '' || preg_match('/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8}){0,3}$/D', $value)));
            if (!$valid) { return self::error(__('Invalid AI preference.', 'smartcloud-ai-kit')); }
        }
        $updated = is_object($raw) ? clone $raw : (is_array($raw) ? $raw : AiKitSettings::fromMixed($raw));
        foreach ($values as $key => $value) {
            if (is_array($updated)) { $updated[$key] = $value; } else { $updated->{$key} = $value; }
        }
        update_option(SMARTCLOUD_AI_KIT_SLUG, $updated);
        return self::tools();
    }

    private static function localRequest(string $path, string $method = 'GET'): array|\WP_Error
    {
        $request = new \WP_REST_Request($method, '/' . SMARTCLOUD_AI_KIT_SLUG . '/v1' . $path);
        if ($path === '/kb/sources') { $request->set_param('per_page', 1); }
        $response = rest_do_request($request);
        if (is_wp_error($response)) { return $response; }
        if ($response->get_status() >= 400) { return self::error(__('Knowledge source tools are currently unavailable.', 'smartcloud-ai-kit'), $response->get_status()); }
        return (array) $response->get_data();
    }

    public static function answers(): array|\WP_Error
    {
        if (!current_user_can('manage_options')) { return self::error(__('Forbidden', 'smartcloud-ai-kit'), 403); }
        $sources = self::localRequest('/kb/sources');
        $sync = self::localRequest('/kb/knowledge-sync/status');
        $available = !is_wp_error($sources) && !is_wp_error($sync);
        // These are the same canonical source policies the Answers wizard reads.
        // Source records and queued work can survive reset, so counts do not prove setup.
        $knowledgeConfigured = false;
        foreach (!is_wp_error($sync) && is_array($sync['policies'] ?? null) ? $sync['policies'] : array() as $policy) {
            if (is_array($policy) && ($policy['enabled'] ?? false) === true && ($policy['reviewPolicy'] ?? 'disabled') !== 'disabled') {
                $knowledgeConfigured = true;
                break;
            }
        }
        $configured = $knowledgeConfigured || in_array(get_option('smartcloud_ai_kit_answers_setup_completed', false), array(true, 1, '1'), true);
        $metrics = array();
        if (!is_wp_error($sources)) { $metrics[] = array('label' => __('Knowledge sources', 'smartcloud-ai-kit'), 'help_id' => 'answers-knowledge', 'value' => (int) ($sources['total'] ?? 0)); }
        if (!is_wp_error($sync)) {
            foreach (array('pending' => __('Queued source updates', 'smartcloud-ai-kit'), 'blocked' => __('Blocked source updates', 'smartcloud-ai-kit'), 'retry_wait' => __('Waiting to retry', 'smartcloud-ai-kit')) as $key => $label) {
                $metrics[] = array('label' => $label, 'help_id' => 'answers-knowledge', 'value' => (int) ($sync['outbox'][$key] ?? 0));
            }
            $waiting = max(0, (int) ($sync['publicReleaseGate']['waitingCount'] ?? 0));
            if ($waiting > 0) {
                $metrics[] = array('label' => __('Waiting for site publication', 'smartcloud-ai-kit'), 'help_id' => 'answers-knowledge', 'value' => $waiting);
            }
        }
        return array(
            'schema_version' => 1, 'configured' => $configured, 'can_edit' => false, 'can_setup' => true, 'revision' => '',
            'status' => array('state' => !$available ? 'unavailable' : ($configured ? 'ready' : 'needs_setup'), 'label' => !$available ? __('Knowledge source tools unavailable', 'smartcloud-ai-kit') : ($knowledgeConfigured ? __('Knowledge sources configured', 'smartcloud-ai-kit') : ($configured ? __('Setup completed', 'smartcloud-ai-kit') : __('Choose knowledge content', 'smartcloud-ai-kit')))),
            'notice' => __('The site-wide chatbot and the embeddable DocSearch component share the knowledge base. Source counts track WordPress updates, not completed backend ingestion.', 'smartcloud-ai-kit'),
            'introduction' => array(
                'title' => __('Getting started with Answers', 'smartcloud-ai-kit'),
                'description' => __('Help visitors find answers and explore your site’s content.', 'smartcloud-ai-kit'),
                'items' => array(
                    array('title' => __('Choose knowledge content', 'smartcloud-ai-kit'), 'description' => __('Run setup to select public content and synchronization preferences. You can leave the chatbot off and add it later.', 'smartcloud-ai-kit')),
                    array('title' => __('Offer chat or embedded search', 'smartcloud-ai-kit'), 'description' => __('Use the site-wide chatbot for focused questions, or insert DocSearch for broader search results. Visitor-selected filters can narrow DocSearch.', 'smartcloud-ai-kit')),
                    array('title' => __('Connect the answering backend', 'smartcloud-ai-kit'), 'description' => __('Visitor replies require Pro and a configured backend. The Backend access panel explains the connection and administrator sign-in requirements.', 'smartcloud-ai-kit')),
                    array('title' => __('Add page summaries', 'smartcloud-ai-kit'), 'description' => __('Use the AI Feature block to let visitors summarize authored page content. Configure its action in the editor and test before publishing.', 'smartcloud-ai-kit')),
                ),
            ),
            'help' => array_merge(self::answersHelp(), self::toolsHelp()),
            'metrics' => $metrics, 'values' => new \stdClass(), 'steps' => array(),
            'actions' => $available ? array(array('id' => 'sync-sources', 'label' => __('Run scheduled sync now', 'smartcloud-ai-kit'), 'confirm' => __('Run one pass of the automatic sync now, using your saved schedules, review policies and publishing requirements? This can update knowledge and process pending removals. It does not manually publish every queued source.', 'smartcloud-ai-kit'))) : array(),
            'links' => array(
                array('label' => __('Review source content', 'smartcloud-ai-kit'), 'url' => admin_url('edit.php')),
                array('label' => __('Knowledge base', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG . '&section=kb-admin')),
                array('label' => __('Chatbot settings', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG . '&section=chatbot-settings')),
                array('label' => __('Conversation profile', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG . '&section=conversation-profile')),
                array('label' => __('Diagnostics', 'smartcloud-ai-kit'), 'url' => admin_url('admin.php?page=' . SMARTCLOUD_AI_KIT_SLUG . '-diagnostics')),
            ),
            'runtime_plugin' => 'aiKit', 'runtime_fields' => array(
                array('label' => __('Pro chatbot enabled', 'smartcloud-ai-kit'), 'path' => 'enableChatbot', 'format' => 'boolean'),
                array('label' => __('Pro backend transport', 'smartcloud-ai-kit'), 'path' => 'backendTransport', 'format' => 'text'),
                array('label' => __('Pro backend API name', 'smartcloud-ai-kit'), 'path' => 'backendApiName', 'format' => 'text'),
            ),
        );
    }

    public static function action(string $action, array $input): array|\WP_Error
    {
        if (!current_user_can('manage_options')) { return self::error(__('Forbidden', 'smartcloud-ai-kit'), 403); }
        if ($action !== 'sync-sources' || $input) { return self::error(__('Unsupported source action.', 'smartcloud-ai-kit')); }
        $result = self::localRequest('/kb/knowledge-sync/run', 'POST');
        if (is_wp_error($result)) { return $result; }
        if (($result['status'] ?? '') === 'locked') { return self::error(__('Synchronization is already running.', 'smartcloud-ai-kit'), 409); }
        $status = self::localRequest('/kb/knowledge-sync/status');
        if (is_wp_error($status)) {
            return array('severity' => 'warning', 'message' => __('Sync pass ended, but the remaining queue could not be checked. Refresh status before running it again.', 'smartcloud-ai-kit'));
        }
        $outbox = $status['outbox'] ?? array();
        $pending = max(0, (int) ($outbox['pending'] ?? 0));
        $blocked = max(0, (int) ($outbox['blocked'] ?? 0));
        $retry = max(0, (int) ($outbox['retry_wait'] ?? 0));
        $active = max(0, (int) ($outbox['leased'] ?? 0));
        $states = array_column(is_array($result['blogs'] ?? null) ? $result['blogs'] : array(), 'status');
        $failure = ($result['status'] ?? '') === 'partial-failure' || (bool) array_intersect($states, array('error', 'projection-failed', 'transport-failed'));
        $reason = '';
        if (in_array('waiting-public-release', $states, true)) {
            $reason = __('Waiting for a verified Static Publisher release. This action does not publish the site.', 'smartcloud-ai-kit');
        } elseif (in_array('transport-unavailable', $states, true)) {
            $reason = __('Automatic-sync transport is unavailable. Check its connection in Knowledge Base settings; the chatbot backend alone does not enable automatic sync.', 'smartcloud-ai-kit');
        } elseif ($failure) {
            $reason = __('Some sync operations failed. Open Knowledge Base settings for the recorded errors.', 'smartcloud-ai-kit');
        } elseif (in_array('mass-delete-review-required', $states, true)) {
            $reason = __('Pending removals need review in Knowledge Base settings.', 'smartcloud-ai-kit');
        } elseif ((int) ($status['publicReleaseGate']['waitingCount'] ?? 0) > 0) {
            $reason = sprintf(__('%d queued updates are waiting for their verified Static Publisher release. Publish the corresponding site changes first; this action does not publish the site.', 'smartcloud-ai-kit'), (int) $status['publicReleaseGate']['waitingCount']);
        } elseif ($pending + $blocked + $retry + $active > 0) {
            $reason = __('This was one sync pass. Remaining updates may need review, a retry or another batch; check Knowledge Base settings for details.', 'smartcloud-ai-kit');
        }
        $counts = sprintf(__('Remaining updates: %1$d queued, %2$d blocked, %3$d waiting to retry, %4$d in progress.', 'smartcloud-ai-kit'), $pending, $blocked, $retry, $active);
        return array(
            'severity' => $reason !== '' || $failure ? 'warning' : 'success',
            'message' => trim(__('Automatic sync pass ended.', 'smartcloud-ai-kit') . ' ' . $counts . ' ' . $reason . ' ' . __('Backend ingestion may finish later.', 'smartcloud-ai-kit')),
        );
    }
}
