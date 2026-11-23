/**
 * Data export module — CSV downloads for screenings, customers,
 * transactions, and the audit log.
 *
 * All routes require authentication. The tenant_id is scoped from
 * req.actor, so users can only export their own tenant's data.
 *
 * Routes mounted at /v1/export (via index.js)
 */
import { Router } from 'express';
import { db, j } from '../db/knex.js';
import { requireRole } from '../middleware/auth.js';

export const exportRouter = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function toCsv(rows, columns) {
  const header = columns.map(c => `"${c.label}"`).join(',');
  const lines = rows.map(row =>
    columns.map(c => {
      const val = typeof c.get === 'function' ? c.get(row) : row[c.key];
      if (val == null) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }).join(',')
  );
  return [header, ...lines].join('\n');
}

function csvResponse(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

function dateLabel() {
  return new Date().toISOString().slice(0, 10);
}

// ── screenings ───────────────────────────────────────────────────────────────

exportRouter.get(
  '/screenings',
  requireRole('tenant_admin', 'compliance_officer', 'analyst', 'auditor'),
  async (req, res, next) => {
    try {
      const { from, to, outcome, customer_id, limit = 10000 } = req.query;
      const rows = await db('screenings')
        .where({ tenant_id: req.actor.tenant_id })
        .modify(q => {
          if (outcome) q.where({ outcome });
          if (customer_id) q.where({ customer_id });
          if (from) q.where('created_at', '>=', from);
          if (to) q.where('created_at', '<=', to + 'T23:59:59Z');
        })
        .orderBy('created_at', 'desc')
        .limit(Number(limit));

      const cols = [
        { label: 'ID',            key: 'id' },
        { label: 'Date',          get: r => r.created_at?.slice(0, 19).replace('T', ' ') },
        { label: 'Name screened', key: 'query_name' },
        { label: 'Context',       key: 'context' },
        { label: 'Outcome',       key: 'outcome' },
        { label: 'Top score',     key: 'top_score' },
        { label: 'Match count',   key: 'match_count' },
        { label: 'Lists checked', key: 'lists_screened' },
        { label: 'Duration ms',   key: 'duration_ms' },
        { label: 'Customer ID',   key: 'customer_id' },
        { label: 'Requested by',  key: 'requested_by' },
      ];

      csvResponse(res, `screenings-${dateLabel()}.csv`, toCsv(rows, cols));
    } catch (e) { next(e); }
  }
);

// ── customers ─────────────────────────────────────────────────────────────────

exportRouter.get(
  '/customers',
  requireRole('tenant_admin', 'compliance_officer', 'auditor'),
  async (req, res, next) => {
    try {
      const { kyc_status, risk_level, monitoring_status, limit = 50000 } = req.query;
      const rows = await db('customers')
        .where({ tenant_id: req.actor.tenant_id })
        .modify(q => {
          if (kyc_status) q.where({ kyc_status });
          if (risk_level) q.where({ risk_level });
          if (monitoring_status) q.where({ monitoring_status });
        })
        .orderBy('created_at', 'desc')
        .limit(Number(limit));

      const cols = [
        { label: 'ID',                       key: 'id' },
        { label: 'External ref',             key: 'external_ref' },
        { label: 'Full name',                key: 'full_name' },
        { label: 'Type',                     key: 'customer_type' },
        { label: 'Date of birth',            key: 'dob' },
        { label: 'Nationality',              key: 'nationality' },
        { label: 'Residence country',        key: 'residence_country' },
        { label: 'Occupation',               key: 'occupation' },
        { label: 'Industry',                 key: 'industry' },
        { label: 'ID type',                  key: 'id_type' },
        { label: 'PEP',                      get: r => r.is_pep ? 'Yes' : 'No' },
        { label: 'RCA',                      get: r => r.is_rca ? 'Yes' : 'No' },
        { label: 'Risk score',               key: 'risk_score' },
        { label: 'Risk level',               key: 'risk_level' },
        { label: 'KYC status',               key: 'kyc_status' },
        { label: 'Monitoring status',        key: 'monitoring_status' },
        { label: 'Expected monthly turnover',key: 'expected_monthly_turnover' },
        { label: 'Last screened',            get: r => r.last_screened_at?.slice(0, 19).replace('T', ' ') },
        { label: 'Created',                  get: r => r.created_at?.slice(0, 19).replace('T', ' ') },
      ];

      csvResponse(res, `customers-${dateLabel()}.csv`, toCsv(rows, cols));
    } catch (e) { next(e); }
  }
);

// ── transactions ──────────────────────────────────────────────────────────────

exportRouter.get(
  '/transactions',
  requireRole('tenant_admin', 'compliance_officer', 'auditor'),
  async (req, res, next) => {
    try {
      const { from, to, status, customer_id, limit = 100000 } = req.query;
      const rows = await db('transactions')
        .where({ tenant_id: req.actor.tenant_id })
        .modify(q => {
          if (status) q.where({ status });
          if (customer_id) q.where({ customer_id });
          if (from) q.where('occurred_at', '>=', from);
          if (to) q.where('occurred_at', '<=', to + 'T23:59:59Z');
        })
        .orderBy('occurred_at', 'desc')
        .limit(Number(limit));

      const cols = [
        { label: 'ID',                 key: 'id' },
        { label: 'Date',               get: r => r.occurred_at?.slice(0, 19).replace('T', ' ') },
        { label: 'External ref',       key: 'external_ref' },
        { label: 'Customer ID',        key: 'customer_id' },
        { label: 'Direction',          key: 'direction' },
        { label: 'Type',               key: 'tx_type' },
        { label: 'Amount',             key: 'amount' },
        { label: 'Currency',           key: 'currency' },
        { label: 'Amount (USD base)',  key: 'amount_base' },
        { label: 'Counterparty name',  key: 'counterparty_name' },
        { label: 'Counterparty bank',  key: 'counterparty_bank' },
        { label: 'Counterparty country',key:'counterparty_country' },
        { label: 'Origin country',     key: 'origin_country' },
        { label: 'Destination country',key: 'destination_country' },
        { label: 'Channel',            key: 'channel' },
        { label: 'Status',             key: 'status' },
        { label: 'Risk score',         key: 'risk_score' },
        { label: 'Latency ms',         key: 'latency_ms' },
        { label: 'Narrative',          key: 'narrative' },
      ];

      csvResponse(res, `transactions-${dateLabel()}.csv`, toCsv(rows, cols));
    } catch (e) { next(e); }
  }
);

// ── audit log ─────────────────────────────────────────────────────────────────

exportRouter.get(
  '/audit',
  requireRole('tenant_admin', 'auditor', 'compliance_officer'),
  async (req, res, next) => {
    try {
      const { from, to, action, resource_type, limit = 100000 } = req.query;
      const rows = await db('audit_log')
        .where({ tenant_id: req.actor.tenant_id })
        .modify(q => {
          if (action) q.where({ action });
          if (resource_type) q.where({ resource_type });
          if (from) q.where('at', '>=', from);
          if (to) q.where('at', '<=', to + 'T23:59:59Z');
        })
        .orderBy('at', 'desc')
        .limit(Number(limit));

      const cols = [
        { label: 'Seq',           key: 'seq' },
        { label: 'Timestamp',     get: r => r.at?.slice(0, 19).replace('T', ' ') },
        { label: 'Action',        key: 'action' },
        { label: 'Actor ID',      key: 'actor_id' },
        { label: 'Actor type',    key: 'actor_type' },
        { label: 'Resource type', key: 'resource_type' },
        { label: 'Resource ID',   key: 'resource_id' },
        { label: 'IP',            key: 'ip' },
        { label: 'User agent',    key: 'user_agent' },
        { label: 'Hash',          key: 'hash' },
      ];

      csvResponse(res, `audit-log-${dateLabel()}.csv`, toCsv(rows, cols));
    } catch (e) { next(e); }
  }
);

// ── alerts ────────────────────────────────────────────────────────────────────

exportRouter.get(
  '/alerts',
  requireRole('tenant_admin', 'compliance_officer', 'auditor'),
  async (req, res, next) => {
    try {
      const { from, to, severity, status, limit = 50000 } = req.query;
      const rows = await db('alerts')
        .where({ tenant_id: req.actor.tenant_id })
        .modify(q => {
          if (severity) q.where({ severity });
          if (status) q.where({ status });
          if (from) q.where('created_at', '>=', from);
          if (to) q.where('created_at', '<=', to + 'T23:59:59Z');
        })
        .orderBy('created_at', 'desc')
        .limit(Number(limit));

      const cols = [
        { label: 'ID',            key: 'id' },
        { label: 'Date',          get: r => r.created_at?.slice(0, 19).replace('T', ' ') },
        { label: 'Type',          key: 'alert_type' },
        { label: 'Severity',      key: 'severity' },
        { label: 'Status',        key: 'status' },
        { label: 'Title',         key: 'title' },
        { label: 'Summary',       key: 'summary' },
        { label: 'Customer ID',   key: 'customer_id' },
        { label: 'Rule code',     key: 'rule_code' },
        { label: 'SLA due',       get: r => r.sla_due_at?.slice(0, 19).replace('T', ' ') },
        { label: 'Resolved at',   get: r => r.resolved_at?.slice(0, 19).replace('T', ' ') },
        { label: 'Assigned to',   key: 'assigned_to' },
        { label: 'Case ID',       key: 'case_id' },
        { label: 'Resolution note', key: 'resolution_note' },
      ];

      csvResponse(res, `alerts-${dateLabel()}.csv`, toCsv(rows, cols));
    } catch (e) { next(e); }
  }
);
