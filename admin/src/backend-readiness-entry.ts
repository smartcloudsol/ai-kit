import { registerBackendCheck } from "./backend-readiness";
import { getGateyPlugin } from "@smart-cloud/gatey-core";
import { getStore, getStoreSelect } from "@smart-cloud/ai-kit-core";
import { createBackendDetails } from "./backend-details";

const runtime = window as typeof window & {
  smartcloudWpSuiteBackendDetails?: Record<string, ReturnType<typeof createBackendDetails>>;
};
runtime.smartcloudWpSuiteBackendDetails ??= {};
runtime.smartcloudWpSuiteBackendDetails.answers = createBackendDetails({
  config: async () => getStoreSelect(await getStore()).getConfig(),
  gateyEndpoint: async apiName => {
    await getGateyPlugin()?.cognito.store;
    return getGateyPlugin()?.cognito.getAmplifyConfig().API?.REST?.[apiName]?.endpoint;
  },
});

registerBackendCheck({
  config: async () => getStoreSelect(await getStore()).getConfig(),
  gatey: () => getGateyPlugin()?.cognito,
  gateyApiConfigured: async (apiName) => {
    await getGateyPlugin()?.cognito.store;
    return Boolean(getGateyPlugin()?.cognito.getAmplifyConfig().API?.REST?.[apiName]?.endpoint);
  },
  sessionAvailable: async () => {
    // Gatey main uses the shared vendor singleton; an admin bundle's private
    // Amplify instance has no Cognito configuration or authenticated session.
    const runtime = window as typeof window & {
      WpSuiteAmplify?: { fetchAuthSession?: () => Promise<{ tokens?: { accessToken?: unknown; idToken?: unknown } }> };
    };
    const session = await runtime.WpSuiteAmplify?.fetchAuthSession?.();
    return Boolean(session?.tokens?.accessToken && session.tokens?.idToken);
  },
  fetch: (...args) => fetch(...args),
});
