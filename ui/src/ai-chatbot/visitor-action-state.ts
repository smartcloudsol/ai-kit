import { parseVisitorActionProposal, parseVisitorActionResult, parseConfirmedVisitorAction,
  type VisitorActionProposal, type VisitorActionResult, type ConfirmedVisitorAction } from "@smart-cloud/ai-kit-core";

/** Transport and persisted history cross the same bounded consent boundary. */
export function normalizeVisitorActions(value: unknown): VisitorActionProposal[] | undefined {
  try {
  if (!Array.isArray(value) || value.length > 6 || Reflect.ownKeys(value).length !== value.length + 1) return undefined;
  const descriptors = Array.from({ length: value.length }, (_, index) => Object.getOwnPropertyDescriptor(value, String(index)));
  if (descriptors.some(descriptor => !descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value"))) return undefined;
  const parsed = descriptors.map(descriptor => parseVisitorActionProposal(descriptor!.value));
  if (parsed.some(proposal => !proposal || proposal.fields.some(field => field.kind === "country-code" && field.maxLength < 2)) ||
      new Set(parsed.map(proposal => proposal?.handle)).size !== parsed.length) return undefined;
  return parsed as VisitorActionProposal[];
  } catch { return undefined; }
}

export { parseVisitorActionResult as normalizeVisitorActionResult };

/** Form values live only in component state and in this explicit outbound request. */
export function confirmedVisitorAction(proposalValue: unknown, input: Record<string, string>, options: {
  busy?: boolean; consumed?: boolean; now?: number;
} = {}): ConfirmedVisitorAction | undefined {
  const proposal = parseVisitorActionProposal(proposalValue);
  if (!proposal || options.busy || options.consumed || (options.now ?? Date.now()) >= proposal.expiresAt * 1000 ||
      Object.keys(input).some(key => !proposal.fields.some(field => field.id === key))) return undefined;
  const values: Record<string, string> = {};
  for (const field of proposal.fields) {
    const raw = input[field.id] ?? "";
    if (typeof raw !== "string") return undefined;
    const value = field.kind === "country-code" ? raw.trim().toUpperCase() : raw;
    if ((field.required && !value.trim()) || value.length > field.maxLength ||
        (field.kind === "country-code" && value !== "" && (!/^[A-Z]{2}$/.test(value) ||
          (field.countryCodes !== undefined && !field.countryCodes.includes(value))))) return undefined;
    values[field.id] = value;
  }
  return parseConfirmedVisitorAction({ handle: proposal.handle, confirmed: true, values });
}

/** Never serialize a confirmation request or its input values into chat history. */
export function withSafeVisitorActions<T extends { visitorActions?: unknown; visitorActionResult?: unknown; visitorAction?: unknown }>(value: T):
  Omit<T, "visitorActions" | "visitorActionResult" | "visitorAction"> & { visitorActions?: VisitorActionProposal[]; visitorActionResult?: VisitorActionResult } {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { visitorActions, visitorActionResult, visitorAction, ...rest } = value;
  const proposals = normalizeVisitorActions(visitorActions);
  const result = parseVisitorActionResult(visitorActionResult);
  return { ...rest, ...(proposals ? { visitorActions: proposals } : {}), ...(result ? { visitorActionResult: result } : {}) };
}
