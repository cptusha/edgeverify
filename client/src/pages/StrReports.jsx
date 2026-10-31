import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmt, session } from '../api.js';
import { useFetch, Pill, Err, Empty } from '../components/ui.jsx';

export default function StrReports() {
  const [status, setStatus] = useState('');
  const [showNew, setShowNew] = useState(false);
  const { data, error, reload } = useFetch('/str-reports', { status, limit: 200 }, [status]);
  const me = session.get()?.user;
  const canCreate = ['compliance_officer', 'tenant_admin', 'super_admin'].includes(me?.role);

  return <>
    <div className="page-head">
      <div>
        <h1>STR / CTR Reports</h1>
        <p>Draft, review and file Suspicious Transaction Reports and Currency Transaction Reports. Every action is written to the audit chain.</p>
      </div>
      {canCreate && <button className="primary" onClick={() => setShowNew(s => !s)}>{showNew ? 'Close' : 'New report'}</button>}
    </div>

    {showNew && <NewStrForm onDone={() => { setShowNew(false); reload(); }} />}

    <div className="card">
      <div className="toolbar">
        <div>
          <label>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="under_review">Under review</option>
            <option value="filed">Filed</option>
          </select>
        </div>
      </div>
      <Err e={error} />
      {data?.length
        ? <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Type</th>
                <th>Subject</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Filed with</th>
                <th>Created</th>
                <th>Filed</th>
              </tr>
            </thead>
            <tbody>
              {data.map(r => (
                <tr key={r.id}>
                  <td><Link to={`/str-reports/${r.id}`}><b className="mono">{r.reference}</b></Link></td>
                  <td><Pill v="info">{r.report_type}</Pill></td>
                  <td>{r.subject_name}</td>
                  <td className="mono">{r.amount_reported ? fmt.money(r.amount_reported, r.currency_reported) : '—'}</td>
                  <td><Pill v={r.status === 'filed' ? 'low' : r.status === 'draft' ? 'medium' : 'high'}>{r.status.replace(/_/g, ' ')}</Pill></td>
                  <td className="small">{r.filed_with || '—'}</td>
                  <td className="small muted">{fmt.d(r.created_at)}</td>
                  <td className="small muted">{r.filed_at ? fmt.d(r.filed_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        : <Empty>No reports yet. Create one from an alert investigation or manually from the button above.</Empty>}
    </div>
  </>;
}

function NewStrForm({ onDone }) {
  const [f, setF] = useState({
    report_type: 'STR', subject_name: '', subject_account: '', subject_country: 'NG',
    amount_reported: '', currency_reported: 'NGN',
    activity_from_at: '', activity_to_at: '',
    grounds_for_suspicion: '', nature_of_suspicious_activity: '',
    actions_taken: '', filed_with: 'NFIU',
  });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const s = k => e => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body = { ...f };
      if (body.amount_reported) body.amount_reported = Number(body.amount_reported);
      else delete body.amount_reported;
      if (!body.activity_from_at) delete body.activity_from_at;
      if (!body.activity_to_at) delete body.activity_to_at;
      await api('/str-reports', { method: 'POST', body });
      onDone();
    } catch (x) { setErr(x); setBusy(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h2>New report (draft)</h2>
      <form className="form" onSubmit={submit}>
        <Err e={err} />
        <div className="row">
          <div>
            <label>Report type</label>
            <select value={f.report_type} onChange={s('report_type')}>
              <option value="STR">STR — Suspicious Transaction Report</option>
              <option value="CTR">CTR — Currency Transaction Report</option>
            </select>
          </div>
          <div>
            <label>Filed with (regulator)</label>
            <select value={f.filed_with} onChange={s('filed_with')}>
              <option value="NFIU">NFIU (Nigeria)</option>
              <option value="FinCEN">FinCEN (USA)</option>
              <option value="NCA">NCA (UK)</option>
              <option value="FINTRAC">FINTRAC (Canada)</option>
              <option value="AUSTRAC">AUSTRAC (Australia)</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div className="row row3">
          <div>
            <label>Subject name</label>
            <input value={f.subject_name} onChange={s('subject_name')} required placeholder="Full name or entity name" />
          </div>
          <div>
            <label>Subject account / reference</label>
            <input value={f.subject_account} onChange={s('subject_account')} placeholder="Account number" />
          </div>
          <div>
            <label>Subject country (ISO2)</label>
            <input value={f.subject_country} onChange={s('subject_country')} maxLength={2} />
          </div>
        </div>
        <div className="row row3">
          <div>
            <label>Amount reported</label>
            <input type="number" value={f.amount_reported} onChange={s('amount_reported')} placeholder="0.00" />
          </div>
          <div>
            <label>Currency</label>
            <input value={f.currency_reported} onChange={s('currency_reported')} maxLength={3} />
          </div>
          <div>
            <label>Activity period</label>
            <div className="row" style={{ gap: 6 }}>
              <input type="date" value={f.activity_from_at} onChange={s('activity_from_at')} />
              <input type="date" value={f.activity_to_at} onChange={s('activity_to_at')} />
            </div>
          </div>
        </div>
        <div>
          <label>Grounds for suspicion <span className="muted">(required)</span></label>
          <textarea rows={4} value={f.grounds_for_suspicion} onChange={s('grounds_for_suspicion')} required
            placeholder="Describe clearly why this activity is suspicious and what triggered this report." />
        </div>
        <div>
          <label>Nature of suspicious activity</label>
          <textarea rows={3} value={f.nature_of_suspicious_activity} onChange={s('nature_of_suspicious_activity')}
            placeholder="Describe the transactions or behaviour in detail." />
        </div>
        <div>
          <label>Actions taken by institution</label>
          <textarea rows={2} value={f.actions_taken} onChange={s('actions_taken')}
            placeholder="e.g. Account frozen, customer relationship terminated, enhanced monitoring applied." />
        </div>
        <div>
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save as draft'}</button>
        </div>
      </form>
    </div>
  );
}

export function StrReportDetail() {
  const { id } = useParams();
  const { data: r, error, reload } = useFetch(`/str-reports/${id}`, null, [id]);
  const [f, setF] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const me = session.get()?.user;
  const canEdit = ['compliance_officer', 'tenant_admin', 'super_admin'].includes(me?.role) && r?.status !== 'filed';

  if (error) return <div className="error">{error.message}</div>;
  if (!r) return <p className="muted">Loading…</p>;

  const form = f || r;
  const s = k => e => setF({ ...(f || r), [k]: e.target.value });

  const save = async (newStatus) => {
    setBusy(true);
    setErr(null);
    try {
      const body = f ? { ...f } : {};
      if (newStatus) body.status = newStatus;
      if (body.amount_reported) body.amount_reported = Number(body.amount_reported);
      await api(`/str-reports/${id}`, { method: 'PATCH', body });
      setF(null);
      reload();
    } catch (x) { setErr(x); }
    setBusy(false);
  };

  const filed = r.status === 'filed';

  return <>
    <div className="page-head">
      <div>
        <h1 className="mono">{r.reference}</h1>
        <p>{r.report_type} · <Pill v={filed ? 'low' : 'medium'}>{r.status.replace(/_/g, ' ')}</Pill>
          {' '}· created {fmt.d(r.created_at)}{r.filed_at && ` · filed ${fmt.d(r.filed_at)} with ${r.filed_with}`}</p>
      </div>
      {canEdit && <div style={{ display: 'flex', gap: 8 }}>
        {f && <button className="primary" disabled={busy} onClick={() => save()}>Save changes</button>}
        {r.status !== 'filed' && <button className="teal" disabled={busy} onClick={() => save('filed')}
          title="Mark as filed with the regulator">Mark as filed</button>}
      </div>}
    </div>

    <Err e={err} />

    <div className="grid g2">
      <div className="card">
        <h2>Subject details</h2>
        {canEdit
          ? <div className="form">
              <div className="row">
                <div><label>Subject name</label><input value={form.subject_name || ''} onChange={s('subject_name')} /></div>
                <div><label>Account / reference</label><input value={form.subject_account || ''} onChange={s('subject_account')} /></div>
              </div>
              <div className="row row3">
                <div><label>Country</label><input value={form.subject_country || ''} onChange={s('subject_country')} maxLength={2} /></div>
                <div><label>Amount</label><input type="number" value={form.amount_reported || ''} onChange={s('amount_reported')} /></div>
                <div><label>Currency</label><input value={form.currency_reported || ''} onChange={s('currency_reported')} maxLength={3} /></div>
              </div>
            </div>
          : <table><tbody>
              {[['Subject', r.subject_name], ['Account', r.subject_account], ['Country', r.subject_country],
                ['Amount', r.amount_reported ? fmt.money(r.amount_reported, r.currency_reported) : null],
                ['Activity period', r.activity_from_at ? `${fmt.d(r.activity_from_at)} – ${fmt.d(r.activity_to_at)}` : null]
              ].filter(([, v]) => v).map(([k, v]) => <tr key={k}><td className="muted" style={{ width: 130 }}>{k}</td><td>{v}</td></tr>)}
            </tbody></table>}

        {r.customer && <><h3 style={{ marginTop: 14 }}>Linked customer</h3>
          <p className="small"><Link to={`/customers/${r.customer.id}`}>{r.customer.full_name}</Link> · <Pill v={r.customer.risk_level} /> {r.customer.risk_score}</p></>}

        {r.regulator_ref && <p className="small" style={{ marginTop: 10 }}><b>Regulator reference:</b> <span className="mono">{r.regulator_ref}</span></p>}
        {canEdit && <div style={{ marginTop: 10 }}><label>Regulator reference (assigned after filing)</label><input value={form.regulator_ref || ''} onChange={s('regulator_ref')} placeholder="Reference number from regulator" /></div>}
      </div>

      <div className="card">
        <h2>Narrative</h2>
        {canEdit
          ? <div className="form">
              <div><label>Grounds for suspicion</label>
                <textarea rows={5} value={form.grounds_for_suspicion || ''} onChange={s('grounds_for_suspicion')} /></div>
              <div><label>Nature of activity</label>
                <textarea rows={4} value={form.nature_of_suspicious_activity || ''} onChange={s('nature_of_suspicious_activity')} /></div>
              <div><label>Actions taken</label>
                <textarea rows={3} value={form.actions_taken || ''} onChange={s('actions_taken')} /></div>
            </div>
          : <>
              <h3>Grounds for suspicion</h3><p style={{ whiteSpace: 'pre-wrap' }}>{r.grounds_for_suspicion}</p>
              {r.nature_of_suspicious_activity && <><h3 style={{ marginTop: 12 }}>Nature of activity</h3><p style={{ whiteSpace: 'pre-wrap' }}>{r.nature_of_suspicious_activity}</p></>}
              {r.actions_taken && <><h3 style={{ marginTop: 12 }}>Actions taken</h3><p style={{ whiteSpace: 'pre-wrap' }}>{r.actions_taken}</p></>}
            </>}
      </div>
    </div>

    {(r.alerts?.length > 0 || r.transactions?.length > 0) && (
      <div className="grid g2" style={{ marginTop: 14 }}>
        {r.alerts?.length > 0 && <div className="card">
          <h2>Linked alerts</h2>
          <table><tbody>{r.alerts.map(a => <tr key={a.id}><td><Pill v={a.severity} /></td>
            <td><Link to={`/alerts/${a.id}`}>{a.title}</Link></td><td className="small muted">{fmt.ago(a.created_at)}</td></tr>)}</tbody></table>
        </div>}
        {r.transactions?.length > 0 && <div className="card">
          <h2>Linked transactions</h2>
          <table><thead><tr><th>When</th><th>Amount</th><th>Direction</th><th>Decision</th></tr></thead>
            <tbody>{r.transactions.map(t => <tr key={t.id}><td className="small muted">{fmt.dt(t.occurred_at)}</td>
              <td className="mono">{fmt.money(t.amount, t.currency)}</td><td>{t.direction}</td><td><Pill v={t.status} /></td></tr>)}</tbody></table>
        </div>}
      </div>
    )}
  </>;
}
