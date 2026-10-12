import { useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { AnswerEntity, AnswerPresentation, AnswerStatus } from "@smart-cloud/ai-kit-core";
import { answerAttributeText, answerComparisonRows, normalizeAnswerPresentation } from "./answer-presentation-state";

const cardStyle: CSSProperties = {
  minWidth: 0, boxSizing: "border-box", padding: "1rem", border: "1px solid var(--ai-kit-chat-border-color, #d9dfe8)",
  borderRadius: "var(--ai-kit-radius-sm, .75rem)", background: "var(--ai-kit-chat-surface-subtle, transparent)",
  overflowWrap: "anywhere", display: "flex", flexDirection: "column", gap: ".75rem",
};

function EntityImage({ image }: { image: NonNullable<AnswerEntity["image"]> }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img src={image.url} alt={image.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer"
    onError={() => setFailed(true)} style={{ width: "100%", height: "auto", maxHeight: "12rem", objectFit: "contain", borderRadius: ".5rem" }} />;
}

function EntityLinks({ links }: { links: AnswerEntity["links"] }) {
  if (!links.length) return null;
  return <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem 1rem" }}>
      {links.map((link) => <a className="ai-answer-link" data-answer-link-appearance={link.appearance ?? "primary"}
        key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "2.75rem",
          boxSizing: "border-box", padding: ".5rem .875rem", borderRadius: "var(--ai-kit-radius-sm, .75rem)",
          background: link.appearance === "secondary" ? "transparent" : "var(--ai-kit-color-primary, #1c7ed6)",
          color: link.appearance === "secondary" ? "var(--ai-kit-color-primary, #1c7ed6)" : "var(--ai-kit-color-primary-contrast, #fff)",
          border: "1px solid var(--ai-kit-color-primary, #1c7ed6)",
          fontWeight: 600, lineHeight: 1.35, textDecoration: "none", textAlign: "center", maxWidth: "100%" }}>
        {link.label}
      </a>)}
    </div>;
}

function AttributeValue({ attribute, locale }: { attribute: AnswerEntity["attributes"][number]; locale?: string }) {
  const value = answerAttributeText(attribute, locale);
  if (value === undefined) return null;
  if (attribute.type === "status") {
    const status = attribute.value as AnswerStatus;
    return <span className="ai-answer-status" data-answer-status-code={status.code} data-answer-status-semantics={status.semantics}
      style={{ display: "inline-block", padding: ".2rem .55rem", borderRadius: "var(--ai-kit-radius-sm, .75rem)",
        border: "1px solid currentColor", fontWeight: 600 }}>{value}</span>;
  }
  return <span data-answer-attribute-role={attribute.role} style={attribute.role === "price" ? { fontSize: "1.15em", fontWeight: 700 } : undefined}>{value}</span>;
}

function EntityContent({ entity, compact, locale }: { entity: AnswerEntity; compact: boolean; locale?: string }) {
  return <>
    {!compact && entity.image && <EntityImage key={entity.image.url} image={entity.image} />}
    <strong>{entity.title}</strong>
    {entity.description && <p style={{ margin: 0 }}>{entity.description}</p>}
    {entity.attributes.length > 0 && <dl style={{ margin: 0 }}>
      {entity.attributes.map((attribute) => <div key={attribute.id} data-answer-attribute-role={attribute.role}
        style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: ".35rem .75rem", marginBlock: ".25rem" }}>
        <dt>{attribute.label}</dt><dd style={{ margin: 0 }}><AttributeValue attribute={attribute} locale={locale} /></dd>
      </div>)}
    </dl>}
    <EntityLinks links={entity.links} />
  </>;
}

