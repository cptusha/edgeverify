import React, { useState } from 'react';
import { api, session } from '../api.js';
import { Err } from '../components/ui.jsx';
export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { const r = await api('/auth/login', { method: 'POST', body: { email, password } }); session.set(r); location.href = '/'; } catch (x) { setErr(x); } finally { setBusy(false); } };
  return <div className="login"><form className="card" onSubmit={go}>
    <div className="brand"><span className="mark" />EdgeVerify</div>
    <p className="muted" style={{ marginTop: 0 }}>Sanctions screening, transaction monitoring and KYC risk — one console.</p>
    <Err e={err} />
    <div className="form"><div><label>Email</label><input value={email} onChange={e => setEmail(e.target.value)} autoFocus /></div><div><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
      <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></div>
      </form></div>;
}
