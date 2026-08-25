import React from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { session } from './api.js';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Screening from './pages/Screening.jsx';
import Customers, { CustomerDetail } from './pages/Customers.jsx';
import Transactions from './pages/Transactions.jsx';
import Alerts, { AlertDetail } from './pages/Alerts.jsx';
import Rules from './pages/Rules.jsx';
import Lists from './pages/Lists.jsx';
import Audit from './pages/Audit.jsx';
import Admin from './pages/Admin.jsx';

const NAV = [
  { s: 'Monitor' }, { to: '/', l: 'Overview' }, { to: '/alerts', l: 'Alerts & cases' }, { to: '/transactions', l: 'Transactions' },
  { s: 'Know your customer' }, { to: '/screen', l: 'Screen a name' }, { to: '/customers', l: 'Customers' },
  { s: 'Configure' }, { to: '/rules', l: 'Rules' }, { to: '/lists', l: 'List registry' }, { to: '/admin', l: 'Users & API keys', roles: ['tenant_admin', 'super_admin', 'auditor'] },
  { s: 'Assurance' }, { to: '/audit', l: 'Audit log', roles: ['tenant_admin', 'super_admin', 'auditor', 'compliance_officer'] },
];

export default function App() {
  const s = session.get(); const nav = useNavigate();
  if (!s) return <Routes><Route path="*" element={<Login />} /></Routes>;
  return <div className="shell">
    <nav className="nav">
      <div className="brand"><span className="mark" />EdgeVerify</div>
      {NAV.map((n, i) => n.s ? <div className="section" key={i}>{n.s}</div> : (!n.roles || n.roles.includes(s.user.role)) && <NavLink key={n.to} to={n.to} end={n.to === '/'}>{n.l}</NavLink>)}
      <div className="user"><b>{s.user.name}</b>{s.user.role.replace(/_/g, ' ')} · {s.user.email}<button onClick={() => { session.clear(); nav('/login'); location.reload(); }}>Sign out</button></div>
    </nav>
    <main className="main">
      <Routes>
        <Route path="/" element={<Overview />} /><Route path="/login" element={<Navigate to="/" />} />
        <Route path="/screen" element={<Screening />} /><Route path="/customers" element={<Customers />} /><Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/transactions" element={<Transactions />} /><Route path="/alerts" element={<Alerts />} /><Route path="/alerts/:id" element={<AlertDetail />} />
        <Route path="/rules" element={<Rules />} /><Route path="/lists" element={<Lists />} /><Route path="/audit" element={<Audit />} /><Route path="/admin" element={<Admin />} />
      </Routes>
    </main>
  </div>;
}
