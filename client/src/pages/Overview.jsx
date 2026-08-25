import React from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fmt } from '../api.js';
import { useFetch, Kpi, Bars, Pill, Err } from '../components/ui.jsx';

export default function Overview() {
  const o = useFetch('/dashboards/overview'); const m = useFetch('/dashboards/monitoring'); const w = useFetch('/dashboards/workload'); const c = useFetch('/dashboards/coverage');
  if (o.error) return <Err e={o.error} />; if (!o.data) return <p className="muted">Loading…</p>;
  const d = o.data; const sev = Object.fromEntries(d.alerts_by_severity.map(x => [x.severity, Number(x.n)]));
  return <>
    <div className="page-head"><div><h1>Overview</h1><p>What needs a human today, and how the controls are performing.</p></div></div>
    <div className="grid g4">
      <Kpi v={fmt.n(d.open_alerts)} l="Open alerts" sub={<><Pill v="critical">{sev.critical || 0} critical</Pill> <Pill v="high">{sev.high || 0} high</Pill></>} />
      <Kpi v={fmt.n(d.sla_breached)} l="Alerts past SLA" sub={d.sla_breached ? <span style={{ color: 'var(--critical)' }}>Needs attention</span> : <span className="muted">All within SLA</span>} />
      <Kpi v={fmt.n(d.transactions_24h.count)} l="Transactions monitored, 24h" sub={<span className="muted">{fmt.money(d.transactions_24h.volume_base, 'USD eq.')}</span>} />
      <Kpi v={fmt.n(d.customers)} l="Customers under monitoring" sub={<span className="muted">{w.data ? `${w.data.kyc_reviews_due_30d} KYC reviews due in 30d` : ''}</span>} />
    </div>
    <div className="grid g2" style={{ marginTop: 14 }}>
      <div className="card"><h2>Alerts per day, last 30 days</h2>
        {m.data && m.data.alerts_by_day.length ? <ResponsiveContainer width="100%" height={200}><LineChart data={m.data.alerts_by_day}><CartesianGrid stroke="#EEF1F4" /><XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={v => v.slice(5)} /><YAxis tick={{ fontSize: 11 }} width={28} /><Tooltip /><Line type="monotone" dataKey="total" stroke="#0E7C7B" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="critical" stroke="#C8322B" strokeWidth={1.5} dot={false} /></LineChart></ResponsiveContainer> : <p className="muted">No alerts in the last 30 days.</p>}
        <div className="small muted" style={{ marginTop: 6 }}>Real-time decision latency (7d): avg {m.data?.latency_ms.avg ?? '—'} ms · max {m.data?.latency_ms.max ?? '—'} ms</div></div>
      <div className="card"><h2>Customer risk distribution</h2><Bars items={d.customers_by_risk} labelKey="risk_level" valueKey="n" />
        <h2 style={{ marginTop: 16 }}>Transactions by decision, 30d</h2><Bars items={d.transactions_30d_by_status} labelKey="status" valueKey="n" /></div>
    </div>
    <div className="grid g3" style={{ marginTop: 14 }}>
      <div className="card"><h2>Rule effectiveness</h2>{m.data?.rule_effectiveness.length ? <table><thead><tr><th>Rule</th><th>Alerts</th><th>Precision</th></tr></thead><tbody>{m.data.rule_effectiveness.slice(0, 8).map(r => <tr key={r.rule_code}><td className="mono">{r.rule_code}</td><td>{r.alerts}</td><td>{r.precision === null ? <span className="muted">no outcomes yet</span> : `${r.precision}%`}</td></tr>)}</tbody></table> : <p className="muted">Precision appears once analysts close alerts as true/false positives.</p>}</div>
      <div className="card"><h2>Oldest open alerts</h2>{w.data?.oldest_open.length ? <table><tbody>{w.data.oldest_open.slice(0, 7).map(a => <tr key={a.id}><td><Pill v={a.severity} /></td><td><Link to={`/alerts/${a.id}`}>{a.title?.slice(0, 48)}</Link></td><td className="muted small">{fmt.ago(a.created_at)}</td></tr>)}</tbody></table> : <p className="muted">Queue is clear.</p>}</div>
      <div className="card"><h2>List coverage</h2>{c.data && <><div className="kpi"><span className="v">{c.data.enabled}</span><span className="l">lists enabled · {fmt.n(c.data.entries)} listed profiles</span></div>
        <Bars items={c.data.by_region} labelKey="region" valueKey="sources" />
        {c.data.stale.length > 0 && <div className="small" style={{ marginTop: 8, color: 'var(--high)' }}>{c.data.stale.length} enabled list(s) have not refreshed on schedule.</div>}<div className="small" style={{ marginTop: 8 }}><Link to="/lists">Manage registry →</Link></div></>}</div>
    </div>
  </>;
}
