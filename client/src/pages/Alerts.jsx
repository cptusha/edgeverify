import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmt, session } from '../api.js';
import { useFetch, Pill, Err, Empty, MatchRibbon } from '../components/ui.jsx';

export default function Alerts() {
  const [f, setF] = useState({ status: 'open,investigating,escalated', severity: '', alert_type: '' }); const [tab, setTab] = useState('alerts');
  const { data, error } = useFetch('/alerts', { ...f, limit: 300 }, [f.status, f.severity, f.alert_type]); const cases = useFetch('/cases');
  return <>
    <div className="page-head"><div><h1>Alerts & cases</h1><p>Analysts investigate; only a compliance officer can confirm a true positive or file an STR. Every transition is written to the audit chain.</p></div></div>
    <div className="tabs"><button className={tab === 'alerts' ? 'active' : ''} onClick={() => setTab('alerts')}>Alert queue</button><button className={tab === 'cases' ? 'active' : ''} onClick={() => setTab('cases')}>Cases ({cases.data?.length || 0})</button></div>
    {tab === 'alerts' && <div className="card"><div className="toolbar"><div><label>Status</label><select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="open,investigating,escalated">Open (all)</option>{['open', 'investigating', 'escalated', 'closed_false_positive', 'closed_true_positive', 'str_filed'].map(x => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}<option value="">Everything</option></select></div>
      <div><label>Severity</label><select value={f.severity} onChange={e => setF({ ...f, severity: e.target.value })}><option value="">Any</option>{['critical', 'high', 'medium', 'low'].map(x => <option key={x}>{x}</option>)}</select></div>
      <div><label>Type</label><select value={f.alert_type} onChange={e => setF({ ...f, alert_type: e.target.value })}><option value="">Any</option>{['screening', 'transaction', 'fraud', 'kyc'].map(x => <option key={x}>{x}</option>)}</select></div></div><Err e={error} />
      {data?.length ? <table><thead><tr><th>Sev</th><th>Type</th><th>Alert</th><th>Rule</th><th>Status</th><th>Assigned</th><th>SLA</th><th>Raised</th></tr></thead><tbody>{data.map(a => { const late = a.sla_due_at && new Date(a.sla_due_at) < new Date() && !/closed|str/.test(a.status); return <tr key={a.id}><td><Pill v={a.severity} /></td><td>{a.alert_type}</td><td><Link to={`/alerts/${a.id}`}>{a.title}</Link><div className="small muted">{a.summary?.slice(0, 110)}</div></td><td className="mono small">{a.rule_code || '—'}</td><td><Pill v={a.status} /></td><td className="small">{a.assigned_to ? a.assigned_to.slice(0, 8) : <span className="muted">unassigned</span>}</td><td className="small" style={{ color: late ? 'var(--critical)' : undefined }}>{late ? 'breached' : fmt.ago(a.sla_due_at).replace(' ago', '')}</td><td className="small muted">{fmt.ago(a.created_at)}</td></tr>; })}</tbody></table> : <Empty>Nothing in this queue.</Empty>}</div>}
    {tab === 'cases' && <div className="card">{cases.data?.length ? <table><thead><tr><th>Ref</th><th>Title</th><th>Priority</th><th>Status</th><th>Alerts</th><th>Opened</th></tr></thead><tbody>{cases.data.map(c => <tr key={c.id}><td className="mono">{c.reference}</td><td>{c.title}</td><td><Pill v={c.priority} /></td><td><Pill v={c.status} /></td><td>{(c.alert_ids || []).length}</td><td className="small muted">{fmt.dt(c.created_at)}</td></tr>)}</tbody></table> : <Empty>No cases yet. Open one from an alert.</Empty>}</div>}
  </>;
}

export function AlertDetail() {
  const { id } = useParams(); const { data: a, error, reload } = useFetch(`/alerts/${id}`, null, [id]); const [note, setNote] = useState(''); const [err, setErr] = useState(null); const me = session.get().user;
  if (error) return <Err e={error} />; if (!a) return <p className="muted">Loading…</p>;
  const move = async (status) => { setErr(null); try { await api(`/alerts/${id}/transition`, { method: 'POST', body: { status, note, assigned_to: me.id } }); setNote(''); reload(); } catch (x) { setErr(x); } };
  const openCase = async () => { await api('/cases', { method: 'POST', body: { title: a.title, priority: a.severity === 'critical' ? 'high' : a.severity, customer_id: a.customer_id, alert_ids: [a.id] } }); reload(); };
  const next = { open: ['investigating', 'closed_false_positive'], investigating: ['escalated', 'closed_false_positive', 'closed_true_positive'], escalated: ['closed_false_positive', 'closed_true_positive', 'str_filed'], closed_true_positive: ['str_filed'] }[a.status] || [];
  const ev = a.evidence || {};
  return <>
    <div className="page-head"><div><h1><Pill v={a.severity} /> {a.title}</h1><p>{a.alert_type} · raised {fmt.dt(a.created_at)} · SLA {fmt.dt(a.sla_due_at)} · <Pill v={a.status} /> {a.case_id && <span className="mono">· in case</span>}</p></div></div>
    <div className="grid g2" style={{ gridTemplateColumns: '1fr 360px' }}>
      <div className="card"><h2>Evidence</h2><p>{a.summary}</p>
        {ev.top && ev.top.map(m => <MatchRibbon key={m.entry_id} m={m} />)}
        {ev.hits && <table><thead><tr><th>Rule</th><th>Severity</th><th>Explanation</th></tr></thead><tbody>{ev.hits.map((h, i) => <tr key={i}><td className="mono">{h.rule_code}</td><td><Pill v={h.severity} /></td><td className="small">{h.explanation || h.error}</td></tr>)}</tbody></table>}
        {ev.factors && <table><thead><tr><th>Factor</th><th>Detail</th><th>Points</th></tr></thead><tbody>{ev.factors.map((x, i) => <tr key={i}><td>{x.factor}</td><td className="small muted">{x.detail}</td><td className="mono">+{x.points}</td></tr>)}</tbody></table>}
        {a.transaction && <><h3 style={{ marginTop: 14 }}>Transaction</h3><table><tbody>{[['Amount', fmt.money(a.transaction.amount, a.transaction.currency)], ['Direction / type', `${a.transaction.direction} · ${a.transaction.tx_type}`], ['Counterparty', `${a.transaction.counterparty_name || '—'} ${a.transaction.counterparty_account || ''}`], ['Countries', `${a.transaction.counterparty_country || '—'} → ${a.transaction.destination_country || '—'}`], ['Channel / device', `${a.transaction.channel || '—'} / ${a.transaction.device_id || '—'}`], ['Decision', a.transaction.status], ['Occurred', fmt.dt(a.transaction.occurred_at)]].map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td>{v}</td></tr>)}</tbody></table></>}
        {a.customer && <p className="small" style={{ marginTop: 12 }}>Customer: <Link to={`/customers/${a.customer.id}`}><b>{a.customer.full_name}</b></Link> · <Pill v={a.customer.risk_level} /> {a.customer.risk_score} {a.customer.is_pep && <Pill v="PEP">PEP</Pill>}</p>}</div>
      <div className="card"><h2>Work this alert</h2><Err e={err} />
        <label>Note (recorded in the audit log)</label><textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="What did you check and what did you conclude?" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {next.map(s => { const officerOnly = ['closed_true_positive', 'str_filed'].includes(s); const allowed = !officerOnly || ['compliance_officer', 'tenant_admin', 'super_admin'].includes(me.role); return <button key={s} className={s === 'str_filed' ? 'teal' : s.startsWith('closed_true') ? 'primary' : ''} disabled={!allowed} title={allowed ? '' : 'Compliance officer only'} onClick={() => move(s)}>{s.replace(/_/g, ' ')}{!allowed && ' (officer only)'}</button>; })}
          {!next.length && <p className="muted small">This alert is closed.</p>}
          {!a.case_id && <button className="ghost" onClick={openCase}>Open a case from this alert</button>}
        </div>
        {a.resolution_note && <p className="small" style={{ marginTop: 12 }}><b>Last note:</b> {a.resolution_note}</p>}
        <p className="small muted" style={{ marginTop: 12 }}>You are signed in as <b>{me.role.replace(/_/g, ' ')}</b>. Analysts can investigate, escalate and close false positives; confirming a true positive or filing an STR requires a compliance officer.</p></div>
    </div>
  </>;
}
