<?php
/** Opt-in, registered own-field projection; never a dump of post metadata. */
namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

if (!defined('ABSPATH')) { exit; }

final class KnowledgeSyncStructuredContent
{
    public const MAX_FIELDS = 32;
    public const MAX_TEXT_BYTES = 4096;
    public const MAX_DESCRIPTION_BYTES = 512;
    public const MAX_LIST_ITEMS = 64;
    public const MAX_PAYLOAD_BYTES = 8192;
    private const TYPES = array('string', 'url', 'number', 'boolean', 'string-list');
    private const POST_FIELDS = array('featuredImageUrl' => 'url', 'featuredImageAlt' => 'string', 'excerpt' => 'string');

    private static function sourceIdentity(array $field): string
    {
        return isset($field['sourcePostField']) ? 'post:' . $field['sourcePostField'] : 'meta:' . $field['sourceMetaKey'];
    }

    public static function targetKeyAllowed(string $key): bool
    {
        return preg_match('/^[a-z][a-z0-9_]{0,63}$/D', $key) === 1 &&
            !in_array($key, array('identity', 'entity_ref', 'entity_type', 'entity_post_id', 'schema_version',
                'site_id', 'workspace_id', 'environment', 'blog_id', 'post_type', 'post_id', 'release_id',
                'release_version', 'profile', 'locale', 'language', 'title', 'canonical_url', 'url', 'source_url',
                'source_id', 'source_version', 'category', 'subcategory', 'category_paths', 'tags', 'taxonomy_terms',
                'taxonomies', 'metadata', 'fields', 'field_schema', 'enabled', 'constructor', 'prototype', '__proto__'), true) &&
            preg_match('/^(source|site|workspace|release|taxonomy)_/', $key) !== 1;
    }

    /** Only schema information is returned. No metadata values are read here. */
    public static function candidates(string $post_type): array
    {
        $registered = function_exists('get_registered_meta_keys') ? array_replace(get_registered_meta_keys('post'), get_registered_meta_keys('post', $post_type)) : array();
        $result = array();
        foreach ($registered as $key => $args) {
            if (!is_string($key) || preg_match('/^[A-Za-z0-9_-]{1,191}$/D', $key) !== 1 ||
                in_array($key, array('__proto__', 'constructor', 'prototype'), true) || !is_array($args) || empty($args['single']) || empty($args['show_in_rest']) ||
                preg_match('/(?:password|secret|credential|token|api[_-]?key|private[_-]?key)/i', $key)) { continue; }
            $rest = is_array($args['show_in_rest']) ? $args['show_in_rest'] : array();
            $schema = is_array($rest['schema'] ?? null) ? $rest['schema'] : array();
            if (!empty($schema['writeOnly'])) { continue; }
            $type = $schema['type'] ?? ($args['type'] ?? null);
            $type = match ($type) {
                'string' => in_array($schema['format'] ?? '', array('uri', 'url'), true) ? 'url' : 'string',
                'integer', 'number' => 'number',
                'boolean' => 'boolean',
                'array' => ($schema['items']['type'] ?? null) === 'string' ? 'string-list' : null,
                default => null,
            };
            if ($type === null) { continue; }
            $description = $args['description'] ?? '';
            $description = is_string($description) && strlen($description) <= self::MAX_DESCRIPTION_BYTES ? $description : '';
            $result[$key] = array('sourceMetaKey' => $key, 'type' => $type, 'description' => $description);
        }
        ksort($result, SORT_STRING);
        // These are fixed schema candidates, not values or arbitrary WP properties.
        foreach (self::POST_FIELDS as $name => $type) {
            $supported = $name === 'excerpt' ? 'excerpt' : 'thumbnail';
            if (!function_exists('post_type_supports') || !post_type_supports($post_type, $supported)) { continue; }
            $description = match ($name) {
                'featuredImageUrl' => 'Full URL of the publicly visible featured image, if present.',
                'featuredImageAlt' => 'Authored plain-text alternative text of the featured image, if present.',
                'excerpt' => 'Authored plain-text post excerpt; never generated from the body.',
            };
            $result['post:' . $name] = array('sourcePostField' => $name, 'type' => $type, 'description' => $description);
        }
        return array_values($result);
    }

