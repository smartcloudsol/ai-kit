import { useEffect, useRef, useState, type FunctionComponent } from "react";

import { translations } from "@smart-cloud/ai-kit-ui";
import { I18n } from "aws-amplify/utils";

import {
  AiFeatureProps,
  AiKitConfig,
  AiWorkerHandle,
  getAiKitPlugin,
  getStoreSelect,
} from "@smart-cloud/ai-kit-core";
import { useSelect } from "@wordpress/data";

I18n.putVocabularies(translations);

const applyResultToElement = (
  element: Element | null,
  value: string,
  format?: string,
) => {
  if (!element) {
    return;
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  if (element instanceof HTMLElement) {
    const useHtml =
      format === "html" ||
      (element.isContentEditable && format !== "plain-text");
    if (useHtml) {
      element.innerHTML = value;
    } else {
      element.textContent = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
};

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
  Partial<AiFeatureProps> & {
    isPreview: boolean;
    inputSelector?: string;
    outputSelector?: string;
    openButtonTitle?: string;
    openButtonIcon?: string;
    showOpenButtonTitle?: boolean;
    showOpenButtonIcon?: boolean;
    acceptButtonTitle?: string;
    showRegenerateOnBackendButton?: boolean;
  }
> = (
  props: Partial<AiFeatureProps> & {
    isPreview: boolean;
    inputSelector?: string;
    outputSelector?: string;
    openButtonTitle?: string;
    openButtonIcon?: string;
    showOpenButtonTitle?: boolean;
    showOpenButtonIcon?: boolean;
    acceptButtonTitle?: string;
    showRegenerateOnBackendButton?: boolean;
  },
) => {
  const {
    isPreview,
    store,
    mode,
    editable,
    autoRun,
    openButtonTitle,
    showOpenButtonTitle,
    openButtonIcon,
    showOpenButtonIcon,
    showRegenerateOnBackendButton,
    acceptButtonTitle,
    title,
    variation,
    language,
    direction,
    inputSelector,
    outputSelector,
    colorMode,
    primaryColor,
    primaryShade,
    colors,
    optionsDisplay,
    default: defaults,
    allowOverride,
    themeOverrides,
    onDeviceTimeout,
  } = props;
  const {
    text,
    instructions,
    tone,
    length,
    type,
    outputLanguage,
    outputFormat,
  } = defaults || {};

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
        .renderFeature({
          default: {
            text: mode === "write" ? text : undefined,
            getText: () => {
              let el: HTMLElement | null = null;
              try {
                el = document.querySelector(inputSelector || "body");
              } catch {
                // ignore
              }
              return el ? getValueFromElement(el) : "";
            },
            instructions,
            tone,
            length,
            type,
            outputLanguage,
            outputFormat,
          },
          allowOverride: {
            text: allowOverride?.text,
            instructions: allowOverride?.instructions,
            tone: allowOverride?.tone,
            length: allowOverride?.length,
            type: allowOverride?.type,
            outputLanguage: allowOverride?.outputLanguage,
            outputFormat: false,
          },
          autoRun: autoRun !== undefined ? autoRun : mode !== "write" || !!text,
          editable,
          showOpenButton: true,
          showOpenButtonTitle,
          openButtonIcon,
          showOpenButtonIcon,
          showRegenerateOnBackendButton,
          acceptButtonTitle,
          title,
          openButtonTitle,
          optionsDisplay,
          store: store!,
          target: targetRef.current!,
          primaryColor,
          primaryShade,
          colors,
          context: isPreview ? "admin" : "frontend",
          mode: mode!,
          variation: variation,
          colorMode: colorMode,
          language,
          direction,
          themeOverrides,
          onDeviceTimeout,
          onClose,
          ...(outputSelector && {
            onAccept: (result) => {
              const normalized = result == null ? "" : String(result);
              const outputEl = document.querySelector(outputSelector);
              applyResultToElement(outputEl, normalized, outputFormat);
            },
          }),
        })
        .catch((error) => {
          console.debug("AI Kit: renderFeature failed", error);
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
    mode,
    variation,
    colorMode,
    language,
    direction,
    inputSelector,
    outputSelector,
    title,
    openButtonTitle,
    text,
    outputFormat,
    optionsDisplay,
    primaryColor,
    primaryShade,
    colors,
    instructions,
    tone,
    length,
    type,
    allowOverride?.text,
    allowOverride?.instructions,
    allowOverride?.tone,
    allowOverride?.length,
    allowOverride?.type,
    aiKitConfig?.subscriptionType,
    allowOverride?.outputLanguage,
    outputLanguage,
    showOpenButtonTitle,
    openButtonIcon,
    showOpenButtonIcon,
    acceptButtonTitle,
    showRegenerateOnBackendButton,
    autoRun,
    editable,
    themeOverrides,
    onDeviceTimeout,
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
