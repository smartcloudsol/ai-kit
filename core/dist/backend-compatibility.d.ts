import type { AiKitBackendCapability, BackendCompatibility, BackendTransport, BuiltInAiFeature, ContextKind } from "./types";
export declare function capabilityForFeature(context: ContextKind, feature: BuiltInAiFeature): AiKitBackendCapability;
export declare function capabilityForCustomPath(context: ContextKind, path: string): AiKitBackendCapability | undefined;
export declare function resolveBackendCompatibility(input: {
    transport: BackendTransport;
    apiName?: string;
    baseUrl?: string;
}): Promise<BackendCompatibility>;
export declare function supportsBackendCapability(compatibility: BackendCompatibility, capability: AiKitBackendCapability, minimumVersion?: number): boolean;
