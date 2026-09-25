import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Group,
  Input,
  List,
  Modal,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import {
  IconMaximize,
  IconMessage,
  IconMicrophone,
  IconMinimize,
  IconPaperclip,
  IconPencil,
  IconPlayerStop,
  IconSend,
  IconTrash,
  IconX,
  IconWorld,
  IconSearch,
  IconCalculator,
  IconCode,
  IconBrain,
  IconSparkles,
} from "@tabler/icons-react";

import {
  DEFAULT_CHATBOT_AI_DISCLOSURE,
  formatAiDisclosure,
  getStoreSelect,
  sendChatMessage,
  sendFeedbackMessage,
  type AiChatbotLabels,
  type AiChatbotProps,
  type AiKitStatusEvent,
  type HistoryStorageMode,
  type ProcessedCitations,
} from "@smart-cloud/ai-kit-core";
import { useSelect } from "@wordpress/data";
import { useAiKitI18n } from "../locale";
import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useAiRun } from "../useAiRun";
import { AiKitShellInjectedProps, withAiKitShell } from "../withAiKitShell";
import {
  cleanupDanglingAttachments,
  clearAllAttachments,
  loadAttachmentBlob,
  persistAttachmentBlob,
} from "./attachmentStorage";
import {
  normalizeChatCitations,
  type CitationLike,
} from "./citations";
import {
  discoverChatStreamUrl,
  runChatStreamTurn,
  sendChatStreamCancel,
  type ChatActivity,
  type ChatStreamCheckpoint,
  type ChatStreamResult,
  type ChatStreamView,
  summarizeChatActivities,
  isToolActivity,
  isSummaryActivity,
} from "./chatStream";


const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const USE_AUDIO = false; // Set to true to enable audio recording feature (requires backend support for audio input)

// New: history storage support
const DEFAULT_PRESERVATION_TIME_DAYS = 1;
const DEFAULT_HISTORY_STORAGE: HistoryStorageMode = "localstorage";
const HISTORY_STORAGE_KEY = `ai-kit-chatbot-history-v1:${
  typeof window !== "undefined" ? window.location.hostname : "unknown"
}`;

export const DEFAULT_CHATBOT_LABELS: Required<AiChatbotLabels> = {
  modalTitle: "AI Assistant",

  aiDisclosureLabel: DEFAULT_CHATBOT_AI_DISCLOSURE,

  userLabel: "User",
  assistantLabel: "Assistant",
  assistantThinkingLabel: "{name} is working…",

  askMeLabel: "Ask me",

  sendLabel: "Send",
  cancelLabel: "Cancel",

  resetLabel: "Reset",
  confirmLabel: "Confirm",
  clickAgainToConfirmLabel: "Click again to confirm",

  notSentLabel: "Not sent",
  editLabel: "Edit",

  readyLabel: "Ready.",
  readyEmptyLabel: "I'm ready to assist you.",

  addLabel: "Add",
  addImageLabel: "Add image",
  removeImageLabel: "Remove image",

  closeChatLabel: "Close chat",
  maximizeLabel: "Maximize",
  restoreSizeLabel: "Restore size",

  referencesLabel: "References",
  referenceLabel: "Reference",

  acceptResponseLabel: "Accept response",
  rejectResponseLabel: "Reject response",

  placeholder: "Ask anything…",

  emptyResponseLabel: "Empty response",
  unexpectedErrorLabel: "Unexpected error",
};

type ChatResponse = {
  result: string;
  sessionId?: string;
  citations?: ProcessedCitations | CitationLike[];
  activities?: ChatActivity[];
  completion?: "complete" | "partial" | "truncated";
  metadata?: {
    citationCount?: number;
    modelId?: string;
    requestId?: string;
    messageId?: string;
    outputTokens?: number;
    maxTokens?: number;
    stopReason?: string;
  };
};

type ChatMessageAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  blobId?: string;
  objectUrl?: string | null;
  blob?: Blob;
  duration?: number; // For audio/video attachments
  mediaType?: "image" | "audio"; // Distinguish media types
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: CitationLike[];
  createdAt: number;
  feedback?: "accepted" | "rejected";
  clientStatus?: "pending" | "canceled";
  attachments?: ChatMessageAttachment[];
  activities?: ChatActivity[];
  completion?: "complete" | "partial" | "truncated";
  error?: boolean;
  retryText?: string;
};

type ComposerImage = {
  id: string;
  file: File;
  objectUrl: string;
};

type ComposerAudio = {
  id: string;
  blob: Blob;
  objectUrl: string;
  duration: number;
};

type PersistedAttachment = Omit<ChatMessageAttachment, "objectUrl" | "blob">;

type PersistedChatMessage = Omit<ChatMessage, "attachments"> & {
  attachments?: PersistedAttachment[];
};

type ActiveOp = "chat" | "feedback" | null;

