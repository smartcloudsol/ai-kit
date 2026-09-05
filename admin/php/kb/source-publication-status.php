<?php
/** Shared presentation of manual publication and automatic delivery state. */
namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

if (!defined('ABSPATH')) {
    exit;
}

final class SourcePublicationStatus
{
    public const STATUSES = ['needs_review', 'ready_to_publish', 'published', 'sync_pending', 'sync_running', 'sync_delivered', 'sync_error', 'sync_blocked', 'sync_removed'];

    /** Complete acknowledges the current desired generation, not Bedrock indexing. */
    public static function automatic(?array $policy, ?object $row, string $post_status): ?string
    {
        if (empty($policy['enabled']) || ($policy['reviewPolicy'] ?? 'disabled') === 'disabled') {
            return null;
        }
        if ($row === null) {
            return $post_status !== 'publish' ? 'sync_removed'
                : (($policy['reviewPolicy'] ?? '') === 'manual-kb-review' ? 'needs_review' : 'sync_pending');
        }
        if (($post_status === 'publish') !== ($row->desired_operation === 'upsert')) {
            return 'sync_pending'; // A publication transition has not been captured yet.
        }
        if ($row->state === 'blocked') {
            return ($row->last_error_code ?? '') === 'manual_review_required' ? 'needs_review' : 'sync_blocked';
        }
        return match ($row->state) {
            'complete' => $row->desired_operation === 'delete' ? 'sync_removed' : 'sync_delivered',
            'leased' => (int) $row->leased_generation === (int) $row->desired_generation ? 'sync_running' : 'sync_pending',
            'retry_wait' => 'sync_error',
            'pending' => 'sync_pending',
            default => 'sync_blocked',
        };
    }

    /** Manual extra documents and stale locked overrides still require attention. */
    public static function combine(int $post_id, ?string $automatic, array $doc_ids, array $states, bool $stale_locked): string
    {
        if ($stale_locked) {
            return 'needs_review';
        }
        $statuses = [];
        if ($automatic !== null) {
            $statuses[] = $automatic;
            $doc_ids = array_values(array_diff($doc_ids, ['post-' . $post_id . '/base']));
        }
        foreach ($doc_ids as $doc_id) {
            $statuses[] = !isset($states[$doc_id]) ? 'needs_review'
                : ($states[$doc_id]->last_backend_status === 'success' ? 'published' : 'ready_to_publish');
        }
        foreach (['needs_review', 'sync_error', 'sync_blocked', 'ready_to_publish', 'sync_pending', 'sync_running'] as $priority) {
            if (in_array($priority, $statuses, true)) {
                return $priority;
            }
        }
        return $automatic ?? (in_array('published', $statuses, true) ? 'published' : 'needs_review');
    }

    /** @return array{status:string,error:?string} */
    public static function forPost(int $post_id): array
    {
        global $wpdb;
        $post = get_post($post_id);
        $policy = $post ? (new KnowledgeSyncPolicyStore())->getForPostType($post->post_type) : null;
        // phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Current per-source state, read only.
        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT state, desired_operation, desired_generation, leased_generation, last_error_code FROM %i WHERE consumer_id = %s AND blog_id = %d AND post_type = %s AND post_id = %d',
            $wpdb->prefix . 'smartcloud_ai_kit_kb_sync_outbox',
            'wordpress-blog-' . get_current_blog_id(), get_current_blog_id(), $post->post_type ?? '', $post_id
        ));
        $docs = $wpdb->get_col($wpdb->prepare('SELECT DISTINCT doc_id FROM %i WHERE post_id = %d', $wpdb->prefix . 'smartcloud_ai_kit_kb_generated', $post_id));
        $states = $wpdb->get_results($wpdb->prepare('SELECT doc_id, last_backend_status FROM %i WHERE post_id = %d', $wpdb->prefix . 'smartcloud_ai_kit_kb_publish_state', $post_id));
        $stale_locked = (bool) $wpdb->get_var($wpdb->prepare(
            'SELECT 1 FROM %i o INNER JOIN %i g ON o.post_id = g.post_id AND o.doc_id = g.doc_id AND o.section_id = g.section_id WHERE o.post_id = %d AND o.locked = 1 AND (o.origin_hash_at_override IS NULL OR o.origin_hash_at_override <> g.origin_hash) LIMIT 1',
            $wpdb->prefix . 'smartcloud_ai_kit_kb_overrides', $wpdb->prefix . 'smartcloud_ai_kit_kb_generated', $post_id
        ));
        // phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $map = [];
        foreach ($states as $state) {
            $map[$state->doc_id] = $state;
        }
        $auto = self::automatic($policy, $row, $post->post_status ?? 'draft');
        return [
            'status' => self::combine($post_id, $auto, $docs, $map, $stale_locked),
            'error' => $auto !== null ? ($row->last_error_code ?? null) : null,
        ];
    }
}
