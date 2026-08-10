import { AiWorkerProps } from "@smart-cloud/ai-kit-core";
import { type ComponentType } from "react";
export type AiKitShellInjectedProps = {
    language?: string;
    rootElement: HTMLElement;
    /** Global portal target for an opened modal; its trigger stays local. */
    modalRootElement?: HTMLElement;
};
type AiKitShellOptions = Partial<AiWorkerProps> & {
    /** Used only by intentionally floating components such as the chatbot. */
    overlayWholeComponent?: boolean;
};
export declare function withAiKitShell<P extends object>(RootComponent: ComponentType<P & AiKitShellInjectedProps>, propOverrides?: AiKitShellOptions): import("react").FC<P & Partial<AiWorkerProps>>;
export {};
