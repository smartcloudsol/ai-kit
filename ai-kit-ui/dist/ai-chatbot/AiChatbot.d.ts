import { type AiChatbotLabels, type HistoryStorageMode } from "@smart-cloud/ai-kit-core";
import React from "react";
export declare const DEFAULT_CHATBOT_LABELS: Required<AiChatbotLabels>;
export declare const AiChatbot: React.FC<import("@smart-cloud/ai-kit-core").AiWorkerProps & {
    context?: import("@smart-cloud/ai-kit-core").ContextKind;
    placeholder?: string;
    maxImages?: number;
    maxImageBytes?: number;
    previewMode?: boolean;
    historyStorage?: HistoryStorageMode;
    emptyHistoryAfterDays?: number;
    labels?: AiChatbotLabels;
    openButtonIconLayout?: import("@smart-cloud/ai-kit-core").OpenButtonIconLayout;
    openButtonPosition?: import("@smart-cloud/ai-kit-core").OpenButtonPosition;
} & Partial<import("@smart-cloud/ai-kit-core").AiWorkerProps>>;
