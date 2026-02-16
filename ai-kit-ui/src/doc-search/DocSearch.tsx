import {
  Alert,
  Anchor,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  AiKitDocSearchIcon,
  sendSearchMessage,
  type AiKitStatusEvent,
  type DocSearchProps,
  type SearchResult,
} from "@smart-cloud/ai-kit-core";
import { I18n } from "aws-amplify/utils";
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

import { IconSearch } from "@tabler/icons-react";

import { AiFeatureBorder } from "../ai-feature/AiFeatureBorder";
import { translations } from "../i18n";
import { useAiRun } from "../useAiRun";
import { AiKitShellInjectedProps, withAiKitShell } from "../withAiKitShell";
import { PoweredBy } from "../poweredBy";

I18n.putVocabularies(translations);

type Props = DocSearchProps & AiKitShellInjectedProps;

function groupChunksByDoc(result: SearchResult | null) {
  const docs = result?.citations?.docs ?? [];
  const chunks = result?.citations?.chunks ?? [];
  const byDoc = new Map<
    string,
    { doc: (typeof docs)[number]; chunks: typeof chunks }
  >();

  for (const doc of docs) {
    byDoc.set(doc.docId, { doc, chunks: [] });
  }
  for (const ch of chunks) {
    const cur = byDoc.get(ch.docId);
    if (cur) {
      cur.chunks.push(ch);
    } else {
      // fallback if doc list is incomplete
      byDoc.set(ch.docId, { doc: { docId: ch.docId }, chunks: [ch] });
    }
  }
  return Array.from(byDoc.values());
}

