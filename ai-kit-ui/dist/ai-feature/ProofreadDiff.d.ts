export type Correction = {
    startIndex: number;
    endIndex: number;
    correction?: string;
    replacement?: string;
    explanation?: string;
    type?: string;
};
export type ProofreadDiffProps = {
    original: string;
    corrections: Correction[];
};
export declare function ProofreadDiff({ original, corrections }: ProofreadDiffProps): import("react/jsx-runtime").JSX.Element;
