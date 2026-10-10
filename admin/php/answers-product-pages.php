<?php
namespace SmartCloud\WPSuite\AiKit;

if (!defined('ABSPATH')) { exit; }

/** Read-only public page discovery. Nothing here renders blocks or saves settings. */
final class AnswersProductPages
{
    public static function permission(\WP_REST_Request $request): bool|\WP_Error
    {
        if (!current_user_can('manage_options')) { return self::error(__('Forbidden', 'smartcloud-ai-kit'), 403); }
        if (!wp_verify_nonce($request->get_header('X-WP-Nonce'), 'wp_rest')) {
            return self::error(__('Refresh this page before looking up product pages.', 'smartcloud-ai-kit'), 403);
        }
        return true;
    }

    private static function error(string $message, int $status = 400): \WP_Error
    {
        return new \WP_Error('ai_kit_answers_product_pages', $message, array('status' => $status));
    }

    private static function origin(string $url): ?string
    {
        $parts = wp_parse_url($url);
        if (preg_match('//u', $url) !== 1 || !is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) ||
            isset($parts['user']) || isset($parts['pass']) || (isset($parts['port']) && $parts['port'] !== 443) ||
            !str_contains($parts['host'], '.') || filter_var($parts['host'], FILTER_VALIDATE_IP) ||
            !filter_var($parts['host'], FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) || preg_match('/\.(?:localhost|local|internal)$/i', $parts['host']) ||
            preg_match('/[\x00-\x20\x7f\\\\]/', $url)) { return null; }
        return 'https://' . strtolower($parts['host']);
    }

    private static function publicUrl(string $url, string $siteUrl): ?string
    {
        if (strlen($url) > 2048 || self::origin($url) !== self::origin($siteUrl)) { return null; }
        $parts = wp_parse_url($url);
        if (isset($parts['fragment'])) { return null; }
        $path = rawurldecode($parts['path'] ?? '/');
        $sitePath = rtrim(rawurldecode((string) (wp_parse_url($siteUrl, PHP_URL_PATH) ?? '/')), '/') . '/';
        if (!str_starts_with($path, $sitePath) || preg_match('#(?:^|/)(?:\.\.?|admin|wp-admin|wp-json|wp-login\.php|xmlrpc\.php|api|cart|checkout)(?:/|$)#i', $path) || str_contains($path, '\\') || preg_match('/[\x00-\x20\x7f]|%(?:2e|2f|5c)/i', $path)) { return null; }
        if (isset($parts['query'])) {
            parse_str($parts['query'], $query);
            foreach ($query as $key => $value) {
                if (!is_string($value) || !in_array($key, array('p', 'page_id', 'lang'), true) ||
                    ($key === 'lang' ? !preg_match('/^[A-Za-z]{2,8}(?:[-_][A-Za-z0-9]{2,8})*$/D', $value) : !preg_match('/^[1-9][0-9]*$/D', $value))) { return null; }
            }
        }
        return $url;
    }

    private static function locale(\WP_Post $post): ?string
    {
        $value = null;
        if (function_exists('pll_get_post_language')) { $value = pll_get_post_language((int) $post->ID, 'locale'); }
        if ((!is_string($value) || $value === '') && function_exists('has_filter') && has_filter('wpml_post_language_details')) {
            $details = apply_filters('wpml_post_language_details', null, (int) $post->ID);
            if (is_array($details)) { $value = $details['locale'] ?? $details['language_code'] ?? null; }
        }
        if (!is_string($value) || !preg_match('/^[A-Za-z]{2,8}(?:[-_][A-Za-z0-9]{2,8})*$/D', $value)) { return null; }
        return str_replace('_', '-', $value);
    }

    /** sourceOrigin is a catalog namespace: full public site base, including subpath. */
    private static function sourceScope(string $url): ?string
    {
        $origin = self::origin($url);
        $parts = wp_parse_url($url);
        if (!$origin || isset($parts['query']) || isset($parts['fragment'])) { return null; }
        $scope = $origin . rtrim($parts['path'] ?? '', '/') . '/';
        return self::publicUrl($scope, $origin . '/') ? $scope : null;
    }

    private static function identities(\WP_Post $post, string $siteUrl): array
    {
        $candidates = array();
        if ($post->post_type === 'product' && function_exists('wc_get_product')) {
            try {
                $product = wc_get_product((int) $post->ID);
                $productId = is_object($product) && is_callable(array($product, 'get_id')) ? $product->get_id() : null;
                if ((is_int($productId) || is_string($productId)) && (string) $productId === (string) $post->ID) {
                    $candidates[] = array('providerId' => 'woocommerce', 'sourceOrigin' => self::sourceScope($siteUrl), 'productId' => (string) $productId);
                }
            } catch (\Throwable $error) { /* Optional local provider discovery cannot break page lookup. */ }
        }
        /**
         * Trusted local integrations may return authoritative catalog identities.
         *
         * @param array $identities Initially empty. Each entry must contain only
         *   providerId (lowercase identifier), sourceOrigin (full public HTTPS site
         *   base including any subpath; normalized with a trailing slash),
         *   productId (opaque catalog identifier, at most 256 bytes). Names, slugs,
         *   generic block IDs and visitor-supplied identity guesses are unsuitable.
         * @param \WP_Post $post A published, public, non-password-protected page.
         * The filter must be read-only: no remote calls, block rendering or writes.
         */
        try { $extra = apply_filters('smartcloud_ai_kit_product_page_identities', array(), $post); }
        catch (\Throwable $error) { $extra = array(); }
        if (is_array($extra)) { $candidates = array_merge($candidates, array_slice($extra, 0, 32)); }
        $result = array(); $seen = array();
        foreach ($candidates as $item) {
            if (!is_array($item) || array_diff(array_keys($item), array('providerId', 'sourceOrigin', 'productId')) ||
                !is_string($item['providerId'] ?? null) || !preg_match('/^[a-z][a-z0-9_-]{0,63}$/D', $item['providerId']) ||
                !is_string($item['productId'] ?? null) || trim($item['productId']) === '' || strlen($item['productId']) > 256 ||
                preg_match('//u', $item['productId']) !== 1 || preg_match('/[\x00-\x1f\x7f]/', $item['productId']) || !is_string($item['sourceOrigin'] ?? null)) { continue; }
            $scope = self::sourceScope($item['sourceOrigin']);
            if (!$scope) { continue; }
            $identity = array('providerId' => $item['providerId'], 'sourceOrigin' => $scope, 'productId' => $item['productId']);
            $key = wp_json_encode($identity);
            if (isset($seen[$key])) { continue; }
            $seen[$key] = true; $result[] = $identity;
            if (count($result) >= 8) { break; }
        }
        return $result;
    }

    public static function read(\WP_REST_Request $request): array|\WP_Error
    {
        $permission = self::permission($request); if (is_wp_error($permission)) { return $permission; }
        $search = $request->get_param('search') ?? '';
        $page = $request->get_param('page') ?? 1;
        $perPage = $request->get_param('perPage') ?? 20;
        if (!is_string($search) || preg_match_all('/./us', $search) === false || preg_match_all('/./us', $search) > 200 ||
            preg_match('/[\x00-\x1f\x7f]/', $search) || (!is_int($page) && !is_string($page)) || (!is_int($perPage) && !is_string($perPage)) ||
            !preg_match('/^[1-9][0-9]{0,3}$/D', (string) $page) || (int) $page > 1000 ||
            !preg_match('/^[1-9][0-9]?$/D', (string) $perPage) || (int) $perPage > 20) {
            return self::error(__('Use a short search and a valid page size (1-20).', 'smartcloud-ai-kit'));
        }
        $siteUrl = home_url('/');
        if (!self::sourceScope($siteUrl)) { return self::error(__('Product page links require a public HTTPS site URL.', 'smartcloud-ai-kit'), 409); }
        $postTypes = array();
        foreach (get_post_types(array('public' => true), 'objects') as $type) {
            if ($type->name !== 'attachment' && is_post_type_viewable($type)) { $postTypes[] = $type->name; }
        }
        if (!$postTypes) { return array('siteUrl' => $siteUrl, 'pages' => array(), 'page' => (int) $page, 'hasMore' => false); }
        $query = new \WP_Query(array('post_type' => $postTypes, 'post_status' => 'publish', 'has_password' => false,
            's' => trim($search), 'posts_per_page' => (int) $perPage + 1, 'offset' => ((int) $page - 1) * (int) $perPage,
            'orderby' => array('title' => 'ASC', 'ID' => 'ASC'), 'no_found_rows' => true, 'ignore_sticky_posts' => true,
            'update_post_meta_cache' => false, 'update_post_term_cache' => false));
        $pages = array();
        foreach (array_slice($query->posts, 0, (int) $perPage) as $post) {
            if (!$post instanceof \WP_Post || $post->post_status !== 'publish' || $post->post_password !== '' || !in_array($post->post_type, $postTypes, true)) { continue; }
            $url = get_permalink($post);
            if (!is_string($url) || !self::publicUrl($url, $siteUrl)) { continue; }
            $title = wp_strip_all_tags(get_the_title($post));
            preg_match('/^.{0,300}/us', $title, $boundedTitle);
            $entry = array('postId' => (int) $post->ID, 'title' => $boundedTitle[0] ?? '', 'url' => $url,
                'identities' => self::identities($post, $siteUrl));
            $locale = self::locale($post); if ($locale !== null) { $entry['locale'] = $locale; }
            $pages[] = $entry;
        }
        return array('siteUrl' => $siteUrl, 'pages' => $pages, 'page' => (int) $page, 'hasMore' => count($query->posts) > (int) $perPage);
    }
}
