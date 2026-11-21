import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Err } from '../components/ui.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const go = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (x) { setErr(x); }
    finally { setBusy(false); }
  };

  return (
    <div className="login">
      <form className="card" onSubmit={go}>
        <div className="brand"><span className="mark" />EdgeVerify</div>
        <p className="muted" style={{ marginTop: 0 }}>Reset your password</p>
        {sent ? (
          <div>
            <div className="notice" style={{ marginBottom: 16 }}>
              If that email is registered, a reset link is on its way. Check your inbox (and spam folder).
            </div>
            <p className="small" style={{ textAlign: 'center', color: 'var(--ink-3)' }}>
              <Link to="/login">Back to sign in</Link>
            </p>
          </div>
        ) : (
          <>
            <Err e={err} />
            <div className="form">
              <div>
                <label>Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus required placeholder="you@yourorg.com" />
              </div>
              <button className="primary" disabled={busy || !email}>{busy ? 'Sending…' : 'Send reset link'}</button>
              <p className="small" style={{ textAlign: 'center', margin: '4px 0 0', color: 'var(--ink-3)' }}>
                <Link to="/login">Back to sign in</Link>
              </p>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
