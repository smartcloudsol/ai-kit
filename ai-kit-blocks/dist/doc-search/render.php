<?php
if (!defined('ABSPATH')) {
  exit; // Exit if accessed directly.
}
$smartcloud_ai_kit_doc_search_hash = substr(md5(serialize($attributes)), 0, 6) . '_' . wp_rand();
$smartcloud_ai_kit_doc_search_bid = 'smartcloud_ai_kit_doc_search_' . $smartcloud_ai_kit_doc_search_hash;
// Define the attributes and their default values if any
$smartcloud_ai_kit_attribute_map = [
  'title' => null,
  'autoRun' => null,
  'enableUserFilters' => null,
  'topK' => null,
  'snippetMaxChars' => null,
  'showOpenButton' => null,
  'openButtonTitle' => null,
  'showOpenButtonTitle' => null,
  'openButtonIcon' => null,
  'showOpenButtonIcon' => null,
  'showSearchButtonTitle' => null,
  'searchButtonIcon' => null,
  'showSearchButtonIcon' => null,
  'variation' => 'default',
  'language' => 'system',
  'direction' => 'auto',
  'colorMode' => 'light',
  'primaryColor' => null,
  'themeOverrides' => null,
  'configB64' => null,
  'configFormat' => null,
];

// Build the attribute string
$smartcloud_ai_kit_div_attrs = [];
$smartcloud_ai_kit_div_attrs[] = 'data-smartcloud-ai-kit-doc-search';
$smartcloud_ai_kit_div_attrs[] = 'id="' . $smartcloud_ai_kit_doc_search_bid . '"';
$smartcloud_ai_kit_div_attrs[] = 'data-is-preview="smartcloud-ai-kit-is-preview"';
foreach ($smartcloud_ai_kit_attribute_map as $smartcloud_ai_kit_key => $smartcloud_ai_kit_default) {
  if (array_key_exists($smartcloud_ai_kit_key, $attributes) || $smartcloud_ai_kit_default !== null) {
    $smartcloud_ai_kit_value = array_key_exists($smartcloud_ai_kit_key, $attributes) ? $attributes[$smartcloud_ai_kit_key] : $smartcloud_ai_kit_default;
    if ($smartcloud_ai_kit_key === 'themeOverrides' && is_string($smartcloud_ai_kit_value)) {
      $smartcloud_ai_kit_value = str_replace(["\r\n", "\r", "\n"], ' ', $smartcloud_ai_kit_value);
    }
    if (is_bool($smartcloud_ai_kit_value)) {
      $smartcloud_ai_kit_value = $smartcloud_ai_kit_value ? 'true' : 'false';
    } elseif (is_array($smartcloud_ai_kit_value) || is_object($smartcloud_ai_kit_value)) {
      $smartcloud_ai_kit_value = base64_encode(wp_json_encode($smartcloud_ai_kit_value));
    }
    // Convert camelCase to kebab-case, then replace underscores with hyphens
    $smartcloud_ai_kit_attr_name = preg_replace('/([a-z])([A-Z])/', '$1-$2', $smartcloud_ai_kit_key);
    $smartcloud_ai_kit_attr_name = strtolower(str_replace('_', '-', $smartcloud_ai_kit_attr_name));
    $smartcloud_ai_kit_div_attrs[] = 'data-' . $smartcloud_ai_kit_attr_name . '="' . $smartcloud_ai_kit_value . '"';
  }
}

// Add block wrapper attributes
$smartcloud_ai_kit_div_attrs[] = get_block_wrapper_attributes();
?>
<div <?php echo wp_kses_data(implode(' ', $smartcloud_ai_kit_div_attrs)); ?>>
  <div style="display: none;">
    <?php echo esc_html($content); ?>
  </div>
</div>