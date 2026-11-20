<?php
/** Read-only WordPress context for configuring backend-owned knowledge access. */
namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

if (!defined('ABSPATH')) { exit; }

final class CommerceAccessContext
{
    public static function captureEnabled(): bool
    {
        return class_exists('SmartCloud\\WPSuite\\Commerce\\Plugin', false);
    }

    /** @return array<string, object> */
    public static function publicTaxonomies(): array
    {
        $taxonomies = get_taxonomies(array('public' => true), 'objects');
        return is_array($taxonomies) ? $taxonomies : array();
    }

    /** @return array<string, mixed>|\WP_Error */
    public static function read(string $taxonomy = '', string $search = '', int $page = 1): array|\WP_Error
    {
        $settings = get_option('smartcloud-wpsuite/site-settings', null);
        if ($settings === null) { $settings = get_option('hub-for-wpsuiteio/site-settings', array()); }
        $settings = is_object($settings) ? get_object_vars($settings) : (is_array($settings) ? $settings : array());
        $taxonomies = self::publicTaxonomies();
        $options = array();
        foreach ($taxonomies as $name => $object) {
            $options[] = array('value' => (string) $name, 'label' => (string) ($object->labels->name ?? $name));
        }
        usort($options, static fn(array $a, array $b): int => strcmp($a['value'], $b['value']));
        $terms = array();
        $articles = array();
        $has_more = false;
        if ($taxonomy !== '') {
            if (!isset($taxonomies[$taxonomy])) {
                return new \WP_Error('invalid_taxonomy', __('Select a public taxonomy.', 'smartcloud-ai-kit'), array('status' => 400));
            }
            $found = get_terms(array('taxonomy' => $taxonomy, 'hide_empty' => false, 'search' => $search,
                'number' => 101, 'offset' => (max(1, min(1000, $page)) - 1) * 100,
                'orderby' => 'name', 'order' => 'ASC'));
            if (is_wp_error($found)) { return $found; }
            $has_more = count($found) > 100;
            foreach (array_slice($found, 0, 100) as $term) {
                $terms[] = array('taxonomy' => $taxonomy, 'slug' => (string) $term->slug, 'label' => (string) $term->name);
            }
        } elseif (function_exists(__NAMESPACE__ . '\\knowledge_sync_private_articles')) {
            foreach (knowledge_sync_private_articles() as $id => $article) {
                if (current_user_can('edit_post', $id)) {
                    $articles[] = array('postId' => (string) $id, 'title' => get_the_title($id), 'group' => $article['group']);
                }
            }
        }
        return array(
            'siteId' => is_string($settings['siteId'] ?? null) ? $settings['siteId'] : '',
            'accountId' => ($settings['workspaceApiMode'] ?? '') === 'workspace'
                ? (is_string($settings['workspaceId'] ?? null) ? $settings['workspaceId'] : '')
                : (is_string($settings['accountId'] ?? null) ? $settings['accountId'] : ''),
            'plugins' => array('commerce' => self::captureEnabled(),
                'gatey' => class_exists('SmartCloud\\WPSuite\\Gatey\\Gatey', false)),
            'taxonomies' => $options, 'terms' => $terms, 'hasMore' => $has_more, 'privateArticles' => $articles,
        );
    }

    /** Exact assigned terms, independent of topical metadata selection. */
    public static function assignedTerms(int $post_id, string $post_type): array
    {
        $public = self::publicTaxonomies();
        $assigned = array();
        foreach (get_object_taxonomies($post_type, 'names') as $taxonomy) {
            if (!isset($public[$taxonomy])) { continue; }
            $terms = wp_get_object_terms($post_id, $taxonomy);
            if (is_wp_error($terms)) {
                throw new KnowledgeSyncProjectionException('taxonomy_read_failed', 'Access taxonomy assignments could not be read.');
            }
            foreach ($terms as $term) {
                $namespace = (string) $taxonomy;
                $slug = (string) $term->slug;
                if (!preg_match('/^[a-z0-9_-]{1,64}$/D', $namespace) || $slug === '' || strlen($slug) > 190 ||
                    preg_match('//u', $slug) !== 1 || preg_match('/[\x00-\x1f\x7f]/', $slug)) {
                    throw new KnowledgeSyncProjectionException('taxonomy_read_failed', 'Access taxonomy assignment is invalid.');
                }
                $assigned[$namespace . "\0" . $slug] = array('namespace' => $namespace, 'slug' => $slug);
                if (count($assigned) > 200) {
                    throw new KnowledgeSyncProjectionException('taxonomy_read_failed', 'Too many access taxonomy assignments.');
                }
            }
        }
        ksort($assigned, SORT_STRING);
        return array_values($assigned);
    }
}
