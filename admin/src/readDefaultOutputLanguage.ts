import {
  getAiKitPlugin,
  type AiKitLanguageCode,
  type AiKitSettings,
} from "@smart-cloud/ai-kit-core";

export function readDefaultOutputLanguage(): AiKitLanguageCode {
  return (
    (getAiKitPlugin()?.settings as AiKitSettings | undefined)
      ?.defaultOutputLanguage ?? "en"
  );
}
