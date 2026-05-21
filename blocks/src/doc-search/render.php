<?php
if (!defined('ABSPATH')) {
  exit; // Exit if accessed directly.
}
$smartcloud_ai_kit_doc_search_hash = substr(md5(serialize($attributes)), 0, 6) . '_' . wp_rand();
$smartcloud_ai_kit_doc_search_bid = 'smartcloud_ai_kit_doc_search_' . $smartcloud_ai_kit_doc_search_hash;

// Encode all attributes into a single data-config attribute
$smartcloud_ai_kit_config = base64_encode(wp_json_encode($attributes));

// Build the attribute string
$smartcloud_ai_kit_div_attrs = [];
$smartcloud_ai_kit_div_attrs[] = 'data-smartcloud-ai-kit-doc-search';
$smartcloud_ai_kit_div_attrs[] = 'id="' . $smartcloud_ai_kit_doc_search_bid . '"';
$smartcloud_ai_kit_div_attrs[] = 'data-is-preview="smartcloud-ai-kit-is-preview"';
$smartcloud_ai_kit_div_attrs[] = 'data-config="' . esc_attr($smartcloud_ai_kit_config) . '"';

// Add block wrapper attributes
$smartcloud_ai_kit_div_attrs[] = get_block_wrapper_attributes();
?>
<div <?php echo wp_kses_data(implode(' ', $smartcloud_ai_kit_div_attrs)); ?>>
  <div style="display: none;">
    <?php echo esc_html($content); ?>
  </div>
</div>