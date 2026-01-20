import {
  Alert,
  Button,
  Collapse,
  Divider,
  Group,
  Input,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  AiFeatureProps,
  AiKitFeatureIcon,
  type AiKitLanguageCode,
  type AiKitStatusEvent,
  type AiModePreference,
  type ContextKind,
  detectLanguage,
  type DetectLanguageOutput,
  getAiKitPlugin,
  LANGUAGE_OPTIONS,
  prompt,
  type PromptArgs,
  proofread,
  type ProofreadArgs,
  rewrite,
  type RewriteArgs,
  summarize,
  type SummarizeArgs,
  translate,
  type TranslateArgs,
  waitForAiKitReady,
  write,
  type WriteArgs,
} from "@smart-cloud/ai-kit-core";
import { I18n } from "aws-amplify/utils";
import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  IconCircleDashedCheck,
  IconLanguage,
  IconPencilCode,
  IconSeo,
  IconSum,
} from "@tabler/icons-react";

import { translations } from "../i18n";
import {
  isBackendConfigured,
  readDefaultOutputLanguage,
  stripCodeFence,
  useAiRun,
} from "../useAiRun";
import { AiKitShellInjectedProps, withAiKitShell } from "../withAiKitShell";
import { AiFeatureBorder } from "./AiFeatureBorder";
import { ProofreadDiff } from "./ProofreadDiff";
import { markdownToHtml } from "./utils";

I18n.putVocabularies(translations);

type GeneratedImageMetadata = {
  alt_text?: string;
  title?: string;
  caption?: string;
  description?: string;
};

type GeneratedPostMetadata = {
  title?: string;
  excerpt?: string;
};

const postResponseConstraint = {
  type: "object",
  properties: {
    title: {
      type: "string",
      minLength: 1,
      maxLength: 60,
    },
    excerpt: {
      type: "string",
      minLength: 1,
      maxLength: 155,
    },
  },
  required: ["title", "excerpt"],
  additionalProperties: false,
} as PromptArgs["responseConstraint"];

const imageResponseConstraint = {
  type: "object",
  properties: {
    alt: {
      type: "string",
      minLength: 1,
      maxLength: 125,
    },
    title: {
      type: "string",
      minLength: 1,
      maxLength: 80,
    },
    caption: {
      type: "string",
      minLength: 1,
      maxLength: 150,
    },
    description: {
      type: "string",
      minLength: 1,
      maxLength: 300,
    },
  },
  required: ["alt", "title", "caption", "description"],
  additionalProperties: false,
} as PromptArgs["responseConstraint"];

function normalizeLang(
  code: string | null | undefined,
): AiKitLanguageCode | null {
  const c = (code ?? "").trim();
  if (!c) return null;
  return (c.toLowerCase().split("-")[0] as AiKitLanguageCode) || null;
}

async function detectTopLanguage(
  text: string,
  args: {
    signal: AbortSignal;
    onStatus?: (e: AiKitStatusEvent) => void;
    context?: ContextKind;
    modeOverride?: AiModePreference;
  },
): Promise<AiKitLanguageCode> {
  const res: DetectLanguageOutput = await detectLanguage(
    { text },
    {
      signal: args.signal,
      onStatus: args.onStatus,
      context: args.context,
      modeOverride: args.modeOverride,
    },
  );
  const top =
    normalizeLang(res.result?.candidates?.[0]?.detectedLanguage) ?? "en";
  return top;
}

async function parseImageMetadataFromPromptResult(
  text: string,
  outputLang: AiKitLanguageCode | "",
): Promise<GeneratedImageMetadata> {
  const cleaned = stripCodeFence(text || "").trim();
  if (!cleaned) return {};

  try {
    const parsed = JSON.parse(cleaned) as {
      alt?: string;
      title?: string;
      caption?: string;
      description?: string;
    };
    return {
      alt_text:
        typeof parsed.alt === "string"
          ? outputLang && outputLang !== "en"
            ? (
                await translate({
                  text: parsed.alt,
                  sourceLanguage: "en",
                  targetLanguage: outputLang,
                })
              ).result
            : parsed.alt
          : "",
      title:
        typeof parsed.title === "string"
          ? outputLang && outputLang !== "en"
            ? (
                await translate({
                  text: parsed.title,
                  sourceLanguage: "en",
                  targetLanguage: outputLang,
                })
              ).result
            : parsed.title
          : "",
      caption:
        typeof parsed.caption === "string"
          ? outputLang && outputLang !== "en"
            ? (
                await translate({
                  text: parsed.caption,
                  sourceLanguage: "en",
                  targetLanguage: outputLang,
                })
              ).result
            : parsed.caption
          : "",
      description:
        typeof parsed.description === "string"
          ? outputLang && outputLang !== "en"
            ? (
                await translate({
                  text: parsed.description,
                  sourceLanguage: "en",
                  targetLanguage: outputLang,
                })
              ).result
            : parsed.description
          : "",
    };
  } catch (e) {
    console.warn("AI Kit: failed to parse JSON metadata output", e);
    return {};
  }
}

async function parsePostMetadataFromPromptResult(
  text: string,
  outputLang: AiKitLanguageCode | "",
): Promise<GeneratedPostMetadata> {
  const cleaned = stripCodeFence(text || "").trim();
  if (!cleaned) return {};

  try {
    const parsed = JSON.parse(cleaned) as {
      title?: string;
      excerpt?: string;
    };
    return {
      title:
        typeof parsed.title === "string"
          ? outputLang && outputLang !== "en"
            ? (
                await translate({
                  text: parsed.title,
                  sourceLanguage: "en",
                  targetLanguage: outputLang,
                })
              ).result
            : parsed.title
          : "",
      excerpt:
        typeof parsed.excerpt === "string"
          ? outputLang && outputLang !== "en"
            ? (
                await translate({
                  text: parsed.excerpt,
                  sourceLanguage: "en",
                  targetLanguage: outputLang,
                })
              ).result
            : parsed.excerpt
          : "",
    };
  } catch (e) {
    console.warn("AI Kit: failed to parse JSON metadata output", e);
    return {};
  }
}

