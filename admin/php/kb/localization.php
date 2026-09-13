<?php
/**
 * Provider-neutral content locale and translation-group discovery for KB sources.
 */

namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

if (!defined('ABSPATH')) {
    exit;
}

final class KnowledgeBaseLocalization
{
    public static function normalizeLocale(mixed $value, string $fallback = 'en'): string
    {
        $candidate = str_replace('_', '-', trim((string) $value));
        if (preg_match('/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/', $candidate) === 1) {
            return strtolower((string) strtok($candidate, '-'));
        }
        return strtolower((string) strtok(str_replace('_', '-', $fallback), '-')) ?: 'en';
    }

    public static function localeForPost(\WP_Post $post): string
    {
        if (function_exists('pll_get_post_language')) {
            $locale = pll_get_post_language((int) $post->ID, 'slug');
            if (is_string($locale) && $locale !== '') {
                return self::normalizeLocale($locale);
            }
        }

        if (function_exists('has_filter') && has_filter('wpml_post_language_details')) {
            $details = apply_filters('wpml_post_language_details', null, (int) $post->ID);
            if (is_array($details)) {
                $locale = $details['language_code'] ?? $details['locale'] ?? '';
                if (is_string($locale) && $locale !== '') {
                    return self::normalizeLocale($locale);
                }
            }
        }

        return self::siteLocale();
    }

    /**
     * @return array{
     *   provider:string,
     *   groupId:string,
     *   currentLocale:string,
     *   defaultLocale:string,
     *   variants:array<int,array{locale:string,languageCode:string,postId:int,title:string,url:string,status:string}>
     * }
     */
    public static function describe(\WP_Post $post): array
    {
        if (
            function_exists('pll_get_post_language')
            && function_exists('pll_get_post_translations')
        ) {
            return self::describePolylang($post);
        }
        if (function_exists('has_filter') && has_filter('wpml_post_language_details')) {
            $wpml = self::describeWpml($post);
            if ($wpml !== null) {
                return $wpml;
            }
        }
        $locale = self::localeForPost($post);
        return array(
            'provider' => 'wordpress',
            'groupId' => $post->post_type . ':' . $post->ID,
            'currentLocale' => $locale,
            'defaultLocale' => self::siteLocale(),
            'variants' => array(self::variant($locale, $locale, (int) $post->ID)),
        );
    }

    /** @return array<string,mixed> */
    private static function describePolylang(\WP_Post $post): array
    {
        $current = self::normalizeLocale(pll_get_post_language((int) $post->ID, 'slug'));
        $default = function_exists('pll_default_language')
            ? self::normalizeLocale(pll_default_language('slug'))
            : self::siteLocale();
        $translations = pll_get_post_translations((int) $post->ID);
        $translations = is_array($translations) ? $translations : array();
        if ($translations === array()) {
            $translations[$current] = (int) $post->ID;
        }
        ksort($translations);
        $variants = array();
        $groupMembers = array();
        foreach ($translations as $languageCode => $postId) {
            $postId = absint($postId);
            if ($postId < 1 || !get_post($postId)) {
                continue;
            }
            $locale = self::normalizeLocale($languageCode);
            $groupMembers[$locale] = $postId;
            $variants[] = self::variant($locale, sanitize_key((string) $languageCode), $postId);
        }
        $encoded = wp_json_encode($groupMembers, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        return array(
            'provider' => 'polylang',
            'groupId' => $post->post_type . ':' . hash('sha256', is_string($encoded) ? $encoded : ''),
            'currentLocale' => $current,
            'defaultLocale' => $default,
            'variants' => $variants,
        );
    }

    /** @return array<string,mixed>|null */
    private static function describeWpml(\WP_Post $post): ?array
    {
        $elementType = sanitize_key((string) apply_filters('wpml_element_type', $post->post_type));
        $trid = absint(apply_filters('wpml_element_trid', null, (int) $post->ID, $elementType));
        $details = apply_filters('wpml_post_language_details', null, (int) $post->ID);
        if ($trid < 1 || !is_array($details)) {
            return null;
        }
        $current = self::normalizeLocale($details['language_code'] ?? $details['locale'] ?? '');
        $default = self::normalizeLocale(apply_filters('wpml_default_language', null));
        $translations = apply_filters('wpml_get_element_translations', array(), $trid, $elementType);
        $variants = array();
        foreach (is_array($translations) ? $translations : array() as $languageCode => $translation) {
            $postId = absint(is_object($translation)
                ? ($translation->element_id ?? 0)
                : ($translation['element_id'] ?? 0));
            if ($postId < 1 || !get_post($postId)) {
                continue;
            }
            $code = sanitize_key((string) (is_object($translation)
                ? ($translation->language_code ?? $languageCode)
                : ($translation['language_code'] ?? $languageCode)));
            $variants[] = self::variant(self::normalizeLocale($code), $code, $postId);
        }
        if ($variants === array()) {
            $variants[] = self::variant($current, $current, (int) $post->ID);
        }
        usort($variants, static fn(array $left, array $right): int => strcmp($left['locale'], $right['locale']));
        return array(
            'provider' => 'wpml',
            'groupId' => $elementType . ':' . $trid,
            'currentLocale' => $current,
            'defaultLocale' => $default,
            'variants' => $variants,
        );
    }

    /** @return array{locale:string,languageCode:string,postId:int,title:string,url:string,status:string} */
    private static function variant(string $locale, string $languageCode, int $postId): array
    {
        $candidate = get_post($postId);
        return array(
            'locale' => self::normalizeLocale($locale),
            'languageCode' => sanitize_key($languageCode),
            'postId' => $postId,
            'title' => $candidate instanceof \WP_Post ? wp_strip_all_tags(get_the_title($candidate)) : '',
            'url' => (string) get_permalink($postId),
            'status' => $candidate instanceof \WP_Post ? (string) $candidate->post_status : '',
        );
    }

    private static function siteLocale(): string
    {
        return self::normalizeLocale(function_exists('get_locale') ? get_locale() : 'en');
    }
}
