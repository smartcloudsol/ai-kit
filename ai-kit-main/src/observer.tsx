// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const elementorFrontend: any;

export const observe = () => {
  const mountAiFeature = (el: HTMLElement) => {
    if (!el?.id || jQuery(el).data("rendered")) return;
    jQuery(document).trigger("ai-kit-feature-block", el.id);
    //jQuery(el).data("rendered", "true");
  };

  jQuery(() => jQuery("[ai-kit-feature]").each((_idx, n) => mountAiFeature(n)));
  jQuery(window).on("elementor/frontend/init", function () {
    if (elementorFrontend?.hooks) {
      elementorFrontend.hooks.addAction(
        "frontend/element_ready/shortcode.default",
        () => {
          jQuery("[ai-kit-feature]").each((_idx, n) => mountAiFeature(n));
        },
      );
      elementorFrontend.hooks.addAction(
        "frontend/element_ready/ai_kit.default",
        () => {
          jQuery("[ai-kit-feature]").each((_idx, n) => mountAiFeature(n));
        },
      );
    }
  });
};
