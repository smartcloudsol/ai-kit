import { useEffect, useId, useRef, useState } from "react";
import type { ConfirmedVisitorAction, VisitorActionProposal, VisitorActionSummary, VisitorActionResult } from "@smart-cloud/ai-kit-core";
import { useAiKitI18n } from "../locale";
import { confirmedVisitorAction, normalizeVisitorActions, normalizeVisitorActionResult } from "./visitor-action-state";

function Summary({ rows }: { rows: VisitorActionSummary[] }) {
  const i18n = useAiKitI18n();
  return rows.length ? <dl className="ai-visitor-action-summary">{rows.map((row, index) => <div key={index}>
    <dt>{i18n.get(row.label, row.label)}</dt><dd>{row.valueKind === "message" ? i18n.get(row.value, row.value) : row.value}</dd>
  </div>)}</dl> : null;
}

/** Labels follow the component/site locale; country values remain source-provided codes. */
function countryName(code: string, language: string): string {
  try { return new Intl.DisplayNames([language.replaceAll("_", "-")], { type: "region" }).of(code) ?? code; }
  catch { return code; }
}

function ConfirmationForm({ proposal, busy, consumed, onConfirm }: {
  proposal: VisitorActionProposal; busy: boolean; consumed: boolean;
  onConfirm: (action: ConfirmedVisitorAction, label: string) => void;
}) {
  const i18n = useAiKitI18n();
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now);
  const [cancelled, setCancelled] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const submitLock = useRef(false);
  const expired = now >= proposal.expiresAt * 1000;
  const disabled = busy || consumed || submitted || cancelled || expired;
  useEffect(() => {
    const remaining = proposal.expiresAt * 1000 - Date.now();
    if (remaining <= 0) {
      if (now < proposal.expiresAt * 1000) { setNow(Date.now()); setValues({}); }
      return;
    }
    const timer = globalThis.setTimeout(() => { setNow(Date.now()); setValues({}); }, Math.min(remaining, 2_147_483_647));
    return () => globalThis.clearTimeout(timer);
  }, [proposal.expiresAt, now]);
  useEffect(() => { if (consumed) setValues({}); }, [consumed]);
  const submitLabel = i18n.get(proposal.submitLabel, proposal.submitLabel);
  const renderField = (field: VisitorActionProposal["fields"][number]) => <div className="ai-visitor-action-field" key={field.id}>
    <label htmlFor={`${id}-${field.id}`}>{i18n.get(field.label, field.label)}{field.required ? " *" : ""}</label>
    {field.kind === "country-code" && field.countryCodes?.length ?
      <select id={`${id}-${field.id}`} name={field.id} required={field.required} value={values[field.id] ?? ""}
        onChange={event => { const value = event.currentTarget.value; setValues(previous => ({ ...previous, [field.id]: value })); setInvalid(false); }}>
        <option value="">{i18n.get("Select country")}</option>
        {field.countryCodes.map(code => <option key={code} value={code}>{countryName(code, i18n.language)}</option>)}
      </select> :
      <input id={`${id}-${field.id}`} name={field.id} type="text" autoComplete="off" required={field.required}
        maxLength={field.kind === "country-code" ? Math.min(2, field.maxLength) : field.maxLength}
        {...(field.kind === "country-code" ? { pattern: "[A-Z]{2}", minLength: 2, autoCapitalize: "characters" } : {})}
        value={values[field.id] ?? ""} onChange={event => {
          const value = field.kind === "country-code" ? event.currentTarget.value.toUpperCase() : event.currentTarget.value;
          setValues(previous => ({ ...previous, [field.id]: value })); setInvalid(false);
        }} />}
  </div>;
  const requiredFields = proposal.fields.filter(field => field.required);
  const optionalFields = proposal.fields.filter(field => !field.required);
  return <form className="ai-visitor-action" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    aria-busy={busy || (submitted && !consumed) || undefined} autoComplete="off" onSubmit={event => {
      event.preventDefault();
      if (submitLock.current || disabled) return;
      const action = confirmedVisitorAction(proposal, values, { busy, consumed, now: Date.now() });
      if (!action || !event.currentTarget.checkValidity()) { setInvalid(true); return; }
      submitLock.current = true;
      setSubmitted(true);
      setValues({});
      setInvalid(false);
      onConfirm(action, submitLabel);
    }}>
    <h3 id={`${id}-title`}>{i18n.get(proposal.title, proposal.title)}</h3>
    <p id={`${id}-description`}>{i18n.get(proposal.description, proposal.description)}</p>
    <Summary rows={proposal.summary} />
    {proposal.details ? <details className="ai-visitor-action-details"><summary>{i18n.get("Details")}</summary>
      <p>{i18n.get(proposal.details, proposal.details)}</p></details> : null}
    <fieldset disabled={disabled}>
      <div className="ai-visitor-action-fields">{requiredFields.map(renderField)}</div>
      {optionalFields.length ? <details className="ai-visitor-action-details"><summary>{i18n.get("Optional address details")}</summary>
        <div className="ai-visitor-action-fields">{optionalFields.map(renderField)}</div>
      </details> : null}
      <div className="ai-visitor-action-buttons"><button type="submit">{submitLabel}</button>
        <button type="button" onClick={() => { setValues({}); setCancelled(true); setInvalid(false); }}>{i18n.get("Cancel")}</button></div>
    </fieldset>
    {expired ? <p role="status">{i18n.get("Confirmation expired. Request a new action.")}</p> : null}
    {cancelled ? <p role="status">{i18n.get("Confirmation cancelled.")}</p> : null}
    {invalid ? <p role="alert">{i18n.get("The request could not be processed. Review your input and try again.")}</p> : null}
  </form>;
}

