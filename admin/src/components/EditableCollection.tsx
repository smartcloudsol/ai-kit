import { ActionIcon, Alert, Button, Card, Collapse, Group, Modal, Stack, Switch, Text, UnstyledButton } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { TEXT_DOMAIN } from "@smart-cloud/ai-kit-core";
import { __ } from "@wordpress/i18n";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocalConfirmation } from "./LocalConfirmation";
import { applyCollectionDraft, changeCollectionDraft, collectionDraftStale, collectionState, discardCollectionDraft,
  openCollectionDraft, reconcileCollection, removeCollectionRow, updateCollectionRowAndRebaseDraft, type CollectionDraft, type CollectionState } from "./editable-collection-state";

export interface EditableCollectionProps<T> {
  value: T[];
  onChange: (value: T[]) => void;
  title: string;
  addLabel: string;
  createItem: (reserved: T[]) => T;
  itemTitle: (item: T, index: number) => string;
  itemSummary?: (item: T, index: number) => ReactNode;
  renderEditor: (item: T, onChange: (item: T) => void, onNestedEditingChange: (editing: boolean) => void, index: number | null) => ReactNode;
  validate?: (item: T, index: number | null) => string | undefined;
  disabled?: boolean;
  maxItems?: number;
  reorderable?: boolean;
  zIndex?: number;
  onEditingChange?: (editing: boolean) => void;
  mode?: "modal" | "collapse";
  getEnabled?: (item: T) => boolean;
  setEnabled?: (item: T, enabled: boolean) => T;
}

