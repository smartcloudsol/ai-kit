import { AiKitFeatureIcon, TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";
import { registerBlockType, type BlockAttributes } from "@wordpress/blocks";
import metadata from "./block.json";
import { Edit } from "./edit";
import { Save } from "./save";

import "./index.css";

/**
 * Every block starts by registering a new block type definition.
 *
 * @see https://developer.wordpress.org/block-editor/reference-guides/block-api/block-registration/
 */
registerBlockType(metadata.name, {
  attributes: metadata.attributes as BlockAttributes,
  title: metadata.title,
  category: metadata.category,
  description: metadata.description,
  edit: Edit,
  save: Save,
  icon: <AiKitFeatureIcon style={{ fill: "none" }} />,
  textdomain: TEXT_DOMAIN,
});
