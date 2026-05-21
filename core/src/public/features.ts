/* eslint-disable @typescript-eslint/no-unused-vars */
import type {
  FeatureOptions,
  DetectLanguageArgs,
  DetectLanguageOutput,
  PromptArgs,
  PromptResult,
  ProofreadArgs,
  ProofreadOutput,
  RewriteArgs,
  RewriteResult,
  SummarizeArgs,
  SummarizeResult,
  TranslateArgs,
  TranslateResult,
  WriteArgs,
  WriteResult,
  Features,
  ChatMessageArgs,
  FeedbackMessageArgs,
  SearchMessageArgs,
  SearchResult,
} from "../types";

export const getWriteOptions: (
  args: Partial<WriteArgs>,
) => Promise<WriterCreateCoreOptions> = (
  args: Partial<WriteArgs>,
): Promise<WriterCreateCoreOptions> => Promise.resolve(args);
export const write: Features["write"] = async (
  _args: WriteArgs,
  _options?: FeatureOptions,
) => Promise.resolve<WriteResult>({ result: "" });

export const getRewriteOptions: (
  args: Partial<RewriteArgs>,
) => Promise<RewriterCreateCoreOptions> = (
  args: Partial<RewriteArgs>,
): Promise<RewriterCreateCoreOptions> => Promise.resolve(args);
export const rewrite: Features["rewrite"] = async (
  args: RewriteArgs,
  _options?: FeatureOptions,
) => Promise.resolve<RewriteResult>({ result: args.text });

export const getProofreadOptions: () => Promise<ProofreaderCreateCoreOptions> =
  (): Promise<ProofreaderCreateCoreOptions> => Promise.resolve({});
export const proofread: Features["proofread"] = async (
  args: ProofreadArgs,
  _options?: FeatureOptions,
) =>
  Promise.resolve<ProofreadOutput>({
    result: {
      correctedInput: args.text,
      corrections: [],
    },
  });

export const getSummarizeOptions: (
  args: Partial<SummarizeArgs>,
) => Promise<SummarizerCreateCoreOptions> = (
  args: Partial<SummarizeArgs>,
): Promise<SummarizerCreateCoreOptions> => Promise.resolve(args);
export const summarize: Features["summarize"] = async (
  args: SummarizeArgs,
  _options?: FeatureOptions,
) => Promise.resolve<SummarizeResult>({ result: args.text.slice(0, 100) });

export const getTranslateOptions: (
  args: Partial<TranslateArgs>,
) => Promise<TranslatorCreateCoreOptions> = (
  args: Partial<TranslateArgs>,
): Promise<TranslatorCreateCoreOptions> =>
  Promise.resolve({
    ...args,
    sourceLanguage: args.sourceLanguage ?? "auto",
    targetLanguage: args.targetLanguage!,
  });
export const translate: Features["translate"] = async (
  args: TranslateArgs,
  _options?: FeatureOptions,
) =>
  Promise.resolve<TranslateResult>({
    result: args.text,
  });

export const detectLanguage: Features["detectLanguage"] = async (
  _args: DetectLanguageArgs,
  _options?: FeatureOptions,
) =>
  Promise.resolve<DetectLanguageOutput>({
    result: {
      candidates: [],
    },
  });

export const getPromptOptions: (
  args: Partial<PromptArgs>,
) => Promise<LanguageModelCreateCoreOptions> = (
  args: Partial<PromptArgs>,
): Promise<LanguageModelCreateCoreOptions> => Promise.resolve(args);
export const prompt: Features["prompt"] = async (
  _args: PromptArgs,
  _options?: FeatureOptions,
) => Promise.resolve<PromptResult>({ result: "" });
export const sendChatMessage: Features["sendChatMessage"] = async (
  _args: ChatMessageArgs,
  _options?: FeatureOptions,
) => Promise.resolve<PromptResult>({ result: "" });
export const sendFeedbackMessage: Features["sendFeedbackMessage"] = async (
  _args: FeedbackMessageArgs,
  _options?: FeatureOptions,
) => Promise.resolve<PromptResult>({ result: "" });
export const sendSearchMessage: Features["sendSearchMessage"] = async (
  _args: SearchMessageArgs,
  _options?: FeatureOptions,
) => Promise.resolve<SearchResult>({ result: "" });