const DocSearchBase: FC<Props> = (props) => {
  const {
    autoRun = true,
    context,
    title,
    searchButtonIcon,
    showSearchButtonTitle = true,
    showSearchButtonIcon = true,
    showSources = true,
    topK = 10,
    getSearchText,

    variation,
    rootElement,
    colorMode,
    language,
    onClose,
    onClickDoc,
  } = props;

  const [query, setQuery] = useState<string>("");
  const { busy, error, statusEvent, result, run, cancel, reset } =
    useAiRun<SearchResult>();

  const autoRunOnceRef = useRef(false);

  const sessionId = result?.sessionId;
  const citationDocs = result?.citations?.docs ?? [];
  const citationChunks = result?.citations?.chunks ?? [];
  const citationAnchors = result?.citations?.anchors ?? [];
  const summaryText = result?.result ?? "";

  const buttonLeftIcon = useMemo(() => {
    if (!showSearchButtonIcon) return undefined;

    if (searchButtonIcon?.trim()) {
      return (
        <img
          src={searchButtonIcon}
          alt=""
          style={{ width: 18, height: 18, objectFit: "contain" }}
        />
      );
    }
    return <IconSearch size={18} />;
  }, [searchButtonIcon, showSearchButtonIcon]);

  const defaultTitle = useMemo(() => {
    if (language) {
      I18n.setLanguage(language || "en");
    }
    return I18n.get(title || "Search with AI-Kit");
  }, [language]);

  const statusText = useMemo(() => {
    const e: AiKitStatusEvent | null = statusEvent;
    if (!e) return null;
    // Keep this generic and short (backend / on-device messages differ).
    return I18n.get("Searching…");
  }, [language, statusEvent]);

  const inputText = useMemo(() => {
    return query || getSearchText;
  }, [query, getSearchText]);

  const canSearch = useMemo(() => {
    if (busy) return false;
    const text = typeof inputText === "function" ? inputText() : inputText;
    return Boolean(text && text.trim().length > 0);
  }, [inputText, busy]);

  const onSearch = useCallback(async () => {
    const q =
      typeof inputText === "function"
        ? (inputText as () => string)()
        : inputText;
    if (!q) return;
    setQuery(q);
    reset();
    await run(async ({ signal, onStatus }) => {
      return await sendSearchMessage(
        { sessionId, query: q, topK },
        { signal, onStatus, context },
      );
    });
  }, [context, inputText, run, reset, topK, sessionId]);

  const close = useCallback(async () => {
    reset();
    onClose();
    autoRunOnceRef.current = false;
  }, [onClose, reset, autoRunOnceRef]);

  useEffect(() => {
    if (!autoRun || !canSearch || busy || autoRunOnceRef.current) {
      return;
    }
    autoRunOnceRef.current = true;
    queueMicrotask(() => {
      void onSearch();
    });
  }, [busy, autoRunOnceRef, canSearch, autoRun, onSearch]);

  useEffect(() => {
    if (!canSearch) {
      autoRunOnceRef.current = true;
    }
  }, [canSearch]);

  const grouped = useMemo(() => groupChunksByDoc(result), [result]);

  const docNumberMap = useMemo(() => {
    const map = new Map<string, number>();
    citationDocs.forEach((doc, index) => {
      if (doc?.docId) {
        map.set(doc.docId, index + 1);
      }
    });
    return map;
  }, [citationDocs]);

  const chunkDocMap = useMemo(() => {
    const map = new Map<string, string>();
    citationChunks.forEach((chunk) => {
      if (chunk?.chunkId && chunk?.docId) {
        map.set(chunk.chunkId, chunk.docId);
      }
    });
    return map;
  }, [citationChunks]);

  const annotatedSummary = useMemo(() => {
    if (!summaryText) return "";
    if (!citationAnchors.length || docNumberMap.size === 0) {
      return summaryText;
    }

    const sortedAnchors = [...citationAnchors]
      .filter(
        (anchor) =>
          Array.isArray(anchor?.chunkIds) && anchor?.span?.end !== undefined,
      )
      .sort((a, b) => {
        const aEnd = a.span?.end ?? 0;
        const bEnd = b.span?.end ?? 0;
        return aEnd - bEnd;
      });

    let cursor = 0;
    const segments: string[] = [];

    for (const anchor of sortedAnchors) {
      const end = anchor.span?.end;
      if (typeof end !== "number" || end < cursor) {
        continue;
      }

      const refs = Array.from(
        new Set(
          (anchor.chunkIds ?? [])
            .map((chunkId) => (chunkId ? chunkDocMap.get(chunkId) : undefined))
            .map((docId) => (docId ? docNumberMap.get(docId) : undefined))
            .filter((num): num is number => typeof num === "number"),
        ),
      );

      if (!refs.length) {
        continue;
      }

      const safeEnd = Math.min(end, summaryText.length);
      segments.push(summaryText.slice(cursor, safeEnd));
      segments.push(`<sup>${refs.join(",")}</sup>`);
      cursor = safeEnd;
    }

    segments.push(summaryText.slice(cursor));
    return segments.join("");
  }, [citationAnchors, summaryText]);

  const RootComponent: typeof Modal.Root | typeof Group =
    variation === "modal" ? Modal.Root : Group;
  const ContentComponent: typeof Modal.Content | typeof Group =
    variation === "modal" ? Modal.Content : Group;
  const BodyComponent: typeof Modal.Body | typeof Group =
    variation === "modal" ? Modal.Body : Group;

  useEffect(() => {
    if (variation !== "modal") {
      return;
    }
    document.body.style.overflow = "hidden";
    document.body.onkeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    return () => {
      // remove overflow: hidden; from body element
      document.body.style.overflow = "";
      document.body.onkeydown = null;
    };
  }, [close, variation]);

  return (
    <RootComponent
      opened={true}
      className="doc-search-root"
      onClose={close}
      padding="md"
      gap="md"
      size="xl"
      portalProps={
        variation === "modal"
          ? { target: rootElement, reuseTargetNode: true }
          : undefined
      }
      data-ai-kit-theme={colorMode}
      data-ai-kit-variation={variation}
    >
      {variation === "modal" && <Modal.Overlay />}
      <ContentComponent
        w="100%"
        style={{
          left: 0,
        }}
      >
        {variation === "modal" && (
          <Modal.Header style={{ zIndex: 1000 }}>
            <AiKitDocSearchIcon className="doc-search-title-icon" />
            <Modal.Title>{I18n.get(defaultTitle)}</Modal.Title>
            <Modal.CloseButton />
          </Modal.Header>
        )}
        <BodyComponent w="100%" style={{ zIndex: 1001 }}>
          <AiFeatureBorder
            enabled={variation !== "modal"}
            working={busy}
            variation={variation}
          >
            <Paper shadow="sm" radius="md" p="md">
              <Stack gap="sm">
                {variation !== "modal" && (
                  <Title order={4} style={{ margin: 0 }}>
                    {I18n.get(defaultTitle)}
                  </Title>
                )}

                <Group gap="sm" align="flex-end" wrap="nowrap">
                  <TextInput
                    style={{ flex: 1 }}
                    value={query}
                    onChange={(e) => setQuery(e.currentTarget.value)}
                    placeholder={I18n.get("Search the documentation…")}
                    disabled={busy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canSearch) {
                        e.preventDefault();
                        void onSearch();
                      }
                    }}
                  />

                  <Button
                    variant="filled"
                    size="sm"
                    leftSection={buttonLeftIcon}
                    onClick={() => void onSearch()}
                    disabled={!canSearch}
                    className={
                      showSearchButtonTitle
                        ? "doc-search-button"
                        : "doc-search-button-no-title"
                    }
                  >
                    {showSearchButtonTitle ? I18n.get("Search") : null}
                  </Button>

                  {busy ? (
                    <Button variant="outline" size="sm" onClick={cancel}>
                      {I18n.get("Stop")}
                    </Button>
                  ) : null}
                </Group>

                {error ? (
                  <Alert color="red" title={I18n.get("Error")}>
                    {error}
                  </Alert>
                ) : null}

                {busy && statusText && (
                  <AiFeatureBorder
                    enabled={variation === "modal"}
                    working={true}
                    variation={variation}
                  >
                    <Group
                      justify="center"
                      align="center"
                      gap="sm"
                      m="sm"
                      pr="lg"
                    >
                      <Loader size="sm" />
                      <Text size="sm" c="dimmed">
                        {statusText}
                      </Text>
                    </Group>
                  </AiFeatureBorder>
                )}

                {result?.result ? (
                  <>
                    <Divider />
                    <Stack gap="xs" data-doc-search-result>
                      <Text size="sm" c="dimmed" data-doc-search-result-title>
                        {I18n.get("AI Summary")}
                      </Text>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw]}
                        data-doc-search-result-content
                      >
                        {annotatedSummary || summaryText}
                      </ReactMarkdown>
                    </Stack>
                  </>
                ) : null}

                {showSources &&
                (result?.citations?.docs?.length ||
                  result?.citations?.chunks?.length) ? (
                  <>
                    <Divider />
                    <Stack gap="sm" data-doc-search-sources>
                      <Text size="sm" c="dimmed" data-doc-search-sources-title>
                        {I18n.get("Sources")}
                      </Text>

                      {grouped.map(({ doc }) => {
                        const href = doc.sourceUrl?.trim() || undefined;
                        const docNumber = doc.docId
                          ? docNumberMap.get(doc.docId)
                          : undefined;
                        const titleText = doc.title?.trim() || doc.docId;
                        const titleNode = (
                          <Text fw={600} style={{ display: "inline" }}>
                            {docNumber ? `${docNumber}. ` : ""}
                            {titleText}
                          </Text>
                        );
                        return (
                          <Paper key={doc.docId} withBorder radius="md" p="sm">
                            <Stack gap="xs">
                              <Group justify="space-between" align="flex-start">
                                <Stack
                                  gap={2}
                                  style={{ flex: 1 }}
                                  data-doc-search-source
                                >
                                  {href ? (
                                    <Anchor
                                      href={href}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{ textDecoration: "none" }}
                                      onClick={(e) => {
                                        if (!onClickDoc) return;
                                        e.preventDefault();
                                        onClickDoc?.(doc);
                                      }}
                                      data-doc-search-source-title
                                    >
                                      {titleNode}
                                    </Anchor>
                                  ) : (
                                    titleNode
                                  )}
                                  <Anchor
                                    href={href}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ textDecoration: "none" }}
                                    onClick={(e) => {
                                      if (!onClickDoc) return;
                                      e.preventDefault();
                                      onClickDoc?.(doc);
                                    }}
                                    data-doc-search-source-url
                                  >
                                    {doc.sourceUrl}
                                  </Anchor>
                                  {doc.author ? (
                                    <Text
                                      size="xs"
                                      c="dimmed"
                                      data-doc-search-source-author
                                    >
                                      {doc.author}
                                    </Text>
                                  ) : null}
                                  {doc.description ? (
                                    <Text
                                      size="sm"
                                      c="dimmed"
                                      fs="italic"
                                      data-doc-search-source-description
                                    >
                                      {doc.description}
                                    </Text>
                                  ) : null}
                                </Stack>
                              </Group>
                            </Stack>
                          </Paper>
                        );
                      })}
                    </Stack>
                  </>
                ) : null}
                {!busy && !error && !result?.result ? (
                  <Text size="sm" c="dimmed" data-doc-search-no-results>
                    {I18n.get("Enter a search query to start.")}
                  </Text>
                ) : null}
                <PoweredBy variation={variation} />
              </Stack>
            </Paper>
          </AiFeatureBorder>
        </BodyComponent>
      </ContentComponent>
    </RootComponent>
  );
};

export const DocSearch = withAiKitShell(DocSearchBase);
