/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  AiKitLanguageCode,
  AiModePreference,
  AnyCreateCoreOptions,
  BackendTransport,
  BuiltInAiFeature,
  CapabilityDecision,
} from "../types";

export const isOnDeviceLanguageSupported = (
  _outputLanguage: AiKitLanguageCode,
): boolean => {
  return false;
};

export const checkOnDeviceAvailability = async (
  _feature: BuiltInAiFeature,
  _availabilityOptions?: never,
) => Promise.resolve({ available: false, status: "not-implemented" });

export const decideCapability = async (
  _feature: BuiltInAiFeature,
  _availabilityOptions?: AnyCreateCoreOptions,
  _modeOverride?: AiModePreference,
  _context?: import("../types").ContextKind,
) => {
  void _context;
  return Promise.resolve<CapabilityDecision>({
    feature: _feature,
    source: "none",
    mode: "local-only",
    onDeviceAvailable: false,
    backendAvailable: false,
    reason: "not-implemented",
  });
};

export async function resolveBackend(
  _capability?: import("../types").AiKitBackendCapability,
): Promise<{
  available: boolean;
  transport?: BackendTransport;
  apiName?: string;
  baseUrl?: string;
  reason?: string;
}> {
  void _capability;
  return { available: false, reason: "not-implemented" };
}
