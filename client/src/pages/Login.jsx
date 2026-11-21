import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, session } from '../api.js';
import { Err } from '../components/ui.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [step, setStep] = useState('credentials'); // 'credentials' | 'totp'
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const welcome = params.get('welcome');

  const go = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body = { email, password };
      if (step === 'totp') body.totp_code = totpCode;
      const r = await api('/auth/login', { method: 'POST', body });
      if (r.totp_required) {
        setStep('totp');
        setBusy(false);
        return;
      }
      session.set(r);
      location.href = '/';
    } catch (x) { setErr(x); }
    finally { setBusy(false); }
  };

  return (
    <div className="login">
      <form className="card" onSubmit={go}>
        <div className="brand"><span className="mark" />EdgeVerify</div>
        <p className="muted" style={{ marginTop: 0 }}>Sanctions screening, transaction monitoring and KYC risk — one console.</p>
        {welcome && <div className="notice" style={{ marginBottom: 12 }}>Account created. Sign in to get started.</div>}
        <Err e={err} />

        {step === 'credentials' ? (
          <div className="form">
            <div><label>Email</label><input value={email} onChange={e => setEmail(e.target.value)} autoFocus type="email" required /></div>
            <div><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
            <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <p className="small" style={{ textAlign: 'center', margin: '4px 0 0', color: 'var(--ink-3)' }}>
              <Link to="/forgot-password">Forgot password?</Link> · Don't have an account? <Link to="/">See pricing and sign up</Link>
            </p>
          </div>
        ) : (
          <div className="form">
            <p className="small muted" style={{ margin: '0 0 12px' }}>Enter the 6-digit code from your authenticator app.</p>
            <div>
              <label>Authenticator code</label>
              <input value={totpCode} onChange={e => setTotpCode(e.target.value)} placeholder="000000" maxLength={6} autoFocus style={{ letterSpacing: 6, fontFamily: 'monospace', fontSize: 20 }} />
            </div>
            <button className="primary" disabled={busy || totpCode.length < 6}>{busy ? 'Verifying…' : 'Verify'}</button>
            <button type="button" onClick={() => { setStep('credentials'); setTotpCode(''); setErr(null); }} style={{ marginTop: 4 }}>Back</button>
          </div>
        )}
      </form>
    </div>
  );
}
