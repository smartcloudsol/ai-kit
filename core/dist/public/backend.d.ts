import { BackendCallOptions, BuiltInAiFeature, CapabilityDecision, ContextKind } from "../types";
export declare function dispatchFeatureBackend<TResponse>(_decision: CapabilityDecision, _context: ContextKind, _feature: BuiltInAiFeature, _requestBody: unknown, _options: BackendCallOptions): Promise<TResponse>;
export declare function dispatchCustomBackend<TResponse>(_decision: CapabilityDecision, _context: ContextKind, _customPath: string, _method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", _requestBody: unknown, _options: BackendCallOptions): Promise<TResponse>;
