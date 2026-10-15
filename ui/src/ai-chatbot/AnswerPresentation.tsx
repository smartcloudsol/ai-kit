import { createContext, useContext, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { AnswerEntity, AnswerPresentation, AnswerStatus } from "@smart-cloud/ai-kit-core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { answerAttributeMarkdown, answerAttributeText, answerComparisonRows, normalizeAnswerPresentation } from "./answer-presentation-state";
import { useAiKitI18n } from "../locale";

const PresentationLabelContext = createContext<(source: string) => string>((source) => source);
const PresentationMarkdownContext = createContext(false);

const sourceMarkdownElements = ["p", "strong", "em", "del", "ul", "ol", "li", "br", "code", "pre", "blockquote"];

/** Formatting is a typed display projection, never permission to render source HTML or navigation. */
function SourceMarkdown({ value }: { value: string }) {
  return <div className="ai-answer-source-markdown" style={{ minWidth: 0, maxWidth: "100%", overflowWrap: "anywhere", fontWeight: 400 }}>
    <ReactMarkdown skipHtml allowedElements={sourceMarkdownElements} unwrapDisallowed remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p style={{ margin: ".25rem 0", whiteSpace: "pre-line" }}>{children}</p>,
        ul: ({ children }) => <ul style={{ margin: ".25rem 0", paddingInlineStart: "1.25rem" }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: ".25rem 0", paddingInlineStart: "1.25rem" }}>{children}</ol>,
        li: ({ children }) => <li style={{ marginBlock: ".125rem" }}>{children}</li>,
        pre: ({ children }) => <pre style={{ margin: ".25rem 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxWidth: "100%" }}>{children}</pre>,
        code: ({ children }) => <code style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{children}</code>,
        blockquote: ({ children }) => <blockquote style={{ margin: ".25rem 0", paddingInlineStart: ".75rem", borderInlineStart: "2px solid currentColor" }}>{children}</blockquote>,
      }}>{value}</ReactMarkdown>
  </div>;
}

function EntityDescription({ entity }: { entity: AnswerEntity }) {
  const markdownEnabled = useContext(PresentationMarkdownContext);
  if (!entity.description) return null;
  return markdownEnabled && entity.descriptionMarkdown !== undefined
    ? <SourceMarkdown value={entity.descriptionMarkdown} />
    : <p style={{ margin: 0, fontWeight: 400, whiteSpace: "pre-line" }}>{entity.description}</p>;
}

const cardStyle: CSSProperties = {
  minWidth: 0, boxSizing: "border-box", padding: "1rem", border: "1px solid var(--ai-kit-chat-border-color, #d9dfe8)",
  borderRadius: "var(--ai-kit-radius-sm, .75rem)", background: "var(--ai-kit-chat-surface-subtle, transparent)",
  overflowWrap: "anywhere", display: "flex", flexDirection: "column", gap: ".75rem",
};

function EntityImage({ image }: { image: NonNullable<AnswerEntity["image"]> }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img src={image.url} alt={image.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer"
    onError={() => setFailed(true)} style={{ width: "100%", height: "auto", maxHeight: "12rem", objectFit: "contain", borderRadius: ".5rem", flexShrink: 0 }} />;
}

function EntityLinks({ links, fullWidth = false }: { links: AnswerEntity["links"]; fullWidth?: boolean }) {
  const translate = useContext(PresentationLabelContext);
  if (!links.length) return null;
  return <div className="ai-answer-links" style={{ display: "flex", flexWrap: "wrap", gap: ".5rem 1rem", ...(fullWidth ? { width: "100%", marginBlockStart: "auto" } : {}) }}>
      {links.map((link) => <a className="ai-answer-link" data-answer-link-appearance={link.appearance ?? "primary"}
        key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "2.75rem",
          boxSizing: "border-box", ...(fullWidth ? { width: "100%" } : {}), padding: ".5rem .875rem", borderRadius: "var(--ai-kit-radius-sm, .75rem)",
          background: link.appearance === "secondary" ? "transparent" : "var(--ai-kit-color-primary, #1c7ed6)",
          color: link.appearance === "secondary" ? "var(--ai-kit-color-primary, #1c7ed6)" : "var(--ai-kit-color-primary-contrast, #fff)",
          border: "1px solid var(--ai-kit-color-primary, #1c7ed6)",
          fontWeight: 600, lineHeight: 1.35, textDecoration: "none", textAlign: "center", maxWidth: "100%" }}>
        {translate(link.label)}
      </a>)}
    </div>;
}

