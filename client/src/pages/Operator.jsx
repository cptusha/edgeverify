/**
 * SETS Operator Console — super_admin only.
 *
 * Tabs:
 *  Overview   — global KPI summary + plan distribution
 *  Tenants    — table of all tenants; click to open detail drawer
 *  Audit log  — platform-wide audit stream, filterable by tenant/action
 *  Notices    — broadcast messages to all clients or a specific plan tier
 */

import React, { useState, useEffect } from 'react';
import { api, fmt, session } from '../api.js';
import { useFetch, Pill, Err, Empty, Kpi } from '../components/ui.jsx';

/* ══════════════════════════════════════════════════════════════
   Shared helpers
══════════════════════════════════════════════════════════════ */

function PlanPill({ plan }) {
  const v = plan === 'startup' ? 'low' : plan === 'growth' ? 'high' : plan === 'enterprise' ? 'critical' : 'medium';
  return <span className={`pill ${v}`}>{plan || 'unknown'}</span>;
}

function LevelPill({ level }) {
  const v = level === 'critical' ? 'critical' : level === 'warning' ? 'high' : 'info';
  return <span className={`pill ${v}`}>{level}</span>;
}

/* ══════════════════════════════════════════════════════════════
   Overview tab
══════════════════════════════════════════════════════════════ */

