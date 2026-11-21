import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

/* ─── pricing data ────────────────────────────────────────────── */
const PLANS = [
  {
    id: 'startup',
    name: 'Start-Up',
    price: 'NGN 1,500,000',
    period: '/year',
    tagline: 'For early-stage fintechs and lending platforms getting compliance right from day one.',
    items: [
      { l: 'KYC / AML screenings', v: '875 API calls' },
      { l: 'Transaction screening', v: '875 API calls' },
      { l: 'Transaction monitoring', v: '7,000 API calls' },
      { l: 'Loan / credit worthiness', v: '116 API calls' },
      { l: 'Identity verification credit', v: 'NGN 100,000 wallet' },
      { l: 'Users', v: 'Up to 5' },
      { l: 'Audit log retention', v: '12 months' },
      { l: 'Support', v: 'Email' },
    ],
    cta: 'Get started',
    highlight: false,
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 'NGN 6,200,000',
    period: '/year',
    tagline: 'For regulated institutions and payment companies scaling their compliance operations.',
    items: [
      { l: 'KYC / AML screenings', v: '3,798 API calls' },
      { l: 'Transaction screening', v: '3,798 API calls' },
      { l: 'Transaction monitoring', v: '31,250 API calls' },
      { l: 'Loan / credit worthiness', v: '500 API calls' },
      { l: 'Identity verification credit', v: 'NGN 200,000 wallet' },
      { l: 'Users', v: 'Up to 20' },
      { l: 'Audit log retention', v: '24 months' },
      { l: 'Support', v: 'Email + phone' },
    ],
    cta: 'Get started',
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'NGN 12,500,000',
    period: '/year',
    tagline: 'For banks, MFBs and large-volume processors that need maximum capacity and bespoke support.',
    items: [
      { l: 'KYC / AML screenings', v: '10,042 API calls' },
      { l: 'Transaction screening', v: '10,042 API calls' },
      { l: 'Transaction monitoring', v: '66,945 API calls' },
      { l: 'Loan / credit worthiness', v: '1,039 API calls' },
      { l: 'Identity verification credit', v: 'NGN 450,000 wallet' },
      { l: 'Users', v: 'Unlimited' },
      { l: 'Audit log retention', v: 'Unlimited' },
      { l: 'Support', v: 'Dedicated account manager' },
    ],
    cta: 'Contact us',
    highlight: false,
  },
];

const FEATURES = [
  {
    icon: '🛡',
    title: 'Real-time sanctions screening',
    body: 'Screen customers and counterparties against OFAC, UN, UK HMT, EU CFSP, and 1,200+ other watchlists in milliseconds. Every result is logged and audit-chained.',
  },
  {
    icon: '📊',
    title: 'Transaction monitoring',
    body: 'Configurable rule engine flags structuring, velocity breaches, high-risk corridor payments, and unusual patterns. Raise alerts automatically and route them to your compliance team.',
  },
  {
    icon: '🔍',
    title: 'KYC risk scoring',
    body: 'Build a risk profile for every customer — PEP status, adverse media, country risk, transaction behaviour. Scores update continuously as new information arrives.',
  },
  {
    icon: '📋',
    title: 'STR / CTR filing workflow',
    body: 'Draft, review, and file Suspicious Transaction Reports and Currency Transaction Reports from inside the console. Every field, every change, every filing is recorded in the tamper-evident audit chain.',
  },
  {
    icon: '🌍',
    title: 'Country risk intelligence',
    body: 'FATF-aligned risk scores for every jurisdiction, covering blacklist, greylist, and EU high-risk designations. Override individual scores to match your own risk appetite.',
  },
  {
    icon: '🔗',
    title: 'API-first integration',
    body: 'REST API with JWT and API-key auth. Connect your core banking system, onboarding platform, or mobile app in hours. Full OpenAPI documentation included.',
  },
];

