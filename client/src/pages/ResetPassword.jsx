import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Err } from '../components/ui.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) return (
    <div className="login"><div className="card">
      <div className="brand"><span className="mark" />EdgeVerify</div>
      <Err e={{ message: 'Invalid reset link. Please request a new one.' }} />
      <p className="small" style={{ textAlign: 'center', color: 'var(--ink-3)' }}><Link to="/forgot-password">Request a reset link</Link></p>
    </div></div>
  );

  const go = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setErr({ message: 'Passwords do not match' }); return; }
    if (password.length < 8) { setErr({ message: 'Password must be at least 8 characters' }); return; }
    setBusy(true); setErr(null);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password } });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (x) { setErr(x); }
    finally { setBusy(false); }
  };

  return (
    <div className="login">
      <form className="card" onSubmit={go}>
        <div className="brand"><span className="mark" />EdgeVerify</div>
        <p className="muted" style={{ marginTop: 0 }}>Choose a new password</p>
        {done ? (
          <div className="notice">Password updated. Redirecting you to sign in…</div>
        ) : (
          <>
            <Err e={err} />
            <div className="form">
              <div>
                <label>New password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus required minLength={8} placeholder="At least 8 characters" />
              </div>
              <div>
                <label>Confirm password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="Repeat password" />
              </div>
              <button className="primary" disabled={busy || !password || !confirm}>{busy ? 'Saving…' : 'Set new password'}</button>
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