    public static function normalizePolicy(string $post_type, mixed $input, bool $check_registration = false): array
    {
        if (!is_array($input) || array_diff(array_keys($input), array('enabled', 'fields')) !== array() ||
            !is_bool($input['enabled'] ?? null) || !is_array($input['fields'] ?? null) || !array_is_list($input['fields']) ||
            count($input['fields']) > self::MAX_FIELDS) {
            throw new \InvalidArgumentException('Invalid structured-content policy.');
        }
        $candidates = array();
        if ($check_registration && $input['enabled']) {
            foreach (self::candidates($post_type) as $candidate) { $candidates[self::sourceIdentity($candidate)] = $candidate; }
        }
        $fields = array();
        $sources = array();
        foreach ($input['fields'] as $field) {
            if (!is_array($field) || array_diff(array_keys($field), array('sourceMetaKey', 'sourcePostField', 'targetKey', 'type', 'description')) !== array() ||
                array_key_exists('sourcePostField', $field) === array_key_exists('sourceMetaKey', $field) || !is_string($field['targetKey'] ?? null) ||
                !self::targetKeyAllowed($field['targetKey']) || !in_array($field['type'] ?? null, self::TYPES, true) ||
                !is_string($field['description'] ?? null) || trim($field['description']) === '' || strlen($field['description']) > self::MAX_DESCRIPTION_BYTES ||
                preg_match('//u', $field['description']) !== 1 || isset($fields[$field['targetKey']])) {
                throw new \InvalidArgumentException('Invalid or duplicate structured-content field mapping.');
            }
            if (array_key_exists('sourcePostField', $field)) {
                if (!is_string($field['sourcePostField']) || !isset(self::POST_FIELDS[$field['sourcePostField']]) || self::POST_FIELDS[$field['sourcePostField']] !== $field['type']) {
                    throw new \InvalidArgumentException('Invalid native post-field mapping.');
                }
            } elseif (!is_string($field['sourceMetaKey']) || preg_match('/^[A-Za-z0-9_-]{1,191}$/D', $field['sourceMetaKey']) !== 1 || in_array($field['sourceMetaKey'], array('__proto__', 'constructor', 'prototype'), true)) {
                throw new \InvalidArgumentException('Invalid source metadata key.');
            }
            $source = self::sourceIdentity($field);
            if (isset($sources[$source])) { throw new \InvalidArgumentException('Duplicate field source.'); }
            $candidate = $candidates[$source] ?? null;
            // A string registration may deliberately be narrowed to an HTTP(S) URL.
            if ($check_registration && $input['enabled'] && ($candidate === null || ($candidate['type'] !== $field['type'] && !($candidate['type'] === 'string' && $field['type'] === 'url')))) {
                throw new \InvalidArgumentException('Structured-content field is not a compatible registered readable field.');
            }
            $fields[$field['targetKey']] = $field;
            $sources[$source] = true;
        }
        ksort($fields, SORT_STRING);
        return array('enabled' => $input['enabled'], 'fields' => array_values($fields));
    }

    /** A narrowing operation never grants access to a new field or changes its semantics. */
    public static function isFieldRemoval(?array $previous, ?array $next): bool
    {
        if (empty($previous['enabled']) || empty($next['enabled']) ||
            count($next['fields']) >= count($previous['fields'])) {
            return false;
        }
        $existing = array_column($previous['fields'], null, 'targetKey');
        foreach ($next['fields'] as $field) {
            $old = $existing[$field['targetKey']] ?? null;
            if ($old === null) { return false; }
            foreach (array('sourceMetaKey', 'sourcePostField', 'targetKey', 'type', 'description') as $key) {
                if (($old[$key] ?? null) !== ($field[$key] ?? null)) { return false; }
            }
        }
        return true;
    }

    public static function project(int $post_id, string $post_type, array $policy): array
    {
        try { $policy = self::normalizePolicy($post_type, $policy, true); }
        catch (\InvalidArgumentException $error) {
            throw new KnowledgeSyncProjectionException('structured_content_policy_invalid', 'Selected structured-content policy is invalid.');
        }
        $fields = array();
        $schema = array();
        if ($policy['enabled']) {
            foreach ($policy['fields'] as $field) {
                $schema[$field['targetKey']] = array('type' => $field['type'], 'description' => $field['description']);
                if (isset($field['sourcePostField'])) {
                    $value = self::nativeValue($post_id, $field['sourcePostField']);
                    if ($value === null || $value === '') { continue; }
                } else {
                    $key = $field['sourceMetaKey'];
                    if (!metadata_exists('post', $post_id, $key)) { continue; }
                    $value = get_post_meta($post_id, $key, true);
                    $value = self::decodeStorageValue($value, $field['type'], $post_type, $key);
                }
                // An explicitly cleared optional URL is absent, not a stale URL.
                if ($field['type'] === 'url' && $value === '') { continue; }
                self::validateValue($value, $field['type']);
                $fields[$field['targetKey']] = $value;
            }
        }
        $payload = array('schemaVersion' => 1, 'enabled' => $policy['enabled'], 'fields' => (object) $fields, 'fieldSchema' => (object) $schema);
        $encoded = wp_json_encode(array('fields' => $payload['fields'], 'fieldSchema' => $payload['fieldSchema']), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($encoded) || strlen($encoded) > self::MAX_PAYLOAD_BYTES) {
            throw new KnowledgeSyncProjectionException('structured_content_too_large', 'Structured-content field payload exceeds its byte budget.');
        }
        return $payload;
    }

