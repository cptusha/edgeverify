import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmt } from '../api.js';
import { useFetch, Pill, Err, Empty, MatchRibbon } from '../components/ui.jsx';

export default function Customers() {
  const [filters, setFilters] = useState({ q: '', risk_level: '', kyc_status: '' }); const [show, setShow] = useState(false);
  const { data, error, reload } = useFetch('/customers', filters, [filters.risk_level, filters.kyc_status]);
  const rows = (data || []).filter(c => !filters.q || c.full_name.toLowerCase().includes(filters.q.toLowerCase()));
  return <>
    <div className="page-head"><div><h1>Customers</h1><p>Every customer is screened at onboarding, re-screened daily, and re-scored whenever their profile changes.</p></div><button className="primary" onClick={() => setShow(s => !s)}>{show ? 'Close' : 'Onboard a customer'}</button></div>
    {show && <Onboard onDone={() => { setShow(false); reload(); }} />}
    <div className="card"><div className="toolbar"><div><label>Name</label><input value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} placeholder="Filter by name" /></div>
      <div><label>Risk</label><select value={filters.risk_level} onChange={e => setFilters({ ...filters, risk_level: e.target.value })}><option value="">Any</option>{['low', 'medium', 'high', 'prohibited'].map(x => <option key={x}>{x}</option>)}</select></div>
      <div><label>KYC status</label><select value={filters.kyc_status} onChange={e => setFilters({ ...filters, kyc_status: e.target.value })}><option value="">Any</option>{['approved', 'edd_required', 'pending', 'rejected'].map(x => <option key={x}>{x}</option>)}</select></div></div>
      <Err e={error} />
      {rows.length ? <table><thead><tr><th>Customer</th><th>Type</th><th>Country</th><th>Risk</th><th>Score</th><th>KYC</th><th>Flags</th><th>Last screened</th><th>Next review</th></tr></thead><tbody>{rows.map(c => <tr key={c.id}><td><Link to={`/customers/${c.id}`}><b>{c.full_name}</b></Link><div className="small muted mono">{c.external_ref}</div></td><td>{c.customer_type}</td><td className="mono">{c.nationality}{c.residence_country && c.residence_country !== c.nationality ? ` / ${c.residence_country}` : ''}</td><td><Pill v={c.risk_level} /></td><td className="mono">{c.risk_score}</td><td><Pill v={c.kyc_status} /></td><td className="small">{[c.is_pep && 'PEP', c.is_rca && 'RCA', c.is_sip && 'SIP', c.adverse_media && 'Adverse media'].filter(Boolean).join(', ') || '—'}</td><td className="small muted">{fmt.ago(c.last_screened_at)}</td><td className="small muted">{fmt.d(c.next_review_at)}</td></tr>)}</tbody></table> : <Empty>No customers match.</Empty>}</div>
  </>;
}

function Onboard({ onDone }) {
  const [f, setF] = useState({ customer_type: 'individual', full_name: '', dob: '', nationality: 'NG', residence_country: 'NG', occupation: '', industry: '', products: '', channel: 'face_to_face', expected_monthly_turnover: '', external_ref: '' });
  const [res, setRes] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(null); try {
    const body = { ...f, products: f.products.split(',').map(s => s.trim()).filter(Boolean), expected_monthly_turnover: f.expected_monthly_turnover ? Number(f.expected_monthly_turnover) : undefined };
    for (const k of Object.keys(body)) if (body[k] === '') delete body[k];
    setRes(await api('/customers', { method: 'POST', body })); } catch (x) { setErr(x); } finally { setBusy(false); } };
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return <div className="card" style={{ marginBottom: 14 }}>
    {!res ? <form className="form" onSubmit={go}><Err e={err} />
      <div className="row row3"><div><label>Customer type</label><select value={f.customer_type} onChange={s('customer_type')}><option value="individual">Individual</option><option value="business">Business</option></select></div><div><label>Full / registered name</label><input value={f.full_name} onChange={s('full_name')} required /></div><div><label>Core-banking reference (CIF)</label><input value={f.external_ref} onChange={s('external_ref')} /></div></div>
      <div className="row row3"><div><label>Date of birth / incorporation</label><input value={f.dob} onChange={s('dob')} placeholder="YYYY-MM-DD" /></div><div><label>Nationality (ISO2)</label><input value={f.nationality} onChange={s('nationality')} maxLength={2} /></div><div><label>Residence country (ISO2)</label><input value={f.residence_country} onChange={s('residence_country')} maxLength={2} /></div></div>
      <div className="row row3"><div><label>Occupation</label><input value={f.occupation} onChange={s('occupation')} /></div><div><label>Industry (business)</label><input value={f.industry} onChange={s('industry')} /></div><div><label>Products (comma separated)</label><input value={f.products} onChange={s('products')} placeholder="savings, international wire" /></div></div>
      <div className="row"><div><label>Onboarding channel</label><select value={f.channel} onChange={s('channel')}>{['face_to_face', 'non_face_to_face', 'agent', 'third_party', 'crypto_exchange'].map(x => <option key={x}>{x}</option>)}</select></div><div><label>Expected monthly turnover (base currency)</label><input type="number" value={f.expected_monthly_turnover} onChange={s('expected_monthly_turnover')} /></div></div>
      <div><button className="primary" disabled={busy}>{busy ? 'Screening & scoring…' : 'Onboard: screen, score and decide'}</button></div></form>
    : <><h2><Pill v={res.risk.level} /> {res.full_name} scored {res.risk.score}/100 {res.risk.edd_required && <span className="muted">· enhanced due diligence required</span>}</h2>
      <div className="grid g2"><div><h3>Risk factors</h3><table><tbody>{res.risk.factors.map((x, i) => <tr key={i}><td>{x.factor}</td><td className="small muted">{x.detail}</td><td className="mono">+{x.points}</td></tr>)}</tbody></table>{!res.risk.factors.length && <p className="muted">No elevating factors.</p>}</div>
        <div><h3>Screening: {res.screening?.outcome?.replace('_', ' ')}</h3>{res.screening?.matches?.length ? res.screening.matches.map(m => <MatchRibbon key={m.entry_id} m={m} />) : <p className="muted">No list matches.</p>}</div></div>
      <div style={{ marginTop: 10 }}><Link to={`/customers/${res.id}`}>Open customer →</Link> · <button className="ghost" onClick={onDone}>Done</button></div></>}
  </div>;
}

