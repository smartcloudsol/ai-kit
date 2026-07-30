<?php
/**
 * SmartCloud AI-Kit native WordPress Abilities API provider.
 *
 * @package smartcloud-ai-kit
 */

namespace SmartCloud\WPSuite\AiKit\Abilities;

use SmartCloud\WPSuite\Hub\Abilities\Product_Provider_Base;
use WP_Error;

if (!defined('ABSPATH')) {
    exit;
}

final class Provider extends Product_Provider_Base
{
    /** @var string[] */
    private array $components = array('feature', 'doc-search', 'kb-section');

    /** @var string[] */
    private array $blocks = array(
        'smartcloud-ai-kit/feature',
        'smartcloud-ai-kit/doc-search',
        'smartcloud-ai-kit/kb-section',
    );

    private string $plugin_path;

    public function __construct()
    {
        $this->plugin_path = defined('SMARTCLOUD_AI_KIT_PATH') ? SMARTCLOUD_AI_KIT_PATH : dirname(__DIR__) . '/';

        parent::__construct(
            'smartcloud-ai-kit',
            'SmartCloud AI-Kit',
            'smartcloud-ai-kit',
            'smartcloud-ai-kit',
            '1.0.0',
            defined('SMARTCLOUD_AI_KIT_VERSION') ? SMARTCLOUD_AI_KIT_VERSION : '',
            'smartcloud-ai-kit',
            array('smartcloud-ai-kit/')
        );
    }

    protected function extra_abilities(): array
    {
        return array(
            array(
                'suffix' => 'list-knowledge-metadata',
                'description' => 'Return safe configured AI-Kit knowledge metadata vocabulary.',
                'method' => 'list_knowledge_metadata',
                'input_schema' => $this->empty_input_schema(),
            ),
        );
    }

    public function get_runtime_capabilities(array $input = array()): array
    {
        $block_status = $this->block_registration_status($this->blocks);
        $metadata = $this->knowledge_metadata();
        $missing = array();

        foreach ($block_status as $block_name => $registered) {
            if (!$registered) {
                $missing[] = 'block-not-registered:' . $block_name;
            }
        }

        return array(
            'provider' => $this->provider_id,
            'provider_version' => $this->plugin_version,
            'contract_version' => $this->contract_version,
            'components' => $this->components,
            'block_registration' => $block_status,
            'readiness' => array(
                'block_materialization' => empty($missing),
                'local_on_device_ai' => 'browser-check-required',
                'backend_ai' => $this->backend_ready_state(),
                'frontend_prompt_routes' => 'configured-client-side',
                'admin_routes' => class_exists('\WP_REST_Controller') ? 'available' : 'unavailable',
                'knowledge_base' => $metadata['status'],
                'metadata_filters' => $metadata['status'],
            ),
            'runtime_ready' => empty($missing),
            'missing_requirements' => $missing,
            'warnings' => array(),
        );
    }

    public function list_components(array $input = array()): array
    {
        $items = array();
        foreach ($this->components as $component) {
            $contract = $this->component_contract($component);
            $items[] = array(
                'id' => $component,
                'label' => $contract['label'],
                'block_names' => $contract['block_names'],
                'required_registered_block_types' => $contract['block_names'],
                'materializable' => true,
            );
        }

        return array(
            'provider' => $this->provider_id,
            'contract_version' => $this->contract_version,
            'components' => $items,
        );
    }

    public function get_component_schema(array $input): array|WP_Error
    {
        $component = sanitize_key((string) ($input['component'] ?? ''));
        if (!in_array($component, $this->components, true)) {
            return new WP_Error('smartcloud_ai_kit_component_not_available', __('Unknown AI-Kit component.', 'smartcloud-ai-kit'));
        }

        return array(
            'provider' => $this->provider_id,
            'contract_version' => $this->contract_version,
            'component' => $component,
            'semantic_schema' => array(
                'type' => 'object',
                'description' => 'AI-Kit semantic attributes. Fixed block attributes are derived from the current block.json files.',
                'additionalProperties' => true,
            ),
            'block_contract' => $this->component_contract($component),
        );
    }

