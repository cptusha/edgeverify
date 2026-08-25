import React, { useState } from 'react';
import { api } from '../api.js';
import { useFetch, Pill, Err, Empty } from '../components/ui.jsx';

const EXAMPLE = { code: 'CUSTOM-LARGE-MOBILE-MONEY', name: 'Large mobile-money cash-out', description: 'Mobile money debit ≥ 2,000 base for medium/high-risk customers', category: 'custom', severity: 'medium', action: 'alert',
  definition: { when: [{ field: 'tx_type', op: 'in', value: ['mobile_money'] }, { field: 'direction', op: '==', value: 'debit' }, { field: 'amount_base', op: '>=', value: 2000 }], profile: { field: 'risk_level', op: 'in', value: ['medium', 'high'] } } };

export default function Rules() {
  const { data, error, reload } = useFetch('/admin/rules'); const [json, setJson] = useState(JSON.stringify(EXAMPLE, null, 2)); const [test, setTest] = useState(null); const [err, setErr] = useState(null); const [show, setShow] = useState(false);
  const toggle = async (r) => { await api(`/admin/rules/${r.id}`, { method: 'PATCH', body: { enabled: !r.enabled } }); reload(); };
  const parse = () => { try { return JSON.parse(json); } catch (e) { setErr(new Error('Rule JSON is invalid: ' + e.message)); return null; } };
  const run = async () => { setErr(null); const r = parse(); if (!r) return; try { setTest(await api('/admin/rules/test', { method: 'POST', body: r })); } catch (x) { setErr(x); } };
  const save = async () => { setErr(null); const r = parse(); if (!r) return; try { await api('/admin/rules', { method: 'POST', body: r }); setShow(false); reload(); } catch (x) { setErr(x); } };
  return <>
    <div className="page-head"><div><h1>Rules</h1><p>Rules are plain JSON: conditions on the transaction, on the customer profile, and aggregates over a time window. Test against history before enabling.</p></div><button className="primary" onClick={() => setShow(s => !s)}>{show ? 'Close' : 'Write a custom rule'}</button></div>
    {show && <div className="card grid g2" style={{ marginBottom: 14 }}>
      <div><label>Rule definition (JSON)</label><textarea rows={22} className="mono" value={json} onChange={e => setJson(e.target.value)} /><div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button onClick={run}>Test against last 2,000 transactions</button><button className="primary" onClick={save}>Save & enable</button></div><Err e={err} /></div>
      <div><h3>Building blocks</h3><p className="small">Fields: <span className="mono">amount_base, amount, currency, direction, tx_type, channel, counterparty_country, destination_country, counterparty_country_risk, destination_country_risk, is_cross_border, is_new_counterparty, days_since_last_activity, device_changed, hour_of_day</span></p>
        <p className="small">Operators: <span className="mono">== != &gt; &gt;= &lt; &lt;= in not_in contains regex between round_amount is_true is_false exists</span></p>
        <p className="small">Aggregate metrics over <span className="mono">window_hours</span>: <span className="mono">count, sum, distinct, ratio_in_out</span> with optional <span className="mono">filter</span> on prior transactions.</p>
        <p className="small">Profile conditions use customer fields: <span className="mono">risk_level, is_pep, customer_type, nationality, occupation, channel</span>.</p>
        <p className="small">Action: <span className="mono">alert</span> (accept + alert), <span className="mono">hold</span> (return REVIEW to core banking), <span className="mono">block</span> (return REJECT).</p>
        {test && <div className="notice"><b>{test.would_alert}</b> of {test.evaluated} recent transactions would alert ({test.hit_rate_pct}%).{test.sample.length > 0 && <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 16 }}>{test.sample.map((s, i) => <li key={i}>{s.explanation}</li>)}</ul>}</div>}</div></div>}
    <div className="card"><Err e={error} />{data?.length ? <table><thead><tr><th>Code</th><th>Rule</th><th>Category</th><th>Severity</th><th>Action</th><th>Enabled</th></tr></thead><tbody>{data.map(r => <tr key={r.id}><td className="mono">{r.code}</td><td><b>{r.name}</b><div className="small muted">{r.description}</div></td><td>{r.category}</td><td><Pill v={r.severity} /></td><td className="mono">{r.action}</td><td><button className={r.enabled ? 'teal' : ''} onClick={() => toggle(r)}>{r.enabled ? 'On' : 'Off'}</button></td></tr>)}</tbody></table> : <Empty>No rules.</Empty>}</div>
  </>;
}
