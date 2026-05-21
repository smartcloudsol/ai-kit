import { Anchor, Text } from "@mantine/core";
import { getAiKitPlugin } from "@smart-cloud/ai-kit-core";
import { I18n } from "aws-amplify/utils";
import { FC } from "react";

const aiKit = getAiKitPlugin();

export const PoweredBy: FC<{ variation?: "default" | "modal" }> = ({
  variation,
}) => {
  return (
    <div
      style={{
        display: aiKit.settings?.enablePoweredBy ? "flex" : "none",
        justifyContent: aiKit.settings?.enablePoweredBy
          ? "flex-end"
          : undefined,
        padding: 0,
        marginRight: "var(--ai-kit-spacing-sm)",
        marginBottom:
          variation === "default" ? "var(--ai-kit-spacing-sm)" : undefined,
      }}
      className={aiKit.settings?.enablePoweredBy ? undefined : "sr-only"}
    >
      <Text c="p" ta="right" fs="italic" fz="xs">
        {I18n.get("Powered by")}{" "}
        <Anchor
          href="https://wpsuite.io/ai-kit/"
          target="_blank"
          td="none"
          fz="xs"
          fw={400}
        >
          {I18n.get("WPSuite AI-Kit")}
        </Anchor>
      </Text>
    </div>
  );
};
