/** Decode transport-escaped text once; React will escape the resulting text node. */
export declare function citationDisplayText(value: string | undefined): string | undefined;
/** Only decode encoded ampersands in URLs, preserving ordinary query parameters. */
export declare function citationLinkUrl(value: string | undefined): string | undefined;
