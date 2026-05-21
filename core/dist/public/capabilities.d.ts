import { AiKitLanguageCode, AiModePreference, AnyCreateCoreOptions, BackendTransport, BuiltInAiFeature, CapabilityDecision } from "../types";
export declare const isOnDeviceLanguageSupported: (_outputLanguage: AiKitLanguageCode) => boolean;
export declare const checkOnDeviceAvailability: (_feature: BuiltInAiFeature, _availabilityOptions?: never) => Promise<{
    available: boolean;
    status: string;
}>;
export declare const decideCapability: (_feature: BuiltInAiFeature, _availabilityOptions?: AnyCreateCoreOptions, _modeOverride?: AiModePreference) => Promise<CapabilityDecision>;
export declare function resolveBackend(): Promise<{
    available: boolean;
    transport?: BackendTransport;
    apiName?: string;
    baseUrl?: string;
    reason?: string;
}>;
