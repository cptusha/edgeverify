import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, session } from '../api.js';
import { Err } from '../components/ui.jsx';
export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const welcome = params.get('welcome');
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { const r = await api('/auth/login', { method: 'POST', body: { email, password } }); session.set(r); location.href = '/'; } catch (x) { setErr(x); } finally { setBusy(false); } };
  return <div className="login"><form className="card" onSubmit={go}>
    <div className="brand"><span className="mark" />EdgeVerify</div>
    <p className="muted" style={{ marginTop: 0 }}>Sanctions screening, transaction monitoring and KYC risk — one console.</p>
    {welcome && <div className="notice" style={{ marginBottom: 12 }}>Account created. Sign in to get started.</div>}
    <Err e={err} />
    <div className="form"><div><label>Email</label><input value={email} onChange={e => setEmail(e.target.value)} autoFocus /></div><div><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
      <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="small" style={{ textAlign: 'center', margin: '4px 0 0', color: 'var(--ink-3)' }}>
        <Link to="/forgot-password">Forgot password?</Link> · Don't have an account? <Link to="/">See pricing and sign up</Link>
      </p>
    </div>
      </form></div>;
}
