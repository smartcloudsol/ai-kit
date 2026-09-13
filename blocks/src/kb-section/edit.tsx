import {
  useBlockProps,
  useInnerBlocksProps,
  InspectorControls,
} from "@wordpress/block-editor";
import {
  PanelBody,
  SelectControl,
  TextControl,
  TextareaControl,
} from "@wordpress/components";
import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";
import { useEffect } from "@wordpress/element";
import { __, sprintf } from "@wordpress/i18n";
import "./index.css";

interface EditProps {
  attributes: {
    mode?: "inherit" | "separate_doc" | "exclude";
    sectionKey?: string;
    docKey?: string;
    title?: string;
    description?: string;
    postUrl?: string;
    tags?: string[];
    category?: string;
    subcategory?: string;
    priority?: number;
    clientId?: string;
  };
  setAttributes: (attrs: Partial<EditProps["attributes"]>) => void;
  clientId: string;
}

export default function Edit({
  attributes,
  setAttributes,
  clientId,
}: EditProps) {
  const {
    mode,
    sectionKey,
    docKey,
    title,
    description,
    postUrl,
    tags,
    category,
    subcategory,
    priority,
  } = attributes;

  // Auto-set clientId on first render if not set
  useEffect(() => {
    if (!attributes.clientId) {
      setAttributes({ clientId });
    }
  }, [clientId, attributes.clientId, setAttributes]);

  const blockProps = useBlockProps({
    className: `kb-section kb-section--${mode}`,
  });

  const innerBlocksProps = useInnerBlocksProps(blockProps, {
    renderAppender: undefined,
  });

  const handleTagsChange = (value: string) => {
    const tagsArray = value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    setAttributes({ tags: tagsArray });
  };

  return (
    <>
      <InspectorControls>
        <PanelBody
          title={__("KB Section Settings", TEXT_DOMAIN)}
          initialOpen={true}
        >
          <SelectControl
            label={__("Mode", TEXT_DOMAIN)}
            value={mode}
            options={[
              {
                label: __("Inherit (part of base doc)", TEXT_DOMAIN),
                value: "inherit",
              },
              {
                label: __("Separate Document", TEXT_DOMAIN),
                value: "separate_doc",
              },
              {
                label: __("Exclude from KB", TEXT_DOMAIN),
                value: "exclude",
              },
            ]}
            onChange={(value: string) =>
              setAttributes({ mode: value as EditProps["attributes"]["mode"] })
            }
            help={
              mode === "inherit"
                ? __(
                    "This section will be included in the base document",
                    TEXT_DOMAIN,
                  )
                : mode === "separate_doc"
                ? __(
                    "This section will be extracted as a separate document",
                    TEXT_DOMAIN,
                  )
                : __(
                    "This section will be excluded from the knowledge base",
                    TEXT_DOMAIN,
                  )
            }
          />

          {mode === "separate_doc" && (
            <>
              <TextControl
                label={__("Document Key", TEXT_DOMAIN)}
                value={docKey || ""}
                onChange={(value: string) => setAttributes({ docKey: value })}
                help={__(
                  'Unique identifier for this document (e.g., "pricing", "faq")',
                  TEXT_DOMAIN,
                )}
                placeholder={__("e.g., pricing", TEXT_DOMAIN)}
              />
              <TextControl
                label={__("Document Title", TEXT_DOMAIN) + " *"}
                value={title || ""}
                onChange={(value: string) => setAttributes({ title: value })}
                help={__(
                  "Required: Title for this separate document",
                  TEXT_DOMAIN,
                )}
                placeholder={__("e.g., Pricing Information", TEXT_DOMAIN)}
                required
              />
              <TextareaControl
                label={__("Document Description", TEXT_DOMAIN)}
                value={description || ""}
                onChange={(value: string) =>
                  setAttributes({ description: value })
                }
                help={__(
                  "Optional description stored in document metadata. Leave empty to fall back to the source post excerpt.",
                  TEXT_DOMAIN,
                )}
                placeholder={__(
                  "Short summary shown in Doc Search results...",
                  TEXT_DOMAIN,
                )}
              />
              <TextControl
                label={__("Source URL", TEXT_DOMAIN)}
                value={postUrl || ""}
                onChange={(value: string) => setAttributes({ postUrl: value })}
                help={__(
                  "Optional URL stored in document metadata. Leave empty so separate documents can inherit the base document URL.",
                  TEXT_DOMAIN,
                )}
                placeholder="https://example.com/custom-page"
              />
            </>
          )}

          <TextControl
            label={__("Section Key", TEXT_DOMAIN)}
            value={sectionKey || ""}
            onChange={(value: string) => setAttributes({ sectionKey: value })}
            help={__(
              "Optional: Custom section identifier. Defaults to block client ID.",
              TEXT_DOMAIN,
            )}
            placeholder={sprintf(
              /* translators: %s is the beginning of the generated block ID. */
              __("Auto: %s…", TEXT_DOMAIN),
              clientId.substring(0, 8),
            )}
          />
        </PanelBody>

        {mode === "separate_doc" && (
          <PanelBody
            title={__("Metadata Overrides", TEXT_DOMAIN)}
            initialOpen={false}
          >
            {mode !== "separate_doc" && (
              <TextControl
                label={__("Title", TEXT_DOMAIN)}
                value={title || ""}
                onChange={(value: string) => setAttributes({ title: value })}
                help={__(
                  "Override the title for this section",
                  TEXT_DOMAIN,
                )}
              />
            )}

            <TextControl
              label={__("Category", TEXT_DOMAIN)}
              value={category || ""}
              onChange={(value: string) => setAttributes({ category: value })}
              help={__(
                "Override the category for this section",
                TEXT_DOMAIN,
              )}
            />

            <TextControl
              label={__("Subcategory", TEXT_DOMAIN)}
              value={subcategory || ""}
              onChange={(value: string) =>
                setAttributes({ subcategory: value })
              }
              help={__(
                "Override the subcategory for this section",
                TEXT_DOMAIN,
              )}
            />

            <TextareaControl
              label={__("Tags", TEXT_DOMAIN)}
              value={Array.isArray(tags) ? tags.join(", ") : ""}
              onChange={handleTagsChange}
              help={__(
                "Comma-separated tags for this section",
                TEXT_DOMAIN,
              )}
              placeholder="tag1, tag2, tag3"
            />

            <TextControl
              label={__("Priority", TEXT_DOMAIN)}
              type="number"
              value={priority?.toString() || ""}
              onChange={(value: string) =>
                setAttributes({
                  priority: value ? parseInt(value, 10) : undefined,
                })
              }
              help={__(
                "Optional: Sort order or importance ranking",
                TEXT_DOMAIN,
              )}
            />
          </PanelBody>
        )}
      </InspectorControls>

      <div {...innerBlocksProps}>
        <div className="kb-section__label">
          <span className="kb-section__icon">📚</span>
          <span className="kb-section__mode-badge">
            {mode === "inherit"
              ? __("Base document", TEXT_DOMAIN)
              : mode === "separate_doc"
                ? sprintf(
                    /* translators: %s is the Knowledge Base document key. */
                    __("Document: %s", TEXT_DOMAIN),
                    docKey || __("unnamed", TEXT_DOMAIN),
                  )
                : __("Excluded", TEXT_DOMAIN)}
          </span>
        </div>
        {innerBlocksProps.children}
      </div>
    </>
  );
}
