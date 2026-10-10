import { Alert, Button, Card, Group, Select, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useState } from "react";
import { ANSWERS_PROFILE_PRESETS, buildProfilePresetPreview, PROFILE_PRESET_INPUT_LIMITS, type ProfilePresetInputs, type ProfilePresetPreview, type ProfilePresetValues } from "./profile-presets";

/** Shared, local authoring flow. It neither saves nor changes execution policy. */
export default function ProfilePresetSetup({ context, audience = "", purpose = "", disabled = false, onApply }: {
  context: string; audience?: string; purpose?: string; disabled?: boolean;
  onApply: (values: ProfilePresetValues) => void;
}) {
  const [preset, setPreset] = useState<string | null>(null);
  const [inputs, setInputs] = useState<ProfilePresetInputs>({ siteName: "", sitePurpose: purpose, audience, portfolio: "" });
  const [preview, setPreview] = useState<ProfilePresetPreview | null>(null);
  const [previewContext, setPreviewContext] = useState("");
  const edit = (key: keyof ProfilePresetInputs, value: string) => {
    setInputs((current) => ({ ...current, [key]: value })); setPreview(null);
  };
  return <Card withBorder padding="md"><Stack gap="sm">
    <Text fw={600}>Start with a useful assistant profile</Text>
    <Text size="sm">Choose a starting point and describe your site in your own words. Preview the result before applying it. Existing tools, model, safety and other detailed settings are kept.</Text>
    <Select label="Profile starting point" placeholder="Keep current settings, or choose a preset" clearable
      data={ANSWERS_PROFILE_PRESETS.map((item) => ({ value: item.id, label: item.label }))}
      value={preset} disabled={disabled} comboboxProps={{ withinPortal: true, zIndex: 100002 }}
      onChange={(value) => { setPreset(value); setPreview(null); }} />
    {preset && <>
      <Text size="sm">{ANSWERS_PROFILE_PRESETS.find((item) => item.id === preset)?.description}</Text>
      <TextInput label="Site or business name" required maxLength={PROFILE_PRESET_INPUT_LIMITS.siteName} value={inputs.siteName} disabled={disabled} onChange={(event) => edit("siteName", event.currentTarget.value)} />
      <Textarea label="What should visitors achieve on this site?" description="One or two sentences: what you offer, and what help visitors need." required autosize minRows={2} maxRows={5} maxLength={PROFILE_PRESET_INPUT_LIMITS.sitePurpose} value={inputs.sitePurpose} disabled={disabled} onChange={(event) => edit("sitePurpose", event.currentTarget.value)} />
      <TextInput label="Who is this for?" description="Optional: describe the people you help." maxLength={PROFILE_PRESET_INPUT_LIMITS.audience} value={inputs.audience} disabled={disabled} onChange={(event) => edit("audience", event.currentTarget.value)} />
      <Textarea label="Main topics, services or product categories" description="Optional background. Current prices and availability will come from your connected sources." autosize minRows={2} maxRows={5} maxLength={PROFILE_PRESET_INPUT_LIMITS.portfolio} value={inputs.portfolio} disabled={disabled} onChange={(event) => edit("portfolio", event.currentTarget.value)} />
      <Button variant="light" disabled={disabled} onClick={() => { setPreview(buildProfilePresetPreview(preset, inputs, { context })); setPreviewContext(context); }}>Preview assistant profile</Button>
    </>}
    {preview && !preview.ok && <Alert color="red" role="alert">{Object.values(preview.errors).join(" ")}</Alert>}
    {preview?.ok && <Card withBorder padding="sm"><Stack gap="xs">
      <Text fw={600}>Behavior changes to review</Text>
      <Text size="sm">Role: {preview.values.role}</Text>
      <Text size="sm">Purpose: {preview.values.purpose}</Text>
      {preview.values.audience && <Text size="sm">Audience: {preview.values.audience}</Text>}
      <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>Tasks: {preview.values.task}</Text>
      <Text size="sm">Tone: {preview.values.tone}</Text>
      <Textarea label="Resulting general context" value={preview.values.context} readOnly autosize minRows={3} maxRows={8} />
      <Text size="sm">Applying replaces role, purpose, audience, tasks and tone. Your existing general context is retained outside the setup background section. You can edit every field afterwards; nothing is saved yet.</Text>
      {previewContext !== context && <Alert color="yellow">General context changed. Preview again before applying.</Alert>}
      <Group><Button disabled={disabled || previewContext !== context} onClick={() => { onApply(preview.values); setPreview(null); setPreset(null); }}>Apply reviewed profile</Button></Group>
    </Stack></Card>}
  </Stack></Card>;
}
