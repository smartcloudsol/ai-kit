import { createContext, useContext, useMemo, useSyncExternalStore, type PropsWithChildren } from "react";
import { createTranslator, getSiteLocaleRuntime, type TranslationCatalogs } from "@smart-cloud/wpsuite-core";
import { translations } from "./i18n";

export interface AiKitTranslator { language: string; customTranslations?: TranslationCatalogs | null; get(key: string, fallback?: string): string; }
const TranslationContext = createContext<AiKitTranslator | null>(null);
export function useSiteLocale() {
  const runtime = useMemo(() => getSiteLocaleRuntime(), []);
  return useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
}
export function AiKitLocaleProvider({ language, customTranslations, children }: PropsWithChildren<{ language: string; customTranslations?: TranslationCatalogs | null }>) {
  const parent = useContext(TranslationContext);
  const custom = customTranslations === undefined ? parent?.customTranslations : customTranslations;
  const value = useMemo(() => ({ language, customTranslations: custom, get: createTranslator(language, translations, custom) }), [language, custom]);
  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}
export function useAiKitI18n(): AiKitTranslator {
  const inherited = useContext(TranslationContext);
  const site = useSiteLocale();
  const fallback = useMemo(() => ({ language: site.locale, get: createTranslator(site.locale, translations) }), [site.locale]);
  return inherited ?? fallback;
}
