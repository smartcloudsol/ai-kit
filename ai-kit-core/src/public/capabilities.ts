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
) =>
  Promise.resolve<CapabilityDecision>({
    feature: _feature,
    source: "none",
    mode: "local-only",
    onDeviceAvailable: false,
    backendAvailable: false,
    reason: "not-implemented",
  });

export async function resolveBackend(): Promise<{
  available: boolean;
  transport?: BackendTransport;
  apiName?: string;
  baseUrl?: string;
  reason?: string;
}> {
  return { available: false, reason: "not-implemented" };
}
