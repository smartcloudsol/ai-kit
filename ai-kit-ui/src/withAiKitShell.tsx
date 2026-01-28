import { generateColors } from "@mantine/colors-generator";
import {
  colorsTuple,
  createTheme,
  DEFAULT_THEME,
  DirectionProvider,
  MantineColorsTuple,
  MantineProvider,
} from "@mantine/core";
import {
  AiWorkerProps,
  CustomTranslations,
  getStoreSelect,
} from "@smart-cloud/ai-kit-core";
import { useSelect } from "@wordpress/data";
import { I18n } from "aws-amplify/utils";
import { type ComponentType, useEffect, useMemo, useState } from "react";
import { ShadowBoundary } from "./ShadowBoundary";

export type AiKitShellInjectedProps = {
  language?: string;
  rootElement: HTMLElement;
};

const hashStringDjb2 = (str: string): string => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // unsigned + base36
  return (hash >>> 0).toString(36);
};

const sanitizeThemeOverrides = (input: string): string =>
  input
    .replace(/<\/?(?:style|script)\b[^>]*>/gi, "")
    .replace(/@import\s+['"]?javascript:[^;]+;?/gi, "")
    .replace(/url\(\s*(['"]?)javascript:[^)]+\)/gi, "")
    .replace(/\bexpression\s*\([^)]*\)/gi, "");

const STYLE_TEXT_ID = "ai-kit-style-text";

export function withAiKitShell<P extends object>(
  RootComponent: ComponentType<P & AiKitShellInjectedProps>,
  propOverrides?: Partial<AiWorkerProps>,
) {
  const Wrapped: React.FC<P & Partial<AiWorkerProps>> = (props) => {
    // Duck-typing merge: supports both explicit shell props or defaults.
    const {
      store,
      variation,
      showOpenButton,
      colors,
      colorMode,
      primaryColor,
      primaryShade,
      themeOverrides,
      language,
      direction,
    } = { ...props, ...propOverrides } as AiWorkerProps & P;

    const [host, setHost] = useState<HTMLElement | null>(null);
    const languageInStore: string | undefined | null = useSelect(() =>
      getStoreSelect(store).getLanguage(),
    );
    const directionInStore: "ltr" | "rtl" | "auto" | undefined | null =
      useSelect(() => getStoreSelect(store).getDirection());
    const customTranslations: CustomTranslations | undefined | null = useSelect(
      () => getStoreSelect(store).getCustomTranslations(),
    );
    const [languageOverride] = useState<string>(
      new URLSearchParams(window.location.search).get("language") ?? "",
    );
    const [directionOverride] = useState<string>(
      new URLSearchParams(window.location.search).get("direction") ?? "",
    );
    const currentLanguage = useMemo(() => {
      I18n.putVocabularies(customTranslations || {});
      const lang = languageInStore || languageOverride || language;
      if (!lang || lang === "system") {
        I18n.setLanguage("");
        return undefined;
      }
      I18n.setLanguage(lang);
      return lang;
    }, [language, languageOverride, languageInStore, customTranslations]);

    const currentDirection = useMemo(() => {
      const dir = directionInStore || directionOverride || direction;
      if (!dir || dir === "auto") {
        return currentLanguage === "ar" || currentLanguage === "he"
          ? "rtl"
          : "ltr";
      }
      return dir as "ltr" | "rtl";
    }, [currentLanguage, direction, directionInStore, directionOverride]);

    const stylesheets = useMemo(
      () => [
        (
          WpSuite as never as {
            constants: { aiKit: { mantineCssHref: string } };
          }
        )?.constants?.aiKit?.mantineCssHref,
        (
          WpSuite as never as {
            constants: { aiKit: { aiKitUiCssHref: string } };
          }
        )?.constants?.aiKit?.aiKitUiCssHref,
      ],
      [WpSuite],
    );

    let customColors: Record<string, MantineColorsTuple> | undefined;
    if (colors) {
      customColors = {};
      Object.keys(colors).forEach((c) => {
        try {
          customColors![c] = generateColors(colors[c]);
        } catch {
          customColors![c] = colorsTuple(colors[c]);
        }
      });
    }

    const theme = createTheme({
      respectReducedMotion: true,
      ...(customColors && { colors: customColors }),
      ...(primaryColor &&
        [
          ...Object.keys(DEFAULT_THEME.colors),
          ...Object.keys(customColors || {}),
        ].includes(primaryColor) && { primaryColor }),
      ...(primaryShade &&
        Object.keys(primaryShade).length > 0 && {
          primaryShade: {
            light:
              primaryShade.light ??
              (typeof DEFAULT_THEME.primaryShade === "object"
                ? DEFAULT_THEME.primaryShade.light
                : (DEFAULT_THEME.primaryShade ?? 6)),
            dark:
              primaryShade.dark ??
              (typeof DEFAULT_THEME.primaryShade === "object"
                ? DEFAULT_THEME.primaryShade.dark
                : (DEFAULT_THEME.primaryShade ?? 6)),
          },
        }),
      components: {
        Button: {
          styles: { root: { borderRadius: "inherit" } },
        },
        Tooltip: {
          defaultProps: {
            withinPortal: false,
            zIndex: 100002,
          },
        },
        Modal: {
          defaultProps: {
            withinPortal: false,
            zIndex: 100002,
          },
        },
        Select: {
          defaultProps: {
            comboboxProps: {
              withinPortal: false,
              floatingStrategy: "fixed",
              positionDependencies: [],
              position: "bottom",
              middlewares: {
                flip: false,
                shift: {
                  padding: 10,
                  boundary: "clippingAncestors",
                },
              },
            },
          },
        },
      },
    });

    const themeOverridesHash = useMemo(() => {
      return themeOverrides ? hashStringDjb2(themeOverrides) : "";
    }, [themeOverrides]);

    useEffect(() => {
      if (!host) {
        return;
      }

      const existingStyle = host.shadowRoot!.getElementById(
        STYLE_TEXT_ID,
      ) as HTMLStyleElement | null;

      if (themeOverrides) {
        if (!existingStyle) {
          const s = host.shadowRoot!.ownerDocument.createElement("style");
          s.id = STYLE_TEXT_ID;
          s.setAttribute("data-hash", themeOverridesHash);
          s.textContent = sanitizeThemeOverrides(themeOverrides);
          host.shadowRoot!.appendChild(s);
        } else {
          const prevHash = existingStyle.getAttribute("data-hash") || "";
          if (prevHash !== themeOverridesHash) {
            existingStyle.textContent = sanitizeThemeOverrides(themeOverrides);
          }
        }
      } else if (existingStyle) {
        existingStyle.remove();
      }
    }, [host, themeOverrides, themeOverridesHash]);

    return (
      <ShadowBoundary
        mode={variation === "modal" && !showOpenButton ? "overlay" : "local"}
        variation={variation}
        overlayRootId="ai-kit-overlay-root"
        stylesheets={stylesheets}
        setHost={setHost}
        rootElementId={
          variation === "modal" && !showOpenButton
            ? "ai-kit-portal-root"
            : "ai-kit-inline-root"
        }
      >
        {({ rootElement }) => {
          rootElement.setAttribute(
            "data-ai-kit-variation",
            variation || "default",
          );
          rootElement.setAttribute("dir", currentDirection);
          if (currentLanguage) {
            rootElement.setAttribute("lang", currentLanguage);
          }

          const resolved =
            colorMode === "auto"
              ? window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
                ? "dark"
                : "light"
              : colorMode;

          return (
            <DirectionProvider initialDirection={currentDirection}>
              <MantineProvider
                forceColorScheme={resolved}
                theme={theme}
                getRootElement={() => rootElement as unknown as HTMLElement}
              >
                <RootComponent
                  {...props}
                  colorMode={resolved}
                  language={currentLanguage}
                  rootElement={rootElement}
                />
              </MantineProvider>
            </DirectionProvider>
          );
        }}
      </ShadowBoundary>
    );
  };

  Wrapped.displayName = `withAiKitShell(${
    RootComponent.displayName ?? RootComponent.name ?? "Component"
  })`;
  return Wrapped;
}
