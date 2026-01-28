<?php
if (!defined('ABSPATH')) {
	exit; // Exit if accessed directly.
}
$wpsuite_ai_kit_feature_hash = substr(md5(serialize($attributes)), 0, 6) . '_' . wp_rand();
$wpsuite_ai_kit_feature_bid = 'ai_kit_feature_' . $wpsuite_ai_kit_feature_hash;
// Define the attributes and their default values if any
$wpsuite_ai_kit_attribute_map = [
	'mode' => null,
	'editable' => null,
	'autoRun' => null,
	'onDeviceTimeout' => null,
	'default' => null,
	'allowOverride' => null,
	'optionsDisplay' => null,
	'inputSelector' => null,
	'outputSelector' => null,
	'variation' => 'default',
	'title' => null,
	'openButtonTitle' => null,
	'showOpenButtonTitle' => null,
	'openButtonIcon' => null,
	'showOpenButtonIcon' => null,
	'showRegenerateOnBackendButton' => null,
	'acceptButtonTitle' => null,
	'language' => 'system',
	'direction' => 'auto',
	'colorMode' => 'light',
	'primaryColor' => null,
	'primaryShade' => null,
	'colors' => null,
	'uid' => null,
	'themeOverrides' => null,
	'configB64' => null,
	'configFormat' => null,
];

// Build the attribute string
$wpsuite_ai_kit_div_attrs = [];
$wpsuite_ai_kit_div_attrs[] = 'data-wpsuite-ai-kit-feature';
$wpsuite_ai_kit_div_attrs[] = 'id="' . $wpsuite_ai_kit_feature_bid . '"';
$wpsuite_ai_kit_div_attrs[] = 'data-is-preview="ai-kit-is-preview"';
foreach ($wpsuite_ai_kit_attribute_map as $wpsuite_ai_kit_key => $wpsuite_ai_kit_default) {
	if (array_key_exists($wpsuite_ai_kit_key, $attributes) || $wpsuite_ai_kit_default !== null) {
		$wpsuite_ai_kit_value = array_key_exists($wpsuite_ai_kit_key, $attributes) ? $attributes[$wpsuite_ai_kit_key] : $wpsuite_ai_kit_default;
		if ($wpsuite_ai_kit_key === 'themeOverrides' && is_string($wpsuite_ai_kit_value)) {
			$wpsuite_ai_kit_value = str_replace(["\r\n", "\r", "\n"], ' ', $wpsuite_ai_kit_value);
		}
		if (is_bool($wpsuite_ai_kit_value)) {
			$wpsuite_ai_kit_value = $wpsuite_ai_kit_value ? 'true' : 'false';
		} elseif (is_array($wpsuite_ai_kit_value) || is_object($wpsuite_ai_kit_value)) {
			$wpsuite_ai_kit_value = base64_encode(wp_json_encode($wpsuite_ai_kit_value));
		}
		// Convert camelCase to kebab-case, then replace underscores with hyphens
		$wpsuite_ai_kit_attr_name = preg_replace('/([a-z])([A-Z])/', '$1-$2', $wpsuite_ai_kit_key);
		$wpsuite_ai_kit_attr_name = strtolower(str_replace('_', '-', $wpsuite_ai_kit_attr_name));
		$wpsuite_ai_kit_div_attrs[] = 'data-' . $wpsuite_ai_kit_attr_name . '="' . $wpsuite_ai_kit_value . '"';
	}
}

// Add block wrapper attributes
$wpsuite_ai_kit_div_attrs[] = get_block_wrapper_attributes();
?>
<div <?php echo wp_kses_data(implode(' ', $wpsuite_ai_kit_div_attrs)); ?>>
	<div style="display: none;">
		<?php echo esc_html($content); ?>
	</div>
</div>