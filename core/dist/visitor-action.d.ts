/** Explicit visitor consent is independent of model planning and navigation. */
export interface VisitorActionField {
    id: string;
    label: string;
    kind: "text" | "country-code";
    required: boolean;
    maxLength: number;
    /** Version 2 only: verified ISO country choices, never inferred from visitor locale. */
    countryCodes?: string[];
}
export interface VisitorActionSummary {
    label: string;
    value: string;
    /** Only explicitly server-authored messages are localization candidates. Source facts are not. */
    valueKind?: "source" | "message";
}
export interface VisitorActionProposal {
    schemaVersion: 1 | 2;
    handle: string;
    title: string;
    description: string;
    /** Version 2 only: secondary disclosure, separate from the compact description. */
    details?: string;
    submitLabel: string;
    summary: VisitorActionSummary[];
    fields: VisitorActionField[];
    expiresAt: number;
}
export interface ConfirmedVisitorAction {
    handle: string;
    confirmed: true;
    values: Record<string, string>;
}
export interface VisitorActionResult {
    schemaVersion: 1 | 2;
    handle: string;
    status: "completed" | "pending" | "failed";
    title: string;
    /** Version 2 only: purpose-specific server-authored status. */
    statusLabel?: string;
    summary: VisitorActionSummary[];
    /** Version 2 only: secondary source facts and server-authored disclosures. */
    details?: VisitorActionSummary[];
    /** Pending, known actions may offer a manual read-only retry of the same handle. */
    retryLabel?: string;
}
export declare function parseVisitorActionProposal(v: unknown): VisitorActionProposal | undefined;
export declare function parseConfirmedVisitorAction(v: unknown): ConfirmedVisitorAction | undefined;
export declare function parseVisitorActionResult(v: unknown): VisitorActionResult | undefined;