function AttributeValue({ attribute, locale }: { attribute: AnswerEntity["attributes"][number]; locale?: string }) {
  const translate = useContext(PresentationLabelContext);
  const markdownEnabled = useContext(PresentationMarkdownContext);
  const value = answerAttributeText(attribute, locale);
  if (value === undefined) return null;
  const markdown = markdownEnabled ? answerAttributeMarkdown(attribute) : undefined;
  if (typeof markdown === "string") return <SourceMarkdown value={markdown} />;
  if (Array.isArray(markdown)) return <ul style={{ margin: 0, paddingInlineStart: "1.25rem" }}>
    {markdown.map((item, index) => <li key={index}><SourceMarkdown value={item} /></li>)}
  </ul>;
  if (attribute.type === "status") {
    const status = attribute.value as AnswerStatus;
    return <span className="ai-answer-status" data-answer-status-code={status.code} data-answer-status-semantics={status.semantics}
      style={{ display: "inline-block", padding: ".2rem .55rem", borderRadius: "var(--ai-kit-radius-sm, .75rem)",
        border: "1px solid currentColor", fontWeight: 600 }}>{translate(value)}</span>;
  }
  return <span data-answer-attribute-role={attribute.role} style={{ whiteSpace: "pre-line", ...(attribute.role === "price" ? { fontSize: "1.15em", fontWeight: 700 } : {}) }}>{value}</span>;
}

function EntityContent({ entity, compact, locale }: { entity: AnswerEntity; compact: boolean; locale?: string }) {
  const translate = useContext(PresentationLabelContext);
  return <>
    {!compact && entity.image && <EntityImage key={entity.image.url} image={entity.image} />}
    <div className="ai-answer-entity-body" style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minWidth: 0, gap: ".75rem" }}>
    <strong>{entity.title}</strong>
    <EntityDescription entity={entity} />
    {entity.attributes.length > 0 && <dl style={{ margin: 0 }}>
      {entity.attributes.map((attribute) => <div key={attribute.id} data-answer-attribute-role={attribute.role}
        style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: ".35rem .75rem", marginBlock: ".25rem" }}>
        <dt>{translate(attribute.label)}</dt><dd style={{ margin: 0, minWidth: 0, maxWidth: "100%" }}><AttributeValue attribute={attribute} locale={locale} /></dd>
      </div>)}
    </dl>}
    <EntityLinks links={entity.links} fullWidth={!compact} />
    </div>
  </>;
}

