import { useEffect, useRef, useState, type FunctionComponent } from "react";

import { translations } from "@smart-cloud/ai-kit-ui";
import { I18n } from "aws-amplify/utils";

import {
  AiKitConfig,
  DocSearchProps,
  AiWorkerHandle,
  getAiKitPlugin,
  getStoreSelect,
} from "@smart-cloud/ai-kit-core";
import { useSelect } from "@wordpress/data";

I18n.putVocabularies(translations);

const getValueFromElement = (element: Element | null): string => {
  if (!element) {
    return "";
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value ?? "";
  }

  if (element instanceof HTMLElement) {
    if (element.isContentEditable) {
      return element.innerHTML ?? "";
    }

    return element.textContent ?? "";
  }

  return "";
};

export const App: FunctionComponent<
  Partial<DocSearchProps> & {
    isPreview: boolean;
    inputSelector?: string;
  }
> = (
  props: Partial<DocSearchProps> & {
    isPreview: boolean;
    inputSelector?: string;
  },
) => {
  const {
    isPreview,
    inputSelector,
    autoRun,
    store,
    showOpenButton,
    openButtonTitle,
    showOpenButtonTitle,
    openButtonIcon,
    showOpenButtonIcon,
    showSearchButtonTitle,
    searchButtonIcon,
    showSearchButtonIcon,
    title,
    variation,
    language,
    direction,
    colorMode,
    primaryColor,
    primaryShade,
    colors,
    themeOverrides,
    topK,
    snippetMaxChars,
  } = props;

  const [error, setError] = useState<string | null>(null);

  const targetRef = useRef<HTMLDivElement>(null);

  const aiKitConfig: AiKitConfig | undefined | null = useSelect(
    () => (store ? getStoreSelect(store).getConfig() : undefined),
    [store],
  );

  useEffect(() => {
    if (!isPreview && !aiKitConfig?.subscriptionType) {
      return;
    }
    const aiKit = getAiKitPlugin();
    let handle: AiWorkerHandle | null = null;
    const onClose = () => {
      handle?.unmount();
    };
    const render = async () => {
      handle = await aiKit.features
        .renderSearchComponent({
          getSearchText: () => {
            if (!inputSelector) {
              return "";
            }
            let el: HTMLElement | null = null;
            try {
              el = document.querySelector(inputSelector);
            } catch {
              // ignore
            }
            return el ? getValueFromElement(el) : "";
          },
          autoRun: autoRun ?? false,
          title,
          store: store!,
          target: targetRef.current!,
          showOpenButton,
          openButtonTitle,
          showOpenButtonTitle,
          openButtonIcon,
          showOpenButtonIcon,
          showSearchButtonTitle,
          searchButtonIcon,
          showSearchButtonIcon,
          primaryColor,
          primaryShade,
          colors,
          context: isPreview ? "admin" : "frontend",
          variation,
          colorMode,
          language,
          direction,
          themeOverrides,
          topK,
          snippetMaxChars,
          onClose,
        })
        .catch((error) => {
          console.debug("AI Kit: renderSearchComponent failed", error);
          setError(I18n.get(error.message || "An unknown error occurred."));
          return null;
        });
      return handle;
    };
    const handlePromise = render();
    return () => {
      if (handlePromise) {
        handlePromise.then((handle) => {
          handle?.unmount();
        });
      }
    };
  }, [
    store,
    isPreview,
    targetRef,
    variation,
    colorMode,
    language,
    direction,
    title,
    showOpenButton,
    openButtonTitle,
    showOpenButtonTitle,
    openButtonIcon,
    showOpenButtonIcon,
    primaryColor,
    primaryShade,
    colors,
    aiKitConfig?.subscriptionType,
    themeOverrides,
    showSearchButtonTitle,
    searchButtonIcon,
    showSearchButtonIcon,
    inputSelector,
    topK,
    snippetMaxChars,
    autoRun,
  ]);

  return (
    <>
      <div ref={targetRef}></div>
      {error && isPreview && (
        <div
          style={{
            color: "red",
            marginTop: "8px",
            fontSize: "0.875rem",
          }}
        >
          {error}
        </div>
      )}
      {isPreview && !aiKitConfig?.subscriptionType && (
        <div
          style={{
            color: "rgba(220, 20, 60, 0.6)",
            marginTop: "8px",
            fontSize: "0.875rem",
            fontStyle: "italic",
          }}
        >
          {I18n.get("You need a subscription to use this feature on frontend.")}
        </div>
      )}
    </>
  );
};
