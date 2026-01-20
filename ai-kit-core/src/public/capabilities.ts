/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  AiModePreference,
  AnyCreateCoreOptions,
  BuiltInAiFeature,
  CapabilityDecision,
} from "../types";

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
