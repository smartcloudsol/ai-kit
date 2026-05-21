import { useBlockProps, useInnerBlocksProps } from "@wordpress/block-editor";
import { type ReactNode } from "react";

export const Save = () => {
  const blockProps = useBlockProps.save();
  const { children, ...innerBlocksProps } =
    useInnerBlocksProps.save(blockProps);
  return <div {...innerBlocksProps}>{children as ReactNode}</div>;
};
