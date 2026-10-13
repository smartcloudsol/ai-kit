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
    public const MAX_DOCUMENT_BYTES = 65536;
    public const MAX_DEPTH = 8;
    public const MAX_SCHEMA_NODES = 128;
    public const MAX_VALUE_NODES = 2048;
    private const TYPES = array('string', 'url', 'number', 'boolean', 'string-list', 'object', 'array');
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
            $schema['type'] = $schema['type'] ?? ($args['type'] ?? null);
            $schema['description'] = $schema['description'] ?? ($args['description'] ?? '');
            try {
                $nodes = 0;
                $normalized = self::registeredSchema($schema, $key, $nodes);
            } catch (\InvalidArgumentException $error) { continue; }
            $result[$key] = array_merge(array('sourceMetaKey' => $key), self::wireSchema($normalized));
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

    private static function nestedKeyAllowed(string $key): bool
    {
        return preg_match('/^[a-z][a-z0-9_]{0,63}$/D', $key) === 1 &&
            !in_array($key, array('__proto__', 'constructor', 'prototype'), true);
    }

    /** Registered schemas are closed, explicitly typed data - never inferred from values. */
    private static function registeredSchema(array $schema, string $name, int &$nodes, int $depth = 1): array
    {
        if (++$nodes > self::MAX_SCHEMA_NODES || $depth > self::MAX_DEPTH || !empty($schema['writeOnly']) ||
            array_intersect(array_keys($schema), array('$ref', 'oneOf', 'anyOf', 'allOf', 'not', 'patternProperties')) !== array()) {
            throw new \InvalidArgumentException('Unsupported registered structured-content schema.');
        }
        $description = $schema['description'] ?? '';
        if (!is_string($description) || trim($description) === '' || strlen($description) > self::MAX_DESCRIPTION_BYTES || preg_match('//u', $description) !== 1) {
            $description = 'Registered ' . $name . ' field.';
        }
        $type = match ($schema['type'] ?? null) {
            'string' => in_array($schema['format'] ?? '', array('uri', 'url'), true) ? 'url' : 'string',
            'integer', 'number' => 'number',
            'boolean' => 'boolean',
            'object' => 'object',
            'array' => 'array',
            default => null,
        };
        if ($type === null) { throw new \InvalidArgumentException('Untyped registered structured-content schema.'); }
        $result = array('type' => $type, 'description' => $description);
        if ($type === 'object') {
            if (($schema['additionalProperties'] ?? null) !== false || !is_array($schema['properties'] ?? null) ||
                count($schema['properties']) > self::MAX_FIELDS) {
                throw new \InvalidArgumentException('Registered objects must declare bounded, closed properties.');
            }
            $properties = array();
            foreach ($schema['properties'] as $key => $child) {
                if (!is_string($key) || !is_array($child)) {
                    throw new \InvalidArgumentException('Invalid registered object property.');
                }
                if (preg_match('/(?:password|secret|credential|token|api[_-]?key|private[_-]?key)/i', $key) || !empty($child['writeOnly'])) { continue; }
                if (!self::nestedKeyAllowed($key)) { throw new \InvalidArgumentException('Invalid registered object property.'); }
                $properties[$key] = self::registeredSchema($child, $key, $nodes, $depth + 1);
            }
            ksort($properties, SORT_STRING);
            $result['properties'] = $properties;
        } elseif ($type === 'array') {
            if (!is_array($schema['items'] ?? null) || array_is_list($schema['items'])) {
                throw new \InvalidArgumentException('Registered arrays must declare one typed item schema.');
            }
            // Keep existing string arrays on the legacy scalar/string-list contract.
            $child = self::registeredSchema($schema['items'], $name . ' item', $nodes, $depth + 1);
            if ($child['type'] === 'string') { $result['type'] = 'string-list'; }
            else { $result['items'] = $child; }
        }
        return $result;
    }

    private static function propertyMap(mixed $value): array
    {
        if ($value instanceof \stdClass && get_class($value) === \stdClass::class) { $value = get_object_vars($value); }
        if (!is_array($value) || (count($value) > 0 && array_is_list($value)) || count($value) > self::MAX_FIELDS) {
            throw new \InvalidArgumentException('Invalid structured-content object properties.');
        }
        foreach (array_keys($value) as $key) {
            if (!is_string($key) || !self::nestedKeyAllowed($key)) { throw new \InvalidArgumentException('Invalid structured-content object property name.'); }
        }
        return $value;
    }

    private static function normalizeSchema(mixed $schema, int &$nodes, int $depth = 1): array
    {
        if (!is_array($schema) || ++$nodes > self::MAX_SCHEMA_NODES || $depth > self::MAX_DEPTH ||
            !in_array($schema['type'] ?? null, self::TYPES, true) || !is_string($schema['description'] ?? null) ||
            trim($schema['description']) === '' || strlen($schema['description']) > self::MAX_DESCRIPTION_BYTES || preg_match('//u', $schema['description']) !== 1) {
            throw new \InvalidArgumentException('Invalid structured-content field schema.');
        }
        $allowed = array('type', 'description');
        if ($schema['type'] === 'object') { $allowed[] = 'properties'; }
        if ($schema['type'] === 'array') { $allowed[] = 'items'; }
        if (array_diff(array_keys($schema), $allowed) !== array() || array_diff($allowed, array_keys($schema)) !== array()) {
            throw new \InvalidArgumentException('Unexpected structured-content schema properties.');
        }
        $result = array('type' => $schema['type'], 'description' => $schema['description']);
        if ($schema['type'] === 'object') {
            $properties = array();
            foreach (self::propertyMap($schema['properties']) as $key => $child) {
                $properties[$key] = self::normalizeSchema($child, $nodes, $depth + 1);
            }
            ksort($properties, SORT_STRING);
            $result['properties'] = $properties;
        } elseif ($schema['type'] === 'array') { $result['items'] = self::normalizeSchema($schema['items'], $nodes, $depth + 1); }
        return $result;
    }

    /** Descriptions are authored semantics; registration checks only readable names/types. */
    private static function compatibleSchema(array $registered, array $selected): bool
    {
        if ($registered['type'] !== $selected['type']) { return $registered['type'] === 'string' && $selected['type'] === 'url'; }
        if ($selected['type'] === 'object') {
            $available = (array) $registered['properties'];
            foreach ($selected['properties'] as $key => $child) {
                if (!isset($available[$key]) || !self::compatibleSchema($available[$key], $child)) { return false; }
            }
        } elseif ($selected['type'] === 'array') { return self::compatibleSchema($registered['items'], $selected['items']); }
        return true;
    }

    /** JSON maps must remain objects even when every selected value is absent. */
    private static function wireSchema(array $schema): array
    {
        if ($schema['type'] === 'object') {
            $properties = array();
            foreach ((array) $schema['properties'] as $key => $child) { $properties[$key] = self::wireSchema($child); }
            $schema['properties'] = (object) $properties;
        } elseif ($schema['type'] === 'array') { $schema['items'] = self::wireSchema($schema['items']); }
        return $schema;
    }

    public static function requiresDocumentV2(array $policy): bool
    {
        foreach ($policy['fields'] ?? array() as $field) {
            if (in_array($field['type'] ?? null, array('object', 'array'), true)) { return true; }
        }
        return false;
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
        $schema_nodes = 0;
        foreach ($input['fields'] as $field) {
            if (!is_array($field) || array_diff(array_keys($field), array('sourceMetaKey', 'sourcePostField', 'targetKey', 'type', 'description', 'properties', 'items')) !== array() ||
                array_key_exists('sourcePostField', $field) === array_key_exists('sourceMetaKey', $field) || !is_string($field['targetKey'] ?? null) ||
                !self::targetKeyAllowed($field['targetKey']) || !in_array($field['type'] ?? null, self::TYPES, true) ||
                !is_string($field['description'] ?? null) || trim($field['description']) === '' || strlen($field['description']) > self::MAX_DESCRIPTION_BYTES ||
                preg_match('//u', $field['description']) !== 1 || isset($fields[$field['targetKey']])) {
                throw new \InvalidArgumentException('Invalid or duplicate structured-content field mapping.');
            }
            $schema = self::normalizeSchema(array_intersect_key($field, array_flip(array('type', 'description', 'properties', 'items'))), $schema_nodes);
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
            if ($check_registration && $input['enabled'] && ($candidate === null || !self::compatibleSchema($candidate, $schema))) {
                throw new \InvalidArgumentException('Structured-content field is not a compatible registered readable field.');
            }
            $fields[$field['targetKey']] = array_merge(array_intersect_key($field, array_flip(array('sourceMetaKey', 'sourcePostField', 'targetKey'))), $schema);
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
            foreach (array('sourceMetaKey', 'sourcePostField', 'targetKey', 'type', 'description', 'properties', 'items') as $key) {
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
        $nested = $policy['enabled'] && self::requiresDocumentV2($policy);
        $value_nodes = 0;
        if ($policy['enabled']) {
            foreach ($policy['fields'] as $field) {
                $selected_schema = array_intersect_key($field, array_flip(array('type', 'description', 'properties', 'items')));
                $schema[$field['targetKey']] = self::wireSchema($selected_schema);
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
                $fields[$field['targetKey']] = self::projectValue($value, $selected_schema, $value_nodes, $nested);
            }
        }
        if ($nested && $value_nodes > self::MAX_VALUE_NODES) {
            throw new KnowledgeSyncProjectionException('structured_content_value_invalid', 'Structured-content values exceed their structural bounds.');
        }
        $payload = array('schemaVersion' => $nested ? 2 : 1, 'enabled' => $policy['enabled'], 'fields' => (object) $fields, 'fieldSchema' => (object) $schema);
        $encoded = wp_json_encode(array('fields' => $payload['fields'], 'fieldSchema' => $payload['fieldSchema']), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($encoded) || strlen($encoded) > ($nested ? self::MAX_DOCUMENT_BYTES : self::MAX_PAYLOAD_BYTES)) {
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
            'number' => (is_int($value) || is_float($value)) && is_finite((float) $value) && abs((float) $value) <= 9007199254740991,
            'boolean' => is_bool($value),
            'string-list' => is_array($value) && array_is_list($value) && count($value) <= self::MAX_LIST_ITEMS && count(array_filter($value, $text)) === count($value),
            default => false,
        };
        if (!$valid) {
            throw new KnowledgeSyncProjectionException('structured_content_value_invalid', 'Selected structured-content field has an invalid value.');
        }
    }

    private static function projectValue(mixed $value, array $schema, int &$nodes, bool $nested, int $depth = 1): mixed
    {
        if ((++$nodes > self::MAX_VALUE_NODES && $nested) || $depth > self::MAX_DEPTH) {
            throw new KnowledgeSyncProjectionException('structured_content_value_invalid', 'Structured-content values exceed their structural bounds.');
        }
        if ($schema['type'] === 'object') {
            if ($value instanceof \stdClass && get_class($value) === \stdClass::class) { $value = get_object_vars($value); }
            if (!is_array($value) || (count($value) > 0 && array_is_list($value))) {
                throw new KnowledgeSyncProjectionException('structured_content_value_invalid', 'Selected object field must contain a plain object.');
            }
            // Validate keys, but never traverse or serialize undeclared values.
            foreach (array_keys($value) as $key) {
                if (!is_string($key) || in_array($key, array('__proto__', 'constructor', 'prototype'), true)) {
                    throw new KnowledgeSyncProjectionException('structured_content_value_invalid', 'Selected object field contains an invalid property name.');
                }
            }
            $result = array();
            foreach ($schema['properties'] as $key => $child) {
                if (array_key_exists($key, $value)) { $result[$key] = self::projectValue($value[$key], $child, $nodes, $nested, $depth + 1); }
            }
            return (object) $result;
        }
        if ($schema['type'] === 'array' || $schema['type'] === 'string-list') {
            if (!is_array($value) || !array_is_list($value) || count($value) > self::MAX_LIST_ITEMS) {
                throw new KnowledgeSyncProjectionException('structured_content_value_invalid', 'Selected array field must contain a bounded dense list.');
            }
            $child = $schema['type'] === 'array' ? $schema['items'] : array('type' => 'string', 'description' => $schema['description']);
            $result = array();
            foreach ($value as $item) { $result[] = self::projectValue($item, $child, $nodes, $nested, $depth + 1); }
            return $result;
        }
        self::validateValue($value, $schema['type']);
        return $value;
    }

    private static function urlAllowed(string $value): bool
    {
        $parts = wp_parse_url($value);
        return preg_match('/[\x00-\x20\x7F]/', $value) !== 1 && filter_var($value, FILTER_VALIDATE_URL) !== false && is_array($parts) &&
            in_array(strtolower($parts['scheme'] ?? ''), array('https', 'http'), true) && !empty($parts['host']) &&
            !isset($parts['user']) && !isset($parts['pass']);
    }
}
