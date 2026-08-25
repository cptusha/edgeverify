import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api.js';
import { useFetch, Pill, Err, Empty, Decision } from '../components/ui.jsx';

export default function Transactions() {
  const [status, setStatus] = useState(''); const { data, error, reload } = useFetch('/transactions', { status, limit: 200 }, [status]); const [show, setShow] = useState(false);
  return <>
    <div className="page-head"><div><h1>Transactions</h1><p>Every transaction your core banking system sends is decided in real time: accept, review (hold) or reject (block).</p></div><button className="primary" onClick={() => setShow(s => !s)}>{show ? 'Close' : 'Simulate a transaction'}</button></div>
    {show && <Simulator onDone={reload} />}
    <div className="card"><div className="toolbar"><div><label>Decision</label><select value={status} onChange={e => setStatus(e.target.value)}><option value="">All</option>{['cleared', 'flagged', 'held', 'blocked'].map(x => <option key={x}>{x}</option>)}</select></div></div><Err e={error} />
      {data?.length ? <table><thead><tr><th>When</th><th>Customer</th><th>Dir</th><th>Type</th><th>Amount</th><th>Counterparty</th><th>Country</th><th>Channel</th><th>Decision</th><th>Score</th><th>Rules</th><th>ms</th></tr></thead><tbody>{data.map(t => <tr key={t.id}><td className="small muted">{fmt.dt(t.occurred_at)}</td><td className="small">{t.customer_id ? <Link to={`/customers/${t.customer_id}`}>{t.customer_id.slice(0, 8)}</Link> : <span className="muted">unlinked</span>}</td><td>{t.direction}</td><td>{t.tx_type}</td><td className="mono">{fmt.money(t.amount, t.currency)}</td><td>{t.counterparty_name || '—'}</td><td className="mono">{t.counterparty_country || t.destination_country || '—'}</td><td className="small">{t.channel}</td><td><Pill v={t.status} /></td><td className="mono">{t.risk_score}</td><td className="small mono">{(t.rule_hits || []).map(h => h.rule_code).join(', ')}</td><td className="mono muted">{t.latency_ms}</td></tr>)}</tbody></table> : <Empty>No transactions.</Empty>}</div>
  </>;
}

function Simulator({ onDone }) {
  const { data: customers } = useFetch('/customers', { limit: 200 });
  const [f, setF] = useState({ customer_id: '', direction: 'debit', tx_type: 'wire', amount: 25000, currency: 'USD', counterparty_name: '', counterparty_account: '', counterparty_country: '', destination_country: '', channel: 'swift', device_id: '', dry_run: true });
  const [res, setRes] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const s = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { const body = { ...f, amount: Number(f.amount) }; for (const k of Object.keys(body)) if (body[k] === '') delete body[k]; setRes(await api('/transactions', { method: 'POST', body })); if (!f.dry_run) onDone(); } catch (x) { setErr(x); } finally { setBusy(false); } };
  return <div className="card" style={{ marginBottom: 14 }}><form className="form" onSubmit={go}><Err e={err} />
    <div className="row row3"><div><label>Customer</label><select value={f.customer_id} onChange={s('customer_id')}><option value="">— unlinked —</option>{(customers || []).map(c => <option key={c.id} value={c.id}>{c.full_name} ({c.risk_level})</option>)}</select></div><div><label>Direction</label><select value={f.direction} onChange={s('direction')}><option value="debit">Debit (outbound)</option><option value="credit">Credit (inbound)</option></select></div><div><label>Type</label><select value={f.tx_type} onChange={s('tx_type')}>{['wire', 'cash', 'transfer', 'card', 'crypto', 'cheque', 'mobile_money'].map(x => <option key={x}>{x}</option>)}</select></div></div>
    <div className="row row3"><div><label>Amount</label><input type="number" value={f.amount} onChange={s('amount')} /></div><div><label>Currency</label><input value={f.currency} onChange={s('currency')} maxLength={3} /></div><div><label>Channel</label><input value={f.channel} onChange={s('channel')} /></div></div>
    <div className="row row3"><div><label>Counterparty name (screened in real time)</label><input value={f.counterparty_name} onChange={s('counterparty_name')} placeholder="try: Al Hassan Trading Company" /></div><div><label>Counterparty account</label><input value={f.counterparty_account} onChange={s('counterparty_account')} /></div><div><label>Counterparty country / destination</label><div className="row"><input value={f.counterparty_country} onChange={s('counterparty_country')} placeholder="AE" maxLength={2} /><input value={f.destination_country} onChange={s('destination_country')} placeholder="IR" maxLength={2} /></div></div></div>
    <div className="row"><div><label>Device ID</label><input value={f.device_id} onChange={s('device_id')} placeholder="new-device-123" /></div><div style={{ display: 'flex', alignItems: 'end', gap: 12 }}><label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}><input type="checkbox" checked={f.dry_run} onChange={s('dry_run')} style={{ width: 'auto' }} /> Dry run (evaluate only, don't post)</label><button className="primary" disabled={busy}>{busy ? 'Deciding…' : 'Send for decision'}</button></div></div>
  </form>{res && <div style={{ marginTop: 14 }}><Decision r={res} /></div>}</div>;
}
