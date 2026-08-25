import React, { useState } from 'react';
import { api, fmt } from '../api.js';
import { useFetch, Err, Empty, Pill } from '../components/ui.jsx';
export default function Audit() {
  const [f, setF] = useState({ action: '', resource_type: '' }); const { data, error } = useFetch('/admin/audit', { ...f, limit: 300 }, [f.action, f.resource_type]); const [v, setV] = useState(null); const [open, setOpen] = useState(null);
  const verify = async () => setV(await api('/admin/audit/verify'));
  return <>
    <div className="page-head"><div><h1>Audit log</h1><p>Append-only and hash-chained: each entry commits to the one before it, so any edit or deletion is detectable.</p></div><button className="primary" onClick={verify}>Verify chain integrity</button></div>
    {v && <div className={v.intact ? 'notice' : 'error'}>{v.intact ? `Chain intact — ${v.entries} entries verified.` : `Chain broken at sequence ${v.broken_at.join(', ')}.`}</div>}
    <div className="card"><div className="toolbar"><div><label>Action contains</label><input value={f.action} onChange={e => setF({ ...f, action: e.target.value })} placeholder="alert.transition" /></div><div><label>Resource</label><select value={f.resource_type} onChange={e => setF({ ...f, resource_type: e.target.value })}><option value="">Any</option>{['screening', 'customer', 'alert', 'rule', 'list_source', 'tenant', 'user', 'http'].map(x => <option key={x}>{x}</option>)}</select></div></div><Err e={error} />
      {data?.length ? <table><thead><tr><th>#</th><th>When</th><th>Actor</th><th>Action</th><th>Resource</th><th>Hash</th></tr></thead><tbody>{data.map(r => <React.Fragment key={r.seq}><tr className="clickable" onClick={() => setOpen(open === r.seq ? null : r.seq)}><td className="mono muted">{r.seq}</td><td className="small">{fmt.dt(r.at)}</td><td className="small"><Pill v="info">{r.actor_type}</Pill> <span className="mono">{String(r.actor_id).slice(0, 8)}</span></td><td className="mono">{r.action}</td><td className="small">{r.resource_type} <span className="mono muted">{r.resource_id?.slice(0, 12)}</span></td><td className="mono small muted">{r.hash.slice(0, 12)}…</td></tr>{open === r.seq && <tr><td colSpan={6}><pre>{JSON.stringify({ before: r.before, after: r.after, ip: r.ip, prev_hash: r.prev_hash, hash: r.hash }, null, 2)}</pre></td></tr>}</React.Fragment>)}</tbody></table> : <Empty>No audit entries.</Empty>}</div>
  </>;
}
