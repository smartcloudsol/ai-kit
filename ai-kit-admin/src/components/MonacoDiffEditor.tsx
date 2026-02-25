// Monaco Diff Editor - Professional side-by-side diff viewer
// Shows original vs modified content with line-by-line differences

import { editor } from "monaco-editor";
import { DiffEditor, DiffOnMount } from "@monaco-editor/react";
import { Box, Loader, Stack, Text } from "@mantine/core";
import { __ } from "@wordpress/i18n";
import { useRef, useEffect } from "react";
import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";

export interface MonacoDiffEditorProps {
  original: string;
  modified: string;
  language: "yaml" | "markdown" | "json" | "typescript" | "plaintext";
  height?: string | number;
  theme?: "vs-dark" | "vs-light";
  readOnly?: boolean;
  enableSplitViewResizing?: boolean;
  renderSideBySide?: boolean;
}

export default function MonacoDiffEditor({
  original,
  modified,
  language,
  height = "500px",
  theme = "vs-light",
  readOnly = true,
  enableSplitViewResizing = true,
  renderSideBySide = true,
}: MonacoDiffEditorProps) {
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);

  const handleDiffEditorDidMount: DiffOnMount = (editor) => {
    editorRef.current = editor;

    // Configure diff editor
    editor.updateOptions({
      readOnly,
      enableSplitViewResizing,
      renderSideBySide,
      renderOverviewRuler: true,
      scrollBeyondLastLine: false,
      automaticLayout: true,
    });
  };

  // Cleanup on unmount to prevent dispose errors
  useEffect(() => {
    return () => {
      if (editorRef.current) {
        try {
          editorRef.current.dispose();
        } catch {
          // Ignore dispose errors - editor may already be disposed
        }
        editorRef.current = null;
      }
    };
  }, []);

  return (
    <Box
      style={{
        border: "1px solid var(--mantine-color-gray-3)",
        borderRadius: "var(--mantine-radius-sm)",
        overflow: "hidden",
      }}
    >
      <DiffEditor
        height={height}
        language={language}
        original={original}
        modified={modified}
        onMount={handleDiffEditorDidMount}
        theme={theme}
        loading={
          <Stack align="center" justify="center" style={{ height }}>
            <Loader size="md" />
            <Text size="sm" c="dimmed">
              {__("Loading diff viewer...", TEXT_DOMAIN)}
            </Text>
          </Stack>
        }
        options={{
          readOnly,
          enableSplitViewResizing,
          renderSideBySide,
          renderOverviewRuler: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          fontSize: 14,
          lineNumbers: "on",
          renderWhitespace: "selection",
          minimap: { enabled: false }, // Disable minimap in diff view
          originalEditable: !readOnly, // Allow selection and copying from both sides
          diffWordWrap: "on",
        }}
      />
    </Box>
  );
}