/* ─── signup form ─────────────────────────────────────────────── */
function SignupModal({ plan, onClose }) {
  const nav = useNavigate();
  const [step, setStep] = useState(1); // 1 = org details, 2 = account
  const [f, setF] = useState({
    org_name: '', org_email: '', phone: '',
    name: '', email: '', password: '', confirm: '',
    plan: plan?.id || 'growth',
  });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const s = k => e => setF({ ...f, [k]: e.target.value });

  const next = e => {
    e.preventDefault();
    if (!f.org_name || !f.org_email) return setErr('Please fill in your organisation details.');
    setErr(null);
    setStep(2);
  };

  const submit = async e => {
    e.preventDefault();
    if (f.password !== f.confirm) return setErr('Passwords do not match.');
    if (f.password.length < 8) return setErr('Password must be at least 8 characters.');
    setBusy(true);
    setErr(null);
    try {
      await api('/auth/signup', {
        method: 'POST',
        body: { org_name: f.org_name, org_email: f.org_email, phone: f.phone, plan: f.plan, name: f.name, email: f.email, password: f.password },
      });
      nav('/login?welcome=1');
    } catch (x) {
      setErr(x?.message || 'Signup failed. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="lp-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="lp-modal">
        <button className="lp-modal-close ghost" onClick={onClose}>✕</button>
        <div className="lp-modal-head">
          <div className="brand" style={{ color: 'var(--ink)', paddingBottom: 0 }}><span className="mark" />EdgeVerify</div>
          <h2 style={{ marginTop: 10 }}>Create your account</h2>
          <p className="small muted">Plan: <b>{PLANS.find(p => p.id === f.plan)?.name}</b>
            {' · '}
            <button className="ghost" style={{ padding: 0, fontSize: 12, color: 'var(--teal-ink)' }} onClick={() => setStep(1)}>Change plan</button>
          </p>
        </div>

        {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

        {step === 1 && (
          <form className="form" onSubmit={next}>
            <div>
              <label>Organisation / company name</label>
              <input value={f.org_name} onChange={s('org_name')} required placeholder="Acme Fintech Limited" autoFocus />
            </div>
            <div>
              <label>Organisation email</label>
              <input type="email" value={f.org_email} onChange={s('org_email')} required placeholder="compliance@yourfirm.com" />
            </div>
            <div>
              <label>Phone number (optional)</label>
              <input type="tel" value={f.phone} onChange={s('phone')} placeholder="+234 801 234 5678" />
            </div>
            <div>
              <label>Select plan</label>
              <select value={f.plan} onChange={s('plan')}>
                {PLANS.map(p => <option key={p.id} value={p.id}>{p.name} — {p.price}{p.period}</option>)}
              </select>
            </div>
            <button className="primary" type="submit">Continue</button>
            <p className="small muted" style={{ textAlign: 'center' }}>Already have an account? <Link to="/login" onClick={onClose}>Sign in</Link></p>
          </form>
        )}

        {step === 2 && (
          <form className="form" onSubmit={submit}>
            <div>
              <label>Your full name</label>
              <input value={f.name} onChange={s('name')} required placeholder="Amaka Okafor" autoFocus />
            </div>
            <div>
              <label>Your work email</label>
              <input type="email" value={f.email} onChange={s('email')} required placeholder="amaka@yourfirm.com" />
            </div>
            <div>
              <label>Password</label>
              <input type="password" value={f.password} onChange={s('password')} required placeholder="At least 8 characters" />
            </div>
            <div>
              <label>Confirm password</label>
              <input type="password" value={f.confirm} onChange={s('confirm')} required />
            </div>
            <button className="primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
            <button type="button" onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', padding: 0 }}>← Back</button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ─── main landing page ───────────────────────────────────────── */
export default function Landing() {
  const [modal, setModal] = useState(null); // null | plan object
  const nav = useNavigate();

  const openSignup = plan => setModal(plan || PLANS[1]);

  return (
    <div className="lp">
      {modal && <SignupModal plan={modal} onClose={() => setModal(null)} />}

      {/* NAV */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <div className="brand lp-brand"><span className="mark" />EdgeVerify</div>
          <nav className="lp-links">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#contact">Contact</a>
          </nav>
          <div className="lp-nav-cta">
            <Link to="/login" className="lp-btn-ghost">Sign in</Link>
            <button className="lp-btn-primary" onClick={() => openSignup(null)}>Get started</button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero-inner">
          <div className="lp-pill-tag">Built for African financial institutions</div>
          <h1 className="lp-h1">Sanctions screening,<br />transaction monitoring<br />and KYC risk — one console.</h1>
          <p className="lp-sub">
            EdgeVerify gives compliance teams a single, audit-ready platform to screen customers, monitor transactions in real time, manage watchlists, and file regulatory reports — without stitching together multiple vendors.
          </p>
          <div className="lp-hero-actions">
            <button className="lp-btn-primary lp-btn-lg" onClick={() => openSignup(null)}>Start free trial</button>
            <a href="#pricing" className="lp-btn-ghost lp-btn-lg">See pricing</a>
          </div>
          <div className="lp-trust">
            <span>OFAC</span><span>UN Consolidated</span><span>UK HMT</span><span>EU CFSP</span><span>FATF</span><span>1,200+ watchlists</span>
          </div>
        </div>
        <div className="lp-hero-visual">
          <div className="lp-screen-mock">
            <div className="lp-mock-bar">
              <span /><span /><span />
            </div>
            <div className="lp-mock-body">
              <div className="lp-mock-row lp-mock-hit">
                <span className="lp-mock-score hot">94%</span>
                <div>
                  <div className="lp-mock-name">Ibrahim Al-Rashid</div>
                  <div className="lp-mock-tags"><span className="pill critical">Sanction</span><span className="pill">OFAC SDN</span></div>
                </div>
              </div>
              <div className="lp-mock-row">
                <span className="lp-mock-score warm">72%</span>
                <div>
                  <div className="lp-mock-name">Emeka Nwosu</div>
                  <div className="lp-mock-tags"><span className="pill high">PEP</span><span className="pill">Level 1</span></div>
                </div>
              </div>
              <div className="lp-mock-row lp-mock-clear">
                <span className="lp-mock-score ok">0%</span>
                <div>
                  <div className="lp-mock-name">Aisha Bello</div>
                  <div className="lp-mock-tags"><span className="pill low">Clear</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="lp-section" id="features">
        <div className="lp-section-inner">
          <div className="lp-section-label">What EdgeVerify does</div>
          <h2 className="lp-h2">Every compliance workflow,<br />in one place.</h2>
          <div className="lp-features-grid">
            {FEATURES.map(f => (
              <div key={f.title} className="lp-feature-card">
                <div className="lp-feature-icon">{f.icon}</div>
                <h3 className="lp-feature-title">{f.title}</h3>
                <p className="lp-feature-body">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="lp-section lp-section-dark">
        <div className="lp-section-inner">
          <div className="lp-section-label" style={{ color: 'var(--teal)' }}>Designed for the way you work</div>
          <h2 className="lp-h2" style={{ color: '#fff' }}>From onboarding to filing,<br />the full compliance lifecycle.</h2>
          <div className="lp-steps">
            {[
              { n: '01', t: 'Screen on onboarding', b: 'Run every new customer or beneficial owner against 1,200+ watchlists before they transact. Instant ACCEPT / REVIEW / REJECT with full match detail.' },
              { n: '02', t: 'Monitor continuously', b: 'Every transaction passes through your rule engine. Unusual velocity, structuring patterns, or high-risk corridor payments raise an alert automatically.' },
              { n: '03', t: 'Investigate and decide', b: 'Alerts route to your compliance team for review. Add notes, link transactions, escalate to a case, or close with a disposition — all recorded in the audit chain.' },
              { n: '04', t: 'File with the regulator', b: 'Draft and file STRs and CTRs directly from the console. The report captures all linked alerts and transactions and time-stamps the filing.' },
            ].map(s => (
              <div key={s.n} className="lp-step">
                <div className="lp-step-num">{s.n}</div>
                <h3 className="lp-step-title">{s.t}</h3>
                <p className="lp-step-body">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="lp-section" id="pricing">
        <div className="lp-section-inner">
          <div className="lp-section-label">Pricing</div>
          <h2 className="lp-h2">Straightforward annual bundles.<br />No per-seat surprises.</h2>
          <p className="lp-section-sub">All prices in NGN. Unused API calls do not roll over. Additional capacity available on request.</p>
          <div className="lp-plans">
            {PLANS.map(p => (
              <div key={p.id} className={`lp-plan${p.highlight ? ' lp-plan-highlight' : ''}`}>
                {p.highlight && <div className="lp-plan-badge">Most popular</div>}
                <div className="lp-plan-name">{p.name}</div>
                <div className="lp-plan-price">{p.price}<span className="lp-plan-period">{p.period}</span></div>
                <p className="lp-plan-tagline">{p.tagline}</p>
                <ul className="lp-plan-items">
                  {p.items.map(item => (
                    <li key={item.l}>
                      <span className="lp-check">✓</span>
                      <span><b>{item.v}</b> {item.l}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className={p.highlight ? 'lp-btn-primary lp-btn-block' : 'lp-btn-outline lp-btn-block'}
                  onClick={() => p.id === 'enterprise' ? document.getElementById('contact').scrollIntoView({ behavior: 'smooth' }) : openSignup(p)}
                >
                  {p.cta}
                </button>
              </div>
            ))}
          </div>
          <p className="lp-section-sub" style={{ marginTop: 24 }}>
            Need a white-label deployment under your own brand? <a href="#contact">Talk to us.</a>
          </p>
        </div>
      </section>

      {/* API SECTION */}
      <section className="lp-section lp-section-teal">
        <div className="lp-section-inner lp-api-row">
          <div>
            <div className="lp-section-label" style={{ color: 'var(--teal-soft)' }}>Integrate anywhere</div>
            <h2 className="lp-h2" style={{ color: '#fff' }}>REST API with full documentation.</h2>
            <p style={{ color: 'rgba(255,255,255,.8)', lineHeight: 1.65, marginTop: 10, maxWidth: 420 }}>
              Connect EdgeVerify to your core banking system, mobile onboarding app, or loan management platform in hours. JWT and API-key auth, OpenAPI spec, and code examples for every endpoint.
            </p>
            <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
              <button className="lp-btn-light" onClick={() => openSignup(null)}>Get API key</button>
              <a href="/api-docs" className="lp-btn-ghost-light">View API docs</a>
            </div>
          </div>
          <div className="lp-code-block">
            <pre>{`POST /v1/screen
Authorization: Bearer <api-key>

{
  "name": "Ibrahim Al-Rashid",
  "dob": "1972-03-15",
  "threshold": 80
}

→ 200 OK
{
  "outcome": "REJECT",
  "top_score": 94,
  "matches": [
    {
      "list": "OFAC SDN",
      "name": "IBRAHIM AL RASHID",
      "score": 94
    }
  ],
  "screening_id": "scr_8a3f..."
}`}</pre>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="lp-section" id="contact">
        <div className="lp-section-inner lp-contact">
          <div className="lp-section-label">Get in touch</div>
          <h2 className="lp-h2">Talk to our team.</h2>
          <p className="lp-section-sub">For Enterprise plans, white-label deployments, or bespoke integrations, reach us directly.</p>
          <div className="lp-contact-cards">
            <div className="lp-contact-card">
              <div className="lp-contact-icon">✉</div>
              <div className="lp-contact-label">Email</div>
              <a href="mailto:hello@edgeverify.ng" className="lp-contact-value">hello@edgeverify.ng</a>
            </div>
            <div className="lp-contact-card">
              <div className="lp-contact-icon">📞</div>
              <div className="lp-contact-label">Phone / WhatsApp</div>
              <a href="tel:+2348000000000" className="lp-contact-value">+234 800 000 0000</a>
            </div>
            <div className="lp-contact-card">
              <div className="lp-contact-icon">📍</div>
              <div className="lp-contact-label">Address</div>
              <span className="lp-contact-value">Lagos, Nigeria</span>
            </div>
          </div>
          <button className="lp-btn-primary lp-btn-lg" style={{ marginTop: 32 }} onClick={() => openSignup(null)}>
            Create your free account
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-brand brand"><span className="mark" />EdgeVerify</div>
          <p className="small" style={{ color: 'rgba(255,255,255,.45)', marginTop: 6 }}>
            A product of Secure Edge Technologies Limited &nbsp;·&nbsp; RC 7082651 &nbsp;·&nbsp; Lagos, Nigeria
          </p>
          <div className="lp-footer-links">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <Link to="/login">Sign in</Link>
            <a href="#contact">Contact</a>
          </div>
          <p className="small" style={{ color: 'rgba(255,255,255,.3)', marginTop: 16 }}>
            © {new Date().getFullYear()} Secure Edge Technologies Limited. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
