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
import { useEffect } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
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
          title={__("KB Section Settings", "smartcloud-ai-kit")}
          initialOpen={true}
        >
          <SelectControl
            label={__("Mode", "smartcloud-ai-kit")}
            value={mode}
            options={[
              {
                label: __("Inherit (part of base doc)", "smartcloud-ai-kit"),
                value: "inherit",
              },
              {
                label: __("Separate Document", "smartcloud-ai-kit"),
                value: "separate_doc",
              },
              {
                label: __("Exclude from KB", "smartcloud-ai-kit"),
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
                    "smartcloud-ai-kit",
                  )
                : mode === "separate_doc"
                ? __(
                    "This section will be extracted as a separate document",
                    "smartcloud-ai-kit",
                  )
                : __(
                    "This section will be excluded from the knowledge base",
                    "smartcloud-ai-kit",
                  )
            }
          />

          {mode === "separate_doc" && (
            <>
              <TextControl
                label={__("Document Key", "smartcloud-ai-kit")}
                value={docKey || ""}
                onChange={(value: string) => setAttributes({ docKey: value })}
                help={__(
                  'Unique identifier for this document (e.g., "pricing", "faq")',
                  "smartcloud-ai-kit",
                )}
                placeholder="e.g., pricing"
              />
              <TextControl
                label={__("Document Title", "smartcloud-ai-kit") + " *"}
                value={title || ""}
                onChange={(value: string) => setAttributes({ title: value })}
                help={__(
                  "Required: Title for this separate document",
                  "smartcloud-ai-kit",
                )}
                placeholder="e.g., Pricing Information"
                required
              />
              <TextareaControl
                label={__("Document Description", "smartcloud-ai-kit")}
                value={description || ""}
                onChange={(value: string) =>
                  setAttributes({ description: value })
                }
                help={__(
                  "Optional description stored in document metadata. Leave empty to fall back to the source post excerpt.",
                  "smartcloud-ai-kit",
                )}
                placeholder={__(
                  "Short summary shown in Doc Search results...",
                  "smartcloud-ai-kit",
                )}
              />
              <TextControl
                label={__("Source URL", "smartcloud-ai-kit")}
                value={postUrl || ""}
                onChange={(value: string) => setAttributes({ postUrl: value })}
                help={__(
                  "Optional URL stored in document metadata. Leave empty so separate documents can inherit the base document URL.",
                  "smartcloud-ai-kit",
                )}
                placeholder="https://example.com/custom-page"
              />
            </>
          )}

          <TextControl
            label={__("Section Key", "smartcloud-ai-kit")}
            value={sectionKey || ""}
            onChange={(value: string) => setAttributes({ sectionKey: value })}
            help={__(
              "Optional: Custom section identifier. Defaults to block client ID.",
              "smartcloud-ai-kit",
            )}
            placeholder={`Auto: ${clientId.substring(0, 8)}...`}
          />
        </PanelBody>

        {mode === "separate_doc" && (
          <PanelBody
            title={__("Metadata Overrides", "smartcloud-ai-kit")}
            initialOpen={false}
          >
            {mode !== "separate_doc" && (
              <TextControl
                label={__("Title", "smartcloud-ai-kit")}
                value={title || ""}
                onChange={(value: string) => setAttributes({ title: value })}
                help={__(
                  "Override the title for this section",
                  "smartcloud-ai-kit",
                )}
              />
            )}

            <TextControl
              label={__("Category", "smartcloud-ai-kit")}
              value={category || ""}
              onChange={(value: string) => setAttributes({ category: value })}
              help={__(
                "Override the category for this section",
                "smartcloud-ai-kit",
              )}
            />

            <TextControl
              label={__("Subcategory", "smartcloud-ai-kit")}
              value={subcategory || ""}
              onChange={(value: string) =>
                setAttributes({ subcategory: value })
              }
              help={__(
                "Override the subcategory for this section",
                "smartcloud-ai-kit",
              )}
            />

            <TextareaControl
              label={__("Tags", "smartcloud-ai-kit")}
              value={Array.isArray(tags) ? tags.join(", ") : ""}
              onChange={handleTagsChange}
              help={__(
                "Comma-separated tags for this section",
                "smartcloud-ai-kit",
              )}
              placeholder="tag1, tag2, tag3"
            />

            <TextControl
              label={__("Priority", "smartcloud-ai-kit")}
              type="number"
              value={priority?.toString() || ""}
              onChange={(value: string) =>
                setAttributes({
                  priority: value ? parseInt(value, 10) : undefined,
                })
              }
              help={__(
                "Optional: Sort order or importance ranking",
                "smartcloud-ai-kit",
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
              ? "Base Doc"
              : mode === "separate_doc"
              ? `Doc: ${docKey || "unnamed"}`
              : "Excluded"}
          </span>
        </div>
        {innerBlocksProps.children}
      </div>
    </>
  );
}
