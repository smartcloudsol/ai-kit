type Config = { mode?: string; backendTransport?: string; backendBaseUrl?: string; backendApiName?: string };
type Details = { mode?: string; transport?: string; apiName?: string; endpoint?: string };

export function createBackendDetails(dependencies: {
  config: () => Promise<Config | null | undefined>;
  gateyEndpoint: (apiName: string) => Promise<string | undefined>;
}) {
  return async (signal: AbortSignal): Promise<Details> => {
    signal.throwIfAborted();
    const config = await dependencies.config();
    signal.throwIfAborted();
    if (!config) return {};
    const transport = config.backendTransport ?? (config.backendBaseUrl ? "fetch" : config.backendApiName ? "gatey" : undefined);
    let endpoint = transport === "fetch" ? config.backendBaseUrl : undefined;
    if (transport === "gatey" && config.backendApiName) {
      try { endpoint = await dependencies.gateyEndpoint(config.backendApiName); }
      catch { signal.throwIfAborted(); }
    }
    signal.throwIfAborted();
    return { mode: config.mode, transport, apiName: transport === "gatey" ? config.backendApiName : undefined, endpoint };
  };
}
