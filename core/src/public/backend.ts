/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BackendCallOptions,
  BuiltInAiFeature,
  CapabilityDecision,
  ContextKind,
} from "../types";

export async function dispatchFeatureBackend<TResponse>(
  _decision: CapabilityDecision,
  _context: ContextKind,
  _feature: BuiltInAiFeature,
  _requestBody: unknown,
  _options: BackendCallOptions,
): Promise<TResponse> {
  return Promise.resolve<TResponse>({} as TResponse);
}

export async function dispatchCustomBackend<TResponse>(
  _decision: CapabilityDecision,
  _context: ContextKind,
  _customPath: string,
  _method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  _requestBody: unknown,
  _options: BackendCallOptions,
): Promise<TResponse> {
  return Promise.resolve<TResponse>({} as TResponse);
}
