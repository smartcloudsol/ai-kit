// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const elementorFrontend: any;

export const observe = () => {
  const mountAiFeature = (el: HTMLElement) => {
    if (!el?.id || jQuery(el).data("rendered")) return;
    jQuery(document).trigger("smartcloud-ai-kit-feature-block", el.id);
    //jQuery(el).data("rendered", "true");
  };

  const mountDocSearch = (el: HTMLElement) => {
    if (!el?.id || jQuery(el).data("rendered")) return;
    jQuery(document).trigger("smartcloud-ai-kit-doc-search-block", el.id);
    //jQuery(el).data("rendered", "true");
  };

  jQuery(() => {
    jQuery("[data-smartcloud-ai-kit-feature]").each((_idx, n) =>
      mountAiFeature(n),
    );
    jQuery("[data-smartcloud-ai-kit-doc-search]").each((_idx, n) =>
      mountDocSearch(n),
    );
  });
  jQuery(window).on("elementor/frontend/init", function () {
    if (elementorFrontend?.hooks) {
      elementorFrontend.hooks.addAction(
        "frontend/element_ready/shortcode.default",
        () => {
          jQuery("[data-smartcloud-ai-kit-feature]").each((_idx, n) =>
            mountAiFeature(n),
          );
          jQuery("[data-smartcloud-ai-kit-doc-search]").each((_idx, n) =>
            mountDocSearch(n),
          );
        },
      );
      elementorFrontend.hooks.addAction(
        "frontend/element_ready/smartcloud_ai_kit_doc_search.default",
        () => {
          jQuery("[data-smartcloud-ai-kit-doc-search]").each((_idx, n) =>
            mountDocSearch(n),
          );
        },
      );
      elementorFrontend.hooks.addAction(
        "frontend/element_ready/smartcloud_ai_kit_feature.default",
        () => {
          jQuery("[data-smartcloud-ai-kit-feature]").each((_idx, n) =>
            mountAiFeature(n),
          );
        },
      );
    }
  });
};
