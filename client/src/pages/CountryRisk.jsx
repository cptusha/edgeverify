import React, { useState } from 'react';
import { api, fmt } from '../api.js';
import { useFetch, Pill, Err, Empty, Kpi } from '../components/ui.jsx';
import { session } from '../api.js';

const BAND_ORDER = ['high', 'medium', 'low'];

function BandPill({ band }) {
  return <span className={`pill ${band === 'high' ? 'critical' : band === 'medium' ? 'high' : 'low'}`}>{band}</span>;
}

function ScoreBar({ score }) {
  const color = score >= 70 ? 'var(--critical)' : score >= 40 ? 'var(--high)' : 'var(--low)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <span className="mono" style={{ minWidth: 28, fontSize: 12, color: 'var(--ink-3)' }}>{score}</span>
    </div>
  );
}

export default function CountryRisk() {
  const me = session.get()?.user;
  const canEdit = ['tenant_admin', 'super_admin'].includes(me?.role);
  const [f, setF] = useState({ q: '', band: '', fatf: '' });
  const [editing, setEditing] = useState(null); // iso2 being edited
  const [editVals, setEditVals] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const params = {};
  if (f.band) params.band = f.band;
  if (f.fatf === 'blacklist') params.fatf_blacklist = 'true';
  if (f.fatf === 'greylist') params.fatf_greylist = 'true';
  if (f.q) params.q = f.q;

  const { data, error, reload } = useFetch('/country-risk', params, [f.band, f.fatf]);
  const stats = useFetch('/country-risk/stats');

  const countries = (data || []).filter(c =>
    !f.q || c.name?.toLowerCase().includes(f.q.toLowerCase()) || c.iso2?.toLowerCase().startsWith(f.q.toLowerCase())
  );

  const startEdit = (c) => {
    setEditing(c.iso2);
    setEditVals({ score: c.score, fatf_blacklist: c.fatf_blacklist, fatf_greylist: c.fatf_greylist, eu_high_risk: c.eu_high_risk });
    setSaveErr(null);
  };

  const saveEdit = async (iso2) => {
    setSaving(true);
    setSaveErr(null);
    try {
      const body = { score: Number(editVals.score), fatf_blacklist: !!editVals.fatf_blacklist, fatf_greylist: !!editVals.fatf_greylist, eu_high_risk: !!editVals.eu_high_risk };
      await api(`/country-risk/${iso2}`, { method: 'PATCH', body });
      setMsg(`${iso2} updated.`);
      setEditing(null);
      reload();
    } catch (x) { setSaveErr(x); }
    setSaving(false);
  };

  const s = stats.data;

  return <>
    <div className="page-head">
      <div>
        <h1>Country risk</h1>
        <p>FATF-aligned risk scores for every jurisdiction. Tenant admins can override individual scores to match your institution's own risk appetite.</p>
      </div>
    </div>

    {s && (
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Kpi v={fmt.n(s.total)} l="Jurisdictions tracked" />
        <Kpi v={fmt.n(s.by_band?.find(b => b.band === 'high')?.n || 0)} l="High-risk jurisdictions" />
        <Kpi v={fmt.n(s.fatf_blacklist)} l="FATF blacklisted" sub={<span className="muted small">Monitored jurisdictions (immediate action)</span>} />
        <Kpi v={fmt.n(s.fatf_greylist)} l="FATF greylisted" sub={<span className="muted small">Jurisdictions under increased monitoring</span>} />
      </div>
    )}

    {msg && <div className="notice">{msg} <button className="ghost" style={{ padding: '2px 6px', fontSize: 12 }} onClick={() => setMsg(null)}>×</button></div>}

    <div className="card">
      <div className="toolbar">
        <div>
          <label>Search</label>
          <input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="Country name or code" />
        </div>
        <div>
          <label>Risk band</label>
          <select value={f.band} onChange={e => setF({ ...f, band: e.target.value })}>
            <option value="">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label>FATF status</label>
          <select value={f.fatf} onChange={e => setF({ ...f, fatf: e.target.value })}>
            <option value="">All</option>
            <option value="blacklist">Blacklisted</option>
            <option value="greylist">Greylisted</option>
          </select>
        </div>
        <span className="small muted" style={{ alignSelf: 'center' }}>{countries.length} countries</span>
      </div>
      <Err e={error} />
      <Err e={saveErr} />

      {countries.length ? (
        <table>
          <thead>
            <tr>
              <th>Country</th>
              <th>ISO2</th>
              <th>Band</th>
              <th style={{ minWidth: 160 }}>Score (0–100)</th>
              <th>FATF blacklist</th>
              <th>FATF greylist</th>
              <th>EU high risk</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {countries.map(c => {
              const isEditing = editing === c.iso2;
              return (
                <tr key={c.iso2}>
                  <td><b>{c.name}</b></td>
                  <td className="mono">{c.iso2}</td>
                  <td>
                    {isEditing
                      ? <select value={editVals.score >= 70 ? 'high' : editVals.score >= 40 ? 'medium' : 'low'}
                          onChange={e => setEditVals({ ...editVals, score: e.target.value === 'high' ? 75 : e.target.value === 'medium' ? 50 : 20 })}
                          style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}>
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                      : <BandPill band={c.band} />}
                  </td>
                  <td>
                    {isEditing
                      ? <input type="number" min={0} max={100} value={editVals.score}
                          onChange={e => setEditVals({ ...editVals, score: Number(e.target.value) })}
                          style={{ width: 72, padding: '4px 8px', fontSize: 12 }} />
                      : <ScoreBar score={c.score} />}
                  </td>
                  <td>
                    {isEditing
                      ? <input type="checkbox" checked={!!editVals.fatf_blacklist} onChange={e => setEditVals({ ...editVals, fatf_blacklist: e.target.checked })} style={{ width: 'auto' }} />
                      : c.fatf_blacklist ? <span style={{ color: 'var(--critical)' }}>Yes</span> : <span className="muted">—</span>}
                  </td>
                  <td>
                    {isEditing
                      ? <input type="checkbox" checked={!!editVals.fatf_greylist} onChange={e => setEditVals({ ...editVals, fatf_greylist: e.target.checked })} style={{ width: 'auto' }} />
                      : c.fatf_greylist ? <span style={{ color: 'var(--high)' }}>Yes</span> : <span className="muted">—</span>}
                  </td>
                  <td>
                    {isEditing
                      ? <input type="checkbox" checked={!!editVals.eu_high_risk} onChange={e => setEditVals({ ...editVals, eu_high_risk: e.target.checked })} style={{ width: 'auto' }} />
                      : c.eu_high_risk ? <span style={{ color: 'var(--high)' }}>Yes</span> : <span className="muted">—</span>}
                  </td>
                  {canEdit && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {isEditing
                        ? <>
                            <button className="teal" disabled={saving} onClick={() => saveEdit(c.iso2)} style={{ marginRight: 4 }}>
                              {saving ? '…' : 'Save'}
                            </button>
                            <button onClick={() => setEditing(null)}>Cancel</button>
                          </>
                        : <button onClick={() => startEdit(c)}>Edit</button>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <Empty>No countries match the current filters.</Empty>}
    </div>

    <div className="card" style={{ marginTop: 14 }}>
      <h2>How risk scores are used</h2>
      <div className="grid g3">
        <div>
          <h3>Customer risk scoring</h3>
          <p className="small">A customer's nationality and residence country scores feed directly into their overall risk score. Nationals of high-risk jurisdictions receive an elevated baseline, with additional weight for FATF blacklisted countries.</p>
        </div>
        <div>
          <h3>Transaction monitoring</h3>
          <p className="small">Transaction rules evaluate counterparty and destination country scores. The built-in HIGH_RISK_JURISDICTION rule raises an alert on any payment to a country scoring 70 or above.</p>
        </div>
        <div>
          <h3>Overriding defaults</h3>
          <p className="small">Scores are seeded from FATF's published risk guidance. Tenant admins can override individual scores — for example, applying a higher score to a jurisdiction you have direct experience with, or lowering one for a country where your institution has a local branch and enhanced monitoring in place.</p>
        </div>
      </div>
    </div>
  </>;
}
