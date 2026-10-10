import { Accordion, Alert, Button, Card, Checkbox, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import type { ConnectionPreview, ConnectionPreviewRequest, ConnectionServer, ConnectionSetupCatalog, ProductPreview, ProductPreviewRequest } from "./connection-types";
import ProductPageLinks from "./ProductPageLinks";
import { productPageConnectionKey } from "./product-page-links";

function endpointIdentity(endpoint: string): string {
  try { return new URL(endpoint).href; } catch { return endpoint.trim(); }
}

/** Discovery is read-only. Approval adds a local draft; the parent owns Save/Finish. */
export default function ConnectionSetup({ catalog, existing, previewConnection, onAdd, onRemove, disabled = false, openHelp, onChange, restUrl, nonce, previewProducts, openProductPageHelp }: {
  catalog?: ConnectionSetupCatalog; existing: ConnectionServer[]; disabled?: boolean;
  previewConnection: (request: ConnectionPreviewRequest) => Promise<ConnectionPreview>;
  onAdd: (server: ConnectionServer) => void; onRemove?: (id: string) => void; openHelp?: () => void;
  onChange?: (server: ConnectionServer) => void; restUrl?: string; nonce?: string; openProductPageHelp?: () => void;
  previewProducts?: (request: ProductPreviewRequest) => Promise<ProductPreview>;
}) {
  const [connectorId, setConnectorId] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [visitorLanguage, setVisitorLanguage] = useState(true);
  const [preview, setPreview] = useState<ConnectionPreview | null>(null);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const reviewedPreview = useRef<ConnectionPreview | null>(null);
  useEffect(() => () => { generation.current += 1; }, []);
  const definition = catalog?.connectors.find((item) => item.id === connectorId);
  const duplicate = preview && existing.find((server) => endpointIdentity(server.endpoint) === endpointIdentity(preview.server.endpoint));
  const invalidate = () => { generation.current += 1; reviewedPreview.current = null; setPreview(null); setApproved(false); setError(""); };
  const edit = (id: string, value: string) => { invalidate(); setConfig((current) => ({ ...current, [id]: value })); };
  const check = async () => {
    if (!definition) return;
    invalidate(); const currentGeneration = generation.current; setBusy(true);
    try {
      const result = await previewConnection({ operation: "previewConnection", connectorId: definition.id, config: Object.fromEntries(Object.entries(config).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()])), useVisitorLanguage: visitorLanguage });
      if (generation.current === currentGeneration) { reviewedPreview.current = result; setPreview(result); }
    } catch (failure) {
      if (generation.current === currentGeneration) setError(failure instanceof Error ? failure.message : "Connection check failed. No settings were saved.");
    } finally { if (generation.current === currentGeneration) setBusy(false); }
  };
  return <Card withBorder padding="md"><Stack gap="sm">
    <Group justify="space-between"><Text fw={600}>Connect live information</Text>{openHelp && <Button size="compact-xs" variant="subtle" onClick={openHelp}>Connection setup help</Button>}</Group>
    <Text size="sm">Optional: let the assistant read current information from a connected service, such as your product catalog. WordPress content remains a separate knowledge source.</Text>
    {!catalog ? <Alert color="blue">Guided connections require a backend that supports connection discovery. Existing connections are kept. The detailed Tools settings remain available for reviewed custom configurations.</Alert> : <>
      <Select label="Optional service" placeholder="Choose a connection" clearable value={connectorId} disabled={disabled || busy}
        data={catalog.connectors.map((item) => ({ value: item.id, label: item.label }))} comboboxProps={{ withinPortal: true, zIndex: 100002 }}
        onChange={(value) => { invalidate(); setConnectorId(value); setConfig(catalog.agentProfileUrl ? { agentProfileUrl: catalog.agentProfileUrl } : {}); }} />
      {definition && <>
        <Text size="sm">{definition.description}</Text>
        {definition.fields.filter((field) => !field.advanced).map((field) => <TextInput key={field.id} label={field.label} description={field.description} placeholder={field.placeholder} required={field.required} maxLength={field.maxLength} value={config[field.id] ?? ""} disabled={disabled || busy} onChange={(event) => edit(field.id, event.currentTarget.value)} />)}
        <Checkbox label="Use the visitor's language when the service supports it" checked={visitorLanguage} disabled={disabled || busy} onChange={(event) => { invalidate(); setVisitorLanguage(event.currentTarget.checked); }} />
        <Accordion variant="contained"><Accordion.Item value="advanced"><Accordion.Control>Connection details</Accordion.Control><Accordion.Panel><Stack>
          {catalog?.agentProfileUrl && <Text size="sm">The public agent profile is filled from your configured AI Kit backend. Change it only if you host a compatible profile yourself.</Text>}
          {definition.fields.filter((field) => field.advanced).map((field) => <TextInput key={field.id} label={field.label} description={field.description} required={field.required} maxLength={field.maxLength} value={config[field.id] ?? ""} disabled={disabled || busy} onChange={(event) => edit(field.id, event.currentTarget.value)} />)}
        </Stack></Accordion.Panel></Accordion.Item></Accordion>
        <Button variant="light" loading={busy} disabled={disabled || existing.length >= 4 || definition.fields.some((field) => field.required && !config[field.id]?.trim())} onClick={() => void check()}>Check connection and available reads</Button>
        <Text size="sm" c="dimmed">This checks the service identity and available operations. It does not ask the assistant, modify the store, or save a connection.</Text>
      </>}
    </>}
    {error && <Alert color="red" role="alert">{error}</Alert>}
    {preview && <Card withBorder padding="sm"><Stack gap="xs">
      <Text fw={600}>Review this connection</Text><Text size="sm">Service: {preview.server.serverName}</Text><Text size="sm">Endpoint: {preview.server.endpoint}</Text>
      {preview.server.tools.map((tool) => <Text key={tool.name} size="sm">• {preview.operationLabels[tool.name] || tool.name}</Text>)}
      <Checkbox label="I approve these read-only operations for this assistant" checked={approved} disabled={disabled} onChange={(event) => setApproved(event.currentTarget.checked)} />
      <Text size="sm">Only these reviewed operations are added. Cart and checkout changes are not enabled.</Text>
      {duplicate && <Alert color="blue">This service endpoint is already connected as {duplicate.id}. Edit the existing connection in the detailed Tools settings, or remove it from this draft before adding a replacement.</Alert>}
      <Button disabled={disabled || !approved || existing.length >= 4 || Boolean(duplicate)} onClick={() => {
        if (disabled || !approved || existing.length >= 4 || reviewedPreview.current !== preview || existing.some((server) => endpointIdentity(server.endpoint) === endpointIdentity(preview.server.endpoint))) return;
        reviewedPreview.current = null;
        let id = preview.server.id.slice(0, 40); let suffix = 2;
        while (existing.some((server) => server.id === id)) {
          const ending = `-${suffix++}`;
          id = `${preview.server.id.slice(0, 40 - ending.length)}${ending}`;
        }
        onAdd({ ...preview.server, id, enabled: true, tools: preview.server.tools.map((tool) => ({ ...tool, readOnlyConfirmed: true })) });
        invalidate(); setConnectorId(null); setConfig({});
      }}>Add reviewed connection to draft</Button>
    </Stack></Card>}
    {existing.length > 0 && <Stack gap="xs">
      <Text size="sm">Configured or staged connections. Changes are saved only with Finish setup or Save profile.</Text>
      {existing.map((server) => <Stack key={server.id} gap="xs"><Group justify="space-between"><Text size="sm" style={{ overflowWrap: "anywhere" }}>{server.id} ({server.enabled ? "enabled" : "disabled"})</Text>{onRemove && <Button size="compact-xs" color="red" variant="subtle" disabled={disabled || busy} onClick={() => onRemove(server.id)}>Remove from draft</Button>}</Group>
        {onChange && previewProducts && <ProductPageLinks key={`${productPageConnectionKey(server)}:${disabled || busy}:${catalog?.productPageLinksSupported === true}`} server={server} supported={catalog?.productPageLinksSupported === true} restUrl={restUrl} nonce={nonce} disabled={disabled || busy} previewProducts={previewProducts} onChange={onChange} openHelp={openProductPageHelp} />}
      </Stack>)}
    </Stack>}
  </Stack></Card>;
}