export function CustomerDetail() {
  const { id } = useParams(); const { data: c, error, reload } = useFetch(`/customers/${id}`, null, [id]); const [tab, setTab] = useState('risk');
  if (error) return <Err e={error} />; if (!c) return <p className="muted">Loading…</p>;
  const rescreen = async () => { await api(`/customers/${id}`, { method: 'PATCH', body: {} }); reload(); };
  return <>
    <div className="page-head"><div><h1>{c.full_name}</h1><p><span className="mono">{c.external_ref}</span> · {c.customer_type} · {c.nationality}{c.residence_country ? ` / resident ${c.residence_country}` : ''} · onboarded {fmt.d(c.created_at)}</p></div>
      <div><Pill v={c.risk_level} /> <b className="mono">{c.risk_score}</b> <Pill v={c.kyc_status} /> {c.is_pep && <Pill v="PEP">PEP</Pill>} <button onClick={rescreen} style={{ marginLeft: 8 }}>Re-score now</button></div></div>
    <div className="tabs">{['risk', 'screenings', 'transactions', 'alerts'].map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t} {t !== 'risk' && `(${c[t].length})`}</button>)}</div>
    <div className="card">
      {tab === 'risk' && <div className="grid g2"><div><h3>Risk factors</h3><table><tbody>{(c.risk_factors || []).map((x, i) => <tr key={i}><td>{x.factor}</td><td className="small muted">{x.detail}</td><td className="mono">+{x.points}</td></tr>)}</tbody></table>{!(c.risk_factors || []).length && <p className="muted">No elevating factors.</p>}<p className="small muted">Next periodic review: {fmt.d(c.next_review_at)} · Monitoring: {c.monitoring_status}</p></div>
        <div><h3>Profile</h3><table><tbody>{[['Occupation', c.occupation], ['Industry', c.industry], ['Products', (c.products || []).join(', ')], ['Channel', c.channel], ['Expected turnover', c.expected_monthly_turnover && fmt.n(c.expected_monthly_turnover)], ['DOB', c.dob], ['ID', c.id_type && `${c.id_type} ***`]].filter(([, v]) => v).map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td>{v}</td></tr>)}</tbody></table>
          {(c.ubos || []).length > 0 && <><h3 style={{ marginTop: 12 }}>Beneficial owners</h3><table><tbody>{c.ubos.map((u, i) => <tr key={i}><td>{u.name}</td><td className="mono">{u.share ? `${u.share}%` : ''}</td><td>{u.nationality}</td><td>{u.is_pep && <Pill v="PEP">PEP</Pill>}</td></tr>)}</tbody></table></>}</div></div>}
      {tab === 'screenings' && (c.screenings.length ? c.screenings.map(s => <div key={s.id} style={{ marginBottom: 14 }}><div className="small muted">{fmt.dt(s.created_at)} · {s.context} · <Pill v={s.outcome} /> · {s.lists_screened} lists</div>{(s.matches || []).map(m => <MatchRibbon key={m.entry_id} m={m} />)}</div>) : <Empty>No screenings recorded.</Empty>)}
      {tab === 'transactions' && (c.transactions.length ? <table><thead><tr><th>When</th><th>Dir</th><th>Type</th><th>Amount</th><th>Counterparty</th><th>Country</th><th>Decision</th><th>Rules</th></tr></thead><tbody>{c.transactions.map(t => <tr key={t.id}><td className="small muted">{fmt.dt(t.occurred_at)}</td><td>{t.direction}</td><td>{t.tx_type}</td><td className="mono">{fmt.money(t.amount, t.currency)}</td><td>{t.counterparty_name || '—'}</td><td className="mono">{t.counterparty_country || t.destination_country || '—'}</td><td><Pill v={t.status} /></td><td className="small mono">{(t.rule_hits || []).map(h => h.rule_code).join(', ')}</td></tr>)}</tbody></table> : <Empty>No transactions yet.</Empty>)}
      {tab === 'alerts' && (c.alerts.length ? <table><thead><tr><th>Severity</th><th>Type</th><th>Title</th><th>Status</th><th>Raised</th></tr></thead><tbody>{c.alerts.map(a => <tr key={a.id}><td><Pill v={a.severity} /></td><td>{a.alert_type}</td><td><Link to={`/alerts/${a.id}`}>{a.title}</Link></td><td><Pill v={a.status} /></td><td className="small muted">{fmt.ago(a.created_at)}</td></tr>)}</tbody></table> : <Empty>No alerts.</Empty>)}
    </div>
  </>;
}
