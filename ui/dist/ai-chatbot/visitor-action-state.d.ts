import { parseVisitorActionResult, type VisitorActionProposal, type VisitorActionResult, type ConfirmedVisitorAction } from "@smart-cloud/ai-kit-core";
/** Transport and persisted history cross the same bounded consent boundary. */
export declare function normalizeVisitorActions(value: unknown): VisitorActionProposal[] | undefined;
export { parseVisitorActionResult as normalizeVisitorActionResult };
/** Form values live only in component state and in this explicit outbound request. */
export declare function confirmedVisitorAction(proposalValue: unknown, input: Record<string, string>, options?: {
    busy?: boolean;
    consumed?: boolean;
    now?: number;
}): ConfirmedVisitorAction | undefined;
/** Never serialize a confirmation request or its input values into chat history. */
export declare function withSafeVisitorActions<T extends {
    visitorActions?: unknown;
    visitorActionResult?: unknown;
    visitorAction?: unknown;
}>(value: T): Omit<T, "visitorActions" | "visitorActionResult" | "visitorAction"> & {
    visitorActions?: VisitorActionProposal[];
    visitorActionResult?: VisitorActionResult;
};
