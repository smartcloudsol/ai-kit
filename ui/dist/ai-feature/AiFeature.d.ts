import { type AiModePreference } from "@smart-cloud/ai-kit-core";
import { FC } from "react";
export declare const AiFeature: FC<import("@smart-cloud/ai-kit-core").AiWorkerProps & {
    mode: import("@smart-cloud/ai-kit-core").AiFeatureMode;
    context?: import("@smart-cloud/ai-kit-core").ContextKind;
    modeOverride?: AiModePreference;
    autoRun?: boolean;
    onDeviceTimeout?: number;
    editable?: boolean;
    acceptButtonTitle?: string;
    showRegenerateOnBackendButton?: boolean;
    optionsDisplay?: "collapse" | "horizontal" | "vertical";
    default?: import("@smart-cloud/ai-kit-core").AiFeatureOptions & {
        getText?: Promise<string> | (() => Promise<string>);
        image?: Blob;
    };
    allowOverride?: {
        text?: boolean;
        instructions?: boolean;
        tone?: boolean;
        length?: boolean;
        type?: boolean;
        outputLanguage?: boolean;
        outputFormat?: boolean;
    };
    onAccept?: (result: unknown) => void;
    onOptionsChanged?: (options: import("@smart-cloud/ai-kit-core").AiFeatureOptions) => void;
} & Partial<import("@smart-cloud/ai-kit-core").AiWorkerProps>>;