/** Generic server-authored consent UI; showing a proposal never executes it. */
function ResultRetry({ result, busy, onConfirm }: { result: VisitorActionResult; busy: boolean;
  onConfirm: (action: ConfirmedVisitorAction, label: string) => void }) {
  const i18n = useAiKitI18n();
  const submitted = useRef(false);
  const [pending, setPending] = useState(false);
  if (!result.retryLabel) return null;
  const label = i18n.get(result.retryLabel, result.retryLabel);
  return <button type="button" disabled={busy || pending} onClick={() => {
    if (busy || submitted.current) return;
    submitted.current = true; setPending(true);
    onConfirm({ handle: result.handle, confirmed: true, values: {} }, label);
  }}>{label}</button>;
}

export function VisitorActions({ proposals: input, result: inputResult, busy = false, consumedHandles = [], retryDisabled = false, onConfirm }: {
  proposals?: unknown; result?: unknown; busy?: boolean; consumedHandles?: readonly string[]; retryDisabled?: boolean;
  onConfirm: (action: ConfirmedVisitorAction, label: string) => void;
}) {
  const i18n = useAiKitI18n();
  const proposals = normalizeVisitorActions(input) ?? [];
  const result = normalizeVisitorActionResult(inputResult);
  return <div className="ai-visitor-actions">
    {proposals.map(proposal => <ConfirmationForm key={proposal.handle} proposal={proposal} busy={busy}
      consumed={consumedHandles.includes(proposal.handle) || result?.handle === proposal.handle} onConfirm={onConfirm} />)}
    {result ? <section className="ai-visitor-action-result" role="status" aria-live="polite" data-action-status={result.status}>
      <h3>{i18n.get(result.title, result.title)}</h3>
      <p>{i18n.get(result.statusLabel ?? (result.status === "completed" ? "Action completed" : result.status === "failed" ? "Action failed" : "Waiting for reply…"))}</p>
      <Summary rows={result.summary} />
      {result.details?.length ? <details className="ai-visitor-action-details"><summary>{i18n.get("Details")}</summary>
        <Summary rows={result.details} /></details> : null}
      <div className="ai-visitor-action-buttons"><ResultRetry key={result.handle} result={result} busy={busy || retryDisabled} onConfirm={onConfirm} /></div>
    </section> : null}
  </div>;
}
