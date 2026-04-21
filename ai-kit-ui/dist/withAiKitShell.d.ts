import { AiWorkerProps } from "@smart-cloud/ai-kit-core";
import { type ComponentType } from "react";
export type AiKitShellInjectedProps = {
    language?: string;
    rootElement: HTMLElement;
};
export declare function withAiKitShell<P extends object>(RootComponent: ComponentType<P & AiKitShellInjectedProps>, propOverrides?: Partial<AiWorkerProps>): import("react").FC<P & Partial<AiWorkerProps>>;