    private static function nativeValue(int $post_id, string $field): ?string
    {
        if ($field === 'excerpt') {
            $post = get_post($post_id);
            return $post instanceof \WP_Post && is_string($post->post_excerpt ?? null) ? self::plainText($post->post_excerpt) : null;
        }
        $attachment_id = (int) get_post_thumbnail_id($post_id);
        $attachment = $attachment_id > 0 ? get_post($attachment_id) : null;
        if (!$attachment instanceof \WP_Post || $attachment->post_type !== 'attachment' ||
            !in_array($attachment->post_status, array('inherit', 'publish'), true) || !empty($attachment->post_password) || !wp_attachment_is_image($attachment_id)) { return null; }
        // An inherited image belonging to private/draft/password-protected content is not approved public evidence.
        if ($attachment->post_status === 'inherit' && !empty($attachment->post_parent)) {
            $parent = get_post((int) $attachment->post_parent);
            if (!$parent instanceof \WP_Post || $parent->post_status !== 'publish' || !empty($parent->post_password) ||
                (function_exists('is_post_publicly_viewable') && !is_post_publicly_viewable($parent))) { return null; }
        }
        $url = wp_get_attachment_image_url($attachment_id, 'full');
        if ($field === 'featuredImageAlt') {
            if (!is_string($url) || $url === '' || !self::urlAllowed($url)) { return null; }
            $alt = get_post_meta($attachment_id, '_wp_attachment_image_alt', true);
            return is_string($alt) ? self::plainText($alt) : null;
        }
        return is_string($url) && $url !== '' ? $url : null;
    }

    private static function plainText(string $value): string
    {
        return trim(wp_strip_all_tags(html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8')));
    }

    /** WordPress stores scalar metadata as strings; decode only the registered scalar storage representation. */
    private static function decodeStorageValue(mixed $value, string $type, string $post_type, string $key): mixed
    {
        if (!in_array($type, array('number', 'boolean'), true)) { return $value; }
        $registered = array_replace(get_registered_meta_keys('post'), get_registered_meta_keys('post', $post_type));
        $args = $registered[$key] ?? array();
        $rest = is_array($args['show_in_rest'] ?? null) ? $args['show_in_rest'] : array();
        $registered_type = $rest['schema']['type'] ?? ($args['type'] ?? null);
        if ($type === 'boolean' && $registered_type === 'boolean') {
            return match ($value) { '1' => true, '' => false, default => $value };
        }
        if ($type === 'number' && in_array($registered_type, array('integer', 'number'), true)) {
            if (is_string($value) && preg_match('/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/D', $value) === 1) {
                $value = json_decode($value);
            }
            if (!(is_int($value) || is_float($value)) || !is_finite((float) $value) ||
                abs((float) $value) > 9007199254740991 ||
                ($registered_type === 'integer' && floor((float) $value) !== (float) $value)) {
                throw new KnowledgeSyncProjectionException('structured_content_value_invalid', 'Selected numeric field is not a finite safely represented registered number.');
            }
        }
        return $value;
    }

    private static function validateValue(mixed $value, string $type): void
    {
        $text = static fn(mixed $item): bool => is_string($item) && strlen($item) <= self::MAX_TEXT_BYTES && preg_match('//u', $item) === 1;
        $valid = match ($type) {
            'string' => $text($value),
            'url' => $text($value) && self::urlAllowed($value),
            'number' => (is_int($value) || is_float($value)) && is_finite((float) $value),
            'boolean' => is_bool($value),
            'string-list' => is_array($value) && array_is_list($value) && count($value) <= self::MAX_LIST_ITEMS && count(array_filter($value, $text)) === count($value),
            default => false,
        };
        if (!$valid) {
            throw new KnowledgeSyncProjectionException('structured_content_value_invalid', 'Selected structured-content field has an invalid value.');
        }
    }

    private static function urlAllowed(string $value): bool
    {
        $parts = wp_parse_url($value);
        return preg_match('/[\x00-\x20\x7F]/', $value) !== 1 && filter_var($value, FILTER_VALIDATE_URL) !== false && is_array($parts) &&
            in_array(strtolower($parts['scheme'] ?? ''), array('https', 'http'), true) && !empty($parts['host']) &&
            !isset($parts['user']) && !isset($parts['pass']);
    }
}
