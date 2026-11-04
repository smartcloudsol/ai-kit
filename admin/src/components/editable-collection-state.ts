/** Tokens belong to this editor only; they never enter persisted configuration. */
export interface CollectionRow<T> { token: string; value: T }
export interface CollectionDraft<T> { token: string; original: T; draft: T; isNew: boolean; expanded: boolean; nested: boolean }
export interface CollectionState<T> { rows: CollectionRow<T>[]; drafts: Record<string, CollectionDraft<T>>; sequence: number }
const fingerprint = (value: unknown) => JSON.stringify(value);
export function collectionState<T>(value: T[]): CollectionState<T> {
  return { rows: value.map((item, index) => ({ token: `row-${index}`, value: item })), drafts: {}, sequence: value.length };
}

/** Match identity first, then unambiguous unchanged values. Changed/removed rows
 * lose their token, leaving their private editors stale rather than overwriting
 * a different row. Local operations retain tokens explicitly. */
export function reconcileCollection<T>(state: CollectionState<T>, value: T[]): CollectionState<T> {
  if (value.length === state.rows.length && value.every((item, i) => item === state.rows[i].value)) return state;
  const unused = new Set(state.rows);
  const matches: Array<CollectionRow<T> | undefined> = value.map(item => {
    const row = [...unused].find(candidate => candidate.value === item);
    if (row) unused.delete(row);
    return row;
  });
  let sequence = state.sequence;
  const rows = value.map((item, index) => {
    let row = matches[index];
    if (!row) {
      const signature = fingerprint(item);
      const candidates = [...unused].filter(candidate => fingerprint(candidate.value) === signature);
      const unmatched = value.filter((other, position) => !matches[position] && fingerprint(other) === signature);
      if (candidates.length === 1 && unmatched.length === 1) { row = candidates[0]; unused.delete(row); }
    }
    return { token: row?.token ?? `row-${sequence++}`, value: item };
  });
  return { ...state, rows, sequence };
}
export function collectionDraftStale<T>(state: CollectionState<T>, token: string): boolean {
  const editor = state.drafts[token];
  if (!editor || editor.isNew) return false;
  const row = state.rows.find(item => item.token === token);
  return !row || fingerprint(row.value) !== fingerprint(editor.original);
}
export function reservedCollectionItems<T>(state: CollectionState<T>): T[] {
  return [...state.rows.map(row => row.value), ...Object.values(state.drafts).map(editor => editor.draft)];
}
export function openCollectionDraft<T>(state: CollectionState<T>, token: string | null, createItem: (reserved: T[]) => T): CollectionState<T> {
  if (token && state.drafts[token]) return changeCollectionDraft(state, token, { expanded: true });
  const original = structuredClone(token === null ? createItem(reservedCollectionItems(state)) : state.rows.find(row => row.token === token)!.value);
  const key = token ?? `row-${state.sequence}`;
  return { ...state, sequence: state.sequence + (token === null ? 1 : 0), drafts: { ...state.drafts,
    [key]: { token: key, original, draft: structuredClone(original), isNew: token === null, expanded: true, nested: false } } };
}
export function changeCollectionDraft<T>(state: CollectionState<T>, token: string, patch: Partial<CollectionDraft<T>>): CollectionState<T> {
  const editor = state.drafts[token];
  return editor ? { ...state, drafts: { ...state.drafts, [token]: { ...editor, ...patch } } } : state;
}
/** A header quick action updates only its fields in the enclosing row and both
 * editor snapshots. Unrelated private edits remain private and discardable. */
export function updateCollectionRowAndRebaseDraft<T>(state: CollectionState<T>, token: string, update: (item: T) => T): CollectionState<T> {
  const row = state.rows.find(item => item.token === token);
  if (!row || collectionDraftStale(state, token)) return state;
  const editor = state.drafts[token];
  return { ...state,
    rows: state.rows.map(item => item.token === token ? { ...item, value: update(item.value) } : item),
    drafts: editor ? { ...state.drafts, [token]: { ...editor, original: update(editor.original), draft: update(editor.draft) } } : state.drafts,
  };
}
export function discardCollectionDraft<T>(state: CollectionState<T>, token: string): CollectionState<T> {
  const drafts = { ...state.drafts }; delete drafts[token];
  return { ...state, drafts };
}
export function applyCollectionDraft<T>(state: CollectionState<T>, token: string): CollectionState<T> {
  const editor = state.drafts[token];
  if (!editor || editor.nested || collectionDraftStale(state, token)) return state;
  const row = { token, value: structuredClone(editor.draft) };
  return { ...discardCollectionDraft(state, token), rows: editor.isNew ? [...state.rows, row] : state.rows.map(item => item.token === token ? row : item) };
}
export function removeCollectionRow<T>(state: CollectionState<T>, token: string): CollectionState<T> {
  return { ...discardCollectionDraft(state, token), rows: state.rows.filter(row => row.token !== token) };
}
