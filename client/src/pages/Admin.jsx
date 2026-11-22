import React, { useState } from 'react';
import { api, fmt, session } from '../api.js';
import { useFetch, Err, Empty, Pill } from '../components/ui.jsx';

// ── Security tab ─────────────────────────────────────────────────────────────

function SecurityTab() {
  const me = session.get()?.user;
  const sessions = useFetch('/auth/sessions');

  // Change password
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErr, setPwErr] = useState(null); const [pwOk, setPwOk] = useState(false); const [pwBusy, setPwBusy] = useState(false);
  const changePw = async (e) => {
    e.preventDefault(); setPwErr(null); setPwOk(false);
    if (pw.next !== pw.confirm) { setPwErr({ message: 'Passwords do not match' }); return; }
    if (pw.next.length < 8) { setPwErr({ message: 'Password must be at least 8 characters' }); return; }
    setPwBusy(true);
    try { await api('/auth/change-password', { method: 'POST', body: { current_password: pw.current, new_password: pw.next } }); setPwOk(true); setPw({ current: '', next: '', confirm: '' }); }
    catch (x) { setPwErr(x); } finally { setPwBusy(false); }
  };

  // 2FA setup
  const [step, setStep] = useState('idle'); // idle | setup | done
  const [qrData, setQrData] = useState(null);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [tfaErr, setTfaErr] = useState(null);
  const [tfaEnabled, setTfaEnabled] = useState(me?.totp_enabled || false);
  const [disableCode, setDisableCode] = useState('');
  const [disableErr, setDisableErr] = useState(null);

  const startSetup = async () => {
    setTfaErr(null);
    const r = await api('/auth/2fa/setup', { method: 'POST' });
    setQrData(r.qr); setSecret(r.secret); setStep('setup');
  };
  const activateTfa = async (e) => {
    e.preventDefault(); setTfaErr(null);
    try { await api('/auth/2fa/verify', { method: 'POST', body: { code } }); setTfaEnabled(true); setStep('done'); }
    catch (x) { setTfaErr(x); }
  };
  const disableTfa = async (e) => {
    e.preventDefault(); setDisableErr(null);
    try { await api('/auth/2fa/disable', { method: 'POST', body: { code: disableCode } }); setTfaEnabled(false); setDisableCode(''); }
    catch (x) { setDisableErr(x); }
  };

  // Session revocation
  const revokeSession = async (id) => { await api(`/auth/sessions/${id}`, { method: 'DELETE' }); sessions.reload(); };
  const revokeAll = async () => { await api('/auth/sessions/revoke-all', { method: 'POST' }); sessions.reload(); };

  return (
    <div className="grid g2">
      {/* Change password */}
      <div className="card">
        <h2>Change password</h2>
        {pwOk && <div className="notice" style={{ marginBottom: 12 }}>Password updated.</div>}
        <Err e={pwErr} />
        <form className="form" onSubmit={changePw}>
          <div><label>Current password</label><input type="password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} required /></div>
          <div><label>New password</label><input type="password" value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} required minLength={8} /></div>
          <div><label>Confirm new password</label><input type="password" value={pw.confirm} onChange={e => setPw({ ...pw, confirm: e.target.value })} required /></div>
          <button className="primary" disabled={pwBusy}>{pwBusy ? 'Saving…' : 'Update password'}</button>
        </form>
      </div>

      {/* 2FA */}
      <div className="card">
        <h2>Two-factor authentication</h2>
        {tfaEnabled && step !== 'setup' ? (
          <>
            <div className="notice" style={{ marginBottom: 12, background: 'var(--teal-soft)', borderColor: 'var(--teal)' }}>
              2FA is <strong>enabled</strong> on your account.
            </div>
            <p className="small muted">To disable, enter a code from your authenticator app.</p>
            <Err e={disableErr} />
            <form className="form" onSubmit={disableTfa}>
              <div><label>Authenticator code</label><input value={disableCode} onChange={e => setDisableCode(e.target.value)} placeholder="6-digit code" maxLength={6} style={{ letterSpacing: 4, fontFamily: 'monospace' }} /></div>
              <button style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', cursor: 'pointer' }}>Disable 2FA</button>
            </form>
          </>
        ) : step === 'setup' ? (
          <>
            <p className="small">Scan this QR code with <strong>Google Authenticator</strong>, <strong>Authy</strong>, or any TOTP app. Then enter the 6-digit code to activate.</p>
            {qrData && <img src={qrData} alt="2FA QR code" style={{ display: 'block', margin: '12px auto', width: 180, height: 180 }} />}
            <p className="small muted" style={{ textAlign: 'center', wordBreak: 'break-all' }}>Manual key: <span className="mono">{secret}</span></p>
            <Err e={tfaErr} />
            <form className="form" onSubmit={activateTfa}>
              <div><label>Enter code from app</label><input value={code} onChange={e => setCode(e.target.value)} placeholder="6-digit code" maxLength={6} style={{ letterSpacing: 4, fontFamily: 'monospace' }} autoFocus /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="primary">Activate 2FA</button>
                <button type="button" onClick={() => setStep('idle')}>Cancel</button>
              </div>
            </form>
          </>
        ) : step === 'done' ? (
          <div className="notice" style={{ background: 'var(--teal-soft)', borderColor: 'var(--teal)' }}>
            2FA activated. Your account is now protected.
          </div>
        ) : (
          <>
            <p className="small muted">Add a second layer of security. You will be asked for a code from your authenticator app every time you sign in.</p>
            <button className="primary" onClick={startSetup}>Set up 2FA</button>
          </>
        )}
      </div>

      {/* Active sessions */}
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Active sessions</h2>
          <button onClick={revokeAll} style={{ fontSize: 13 }}>Sign out all other sessions</button>
        </div>
        {sessions.data?.length ? (
          <table>
            <thead><tr><th>IP address</th><th>Device</th><th>Last active</th><th></th></tr></thead>
            <tbody>
              {sessions.data.map(s => (
                <tr key={s.id}>
                  <td className="mono small">{s.ip || '—'}</td>
                  <td className="small">{s.user_agent ? s.user_agent.slice(0, 60) : '—'}{s.current && <Pill v="success" style={{ marginLeft: 6 }}>current</Pill>}</td>
                  <td className="small muted">{fmt.ago(s.last_seen_at)}</td>
                  <td>{!s.current && <button onClick={() => revokeSession(s.id)} style={{ fontSize: 12 }}>Revoke</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>No active sessions found.</Empty>}
      </div>
    </div>
  );
}

// ── Usage tab ────────────────────────────────────────────────────────────────

const METRIC_LABELS = {
  screens: 'Sanctions screens', transactions: 'Transactions', api_calls: 'API calls',
  cases: 'Cases', users: 'Active users', customers: 'Customers',
};

function UsageBar({ used, limit }) {
  const pct = limit === -1 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 90 ? 'var(--danger)' : pct >= 70 ? '#f59e0b' : 'var(--accent)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, background: 'var(--border)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .3s' }} />
      </div>
      <span className="mono small" style={{ width: 90, textAlign: 'right', color }}>
        {limit === -1 ? `${used.toLocaleString()} / ∞` : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
      </span>
    </div>
  );
}

function UsageTab() {
  const usage = useFetch('/admin/usage');
  const d = usage.data;
  if (usage.loading) return <p className="muted small">Loading…</p>;
  if (usage.error) return <Err e={usage.error} />;

  const planLabel = { startup: 'Startup', growth: 'Growth', enterprise: 'Enterprise' }[d?.plan] || d?.plan;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>Plan usage</h2>
          <p className="small muted">Resets on the 1st of each month ({d?.period})</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 20, padding: '3px 12px', fontWeight: 600, fontSize: 13 }}>{planLabel}</span>
          {d?.sandbox && <span style={{ background: '#7c3aed', color: '#fff', borderRadius: 20, padding: '3px 12px', fontWeight: 600, fontSize: 13 }}>Sandbox</span>}
        </div>
      </div>
      {d?.sandbox && <p className="small muted" style={{ marginBottom: 16 }}>Sandbox mode is active — usage is not counted and limits are not enforced.</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={{ textAlign: 'left', paddingBottom: 8, fontWeight: 600, color: 'var(--muted)' }}>Metric</th>
          <th style={{ width: '50%', paddingBottom: 8 }}></th>
          <th style={{ textAlign: 'right', paddingBottom: 8, fontWeight: 600, color: 'var(--muted)' }}>Usage</th>
        </tr></thead>
        <tbody>
          {Object.entries(d?.metrics || {}).map(([key, { used, limit }]) => (
            <tr key={key} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 12px 10px 0', fontWeight: 500 }}>{METRIC_LABELS[key] || key}</td>
              <td style={{ padding: '10px 12px' }}><UsageBar used={used} limit={limit} /></td>
              <td style={{ padding: '10px 0 10px 12px', textAlign: 'right' }} className="small muted">
                {limit === -1 ? 'Unlimited' : `${Math.round((used/limit)*100)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted" style={{ marginTop: 16 }}>
        Need more capacity? <a href="mailto:sales@edgeverify.io" style={{ color: 'var(--accent)' }}>Contact sales</a> to upgrade your plan.
      </p>
    </div>
  );
}

// ── Main Admin page ───────────────────────────────────────────────────────────

export default function Admin() {
  const [tab, setTab] = useState('users');
  const users = useFetch('/admin/users'); const keys = useFetch('/admin/api-keys'); const roles = useFetch('/auth/roles'); const tenant = useFetch('/admin/tenant');
  const hooks = useFetch('/admin/webhooks');
  const [u, setU] = useState({ email: '', name: '', role: 'analyst', password: '' });
  const [k, setK] = useState(null); const [err, setErr] = useState(null); const [hook, setHook] = useState('');

  const addUser = async (e) => { e.preventDefault(); setErr(null); try { await api('/admin/users', { method: 'POST', body: u }); setU({ email: '', name: '', role: 'analyst', password: '' }); users.reload(); } catch (x) { setErr(x); } };
  const addKey = async () => { setK(await api('/admin/api-keys', { method: 'POST', body: { label: 'Core banking integration' } })); keys.reload(); };
  const addHook = async () => { await api('/admin/webhooks', { method: 'POST', body: { url: hook, events: ['alert.created'] } }); setHook(''); hooks.reload(); };

  return <>
    <div className="page-head">
      <div>
        <h1>Settings</h1>
        <p>{tenant.data?.name} · jurisdiction {tenant.data?.settings?.jurisdiction} · core banking: {tenant.data?.settings?.core_banking}</p>
      </div>
    </div>
    <div className="tabs" style={{ marginBottom: 20 }}>
      {[['users', 'Users & roles'], ['integrations', 'Integrations'], ['security', 'Security'], ['usage', 'Plan & usage']].map(([v, l]) => (
        <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>{l}</button>
      ))}
    </div>

    {tab === 'users' && (
      <div className="grid g2">
        <div className="card"><h2>Users</h2><Err e={users.error} />
          {users.data?.length ? <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th></tr></thead><tbody>{users.data.map(x => <tr key={x.id}><td>{x.name}</td><td className="small">{x.email}</td><td><Pill v="info">{x.role.replace(/_/g, ' ')}</Pill></td><td>{x.active ? 'yes' : 'no'}</td></tr>)}</tbody></table> : <Empty>No users.</Empty>}
          <form className="form" onSubmit={addUser} style={{ marginTop: 14 }}><h3>Add user</h3><Err e={err} />
            <div className="row"><div><label>Name</label><input value={u.name} onChange={e => setU({ ...u, name: e.target.value })} required /></div><div><label>Email</label><input value={u.email} onChange={e => setU({ ...u, email: e.target.value })} required /></div></div>
            <div className="row"><div><label>Role</label><select value={u.role} onChange={e => setU({ ...u, role: e.target.value })}>{Object.keys(roles.data || {}).filter(r => r !== 'super_admin').map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}</select></div><div><label>Temporary password</label><input value={u.password} onChange={e => setU({ ...u, password: e.target.value })} required /></div></div>
            <div><button className="primary">Create user</button></div>
          </form>
          <h3 style={{ marginTop: 14 }}>Roles</h3>
          <table><tbody>{Object.entries(roles.data || {}).map(([r, d]) => <tr key={r}><td className="mono">{r}</td><td className="small">{d.desc}</td></tr>)}</tbody></table>
        </div>
        <div className="card"><h2>API keys</h2>
          {k && <div className="notice">New key (copy now, shown once): <span className="mono">{k.key}</span></div>}
          {keys.data?.length ? <table><thead><tr><th>Label</th><th>Prefix</th><th>Last used</th></tr></thead><tbody>{keys.data.map(x => <tr key={x.id}><td>{x.label}</td><td className="mono">{x.prefix}…</td><td className="small muted">{fmt.ago(x.last_used_at)}</td></tr>)}</tbody></table> : <Empty>No keys.</Empty>}
          <button style={{ marginTop: 10 }} onClick={addKey}>Generate API key</button>
          <p className="small muted" style={{ marginTop: 10 }}>Send <span className="mono">x-api-key</span> on <span className="mono">POST /v1/transactions</span>, <span className="mono">/v1/screen</span> and <span className="mono">/v1/customers</span>.</p>
        </div>
      </div>
    )}

    {tab === 'integrations' && (
      <div className="card">
        <h2>Webhooks</h2>
        <p className="small muted">Push events to your SIEM, case management system, or any HTTPS endpoint. We sign every request with <span className="mono">x-edgeverify-signature</span> (HMAC-SHA256).</p>
        {hooks.data?.length ? (
          <table style={{ marginBottom: 12 }}>
            <thead><tr><th>URL</th><th>Events</th></tr></thead>
            <tbody>{hooks.data.map(h => <tr key={h.id}><td className="mono small">{h.url}</td><td className="small">{(h.events || []).join(', ')}</td></tr>)}</tbody>
          </table>
        ) : <p className="muted small">No webhooks yet.</p>}
        <div className="toolbar" style={{ marginTop: 8 }}>
          <input value={hook} onChange={e => setHook(e.target.value)} placeholder="https://…/edgeverify" style={{ flex: 1 }} />
          <button onClick={addHook} disabled={!hook}>Add webhook</button>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>Events: <span className="mono">alert.created · case.created · str.submitted · screening.hit · screening.clear · transaction.flagged</span></p>
      </div>
    )}

    {tab === 'security' && <SecurityTab />}
    {tab === 'usage' && <UsageTab />}
  </>;
}
