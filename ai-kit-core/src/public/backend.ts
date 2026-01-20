/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BackendCallOptions,
  BuiltInAiFeature,
  CapabilityDecision,
  ContextKind,
} from "../types";

export async function dispatchBackend<TResponse>(
  _decision: CapabilityDecision,
  _context: ContextKind,
  _feature: BuiltInAiFeature,
  _requestBody: unknown,
  _options: BackendCallOptions
): Promise<TResponse> {
  return Promise.resolve<TResponse>({} as TResponse);
}
