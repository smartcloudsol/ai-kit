/** Transport-free admin DTOs; connector definitions come from the selected backend. */
export interface ConnectionServer {
  id: string; enabled: boolean; purpose: string; endpoint: string; serverName: string;
  tools: Array<{ name: string; description: string; policyClass: "read" | "action"; readOnlyConfirmed?: boolean; inputSchema: Record<string, unknown>; remoteInputSchema?: Record<string, unknown>; responseFields?: string[] }>;
  protocolAdapter?: { id: string; config: Record<string, unknown> };
  providerPreset?: { id: string; config: Record<string, unknown> };
  localeBinding?: { argumentPointer: string };
  productPageLinks?: ProductPageLinks;
}
export interface ProductPageLinks {
  siteUrl: string;
  policy: "source" | "prefer-local" | "local-only";
  mappings: Array<{ productId: string; publicUrl: string; locale?: string; origin: "explicit" | "discovered" }>;
}
export interface ProductPreviewRequest {
  operation: "previewProducts"; server: ConnectionServer; query: string;
}
export interface ProductPreview {
  products: Array<{ id: string; title: string; sourceUrl?: string }>;
}
export interface SetupConnector {
  id: string; label: string; description: string;
  fields: Array<{ id: string; label: string; description: string; required?: boolean; maxLength?: number; advanced?: boolean; placeholder?: string }>;
}
export interface ConnectionSetupCatalog {
  connectors: SetupConnector[];
  agentProfilePath: string;
  agentProfileUrl?: string;
  productPageLinksSupported?: boolean;
}
export interface ConnectionPreviewRequest {
  operation: "previewConnection"; connectorId: string; config: Record<string, string>; useVisitorLanguage: boolean;
}
export interface ConnectionPreview {
  connectorId: string; server: ConnectionServer; operationLabels: Record<string, string>;
}
