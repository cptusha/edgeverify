import React, { useState } from 'react';
import { api, fmt } from '../api.js';
import { Pill, Err, Empty } from '../components/ui.jsx';

export default function BulkScreen() {
  const [names, setNames] = useState('');
  const [threshold, setThreshold] = useState(80);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('input');

  const nameList = names.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  const count = nameList.length;

  const run = async () => {
    if (!count) return;
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      const data = await api('/screen/bulk', { method: 'POST', body: { names: nameList, threshold: Number(threshold) } });
      setRes(data);
      setTab('results');
    } catch (x) { setErr(x); }
    setBusy(false);
  };

  const downloadCsv = async () => {
    const response = await fetch('/v1/screen/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${JSON.parse(localStorage.getItem('ev.session'))?.token}` },
      body: JSON.stringify({ names: nameList, threshold: Number(threshold), format: 'csv' }),
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-screening-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hits = res?.results?.filter(r => r.outcome !== 'clear' && r.outcome !== 'skipped') || [];
  const clear = res?.results?.filter(r => r.outcome === 'clear') || [];
  const skipped = res?.results?.filter(r => r.outcome === 'skipped') || [];

  return <>
    <div className="page-head">
      <div>
        <h1>Bulk screening</h1>
        <p>Screen up to 500 names in a single run across all enabled lists. Results are logged and auditable. Download as CSV for your records.</p>
      </div>
      {res && <button onClick={downloadCsv}>Download CSV</button>}
    </div>

    <div className="tabs">
      <button className={tab === 'input' ? 'active' : ''} onClick={() => setTab('input')}>Names</button>
      {res && <button className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>
        Results ({res.count}) {res.hits > 0 && <span style={{ color: 'var(--critical)', marginLeft: 4 }}>{res.hits} hits</span>}
      </button>}
    </div>

    {tab === 'input' && (
      <div className="grid g2" style={{ gridTemplateColumns: '1fr 320px' }}>
        <div className="card">
          <label>Names to screen <span className="muted small">(one per line, or comma-separated)</span></label>
          <textarea
            rows={18}
            style={{ fontFamily: 'var(--mono)', fontSize: 13, resize: 'vertical', marginTop: 6 }}
            value={names}
            onChange={e => setNames(e.target.value)}
            placeholder={'Dimitri Arkadiev\nAl Hassan Trading Company\nSeun Falana\nEmeka Nwosu\n...'}
            autoFocus
          />
          <Err e={err} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <button className="primary" disabled={busy || !count} onClick={run}>
              {busy ? `Screening ${count} names…` : `Screen ${count || '0'} name${count !== 1 ? 's' : ''}`}
            </button>
            {busy && <span className="small muted">This may take a moment for large batches.</span>}
          </div>
        </div>
        <div className="card">
          <h2>Options</h2>
          <div className="form">
            <div>
              <label>Match threshold: {threshold}%</label>
              <input type="range" min={60} max={100} value={threshold} onChange={e => setThreshold(e.target.value)} />
              <p className="small muted" style={{ marginTop: 4 }}>
                {threshold >= 90 ? 'Very strict — only near-exact matches.' : threshold >= 80 ? 'Recommended — catches name variants and transliterations.' : 'Broad — will include more potential false positives.'}
              </p>
            </div>
          </div>
          <h3 style={{ marginTop: 14 }}>Tips</h3>
          <ul className="small" style={{ paddingLeft: 16, lineHeight: 1.7 }}>
            <li>Paste from Excel or CSV — commas and newlines both work.</li>
            <li>Include dates of birth (e.g. <span className="mono">John Smith 1972-03-15</span>) to reduce false positives.</li>
            <li>Entity names like company or vessel names work alongside person names.</li>
            <li>Results are stored as individual screening records for each name.</li>
            <li>Download as CSV to attach to your CDD file or compliance report.</li>
          </ul>
        </div>
      </div>
    )}

    {tab === 'results' && res && (
      <>
        <div className="grid g4" style={{ marginBottom: 14 }}>
          <div className="card kpi">
            <span className="v">{res.count}</span>
            <span className="l">Names screened</span>
          </div>
          <div className="card kpi">
            <span className="v" style={{ color: hits.length ? 'var(--critical)' : undefined }}>{hits.length}</span>
            <span className="l">Hits (potential or confirmed match)</span>
          </div>
          <div className="card kpi">
            <span className="v">{clear.length}</span>
            <span className="l">Clear</span>
          </div>
          <div className="card kpi">
            <span className="v">{skipped.length}</span>
            <span className="l">Skipped (too short)</span>
          </div>
        </div>

        {hits.length > 0 && (
          <div className="card" style={{ marginBottom: 14, border: '1px solid var(--critical)' }}>
            <h2 style={{ color: 'var(--critical)' }}>Matches requiring review ({hits.length})</h2>
            <table>
              <thead>
                <tr><th>Name queried</th><th>Outcome</th><th>Top score</th><th>Candidates</th><th>Top match</th><th>Screening ID</th></tr>
              </thead>
              <tbody>
                {hits.map((r, i) => (
                  <tr key={i}>
                    <td><b>{r.name}</b></td>
                    <td><Pill v={r.outcome === 'confirmed_match' ? 'critical' : 'high'}>{r.outcome.replace(/_/g, ' ')}</Pill></td>
                    <td className="mono">{r.top_score}%</td>
                    <td className="mono">{r.match_count}</td>
                    <td className="small">{r.top_match || '—'}</td>
                    <td className="mono small muted">{r.screening_id?.slice(0, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card">
          <h2>All results</h2>
          <table>
            <thead>
              <tr><th>Name</th><th>Outcome</th><th>Top score</th><th>Candidates</th><th>Top match</th></tr>
            </thead>
            <tbody>
              {res.results.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td>
                    <Pill v={r.outcome === 'confirmed_match' ? 'critical' : r.outcome === 'potential_match' ? 'high' : r.outcome === 'clear' ? 'low' : 'medium'}>
                      {r.outcome.replace(/_/g, ' ')}
                    </Pill>
                  </td>
                  <td className="mono">{r.top_score > 0 ? `${r.top_score}%` : '—'}</td>
                  <td className="mono">{r.match_count || 0}</td>
                  <td className="small muted">{r.top_match || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button onClick={downloadCsv}>Download CSV</button>
          <button onClick={() => { setTab('input'); setRes(null); }}>Screen another batch</button>
        </div>
      </>
    )}
  </>;
}
