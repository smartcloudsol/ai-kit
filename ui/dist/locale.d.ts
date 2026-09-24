import { type PropsWithChildren } from "react";
import { type TranslationCatalogs } from "@smart-cloud/wpsuite-core";
export interface AiKitTranslator {
    language: string;
    customTranslations?: TranslationCatalogs | null;
    get(key: string, fallback?: string): string;
}
export declare function useSiteLocale(): import("@smart-cloud/wpsuite-core").SiteLocaleSnapshot;
export declare function AiKitLocaleProvider({ language, customTranslations, children }: PropsWithChildren<{
    language: string;
    customTranslations?: TranslationCatalogs | null;
}>): import("react").JSX.Element;
export declare function useAiKitI18n(): AiKitTranslator;
