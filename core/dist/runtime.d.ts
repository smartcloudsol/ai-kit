import { WpSuitePluginBase } from "@smart-cloud/wpsuite-core";
import { AiKit } from "./index";
export type AiKitReadyEvent = "wpsuite:ai-kit:ready";
export type AiKitErrorEvent = "wpsuite:ai-kit:error";
export type AiKitPlugin = WpSuitePluginBase & AiKit;
export declare function getAiKitPlugin(): AiKitPlugin;
export declare function waitForAiKitReady(timeoutMs?: number): Promise<void>;
export declare function getStore(timeoutMs?: number): Promise<import("./store").Store>;
