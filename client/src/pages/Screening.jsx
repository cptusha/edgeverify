import React, { useState } from 'react';
import { api, fmt } from '../api.js';
import { MatchRibbon, Pill, Err, Empty, useFetch } from '../components/ui.jsx';

export default function Screening() {
  const [tab, setTab] = useState('screen');
  return <>
    <div className="page-head"><div><h1>Screen a name</h1><p>One query across every enabled sanctions, PEP, watch and wanted list. Results are recorded and auditable.</p></div></div>
    <div className="tabs"><button className={tab === 'screen' ? 'active' : ''} onClick={() => setTab('screen')}>Screening</button><button className={tab === 'profiles' ? 'active' : ''} onClick={() => setTab('profiles')}>Profile search</button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Recent screenings</button></div>
    {tab === 'screen' && <ScreenForm />}{tab === 'profiles' && <ProfileSearch />}{tab === 'history' && <History />}
  </>;
}

function ScreenForm() {
  const [q, setQ] = useState({ name: '', dob: '', nationality: '', entityType: '', context: 'adhoc', threshold: 80 });
  const [res, setRes] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const run = async (e) => { e.preventDefault(); setBusy(true); setErr(null); setRes(null);
    try { const body = Object.fromEntries(Object.entries(q).filter(([, v]) => v !== '')); body.threshold = Number(body.threshold); setRes(await api('/screen', { method: 'POST', body })); } catch (x) { setErr(x); } finally { setBusy(false); } };
  return <div className="grid g2" style={{ gridTemplateColumns: '380px 1fr' }}>
    <form className="card form" onSubmit={run}>
      <div><label>Full name or entity name</label><input value={q.name} onChange={e => setQ({ ...q, name: e.target.value })} placeholder="e.g. Dimitri Arkadiev" autoFocus required /></div>
      <div className="row"><div><label>Date of birth (optional)</label><input value={q.dob} onChange={e => setQ({ ...q, dob: e.target.value })} placeholder="1968 or 1968-04-12" /></div><div><label>Nationality (ISO2)</label><input value={q.nationality} onChange={e => setQ({ ...q, nationality: e.target.value.toUpperCase() })} placeholder="RU" maxLength={2} /></div></div>
      <div className="row"><div><label>Entity type</label><select value={q.entityType} onChange={e => setQ({ ...q, entityType: e.target.value })}><option value="">Any</option><option value="person">Person</option><option value="organisation">Organisation</option><option value="vessel">Vessel</option></select></div>
        <div><label>Match threshold: {q.threshold}%</label><input type="range" min={60} max={100} value={q.threshold} onChange={e => setQ({ ...q, threshold: e.target.value })} /></div></div>
      <div><label>Context</label><select value={q.context} onChange={e => setQ({ ...q, context: e.target.value })}><option value="adhoc">Ad-hoc check</option><option value="onboarding">Onboarding</option><option value="ongoing">Ongoing monitoring</option><option value="transaction">Transaction</option></select></div>
      <button className="primary" disabled={busy || q.name.length < 2}>{busy ? 'Screening…' : 'Screen now'}</button>
      <p className="small muted" style={{ margin: 0 }}>Matching uses token alignment, phonetics (Double Metaphone), transliteration-tolerant normalisation, and DOB / nationality corroboration. Lower the threshold to widen the net.</p>
    </form>
    <div className="card"><Err e={err} />
      {!res && !err && <Empty>Enter a name to screen. Try <b>Dimitri Arkadiev</b>, <b>Al Hassan Trading</b>, <b>Seun Falana</b> or <b>Emeka Nwosu</b> against the demo lists.</Empty>}
      {res && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><h2><Pill v={res.outcome} /> {res.match_count} candidate{res.match_count === 1 ? '' : 's'} for “{res.query_name}”</h2><span className="small muted">{res.lists_screened} lists · {res.duration_ms} ms · ref <span className="mono">{res.id.slice(0, 8)}</span></span></div>
        {res.matches.length ? res.matches.map(m => <MatchRibbon key={m.entry_id} m={m} />) : <p className="muted">No matches at or above {res.query.threshold || 80}%. This screening is logged as <b>clear</b>.</p>}
      </>}
    </div>
  </div>;
}

function ProfileSearch() {
  const [q, setQ] = useState(''); const [type, setType] = useState(''); const [rows, setRows] = useState(null); const [err, setErr] = useState(null);
  const run = async (e) => { e?.preventDefault(); try { setRows(await api('/lists/entries', { params: { q, list_type: type, limit: 100 } })); } catch (x) { setErr(x); } };
  return <div className="card"><form className="toolbar" onSubmit={run}><div><label>Name contains</label><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search listed profiles" /></div><div><label>List type</label><select value={type} onChange={e => setType(e.target.value)}><option value="">All</option><option>Sanction</option><option>PEP</option><option>Watchlist</option><option>Wanted</option></select></div><button className="primary">Search</button></form><Err e={err} />
    {rows && (rows.length ? <table><thead><tr><th>Name</th><th>Type</th><th>List</th><th>Aliases</th><th>DOB</th><th>Nationality</th><th>Programs / role</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td><b>{r.primary_name}</b><div className="small muted">{r.entity_type}</div></td><td><Pill v={r.list_type} /></td><td className="small">{r.list_name}</td><td className="small">{r.aliases.join(', ') || '—'}</td><td className="mono">{r.dobs.join(', ') || '—'}</td><td className="mono">{r.nationalities.join(', ') || '—'}</td><td className="small">{r.pep_role || r.programs.join(', ')}{r.rca_of && <div className="muted">RCA of {r.rca_of}</div>}</td></tr>)}</tbody></table> : <Empty>No listed profiles match.</Empty>)}
    {!rows && <Empty>Browse the underlying list data directly — useful when investigating a hit.</Empty>}</div>;
}

function History() {
  const { data, error } = useFetch('/screen', { limit: 100 });
  if (error) return <Err e={error} />; if (!data) return null;
  return <div className="card">{data.length ? <table><thead><tr><th>When</th><th>Query</th><th>Context</th><th>Outcome</th><th>Top score</th><th>Candidates</th><th>Lists</th></tr></thead><tbody>{data.map(s => <tr key={s.id}><td className="small muted">{fmt.dt(s.created_at)}</td><td><b>{s.query_name}</b></td><td>{s.context}</td><td><Pill v={s.outcome} /></td><td className="mono">{s.top_score}</td><td>{s.match_count}</td><td>{s.lists_screened}</td></tr>)}</tbody></table> : <Empty>No screenings yet.</Empty>}</div>;
}
