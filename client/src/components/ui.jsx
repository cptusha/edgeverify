import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export const Pill = ({ v, children }) => <span className={`pill ${v}`}>{children ?? String(v).replace(/_/g, ' ')}</span>;
export const Kpi = ({ v, l, sub }) => <div className="card kpi"><span className="v">{v}</span><span className="l">{l}</span>{sub && <span className="sub">{sub}</span>}</div>;
export const Empty = ({ children }) => <div className="empty">{children}</div>;
export const Err = ({ e }) => e ? <div className="error">{e.message || String(e)}{e.issues && <div className="small mono">{e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' · ')}</div>}</div> : null;

export function useFetch(path, params, deps = []) {
  const [state, set] = useState({ data: null, loading: true, error: null });
  const reload = () => { set(s => ({ ...s, loading: true })); api(path, { params }).then(data => set({ data, loading: false, error: null })).catch(error => set({ data: null, loading: false, error })); };
  useEffect(reload, deps);
  return { ...state, reload };
}

export const Bars = ({ items, labelKey, valueKey, colorKey }) => {
  const max = Math.max(1, ...items.map(i => Number(i[valueKey])));
  return <div className="bars">{items.map(i => <div className="b" key={i[labelKey]}><span>{String(i[labelKey] ?? '—').replace(/_/g, ' ')}</span><i className={colorKey ? i[colorKey] : i[labelKey]} style={{ width: `${100 * Number(i[valueKey]) / max}%` }} /><span className="mono muted">{i[valueKey]}</span></div>)}</div>;
};

// Signature element: the match ribbon — score, matched name, list, and the engine's reasons in plain language.
export const MatchRibbon = ({ m }) => {
  const heat = m.score >= 95 ? 'hot' : m.score >= 88 ? 'warm' : '';
  return <div className="ribbon">
    <div><div className="score">{Math.round(m.score)}<small>SCORE</small></div></div>
    <div>
      <div className="name">{m.matched_name}{m.primary_name !== m.matched_name && <span className="muted small"> · alias of {m.primary_name}</span>}</div>
      <div className="small"><Pill v={m.list?.list_type} /> {m.list?.name} <span className="muted">· {m.list?.country}</span> {m.pep_role && <span className="muted">· {m.pep_role}</span>}</div>
      <div className="bar"><i className={heat} style={{ width: `${m.score}%` }} /></div>
      <div className="reasons">{(m.reasons || []).map((r, i) => <span key={i} className={/matches|within/.test(r) ? 'pos' : /differs/.test(r) ? 'neg' : ''}>{r}</span>)}
        {m.programs?.length > 0 && <span>programs: {m.programs.join(', ')}</span>}{m.dobs?.length > 0 && <span>DOB {m.dobs.join(' / ')}</span>}</div>
    </div>
  </div>;
};

export const Decision = ({ r }) => <div className="decision">
  <div className={`verdict ${r.decision}`}>{r.decision}<small>{r.status.toUpperCase()} · {r.latency_ms} MS</small></div>
  <div className="hits">{r.hits.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{r.hits.map((h, i) => <li key={i}><Pill v={h.severity} /> <b>{h.rule_code}</b> — {h.explanation || h.error}</li>)}</ul> : <span className="muted">No rules triggered. Counterparty screening: {r.counterparty_screening?.outcome || 'skipped'}.</span>}
    {r.counterparty_screening && r.counterparty_screening.outcome !== 'clear' && <div className="small" style={{ marginTop: 6 }}>Counterparty screening: <Pill v={r.counterparty_screening.outcome} /> {r.counterparty_screening.top_score}%</div>}</div>
</div>;
