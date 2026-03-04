import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Collapse,
  Divider,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Paper,
  Progress,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  AiKitDocSearchIcon,
  CapabilityDecision,
  dispatchBackend,
  resolveBackend,
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

import {
  IconChevronDown,
  IconChevronRight,
  IconMicrophone,
  IconMicrophoneOff,
  IconSearch,
  IconX,
} from "@tabler/icons-react";

import { AiFeatureBorder } from "../ai-feature/AiFeatureBorder";
import { translations } from "../i18n";
import { PoweredBy } from "../poweredBy";
import { useAiRun } from "../useAiRun";
import { AiKitShellInjectedProps, withAiKitShell } from "../withAiKitShell";

I18n.putVocabularies(translations);

type Props = DocSearchProps & AiKitShellInjectedProps;

const USE_AUDIO = false; // Set to true to enable audio recording feature (requires backend support for audio input)

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
    showOpenButton = false,
    openButtonTitle,
    showOpenButtonTitle = true,
    openButtonIcon,
    showOpenButtonIcon = true,
    searchButtonIcon,
    showSearchButtonTitle = true,
    showSearchButtonIcon = true,
    showSources = true,
    topK = 10,
    getSearchText,
    enableUserFilters = false,
    availableCategories,
    availableTags,

    variation,
    rootElement,
    colorMode,
    language,
    onClose,
    onClickDoc,
  } = props;

  const [featureOpen, setFeatureOpen] = useState<boolean>(!showOpenButton);
  const [query, setQuery] = useState<string>("");
  const [recording, setRecording] = useState<boolean>(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // User filter states
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>(
    [],
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearchValue, setTagSearchValue] = useState<string>("");
  const [metadataOptions, setMetadataOptions] = useState<{
    allowedCategories: Record<string, string[]>;
    allowedTags: string[];
  } | null>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const animationFrameRef = useRef<number | null>(null);

  // Audio cache: store uploaded audio to avoid re-uploading within session
  const audioCacheRef = useRef<{
    blob: Blob;
    uploadTimestamp: number;
  } | null>(null);
  const AUDIO_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  const { busy, error, statusEvent, result, run, cancel, reset } =
    useAiRun<SearchResult>();

  const autoRunOnceRef = useRef(false);
  const prevSelectedCategoriesRef = useRef<string[]>([]);

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
    if (!featureOpen) return false;
    // Can search if we have text OR audio
    const text = typeof inputText === "function" ? inputText() : inputText;
    return Boolean((text && text.trim().length > 0) || audioBlob);
  }, [inputText, busy, audioBlob, featureOpen]);

  const hasValidFilterOptions = useMemo(() => {
    if (!metadataOptions) return false;
    const hasCategories =
      Object.keys(metadataOptions.allowedCategories).length > 0;
    const hasTags = metadataOptions.allowedTags.length > 0;
    return hasCategories || hasTags;
  }, [metadataOptions]);

  const subcategories = useMemo(() => {
    if (selectedCategories.length === 0 || !metadataOptions) {
      return [];
    }
    return selectedCategories
      .flatMap(
        (cat) =>
          metadataOptions.allowedCategories[
          cat
          ] || [],
      )
      .filter(
        (subcat, index, self) =>
          self.indexOf(subcat) === index,
      )
  }, [selectedCategories, metadataOptions]);

  const startRecording = useCallback(async () => {
    try {
      // Clear query input when starting audio recording
      setQuery("");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      // Setup audio analysis for visual feedback
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048; // Higher for smoother results
      analyser.smoothingTimeConstant = 0.8; // Smoother transitions
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Monitor audio level using time domain data (more reliable)
      const dataArray = new Uint8Array(analyser.fftSize);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);

        // Calculate RMS (Root Mean Square) for accurate volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i]! - 128) / 128; // Normalize to -1 to 1
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / dataArray.length);

        // Convert to percentage (0-100) with scaling for better visibility
        const level = Math.min(100, rms * 200);
        setAudioLevel(level);

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach((track) => track.stop());

        // Cleanup audio analysis
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        analyserRef.current = null;
        setAudioLevel(0);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }, [recording]);

  const clearAudio = useCallback(() => {
    setAudioBlob(null);
    audioChunksRef.current = [];
    setAudioLevel(0);
    // Clear audio cache when user manually clears audio
    audioCacheRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Load metadata options when user filters are enabled
  useEffect(() => {
    if (!enableUserFilters) return;

    // Use provided options if available
    if (availableCategories || availableTags) {
      setMetadataOptions({
        allowedCategories: availableCategories || {},
        allowedTags: availableTags || [],
      });
      return;
    }

    // Otherwise fetch from backend
    const loadMetadata = async () => {
      setLoadingMetadata(true);
      try {
        const backend = await resolveBackend();

        if (!backend.available) {
          console.error("Backend not available for metadata options");
          return;
        }

        const decision: CapabilityDecision = {
          feature: "prompt",
          source: "backend",
          mode: "backend-only",
          onDeviceAvailable: false,
          backendAvailable: backend.available,
          backendTransport: backend.transport,
          backendApiName: backend.apiName,
          backendBaseUrl: backend.baseUrl,
          reason: backend.reason ?? "",
        };

        const data = (await dispatchBackend(
          decision,
          context ?? "frontend",
          "/kb/metadata-options",
          "GET",
          null,
          {},
        )) as {
          allowedCategories: Record<string, string[]>;
          allowedTags: string[];
        };

        setMetadataOptions({
          allowedCategories: data.allowedCategories || {},
          allowedTags: data.allowedTags || [],
        });
      } catch (error) {
        console.error("Failed to load metadata options:", error);
      } finally {
        setLoadingMetadata(false);
      }
    };

    void loadMetadata();
  }, [enableUserFilters, availableCategories, availableTags, context]);

  const onSearch = useCallback(async () => {
    let q: string | undefined;

    // Get text query if available (not recording audio)
    if (!audioBlob) {
      q =
        typeof inputText === "function"
          ? (inputText as () => string)()
          : inputText;
      if (!q) return;
      setQuery(q);
    }

    console.log("Starting search with query:", q, "and audio:", audioBlob);

    // Check if we can reuse cached audio (same blob within TTL)
    const now = Date.now();
    const isSameAudio =
      audioBlob &&
      audioCacheRef.current?.blob === audioBlob &&
      now - audioCacheRef.current.uploadTimestamp < AUDIO_CACHE_TTL;

    if (audioBlob && !isSameAudio) {
      // Update cache for new audio blob
      audioCacheRef.current = {
        blob: audioBlob,
        uploadTimestamp: now,
      };
      console.log("Audio cache updated for new recording");
    } else if (isSameAudio) {
      console.log(
        "Reusing cached audio (no re-upload needed within",
        Math.round(
          (AUDIO_CACHE_TTL - (now - audioCacheRef.current!.uploadTimestamp)) /
          1000,
        ),
        "seconds)",
      );
    }

    reset();
    await run(async ({ signal, onStatus }) => {
      return await sendSearchMessage(
        {
          sessionId,
          ...(q && { query: q }),
          ...(audioBlob && { audio: audioBlob }), // Pass Blob directly
          topK,
          // Include user-selected filters if enabled
          // Always send userSelectedCategories array when enableUserFilters is true (even if empty)
          // to prevent backend from applying its own kb-filter
          ...(enableUserFilters && {
            userSelectedCategories: selectedCategories,
          }),
          ...(enableUserFilters &&
            selectedSubcategories.length > 0 && {
            userSelectedSubcategories: selectedSubcategories,
          }),
          ...(enableUserFilters &&
            selectedTags.length > 0 && { userSelectedTags: selectedTags }),
        },
        { signal, onStatus, context },
      );
    });
  }, [
    context,
    inputText,
    audioBlob,
    run,
    reset,
    topK,
    sessionId,
    enableUserFilters,
    selectedCategories,
    selectedSubcategories,
    selectedTags,
  ]);

  const close = useCallback(async () => {
    setFeatureOpen(false);
    reset();
    //autoRunOnceRef.current = false;
    if (!showOpenButton) {
      onClose();
    }
  }, [onClose, reset, autoRunOnceRef, showOpenButton]);

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

  // Reset session when main categories change
  useEffect(() => {
    const prev = prevSelectedCategoriesRef.current;
    const current = selectedCategories;

    // Check if categories changed (different length or different items)
    const categoriesChanged =
      prev.length !== current.length ||
      !current.every((cat) => prev.includes(cat));

    if (categoriesChanged && prev.length > 0) {
      // Reset session only if we had categories before (not on initial mount)
      reset();
    }

    prevSelectedCategoriesRef.current = [...current];
  }, [selectedCategories, reset]);

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
    if (variation !== "modal" || !featureOpen) {
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
  }, [close, variation, featureOpen]);

  return (
    <>
      {showOpenButton && (
        <Button
          leftSection={
            showOpenButtonIcon &&
            (openButtonIcon ? (
              <span dangerouslySetInnerHTML={{ __html: openButtonIcon }} />
            ) : (
              <IconSearch size={18} />
            ))
          }
          className={
            showOpenButtonTitle
              ? "ai-feature-open-button"
              : "ai-feature-open-button-no-title"
          }
          variant={"filled"}
          disabled={featureOpen}
          onClick={() => setFeatureOpen(true)}
          data-ai-kit-open-button
        >
          {showOpenButtonTitle && I18n.get(openButtonTitle || defaultTitle)}
        </Button>
      )}

      {featureOpen && (
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
              ...(variation === "modal" &&
                !result?.result && { overflow: "visible" }),
            }}
          >
            {variation === "modal" && (
              <Modal.Header style={{ zIndex: 1000 }}>
                <AiKitDocSearchIcon className="doc-search-title-icon" />
                <Modal.Title>{I18n.get(defaultTitle)}</Modal.Title>
                <Modal.CloseButton />
              </Modal.Header>
            )}
            <BodyComponent
              w="100%"
              style={{
                zIndex: 1001,
                ...(variation === "modal" &&
                  !result?.result && { overflow: "visible" }),
              }}
            >
              <AiFeatureBorder
                enabled={variation !== "modal"}
                working={busy}
                variation={variation}
              >
                <Paper shadow="sm" radius="md" p="md">
                  <Stack gap="sm">
                    {variation !== "modal" && (
                      <Group justify="space-between">
                        <Title order={4} style={{ margin: 0 }}>
                          {I18n.get(defaultTitle)}
                        </Title>
                        {showOpenButton && (
                          <Button
                            variant="subtle"
                            color="gray"
                            size="xs"
                            onClick={close}
                            style={{
                              minWidth: 32,
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            aria-label={I18n.get("Close")}
                          >
                            <IconX
                              size={18}
                              style={{
                                color:
                                  colorMode === "dark"
                                    ? "var(--mantine-color-dark-1)"
                                    : "var(--mantine-color-gray-7)",
                              }}
                            />
                          </Button>
                        )}
                      </Group>
                    )}

                    <Group gap="sm" align="flex-end" wrap="nowrap">
                      <TextInput
                        style={{ flex: 1 }}
                        value={query}
                        onChange={(e) => {
                          setQuery(e.currentTarget.value);
                          // Clear audio when typing
                          if (audioBlob) {
                            clearAudio();
                          }
                        }}
                        placeholder={
                          audioBlob
                            ? I18n.get("Audio recorded")
                            : I18n.get("Search the documentation…")
                        }
                        disabled={busy || recording || !!audioBlob}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && canSearch) {
                            e.preventDefault();
                            void onSearch();
                          }
                        }}
                      />

                      {
                        /* Microphone button */ USE_AUDIO && (
                          <>
                            {audioBlob ? (
                              <Button
                                variant="outline"
                                size="sm"
                                color="red"
                                onClick={clearAudio}
                                disabled={busy}
                                title={I18n.get("Clear audio")}
                              >
                                <IconMicrophoneOff size={18} />
                              </Button>
                            ) : (
                              <Button
                                variant={recording ? "filled" : "outline"}
                                size="sm"
                                color={recording ? "red" : "gray"}
                                onClick={
                                  recording ? stopRecording : startRecording
                                }
                                disabled={busy}
                                title={
                                  recording
                                    ? I18n.get("Stop recording")
                                    : I18n.get("Record audio")
                                }
                                style={
                                  recording
                                    ? {
                                      transform: `scale(${1 + audioLevel / 300})`,
                                      transition: "transform 0.1s ease-out",
                                    }
                                    : undefined
                                }
                              >
                                <IconMicrophone size={18} />
                              </Button>
                            )}
                          </>
                        )
                      }

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

                    {/* Empty state */}
                    {!busy && !error && !result?.result ? (
                      <Text size="sm" c="dimmed" data-doc-search-no-results>
                        {I18n.get("Enter a search query to start.")}
                      </Text>
                    ) : null}

                    {/* User filter collapse */}
                    {enableUserFilters &&
                      metadataOptions &&
                      hasValidFilterOptions && (
                        <Stack gap="xs">
                          <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => setFiltersOpen(!filtersOpen)}
                            leftSection={
                              filtersOpen ? (
                                <IconChevronDown size={14} />
                              ) : (
                                <IconChevronRight size={14} />
                              )
                            }
                            style={{ alignSelf: "flex-start" }}
                          >
                            {I18n.get("Filters")}
                          </Button>

                          <Collapse in={filtersOpen}>
                            <Stack gap="md">
                              {/* Main categories as checkboxes */}
                              {Object.keys(metadataOptions.allowedCategories)
                                .length > 0 && (
                                  <div>
                                    <Text size="sm" fw={500} mb="xs">
                                      {I18n.get("Categories")}
                                    </Text>
                                    <Group gap="md">
                                      {Object.keys(
                                        metadataOptions.allowedCategories,
                                      ).map((category) => (
                                        <Checkbox
                                          key={category}
                                          label={I18n.get(category)}
                                          checked={selectedCategories.includes(
                                            category,
                                          )}
                                          onChange={(e) => {
                                            if (e.currentTarget.checked) {
                                              setSelectedCategories([
                                                ...selectedCategories,
                                                category,
                                              ]);
                                            } else {
                                              setSelectedCategories(
                                                selectedCategories.filter(
                                                  (c) => c !== category,
                                                ),
                                              );
                                              // Remove subcategories of unchecked category
                                              const subcatsToRemove =
                                                metadataOptions.allowedCategories[
                                                category
                                                ] || [];
                                              setSelectedSubcategories(
                                                selectedSubcategories.filter(
                                                  (sc) =>
                                                    !subcatsToRemove.includes(sc),
                                                ),
                                              );
                                            }
                                          }}
                                          disabled={busy || loadingMetadata}
                                        />
                                      ))}
                                    </Group>
                                  </div>
                                )}

                              {/* Subcategories for selected categories */}
                              {subcategories.length > 0 && (
                                <div>
                                  <Text size="sm" fw={500} mb="xs">
                                    {I18n.get("Subcategories")}
                                  </Text>
                                  <Group gap="md">
                                    {subcategories
                                      .map((subcat) => (
                                        <Checkbox
                                          key={subcat}
                                          label={I18n.get(subcat)}
                                          checked={selectedSubcategories.includes(
                                            subcat,
                                          )}
                                          onChange={(e) => {
                                            if (e.currentTarget.checked) {
                                              setSelectedSubcategories([
                                                ...selectedSubcategories,
                                                subcat,
                                              ]);
                                            } else {
                                              setSelectedSubcategories(
                                                selectedSubcategories.filter(
                                                  (sc) => sc !== subcat,
                                                ),
                                              );
                                            }
                                          }}
                                          disabled={busy || loadingMetadata}
                                        />
                                      ))}
                                  </Group>
                                </div>
                              )}

                              {/* Tags input */}
                              {metadataOptions.allowedTags.length > 0 && (
                                <MultiSelect
                                  label={I18n.get("Tags")}
                                  placeholder={I18n.get(
                                    "Select or type tags...",
                                  )}
                                  data={metadataOptions.allowedTags.map(
                                    (tag) => ({
                                      value: tag,
                                      label: I18n.get(tag),
                                    }),
                                  )}
                                  value={selectedTags}
                                  onChange={setSelectedTags}
                                  searchValue={tagSearchValue}
                                  onSearchChange={setTagSearchValue}
                                  disabled={busy || loadingMetadata}
                                  searchable
                                  clearable
                                  maxDropdownHeight={200}
                                  limit={20}
                                />
                              )}
                            </Stack>
                          </Collapse>
                        </Stack>
                      )}

                    {
                      /* Audio level indicator when recording */ USE_AUDIO && (
                        <>
                          {recording && (
                            <Stack gap="xs">
                              <Text size="xs" c="dimmed">
                                {I18n.get("Recording...")} 🎤
                              </Text>
                              <Progress
                                value={audioLevel}
                                size="sm"
                                color="red"
                                animated
                                striped
                              />
                            </Stack>
                          )}

                          {/* Audio playback when recorded */}
                          {audioBlob && !recording && (
                            <Stack gap="xs">
                              <Text size="xs" c="dimmed">
                                {I18n.get("Recorded audio:")}
                              </Text>
                              <audio
                                controls
                                src={URL.createObjectURL(audioBlob)}
                                className="ai-kit-audio-player"
                              />
                            </Stack>
                          )}
                        </>
                      )
                    }

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
                          <Text
                            size="sm"
                            c="dimmed"
                            data-doc-search-result-title
                          >
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
                          <Text
                            size="sm"
                            c="dimmed"
                            data-doc-search-sources-title
                          >
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
                              <Paper
                                key={doc.docId}
                                withBorder
                                radius="md"
                                p="sm"
                              >
                                <Stack gap="xs">
                                  <Group
                                    justify="space-between"
                                    align="flex-start"
                                  >
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
                    <PoweredBy variation={variation} />
                  </Stack>
                </Paper>
              </AiFeatureBorder>
            </BodyComponent>
          </ContentComponent>
        </RootComponent>
      )}
    </>
  );
};

export const DocSearch = withAiKitShell(DocSearchBase);
