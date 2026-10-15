import type { ConfirmedVisitorAction } from "@smart-cloud/ai-kit-core";
export declare function VisitorActions({ proposals: input, result: inputResult, busy, consumedHandles, retryDisabled, onConfirm }: {
    proposals?: unknown;
    result?: unknown;
    busy?: boolean;
    consumedHandles?: readonly string[];
    retryDisabled?: boolean;
    onConfirm: (action: ConfirmedVisitorAction, label: string) => void;
}): import("react").JSX.Element;