    public function materialize_component(array $input): array|WP_Error
    {
        $component = sanitize_key((string) ($input['component'] ?? ''));
        if (!in_array($component, $this->components, true)) {
            return new WP_Error('smartcloud_ai_kit_component_not_available', __('Unknown AI-Kit component.', 'smartcloud-ai-kit'));
        }

        $spec = is_array($input['spec'] ?? null) ? $input['spec'] : array();
        $block_name = $this->component_block_name($component);
        $attrs = $this->filter_attrs($this->plugin_path, $block_name, $spec);

        if ($component === 'feature') {
            $mode = (string) ($attrs['mode'] ?? 'summarize');
            if (!in_array($mode, $this->supported_feature_modes(), true)) {
                return new WP_Error('smartcloud_ai_kit_invalid_mode', __('Unknown AI-Kit feature mode.', 'smartcloud-ai-kit'));
            }
            $attrs['mode'] = $mode;
        }

        if (in_array($component, array('doc-search', 'kb-section'), true)) {
            $metadata_error = $this->validate_metadata_attrs($attrs);
            if (is_wp_error($metadata_error)) {
                return $metadata_error;
            }
        }

        $runtime = $this->get_runtime_capabilities();

        return $this->materialization_result(
            $component,
            array($this->block($block_name, $attrs)),
            (bool) $runtime['runtime_ready'],
            $runtime['missing_requirements'],
            $runtime['warnings']
        );
    }

    public function validate_block_tree(array $input): array
    {
        $blocks = is_array($input['blocks'] ?? null) ? $input['blocks'] : array();
        $errors = array();
        $this->validate_nodes($blocks, '', $errors);

        return $this->validation_result($blocks, $errors);
    }

    public function list_knowledge_metadata(array $input = array()): array
    {
        return array(
            'provider' => $this->provider_id,
            'contract_version' => $this->contract_version,
            'knowledge_metadata' => $this->knowledge_metadata(),
        );
    }

    private function validate_nodes(array $blocks, string $path, array &$errors): void
    {
        if ($this->count_blocks($blocks) > 500) {
            $errors[] = $this->validation_issue('smartcloud_ai_kit_block_tree_too_large', 'The AI-Kit block tree exceeds the provider block limit.', $path);
            return;
        }

        foreach ($blocks as $index => $block) {
            $current_path = $path . '/' . $index;
            if (!is_array($block)) {
                $errors[] = $this->validation_issue('smartcloud_ai_kit_invalid_block', 'Block node must be an object.', $current_path);
                continue;
            }

            $name = (string) ($block['blockName'] ?? '');
            if (!in_array($name, $this->blocks, true)) {
                $errors[] = $this->validation_issue('smartcloud_ai_kit_unknown_block', 'Only current AI-Kit blocks are accepted.', $current_path);
                continue;
            }

            $attrs = is_array($block['attrs'] ?? null) ? $block['attrs'] : array();
            foreach (array_keys($attrs) as $attr) {
                if (!in_array($attr, array_keys($this->block_attributes($this->plugin_path, $name)), true) && !in_array($attr, array('anchor', 'className', 'style', 'lock'), true)) {
                    $errors[] = $this->validation_issue('smartcloud_ai_kit_unknown_attribute', 'Unknown AI-Kit block attribute.', $current_path . '/attrs/' . $attr);
                }
            }

            if ($name === 'smartcloud-ai-kit/feature' && isset($attrs['mode']) && !in_array((string) $attrs['mode'], $this->supported_feature_modes(), true)) {
                $errors[] = $this->validation_issue('smartcloud_ai_kit_invalid_mode', 'Unknown AI-Kit feature mode.', $current_path . '/attrs/mode');
            }

            $metadata_error = $this->validate_metadata_attrs($attrs);
            if (is_wp_error($metadata_error)) {
                $errors[] = $this->validation_issue($metadata_error->get_error_code(), $metadata_error->get_error_message(), $current_path . '/attrs');
            }

            $this->validate_nodes(is_array($block['innerBlocks'] ?? null) ? $block['innerBlocks'] : array(), $current_path . '/innerBlocks', $errors);
        }
    }

    private function validate_metadata_attrs(array $attrs): bool|WP_Error
    {
        $metadata = $this->knowledge_metadata();
        if ($metadata['status'] !== 'ready') {
            return true;
        }

        foreach (array('category', 'subcategory') as $field) {
            if (!empty($attrs[$field]) && !in_array((string) $attrs[$field], array_column($metadata[$field . 's'], 'id'), true)) {
                return new WP_Error('smartcloud_ai_kit_unknown_metadata', sprintf('Unknown AI-Kit KB %s.', $field));
            }
        }

        foreach ((array) ($attrs['tags'] ?? array()) as $tag) {
            if (!in_array((string) $tag, array_column($metadata['tags'], 'id'), true)) {
                return new WP_Error('smartcloud_ai_kit_unknown_metadata', __('Unknown AI-Kit KB tag.', 'smartcloud-ai-kit'));
            }
        }

        return true;
    }

