<?php
/**
 * Simple PHP representation of the settings edited on the WP admin screen.
 *
 * Mirrors the shape of `AiKitSettings` used in the admin React app.
 */

namespace SmartCloud\WPSuite\AiKit;

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly.
}

class AiKitSettings
{
    public function __construct(
        public string $sharedContext = "",
        public bool $enablePoweredBy = false,
        public string $defaultOutputLanguage = "",
        public bool $debugLoggingEnabled = false,
    ) {
    }

    /**
     * Normalizes WP option payloads (array/object/Settings/AiKitSettings) to a typed instance.
     */
    public static function fromMixed(mixed $raw): self
    {
        if ($raw instanceof self) {
            return $raw;
        }
        // Backward compatible: older class name.
        if ($raw instanceof Settings) {
            return new self(
                sharedContext: (string) ($raw->sharedContext ?? ""),
                enablePoweredBy: (bool) ($raw->enablePoweredBy ?? false),
                defaultOutputLanguage: (string) ($raw->defaultOutputLanguage ?? ""),
                debugLoggingEnabled: (bool) ($raw->debugLoggingEnabled ?? false),
            );
        }

        // WP may return associative array, stdClass, or anything else.
        $arr = [];
        if (is_array($raw)) {
            $arr = $raw;
        } elseif (is_object($raw)) {
            $arr = get_object_vars($raw);
        }

        return new self(
            sharedContext: (string) ($arr['sharedContext'] ?? ""),
            enablePoweredBy: (bool) ($arr['enablePoweredBy'] ?? false),
            defaultOutputLanguage: (string) ($arr['defaultOutputLanguage'] ?? ""),
            debugLoggingEnabled: (bool) ($arr['debugLoggingEnabled'] ?? false),
        );
    }
}

/**
 * @deprecated Use AiKitSettings. Kept as a thin alias to avoid breaking older code.
 */
class Settings extends AiKitSettings
{
}
