import { Box, Stack, Text } from "@mantine/core";
import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";
import { __ } from "@wordpress/i18n";
import { useId } from "react";
import MonacoEditor from "./MonacoEditor";

interface BoundedJsonEditorProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  maxBytes: number;
  error?: string;
  height?: number;
  readOnly?: boolean;
}

/** Keep large JSON drafts editable without expanding the surrounding settings page. */
export default function BoundedJsonEditor({ label, description, value, onChange, maxBytes,
  error, height = 280, readOnly = false }: BoundedJsonEditorProps) {
  const id = useId();
  const message = new TextEncoder().encode(value).length > maxBytes
    ? __("JSON exceeds the size limit.", TEXT_DOMAIN) : error;
  const describedBy = [description ? `${id}-description` : null, message ? `${id}-error` : null]
    .filter(Boolean).join(" ");
  return <Stack gap={4} style={{ minWidth: 0 }}>
    <Text id={`${id}-label`} size="sm" fw={500}>{label}</Text>
    {description && <Text id={`${id}-description`} size="xs" c="dimmed">{description}</Text>}
    <Box data-bounded-json-editor role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy || undefined}
      style={{ height, minHeight: 140, maxHeight: "min(600px, 70vh)", width: "100%", maxWidth: "100%",
        minWidth: 0, resize: "vertical", overflow: "hidden" }}>
      <MonacoEditor value={value} onChange={(next) => { if (!readOnly) onChange(next ?? ""); }} readOnly={readOnly} language="json"
        height="100%" fillContainer minimap={false} wordWrap="on" ariaLabel={label}
        ariaDescribedBy={describedBy || undefined} ariaInvalid={Boolean(message)} />
    </Box>
    {message && <Text id={`${id}-error`} size="xs" c="red" role="alert">{message}</Text>}
  </Stack>;
}
