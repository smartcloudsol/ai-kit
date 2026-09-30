import { decodeHTML } from "entities";

/** Decode transport-escaped text once; React will escape the resulting text node. */
export function citationDisplayText(value: string | undefined): string | undefined {
  return value === undefined ? undefined : decodeHTML(value);
}

/** Only decode encoded ampersands in URLs, preserving ordinary query parameters. */
export function citationLinkUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const decoded = value.trim().replace(/&(?:amp|#0*38|#x0*26);/gi, "&");
  try {
    const url = new URL(decoded);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
      ? decoded
      : undefined;
  } catch {
    return undefined;
  }
}
