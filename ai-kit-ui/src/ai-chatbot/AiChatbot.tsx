import {
  ActionIcon,
  Anchor,
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
  IconMinimize,
  IconPaperclip,
  IconPencil,
  IconPlayerStop,
  IconSend,
  IconTrash,
} from "@tabler/icons-react";

import {
  getStoreSelect,
  sendChatMessage,
  sendFeedbackMessage,
  type AiChatbotLabels,
  type AiChatbotProps,
  type AiKitStatusEvent,
  type HistoryStorageMode,
} from "@smart-cloud/ai-kit-core";
import { useSelect } from "@wordpress/data";
import { I18n } from "aws-amplify/utils";
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

import { translations } from "../i18n";
import { useAiRun } from "../useAiRun";
import { AiKitShellInjectedProps, withAiKitShell } from "../withAiKitShell";

I18n.putVocabularies(translations);

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// New: history storage support
const DEFAULT_HISTORY_STORAGE: HistoryStorageMode = "localstorage";
const HISTORY_STORAGE_KEY = `ai-kit-chatbot-history-v1:${
  typeof window !== "undefined" ? window.location.hostname : "unknown"
}`;

export const DEFAULT_CHATBOT_LABELS: Required<AiChatbotLabels> = {
  modalTitle: "AI Assistant",

  userLabel: "User",
  assistantLabel: "Assistant",

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

type CitationLike = {
  url?: string;
  sourceUrl?: string;
  title?: string;
  snippet?: string;
};

type ChatResponse = {
  result: string;
  sessionId?: string;
  citations?: CitationLike[];
  metadata?: {
    citationCount?: number;
    modelId?: string;
    requestId?: string;
    messageId?: string;
  };
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: CitationLike[];
  createdAt: number;
  feedback?: "accepted" | "rejected";
  clientStatus?: "pending" | "canceled";
};

type ActiveOp = "chat" | "feedback" | null;

function createMessageId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(
    36,
  )}`;
}

const DEFAULT_MAX_IMAGES = 4;
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

const formatStatusEvent = (event?: AiKitStatusEvent | null): string | null => {
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
      return msg || I18n.get("Sending request to server...");
    case "backend:waiting":
      return msg || I18n.get("Waiting for response...");
    case "backend:response":
      return msg || I18n.get("Receiving response...");
    case "done":
      return msg || I18n.get("Done.");
    case "error":
      return msg || I18n.get("An error occurred.");
    default:
      return msg || null;
  }
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

type PersistedChat = {
  version: 1;
  lastUserSentAt: number | null;
  session?: { id: string; storedAt: number } | null;
  messages: ChatMessage[];
};

const AiChatbotBase: FC<AiChatbotProps & AiKitShellInjectedProps> = (props) => {
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
    placeholder,
    maxImages,
    maxImageBytes,

    // New
    historyStorage = DEFAULT_HISTORY_STORAGE,
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
  const [images, setImages] = useState<File[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [statusLineError, setStatusLineError] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [maxEnter, setMaxEnter] = useState(false);
  const [opened, setOpened] = useState(false);
  const [stickToBottom, setStickToBottom] = useState(true);

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

  // New: persist timestamp of last actually-sent user message
  const [lastUserSentAt, setLastUserSentAt] = useState<number | null>(null);

  // Keep latest values in refs for stable callbacks
  const questionRef = useRef(question);
  const imagesRef = useRef(images);
  const messagesRef = useRef(messages);
  const lastUserSentAtRef = useRef(lastUserSentAt);

  useEffect(() => {
    questionRef.current = question;
  }, [question]);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    lastUserSentAtRef.current = lastUserSentAt;
  }, [lastUserSentAt]);

  useEffect(() => {
    if (language) {
      I18n.setLanguage(language || "en");
    }
  }, [language]);

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

  const hasMessages = messages.length > 0;

  const isChatBusy = useMemo(
    () => ai.busy && activeOp === "chat",
    [ai.busy, activeOp],
  );

  const canSend = useMemo(() => {
    if (isChatBusy) return false;
    return question.trim().length > 0;
  }, [question, isChatBusy]);

  const openButtonLabel = useMemo(() => {
    const raw = openButtonTitle ? openButtonTitle : labels.askMeLabel;
    return I18n.get(raw);
  }, [openButtonTitle, labels.askMeLabel, language]);

  const modalTitle = useMemo(() => {
    const raw = title ? title : labels.modalTitle;
    return I18n.get(raw);
  }, [title, labels.modalTitle, language]);

  const textareaPlaceholder = useMemo(() => {
    const raw = placeholder ? placeholder : labels.placeholder;
    return I18n.get(raw);
  }, [placeholder, labels.placeholder, language]);

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

  const imagePreviews = useMemo(() => {
    if (
      typeof window === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      return images.map((file) => ({ file, url: "" }));
    }
    return images.map((file) => ({ file, url: URL.createObjectURL(file) }));
  }, [images]);

  useEffect(() => {
    if (!hasMessages) setStickToBottom(true);
  }, [hasMessages]);

  useEffect(() => {
    return () => {
      if (
        typeof window === "undefined" ||
        typeof URL.revokeObjectURL !== "function"
      )
        return;
      imagePreviews.forEach(({ url }) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [imagePreviews]);

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

  const statusText = useMemo(() => {
    if (!ai.busy) return null;
    return formatStatusEvent(ai.statusEvent) || I18n.get("Working…");
  }, [ai.busy, ai.statusEvent, language]);

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
    if (!ai.busy || activeOpRef.current !== "chat") return;

    cancelRequestedRef.current = true;
    try {
      ai.cancel();
    } catch {
      // ignore
    }

    // UI: treat as "not sent"
    markLastPendingAs("canceled");
    setActiveOp(null);

    // feedback-only status line error should not persist into chat cancel
    setStatusLineError(null);

    scrollToBottom();
  }, [ai, markLastPendingAs, scrollToBottom]);

  const onPickImages = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const existing = imagesRef.current;
      const files = Array.from(e.target.files || []);
      const remaining = Math.max(0, resolvedMaxImages - existing.length);

      const picked = files.slice(0, remaining).filter((f) => {
        const okType = /image\/(jpeg|png|gif|webp)/i.test(f.type);
        const okSize = f.size <= resolvedMaxBytes;
        const okNew = !existing.find(
          (x) =>
            x.name === f.name &&
            x.size === f.size &&
            x.lastModified === f.lastModified,
        );
        return okType && okSize && okNew;
      });

      if (picked.length) setImages((prev) => [...prev, ...picked]);
      e.currentTarget.value = "";
    },
    [resolvedMaxImages, resolvedMaxBytes],
  );

  const removeImage = useCallback((ix: number) => {
    setImages((prev) => prev.filter((_, i) => i !== ix));
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

  const resetConversation = useCallback(() => {
    setMessages([]);
    setStatusLineError(null);
    sessionRef.current = null;
    setLastUserSentAt(null);
    setStickToBottom(true);
    setResetDialogOpen(false);

    // clear persisted history immediately
    const storage = getHistoryStorage(historyStorage);
    if (storage) {
      try {
        storage.removeItem(HISTORY_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, [historyStorage]);

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
          Date.now() - sessionRef.current.storedAt < TWENTY_FOUR_HOURS_MS
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
    [ai, language],
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

  const ask = useCallback(async () => {
    const trimmed = questionRef.current.trim();
    if (!trimmed || ai.busy) return;

    cancelRequestedRef.current = false;
    setStatusLineError(null);
    setActiveOp("chat");

    const selectedImages = imagesRef.current;

    const userMessageId = createMessageId("user");
    const userMessageCreatedAt = Date.now();
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      content: trimmed,
      createdAt: userMessageCreatedAt,
      clientStatus: "pending",
    };

    // optimistic UI
    setQuestion("");
    setImages([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setMessages((prev) => [...prev, userMessage]);

    if (!opened) setOpened(true);
    scrollToBottom();

    try {
      const activeSessionId =
        sessionRef.current &&
        Date.now() - sessionRef.current.storedAt < TWENTY_FOUR_HOURS_MS
          ? sessionRef.current.id
          : undefined;

      const res = (await ai.run(async ({ signal, onStatus }) => {
        const out = await sendChatMessage(
          {
            sessionId: activeSessionId,
            message: trimmed,
            images: selectedImages,
          },
          {
            signal,
            onStatus,
          },
        );
        return out;
      })) as ChatResponse | null;

      // If user clicked cancel while request was in-flight, ignore output
      if (cancelRequestedRef.current) {
        markLastPendingAs("canceled");
        return;
      }

      if (!res) throw new Error(I18n.get(labels.emptyResponseLabel));

      if (res.sessionId) {
        sessionRef.current = {
          id: res.sessionId,
          storedAt: Date.now(),
        };
      }

      const assistantMessage: ChatMessage = {
        id: res.metadata?.messageId || createMessageId("assistant"),
        role: "assistant",
        content: res.result || "",
        citations: res.citations,
        createdAt: Date.now(),
      };

      setMessages((prev) => {
        const cleared = prev.map((m) =>
          m.id === userMessageId ? { ...m, clientStatus: undefined } : m,
        );
        return [...cleared, assistantMessage];
      });

      // mark last sent timestamp on successful request completion
      setLastUserSentAt(userMessageCreatedAt);
    } catch (e) {
      console.error("Error during ask()", e);
      // Cancel: treat as not sent, no error bubble
      if (
        cancelRequestedRef.current ||
        isAbortLike(e as Error & { code?: string })
      ) {
        markLastPendingAs("canceled");
        return;
      }

      const msg =
        (e as Error)?.message?.trim() || I18n.get(labels.unexpectedErrorLabel);

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
            content: `⚠️ ${msg}`,
            createdAt: Date.now(),
          },
        ];
      });

      // still consider the message "sent" (server error happened after sending)
      setLastUserSentAt(userMessageCreatedAt);
    } finally {
      setActiveOp((prev) => (prev === "chat" ? null : prev));
      cancelRequestedRef.current = false;
      if (questionInputRef.current) questionInputRef.current.focus();
      scrollToBottom();
    }
  }, [
    ai,
    opened,
    scrollToBottom,
    markLastPendingAs,
    labels.emptyResponseLabel,
    labels.unexpectedErrorLabel,
    language,
  ]);

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

  const handleEditCanceled = useCallback((msg: ChatMessage) => {
    setQuestion(msg.content);
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    queueMicrotask(() => questionInputRef.current?.focus());
  }, []);

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
  }, [showOpenButtonIcon, openButtonIcon, labels, openButtonLabel, language]);

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

  // Status line: hidden only while waiting for assistant (no duplicate).
  const showStatusLine = useMemo(() => {
    if (isChatBusy) return false;
    return true;
  }, [isChatBusy]);

  const statusLineText = useMemo(() => {
    if (statusLineError) return statusLineError;
    return hasMessages
      ? I18n.get(labels.readyLabel)
      : I18n.get(labels.readyEmptyLabel);
  }, [
    statusLineError,
    hasMessages,
    labels.readyLabel,
    labels.readyEmptyLabel,
    language,
  ]);

  const sendOrCancelLabel = useMemo(() => {
    if (isChatBusy) return I18n.get(labels.cancelLabel);
    return I18n.get(labels.sendLabel);
  }, [isChatBusy, labels.cancelLabel, labels.sendLabel, language]);

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
    const storage = getHistoryStorage(historyStorage);
    if (!storage) return;

    try {
      const raw = storage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as PersistedChat;
      const last =
        typeof parsed?.lastUserSentAt === "number"
          ? parsed.lastUserSentAt
          : null;

      // Only use storage within 24 hours
      if (!last || Date.now() - last > TWENTY_FOUR_HOURS_MS) {
        storage.removeItem(HISTORY_STORAGE_KEY);
        return;
      }

      const loadedMessages = Array.isArray(parsed.messages)
        ? parsed.messages
        : [];

      // Normalize stale "pending" to "canceled" after reload
      const normalized = loadedMessages.map((m) => {
        if (m?.role === "user" && m.clientStatus === "pending") {
          return { ...m, clientStatus: "canceled" as const };
        }
        return m;
      });

      setMessages(normalized);
      setLastUserSentAt(last);

      if (parsed.session && parsed.session.id) {
        sessionRef.current = parsed.session;
      }
    } catch {
      try {
        storage.removeItem(HISTORY_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, [historyStorage]);

  useEffect(() => {
    const storage = getHistoryStorage(historyStorage);
    if (!storage) return;

    if (historyStorage === "nostorage") {
      try {
        storage.removeItem(HISTORY_STORAGE_KEY);
      } catch {
        // ignore
      }
      return;
    }

    const last = lastUserSentAtRef.current;

    if (!last) return;

    if (Date.now() - last > TWENTY_FOUR_HOURS_MS) {
      try {
        storage.removeItem(HISTORY_STORAGE_KEY);
      } catch {
        // ignore
      }
      return;
    }

    const payload: PersistedChat = {
      version: 1,
      lastUserSentAt: last,
      session: sessionRef.current,
      messages,
    };

    try {
      storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [messages, lastUserSentAt, historyStorage]);

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
                              : I18n.get(labels.assistantLabel)}
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
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        ) : (
                          <Text size="sm" miw="100px">
                            {msg.content}
                          </Text>
                        )}
                      </Stack>

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

                      {msg.role === "assistant" && (
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
                  <Stack className="ai-chat-bubble typing">
                    {statusText ? (
                      <Text size="sm" c="dimmed">
                        <em>{statusText}</em>
                      </Text>
                    ) : null}
                    <div className="typing-indicator">
                      <span />
                      <span />
                      <span />
                    </div>
                  </Stack>
                </Group>
              )}
            </Modal.Body>

            {/* Status line (below bubbles) */}
            {showStatusLine && (
              <Group className="ai-status-line">
                <Text className="ai-status-text">
                  <em>{statusLineText}</em>
                </Text>
              </Group>
            )}

            <Stack className="ai-box ai-box-open">
              {/* Reset confirmation dialog (Yes/No) */}
              <Modal
                opened={resetDialogOpen}
                onClose={cancelReset}
                centered
                title={I18n.get("Reset conversation")}
                style={{ position: "fixed" }}
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
                  }}
                  onKeyDown={handleQuestionKeyDown}
                  rows={3}
                />
              </Group>

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
                  <Button
                    variant="outline"
                    leftSection={<IconPaperclip size={18} />}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={images.length >= resolvedMaxImages}
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

              {imagePreviews.length > 0 && (
                <Group className="ai-thumbs" mt="xs" gap="xs">
                  {imagePreviews.map(({ url }, i) => (
                    <div
                      key={i}
                      className="thumb"
                      style={{
                        backgroundImage: url ? `url(${url})` : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat",
                        overflow: "visible",
                      }}
                    >
                      <Button
                        variant="white"
                        onClick={() => removeImage(i)}
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
    </Group>
  );
};

export const AiChatbot = withAiKitShell(AiChatbotBase, {
  showOpenButton: true,
  variation: "modal",
});
