import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";
import apiFetch from "@wordpress/api-fetch";
import { InspectorControls } from "@wordpress/block-editor";
import { BlockInstance, type BlockEditProps } from "@wordpress/blocks";
import { PanelBody } from "@wordpress/components";
import { createHigherOrderComponent } from "@wordpress/compose";
import { select } from "@wordpress/data";
import { Children, cloneElement } from "@wordpress/element";
import { addFilter } from "@wordpress/hooks";
import { __ } from "@wordpress/i18n";
import React, { Fragment, ReactElement, useEffect, useRef } from "react";
import GenerateMetadataBox from "./GenerateMetadataBox";
import { WordPressMedia } from "./types";

// --- Types ---

type ImageExtraAttrs = {
  title?: string;
  caption?: string;
};

// Gutenberg block settings type loosely to avoid conflicts with package versions
type BlockSettings = {
  name?: string;
  attributes?: Record<string, unknown>;
  [k: string]: unknown;
};

// --- 1) InspectorControls panel ---

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

const withInspectorControls = createHigherOrderComponent(
  (BlockEdit: React.ComponentType<BlockEditProps<BlockSettings>>) => {
    function findInnerImageId(
      block: BlockInstance<{
        [k: string]: unknown;
      }> | null,
    ): number | undefined {
      if (!block) return undefined;
      // közvetlen id / mediaId
      const direct = block.attributes?.id ?? block.attributes?.mediaId;
      if (typeof direct === "number") return direct;

      // innerBlocks mély bejárás
      const inner = block.innerBlocks ?? [];
      for (const b of inner) {
        const found = findInnerImageId(b);
        if (typeof found === "number") return found;
      }
      return undefined;
    }
    return (props: BlockEditProps<BlockSettings>) => {
      const name = (props as unknown as { name: string }).name;
      if (!["core/image", "core/cover", "core/media-text"].includes(name))
        return <BlockEdit {...props} />;
      const {
        clientId,
        attributes: { alt = "", title = "", caption = "" },
        setAttributes,
        isSelected,
      } = props;

      const lastIdRef = useRef<number | null>(null);

      const coreEditor = select("core/block-editor");
      const block = coreEditor.getBlock(clientId);
      const id = findInnerImageId(block);

      useEffect(() => {
        if (!id) return;
        if (lastIdRef.current === id) return;
        lastIdRef.current = id;

        (async () => {
          const m: WordPressMedia = await apiFetch({
            path: `/wp/v2/media/${id}`,
          });

          setAttributes({
            alt: m?.alt_text ? stripHtml(m.alt_text) : "",
            title: m?.title?.rendered ? stripHtml(m.title.rendered) : "",
            caption: m?.caption?.rendered ? stripHtml(m.caption.rendered) : "",
          });
        })();
      }, [id, alt, setAttributes, title, caption]);

      return (
        <Fragment>
          <BlockEdit {...props} />
          {isSelected && (
            <InspectorControls>
              <PanelBody
                title={__("SEO Metadata", TEXT_DOMAIN)}
                initialOpen={true}
              >
                <GenerateMetadataBox
                  attachmentId={id}
                  autoSaveToAttachment={false}
                  onGenerated={(data) => {
                    setAttributes({
                      alt: data.alt_text || alt,
                      title: data.title || title,
                      caption: data.caption || caption,
                    });
                  }}
                />
              </PanelBody>
            </InspectorControls>
          )}
        </Fragment>
      );
    };
  },
  "withInspectorControls",
);

addFilter(
  "editor.BlockEdit",
  TEXT_DOMAIN + "/image-extra/inspector",
  withInspectorControls,
);

// --- 2) Apply to inner <img> and <figcaption> ---

function applyToInnerImg(
  element: ReactElement,
  blockType: { name: string },
  attributes: ImageExtraAttrs,
): ReactElement {
  if (
    !["core/image", "core/cover", "core/media-text"].includes(blockType.name) ||
    !element
  )
    return element;

  const { caption } = attributes || {};
  const recurse = (el: ReactElement): ReactElement => {
    if (!el || !el.props) return el;

    const kids = el.props.children
      ? Children.map(el.props.children, (child) => {
          if (!child || !child.type) return child;
          // If <img>, add the attributes
          if (child.type === "img") {
            const newProps: Record<string, unknown> = { ...child.props };
            if (attributes?.title) newProps.title = attributes.title;
            return cloneElement(child, newProps);
          }
          if (child.type === "figcaption") {
            return cloneElement(child, child.props, caption);
          }
          // Otherwise, recurse
          return recurse(child);
        })
      : el.props?.children;

    return cloneElement(el, { ...el.props }, kids);
  };

  return recurse(element);
}

addFilter(
  "blocks.getSaveElement",
  TEXT_DOMAIN + "/image-extra/save-element",
  applyToInnerImg,
);

addFilter(
  "blocks.registerBlockType",
  TEXT_DOMAIN + "/image-extra/extend-attrs",
  (settings: BlockInstance["attributes"], name: string) => {
    if (!["core/image", "core/cover", "core/media-text"].includes(name))
      return settings;

    settings.attributes = {
      ...settings.attributes,
      title: { type: "string", default: "" },
      caption: { type: "string", default: "" },
    };

    return settings;
  },
);