function Comparison({ group, headingId, locale }: { group: AnswerPresentation["groups"][number]; headingId: string; locale?: string }) {
  const rows = answerComparisonRows(group.entities);
  const cellStyle: CSSProperties = { minWidth: "10rem", maxWidth: "20rem", padding: ".75rem", textAlign: "start",
    verticalAlign: "top", wordBreak: "normal", overflowWrap: "normal", hyphens: "none" };
  return <div className="ai-answer-comparison-scroll" tabIndex={0} role="region"
    aria-labelledby={group.heading ? headingId : undefined} aria-label={!group.heading ? group.entities.map(entity => entity.title).join("; ") : undefined}
    style={{ maxWidth: "100%", minWidth: 0, overflowX: "auto", overscrollBehaviorInline: "contain" }}>
    <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse" }} aria-labelledby={group.heading ? headingId : undefined}>
      <thead><tr><th scope="col" style={cellStyle} />{group.entities.map(entity => <th key={entity.ref} scope="col" style={cellStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
          {entity.image && <EntityImage key={entity.image.url} image={entity.image} />}
          <strong>{entity.title}</strong>
          {entity.description && <p style={{ margin: 0, fontWeight: 400 }}>{entity.description}</p>}
          <EntityLinks links={entity.links} />
        </div>
      </th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}><th scope="row" style={cellStyle}>{row.label}</th>
        {group.entities.map(entity => {
          const attribute = entity.attributes.find(item => item.id === row.id);
          return <td key={entity.ref} style={cellStyle}>{attribute && <AttributeValue attribute={attribute} locale={locale} />}</td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
}

function moveCarouselFocus(event: KeyboardEvent<HTMLUListElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const container = event.currentTarget;
  const cards = [...container.children].filter((child): child is HTMLElement => child instanceof HTMLElement);
  if (!cards.length || (event.target !== container && !cards.includes(event.target as HTMLElement))) return;
  const current = cards.indexOf(event.target as HTMLElement);
  const next = event.key === "Home" ? 0 : event.key === "End" ? cards.length - 1
    : Math.min(cards.length - 1, Math.max(0, current + (event.key === "ArrowRight" ? 1 : -1)));
  event.preventDefault();
  cards[next]?.focus();
}

/** The same source-independent layouts render approved REST, MCP and CPT data. */
export function AnswerPresentationView({ presentation, locale }: { presentation?: AnswerPresentation; locale?: string }) {
  const id = useId();
  const parsed = normalizeAnswerPresentation(presentation);
  if (!parsed?.groups.length) return null;
  return <div className="ai-answer-presentation" style={{ width: "100%", minWidth: 0 }}>
    {parsed.groups.filter((group) => group.entities.length > 0).map((group, index) => {
      const carousel = group.layout === "carousel";
      const compact = group.layout === "compact-list";
      const headingId = `${id}-${index}`;
      return <section key={`${group.templateId}:${group.templateRevision}:${index}`} data-answer-layout={group.layout} data-answer-preset={group.preset}
        aria-labelledby={group.heading ? headingId : undefined} style={{ marginBlock: ".75rem", minWidth: 0 }}>
        {group.heading && <h3 id={headingId} style={{ marginBlock: "0 .75rem" }}>{group.heading}</h3>}
        {group.layout === "comparison" ? <Comparison group={group} headingId={headingId} locale={parsed.locale ?? locale} /> : <ul tabIndex={carousel ? 0 : undefined} onKeyDown={carousel ? moveCarouselFocus : undefined}
          onFocusCapture={carousel ? (event) => {
            const card = (event.target as HTMLElement).closest<HTMLElement>("[data-answer-entity]");
            card?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "auto" });
          } : undefined}
          style={{ margin: 0, padding: carousel ? ".25rem .25rem .75rem" : 0, listStyle: "none", gap: ".75rem", minWidth: 0,
            ...(carousel ? { display: "flex", overflowX: "auto", scrollSnapType: "x proximity" }
              : { display: "grid", gridTemplateColumns: compact ? "minmax(0, 1fr)" : "repeat(auto-fill, minmax(0, min(16rem, 100%)))" }) }}>
          {group.entities.map((entity) => <li key={entity.ref} data-answer-entity={entity.ref} tabIndex={carousel ? 0 : undefined}
            style={{ ...cardStyle, ...(carousel ? { flex: "0 0 min(16rem, 100%)", scrollSnapAlign: "start" } : {}) }}>
            <EntityContent entity={entity} compact={compact} locale={parsed.locale ?? locale} />
          </li>)}
        </ul>}
      </section>;
    })}
  </div>;
}