/**
 * Wrapper around WP with:
 * - higher z-index (Media Library grid view can be aggressive)
 * - standard status + error area
 * - optional Cancel action
 */
const AiFeatureBase: FC<AiFeatureProps & AiKitShellInjectedProps> = (props) => {
  const {
    allowOverride: allowOverrideDefaults,
    autoRun = true,
    editable = true,
    variation = props.variation || "default",
    title,
    showOpenButton = false,
    showOpenButtonTitle = true,
    showOpenButtonIcon = true,
    openButtonTitle,
    openButtonIcon,
    showRegenerateOnBackendButton = true,
    acceptButtonTitle = props.acceptButtonTitle || "Accept",
    optionsDisplay = props.optionsDisplay || "collapse",
    mode,
    context,
    modeOverride,
    colorMode,
    default: defaults,
    onClose,
    onAccept,
    language,
    rootElement,
  } = props;

  const allowOverride = {
    text: allowOverrideDefaults?.text ?? true,
    instructions: allowOverrideDefaults?.instructions ?? true,
    tone: allowOverrideDefaults?.tone ?? true,
    length: allowOverrideDefaults?.length ?? true,
    type: allowOverrideDefaults?.type ?? true,
    outputLanguage: allowOverrideDefaults?.outputLanguage ?? true,
    outputFormat: allowOverrideDefaults?.outputFormat ?? true,
  };

  const allowOverrideParameters = useMemo(() => {
    return Boolean(
      (mode === "write" && allowOverride?.text) ||
      ((mode === "write" ||
        mode === "rewrite" ||
        mode === "generateImageMetadata" ||
        mode === "generatePostMetadata") &&
        allowOverride?.instructions) ||
      ((mode === "write" || mode === "rewrite") && allowOverride?.tone) ||
      ((mode === "write" || mode === "rewrite" || mode === "summarize") &&
        allowOverride?.length) ||
      (mode === "summarize" && allowOverride?.type) ||
      allowOverride?.outputLanguage,
    );
  }, [allowOverride]);

  const [featureOpen, setFeatureOpen] = useState<boolean>(!showOpenButton);
  const [optionsOpen, setOptionsOpen] = useState<boolean>(false);
  const [backendConfigured, setBackendConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<never | null>(null);
  const [text, setText] = useState<string | undefined>(defaults?.text);
  const [image] = useState<Blob | undefined>(defaults?.image);
  const [instructions, setInstructions] = useState<string | undefined>(
    defaults?.instructions,
  );
  const [inputLanguage, setInputLanguage] = useState<
    AiKitLanguageCode | "auto" | undefined
  >(defaults?.inputLanguage);
  const [outputFormat, setOutputFormat] = useState<
    "plain-text" | "markdown" | "html" | undefined
  >(defaults?.outputFormat);
  const [outputLanguage, setOutputLanguage] = useState<
    AiKitLanguageCode | "auto" | undefined
  >(defaults?.outputLanguage);
  const [length, setLength] = useState<
    WriterLength | RewriterLength | SummarizerLength | undefined
  >(defaults?.length);
  const [tone, setTone] = useState<WriterTone | RewriterTone | undefined>(
    defaults?.tone,
  );
  const [type, setType] = useState<SummarizerType | undefined>(defaults?.type);

  const autoRunOnceRef = useRef(false);

  const defaultTitle = useMemo(() => {
    if (language) {
      I18n.setLanguage(language || "en");
    }
    let title;
    switch (mode) {
      default:
      case "summarize":
        title = I18n.get("Summarize");
        break;
      case "proofread":
        title = I18n.get("Proofread");
        break;
      case "write":
        title = I18n.get("Write");
        break;
      case "rewrite":
        title = I18n.get("Rewrite");
        break;
      case "translate":
        title = I18n.get("Translate");
        break;
      case "generatePostMetadata":
        title = I18n.get("Generate Post Metadata");
        break;
      case "generateImageMetadata":
        title = I18n.get("Generate Image Metadata");
        break;
    }
    return title;
  }, [mode, language]);

  const formatAiKitStatus = useCallback(
    (e: AiKitStatusEvent | null): string | null => {
      if (!e) return null;

      const step = e.step;
      const msg = I18n.get((e.message ?? "").trim());
      const p = typeof e.progress === "number" ? e.progress : null;
      const pct = p == null ? null : Math.round(p * 100);

      switch (step) {
        case "decide":
          return msg || I18n.get("Checking capabilities...");
        case "on-device:init":
          return msg || I18n.get("Initializing on-device AI...");
        case "on-device:download":
          return (
            msg ||
            (pct == null
              ? I18n.get("Downloading model...")
              : I18n.get("Downloading model...") + " " + pct + "%")
          );
        case "on-device:ready":
          return msg || I18n.get("On-device model ready.");
        case "on-device:run":
          return msg || I18n.get("Generating...");
        case "backend:request":
          return msg || I18n.get("Sending request to backend...");
        case "backend:waiting":
          return msg || I18n.get("Waiting for backend response...");
        case "backend:response":
          return msg || I18n.get("Received backend response.");
        case "done":
          return msg || I18n.get("Done.");
        case "error":
          return msg || I18n.get("Something went wrong.");
        default:
          return msg || I18n.get("Working...");
      }
    },
    [language],
  );

  const inputText = useMemo(() => {
    return text ?? defaults?.getText;
  }, [text, defaults]);

  const canGenerate = useMemo(() => {
    const text = typeof inputText === "function" ? inputText() : inputText;
    switch (mode) {
      case "generateImageMetadata":
        return Boolean(image);
      case "translate":
        return (
          Boolean(text && text.trim().length > 0) &&
          outputLanguage &&
          inputLanguage !== outputLanguage
        );
      case "summarize":
      case "proofread":
      case "rewrite":
      case "write":
      case "generatePostMetadata":
        return Boolean(text && text.trim().length > 0);
      default:
        return false;
    }
  }, [inputText, mode, image, inputLanguage, outputLanguage]);

  const ai = useAiRun();
  const statusText = formatAiKitStatus(ai.statusEvent);

  const runGenerate = useCallback(
    async (modeOverride?: AiModePreference) => {
      if (!canGenerate) {
        return;
      }
      if (allowOverrideParameters && mode !== "proofread" && canGenerate) {
        setOptionsOpen(false);
      }
      setError(null);
      setGenerated(null);

      try {
        const text = typeof inputText === "function" ? inputText() : inputText;
        switch (mode) {
          case "summarize": {
            const res = await ai.run(async ({ signal, onStatus }) => {
              const outLang =
                (outputLanguage && outputLanguage !== "auto"
                  ? outputLanguage
                  : null) || readDefaultOutputLanguage();
              const args: SummarizeArgs = {
                text: text!.trim(),
                format:
                  outputFormat === "plain-text" ? "plain-text" : "markdown",
                length: length as SummarizerLength,
                type: type as SummarizerType,
                outputLanguage: outLang as SummarizeArgs["outputLanguage"],
              };
              const out = await summarize(args, {
                signal,
                onStatus,
                context,
                modeOverride,
              });
              return out.result;
            });
            setGenerated((res as never) ?? "");
            break;
          }
          case "proofread": {
            const res = await ai.run(async ({ signal, onStatus }) => {
              const expectedInputLanguages: AiKitLanguageCode[] = [];
              try {
                const res = await detectLanguage(
                  { text: text!.trim() },
                  { signal, onStatus },
                );
                const langCodes = res.result?.candidates
                  ?.filter((c) => c.confidence && c.confidence > 0.1)
                  .map((c) => c.detectedLanguage as AiKitLanguageCode);
                expectedInputLanguages.push(...langCodes);
              } catch {
                expectedInputLanguages.push("en");
              }
              const args: ProofreadArgs = {
                text: text!.trim(),
                expectedInputLanguages,
              };
              const out = await proofread(args, {
                signal,
                onStatus,
                context,
                modeOverride,
              });
              return out.result;
            });
            setGenerated((res as never) ?? "");
            break;
          }
          case "translate": {
            const res = await ai.run(async ({ signal, onStatus }) => {
              let inputLang = inputLanguage ?? "auto";
              if (inputLang === "auto") {
                inputLang = await detectTopLanguage(text!.trim(), {
                  signal,
                });
                setInputLanguage(inputLang);
              }
              const outLang =
                (outputLanguage && outputLanguage !== "auto"
                  ? outputLanguage
                  : null) || readDefaultOutputLanguage();
              if (outLang === inputLang) {
                setError(
                  I18n.get("Input and output languages cannot be the same."),
                );
                throw new Error(
                  I18n.get("Input and output languages cannot be the same."),
                );
              }
              const args: TranslateArgs = {
                text: text!.trim(),
                sourceLanguage: inputLang!,
                targetLanguage: outLang,
              };
              const out = await translate(args, {
                signal,
                onStatus,
                context,
                modeOverride,
              });
              return out.result;
            });
            setGenerated((res as never) ?? "");
            break;
          }
          case "rewrite": {
            const res = await ai.run(async ({ signal, onStatus }) => {
              let outLang =
                (outputLanguage && outputLanguage !== "auto"
                  ? outputLanguage
                  : null) || readDefaultOutputLanguage();
              if (outputLanguage === "auto") {
                outLang = await detectTopLanguage(text!.trim(), {
                  signal,
                });
                setOutputLanguage(outLang);
              }
              const args: RewriteArgs = {
                text: text!.trim(),
                context: instructions?.trim() || undefined,
                format:
                  outputFormat === "plain-text" ? "plain-text" : "markdown",
                tone: tone as RewriterTone,
                length: length as RewriterLength,
                outputLanguage: outLang as RewriteArgs["outputLanguage"],
              };
              const out = await rewrite(args, {
                signal,
                onStatus,
                context,
                modeOverride,
              });
              return out.result;
            });
            setGenerated((res as never) ?? "");
            break;
          }
          case "write": {
            const outLang =
              (outputLanguage && outputLanguage !== "auto"
                ? outputLanguage
                : null) || readDefaultOutputLanguage();
            const args: WriteArgs = {
              prompt: text!.trim(),
              context: instructions?.trim() || undefined,
              format: outputFormat === "plain-text" ? "plain-text" : "markdown",
              tone: tone as WriterTone,
              length: length as WriterLength,
              outputLanguage: outLang as WriteArgs["outputLanguage"],
            };
            const res = await ai.run(async ({ signal, onStatus }) => {
              const inLang = await detectTopLanguage(
                text!.trim() + "\n" + (instructions?.trim() || ""),
                {
                  signal,
                },
              );
              if (inLang !== outLang && inLang !== "en") {
                args.prompt = (
                  await translate({
                    text: args.prompt,
                    sourceLanguage: inLang,
                    targetLanguage: "en",
                  })
                ).result;
                if (instructions) {
                  args.context = (
                    await translate({
                      text: instructions,
                      sourceLanguage: inLang,
                      targetLanguage: "en",
                    })
                  ).result;
                }
              }
              const out = await write(args, {
                signal,
                onStatus,
                context,
                modeOverride,
              });
              return out.result;
            });
            setGenerated((res as never) ?? "");
            break;
          }
          case "generatePostMetadata": {
            const messages = [
              {
                role: "system" as const,
                content:
                  "You generate SEO metadata for a WordPress post. " +
                  "Return a minified JSON object with keys: title, excerpt. " +
                  "Constraints: title <= 60 chars, excerpt <= 155 chars. " +
                  "Do not add extra keys." +
                  (instructions
                    ? `
Follow these additional instructions: ${instructions}`
                    : ""),
              },
              {
                role: "user" as const,
                content: `Post content:\n${text!.trim()}\n\nGenerate JSON now.`,
              },
            ];
            const res = (await ai.run(async ({ signal, onStatus }) => {
              const out = await prompt(
                {
                  messages,
                  outputLanguage: "en",
                  responseConstraint: postResponseConstraint,
                },
                {
                  signal,
                  onStatus,
                  context,
                  modeOverride,
                },
              );
              return out.result;
            })) as string | null;
            if (!res) {
              setGenerated("" as never);
              return;
            }
            const cleaned = stripCodeFence(res).trim();
            const outLang =
              (outputLanguage && outputLanguage !== "auto"
                ? outputLanguage
                : null) || readDefaultOutputLanguage();
            try {
              const parsed = await parsePostMetadataFromPromptResult(
                cleaned,
                outLang,
              );
              setGenerated(parsed as never);
            } catch (e) {
              // If parsing fails, keep raw in the modal. User can still copy/paste.
              setGenerated(cleaned as never);
              console.warn("AI Kit: failed to parse SEO JSON", e);
            }

            break;
          }
          case "generateImageMetadata": {
            {
              const messages = [
                {
                  role: "system",
                  content:
                    "You are an assistant that writes WordPress media metadata for accessibility and SEO. " +
                    "Return a minified JSON object with keys: alt, title, caption, description. " +
                    "Do not include any extra keys. Keep it concise and non-promotional." +
                    (instructions
                      ? `
Follow these additional instructions: ${instructions}`
                      : ""),
                },
                { role: "user", content: "Generate the JSON now." },
              ].filter(Boolean) as Array<{
                role: "system" | "user" | "assistant";
                content: string;
              }>;
              const res = (await ai.run(async ({ signal, onStatus }) => {
                const out = await prompt(
                  {
                    messages,
                    images: [image!],
                    outputLanguage: "en",
                    responseConstraint: imageResponseConstraint,
                  },
                  {
                    signal,
                    onStatus,
                    context,
                    modeOverride,
                  },
                );
                return out.result;
              })) as string | null;
              if (!res) {
                setGenerated("" as never);
                return;
              }
              const outLang =
                (outputLanguage && outputLanguage !== "auto"
                  ? outputLanguage
                  : null) || readDefaultOutputLanguage();

              const cleaned = stripCodeFence(res).trim();
              try {
                const parsed = await parseImageMetadataFromPromptResult(
                  cleaned,
                  outLang,
                );
                setGenerated(parsed as never);
              } catch (e) {
                // If parsing fails, keep raw in the modal. User can still copy/paste.
                setGenerated(cleaned as never);
                console.warn("AI Kit: failed to parse SEO JSON", e);
              }
              break;
            }
          }
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : I18n.get("An unknown error occurred."),
        );
      }
    },
    [
      language,
      ai,
      instructions,
      length,
      outputLanguage,
      text,
      tone,
      context,
      mode,
      type,
      inputLanguage,
      canGenerate,
      allowOverrideParameters,
    ],
  );

  const runGenerateOnBackend = useCallback(async () => {
    await runGenerate("backend-only");
  }, [runGenerate]);

  const getOpenButtonDefaultIcon = useCallback(
    (className?: string) => {
      switch (mode) {
        case "proofread":
          return <IconCircleDashedCheck className={className} />;
        case "translate":
          return <IconLanguage className={className} />;
        case "summarize":
          return <IconSum className={className} />;
        case "rewrite":
        case "write":
          return <IconPencilCode className={className} />;
        case "generateImageMetadata":
        case "generatePostMetadata":
          return <IconSeo className={className} />;
        default:
          return <AiKitFeatureIcon mode={mode} className={className} />;
      }
    },
    [mode],
  );

  const getGenerateTitle = useCallback(() => {
    switch (mode) {
      case "proofread":
        return ai.lastSource
          ? I18n.get("Proofread again")
          : I18n.get("Proofread");
      case "translate":
        return ai.lastSource
          ? I18n.get("Translate again")
          : I18n.get("Translate");
      case "rewrite":
        return ai.lastSource ? I18n.get("Rewrite again") : I18n.get("Rewrite");
      case "summarize":
        return ai.lastSource
          ? I18n.get("Summarize again")
          : I18n.get("Summarize");
      default:
        return ai.lastSource ? I18n.get("Regenerate") : I18n.get("Generate");
    }
  }, [language, ai.lastSource, mode]);

  const getRegenerateOnBackendTitle = useCallback(() => {
    switch (mode) {
      case "proofread":
        return I18n.get("Proofread on Backend");
      case "translate":
        return I18n.get("Translate on Backend");
      case "rewrite":
        return I18n.get("Rewrite on Backend");
      case "summarize":
        return I18n.get("Summarize on Backend");
      default:
        return I18n.get("Regenerate on Backend");
    }
  }, [language, mode]);

  const close = useCallback(async () => {
    setFeatureOpen(false);
    setGenerated(null);
    setError(null);
    autoRunOnceRef.current = false;
    ai.reset();
    if (!showOpenButton) {
      onClose();
    }
  }, [onClose, autoRunOnceRef, ai, showOpenButton]);

  const cancel = useCallback(async () => {
    if (ai.busy) {
      ai.cancel();
    }
  }, [ai]);

  useEffect(() => {
    if (
      !featureOpen ||
      !autoRun ||
      !canGenerate ||
      ai.busy ||
      generated ||
      autoRunOnceRef.current
    ) {
      return;
    }
    autoRunOnceRef.current = true;
    queueMicrotask(() => {
      void runGenerate(modeOverride);
    });
  }, [ai.busy, canGenerate, autoRun, generated, runGenerate, modeOverride]);

  useEffect(() => {
    if (!allowOverrideParameters) return;
    if (mode === "proofread") return;
    if (!canGenerate) setOptionsOpen(true);
  }, [allowOverrideParameters, canGenerate, mode]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await waitForAiKitReady();
        const v = await isBackendConfigured();
        if (alive) setBackendConfigured(v);
      } catch (e) {
        console.error(e);
        if (alive) setBackendConfigured(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const optionsSummary = useMemo(() => {
    const parts: string[] = [];

    if (mode === "translate") {
      const lang = LANGUAGE_OPTIONS.find(
        (lo) => lo.value === inputLanguage,
      )?.label;
      parts.push(
        I18n.get("Input language") + ": " + (lang ? I18n.get(lang) : "auto"),
      );
    }
    if (outputLanguage && allowOverride?.outputLanguage) {
      const lang = LANGUAGE_OPTIONS.find(
        (lo) => lo.value === outputLanguage,
      )?.label;
      parts.push(
        I18n.get("Output language") +
          ": " +
          (lang ? I18n.get(lang) : outputLanguage),
      );
    }
    if (mode === "summarize" && type && allowOverride?.type) {
      parts.push(I18n.get("Type") + ": " + I18n.get(type));
    }
    if (
      (mode === "write" || mode === "rewrite") &&
      tone &&
      allowOverride?.tone
    ) {
      parts.push(I18n.get("Tone") + ": " + I18n.get(tone));
    }
    if (
      (mode === "write" || mode === "rewrite" || mode === "summarize") &&
      length &&
      allowOverride?.length
    ) {
      parts.push(I18n.get("Length") + ": " + I18n.get(length));
    }
    if (instructions?.trim() && allowOverride?.instructions) {
      parts.push(I18n.get("Instructions") + ": ✓");
    }

    return parts.length ? parts.join(" • ") : I18n.get("No overrides");
  }, [
    language,
    mode,
    inputLanguage,
    outputLanguage,
    type,
    tone,
    length,
    instructions,
  ]);

  const compactFieldStyles = {
    label: { fontSize: 11, opacity: 0.85 },
    description: { fontSize: 11, opacity: 0.65, marginTop: 2 },
    input: { fontSize: 12 },
  };

  const RootComponent: typeof Modal.Root | typeof Group =
    variation === "modal" ? Modal.Root : Group;
  const ContentComponent: typeof Modal.Content | typeof Group =
    variation === "modal" ? Modal.Content : Group;
  const BodyComponent: typeof Modal.Body | typeof Group =
    variation === "modal" ? Modal.Body : Group;
  const CollapseComponent = optionsDisplay === "collapse" ? Collapse : Stack;
  const OptionsComponent = optionsDisplay === "horizontal" ? Group : Stack;

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
  }, [close, variation]);

  return (
    <>
      {showOpenButton && (
        <Button
          leftSection={
            showOpenButtonIcon &&
            (openButtonIcon ? (
              <span dangerouslySetInnerHTML={{ __html: openButtonIcon }} />
            ) : (
              getOpenButtonDefaultIcon()
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
          className="ai-feature-root"
          onClose={close}
          padding="md"
          gap="md"
          size="md"
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
                {getOpenButtonDefaultIcon("ai-feature-title-icon")}
                <Modal.Title>{I18n.get(title || defaultTitle)}</Modal.Title>
                <Modal.CloseButton />
              </Modal.Header>
            )}
            <BodyComponent w="100%" style={{ zIndex: 1001 }}>
              <AiFeatureBorder
                enabled={variation !== "modal"}
                working={ai.busy}
                variation={variation}
              >
                <Stack gap="sm" mb="sm" p="sm">
                  {/* ERROR */}
                  {error && <Alert color="red">{I18n.get(error)}</Alert>}

                  {/* OVERRIDABLE PARAMETERS */}
                  {allowOverrideParameters && mode !== "proofread" && (
                    <Paper
                      withBorder
                      p="sm"
                      mt="md"
                      className="ai-feature-options"
                      data-options-display={optionsDisplay}
                    >
                      <Group
                        justify="space-between"
                        align="center"
                        className="ai-feature-options-summary"
                        onClick={
                          optionsDisplay === "collapse"
                            ? () => setOptionsOpen((v) => !v)
                            : undefined
                        }
                      >
                        {optionsDisplay === "collapse" && (
                          <Stack gap={0}>
                            <Text
                              size="sm"
                              fw={600}
                              style={{ lineHeight: 1.1 }}
                            >
                              {I18n.get("Options")}
                            </Text>
                            <Text size="xs" c="dimmed" style={{ marginTop: 2 }}>
                              {optionsSummary}
                            </Text>
                          </Stack>
                        )}

                        {optionsDisplay === "collapse" && (
                          <Button
                            variant="subtle"
                            size="xs"
                            style={{ minWidth: "fit-content" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOptionsOpen((v) => !v);
                            }}
                          >
                            {optionsOpen ? I18n.get("Hide") : I18n.get("Show")}
                          </Button>
                        )}
                      </Group>

                      <CollapseComponent in={optionsOpen}>
                        {optionsDisplay === "collapse" && <Divider my="sm" />}
                        <OptionsComponent gap="xs" justify="space-between">
                          {/* TOPIC */}
                          {mode === "write" && allowOverride?.text && (
                            <Tooltip
                              label={I18n.get(
                                "The topic or subject for the AI to write about.",
                              )}
                              disabled={optionsDisplay !== "horizontal"}
                              position="top"
                            >
                              <TextInput
                                size="xs"
                                className="ai-feature-option"
                                styles={compactFieldStyles}
                                disabled={ai.busy}
                                label={I18n.get("Topic")}
                                description={
                                  optionsDisplay !== "horizontal"
                                    ? I18n.get(
                                        "The topic or subject for the AI to write about.",
                                      )
                                    : undefined
                                }
                                value={text || ""}
                                onChange={(
                                  e: React.ChangeEvent<HTMLInputElement>,
                                ) => setText(e.target.value)}
                              />
                            </Tooltip>
                          )}
                          {/* INSTRUCTIONS */}
                          {(mode === "write" ||
                            mode === "rewrite" ||
                            mode === "generateImageMetadata" ||
                            mode === "generatePostMetadata") &&
                            allowOverride?.instructions && (
                              <Tooltip
                                label={I18n.get(
                                  "Additional instructions to guide the AI.",
                                )}
                                disabled={optionsDisplay !== "horizontal"}
                                position="top"
                              >
                                <TextInput
                                  disabled={ai.busy}
                                  size="xs"
                                  className="ai-feature-option"
                                  styles={compactFieldStyles}
                                  label={I18n.get("Instructions")}
                                  description={
                                    optionsDisplay !== "horizontal"
                                      ? I18n.get(
                                          "Additional instructions to guide the AI.",
                                        )
                                      : undefined
                                  }
                                  value={instructions || ""}
                                  onChange={(
                                    e: React.ChangeEvent<HTMLInputElement>,
                                  ) => setInstructions(e.target.value)}
                                />
                              </Tooltip>
                            )}
                          {/* INPUT LANGUAGE */}
                          {mode === "translate" && (
                            <Tooltip
                              label={I18n.get(
                                "The language of the input text.",
                              )}
                              disabled={optionsDisplay !== "horizontal"}
                              position="top"
                            >
                              <Select
                                disabled={ai.busy}
                                size="xs"
                                styles={compactFieldStyles}
                                className="ai-feature-option"
                                label={I18n.get("Input language")}
                                description={
                                  optionsDisplay !== "horizontal"
                                    ? I18n.get(
                                        "The language of the input text.",
                                      )
                                    : undefined
                                }
                                data={[
                                  {
                                    value: "auto",
                                    label: I18n.get("Auto-detect"),
                                  },
                                  ...LANGUAGE_OPTIONS.map((lo) => ({
                                    value: lo.value,
                                    label: I18n.get(lo.label),
                                  })).sort((a, b) =>
                                    a.label.localeCompare(b.label),
                                  ),
                                ]}
                                value={inputLanguage || "auto"}
                                onChange={(value) =>
                                  setInputLanguage(value as AiKitLanguageCode)
                                }
                              />
                            </Tooltip>
                          )}
                          {/* OUTPUT LANGUAGE */}
                          {allowOverride?.outputLanguage && (
                            <Tooltip
                              label={I18n.get(
                                "The language AI-Kit should use for generated text by default (when applicable).",
                              )}
                              disabled={optionsDisplay !== "horizontal"}
                              position="top"
                            >
                              <Select
                                disabled={ai.busy}
                                size="xs"
                                styles={compactFieldStyles}
                                className="ai-feature-option"
                                label={I18n.get("Output language")}
                                description={
                                  optionsDisplay !== "horizontal"
                                    ? I18n.get(
                                        "The language AI-Kit should use for generated text by default (when applicable).",
                                      )
                                    : undefined
                                }
                                data={[
                                  ...([
                                    mode === "rewrite"
                                      ? {
                                          value: "auto",
                                          label: I18n.get("Auto-detect"),
                                        }
                                      : undefined,
                                  ].filter(Boolean) as {
                                    value: string;
                                    label: string;
                                  }[]),
                                  ...LANGUAGE_OPTIONS.map((lo) => ({
                                    value: lo.value,
                                    label: I18n.get(lo.label),
                                  })).sort((a, b) =>
                                    a.label.localeCompare(b.label),
                                  ),
                                ]}
                                value={
                                  outputLanguage ||
                                  getAiKitPlugin().settings
                                    .defaultOutputLanguage ||
                                  (mode === "rewrite" ? "auto" : "")
                                }
                                onChange={(value) =>
                                  setOutputLanguage(value as AiKitLanguageCode)
                                }
                              />
                            </Tooltip>
                          )}
                          {/* TYPE */}
                          {mode === "summarize" && allowOverride?.type && (
                            <Tooltip
                              label={I18n.get("The summary style to generate.")}
                              disabled={optionsDisplay !== "horizontal"}
                              position="top"
                            >
                              <Select
                                disabled={ai.busy}
                                size="xs"
                                className="ai-feature-option"
                                styles={compactFieldStyles}
                                label={I18n.get("Type")}
                                description={
                                  optionsDisplay !== "horizontal"
                                    ? I18n.get("The summary style to generate.")
                                    : undefined
                                }
                                data={[
                                  {
                                    value: "headline",
                                    label: I18n.get("Headline"),
                                  },
                                  {
                                    value: "key-points",
                                    label: I18n.get("Key Points"),
                                  },
                                  {
                                    value: "teaser",
                                    label: I18n.get("Teaser"),
                                  },
                                  {
                                    value: "tldr",
                                    label: I18n.get("TL;DR"),
                                  },
                                ]}
                                value={type || "key-points"}
                                onChange={(value) =>
                                  setType(value as SummarizerType)
                                }
                              />
                            </Tooltip>
                          )}
                          {/* TONE */}
                          {(mode === "write" || mode === "rewrite") &&
                            allowOverride?.tone && (
                              <Tooltip
                                label={I18n.get(
                                  "The tone or style for the AI to use.",
                                )}
                                disabled={optionsDisplay !== "horizontal"}
                                position="top"
                              >
                                <Select
                                  disabled={ai.busy}
                                  size="xs"
                                  className="ai-feature-option"
                                  styles={compactFieldStyles}
                                  label={I18n.get("Tone")}
                                  description={
                                    optionsDisplay !== "horizontal"
                                      ? I18n.get(
                                          "The tone or style for the AI to use.",
                                        )
                                      : undefined
                                  }
                                  data={
                                    mode === "write"
                                      ? [
                                          {
                                            value: "neutral",
                                            label: I18n.get("Neutral"),
                                          },
                                          {
                                            value: "formal",
                                            label: I18n.get("Formal"),
                                          },
                                          {
                                            value: "casual",
                                            label: I18n.get("Casual"),
                                          },
                                        ]
                                      : [
                                          {
                                            value: "as-is",
                                            label: I18n.get("As-Is"),
                                          },
                                          {
                                            value: "more-formal",
                                            label: I18n.get("More formal"),
                                          },
                                          {
                                            value: "more-casual",
                                            label: I18n.get("More casual"),
                                          },
                                        ]
                                  }
                                  value={
                                    tone ||
                                    (mode === "write" ? "neutral" : "as-is")
                                  }
                                  onChange={(value) =>
                                    setTone(value as WriterTone | RewriterTone)
                                  }
                                />
                              </Tooltip>
                            )}
                          {/* LENGTH */}
                          {(mode === "write" ||
                            mode === "rewrite" ||
                            mode === "summarize") &&
                            allowOverride?.length && (
                              <Tooltip
                                label={I18n.get("The target output length.")}
                                disabled={optionsDisplay !== "horizontal"}
                                position="top"
                              >
                                <Select
                                  disabled={ai.busy}
                                  size="xs"
                                  className="ai-feature-option"
                                  styles={compactFieldStyles}
                                  label={I18n.get("Length")}
                                  description={
                                    optionsDisplay !== "horizontal"
                                      ? I18n.get("The target output length.")
                                      : undefined
                                  }
                                  data={
                                    mode === "write" || mode === "summarize"
                                      ? [
                                          {
                                            value: "short",
                                            label: I18n.get("Short"),
                                          },
                                          {
                                            value: "medium",
                                            label: I18n.get("Medium"),
                                          },
                                          {
                                            value: "long",
                                            label: I18n.get("Long"),
                                          },
                                        ]
                                      : [
                                          {
                                            value: "as-is",
                                            label: I18n.get("As-Is"),
                                          },
                                          {
                                            value: "shorter",
                                            label: I18n.get("Shorter"),
                                          },
                                          {
                                            value: "longer",
                                            label: I18n.get("Longer"),
                                          },
                                        ]
                                  }
                                  value={
                                    length ||
                                    (mode === "rewrite" ? "as-is" : "short")
                                  }
                                  onChange={(value) =>
                                    setLength(
                                      value as
                                        | WriterLength
                                        | RewriterLength
                                        | SummarizerLength,
                                    )
                                  }
                                />
                              </Tooltip>
                            )}
                          {/* OUTPUT FORMAT */}
                          {mode === "summarize" ||
                            mode === "write" ||
                            (mode === "rewrite" &&
                              allowOverride?.outputFormat && (
                                <Tooltip
                                  label={I18n.get(
                                    "The format for the generated output.",
                                  )}
                                  disabled={optionsDisplay !== "horizontal"}
                                  position="top"
                                >
                                  <Select
                                    disabled={ai.busy}
                                    size="xs"
                                    className="ai-feature-option"
                                    styles={compactFieldStyles}
                                    label={I18n.get("Output format")}
                                    description={
                                      optionsDisplay !== "horizontal"
                                        ? I18n.get(
                                            "The format for the generated output.",
                                          )
                                        : undefined
                                    }
                                    data={[
                                      {
                                        value: "plain-text",
                                        label: I18n.get("Plain Text"),
                                      },
                                      {
                                        value: "markdown",
                                        label: I18n.get("Markdown"),
                                      },
                                      {
                                        value: "html",
                                        label: I18n.get("HTML"),
                                      },
                                    ]}
                                    value={outputFormat || "markdown"}
                                    onChange={(value) =>
                                      setOutputFormat(
                                        value as
                                          | "plain-text"
                                          | "markdown"
                                          | "html",
                                      )
                                    }
                                  />
                                </Tooltip>
                              ))}
                        </OptionsComponent>
                      </CollapseComponent>
                    </Paper>
                  )}

                  {/* AI STATUS */}
                  {ai.busy && statusText && (
                    <AiFeatureBorder
                      enabled={variation === "modal"}
                      working={ai.busy}
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
                        <Input.Label className="ai-feature-status-text">
                          {statusText ?? "VALAMILYEN SZÖVEG"}
                        </Input.Label>
                      </Group>
                    </AiFeatureBorder>
                  )}

                  {/* GENERATED OUTPUT */}
                  {generated && (
                    <Stack mt="md">
                      {mode === "proofread" &&
                        ((generated as ProofreadResult).corrections.length ===
                        0 ? (
                          <Alert color="green">
                            {I18n.get(
                              "No issues found. Your text looks great!",
                            )}
                          </Alert>
                        ) : (
                          <>
                            <p style={{ marginTop: 0, opacity: 0.85 }}>
                              {I18n.get(
                                "Hover highlights to see explanations.",
                              )}
                            </p>
                            <ProofreadDiff
                              original={text!}
                              corrections={
                                (generated as ProofreadResult).corrections
                              }
                            />
                            {(generated as ProofreadResult).correctedInput ? (
                              <>
                                <h4
                                  style={{
                                    marginTop: 16,
                                    marginBottom: 8,
                                  }}
                                >
                                  {I18n.get("Corrected")}
                                </h4>
                                <Group
                                  c="pre"
                                  className="ai-feature-generated-content"
                                >
                                  {
                                    (generated as ProofreadResult)
                                      .correctedInput
                                  }
                                </Group>
                              </>
                            ) : null}
                          </>
                        ))}
                      {mode === "generateImageMetadata" && (
                        <>
                          <TextInput
                            readOnly={!editable}
                            label={I18n.get("Alt Text")}
                            description={I18n.get(
                              "The alt text for the image.",
                            )}
                            value={
                              (generated as GeneratedImageMetadata).alt_text ||
                              ""
                            }
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                              setGenerated({
                                ...(generated as GeneratedImageMetadata),
                                alt_text: e.target.value,
                              } as never)
                            }
                          />
                          <TextInput
                            readOnly={!editable}
                            label={I18n.get("Title")}
                            description={I18n.get("The title for the image.")}
                            value={
                              (generated as GeneratedImageMetadata).title || ""
                            }
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                              setGenerated({
                                ...(generated as GeneratedImageMetadata),
                                title: e.target.value,
                              } as never)
                            }
                          />
                          <TextInput
                            readOnly={!editable}
                            label={I18n.get("Caption")}
                            description={I18n.get("The caption for the image.")}
                            value={
                              (generated as GeneratedImageMetadata).caption ||
                              ""
                            }
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                              setGenerated({
                                ...(generated as GeneratedImageMetadata),
                                caption: e.target.value,
                              } as never)
                            }
                          />
                          <TextInput
                            readOnly={!editable}
                            label={I18n.get("Description")}
                            description={I18n.get(
                              "The description for the image.",
                            )}
                            value={
                              (generated as GeneratedImageMetadata)
                                .description || ""
                            }
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                              setGenerated({
                                ...(generated as GeneratedImageMetadata),
                                description: e.target.value,
                              } as never)
                            }
                          />
                        </>
                      )}
                      {mode === "generatePostMetadata" && (
                        <>
                          <TextInput
                            readOnly={!editable}
                            label={I18n.get("Title")}
                            description={I18n.get("The title for the post.")}
                            value={
                              (generated as GeneratedPostMetadata).title || ""
                            }
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                              setGenerated({
                                ...(generated as GeneratedPostMetadata),
                                title: e.target.value,
                              } as never)
                            }
                          />
                          <TextInput
                            readOnly={!editable}
                            label={I18n.get("Excerpt")}
                            description={I18n.get("The excerpt for the post.")}
                            value={
                              (generated as GeneratedPostMetadata).excerpt || ""
                            }
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                              setGenerated({
                                ...(generated as GeneratedPostMetadata),
                                excerpt: e.target.value,
                              } as never)
                            }
                          />
                        </>
                      )}
                      {mode !== "proofread" &&
                        mode !== "generateImageMetadata" &&
                        mode !== "generatePostMetadata" &&
                        typeof generated === "string" && (
                          <MarkdownResult
                            value={generated}
                            editable={!!editable}
                            onChange={(v) => {
                              setGenerated(v as never);
                            }}
                          />
                        )}
                    </Stack>
                  )}
                  {generated === "" && (
                    <MarkdownResult value={generated} editable={false} />
                  )}
                </Stack>
                {/* ACTIONS */}
                <Group className="ai-kit-actions" gap="sm" mb="sm" p="sm">
                  {ai.busy && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cancel}
                      data-ai-kit-cancel-button
                    >
                      {I18n.get("Cancel")}
                    </Button>
                  )}

                  {!ai.busy && (
                    <Button
                      variant="filled"
                      size="sm"
                      disabled={!canGenerate}
                      onClick={() => runGenerate()}
                      data-ai-kit-generate-button
                    >
                      {getGenerateTitle()}
                    </Button>
                  )}

                  {!ai.busy &&
                    ai.lastSource === "on-device" &&
                    backendConfigured &&
                    showRegenerateOnBackendButton && (
                      <Button
                        variant="filled"
                        size="sm"
                        disabled={!canGenerate}
                        onClick={runGenerateOnBackend}
                        data-ai-kit-regenerate-on-backend-button
                      >
                        {getRegenerateOnBackendTitle()}
                      </Button>
                    )}

                  {!ai.busy && onAccept && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        !generated ||
                        (mode === "proofread" &&
                          (generated as ProofreadResult).corrections.length ===
                            0)
                      }
                      onClick={async () => {
                        onAccept(
                          outputFormat === "html"
                            ? await markdownToHtml(generated!)
                            : generated!,
                        );
                        close();
                      }}
                      data-ai-kit-accept-button
                    >
                      {I18n.get(acceptButtonTitle!)}
                    </Button>
                  )}

                  <Button
                    variant="default"
                    size="sm"
                    onClick={close}
                    data-ai-kit-close-button
                  >
                    {I18n.get("Close")}
                  </Button>
                </Group>
              </AiFeatureBorder>
            </BodyComponent>
          </ContentComponent>
        </RootComponent>
      )}
    </>
  );
};

function MarkdownResult(props: {
  value: string;
  editable: boolean;
  onChange?: (v: string) => void;
}) {
  const { value, editable, onChange } = props;

  if (editable) {
    return (
      <Stack p={0} gap="sm">
        <Input.Label>{I18n.get("Generated content")}</Input.Label>
        <Textarea
          value={value}
          onChange={(e) => onChange?.(e.currentTarget.value)}
          autosize
          minRows={2}
          maxRows={12}
          p={0}
          className="ai-feature-generated-content ai-feature-editor"
        />

        <Input.Label>{I18n.get("Preview")}</Input.Label>
        <Stack className="ai-feature-generated-content ai-feature-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack className="ai-feature-generated-content">
      {value ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
      ) : (
        <Alert color="yellow">{I18n.get("No content generated.")}</Alert>
      )}
    </Stack>
  );
}

export const AiFeature = withAiKitShell(AiFeatureBase);
