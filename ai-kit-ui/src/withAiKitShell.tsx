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
import { type ComponentType, useMemo, useState } from "react";
import { ShadowBoundary } from "./ShadowBoundary";

export type AiKitShellInjectedProps = {
  language?: string;
  rootElement: HTMLElement;
};

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
      className,
      styleText,
      language,
      direction,
    } = { ...props, ...propOverrides } as AiWorkerProps & P;

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
        customColors![c] = colorsTuple(colors[c]);
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

    return (
      <ShadowBoundary
        mode={variation === "modal" && !showOpenButton ? "overlay" : "local"}
        overlayRootId="ai-kit-overlay-root"
        stylesheets={stylesheets}
        styleText={styleText}
        className={className}
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

          return (
            <DirectionProvider initialDirection={currentDirection}>
              <MantineProvider
                defaultColorScheme={colorMode}
                theme={theme}
                cssVariablesSelector={`#${rootElement.id}`}
                getRootElement={() => rootElement as unknown as HTMLElement}
              >
                <RootComponent
                  {...props}
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
