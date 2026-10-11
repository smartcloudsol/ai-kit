import { useId, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { AnswerEntity, AnswerPresentation } from "@smart-cloud/ai-kit-core";
import { answerAttributeText, normalizeAnswerPresentation } from "./answer-presentation-state";

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

function EntityContent({ entity, compact }: { entity: AnswerEntity; compact: boolean }) {
  return <>
    {!compact && entity.image && <EntityImage key={entity.image.url} image={entity.image} />}
    <strong>{entity.title}</strong>
    {entity.description && <p style={{ margin: 0 }}>{entity.description}</p>}
    {entity.attributes.length > 0 && <dl style={{ margin: 0 }}>
      {entity.attributes.map((attribute) => <div key={attribute.id} style={{ display: "flex", flexWrap: "wrap", gap: ".35rem .75rem" }}>
        <dt>{attribute.label}</dt><dd style={{ margin: 0 }}>{answerAttributeText(attribute)}</dd>
      </div>)}
    </dl>}
    {entity.links.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem 1rem" }}>
      {entity.links.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>)}
    </div>}
    <small style={{ opacity: .8, marginTop: "auto", overflowWrap: "anywhere" }} data-source-kind={entity.provenance.kind}>
      <span>{entity.provenance.sourceId}</span>{" · "}<code>{entity.provenance.evidenceId}</code>{" · "}
      <time dateTime={entity.provenance.checkedAt}>{entity.provenance.checkedAt}</time>
    </small>
  </>;
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
export function AnswerPresentationView({ presentation }: { presentation?: AnswerPresentation }) {
  const id = useId();
  const parsed = normalizeAnswerPresentation(presentation);
  if (!parsed?.groups.length) return null;
  return <div className="ai-answer-presentation" style={{ width: "100%", minWidth: 0 }}>
    {parsed.groups.filter((group) => group.entities.length > 0).map((group, index) => {
      const carousel = group.layout === "carousel";
      const compact = group.layout === "compact-list";
      const headingId = `${id}-${index}`;
      return <section key={`${group.templateId}:${group.templateRevision}:${index}`} data-answer-layout={group.layout}
        aria-labelledby={group.heading ? headingId : undefined} style={{ marginBlock: ".75rem", minWidth: 0 }}>
        {group.heading && <h3 id={headingId} style={{ marginBlock: "0 .75rem" }}>{group.heading}</h3>}
        <ul tabIndex={carousel ? 0 : undefined} onKeyDown={carousel ? moveCarouselFocus : undefined}
          onFocusCapture={carousel ? (event) => {
            const card = (event.target as HTMLElement).closest<HTMLElement>("[data-answer-entity]");
            card?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "auto" });
          } : undefined}
          style={{ margin: 0, padding: carousel ? ".25rem .25rem .75rem" : 0, listStyle: "none", gap: ".75rem", minWidth: 0,
            ...(carousel ? { display: "flex", overflowX: "auto", scrollSnapType: "x proximity" }
              : { display: "grid", gridTemplateColumns: compact ? "minmax(0, 1fr)" : "repeat(auto-fill, minmax(0, min(16rem, 100%)))" }) }}>
          {group.entities.map((entity) => <li key={entity.ref} data-answer-entity={entity.ref} tabIndex={carousel ? 0 : undefined}
            style={{ ...cardStyle, ...(carousel ? { flex: "0 0 min(16rem, 100%)", scrollSnapAlign: "start" } : {}) }}>
            <EntityContent entity={entity} compact={compact} />
          </li>)}
        </ul>
      </section>;
    })}
  </div>;
}
