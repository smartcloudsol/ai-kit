// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const elementorFrontend: any;

type MountTask = () => void;

function scheduleAfterInitialPaint(task: MountTask, timeout = 1500) {
  const runWhenIdle = () => {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => task(), { timeout });
    } else {
      setTimeout(task, 300);
    }
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(runWhenIdle);
  });
}
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
    const mount = () => {
      jQuery("[data-smartcloud-ai-kit-feature]").each((_idx, n) =>
        mountAiFeature(n),
      );
      jQuery("[data-smartcloud-ai-kit-doc-search]").each((_idx, n) =>
        mountDocSearch(n),
      );
    };
    scheduleAfterInitialPaint(mount, 2000);
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
