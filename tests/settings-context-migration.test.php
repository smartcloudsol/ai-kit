<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');

require_once dirname(__DIR__) . '/admin/php/model.php';

use SmartCloud\WPSuite\AiKit\AiKitSettings;

$legacy = (object) [
    'sharedContext' => 'This must no longer be exposed to browser requests.',
    'enablePoweredBy' => true,
    'defaultOutputLanguage' => 'hu',
    'debugLoggingEnabled' => true,
];

$normalized = AiKitSettings::fromMixed($legacy);
$public = get_object_vars($normalized);

if (array_key_exists('sharedContext', $public)) {
    throw new RuntimeException('Legacy sharedContext leaked into public AI Kit settings.');
}
if ($normalized->defaultOutputLanguage !== 'hu' || !$normalized->debugLoggingEnabled) {
    throw new RuntimeException('Supported settings were not preserved during migration.');
}

echo "settings context migration test passed\n";