function Overview() {
  const { data: stats } = useFetch('/operator/stats');
  const s = stats;
  if (!s) return <p className="muted">Loading…</p>;
  const planOrder = ['startup', 'growth', 'enterprise', 'custom'];
  const sorted = [...(s.by_plan || [])].sort((a, b) => planOrder.indexOf(a.plan) - planOrder.indexOf(b.plan));
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <Kpi v={fmt.n(s.tenants)} l="Total tenants" />
        <Kpi v={fmt.n(s.users)} l="Total users" />
        <Kpi v={fmt.n(s.screenings)} l="Total screenings" />
        <Kpi v={fmt.n(s.screenings_30d)} l="Screenings (last 30 days)" />
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>Tenants by plan</h2>
          <div className="bars" style={{ marginTop: 12 }}>
            {sorted.map(p => {
              const pct = s.tenants ? Math.round(100 * p.n / s.tenants) : 0;
              const cls = p.plan === 'startup' ? 'low' : p.plan === 'growth' ? 'high' : p.plan === 'enterprise' ? 'critical' : 'medium';
              return (
                <div className="b" key={p.plan}>
                  <span style={{ textTransform: 'capitalize' }}>{p.plan}</span>
                  <i className={cls} style={{ width: `${pct}%` }} />
                  <span>{p.n}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h2>Platform health</h2>
          <table><tbody>
            {[
              ['Active tenants', fmt.n(s.tenants)],
              ['Registered users', fmt.n(s.users)],
              ['All-time screenings', fmt.n(s.screenings)],
              ['Open alerts', fmt.n(s.alerts)],
              ['Screenings this month', fmt.n(s.screenings_30d)],
            ].map(([k, v]) => <tr key={k}><td className="muted" style={{ width: 200 }}>{k}</td><td><b>{v}</b></td></tr>)}
          </tbody></table>
        </div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   Tenant detail drawer
══════════════════════════════════════════════════════════════ */

function TenantDrawer({ tenantId, onClose }) {
  const { data, error, reload } = useFetch(`/operator/tenants/${tenantId}`, null, [tenantId]);
  const { data: usage } = useFetch(`/operator/tenants/${tenantId}/usage`, null, [tenantId]);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [impErr, setImpErr] = useState(null);
  const [addUser, setAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'analyst', password: '' });

  useEffect(() => {
    if (data) setF({ name: data.name, plan: data.plan, notes: data.settings?.operator_notes || '' });
  }, [data]);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api(`/operator/tenants/${tenantId}`, { method: 'PATCH', body: f });
      setEditing(false); reload();
    } catch (x) { setErr(x); }
    setBusy(false);
  };

  const toggleActive = async () => {
    if (!data) return;
    const confirmed = window.confirm(`${data.active !== false ? 'Deactivate' : 'Reactivate'} tenant "${data.name}"?`);
    if (!confirmed) return;
    await api(`/operator/tenants/${tenantId}`, { method: 'PATCH', body: { active: data.active === false } });
    reload();
  };

  const impersonate = async () => {
    setImpersonating(true); setImpErr(null);
    try {
      const r = await api(`/operator/impersonate/${tenantId}`, { method: 'POST' });
      // Open the app in a new tab with the impersonation token pre-loaded
      const payload = { token: r.token, user: r.user };
      const encoded = btoa(JSON.stringify(payload));
      window.open(`/impersonate?session=${encoded}`, '_blank');
    } catch (x) { setImpErr(x); }
    setImpersonating(false);
  };

  const createUser = async e => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api(`/operator/tenants/${tenantId}/users`, { method: 'POST', body: newUser });
      setAddUser(false); setNewUser({ name: '', email: '', role: 'analyst', password: '' }); reload();
    } catch (x) { setErr(x); }
    setBusy(false);
  };

  if (error) return (
    <div className="op-drawer">
      <div className="op-drawer-head"><button onClick={onClose}>← Back</button></div>
      <Err e={error} />
    </div>
  );
  if (!data) return <div className="op-drawer"><p className="muted">Loading…</p></div>;

  const settings = data.settings || {};

  return (
    <div className="op-drawer">
      <div className="op-drawer-head">
        <button onClick={onClose}>← All tenants</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={impersonate} className="teal" disabled={impersonating}>{impersonating ? 'Opening…' : 'View as tenant'}</button>
          <button onClick={toggleActive}>{data.active === false ? 'Reactivate' : 'Deactivate'}</button>
        </div>
      </div>

      {impErr && <Err e={impErr} />}
      <Err e={err} />

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <h2>Tenant details</h2>
            {!editing
              ? <button onClick={() => setEditing(true)}>Edit</button>
              : <div style={{ display: 'flex', gap: 6 }}>
                  <button className="primary" disabled={busy} onClick={save}>Save</button>
                  <button onClick={() => setEditing(false)}>Cancel</button>
                </div>}
          </div>
          {editing
            ? <div className="form">
                <div><label>Tenant name</label><input value={f.name || ''} onChange={e => setF({ ...f, name: e.target.value })} /></div>
                <div><label>Plan</label>
                  <select value={f.plan || ''} onChange={e => setF({ ...f, plan: e.target.value })}>
                    {['startup', 'growth', 'enterprise', 'custom'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div><label>Operator notes (internal)</label>
                  <textarea rows={3} value={f.notes || ''} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Internal notes visible only to SETS operators" />
                </div>
              </div>
            : <table><tbody>
                {[
                  ['Name', data.name],
                  ['Plan', <PlanPill plan={data.plan} />],
                  ['Status', data.active === false ? <span style={{ color: 'var(--critical)' }}>Deactivated</span> : <span style={{ color: 'var(--low)' }}>Active</span>],
                  ['Organisation email', settings.org_email || '—'],
                  ['Phone', settings.phone || '—'],
                  ['Joined', fmt.d(data.created_at)],
                  ['Operator notes', settings.operator_notes || <span className="muted">None</span>],
                ].map(([k, v]) => <tr key={k}><td className="muted" style={{ width: 160, verticalAlign: 'top' }}>{k}</td><td>{v}</td></tr>)}
              </tbody></table>}
        </div>

        <div className="card">
          <h2>Usage — screenings by month</h2>
          {usage?.length
            ? <div style={{ marginTop: 10 }}>
                {usage.slice(-6).map(u => {
                  const max = Math.max(...usage.map(x => x.screenings), 1);
                  const pct = Math.round(100 * u.screenings / max);
                  return (
                    <div className="b bars" key={u.month} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 50px', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
                      <span className="mono muted">{u.month}</span>
                      <div style={{ background: 'var(--line)', borderRadius: 3, height: 8, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--teal)', borderRadius: 3 }} />
                      </div>
                      <span style={{ textAlign: 'right' }}>{fmt.n(u.screenings)}</span>
                    </div>
                  );
                })}
              </div>
            : <p className="muted small" style={{ marginTop: 10 }}>No screening data yet.</p>}
        </div>
      </div>

      {/* Users */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2>Users ({data.users?.length || 0})</h2>
          <button onClick={() => setAddUser(s => !s)}>{addUser ? 'Cancel' : '+ Add user'}</button>
        </div>
        {addUser && (
          <form className="form" onSubmit={createUser} style={{ marginBottom: 14, padding: '12px', background: 'var(--paper)', borderRadius: 6 }}>
            <div className="row row3">
              <div><label>Full name</label><input value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} required /></div>
              <div><label>Email</label><input type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required /></div>
              <div><label>Role</label>
                <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                  {['tenant_admin', 'compliance_officer', 'analyst', 'auditor'].map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>
            <div><label>Temporary password</label><input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required minLength={8} placeholder="At least 8 characters" /></div>
            <button className="primary" type="submit" disabled={busy}>Create user</button>
          </form>
        )}
        {data.users?.length
          ? <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead>
              <tbody>
                {data.users.map(u => <tr key={u.id}>
                  <td><b>{u.name}</b></td>
                  <td className="small">{u.email}</td>
                  <td><Pill v="info">{u.role.replace(/_/g, ' ')}</Pill></td>
                  <td><span style={{ color: u.active ? 'var(--low)' : 'var(--ink-3)' }}>{u.active ? 'Active' : 'Inactive'}</span></td>
                  <td className="small muted">{fmt.d(u.created_at)}</td>
                </tr>)}
              </tbody>
            </table>
          : <Empty>No users yet.</Empty>}
      </div>

      {/* API keys */}
      {data.api_keys?.length > 0 && (
        <div className="card">
          <h2>API keys ({data.api_keys.length})</h2>
          <table>
            <thead><tr><th>Label</th><th>Prefix</th><th>Status</th><th>Last used</th><th>Created</th></tr></thead>
            <tbody>
              {data.api_keys.map(k => <tr key={k.id}>
                <td>{k.label}</td>
                <td className="mono small">{k.prefix}…</td>
                <td><span style={{ color: k.active ? 'var(--low)' : 'var(--ink-3)' }}>{k.active ? 'Active' : 'Revoked'}</span></td>
                <td className="small muted">{k.last_used_at ? fmt.ago(k.last_used_at) : '—'}</td>
                <td className="small muted">{fmt.d(k.created_at)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Tenants tab
══════════════════════════════════════════════════════════════ */

function Tenants() {
  const { data, error } = useFetch('/operator/tenants');
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('');
  const [selected, setSelected] = useState(null);

  if (selected) return <TenantDrawer tenantId={selected} onClose={() => setSelected(null)} />;

  const rows = (data || []).filter(t =>
    (!q || t.name?.toLowerCase().includes(q.toLowerCase())) &&
    (!plan || t.plan === plan)
  );

  return (
    <div className="card">
      <div className="toolbar">
        <div><label>Search</label><input value={q} onChange={e => setQ(e.target.value)} placeholder="Tenant name" /></div>
        <div><label>Plan</label>
          <select value={plan} onChange={e => setPlan(e.target.value)}>
            <option value="">All plans</option>
            {['startup', 'growth', 'enterprise', 'custom'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <span className="small muted" style={{ alignSelf: 'center' }}>{rows.length} tenants</span>
      </div>
      <Err e={error} />
      {rows.length
        ? <table>
            <thead>
              <tr><th>Organisation</th><th>Plan</th><th>Status</th><th>Users</th><th>Screenings</th><th>Alerts</th><th>Joined</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map(t => <tr key={t.id} className="clickable" onClick={() => setSelected(t.id)}>
                <td><b>{t.name}</b></td>
                <td><PlanPill plan={t.plan} /></td>
                <td><span style={{ color: t.active === false ? 'var(--critical)' : 'var(--low)', fontSize: 12 }}>{t.active === false ? 'Deactivated' : 'Active'}</span></td>
                <td className="mono">{fmt.n(t.users)}</td>
                <td className="mono">{fmt.n(t.screenings)}</td>
                <td className="mono">{fmt.n(t.alerts)}</td>
                <td className="small muted">{fmt.d(t.created_at)}</td>
                <td><span style={{ color: 'var(--teal-ink)', fontSize: 12 }}>View →</span></td>
              </tr>)}
            </tbody>
          </table>
        : <Empty>No tenants found.</Empty>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Platform audit log tab
══════════════════════════════════════════════════════════════ */

function AuditLog() {
  const [f, setF] = useState({ tenant_id: '', action: '', limit: '100' });
  const { data, error } = useFetch('/operator/audit', f, [f.tenant_id, f.action, f.limit]);
  const { data: tenants } = useFetch('/operator/tenants');

  return (
    <div className="card">
      <div className="toolbar">
        <div><label>Tenant</label>
          <select value={f.tenant_id} onChange={e => setF({ ...f, tenant_id: e.target.value })}>
            <option value="">All tenants</option>
            {(tenants || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div><label>Action prefix</label>
          <select value={f.action} onChange={e => setF({ ...f, action: e.target.value })}>
            <option value="">All actions</option>
            {['auth', 'operator', 'screening', 'customer', 'transaction', 'alert', 'str', 'country_risk', 'rule', 'list'].map(a =>
              <option key={a} value={a}>{a}.*</option>)}
          </select>
        </div>
        <div><label>Limit</label>
          <select value={f.limit} onChange={e => setF({ ...f, limit: e.target.value })}>
            {['50', '100', '250', '500'].map(l => <option key={l} value={l}>{l} rows</option>)}
          </select>
        </div>
      </div>
      <Err e={error} />
      {(data || []).length
        ? <table>
            <thead><tr><th>When</th><th>Tenant</th><th>Actor</th><th>Action</th><th>Resource</th></tr></thead>
            <tbody>
              {data.map(r => <tr key={r.id}>
                <td className="small muted mono" style={{ whiteSpace: 'nowrap' }}>{fmt.dt(r.created_at)}</td>
                <td className="small">{(tenants || []).find(t => t.id === r.tenant_id)?.name || <span className="muted">{r.tenant_id?.slice(0, 8)}</span>}</td>
                <td className="small">{r.actor_email || r.actor_id?.slice(0, 8)}</td>
                <td className="mono small">{r.action}</td>
                <td className="small muted">{r.resource_type}{r.resource_id ? ` / ${r.resource_id.slice(0, 12)}` : ''}</td>
              </tr>)}
            </tbody>
          </table>
        : <Empty>No audit events match the current filters.</Empty>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Notices tab
══════════════════════════════════════════════════════════════ */

function Notices() {
  const { data, error, reload } = useFetch('/operator/notices');
  const [showNew, setShowNew] = useState(false);
  const [f, setF] = useState({ title: '', body: '', level: 'info', target_plan: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api('/operator/notices', { method: 'POST', body: { ...f, target_plan: f.target_plan || null } });
      setShowNew(false); setF({ title: '', body: '', level: 'info', target_plan: '' }); reload();
    } catch (x) { setErr(x); }
    setBusy(false);
  };

  const archive = async id => {
    await api(`/operator/notices/${id}`, { method: 'PATCH', body: { active: false } });
    reload();
  };

  return (
    <>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div>
          <h2>Broadcast notices</h2>
          <p className="muted small">Active notices are shown as banners inside the console for all clients on the target plan. Use for maintenance windows, feature announcements, or compliance updates.</p>
        </div>
        <button className="primary" onClick={() => setShowNew(s => !s)}>{showNew ? 'Cancel' : 'New notice'}</button>
      </div>

      {showNew && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2>New notice</h2>
          <form className="form" onSubmit={submit}>
            <Err e={err} />
            <div className="row">
              <div><label>Title</label><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} required placeholder="e.g. Scheduled maintenance on Saturday" /></div>
              <div><label>Level</label>
                <select value={f.level} onChange={e => setF({ ...f, level: e.target.value })}>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <div><label>Message body</label>
              <textarea rows={4} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} required placeholder="Full details of the notice…" />
            </div>
            <div><label>Target plan (blank = all tenants)</label>
              <select value={f.target_plan} onChange={e => setF({ ...f, target_plan: e.target.value })}>
                <option value="">All plans</option>
                {['startup', 'growth', 'enterprise'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div><button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Publish notice'}</button></div>
          </form>
        </div>
      )}

      <Err e={error} />
      {(data || []).length
        ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.map(n => (
              <div key={n.id} className="card" style={{ opacity: n.active ? 1 : 0.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <LevelPill level={n.level} />
                      {n.target_plan && <PlanPill plan={n.target_plan} />}
                      {!n.active && <span className="pill">Archived</span>}
                    </div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{n.title}</div>
                    <p className="small" style={{ margin: 0, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{n.body}</p>
                    <p className="small muted" style={{ marginTop: 6 }}>Published {fmt.d(n.created_at)}</p>
                  </div>
                  {n.active && <button onClick={() => archive(n.id)} style={{ flexShrink: 0 }}>Archive</button>}
                </div>
              </div>
            ))}
          </div>
        : <Empty>No notices yet. Create one to broadcast a message to all tenants.</Empty>}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   Main Operator page
══════════════════════════════════════════════════════════════ */

export default function Operator() {
  const me = session.get()?.user;
  const [tab, setTab] = useState('overview');

  if (me?.role !== 'super_admin') {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>Access restricted</h2>
        <p className="muted">The operator console is only available to SETS super-admins.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Operator console</h1>
          <p>SETS platform administration — manage all tenants, review activity, and broadcast notices.</p>
        </div>
        <div style={{ background: 'var(--critical-soft)', color: 'var(--critical)', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--critical)' }}>
          SETS internal — not visible to clients
        </div>
      </div>

      <div className="tabs">
        {[
          { id: 'overview', l: 'Overview' },
          { id: 'tenants', l: 'Tenants' },
          { id: 'audit', l: 'Platform audit' },
          { id: 'notices', l: 'Notices' },
        ].map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.l}</button>)}
      </div>

      {tab === 'overview' && <Overview />}
      {tab === 'tenants' && <Tenants />}
      {tab === 'audit' && <AuditLog />}
      {tab === 'notices' && <Notices />}
    </>
  );
}
