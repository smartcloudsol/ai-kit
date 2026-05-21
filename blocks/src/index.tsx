import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";
import { __ } from "@wordpress/i18n";

export const COLOR_MODE_OPTIONS = [
  { label: __("Light (default)", TEXT_DOMAIN), value: "light" },
  { label: __("Dark", TEXT_DOMAIN), value: "dark" },
  { label: __("Auto", TEXT_DOMAIN), value: "auto" },
];

export const DIRECTION_OPTIONS = [
  {
    label: __("Auto (by language)", TEXT_DOMAIN),
    value: "auto",
  },
  { label: __("Left to Right", TEXT_DOMAIN), value: "ltr" },
  { label: __("Right to Left", TEXT_DOMAIN), value: "rtl" },
];