function Comparison({ group, headingId, locale }: { group: AnswerPresentation["groups"][number]; headingId: string; locale?: string }) {
  const translate = useContext(PresentationLabelContext);
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
          <EntityDescription entity={entity} />
          <EntityLinks links={entity.links} />
        </div>
      </th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}><th scope="row" style={cellStyle}>{translate(row.label)}</th>
        {group.entities.map(entity => {
          const attribute = entity.attributes.find(item => item.id === row.id);
          return <td key={entity.ref} style={cellStyle}>{attribute && <AttributeValue attribute={attribute} locale={locale} />}</td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
}

export interface AnswerCarouselLabels {
  previous: string;
  next: string;
  position: string;
  region: string;
}

export const AnswerCarouselLabelsContext = createContext<AnswerCarouselLabels>({
  previous: "Previous results", next: "Next results", position: "{first}–{last} of {total}", region: "Results",
});

function EntityCarousel({ group, locale, labels: suppliedLabels }: {
  group: AnswerPresentation["groups"][number]; locale?: string; labels?: Partial<AnswerCarouselLabels>;
}) {
  const defaults = useContext(AnswerCarouselLabelsContext);
  const translate = useContext(PresentationLabelContext);
  const rawLabels = { ...defaults, ...suppliedLabels };
  const labels = {
    previous: translate(rawLabels.previous), next: translate(rawLabels.next),
    position: translate(rawLabels.position), region: translate(rawLabels.region),
  };
  const id = useId();
  const list = useRef<HTMLUListElement>(null);
  const [visible, setVisible] = useState({ first: 0, last: 0 });
  const updateVisible = () => {
    const track = list.current;
    if (!track) return;
    const bounds = track.getBoundingClientRect();
    const visibleIndices = [...track.children].flatMap((card, index) => {
      const rect = card.getBoundingClientRect();
      const intersection = Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left);
      return intersection >= Math.min(rect.width, bounds.width) / 2 ? [index] : [];
    });
    if (visibleIndices.length) setVisible(current => {
      const first = visibleIndices[0]!;
      const last = visibleIndices.at(-1)!;
      return current.first === first && current.last === last ? current : { first, last };
    });
  };
  useEffect(() => {
    const track = list.current;
    if (!track) return;
    updateVisible();
    const Observer = track.ownerDocument.defaultView?.ResizeObserver;
    const observer = Observer ? new Observer(updateVisible) : undefined;
    observer?.observe(track);
    return () => observer?.disconnect();
  }, [group.entities]);
  const navigate = (index: number) => {
    const card = list.current?.children.item(Math.min(group.entities.length - 1, Math.max(0, index)));
    const reducedMotion = list.current?.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    card?.scrollIntoView({ block: "nearest", inline: "start", behavior: reducedMotion ? "auto" : "smooth" });
  };
  const position = labels.position.replaceAll("{first}", String(visible.first + 1)).replaceAll("{last}", String(visible.last + 1))
    .replaceAll("{total}", String(group.entities.length));
  return <div className="ai-answer-carousel" role="region" aria-label={group.heading ? translate(group.heading) : labels.region}>
    <div className="ai-answer-carousel-controls">
      <button type="button" aria-controls={id} aria-label={labels.previous} aria-disabled={visible.first === 0}
        onClick={() => { if (visible.first > 0) navigate(visible.first - 1); }}>{labels.previous}</button>
      <span aria-live="polite" aria-atomic="true">{position}</span>
      <button type="button" aria-controls={id} aria-label={labels.next} aria-disabled={visible.last === group.entities.length - 1}
        onClick={() => { if (visible.last < group.entities.length - 1) navigate(visible.last + 1); }}>{labels.next}</button>
    </div>
    <ul ref={list} id={id} className="ai-answer-carousel-track" tabIndex={0} onScroll={updateVisible} onKeyDown={moveCarouselFocus}
      onFocusCapture={event => {
        const card = (event.target as HTMLElement).closest<HTMLElement>("[data-answer-entity]");
        card?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
      }} style={{ margin: 0, padding: ".25rem .25rem .75rem", listStyle: "none", gap: ".75rem", minWidth: 0,
        display: "flex", overflowX: "auto", scrollSnapType: "x proximity", overscrollBehaviorInline: "contain" }}>
      {group.entities.map(entity => <li key={entity.ref} data-answer-entity={entity.ref} tabIndex={0}
        style={{ ...cardStyle, flex: "0 0 min(16rem, 100%)", scrollSnapAlign: "start" }}>
        <EntityContent entity={entity} compact={false} locale={locale} />
      </li>)}
    </ul>
  </div>;
}

function moveCarouselFocus(event: KeyboardEvent<HTMLUListElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const container = event.currentTarget;
  const cards = [...container.children].filter((child): child is HTMLElement => child instanceof HTMLElement);
  if (!cards.length || (event.target !== container && !cards.includes(event.target as HTMLElement))) return;
  const current = cards.indexOf(event.target as HTMLElement);
  const rtl = container.ownerDocument?.defaultView?.getComputedStyle(container).direction === "rtl";
  const next = event.key === "Home" ? 0 : event.key === "End" ? cards.length - 1
    : Math.min(cards.length - 1, Math.max(0, current + ((event.key === "ArrowRight") !== rtl ? 1 : -1)));
  event.preventDefault();
  cards[next]?.focus();
}

/** The same source-independent layouts render approved REST, MCP and CPT data. */
export function AnswerPresentationView({ presentation, locale, carouselLabels }: {
  presentation?: AnswerPresentation; locale?: string; carouselLabels?: Partial<AnswerCarouselLabels>;
}) {
  const i18n = useAiKitI18n();
  const id = useId();
  const parsed = normalizeAnswerPresentation(presentation);
  if (!parsed?.groups.length) return null;
  return <PresentationLabelContext.Provider value={(source) => i18n.get(source, source)}><PresentationMarkdownContext.Provider value={parsed.schemaVersion === 3}><div className="ai-answer-presentation" style={{ width: "100%", minWidth: 0 }}>
    {parsed.groups.filter((group) => group.entities.length > 0).map((group, index) => {
      const carousel = group.layout === "carousel" && group.entities.length > 4;
      const compact = group.layout === "compact-list";
      const headingId = `${id}-${index}`;
      return <section key={`${group.templateId}:${group.templateRevision}:${index}`} data-answer-layout={group.layout} data-answer-preset={group.preset}
        aria-labelledby={group.heading ? headingId : undefined} style={{ marginBlock: ".75rem", minWidth: 0 }}>
        {group.heading && <h3 id={headingId} style={{ marginBlock: "0 .75rem" }}>{i18n.get(group.heading, group.heading)}</h3>}
        {group.layout === "comparison" ? <Comparison group={group} headingId={headingId} locale={parsed.locale ?? locale} />
          : carousel ? <EntityCarousel group={group} locale={parsed.locale ?? locale} labels={carouselLabels} /> : <ul
          style={{ margin: 0, padding: 0, listStyle: "none", gap: ".75rem", minWidth: 0,
            display: "grid", gridTemplateColumns: compact ? "minmax(0, 1fr)" : "repeat(auto-fill, minmax(0, min(16rem, 100%)))" }}>
          {group.entities.map((entity) => <li key={entity.ref} data-answer-entity={entity.ref} style={cardStyle}>
            <EntityContent entity={entity} compact={compact} locale={parsed.locale ?? locale} />
          </li>)}
        </ul>}
      </section>;
    })}
  </div></PresentationMarkdownContext.Provider></PresentationLabelContext.Provider>;
}
