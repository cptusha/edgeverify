import React from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { session } from './api.js';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Screening from './pages/Screening.jsx';
import BulkScreen from './pages/BulkScreen.jsx';
import Customers, { CustomerDetail } from './pages/Customers.jsx';
import Transactions from './pages/Transactions.jsx';
import Alerts, { AlertDetail } from './pages/Alerts.jsx';
import Rules from './pages/Rules.jsx';
import Lists from './pages/Lists.jsx';
import Audit from './pages/Audit.jsx';
import Admin from './pages/Admin.jsx';
import StrReports, { StrReportDetail } from './pages/StrReports.jsx';
import CountryRisk from './pages/CountryRisk.jsx';
import Operator from './pages/Operator.jsx';

const NAV = [
  { s: 'Monitor' }, { to: '/', l: 'Overview' }, { to: '/alerts', l: 'Alerts & cases' }, { to: '/transactions', l: 'Transactions' },
  { s: 'Know your customer' }, { to: '/screen', l: 'Screen a name' }, { to: '/bulk-screen', l: 'Bulk screening' }, { to: '/customers', l: 'Customers' },
  { s: 'Compliance' }, { to: '/str-reports', l: 'STR / CTR reports', roles: ['compliance_officer', 'tenant_admin', 'super_admin', 'auditor'] }, { to: '/country-risk', l: 'Country risk' },
  { s: 'Configure' }, { to: '/rules', l: 'Rules' }, { to: '/lists', l: 'List registry' }, { to: '/admin', l: 'Users & API keys', roles: ['tenant_admin', 'super_admin', 'auditor'] },
  { s: 'Assurance' }, { to: '/audit', l: 'Audit log', roles: ['tenant_admin', 'super_admin', 'auditor', 'compliance_officer'] },
  { s: 'SETS Console', roles: ['super_admin'] }, { to: '/operator', l: 'Operator console', roles: ['super_admin'] },
];

export default function App() {
  const s = session.get(); const nav = useNavigate();

  // Public routes — always visible regardless of auth state
  if (!s) return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Landing />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );

  // Authenticated shell
  return <div className="shell">
    <nav className="nav">
      <div className="brand"><span className="mark" />EdgeVerify</div>
      {NAV.map((n, i) => n.s ? ((!n.roles || n.roles.includes(s.user.role)) && <div className="section" key={i}>{n.s}</div>) : (!n.roles || n.roles.includes(s.user.role)) && <NavLink key={n.to} to={n.to} end={n.to === '/app'}>{n.l}</NavLink>)}
      <div className="user"><b>{s.user.name}</b>{s.user.role.replace(/_/g, ' ')} · {s.user.email}<button onClick={() => { session.clear(); nav('/'); location.reload(); }}>Sign out</button></div>
    </nav>
    <main className="main">
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/signup" element={<Navigate to="/" replace />} />
        <Route path="/screen" element={<Screening />} /><Route path="/customers" element={<Customers />} /><Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/transactions" element={<Transactions />} /><Route path="/alerts" element={<Alerts />} /><Route path="/alerts/:id" element={<AlertDetail />} />
        <Route path="/rules" element={<Rules />} /><Route path="/lists" element={<Lists />} /><Route path="/audit" element={<Audit />} /><Route path="/admin" element={<Admin />} />
        <Route path="/bulk-screen" element={<BulkScreen />} />
        <Route path="/str-reports" element={<StrReports />} /><Route path="/str-reports/:id" element={<StrReportDetail />} />
        <Route path="/country-risk" element={<CountryRisk />} />
        <Route path="/operator" element={<Operator />} />
      </Routes>
    </main>
  </div>;
}
