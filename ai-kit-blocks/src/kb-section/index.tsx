import { BlockAttributes, registerBlockType } from "@wordpress/blocks";
import metadata from "./block.json";
import Edit from "./edit";
import Save from "./save";
import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";

registerBlockType(metadata.name, {
  apiVersion: metadata.apiVersion,
  attributes: metadata.attributes as BlockAttributes,
  title: metadata.title,
  category: metadata.category,
  description: metadata.description,
  edit: Edit,
  save: Save,
  /*icon: <AiKitKbSectionIcon style={{ fill: "none" }} />,*/
  textdomain: TEXT_DOMAIN,
});