function createMessageId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(
    36,
  )}`;
}

// Image input is an explicit opt-in because not every configured frontend
// model is multimodal. A positive maxImages value is the capability gate.
const DEFAULT_MAX_IMAGES = 0;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

const isAbortLike = (e: Error & { code?: string }) => {
  const name = (e?.name || "").toString();
  const code = (e?.code || "").toString();
  const msg = (e?.message || "").toString();
  return (
    name === "AbortError" ||
    code === "ABORT_ERR" ||
    /abort|aborted|cancel/i.test(msg)
  );
};

const formatStatusEvent = (
  event: AiKitStatusEvent | null,
  I18n: ReturnType<typeof useAiKitI18n>,
): string | null => {
  if (!event) return null;

  const step = event.step;
  const msg = I18n.get((event.message ?? "").trim());
  const p = typeof event.progress === "number" ? event.progress : null;
  const pct = p == null ? null : Math.round(p * 100);

  switch (step) {
    case "decide":
      return msg || I18n.get("Checking capabilities...");
    case "on-device:init":
      return msg || I18n.get("Initializing on-device AI...");
    case "on-device:download":
      return pct == null
        ? msg || I18n.get("Downloading model...")
        : msg || `${I18n.get("Downloading model...")} ${pct}%`;
    case "on-device:ready":
      return msg || I18n.get("On-device model ready...");
    case "on-device:run":
      return msg || I18n.get("Running on-device...");
    case "backend:request":
    case "backend:waiting":
    case "backend:response":
      return I18n.get("Waiting for reply…");
    case "done":
      return msg || I18n.get("Done.");
    case "error":
      return msg || I18n.get("An error occurred.");
    default:
      return msg || null;
  }
};

const activityLabel = (
  activity: ChatActivity,
  I18n: ReturnType<typeof useAiKitI18n>,
  settled = false,
): string => {
  if (activity.status === "failed") return I18n.get("Action failed");
  if (settled && activity.status === "running") return I18n.get("Action interrupted");
  if (activity.status === "completed" && isToolActivity(activity)) {
    const key = activity.kind === "knowledge_search" ? "Knowledge base searched"
      : activity.kind === "web_search" || activity.kind === "web_read" ? "Web search completed"
      : activity.kind === "calculation" ? "Calculation completed"
      : activity.kind === "script" ? "Script completed"
      : activity.kind === "validation" ? "Check completed" : "Action completed";
    return I18n.get(key);
  }
  const action = activity.kind === "thinking"
    ? I18n.get("Thinking…")
    : activity.kind === "generating_response"
      ? I18n.get("Generating response…")
    : activity.kind === "checking_sources"
      ? I18n.get("Checking sources…")
    : activity.kind === "knowledge_search"
      ? I18n.get("Searching knowledge base…")
      : activity.kind === "web_search" || activity.kind === "web_read"
        ? I18n.get("Searching…")
        : activity.kind === "calculation"
          ? I18n.get("Calculating…")
          : activity.kind === "script"
            ? I18n.get("Running a script…")
            : I18n.get("Checking…");
  return activity.safeDomain ? `${action} ${activity.safeDomain}` : action;
};

const ActivityIcon: FC<{ kind: ChatActivity["kind"] }> = ({ kind }) => {
  const Icon = kind === "web_search" || kind === "web_read" ? IconWorld
    : kind === "knowledge_search" ? IconSearch
    : kind === "calculation" ? IconCalculator
    : kind === "script" ? IconCode
    : kind === "thinking" ? IconBrain : IconSparkles;
  return <Icon size={14} aria-hidden="true" />;
};

const ActivityTrace: FC<{
  activities: ChatActivity[];
  I18n: ReturnType<typeof useAiKitI18n>;
}> = ({ activities, I18n }) => {
  if (!activities.length) return null;
  const tools = activities.filter(isSummaryActivity);
  const summary = summarizeChatActivities(activities);
  const failedCount = tools.filter((activity) => activity.status === "failed").length;
  const summaryParts = [
    summary.knowledgeSearches > 0
      ? I18n.get("Knowledge Base searches: {count}").replace("{count}", String(summary.knowledgeSearches))
      : null,
    summary.websites > 0
      ? I18n.get("Websites searched: {count}").replace("{count}", String(summary.websites))
      : null,
    summary.otherTools > 0
      ? I18n.get("Other tools used: {count}").replace("{count}", String(summary.otherTools))
      : null,
    failedCount > 0
      ? I18n.get("Failed actions: {count}").replace("{count}", String(failedCount))
      : null,
  ].filter((part): part is string => Boolean(part));
  if (summaryParts.length === 0) return null;
  return (
    <details className="ai-chat-activity-trace">
      <summary>
        {summaryParts.join(" · ")}
      </summary>
      <ol>
        {tools.map((activity) => (
          <li key={activity.activityId} data-status={activity.status}>
            <ActivityIcon kind={activity.kind} />
            <span>{activityLabel(activity, I18n, true)}</span>
            {activity.query && (
              <div className="ai-chat-activity-detail">
                {I18n.get("Search query: {query}").replace("{query}", activity.query)}
              </div>
            )}
            <div className="ai-chat-activity-detail">
              {([
                ["categoryCount", "Categories: {count}"],
                ["subcategoryCount", "Subcategories: {count}"],
                ["tagCount", "Tags: {count}"],
                ["resultCount", "Results: {count}"],
              ] as const).flatMap(([field, key]) => {
                const count = activity[field];
                return count !== undefined && (count > 0 || field === "resultCount")
                  ? [I18n.get(key).replace("{count}", String(count))] : [];
              }).join(" · ")}
            </div>
            {!!activity.urls?.length && (
              <ul className="ai-chat-activity-urls">
                {activity.urls.map((url) => (
                  <li key={url}><Anchor href={url} target="_blank" rel="noopener noreferrer" size="xs">{url}</Anchor></li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
};

// New: small helpers for storage
function getHistoryStorage(mode: HistoryStorageMode): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    if (mode === "localstorage") return window.localStorage;
    if (mode === "sessionstorage") return window.sessionStorage;
    return null;
  } catch {
    return null;
  }
}

const createObjectUrl = (blob: Blob): string | null => {
  if (typeof window === "undefined") return null;
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function")
    return null;
  try {
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
};

const revokeObjectUrlSafe = (url?: string | null) => {
  if (!url) return;
  if (typeof window === "undefined") return;
  if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function")
    return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
};

const disposeMessageAttachments = (attachments?: ChatMessageAttachment[]) => {
  if (!attachments || attachments.length === 0) return;
  attachments.forEach((att) => revokeObjectUrlSafe(att.objectUrl));
};

const disposeMessagesAttachments = (messages: ChatMessage[]) => {
  messages.forEach((msg) => disposeMessageAttachments(msg.attachments));
};

type PersistedChat = {
  version: 1 | 2;
  lastUserSentAt: number | null;
  session?: { id: string; storedAt: number } | null;
  messages: PersistedChatMessage[];
  activeStream?: {
    checkpoint: ChatStreamCheckpoint;
    userMessageId: string;
    text: string;
    locale: string;
    view?: ChatStreamView;
  };
};

const AiChatbotBase: FC<AiChatbotProps & AiKitShellInjectedProps> = (props) => {
  const I18n = useAiKitI18n();
  const {
    rootElement,
    store,

    // AiWorkerProps (formatting/behavior)
    previewMode,
    title,
    openButtonTitle,
    openButtonIcon,
    showOpenButtonTitle = true,
    showOpenButtonIcon = true,
    colorMode,
    language,
    onClose,

    // AiChatbotProps
    context,
    placeholder,
    maxImages,
    maxImageBytes,
    maxTokens,

    // New
    historyStorage = DEFAULT_HISTORY_STORAGE,
    emptyHistoryAfterDays = DEFAULT_PRESERVATION_TIME_DAYS,
    labels: labelsOverride,
    openButtonIconLayout = "top",
    openButtonPosition = "bottom-right",
  } = props;

  const labels = useMemo(
    () => ({ ...DEFAULT_CHATBOT_LABELS, ...(labelsOverride || {}) }),
    [labelsOverride],
  );

  // NOTE: showOpenButton is intentionally ignored for AiChatbot (always true).
  // NOTE: variation is intentionally ignored for AiChatbot (always "modal").

  const ai = useAiRun();

  const [question, setQuestion] = useState("");
  const [composerImages, setComposerImages] = useState<ComposerImage[]>([]);
  const [composerAudio, setComposerAudio] = useState<ComposerAudio | null>(
    null,
  );
  const [recording, setRecording] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamView, setStreamView] = useState<ChatStreamView | null>(null);
  const [streamTransportState, setStreamTransportState] = useState<"sending" | "waiting" | "receiving" | "reconnecting" | null>(null);
  const streamViewRef = useRef<ChatStreamView | null>(null);
  const [activeStream, setActiveStream] = useState<PersistedChat["activeStream"]>();
  const [streamToResume, setStreamToResume] = useState<PersistedChat["activeStream"]>();
  const streamSocketRef = useRef<WebSocket | null>(null);
  const streamCheckpointRef = useRef<ChatStreamCheckpoint>();
  const lastStreamPersistedAtRef = useRef(0);
  const [statusLineError, setStatusLineError] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [maxEnter, setMaxEnter] = useState(false);
  const [opened, setOpened] = useState(false);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [previewAttachment, setPreviewAttachment] = useState<{
    url: string;
    title?: string;
  } | null>(null);
  const [historyReady, setHistoryReady] = useState(false);

  const [wheelHostEl, setWheelHostEl] = useState<HTMLDivElement | null>(null);
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null);
  const [bodyScrollable, setBodyScrollable] = useState(false);

  const [activeOp, setActiveOp] = useState<ActiveOp>(null);
  const activeOpRef = useRef<ActiveOp>(activeOp);
  useEffect(() => {
    activeOpRef.current = activeOp;
  }, [activeOp]);

  const maxEnterRafRef = useRef<number | null>(null);
  const cancelRequestedRef = useRef(false);

  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const questionInputRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef<{ id: string; storedAt: number } | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const disposeComposerImageList = useCallback((list: ComposerImage[]) => {
    list.forEach((img) => revokeObjectUrlSafe(img.objectUrl));
  }, []);

  const clearComposerImages = useCallback(() => {
    disposeComposerImageList(composerImagesRef.current);
    setComposerImages([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [disposeComposerImageList]);

  const clearComposerAudio = useCallback(() => {
    if (composerAudioRef.current) {
      revokeObjectUrlSafe(composerAudioRef.current.objectUrl);
    }
    setComposerAudio(null);
    audioChunksRef.current = [];
    setAudioLevel(0);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // Clear question input when starting audio recording
      setQuestion("");
      // Clear any existing audio
      clearComposerAudio();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      // Setup audio analysis for visual feedback
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Monitor audio level
      const dataArray = new Uint8Array(analyser.fftSize);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i]! - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const level = Math.min(100, rms * 200);
        setAudioLevel(level);

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      audioChunksRef.current = [];
      const recordStartTime = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        const duration = (Date.now() - recordStartTime) / 1000; // duration in seconds
        const objectUrl = createObjectUrl(audioBlob);

        if (objectUrl) {
          setComposerAudio({
            id: createMessageId("composer-audio"),
            blob: audioBlob,
            objectUrl,
            duration,
          });
        }

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
  }, [clearComposerAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }, [recording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      clearComposerAudio();
    };
  }, [clearComposerAudio]);

  // New: persist timestamp of last actually-sent user message
  const [lastUserSentAt, setLastUserSentAt] = useState<number | null>(null);

  // Keep latest values in refs for stable callbacks
  const questionRef = useRef(question);
  const messagesRef = useRef(messages);
  const lastUserSentAtRef = useRef(lastUserSentAt);
  const composerImagesRef = useRef(composerImages);
  const composerAudioRef = useRef(composerAudio);

  useEffect(() => {
    questionRef.current = question;
  }, [question]);
  useEffect(() => {
    composerImagesRef.current = composerImages;
  }, [composerImages]);
  useEffect(() => {
    composerAudioRef.current = composerAudio;
  }, [composerAudio]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    lastUserSentAtRef.current = lastUserSentAt;
  }, [lastUserSentAt]);


  const showChatbotPreview: boolean = useSelect(() =>
    getStoreSelect(store).isShowChatbotPreview(),
  );

  const resolvedMaxImages = useMemo(
    () => Math.max(0, maxImages ?? DEFAULT_MAX_IMAGES),
    [maxImages],
  );

  const resolvedMaxBytes = useMemo(
    () => Math.max(0, maxImageBytes ?? DEFAULT_MAX_BYTES),
    [maxImageBytes],
  );

  const imageAttachmentsEnabled = resolvedMaxImages > 0;

  useEffect(() => {
    if (!imageAttachmentsEnabled && composerImagesRef.current.length > 0) {
      clearComposerImages();
    }
  }, [clearComposerImages, imageAttachmentsEnabled]);

  const hasMessages = messages.length > 0;

  const isChatBusy = useMemo(
    () => ai.busy && activeOp === "chat",
    [ai.busy, activeOp],
  );

  const canSend = useMemo(() => {
    if (isChatBusy) return false;
    // Can send if we have text OR audio
    return question.trim().length > 0 || composerAudio !== null;
  }, [question, isChatBusy, composerAudio]);

  const openButtonLabel = useMemo(() => {
    const resolvedOpenButtonTitle = openButtonTitle?.trim();
    const resolvedAskMeLabel = labels.askMeLabel?.trim();
    const raw =
      resolvedOpenButtonTitle ||
      resolvedAskMeLabel ||
      DEFAULT_CHATBOT_LABELS.askMeLabel;
    const translated = I18n.get(raw).trim();
    return translated || I18n.get(DEFAULT_CHATBOT_LABELS.askMeLabel);
  }, [I18n, openButtonTitle, labels.askMeLabel, language]);

  const modalTitle = useMemo(() => {
    const raw =
      title?.trim() ||
      labels.modalTitle?.trim() ||
      DEFAULT_CHATBOT_LABELS.modalTitle;
    return I18n.get(raw).trim() || I18n.get(DEFAULT_CHATBOT_LABELS.modalTitle);
  }, [I18n, title, labels.modalTitle, language]);

  const textareaPlaceholder = useMemo(() => {
    const raw = placeholder ? placeholder : labels.placeholder;
    return I18n.get(raw);
  }, [I18n, placeholder, labels.placeholder, language]);

  const aiDisclosure = useMemo(() => {
    const template = I18n.get(
      labels.aiDisclosureLabel?.trim() || DEFAULT_CHATBOT_AI_DISCLOSURE,
    );
    return formatAiDisclosure(template, modalTitle);
  }, [I18n, labels.aiDisclosureLabel, language, modalTitle]);

  const rootClassName = useMemo(() => {
    const base = "ai-docs-ask";
    const pos = `ai-open-btn--${openButtonPosition}`;
    return `${base} ${pos}`;
  }, [openButtonPosition]);

  const adjustChatHeight = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    try {
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const minHeight = 360;
      const maxHeightCap = 1000;
      const viewportMax = Math.floor(vh * 0.8);
      const target = Math.max(minHeight, Math.min(viewportMax, maxHeightCap));
      el.style.height = `${target}px`;
    } catch {
      // ignore
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollerEl;
    if (!el) return;
    window.setTimeout(() => {
      try {
        el.scrollTop = el.scrollHeight;
      } catch {
        // ignore
      }
    }, 50);
  }, [scrollerEl]);

  const closeModal = useCallback(() => {
    setOpened(false);
    if (isMaximized) setIsMaximized(false);
    setMaxEnter(false);
    onClose?.();
  }, [isMaximized, onClose]);

  useEffect(() => {
    if (!opened) return;
    adjustChatHeight();
    window.addEventListener("resize", adjustChatHeight);
    return () => window.removeEventListener("resize", adjustChatHeight);
  }, [opened, adjustChatHeight]);

  useEffect(() => {
    if (!opened || !isMaximized) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [opened, isMaximized, closeModal]);

  const composerPreviews = useMemo(
    () =>
      composerImages.map((img) => ({
        id: img.id,
        url: img.objectUrl,
        title: img.file.name,
      })),
    [composerImages],
  );

  useEffect(() => {
    if (!hasMessages) setStickToBottom(true);
  }, [hasMessages]);

  useEffect(() => {
    return () => {
      disposeComposerImageList(composerImagesRef.current);
    };
  }, [disposeComposerImageList]);

  useEffect(() => {
    const el = scrollerEl;
    if (!el) return;
    const handleScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - (el.scrollTop + el.clientHeight);
      setStickToBottom(distanceFromBottom < 20);
    };
    el.addEventListener("scroll", handleScroll);
    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, [opened, scrollerEl]);

  useEffect(() => {
    if (!stickToBottom) return;
    const el = scrollerEl;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, ai.busy, stickToBottom, scrollerEl]);

  useEffect(() => {
    if (!opened) {
      setPreviewAttachment(null);
    }
  }, [opened]);

  const lastCanceledUserMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "user" && m.clientStatus === "canceled") return m.id;
    }
    return null;
  }, [messages]);

  const markLastPendingAs = useCallback(
    (status: "canceled" | null) => {
      setMessages((prev) => {
        const idx = [...prev]
          .map((m, i) => ({ m, i }))
          .reverse()
          .find(
            (x) => x.m.role === "user" && x.m.clientStatus === "pending",
          )?.i;

        if (idx == null) return prev;

        const next = prev.slice();
        const target = next[idx];
        next[idx] = {
          ...target,
          clientStatus: status ?? undefined,
        };
        return next;
      });
    },
    [setMessages],
  );

  const cancelChat = useCallback(() => {
    if (!ai.busy || activeOpRef.current !== "chat" || cancelRequestedRef.current) return;

    cancelRequestedRef.current = true;
    const partial = streamViewRef.current;
    if (partial?.text.trim()) {
      setMessages((previous) => [...previous, {
        id: partial.checkpoint?.assistantMessageId ?? createMessageId("assistant-partial"),
        role: "assistant",
        content: partial.text,
        citations: normalizeChatCitations(partial.citations),
        activities: partial.activities,
        completion: "partial",
        createdAt: Date.now(),
      }]);
    }
    sendChatStreamCancel(streamSocketRef.current, streamCheckpointRef.current);
    try {
      ai.cancel();
    } catch {
      // ignore
    }

    // Keep text that already arrived; only an unaccepted request is "not sent".
    if (!partial?.checkpoint) markLastPendingAs("canceled");
    streamViewRef.current = null;
    setStreamView(null);
    setActiveStream(undefined);
    streamCheckpointRef.current = undefined;
    setActiveOp(null);

    // feedback-only status line error should not persist into chat cancel
    setStatusLineError(null);

    scrollToBottom();
  }, [ai, markLastPendingAs, scrollToBottom]);

  const onPickImages = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!imageAttachmentsEnabled) {
        e.currentTarget.value = "";
        return;
      }

      const existing = composerImagesRef.current;
      const files = Array.from(e.target.files || []);
      const remaining = Math.max(0, resolvedMaxImages - existing.length);

      if (remaining === 0) {
        e.currentTarget.value = "";
        return;
      }

      const picked: ComposerImage[] = [];

      for (const file of files) {
        if (picked.length >= remaining) break;
        const okType = /image\/(jpeg|png|gif|webp)/i.test(file.type);
        const okSize = file.size <= resolvedMaxBytes;
        const duplicate = [...existing, ...picked].some(
          (x) =>
            x.file.name === file.name &&
            x.file.size === file.size &&
            x.file.lastModified === file.lastModified,
        );

        if (!okType || !okSize || duplicate) continue;

        const objectUrl = createObjectUrl(file);
        if (!objectUrl) continue;

        picked.push({
          id: createMessageId("composer-image"),
          file,
          objectUrl,
        });
      }

      if (picked.length) setComposerImages((prev) => [...prev, ...picked]);
      e.currentTarget.value = "";
    },
    [imageAttachmentsEnabled, resolvedMaxImages, resolvedMaxBytes],
  );

  const removeImage = useCallback((ix: number) => {
    setComposerImages((prev) => {
      if (ix < 0 || ix >= prev.length) return prev;
      const target = prev[ix];
      if (target) revokeObjectUrlSafe(target.objectUrl);
      return prev.filter((_, i) => i !== ix);
    });
  }, []);

  // New: clear feedback errors back to Ready after a short time
  const statusLineErrorTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!statusLineError) return;
    if (statusLineErrorTimerRef.current) {
      window.clearTimeout(statusLineErrorTimerRef.current);
      statusLineErrorTimerRef.current = null;
    }
    statusLineErrorTimerRef.current = window.setTimeout(() => {
      setStatusLineError(null);
      statusLineErrorTimerRef.current = null;
    }, 6000);
    return () => {
      if (statusLineErrorTimerRef.current) {
        window.clearTimeout(statusLineErrorTimerRef.current);
        statusLineErrorTimerRef.current = null;
      }
    };
  }, [statusLineError]);

  const buildUserAttachments = useCallback(
    async (
      images: ComposerImage[],
      audio?: ComposerAudio | null,
    ): Promise<ChatMessageAttachment[]> => {
      const shouldPersist = historyStorage !== "nostorage";
      const attachments: ChatMessageAttachment[] = [];

      // Build image attachments
      if (images.length > 0) {
        const imageAttachments = await Promise.all(
          images.map(async (img) => {
            const attachmentId = createMessageId("attachment-image");
            let blobId: string | undefined;
            if (shouldPersist) {
              try {
                const persisted = await persistAttachmentBlob(
                  attachmentId,
                  img.file,
                  {
                    name: img.file.name,
                    type: img.file.type,
                    size: img.file.size,
                  },
                );
                blobId = persisted ?? undefined;
              } catch (error) {
                console.warn("[AiChatbot] Failed to persist image", error);
              }
            }

            const objectUrl = createObjectUrl(img.file);

            return {
              id: attachmentId,
              name: img.file.name,
              type: img.file.type || "application/octet-stream",
              size: img.file.size,
              blobId,
              objectUrl: objectUrl ?? undefined,
              blob: img.file,
              mediaType: "image" as const,
            } satisfies ChatMessageAttachment;
          }),
        );
        attachments.push(...imageAttachments.filter(Boolean));
      }

      // Build audio attachment
      if (audio) {
        const attachmentId = createMessageId("attachment-audio");
        let blobId: string | undefined;
        if (shouldPersist) {
          try {
            const persisted = await persistAttachmentBlob(
              attachmentId,
              audio.blob,
              {
                name: `audio-${Date.now()}.webm`,
                type: audio.blob.type,
                size: audio.blob.size,
              },
            );
            blobId = persisted ?? undefined;
          } catch (error) {
            console.warn("[AiChatbot] Failed to persist audio", error);
          }
        }

        const objectUrl = createObjectUrl(audio.blob);

        attachments.push({
          id: attachmentId,
          name: `audio-${Date.now()}.webm`,
          type: audio.blob.type || "audio/webm",
          size: audio.blob.size,
          blobId,
          objectUrl: objectUrl ?? undefined,
          blob: audio.blob,
          duration: audio.duration,
          mediaType: "audio" as const,
        } satisfies ChatMessageAttachment);
      }

      return attachments;
    },
    [historyStorage],
  );

  const hydratePersistedMessages = useCallback(
    async (stored: PersistedChatMessage[]): Promise<ChatMessage[]> => {
      const hydrated: ChatMessage[] = [];

      for (const msg of stored) {
        let attachments: ChatMessageAttachment[] | undefined;
        if (msg.attachments && msg.attachments.length > 0) {
          attachments = [];
          for (const att of msg.attachments) {
            let blob: Blob | undefined;
            if (att.blobId) {
              try {
                const loaded = await loadAttachmentBlob(att.blobId);
                blob = loaded?.blob ?? undefined;
              } catch (error) {
                console.warn("[AiChatbot] Failed to hydrate attachment", error);
              }
            }

            if (!blob) {
              continue;
            }

            const objectUrl = blob ? createObjectUrl(blob) : null;

            attachments.push({
              ...att,
              objectUrl: objectUrl ?? undefined,
              blob: blob ?? undefined,
            });
          }
        }

        hydrated.push({
          ...msg,
          attachments,
        });
      }

      return hydrated;
    },
    [],
  );

  const restoreAttachmentsToComposer = useCallback(
    async (attachments?: ChatMessageAttachment[]) => {
      if (!attachments || attachments.length === 0) {
        clearComposerImages();
        return;
      }

      const restored: ComposerImage[] = [];

      for (const attachment of attachments) {
        let blob: Blob | undefined = attachment.blob;
        if (!blob && attachment.blobId) {
          try {
            const loaded = await loadAttachmentBlob(attachment.blobId);
            blob = loaded?.blob ?? undefined;
          } catch (error) {
            console.warn("[AiChatbot] Failed to reload attachment", error);
          }
        }

        if (!blob) continue;

        const file =
          blob instanceof File
            ? blob
            : new File([blob], attachment.name || "attachment", {
                type:
                  attachment.type || blob.type || "application/octet-stream",
              });

        const objectUrl = createObjectUrl(file);
        if (!objectUrl) continue;

        restored.push({
          id: createMessageId("composer-image"),
          file,
          objectUrl,
        });

        if (restored.length >= resolvedMaxImages) break;
      }

      if (restored.length === 0) {
        clearComposerImages();
        return;
      }

      setComposerImages((prev) => {
        disposeComposerImageList(prev);
        return restored;
      });

      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [clearComposerImages, disposeComposerImageList, resolvedMaxImages],
  );

  const openAttachmentPreview = useCallback(
    (url?: string | null, title?: string) => {
      if (!url) return;
      setPreviewAttachment({ url, title });
    },
    [],
  );

  const closeAttachmentPreview = useCallback(() => {
    setPreviewAttachment(null);
  }, []);

  const resetConversation = useCallback(() => {
    disposeMessagesAttachments(messagesRef.current);
    clearComposerImages();
    clearComposerAudio();
    setMessages([]);
    setStatusLineError(null);
    sessionRef.current = null;
    setLastUserSentAt(null);
    setStickToBottom(true);
    setResetDialogOpen(false);

    const storage = getHistoryStorage(historyStorage);
    if (storage) {
      try {
        storage.removeItem(HISTORY_STORAGE_KEY);
      } catch {
        // ignore
      }
    }

    void clearAllAttachments();
  }, [clearComposerImages, clearComposerAudio, historyStorage]);

  const handleResetClick = useCallback(() => {
    // Open confirmation dialog
    setResetDialogOpen(true);
  }, []);

  const confirmReset = useCallback(() => {
    // If a chat is in-flight, cancel first (then reset)
    if (ai.busy && activeOpRef.current === "chat") {
      cancelChat();
    }
    resetConversation();
  }, [ai.busy, cancelChat, resetConversation]);

  const cancelReset = useCallback(() => {
    setResetDialogOpen(false);
  }, []);

  const sendFeedbackToServer = useCallback(
    async (messageId: string, feedbackType: "accepted" | "rejected") => {
      // feedback should NOT spam status; only show errors
      if (ai.busy) return;

      try {
        const activeSessionId =
          sessionRef.current &&
          Date.now() - sessionRef.current.storedAt <
            emptyHistoryAfterDays * TWENTY_FOUR_HOURS_MS
            ? sessionRef.current.id
            : undefined;
        if (!activeSessionId) return;

        setActiveOp("feedback");
        setStatusLineError(null);

        await ai.run(async ({ signal, onStatus }) => {
          await sendFeedbackMessage(
            {
              sessionId: activeSessionId,
              feedbackMessageId: messageId,
              feedbackType,
            },
            {
              signal,
              onStatus,
              context,
            },
          );
          return null;
        });

        // success: keep Ready (no extra UI)
        setStatusLineError(null);
      } catch (e) {
        const msg =
          (e as Error)?.message?.trim() || I18n.get("An error occurred.");
        // feedback error: ONLY status line (auto-clears back to Ready)
        setStatusLineError(msg);
        console.error("Failed to send feedback", e);
      } finally {
        setActiveOp((prev) => (prev === "feedback" ? null : prev));
      }
    },
    [I18n, ai, language],
  );

  const updateFeedback = useCallback(
    (messageId: string, verdict: "accepted" | "rejected") => {
      // optimistic toggle (and allow "clear" by clicking same verdict again)
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId || msg.role !== "assistant") return msg;
          if (msg.feedback === verdict) return { ...msg, feedback: undefined };
          return { ...msg, feedback: verdict };
        }),
      );
      void sendFeedbackToServer(messageId, verdict);
    },
    [sendFeedbackToServer],
  );

  const ask = useCallback(async (retryText?: string) => {
    const trimmed = (retryText ?? questionRef.current).trim();
    const selectedAudio = retryText === undefined ? composerAudioRef.current : null;

    // Can send if we have text OR audio
    if ((!trimmed && !selectedAudio) || ai.busy) return;

    cancelRequestedRef.current = false;
    setStatusLineError(null);
    setStreamTransportState(null);
    setActiveOp("chat");
    const selectedImages = imageAttachmentsEnabled && retryText === undefined
      ? [...composerImagesRef.current]
      : [];
    const userAttachments = await buildUserAttachments(
      selectedImages,
      selectedAudio,
    );

    const userMessageId = createMessageId("user");
    const userMessageCreatedAt = Date.now();
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      content: trimmed || (selectedAudio ? "[Audio message]" : ""),
      createdAt: userMessageCreatedAt,
      clientStatus: "pending",
      attachments: userAttachments.length ? userAttachments : undefined,
    };

    // optimistic UI
    if (retryText === undefined) {
      setQuestion("");
      clearComposerImages();
      clearComposerAudio();
    }
    setMessages((prev) => [...prev, userMessage]);

    if (!opened) setOpened(true);
    scrollToBottom();

    let latestStreamView: ChatStreamView | null = null;
    try {
      const activeSessionId =
        sessionRef.current &&
        Date.now() - sessionRef.current.storedAt <
          emptyHistoryAfterDays * TWENTY_FOUR_HOURS_MS
          ? sessionRef.current.id
          : undefined;

      const res = (await ai.run(async ({ signal, onStatus }) => {
        if (trimmed && !selectedAudio && selectedImages.length === 0) {
          const streamUrl = await discoverChatStreamUrl();
          if (streamUrl && !signal.aborted) {
            const requestId = createMessageId("chat-turn");
            const streamed = await runChatStreamTurn({
              url: streamUrl,
              text: trimmed,
              locale: I18n.language,
              sessionId: activeSessionId,
              requestId,
              signal,
              onTransportState: setStreamTransportState,
              onSocket: (socket) => {
                streamSocketRef.current = socket;
              },
              onSession: (id) => {
                sessionRef.current = { id, storedAt: Date.now() };
              },
              onAccepted: (checkpoint, id) => {
                streamCheckpointRef.current = checkpoint;
                lastStreamPersistedAtRef.current = Date.now();
                setActiveStream({
                  checkpoint,
                  userMessageId,
                  text: trimmed,
                  locale: I18n.language,
                  view: latestStreamView ?? undefined,
                });
                sessionRef.current = { id, storedAt: Date.now() };
                setLastUserSentAt(userMessageCreatedAt);
                markLastPendingAs(null);
              },
              onView: (view) => {
                latestStreamView = view;
                streamViewRef.current = view;
                setStreamView(view);
                if (view.checkpoint) {
                  streamCheckpointRef.current = view.checkpoint;
                  if (Date.now() - lastStreamPersistedAtRef.current >= 250) {
                    lastStreamPersistedAtRef.current = Date.now();
                    setActiveStream({
                      checkpoint: view.checkpoint,
                      userMessageId,
                      text: trimmed,
                      locale: I18n.language,
                      view,
                    });
                  }
                }
              },
            });
            return {
              result: streamed.result,
              sessionId: streamed.sessionId,
              citations: streamed.citations,
              metadata: {
                ...streamed.metadata,
                messageId: streamed.messageId ?? streamed.metadata?.messageId,
              },
              activities: latestStreamView?.activities,
            };
          }
        }
        const out = await sendChatMessage(
          {
            sessionId: activeSessionId,
            message: trimmed || undefined,
            audio: selectedAudio?.blob,
            images: selectedImages.map((img) => img.file),
            locale: I18n.language,
            maxTokens,
          },
          {
            signal,
            onStatus,
            context,
          },
        );
        return out;
      })) as ChatResponse | null;

      // If user clicked cancel while request was in-flight, ignore output
      if (cancelRequestedRef.current) {
        markLastPendingAs("canceled");
        return;
      }

      if (!res) {
        throw new Error(I18n.get(ai.error ?? labels.emptyResponseLabel));
      }

      if (res.sessionId) {
        sessionRef.current = {
          id: res.sessionId,
          storedAt: Date.now(),
        };
      }

      const resultText =
        typeof res.result === "string" ? res.result.trim() : "";
      if (!resultText) {
        throw new Error(I18n.get(ai.error ?? labels.emptyResponseLabel));
      }

      if (res.metadata?.stopReason === "max_tokens") {
        console.warn("Chat response hit the backend output token limit", {
          maxTokens: res.metadata?.maxTokens,
          requestId: res.metadata?.requestId,
          modelId: res.metadata?.modelId,
          outputTokens: res.metadata?.outputTokens,
        });
      }

      const assistantMessage: ChatMessage = {
        id: res.metadata?.messageId || createMessageId("assistant"),
        role: "assistant",
        content: resultText,
        citations: normalizeChatCitations(res.citations),
        activities: res.activities,
        createdAt: Date.now(),
      };

      setMessages((prev) => {
        const cleared = prev.map((m) =>
          m.id === userMessageId ? { ...m, clientStatus: undefined } : m,
        );
        return [...cleared, assistantMessage];
      });
      setStreamView(null);
      streamViewRef.current = null;
      setActiveStream(undefined);
      streamCheckpointRef.current = undefined;

      // mark last sent timestamp on successful request completion
      setLastUserSentAt(userMessageCreatedAt);
    } catch (e) {
      // Cancel: treat as not sent, no error bubble
      if (
        cancelRequestedRef.current ||
        isAbortLike(e as Error & { code?: string })
      ) {
        if (!streamCheckpointRef.current) markLastPendingAs("canceled");
        setStreamView(null);
        streamViewRef.current = null;
        setActiveStream(undefined);
        return;
      }

      const errorCode = (e as Error & { code?: string; details?: { code?: string } })?.details?.code ??
        (e as Error & { code?: string })?.code;
      const rawMessage = errorCode === "CONVERSATION_BUSY"
        ? "A response is still running. Wait for it to finish or cancel it."
        : (e as Error)?.message?.trim() || labels.unexpectedErrorLabel;
      const msg = I18n.get(rawMessage);
      setStatusLineError(msg);

      // show error inside chat (assistant side)
      setMessages((prev) => {
        const cleared = prev.map((m) =>
          m.id === userMessageId ? { ...m, clientStatus: undefined } : m,
        );
        return [
          ...cleared,
          {
            id: createMessageId("assistant-error"),
            role: "assistant",
            content: latestStreamView?.text
              ? `${latestStreamView.text}\n\n⚠️ ${msg}`
              : `⚠️ ${msg}`,
            activities: latestStreamView?.activities,
            error: true,
            retryText: !selectedAudio && selectedImages.length === 0 ? trimmed : undefined,
            createdAt: Date.now(),
          },
        ];
      });
      setStreamView(null);
      streamViewRef.current = null;
      setActiveStream(undefined);

      // still consider the message "sent" (server error happened after sending)
      setLastUserSentAt(userMessageCreatedAt);
    } finally {
      setStreamTransportState(null);
      streamSocketRef.current = null;
      streamCheckpointRef.current = undefined;
      setActiveOp((prev) => (prev === "chat" ? null : prev));
      cancelRequestedRef.current = false;
      if (questionInputRef.current) questionInputRef.current.focus();
      scrollToBottom();
    }
  }, [I18n,
    ai,
    buildUserAttachments,
    clearComposerImages,
    clearComposerAudio,
    opened,
    scrollToBottom,
    markLastPendingAs,
    labels.emptyResponseLabel,
    labels.unexpectedErrorLabel,
    language,
    imageAttachmentsEnabled,
  ]);

  useEffect(() => {
    if (!historyReady || !streamToResume) return;
    const pending = streamToResume;
    const run = async () => {
      cancelRequestedRef.current = false;
      activeOpRef.current = "chat";
      setActiveOp("chat");
      setStreamView(pending.view ?? null);
      streamViewRef.current = pending.view ?? null;
      streamCheckpointRef.current = pending.checkpoint;
      let latestView = pending.view;
      try {
        const url = await discoverChatStreamUrl();
        if (!url) {
          throw new Error("The AI service is temporarily unavailable. Please try again.");
        }
        const result = (await ai.run(async ({ signal }) =>
          runChatStreamTurn({
            url,
            text: pending.text,
            locale: pending.locale,
            sessionId: pending.checkpoint.conversationId,
            requestId: pending.checkpoint.requestId,
            resume: pending.checkpoint,
            initialView: pending.view,
            signal,
            onTransportState: setStreamTransportState,
            onSocket: (socket) => {
              streamSocketRef.current = socket;
            },
            onSession: (id) => {
              sessionRef.current = { id, storedAt: Date.now() };
            },
            onView: (view) => {
              latestView = view;
              streamViewRef.current = view;
              setStreamView(view);
              if (view.checkpoint) {
                streamCheckpointRef.current = view.checkpoint;
                if (Date.now() - lastStreamPersistedAtRef.current >= 250) {
                  lastStreamPersistedAtRef.current = Date.now();
                  setActiveStream({ ...pending, checkpoint: view.checkpoint, view });
                }
              }
            },
          }),
        )) as ChatStreamResult | null;
        if (cancelRequestedRef.current || !result) return;
        if (!result.result.trim()) {
          throw new Error(I18n.get(labels.emptyResponseLabel));
        }
        setMessages((previous) => [
          ...previous.map((message) =>
            message.id === pending.userMessageId
              ? { ...message, clientStatus: undefined }
              : message,
          ),
          {
            id: result.messageId ?? createMessageId("assistant"),
            role: "assistant",
            content: result.result,
            citations: normalizeChatCitations(result.citations),
            activities: latestView?.activities,
            createdAt: Date.now(),
          },
        ]);
      } catch (error) {
        if (!cancelRequestedRef.current && !isAbortLike(error as Error)) {
          const message = I18n.get(
            (error as Error)?.message?.trim() || labels.unexpectedErrorLabel,
          );
          setMessages((previous) => [
            ...previous.map((item) =>
              item.id === pending.userMessageId
                ? { ...item, clientStatus: undefined }
                : item,
            ),
            {
              id: createMessageId("assistant-error"),
              role: "assistant",
              content: latestView?.text
                ? `${latestView.text}\n\n⚠️ ${message}`
                : `⚠️ ${message}`,
              activities: latestView?.activities,
              error: true,
              retryText: pending.text,
              createdAt: Date.now(),
            },
          ]);
        }
      } finally {
        setStreamTransportState(null);
        setStreamToResume(undefined);
        setStreamView(null);
        streamViewRef.current = null;
        setActiveStream(undefined);
        streamSocketRef.current = null;
        streamCheckpointRef.current = undefined;
        activeOpRef.current = null;
        setActiveOp(null);
      }
    };
    void run();
  }, [historyReady, streamToResume]);

  const handleQuestionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (canSend) void ask();
      }
    },
    [ask, canSend],
  );

  const handleOpenClick = useCallback(() => {
    setOpened(true);
  }, []);

  useEffect(() => {
    return () => {
      if (maxEnterRafRef.current != null) {
        cancelAnimationFrame(maxEnterRafRef.current);
        maxEnterRafRef.current = null;
      }
    };
  }, []);

  const handleToggleMaximize = useCallback(() => {
    setIsMaximized((prev) => {
      const next = !prev;

      if (maxEnterRafRef.current != null) {
        cancelAnimationFrame(maxEnterRafRef.current);
        maxEnterRafRef.current = null;
      }

      // When maximizing: apply ai-max-enter for one render frame,
      // then remove it so CSS can animate to the final state.
      if (next) {
        setMaxEnter(true);
        requestAnimationFrame(() => {
          maxEnterRafRef.current = requestAnimationFrame(() => {
            setMaxEnter(false);
            maxEnterRafRef.current = null;
          });
        });
      } else {
        // When restoring size: no need for enter helper
        setMaxEnter(false);
      }

      return next;
    });
  }, []);

  const handleEditCanceled = useCallback(
    (msg: ChatMessage) => {
      setQuestion(msg.content);
      void (async () => {
        await restoreAttachmentsToComposer(msg.attachments);
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        disposeMessageAttachments(msg.attachments);
        queueMicrotask(() => questionInputRef.current?.focus());
      })();
    },
    [restoreAttachmentsToComposer],
  );

  const renderOpenButtonIcon = useMemo(() => {
    if (!showOpenButtonIcon) return null;
    if (openButtonIcon) {
      return (
        <img
          src={openButtonIcon}
          className="ai-open-btn-icon"
          alt={I18n.get(labels.askMeLabel || openButtonLabel)}
        />
      );
    }
    return <IconMessage size={18} />;
  }, [I18n, showOpenButtonIcon, openButtonIcon, labels, openButtonLabel, language]);

  const openButtonContent = useMemo(() => {
    const iconEl = renderOpenButtonIcon;
    const textEl = showOpenButtonTitle ? (
      <Text inherit>{openButtonLabel}</Text>
    ) : null;

    if (!showOpenButtonIcon && !textEl) return null;
    if (!showOpenButtonIcon) return textEl;
    if (!showOpenButtonTitle) return iconEl;

    switch (openButtonIconLayout) {
      case "top":
        return (
          <Stack gap={4} align="center">
            {iconEl}
            {textEl}
          </Stack>
        );
      case "bottom":
        return (
          <Stack gap={4} align="center">
            {textEl}
            {iconEl}
          </Stack>
        );
      case "right":
        return (
          <Group gap={6} align="center">
            {textEl}
            {iconEl}
          </Group>
        );
      case "left":
      default:
        return (
          <Group gap={6} align="center">
            {iconEl}
            {textEl}
          </Group>
        );
    }
  }, [
    renderOpenButtonIcon,
    showOpenButtonIcon,
    showOpenButtonTitle,
    openButtonLabel,
    openButtonIconLayout,
  ]);

  const showStatusBubble = useMemo(() => isChatBusy, [isChatBusy]);

  const currentStreamActivity = useMemo(() =>
    [...(streamView?.activities ?? [])].reverse().find((activity) => activity.status === "running"),
  [streamView?.activities]);

  const statusLineText = useMemo(() => {
    if (isChatBusy) {
      if (streamTransportState === "reconnecting") return I18n.get("Reconnecting…");
      if (streamTransportState === "sending") return I18n.get("Sending request…");
      if (streamTransportState === "waiting") return I18n.get("Waiting for reply…");
      if (currentStreamActivity) return activityLabel(currentStreamActivity, I18n);
      if (streamView?.text) return I18n.get("Generating response…");
      const latest = streamView?.activities.at(-1);
      if (latest) return I18n.get(latest.kind === "checking_sources" || latest.kind === "generating_response"
        ? "Generating response…" : "Thinking…");
      return formatStatusEvent(ai.statusEvent, I18n) || I18n.get("Sending request…");
    }
    if (statusLineError) return statusLineError;
    return hasMessages
      ? I18n.get(labels.readyLabel)
      : I18n.get(labels.readyEmptyLabel);
  }, [I18n,
    statusLineError,
    hasMessages,
    labels.readyLabel,
    labels.readyEmptyLabel,
    language,
    isChatBusy,
    streamTransportState,
    streamView,
    currentStreamActivity,
    ai.statusEvent,
  ]);

  const sendOrCancelLabel = useMemo(() => {
    if (isChatBusy) return I18n.get(labels.cancelLabel);
    return I18n.get(labels.sendLabel);
  }, [I18n, isChatBusy, labels.cancelLabel, labels.sendLabel, language]);

  const sendOrCancelIcon = useMemo(() => {
    if (isChatBusy) return <IconPlayerStop size={18} />;
    return <IconSend size={18} />;
  }, [isChatBusy]);

  const onSendOrCancel = useCallback(() => {
    if (isChatBusy) {
      cancelChat();
      return;
    }
    void ask();
  }, [isChatBusy, cancelChat, ask]);

  useEffect(() => {
    if (!opened) return;
    if (!wheelHostEl || !scrollerEl) return;

    const isScrollableNow = () => {
      const cs = window.getComputedStyle(scrollerEl);
      const overflowY = cs.overflowY;
      const canOverflow = overflowY === "auto" || overflowY === "scroll";

      const sh = Math.ceil(scrollerEl.scrollHeight);
      const ch = Math.floor(scrollerEl.clientHeight);
      const hasOverflow = sh > ch;
      return canOverflow && hasOverflow;
    };
    let enabled = false;

    const onWheel = (e: WheelEvent) => {
      if (!isScrollableNow()) return;

      e.preventDefault();

      const max = scrollerEl.scrollHeight - scrollerEl.clientHeight;
      scrollerEl.scrollTop = Math.max(
        0,
        Math.min(max, scrollerEl.scrollTop + e.deltaY),
      );
    };

    const sync = () => {
      const shouldEnable = isScrollableNow();
      setBodyScrollable(shouldEnable);
      if (shouldEnable === enabled) return;
      enabled = shouldEnable;
      if (enabled) {
        wheelHostEl.addEventListener("wheel", onWheel, { passive: false });
      } else {
        wheelHostEl.removeEventListener("wheel", onWheel as EventListener);
      }
    };

    sync();

    const ro = new ResizeObserver(sync);
    ro.observe(scrollerEl);

    const mo = new MutationObserver(sync);
    mo.observe(scrollerEl, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener("resize", sync);

    return () => {
      if (enabled)
        wheelHostEl.removeEventListener("wheel", onWheel as EventListener);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [opened, wheelHostEl, scrollerEl]);

  // -----------------------------
  // History persistence
  // -----------------------------

  useEffect(() => {
    let canceled = false;
    const storage = getHistoryStorage(historyStorage);
    if (!storage) {
      if (historyStorage === "nostorage") {
        void clearAllAttachments();
      }
      setHistoryReady(true);
      return;
    }

    (async () => {
      try {
        const raw = storage.getItem(HISTORY_STORAGE_KEY);
        if (!raw) {
          setHistoryReady(true);
          return;
        }

        const parsed = JSON.parse(raw) as PersistedChat;
        const last =
          typeof parsed?.lastUserSentAt === "number"
            ? parsed.lastUserSentAt
            : null;

        if (
          !last ||
          Date.now() - last > emptyHistoryAfterDays * TWENTY_FOUR_HOURS_MS
        ) {
          storage.removeItem(HISTORY_STORAGE_KEY);
          await clearAllAttachments();
          setHistoryReady(true);
          return;
        }

        const loadedMessages = Array.isArray(parsed.messages)
          ? parsed.messages
          : [];

        const normalized = loadedMessages.map((m) => {
          if (
            m?.role === "user" &&
            m.clientStatus === "pending" &&
            m.id !== parsed.activeStream?.userMessageId
          ) {
            return { ...m, clientStatus: "canceled" as const };
          }
          return m;
        });

        const hydrated = await hydratePersistedMessages(normalized);

        if (canceled) {
          disposeMessagesAttachments(hydrated);
          return;
        }

        setMessages(hydrated);
        setLastUserSentAt(last);

        if (parsed.session && parsed.session.id) {
          sessionRef.current = parsed.session;
        }
        if (
          parsed.version === 2 &&
          parsed.activeStream?.checkpoint?.turnId &&
          parsed.activeStream.checkpoint.conversationId
        ) {
          setActiveStream(parsed.activeStream);
          setStreamToResume(parsed.activeStream);
        }
      } catch (error) {
        console.warn("[AiChatbot] Failed to load history", error);
        try {
          storage.removeItem(HISTORY_STORAGE_KEY);
        } catch {
          // ignore
        }
      } finally {
        if (!canceled) setHistoryReady(true);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [historyStorage, emptyHistoryAfterDays, hydratePersistedMessages]);

  useEffect(() => {
    if (!historyReady) return;

    const storage = getHistoryStorage(historyStorage);
    if (!storage) return;

    const last = lastUserSentAtRef.current;

    if (!last) {
      return;
    }

    if (Date.now() - last > emptyHistoryAfterDays * TWENTY_FOUR_HOURS_MS) {
      try {
        storage.removeItem(HISTORY_STORAGE_KEY);
      } catch {
        // ignore
      }
      void cleanupDanglingAttachments(new Set());
      return;
    }

    const persistableMessages: PersistedChatMessage[] = messages.map(
      ({ attachments, ...rest }) => ({
        ...rest,
        attachments: attachments?.map(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          ({ objectUrl, blob, ...persisted }) => persisted,
        ),
      }),
    );

    const payload: PersistedChat = {
      version: 2,
      lastUserSentAt: last,
      session: sessionRef.current,
      messages: persistableMessages,
      activeStream,
    };

    try {
      storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }

    const validIds = new Set<string>();
    persistableMessages.forEach((msg) => {
      msg.attachments?.forEach((att) => {
        if (att.blobId) validIds.add(att.blobId);
      });
    });

    void cleanupDanglingAttachments(validIds);
  }, [
    historyReady,
    messages,
    lastUserSentAt,
    historyStorage,
    emptyHistoryAfterDays,
    activeStream,
  ]);

  if (
    (previewMode && !showChatbotPreview) ||
    (!previewMode && showChatbotPreview)
  ) {
    return null;
  }

  return (
    <Group className={rootClassName}>
      {!opened && (
        <Button
          variant="filled"
          className={
            showOpenButtonTitle
              ? "ai-launcher-button ai-launcher-text"
              : "ai-launcher-button"
          }
          onClick={handleOpenClick}
          aria-label={openButtonLabel}
          title={openButtonLabel}
          data-ai-kit-open-button
        >
          {openButtonContent}
        </Button>
      )}

      {opened && (
        <Modal.Root
          ref={chatContainerRef}
          opened={opened}
          lockScroll={false}
          trapFocus={false}
          closeOnEscape={true}
          onClose={closeModal}
          className={
            rootClassName +
            " ai-chat-container" +
            (isMaximized ? " maximized" : "") +
            (isMaximized && maxEnter ? " ai-max-enter" : "")
          }
          portalProps={{ target: rootElement, reuseTargetNode: true }}
          data-ai-kit-theme={colorMode}
          data-ai-kit-variation="modal"
        >
          <div className="ai-chat-container-internal" ref={setWheelHostEl}>
            <Modal.Header className="ai-chat-header-bar">
              <Modal.Title className="ai-chat-title">{modalTitle}</Modal.Title>
              <Group gap="4px" align="center" justify="center">
                {typeof window !== "undefined" && window.innerWidth > 600 && (
                  <ActionIcon
                    variant="subtle"
                    c="var(--ai-kit-chat-icon-color, var(--ai-kit-color-text))"
                    onClick={handleToggleMaximize}
                    title={
                      isMaximized
                        ? I18n.get(labels.restoreSizeLabel)
                        : I18n.get(labels.maximizeLabel)
                    }
                    aria-label={
                      isMaximized
                        ? I18n.get(labels.restoreSizeLabel)
                        : I18n.get(labels.maximizeLabel)
                    }
                    data-ai-kit-maximize-button
                  >
                    {isMaximized ? (
                      <IconMinimize size={16} />
                    ) : (
                      <IconMaximize size={16} />
                    )}
                  </ActionIcon>
                )}
                <Modal.CloseButton
                  aria-label={I18n.get(labels.closeChatLabel)}
                />
              </Group>
            </Modal.Header>

            <Modal.Body
              className="ai-chat-scroll"
              ref={setScrollerEl}
              data-scrollable={bodyScrollable ? "true" : "false"}
            >
              {messages.map((msg) => {
                const isUser = msg.role === "user";
                const isLastCanceled =
                  isUser &&
                  msg.clientStatus === "canceled" &&
                  msg.id === lastCanceledUserMessageId;

                return (
                  <Group
                    key={msg.id}
                    justify={isUser ? "flex-end" : "flex-start"}
                    className={"ai-chat-row " + msg.role}
                    onMouseEnter={() => setHoveredMessageId(msg.id)}
                    onMouseLeave={() =>
                      setHoveredMessageId((cur) =>
                        cur === msg.id ? null : cur,
                      )
                    }
                  >
                    <Stack
                      gap={4}
                      w="100%"
                      style={{
                        alignItems: isUser ? "flex-end" : "flex-start",
                      }}
                    >
                      <Stack className="ai-chat-bubble">
                        <Text className="ai-chat-header">
                          <Text
                            fw="bolder"
                            size="xs"
                            style={{ whiteSpace: "nowrap" }}
                          >
                            {isUser
                              ? I18n.get(labels.userLabel)
                              : labels.assistantLabel === DEFAULT_CHATBOT_LABELS.assistantLabel
                                ? modalTitle : I18n.get(labels.assistantLabel)}
                          </Text>
                          &nbsp;
                          <Text size="xs" style={{ whiteSpace: "nowrap" }}>
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Text>
                        </Text>

                        {msg.role === "assistant" ? (
                          <>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </>
                        ) : (
                          <Text size="sm" miw="100px">
                            {msg.content}
                          </Text>
                        )}
                      </Stack>
                      {msg.role === "assistant" && msg.completion === "partial" && (
                        <Text size="xs" c="dimmed">{I18n.get("Response stopped.")}</Text>
                      )}
                      {msg.role === "assistant" && !!msg.activities?.length && (
                        <ActivityTrace
                          activities={msg.activities}
                          I18n={I18n}
                        />
                      )}

                      {msg.attachments && msg.attachments.length > 0 && (
                        <Stack
                          gap="xs"
                          style={{ maxWidth: "min(400px, 100%)" }}
                        >
                          {/* Image attachments */}
                          {msg.attachments.filter(
                            (att) =>
                              att.mediaType === "image" ||
                              (!att.mediaType && att.type.startsWith("image/")),
                          ).length > 0 && (
                            <Group
                              className="ai-thumbs ai-message-thumbs"
                              gap="xs"
                            >
                              {msg.attachments
                                .filter(
                                  (att) =>
                                    att.mediaType === "image" ||
                                    (!att.mediaType &&
                                      att.type.startsWith("image/")),
                                )
                                .map((attachment) => (
                                  <button
                                    key={attachment.id}
                                    type="button"
                                    className="thumb"
                                    style={{
                                      backgroundImage: attachment.objectUrl
                                        ? `url(${attachment.objectUrl})`
                                        : undefined,
                                      backgroundSize: "cover",
                                      backgroundPosition: "center",
                                      backgroundRepeat: "no-repeat",
                                    }}
                                    onClick={() =>
                                      openAttachmentPreview(
                                        attachment.objectUrl,
                                        attachment.name,
                                      )
                                    }
                                    disabled={!attachment.objectUrl}
                                    title={
                                      attachment.name || I18n.get("View image")
                                    }
                                    aria-label={
                                      attachment.name || I18n.get("View image")
                                    }
                                  >
                                    {!attachment.objectUrl && (
                                      <Text size="xs" c="dimmed">
                                        {I18n.get("Image no longer available")}
                                      </Text>
                                    )}
                                  </button>
                                ))}
                            </Group>
                          )}

                          {/* Audio attachments */}
                          {msg.attachments
                            .filter(
                              (att) =>
                                att.mediaType === "audio" ||
                                (!att.mediaType &&
                                  att.type.startsWith("audio/")),
                            )
                            .map((attachment) => (
                              <Box
                                key={attachment.id}
                                p="sm"
                                style={{
                                  backgroundColor:
                                    "var(--ai-kit-chat-surface-subtle)",
                                  borderRadius: "var(--ai-kit-radius-sm)",
                                  border:
                                    "1px solid var(--ai-kit-chat-border-color)",
                                }}
                              >
                                {attachment.objectUrl ? (
                                  <Stack gap="xs">
                                    <audio
                                      className="ai-kit-audio-player"
                                      controls
                                      src={attachment.objectUrl}
                                      preload="metadata"
                                    />
                                    {attachment.duration && (
                                      <Text
                                        size="xs"
                                        c="dimmed"
                                        style={{ textAlign: "right" }}
                                      >
                                        {Math.round(attachment.duration)}s
                                      </Text>
                                    )}
                                  </Stack>
                                ) : (
                                  <Text size="xs" c="dimmed">
                                    {I18n.get("Audio no longer available")}
                                  </Text>
                                )}
                              </Box>
                            ))}
                        </Stack>
                      )}

                      {isLastCanceled && (
                        <Group justify="flex-end" gap="xs">
                          <Text size="xs" c="dimmed">
                            <em>{I18n.get(labels.notSentLabel)}</em>
                          </Text>
                          {hoveredMessageId === msg.id && (
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              onClick={() => handleEditCanceled(msg)}
                              title={I18n.get(labels.editLabel)}
                              aria-label={I18n.get(labels.editLabel)}
                              data-ai-kit-edit-button
                            >
                              <IconPencil size={14} />
                            </ActionIcon>
                          )}
                        </Group>
                      )}

                      {msg.citations && msg.citations.length > 0 && (
                        <Stack className="ai-citations">
                          <Text fw="bold" size="sm" mb="xs">
                            {I18n.get(labels.referencesLabel)}
                          </Text>
                          <List spacing="xs" size="sm">
                            {msg.citations.map((c, i) => {
                              const link = c.sourceUrl || c.url;
                              const citeTitle =
                                c.title ||
                                link ||
                                `${I18n.get(labels.referenceLabel)} #${i + 1}`;
                              return (
                                <List.Item key={i}>
                                  {link ? (
                                    <Anchor
                                      href={link}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {citeTitle}
                                    </Anchor>
                                  ) : (
                                    <Text>{citeTitle}</Text>
                                  )}
                                  {c.snippet ? (
                                    <Text size="xs" c="dimmed" mt={4}>
                                      {c.snippet}
                                    </Text>
                                  ) : null}
                                </List.Item>
                              );
                            })}
                          </List>
                        </Stack>
                      )}

                      {msg.role === "assistant" && msg.error && msg.retryText && (
                        <Button variant="subtle" size="xs" disabled={ai.busy}
                          onClick={() => void ask(msg.retryText)}>
                          {I18n.get("Retry")}
                        </Button>
                      )}
                      {msg.role === "assistant" && !msg.error && !msg.id.startsWith("assistant-error") && (
                        <Group className="ai-feedback" gap="xs">
                          <Button
                            className={
                              msg.feedback === "accepted" ? "active" : undefined
                            }
                            onClick={() => updateFeedback(msg.id, "accepted")}
                            aria-label={I18n.get(labels.acceptResponseLabel)}
                            disabled={ai.busy}
                            data-ai-kit-feedback-accept-button
                          >
                            👍
                          </Button>
                          <Button
                            type="button"
                            className={
                              msg.feedback === "rejected" ? "active" : undefined
                            }
                            onClick={() => updateFeedback(msg.id, "rejected")}
                            aria-label={I18n.get(labels.rejectResponseLabel)}
                            disabled={ai.busy}
                            data-ai-kit-feedback-reject-button
                          >
                            👎
                          </Button>
                        </Group>
                      )}
                    </Stack>
                  </Group>
                );
              })}

              {/* Progress/status bubble (assistant side) - ONLY while waiting for chat answer */}
              {showStatusBubble && (
                <Group
                  justify="flex-start"
                  className="ai-chat-row assistant status"
                >
                  <Stack className={`ai-chat-bubble typing${streamView?.text ? "" : " waiting"}`}>
                    <Text className="ai-chat-header" fw="bolder" size="xs">
                      {modalTitle}
                    </Text>
                    {!!streamView?.text && (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {streamView.text}
                      </ReactMarkdown>
                    )}
                    <div className="typing-indicator" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                  </Stack>
                </Group>
              )}
            </Modal.Body>

            {/* Status line (below bubbles) */}
            <Group
              className="ai-status-line"
              role={statusLineError ? "alert" : "status"}
              aria-live={statusLineError ? "assertive" : "polite"}
            >
              <Text className="ai-status-text">
                <em>{statusLineText}</em>
              </Text>
            </Group>

            <Text
              className="ai-generated-content-disclosure ai-chatbot-generated-content-disclosure"
              size="xs"
              c="dimmed"
              role="note"
              data-ai-kit-ai-disclosure
            >
              {aiDisclosure}
            </Text>

            <Stack className="ai-box ai-box-open">
              {/* Reset confirmation dialog (Yes/No) */}
              <Modal
                opened={resetDialogOpen}
                onClose={cancelReset}
                centered
                title={I18n.get("Reset conversation")}
                style={{ zIndex: "var(--mb-z-index)", position: "fixed" }}
                left={0}
              >
                <Text size="sm">
                  {I18n.get("Are you sure you want to reset the conversation?")}
                </Text>
                <Group justify="flex-end" mt="md">
                  <Button
                    variant="default"
                    onClick={cancelReset}
                    data-ai-kit-no-button
                  >
                    {I18n.get("No")}
                  </Button>
                  <Button
                    color="var(--ai-kit-color-danger, red)"
                    onClick={confirmReset}
                    disabled={!hasMessages && !isChatBusy}
                    data-ai-kit-yes-button
                  >
                    {I18n.get("Yes")}
                  </Button>
                </Group>
              </Modal>

              <Group>
                <Textarea
                  className="ai-message"
                  ref={questionInputRef}
                  placeholder={textareaPlaceholder}
                  value={question}
                  onChange={(e) => {
                    setQuestion(e.target.value);
                    // Clear audio when typing
                    if (composerAudio) {
                      clearComposerAudio();
                    }
                  }}
                  onKeyDown={handleQuestionKeyDown}
                  rows={3}
                  disabled={recording || !!composerAudio}
                />
              </Group>

              {/* Audio level indicator when recording */}
              {USE_AUDIO && recording && (
                <Stack gap="xs" mt="xs">
                  <Text size="xs" c="dimmed">
                    <em>{I18n.get("Recording...")}</em>
                  </Text>
                  <div
                    style={{
                      width: "100%",
                      height: "4px",
                      backgroundColor: "var(--mantine-color-gray-3)",
                      borderRadius: "2px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${audioLevel}%`,
                        height: "100%",
                        backgroundColor: "var(--mantine-color-red-6)",
                        transition: "width 0.1s ease",
                      }}
                    />
                  </div>
                </Stack>
              )}

              {/* Audio playback when recorded */}
              {USE_AUDIO && composerAudio && !recording && (
                <Stack gap="xs" mt="xs">
                  <Text size="xs" c="dimmed">
                    <em>
                      {I18n.get("Audio recorded")} (
                      {Math.round(composerAudio.duration)}s)
                    </em>
                  </Text>
                  <audio
                    className="ai-kit-audio-player"
                    controls
                    src={composerAudio.objectUrl}
                  />
                </Stack>
              )}

              <Group className="ai-actions" justify="space-between" w="100%">
                <Group justify="flex-start">
                  <Button
                    variant="light"
                    leftSection={<IconTrash size={18} />}
                    onClick={handleResetClick}
                    disabled={!hasMessages && !isChatBusy}
                    data-ai-kit-reset-button
                  >
                    {I18n.get(labels.resetLabel)}
                  </Button>
                </Group>

                <Group justify="flex-end">
                  {/* Microphone button */}
                  {USE_AUDIO && (
                    <>
                      {composerAudio ? (
                        <Button
                          variant="outline"
                          leftSection={<IconX size={18} />}
                          onClick={clearComposerAudio}
                          disabled={isChatBusy}
                          title={I18n.get("Clear audio")}
                          data-ai-kit-clear-audio-button
                        >
                          {I18n.get("Clear")}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          leftSection={<IconMicrophone size={18} />}
                          onClick={recording ? stopRecording : startRecording}
                          disabled={isChatBusy}
                          title={
                            recording
                              ? I18n.get("Stop recording")
                              : I18n.get("Record audio")
                          }
                          color={recording ? "red" : undefined}
                          data-ai-kit-microphone-button
                        >
                          {recording ? I18n.get("Stop") : I18n.get("Record")}
                        </Button>
                      )}
                    </>
                  )}

                  {imageAttachmentsEnabled && (
                    <>
                      <Button
                        variant="outline"
                        leftSection={<IconPaperclip size={18} />}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={
                          composerImages.length >= resolvedMaxImages ||
                          isChatBusy ||
                          recording ||
                          !!composerAudio
                        }
                        title={I18n.get(labels.addImageLabel)}
                        data-ai-kit-add-image-button
                      >
                        {I18n.get(labels.addLabel)}
                      </Button>
                      <Input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        style={{ display: "none" }}
                        multiple
                        onChange={onPickImages}
                      />
                    </>
                  )}

                  {/* Send -> Cancel switch (ChatGPT-like) */}
                  <Button
                    leftSection={sendOrCancelIcon}
                    variant="filled"
                    onClick={onSendOrCancel}
                    disabled={!isChatBusy && !canSend}
                    data-ai-kit-send-button
                  >
                    {sendOrCancelLabel}
                  </Button>
                </Group>
              </Group>

              {composerPreviews.length > 0 && (
                <Group className="ai-thumbs" mt="xs" gap="xs">
                  {composerPreviews.map(({ url, title }, i) => (
                    <div
                      key={composerImages[i]?.id ?? i}
                      role="button"
                      tabIndex={0}
                      className="thumb"
                      style={{
                        backgroundImage: url ? `url(${url})` : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat",
                        overflow: "visible",
                      }}
                      aria-label={title || I18n.get("View image")}
                      onClick={() => openAttachmentPreview(url, title)}
                      onKeyDown={(evt) => {
                        if (evt.key === "Enter" || evt.key === " ") {
                          evt.preventDefault();
                          openAttachmentPreview(url, title);
                        }
                      }}
                    >
                      <Button
                        variant="white"
                        onClick={(evt) => {
                          evt.stopPropagation();
                          removeImage(i);
                        }}
                        aria-label={I18n.get(labels.removeImageLabel)}
                        mt="-xs"
                        mr="-xs"
                        size="xs"
                        p={0}
                        className="remove-image-button"
                        title={I18n.get(labels.removeImageLabel)}
                        data-ai-kit-remove-image-button
                      >
                        X
                      </Button>
                    </div>
                  ))}
                </Group>
              )}
            </Stack>
          </div>
        </Modal.Root>
      )}

      <Modal
        opened={!!previewAttachment}
        onClose={closeAttachmentPreview}
        centered
        size="auto"
        title={previewAttachment?.title || I18n.get("Image preview")}
      >
        {previewAttachment && (
          <img
            src={previewAttachment.url}
            alt={previewAttachment.title || I18n.get("Image preview")}
            style={{ maxWidth: "100%", maxHeight: "70vh" }}
          />
        )}
      </Modal>
    </Group>
  );
};

export const AiChatbot = withAiKitShell(AiChatbotBase, {
  showOpenButton: true,
  variation: "modal",
  overlayWholeComponent: true,
});
