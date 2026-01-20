<?php
if (!defined('ABSPATH')) {
	exit; // Exit if accessed directly.
}
$ai_kit_feature_hash = substr(md5(serialize($attributes)), 0, 6) . '_' . wp_rand();
$ai_kit_feature_bid = 'ai_kit_feature_' . $ai_kit_feature_hash;
$ai_kit_feature_uid = isset($attributes['uid']) ? sanitize_key($attributes['uid']) : '';
if (!array_key_exists("configB64", $attributes)) {
	$ai_kit_feature_raw = isset($attributes['customCSS']) ? $attributes['customCSS'] : '';
	if (!current_user_can('unfiltered_html')) {
		$ai_kit_feature_raw = wp_kses($ai_kit_feature_raw, []);
	}
	if ($ai_kit_feature_uid) {
		$ai_kit_feature_scope = ".wp-block-css-box-$ai_kit_feature_uid";
		$ai_kit_feature_css = str_replace('selector', $ai_kit_feature_scope, $ai_kit_feature_raw);
		echo "<style id='css-box-" . esc_attr($ai_kit_feature_uid) . "'>" . wp_kses($ai_kit_feature_css, []) . "</style>";
	}
}
?>
<?php
// Define the attributes and their default values if any
$ai_kit_attribute_map = [
	'mode' => null,
	'editable' => null,
	'autoRun' => null,
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
	'styleText' => null,
	'configB64' => null,
	'configFormat' => null,
];

// Build the attribute string
$ai_kit_div_attrs = [];
$ai_kit_div_attrs[] = 'ai-kit-feature';
$ai_kit_div_attrs[] = 'id="' . $ai_kit_feature_bid . '"';
if ($ai_kit_feature_uid) {
	$ai_kit_div_attrs[] = 'data-class="wp-block-css-box-' . $ai_kit_feature_uid . '"';
}
$ai_kit_div_attrs[] = 'data-is-preview="ai-kit-is-preview"';
foreach ($ai_kit_attribute_map as $ai_kit_key => $ai_kit_default) {
	if (array_key_exists($ai_kit_key, $attributes) || $ai_kit_default !== null) {
		$ai_kit_value = array_key_exists($ai_kit_key, $attributes) ? $attributes[$ai_kit_key] : $ai_kit_default;
		if ($ai_kit_key === 'styleText' && is_string($ai_kit_value)) {
			$ai_kit_value = str_replace(["\r\n", "\r", "\n"], ' ', $ai_kit_value);
		}
		if (is_bool($ai_kit_value)) {
			$ai_kit_value = $ai_kit_value ? 'true' : 'false';
		} elseif (is_array($ai_kit_value) || is_object($ai_kit_value)) {
			$ai_kit_value = base64_encode(wp_json_encode($ai_kit_value));
		}
		// Convert camelCase to kebab-case, then replace underscores with hyphens
		$ai_kit_attr_name = preg_replace('/([a-z])([A-Z])/', '$1-$2', $ai_kit_key);
		$ai_kit_attr_name = strtolower(str_replace('_', '-', $ai_kit_attr_name));
		$ai_kit_div_attrs[] = 'data-' . $ai_kit_attr_name . '="' . $ai_kit_value . '"';
	}
}

// Add block wrapper attributes
$ai_kit_div_attrs[] = get_block_wrapper_attributes();
?>
<div <?php echo wp_kses_data(implode(' ', $ai_kit_div_attrs)); ?>>
	<div style="display: none;">
		<?php echo esc_html($content); ?>
	</div>
</div>