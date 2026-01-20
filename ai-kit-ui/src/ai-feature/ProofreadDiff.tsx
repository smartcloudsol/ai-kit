import { Tooltip } from "@mantine/core";
import { useMemo } from "react";
import { I18n } from "aws-amplify/utils";

// Minimal shape compatible with dom-chromium-ai ProofreadCorrection
export type Correction = {
  startIndex: number;
  endIndex: number;
  correction?: string;
  replacement?: string;
  explanation?: string;
  type?: string;
};

type Segment =
  | { kind: "plain"; text: string }
  | { kind: "corr"; original: string; corr: Correction };

export type ProofreadDiffProps = {
  original: string;
  corrections: Correction[];
};

function normalizeCorrections(corrections: Correction[]): Correction[] {
  const sorted = [...corrections].sort((a, b) => a.startIndex - b.startIndex);
  const out: Correction[] = [];
  let lastEnd = -1;
  for (const c of sorted) {
    if (
      typeof c.startIndex !== "number" ||
      typeof c.endIndex !== "number" ||
      c.startIndex < 0 ||
      c.endIndex <= c.startIndex
    ) {
      continue;
    }
    // Drop overlaps (best-effort)
    if (c.startIndex < lastEnd) continue;
    out.push(c);
    lastEnd = c.endIndex;
  }
  return out;
}

export function ProofreadDiff({ original, corrections }: ProofreadDiffProps) {
  const segments = useMemo<Segment[]>(() => {
    const corr = normalizeCorrections(corrections || []);
    const segs: Segment[] = [];
    let cursor = 0;
    for (const c of corr) {
      if (c.startIndex > cursor) {
        segs.push({
          kind: "plain",
          text: original.slice(cursor, c.startIndex),
        });
      }
      const orig = original.slice(c.startIndex, c.endIndex);
      segs.push({ kind: "corr", original: orig, corr: c });
      cursor = c.endIndex;
    }
    if (cursor < original.length) {
      segs.push({ kind: "plain", text: original.slice(cursor) });
    }
    return segs;
  }, [original, corrections]);

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid rgba(0,0,0,0.1)",
        borderRadius: 6,
        background: "rgba(0,0,0,0.02)",
        whiteSpace: "pre-wrap",
        lineHeight: 1.5,
      }}
    >
      {segments.map((s, idx) => {
        if (s.kind === "plain") {
          return <span key={idx}>{s.text}</span>;
        }
        const replacement = (
          s.corr.replacement ??
          s.corr.correction ??
          ""
        ).trim();
        const explanation = (s.corr.explanation ?? "").trim();
        const type = (s.corr.type ?? "").trim();
        const tooltip = [
          type ? I18n.get("Type") + ": - " + I18n.get(type) : "",
          replacement ? I18n.get("Replace with") + ": " + replacement : "",
          explanation ? I18n.get("Why") + ": " + explanation : "",
        ]
          .filter(Boolean)
          .join("\n");

        return (
          <Tooltip
            key={idx}
            label={tooltip || I18n.get("Suggested change")}
            multiline={true}
          >
            <span
              style={{
                textDecoration: "underline",
                textDecorationStyle: "wavy",
                cursor: "help",
                padding: "0 1px",
              }}
            >
              {s.original}
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}
