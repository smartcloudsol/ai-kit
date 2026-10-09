import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";
import { __ } from "@wordpress/i18n";
import docSearch from "./assets/onboarding/docsearch-current.png";
import summarizer from "./assets/onboarding/summarizer-current.png";

const target = window as Window & {
  smartcloudWpSuiteIllustrations?: Partial<Record<"answers" | "forms-workflows", { src: string; title: string }[]>>;
};
target.smartcloudWpSuiteIllustrations ??= {};
target.smartcloudWpSuiteIllustrations.answers = [
  { src: docSearch, title: __("Embedded semantic search with DocSearch", TEXT_DOMAIN) },
  { src: summarizer, title: __("Summarize page content for visitors", TEXT_DOMAIN) },
];
window.dispatchEvent(new Event("smartcloud-wpsuite-illustrations-ready"));