    private function knowledge_metadata(): array
    {
        global $wpdb;

        $cache_group = 'smartcloud_ai_kit_abilities';
        $db_version = (string) get_option('smartcloud_ai_kit_db_version', '0');
        $cache_key = 'knowledge_metadata_' . md5($db_version);
        $cached = wp_cache_get($cache_key, $cache_group);
        if (is_array($cached)) {
            return $cached;
        }

        if ($db_version === '0') {
            $metadata = array(
                'status' => 'metadata-feature-unavailable',
                'categories' => array(),
                'subcategories' => array(),
                'tags' => array(),
                'limit' => 200,
            );
            wp_cache_set($cache_key, $metadata, $cache_group, 5 * MINUTE_IN_SECONDS);
            return $metadata;
        }

        $table = $wpdb->prefix . 'smartcloud_ai_kit_kb_generated';
        $previous_suppress = $wpdb->suppress_errors(true);
        try {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom AI-Kit KB metadata table has no WordPress core API; result is cached with wp_cache_get/wp_cache_set.
            $rows = $wpdb->get_results(
                $wpdb->prepare('SELECT category, subcategory, tags_json FROM %i LIMIT 500', $table),
                ARRAY_A
            );
        } finally {
            $wpdb->suppress_errors($previous_suppress);
        }

        if (!is_array($rows)) {
            $metadata = array(
                'status' => 'metadata-feature-unavailable',
                'categories' => array(),
                'subcategories' => array(),
                'tags' => array(),
                'limit' => 200,
            );
            wp_cache_set($cache_key, $metadata, $cache_group, 5 * MINUTE_IN_SECONDS);
            return $metadata;
        }

        $categories = array();
        $subcategories = array();
        $tags = array();

        foreach (is_array($rows) ? $rows : array() as $row) {
            $this->add_vocab_value($categories, (string) ($row['category'] ?? ''));
            $this->add_vocab_value($subcategories, (string) ($row['subcategory'] ?? ''));
            $decoded_tags = json_decode((string) ($row['tags_json'] ?? '[]'), true);
            foreach (is_array($decoded_tags) ? $decoded_tags : array() as $tag) {
                $this->add_vocab_value($tags, (string) $tag);
            }
        }

        $ready = !empty($categories) || !empty($subcategories) || !empty($tags);

        $metadata = array(
            'status' => $ready ? 'ready' : 'configured-but-empty',
            'categories' => array_values($categories),
            'subcategories' => array_values($subcategories),
            'tags' => array_values($tags),
            'limit' => 200,
        );
        wp_cache_set($cache_key, $metadata, $cache_group, 5 * MINUTE_IN_SECONDS);

        return $metadata;
    }

    private function add_vocab_value(array &$target, string $value): void
    {
        $value = trim($value);
        if ($value === '' || count($target) >= 200) {
            return;
        }
        $target[$value] = array(
            'id' => $value,
            'label' => $value,
        );
    }

    private function component_contract(string $component): array
    {
        $block_name = $this->component_block_name($component);

        return array(
            'label' => match ($component) {
                'feature' => 'AI Feature',
                'doc-search' => 'Doc Search',
                default => 'KB Section',
            },
            'block_names' => array($block_name),
            'attributes' => array(
                $block_name => $this->block_attributes($this->plugin_path, $block_name),
            ),
        );
    }

    private function component_block_name(string $component): string
    {
        return match ($component) {
            'feature' => 'smartcloud-ai-kit/feature',
            'doc-search' => 'smartcloud-ai-kit/doc-search',
            default => 'smartcloud-ai-kit/kb-section',
        };
    }

    /**
     * Resolve the public feature block to its historical ai-feature build directory.
     *
     * The registered block name intentionally remains smartcloud-ai-kit/feature,
     * while its source/build folder predates that public slug.
     */
    protected function block_attributes(string $plugin_path, string $block_name): array
    {
        if ($block_name === 'smartcloud-ai-kit/feature') {
            $metadata = $this->block_metadata($plugin_path, 'ai-feature');
            return is_array($metadata['attributes'] ?? null) ? $metadata['attributes'] : array();
        }

        return parent::block_attributes($plugin_path, $block_name);
    }

    /**
     * @return string[]
     */
    private function supported_feature_modes(): array
    {
        return array('summarize', 'proofread', 'write', 'rewrite', 'translate');
    }

    private function backend_ready_state(): string
    {
        return class_exists('\WP_REST_Controller') ? 'configured-client-side-or-backend-check-required' : 'unavailable';
    }
}

(new Provider())->bootstrap();
