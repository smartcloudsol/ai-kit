<?php

use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncTransport;

if (!defined('ABSPATH')) {
    throw new RuntimeException('Run this test through a booted WordPress instance.');
}
if (!class_exists(KnowledgeSyncTransport::class)) {
    throw new RuntimeException('SmartCloud AI Kit must be active before running this test.');
}

$compatibility = KnowledgeSyncTransport::create()->backendCompatibility();
$status = $compatibility['status'] ?? null;
if (!in_array($status, array('verified', 'legacy', 'unconfigured'), true)) {
    throw new RuntimeException('Knowledge-sync backend compatibility returned an invalid status.');
}

$safe_result = array(
    'status' => $status,
    'release' => is_string($compatibility['release'] ?? null)
        ? $compatibility['release']
        : null,
    'apiSchemaVersion' => is_int($compatibility['apiSchemaVersion'] ?? null)
        ? $compatibility['apiSchemaVersion']
        : null,
    'knowledgeAutomation' => is_int($compatibility['capabilities']['knowledge.automation'] ?? null)
        ? $compatibility['capabilities']['knowledge.automation']
        : null,
);

$message = 'AI Kit backend compatibility: ' . wp_json_encode($safe_result);
if (defined('WP_CLI') && WP_CLI) {
    WP_CLI::success($message);
} else {
    echo $message . PHP_EOL;
}
