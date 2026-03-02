import {
  getConfig,
  getWpSuite,
  SiteSettings,
  type SubscriptionType,
} from "@smart-cloud/wpsuite-core";
import {
  createReduxStore,
  dispatch,
  register,
  select,
  type StoreDescriptor,
  subscribe,
} from "@wordpress/data";
import { I18n } from "aws-amplify/utils";
import { getAiKitPlugin } from "./runtime";
import {
  AiChatbotProps,
  type AiModePreference,
  type BackendTransport,
} from "./types";

export interface AiKitConfig {
  mode?: AiModePreference;
  backendTransport?: BackendTransport;
  backendApiName?: string;
  backendBaseUrl?: string;
  subscriptionType?: SubscriptionType;

  enableChatbot?: boolean;
  chatbot?: AiChatbotProps;
}

let siteSettings: SiteSettings;
if (typeof WpSuite !== "undefined") {
  siteSettings = WpSuite.siteSettings;
} else {
  siteSettings = {} as SiteSettings;
}

/**
 * Ensures we only keep runtime keys that are part of AiKitConfig.
 *
 * Defensive: upstream getConfig("ai-kit") or persisted site.settings may include
 * additional keys, but the admin UI and core should only operate on AiKitConfig.
 */
export const sanitizeAiKitConfig = (input: unknown): AiKitConfig => {
  const v =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const out: AiKitConfig = {};

  if (typeof v.mode === "string") {
    out.mode = v.mode as AiModePreference;
  }
  if (typeof v.backendTransport === "string") {
    out.backendTransport = v.backendTransport as BackendTransport;
  }
  if (typeof v.backendApiName === "string") {
    out.backendApiName = v.backendApiName;
  }
  if (typeof v.backendBaseUrl === "string") {
    out.backendBaseUrl = v.backendBaseUrl;
  }
  if (typeof v.subscriptionType === "string") {
    out.subscriptionType = v.subscriptionType as SubscriptionType;
  }

  if (typeof v.enableChatbot === "boolean") {
    out.enableChatbot = v.enableChatbot;
  }

  if (typeof v.chatbot === "object" && v.chatbot !== null) {
    out.chatbot = v.chatbot as AiChatbotProps;
  }

  return out;
};

const getCustomTranslations = async (): Promise<CustomTranslations | null> => {
  const aiKit = getAiKitPlugin();
  if (!aiKit) {
    throw new Error("AI-Kit plugin is not available");
  }
  let translations: CustomTranslations | null = null;
  if (aiKit.settings.customTranslationsUrl) {
    translations = await fetch(
      aiKit.settings.customTranslationsUrl +
        (aiKit.settings.customTranslationsUrl.includes("?") ? "&" : "?") +
        "t=" +
        siteSettings.lastUpdate,
    )
      .then((response) => (response.ok ? response.text() : null))
      .then((response) =>
        response ? (JSON.parse(response) as CustomTranslations) : null,
      )
      .catch(() => null);
  }
  return translations ?? null;
};

const getDefaultState = async (): Promise<State> => {
  const config = sanitizeAiKitConfig(await getConfig("aiKit"));
  const customTranslations = await getCustomTranslations();

  return {
    config: config,
    showChatbotPreview: false,
    language: undefined,
    direction: undefined,
    customTranslations: customTranslations,
  };
};

const actions = {
  setShowChatbotPreview(showChatbotPreview: boolean) {
    return {
      type: "SET_SHOW_CHATBOT_PREVIEW",
      showChatbotPreview,
    };
  },

  setLanguage(language: string | undefined | null) {
    if (!language || language === "system") {
      I18n.setLanguage("");
    } else {
      I18n.setLanguage(language);
    }
    return {
      type: "SET_LANGUAGE",
      language,
    };
  },

  setDirection(direction: "ltr" | "rtl" | "auto" | undefined | null) {
    return {
      type: "SET_DIRECTION",
      direction,
    };
  },

  setConfig: (config: AiKitConfig) => ({
    type: "SET_CONFIG" as const,
    config,
  }),
};

const selectors = {
  getConfig(state: State) {
    return state.config;
  },
  isShowChatbotPreview(state: State) {
    return state.showChatbotPreview;
  },
  getCustomTranslations(state: State) {
    return state.customTranslations;
  },
  getLanguage(state: State) {
    return state.language;
  },
  getDirection(state: State) {
    return state.direction;
  },
  getState(state: State) {
    return state;
  },
};

const resolvers = {};

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

export const getStoreDispatch = (
  store: Store,
): Omit<StoreActions, "setConfig"> => {
  const d = dispatch(store) as unknown as StoreActions;
  delete d.setConfig;
  return d;
};

export const getStoreSelect = (store: Store): StoreSelectors =>
  select(store) as unknown as StoreSelectors;

export const reloadConfig = async (store: Store) => {
  getWpSuite()!.siteSettings.lastUpdate = Date.now();
  const cfg = await getConfig("aiKit");
  const sanitized = sanitizeAiKitConfig(cfg);
  (dispatch(store) as unknown as StoreActions).setConfig!(sanitized);
};

export const createStore = async (): Promise<Store> => {
  const DEFAULT_STATE = await getDefaultState();
  const store = createReduxStore("wpsuite/ai-kit", {
    reducer(state = DEFAULT_STATE, action) {
      switch (action.type) {
        case "SET_LANGUAGE":
          return {
            ...state,
            language: action.language,
          };

        case "SET_DIRECTION":
          return {
            ...state,
            direction: action.direction,
          };

        case "SET_SHOW_CHATBOT_PREVIEW":
          return {
            ...state,
            showChatbotPreview: action.showChatbotPreview,
          };

        case "SET_CONFIG":
          return {
            ...state,
            config: action.config,
          };
      }
      return state;
    },
    actions,
    selectors,
    resolvers,
  });

  register(store);
  return store;
};

export const observeStore = (
  observableStore: Store,
  selector: (state: State) => boolean | number | string | null | undefined,
  onChange: (
    nextValue: boolean | number | string | null | undefined,
    previousValue: boolean | number | string | null | undefined,
  ) => void,
) => {
  let currentValue: boolean | number | string | null | undefined;

  function handleChange() {
    const state = getStoreSelect(observableStore).getState();
    const nextValue = selector(state);

    if (nextValue !== currentValue) {
      const oldValue = currentValue;
      currentValue = nextValue;
      onChange(currentValue, oldValue);
    }
  }

  const unsubscribe = subscribe(handleChange, observableStore);
  handleChange();
  return unsubscribe;
};
