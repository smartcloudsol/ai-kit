import type { AiKitBackendCapability, BackendCompatibility, BackendTransport, BuiltInAiFeature, ContextKind } from "./types";
export declare function capabilityForFeature(context: ContextKind, feature: BuiltInAiFeature): AiKitBackendCapability;
export declare function capabilityForCustomPath(context: ContextKind, path: string): AiKitBackendCapability | undefined;
type CompatibilityInput = {
    transport: BackendTransport;
    apiName?: string;
    baseUrl?: string;
};
/** Internal dispatch fence; older caller-created decisions without discovery metadata remain compatible. */
export declare function assertBackendCompatibilityTargetCurrent(compatibility: BackendCompatibility | undefined): void;
export declare function resolveBackendCompatibility(input: CompatibilityInput): Promise<BackendCompatibility>;
export declare function supportsBackendCapability(compatibility: BackendCompatibility, capability: AiKitBackendCapability, minimumVersion?: number): boolean;
export {};
