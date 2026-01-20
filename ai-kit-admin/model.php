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
        public string $reCaptchaSiteKey = "",
        public bool $useRecaptchaEnterprise = false,
        public bool $useRecaptchaNet = false,
        public bool $enablePoweredBy = false,
        public string $defaultOutputLanguage = "",
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
                reCaptchaSiteKey: (string) ($raw->reCaptchaSiteKey ?? ""),
                useRecaptchaEnterprise: (bool) ($raw->useRecaptchaEnterprise ?? false),
                useRecaptchaNet: (bool) ($raw->useRecaptchaNet ?? false),
                enablePoweredBy: (bool) ($raw->enablePoweredBy ?? false),
                defaultOutputLanguage: (string) ($raw->defaultOutputLanguage ?? ""),
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
            reCaptchaSiteKey: (string) ($arr['reCaptchaSiteKey'] ?? ""),
            useRecaptchaEnterprise: (bool) ($arr['useRecaptchaEnterprise'] ?? false),
            useRecaptchaNet: (bool) ($arr['useRecaptchaNet'] ?? false),
            enablePoweredBy: (bool) ($arr['enablePoweredBy'] ?? false),
            defaultOutputLanguage: (string) ($arr['defaultOutputLanguage'] ?? ""),
        );
    }
}

/**
 * @deprecated Use AiKitSettings. Kept as a thin alias to avoid breaking older code.
 */
class Settings extends AiKitSettings
{
}
