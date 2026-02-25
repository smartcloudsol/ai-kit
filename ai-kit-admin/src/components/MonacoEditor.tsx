// Monaco Editor Wrapper - Professional code editor with syntax highlighting
// Supports: YAML, Markdown, JSON, TypeScript, and more

import { useEffect, useRef } from "react";
import Editor, { OnMount, Monaco } from "@monaco-editor/react";
import { Box, Loader, Stack, Text } from "@mantine/core";
import { __ } from "@wordpress/i18n";
import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";

export interface MonacoEditorProps {
  value: string;
  onChange?: (value: string | undefined) => void;
  language: "yaml" | "markdown" | "json" | "typescript" | "plaintext";
  height?: string | number;
  readOnly?: boolean;
  theme?: "vs-dark" | "vs-light";
  minimap?: boolean;
  wordWrap?: "on" | "off" | "wordWrapColumn" | "bounded";
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
}: MonacoEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

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
    });
  };

  const handleEditorChange = (newValue: string | undefined) => {
    if (onChange) {
      onChange(newValue);
    }
  };

  // Configure Monaco for better YAML/Markdown support
  useEffect(() => {
    if (monacoRef.current) {
      const monaco = monacoRef.current;

      // Markdown configuration
      monaco.languages.setLanguageConfiguration("markdown", {
        wordPattern:
          /(-?\d*\.\d\w*)|([^`~!@#%^&*()\-=+[{}\]\\|;:'",.<>/?\\s]+)/g,
      });

      // YAML configuration
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
    }
  }, []);

  return (
    <Box
      style={{
        border: "1px solid var(--mantine-color-gray-3)",
        borderRadius: "var(--mantine-radius-sm)",
        overflow: "hidden",
      }}
    >
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        theme={theme}
        loading={
          <Stack align="center" justify="center" style={{ height }}>
            <Loader size="md" />
            <Text size="sm" c="dimmed">
              {__("Loading editor...", TEXT_DOMAIN)}
            </Text>
          </Stack>
        }
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
        }}
      />
    </Box>
  );
}
