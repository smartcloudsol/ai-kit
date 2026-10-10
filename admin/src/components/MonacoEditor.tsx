// Monaco Editor Wrapper - Professional code editor with syntax highlighting
// Supports: YAML, JSON, Markdown, and plaintext

import { useEffect, useRef, useState } from "react";
import type { Monaco, OnMount } from "@monaco-editor/react";
import { Box, Loader, Stack, Text } from "@mantine/core";
import { __ } from "@wordpress/i18n";
import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";
import { ensureMonacoInitialized, loadMonacoReactModule } from "./monaco-init";

export interface MonacoEditorProps {
  value: string;
  onChange?: (value: string | undefined) => void;
  language: "yaml" | "json" | "markdown" | "plaintext";
  height?: string | number;
  readOnly?: boolean;
  theme?: "vs-dark" | "vs-light";
  minimap?: boolean;
  wordWrap?: "on" | "off" | "wordWrapColumn" | "bounded";
  fillContainer?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
}

export default function MonacoEditor({
  value,
  onChange,
  language,
  height = "500px",
  readOnly = false,
  theme = "vs-light",
  minimap = true,
  wordWrap = "on",
  fillContainer = false,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
}: MonacoEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [EditorComponent, setEditorComponent] = useState<
    (typeof import("@monaco-editor/react"))["default"] | null
  >(null);

  const applyAccessibility = (editor: Parameters<OnMount>[0]) => {
    if (!ariaLabel && ariaDescribedBy === undefined && ariaInvalid === undefined) return;
    const input = editor.getDomNode()?.querySelector('[role="textbox"]');
    if (!input) return;
    if (ariaDescribedBy) input.setAttribute("aria-describedby", ariaDescribedBy);
    else input.removeAttribute("aria-describedby");
    input.setAttribute("aria-invalid", String(ariaInvalid ?? false));
  };

  useEffect(() => {
    if (!ariaLabel && ariaDescribedBy === undefined && ariaInvalid === undefined) return;
    const input = editorRef.current?.getDomNode()?.querySelector('[role="textbox"]');
    if (!input) return;
    if (ariaDescribedBy) input.setAttribute("aria-describedby", ariaDescribedBy);
    else input.removeAttribute("aria-describedby");
    input.setAttribute("aria-invalid", String(ariaInvalid ?? false));
  }, [ariaLabel, ariaDescribedBy, ariaInvalid]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([ensureMonacoInitialized(), loadMonacoReactModule()])
      .then(([, monacoReactModule]) => {
        if (!cancelled) {
          setEditorComponent(() => monacoReactModule.default);
          setLoadError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load editor.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    monaco.languages.setLanguageConfiguration("markdown", {
      wordPattern: /[^\s]+/g,
    });

    monaco.languages.setLanguageConfiguration("yaml", {
      comments: {
        lineComment: "#",
      },
      brackets: [
        ["{", "}"],
        ["[", "]"],
      ],
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
      ],
    });

    // Configure editor
    editor.updateOptions({
      readOnly,
      wordWrap,
      minimap: { enabled: minimap },
      fontSize: 14,
      lineNumbers: "on",
      renderWhitespace: "selection",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      ...(ariaLabel ? { ariaLabel } : {}),
    });
    applyAccessibility(editor);
  };

  const handleEditorChange = (newValue: string | undefined) => {
    if (onChange) {
      onChange(newValue);
    }
  };

  const loadingState = (
    <Stack align="center" justify="center" style={{ height }}>
      <Loader size="md" />
      <Text size="sm" c="dimmed">
        {__("Loading editor...", TEXT_DOMAIN)}
      </Text>
    </Stack>
  );

  return (
    <Box
      style={{
        border: "1px solid var(--mantine-color-gray-3)",
        borderRadius: "var(--mantine-radius-sm)",
        overflow: "hidden",
        ...(fillContainer ? { height: "100%", minHeight: 0, minWidth: 0 } : {}),
      }}
    >
      {EditorComponent ? (
        <EditorComponent
          height={height}
          language={language}
          value={value}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          theme={theme}
          loading={loadingState}
          options={{
            readOnly,
            wordWrap,
            minimap: { enabled: minimap },
            fontSize: 14,
            lineNumbers: "on",
            renderWhitespace: "selection",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            formatOnPaste: true,
            formatOnType: true,
            ...(ariaLabel ? { ariaLabel } : {}),
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
