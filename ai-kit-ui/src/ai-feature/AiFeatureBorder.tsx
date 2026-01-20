export function AiFeatureBorder({
  enabled = true,
  working = false,
  variation = "default",
  children,
}: React.PropsWithChildren<{
  enabled?: boolean;
  working?: boolean;
  variation?: string;
}>) {
  const active = Boolean(enabled && working);

  return (
    <div
      className="ai-kit-feature-border"
      data-ai-kit-active={active ? "true" : "false"}
      data-ai-kit-variation={variation}
    >
      <div className="ai-kit-feature-border__content">{children}</div>
    </div>
  );
}
