// Monaco Diff Editor - Professional side-by-side diff viewer
// Shows original vs modified content with line-by-line differences

import type { DiffOnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { Box, Loader, Stack, Text } from "@mantine/core";
import { __ } from "@wordpress/i18n";
import { useEffect, useRef, useState } from "react";
import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";
import { ensureMonacoInitialized, loadMonacoReactModule } from "./monaco-init";

export interface MonacoDiffEditorProps {
  original: string;
  modified: string;
  language: "yaml" | "json" | "markdown" | "plaintext";
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [DiffEditorComponent, setDiffEditorComponent] = useState<
    (typeof import("@monaco-editor/react"))["DiffEditor"] | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([ensureMonacoInitialized(), loadMonacoReactModule()])
      .then(([, monacoReactModule]) => {
        if (!cancelled) {
          setDiffEditorComponent(() => monacoReactModule.DiffEditor);
          setLoadError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load diff editor.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  const loadingState = (
    <Stack align="center" justify="center" style={{ height }}>
      <Loader size="md" />
      <Text size="sm" c="dimmed">
        {__("Loading diff viewer...", TEXT_DOMAIN)}
      </Text>
    </Stack>
  );

  return (
    <Box
      style={{
        border: "1px solid var(--mantine-color-gray-3)",
        borderRadius: "var(--mantine-radius-sm)",
        overflow: "hidden",
      }}
    >
      {DiffEditorComponent ? (
        <DiffEditorComponent
          height={height}
          language={language}
          original={original}
          modified={modified}
          onMount={handleDiffEditorDidMount}
          theme={theme}
          loading={loadingState}
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
            minimap: { enabled: false },
            originalEditable: !readOnly,
            diffWordWrap: "on",
          }}
        />
      ) : loadError ? (
        <Stack align="center" justify="center" style={{ height }}>
          <Text size="sm" c="red">
            {loadError}
          </Text>
        </Stack>
      ) : (
        loadingState
      )}
    </Box>
  );
}
