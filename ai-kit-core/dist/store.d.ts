import { type SubscriptionType } from "@smart-cloud/wpsuite-core";
import { type StoreDescriptor } from "@wordpress/data";
import { AiChatbotProps, type AiModePreference, type BackendTransport } from "./types";
export interface AiKitConfig {
    mode?: AiModePreference;
    backendTransport?: BackendTransport;
    backendApiName?: string;
    backendBaseUrl?: string;
    subscriptionType?: SubscriptionType;
    enableChatbot?: boolean;
    chatbot?: AiChatbotProps;
}
/**
 * Ensures we only keep runtime keys that are part of AiKitConfig.
 *
 * Defensive: upstream getConfig("ai-kit") or persisted site.settings may include
 * additional keys, but the admin UI and core should only operate on AiKitConfig.
 */
export declare const sanitizeAiKitConfig: (input: unknown) => AiKitConfig;
declare const actions: {
    setShowChatbotPreview(showChatbotPreview: boolean): {
        type: string;
        showChatbotPreview: boolean;
    };
    setLanguage(language: string | undefined | null): {
        type: string;
        language: string | null | undefined;
    };
    setDirection(direction: "ltr" | "rtl" | "auto" | undefined | null): {
        type: string;
        direction: "ltr" | "rtl" | "auto" | null | undefined;
    };
    setConfig: (config: AiKitConfig) => {
        type: "SET_CONFIG";
        config: AiKitConfig;
    };
};
export interface CustomTranslations {
    [key: string]: Record<string, string>;
}
export interface State {
    config: AiKitConfig | null;
    showChatbotPreview: boolean;
    language: string | undefined | null;
    direction: "ltr" | "rtl" | "auto" | undefined | null;
    customTranslations: CustomTranslations | null;
}
export type Store = StoreDescriptor;
export type StoreSelectors = {
    getConfig(): AiKitConfig | null;
    isShowChatbotPreview(): boolean;
    getCustomTranslations(): CustomTranslations | null;
    getLanguage(): string | undefined | null;
    getDirection(): "ltr" | "rtl" | "auto" | undefined | null;
    getState(): State;
};
export type StoreActions = Omit<typeof actions, "setConfig"> & {
    setConfig?: typeof actions.setConfig;
};
export declare const getStoreDispatch: (store: Store) => Omit<StoreActions, "setConfig">;
export declare const getStoreSelect: (store: Store) => StoreSelectors;
export declare const reloadConfig: (store: Store) => Promise<void>;
export declare const createStore: () => Promise<Store>;
export declare const observeStore: (observableStore: Store, selector: (state: State) => boolean | number | string | null | undefined, onChange: (nextValue: boolean | number | string | null | undefined, previousValue: boolean | number | string | null | undefined) => void) => () => void;
export {};