/** Independent private row drafts. Closing a row shares Cancel's discard lifecycle. */
export default function EditableCollection<T>({ value, onChange, title, addLabel, createItem, itemTitle,
  itemSummary, renderEditor, validate, disabled = false, maxItems, reorderable = true,
  zIndex = 100004, onEditingChange, mode = "modal", getEnabled, setEnabled }: EditableCollectionProps<T>) {
  const [state, setState] = useState(() => collectionState(value));
  const current = useRef(state);
  useLayoutEffect(() => { current.current = state; }, [state]);
  const latest = useRef({ onChange, disabled, onEditingChange });
  useLayoutEffect(() => { latest.current = { onChange, disabled, onEditingChange }; }, [onChange, disabled, onEditingChange]);
  const signature = JSON.stringify(value);
  useLayoutEffect(() => {
    const next = reconcileCollection(current.current, value);
    current.current = next; setState(next);
  }, [value, signature]);
  const commit = (next: CollectionState<T>, publish = false) => {
    current.current = next; setState(next);
    if (publish) latest.current.onChange(next.rows.map(row => row.value));
  };
  const { openConfirmModal, confirmation, confirming } = useLocalConfirmation(zIndex + 1);
  const active = Object.keys(state.drafts).length > 0 || confirming;
  useEffect(() => { latest.current.onEditingChange?.(active); }, [active]);
  useEffect(() => () => latest.current.onEditingChange?.(false), []);
  const open = (token: string | null) => {
    if (disabled || confirming) return;
    const pending = Object.values(current.current.drafts).filter(editor => editor.isNew).length;
    if (token === null && maxItems !== undefined && current.current.rows.length + pending >= maxItems) return;
    commit(openCollectionDraft(current.current, token, createItem));
  };
  const close = (token: string) => {
    const editor = current.current.drafts[token];
    if (!editor || confirming || editor.nested) return;
    if (JSON.stringify(editor.draft) === JSON.stringify(editor.original)) { commit(discardCollectionDraft(current.current, token)); return; }
    openConfirmModal({ title: __("Discard changes?", TEXT_DOMAIN),
      children: __("These changes have not been applied. Discard them and close this editor?", TEXT_DOMAIN),
      labels: { confirm: __("Discard changes", TEXT_DOMAIN), cancel: __("Keep editing", TEXT_DOMAIN) },
      onConfirm: () => commit(discardCollectionDraft(current.current, token)) });
  };
  const apply = (token: string) => {
    const state = current.current, editor = state.drafts[token];
    const index = editor?.isNew ? null : state.rows.findIndex(row => row.token === token);
    if (!editor || editor.nested || latest.current.disabled || confirming || collectionDraftStale(state, token) || validate?.(editor.draft, index) ||
      (editor.isNew && maxItems !== undefined && state.rows.length >= maxItems)) return;
    commit(applyCollectionDraft(state, token), true);
  };
  const remove = (token: string) => {
    const row = current.current.rows.find(row => row.token === token);
    if (!row || disabled || confirming || current.current.drafts[token]?.nested) return;
    const baseline = JSON.stringify(row.value);
    openConfirmModal({ title: __("Remove item?", TEXT_DOMAIN), children: <Text size="sm">
      {itemTitle(row.value, current.current.rows.indexOf(row))}. {__("Remove this item from the current draft?", TEXT_DOMAIN)}
    </Text>, labels: { confirm: __("Remove", TEXT_DOMAIN), cancel: __("Cancel", TEXT_DOMAIN) }, onConfirm: () => {
      const latestRow = current.current.rows.find(row => row.token === token);
      if (!latest.current.disabled && latestRow && JSON.stringify(latestRow.value) === baseline) commit(removeCollectionRow(current.current, token), true);
    } });
  };
  const move = (token: string, offset: -1 | 1) => {
    if (disabled || confirming) return;
    const rows = [...current.current.rows], index = rows.findIndex(row => row.token === token);
    if (index < 0 || !rows[index + offset]) return;
    [rows[index], rows[index + offset]] = [rows[index + offset], rows[index]];
    commit({ ...current.current, rows }, true);
  };
  const editorForm = (editor: CollectionDraft<T>) => {
    const token = editor.token, stale = collectionDraftStale(state, token);
    const index = editor.isNew ? null : state.rows.findIndex(row => row.token === token);
    const error = validate?.(editor.draft, index);
    return <Stack mt={mode === "collapse" ? "sm" : 0}>
      <Text size="sm" c="dimmed">{__("Apply adds these changes to the enclosing draft. Save the complete configuration to activate them.", TEXT_DOMAIN)}</Text>
      {stale && <Alert color="yellow">{__("This item changed or was removed outside this editor. Discard this draft and reopen the current item.", TEXT_DOMAIN)}</Alert>}
      <fieldset disabled={disabled || stale || confirming} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        {renderEditor(editor.draft, draft => setState(state => changeCollectionDraft(state, token, { draft })),
          nested => setState(state => state.drafts[token]?.nested === nested ? state : changeCollectionDraft(state, token, { nested })), index)}
      </fieldset>
      {error && <Alert color="red">{error}</Alert>}
      <Group justify="space-between">
        {mode === "collapse" && !editor.isNew && <ActionIcon aria-label={__("Remove item", TEXT_DOMAIN)} variant="subtle" color="red" disabled={disabled || stale || confirming || editor.nested} onClick={() => remove(token)}><IconTrash size={18} /></ActionIcon>}
        <Group justify="flex-end" style={{ marginLeft: "auto" }}>
          <Button variant="default" onClick={() => close(token)} disabled={confirming || editor.nested}>{__("Cancel", TEXT_DOMAIN)}</Button>
          <Button onClick={() => apply(token)} disabled={disabled || stale || confirming || editor.nested || Boolean(error) || (editor.isNew && maxItems !== undefined && state.rows.length >= maxItems)}>{__("Apply to draft", TEXT_DOMAIN)}</Button>
        </Group>
      </Group>
    </Stack>;
  };
  const pending = Object.values(state.drafts).filter(editor => editor.isNew);
  const rows = [...state.rows, ...Object.values(state.drafts).filter(editor => editor.isNew || !state.rows.some(row => row.token === editor.token)).map(editor => ({ token: editor.token, value: editor.draft }))];
  return <Stack gap="xs">
    <Text fw={600}>{title}</Text>
    {rows.length === 0 && <Text size="sm" c="dimmed">{__("No items added yet.", TEXT_DOMAIN)}</Text>}
    {rows.map(({ token, value: item }, index) => {
      const editor = state.drafts[token], savedIndex = state.rows.findIndex(row => row.token === token);
      const expanded = Boolean(editor?.expanded), stale = editor && collectionDraftStale(state, token);
      return <Card key={token} withBorder padding="sm" data-collection-row={token}>
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Stack gap={3} style={{ flex: "1 1 220px", minWidth: 0 }}>
            {mode === "collapse" ? <UnstyledButton aria-expanded={expanded} disabled={disabled || confirming || editor?.nested}
              onClick={() => expanded ? close(token) : open(token)}>
              <Text fw={500} style={{ overflowWrap: "anywhere" }}>{expanded ? "▾ " : "▸ "}{itemTitle(editor?.draft ?? item, index)}</Text>
            </UnstyledButton> : <Text fw={500} style={{ overflowWrap: "anywhere" }}>{itemTitle(item, index)}</Text>}
            {itemSummary && <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>{itemSummary(item, index)}</Text>}
            {editor && <Text size="xs" c={stale ? "orange" : "dimmed"}>{__("Unapplied draft", TEXT_DOMAIN)}</Text>}
          </Stack>
          <Group gap="xs">
            {getEnabled && setEnabled && <Switch size="sm" label={__("Enabled", TEXT_DOMAIN)} checked={getEnabled(editor?.draft ?? item)} disabled={disabled || confirming || Boolean(stale) || editor?.nested}
              onChange={event => { const enabled = event.currentTarget.checked;
                // New rows do not exist in the enclosing draft until Apply.
                if (editor?.isNew) commit(changeCollectionDraft(current.current, token, { draft: setEnabled(editor.draft, enabled) }));
                else commit(updateCollectionRowAndRebaseDraft(current.current, token, item => setEnabled(item, enabled)), true);
              }} />}
            {mode === "modal" && <Button size="xs" variant="light" disabled={disabled || confirming} onClick={() => open(token)}>{__("Edit", TEXT_DOMAIN)}</Button>}
            {reorderable && savedIndex >= 0 && <>
              <Button size="xs" variant="subtle" disabled={disabled || confirming || savedIndex === 0} onClick={() => move(token, -1)}>{__("Move up", TEXT_DOMAIN)}</Button>
              <Button size="xs" variant="subtle" disabled={disabled || confirming || savedIndex === state.rows.length - 1} onClick={() => move(token, 1)}>{__("Move down", TEXT_DOMAIN)}</Button>
            </>}
            {mode === "modal" && savedIndex >= 0 && <Button size="xs" variant="subtle" color="red" disabled={disabled || confirming || editor?.nested} onClick={() => remove(token)}>{__("Remove", TEXT_DOMAIN)}</Button>}
          </Group>
        </Group>
        {mode === "collapse" && <Collapse in={expanded}>{editor ? editorForm(editor) : null}</Collapse>}
        {mode === "modal" && editor && <Modal opened={expanded} onClose={() => close(token)} title={editor.isNew ? addLabel : itemTitle(editor.draft, index)}
          size="xl" zIndex={zIndex} closeOnEscape={!confirming && !editor.nested} closeOnClickOutside={false} onKeyDown={event => event.stopPropagation()}>{editorForm(editor)}</Modal>}
      </Card>;
    })}
    <Button variant="light" disabled={disabled || confirming || (maxItems !== undefined && state.rows.length + pending.length >= maxItems)} onClick={() => open(null)}>{addLabel}</Button>
    {confirmation}
  </Stack>;
}
