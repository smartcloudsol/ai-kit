import type { ChatActivity } from "./chatStream";
export declare function safePublicActivityParams(value: unknown): Record<string, string> | undefined;
export declare function publicToolActivityLabel(activity: ChatActivity, translate: (key: string) => string, settled?: boolean): string | null;
export declare function publicToolActivityDetails(activity: ChatActivity): string | null;
