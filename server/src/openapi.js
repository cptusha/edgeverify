/**
 * EdgeVerify OpenAPI 3.1 specification.
 * Served as JSON at GET /openapi.json and rendered by Swagger UI at GET /docs.
 */

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'EdgeVerify API',
    version: '1.0.0',
    description: `
EdgeVerify is a multi-tenant AML / sanctions screening, transaction monitoring,
and KYC risk platform built by Secure Edge Technologies Limited (SETS).

## Authentication

All \`/v1\` endpoints (except those under \`/v1/auth\` for login, signup,
password reset) require a bearer token:

\`\`\`
Authorization: Bearer <token>
\`\`\`

API keys are also accepted for machine-to-machine calls:

\`\`\`
x-api-key: ev_live_...
\`\`\`

## Rate limiting

600 requests per minute per IP. Exceeding this returns \`429 Too Many Requests\`.

## Plan limits

Startup and Growth tenants have monthly caps on screens, transactions,
API calls, cases, and customers. Exceeding a cap returns
\`429\` with \`{ error, limit, current, plan }\`.

## Sandbox mode

Tenants flagged as sandbox bypass all plan limits and do not accumulate
usage counters. Useful for integration testing.
    `.trim(),
    contact: { name: 'SETS Support', email: 'support@edgeverify.io' },
    license: { name: 'Proprietary', url: 'https://edgeverify.io/terms' },
  },
  servers: [
    { url: '/v1', description: 'Current environment' },
    { url: 'https://api.edgeverify.io/v1', description: 'Production' },
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
    },
    schemas: {
      Error: {
        type: 'object', required: ['error'],
        properties: { error: { type: 'string' } },
      },
      PaginatedMeta: {
        type: 'object',
        properties: { limit: { type: 'integer' } },
      },
      Tenant: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          plan: { type: 'string', enum: ['startup', 'growth', 'enterprise', 'custom'] },
          sandbox: { type: 'boolean' },
          settings: { type: 'object' },
          risk_config: { type: 'object' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['super_admin', 'tenant_admin', 'compliance_officer', 'analyst', 'auditor', 'api_client', 'mlro'] },
          active: { type: 'boolean' },
          totp_enabled: { type: 'boolean' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Customer: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          tenant_id: { type: 'string' },
          external_ref: { type: 'string' },
          customer_type: { type: 'string', enum: ['individual', 'corporate'] },
          full_name: { type: 'string' },
          dob: { type: 'string', format: 'date' },
          nationality: { type: 'string' },
          residence_country: { type: 'string' },
          risk_score: { type: 'integer' },
          risk_level: { type: 'string', enum: ['unrated', 'low', 'medium', 'high', 'critical'] },
          kyc_status: { type: 'string', enum: ['pending', 'verified', 'rejected', 'expired'] },
          monitoring_status: { type: 'string', enum: ['active', 'enhanced', 'exited'] },
          is_pep: { type: 'boolean' },
          is_rca: { type: 'boolean' },
          last_screened_at: { type: 'string', format: 'date-time' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      ScreeningRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 2, example: 'John Doe' },
          dob: { type: 'string', format: 'date', example: '1970-01-15' },
          nationality: { type: 'string', example: 'NG' },
          country: { type: 'string', example: 'NG' },
          entityType: { type: 'string', enum: ['person', 'organisation', 'vessel', 'aircraft'] },
          customer_id: { type: 'string', format: 'uuid' },
          context: { type: 'string', enum: ['onboarding', 'ongoing', 'transaction', 'adhoc'], default: 'adhoc' },
          threshold: { type: 'number', minimum: 50, maximum: 100, example: 80 },
          list_types: { type: 'array', items: { type: 'string' }, example: ['Sanction', 'PEP'] },
          max_results: { type: 'integer', maximum: 100, default: 25 },
        },
      },
      ScreeningResult: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          outcome: { type: 'string', enum: ['clear', 'potential_match', 'confirmed_match'] },
          top_score: { type: 'number' },
          match_count: { type: 'integer' },
          duration_ms: { type: 'integer' },
          matches: { type: 'array', items: { type: 'object' } },
        },
      },
      Transaction: {
        type: 'object',
        required: ['direction', 'amount'],
        properties: {
          external_ref: { type: 'string' },
          customer_id: { type: 'string', format: 'uuid' },
          direction: { type: 'string', enum: ['credit', 'debit'] },
          tx_type: { type: 'string', enum: ['cash', 'wire', 'card', 'transfer', 'crypto', 'cheque', 'mobile_money'], default: 'transfer' },
          amount: { type: 'number', minimum: 0, example: 50000 },
          currency: { type: 'string', default: 'USD', example: 'NGN' },
          counterparty_name: { type: 'string' },
          counterparty_account: { type: 'string' },
          counterparty_bank: { type: 'string' },
          counterparty_country: { type: 'string' },
          origin_country: { type: 'string' },
          destination_country: { type: 'string' },
          narrative: { type: 'string' },
          screen_counterparty: { type: 'boolean', default: true },
          dry_run: { type: 'boolean', default: false },
        },
      },
      TransactionResult: {
        type: 'object',
        properties: {
          transaction_id: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['cleared', 'flagged', 'held', 'blocked'] },
          decision: { type: 'string', enum: ['ACCEPT', 'REVIEW', 'REJECT'] },
          risk_score: { type: 'integer' },
          hits: { type: 'array', items: { type: 'object' } },
          latency_ms: { type: 'integer' },
          dry_run: { type: 'boolean' },
        },
      },
      Alert: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          alert_type: { type: 'string', enum: ['screening', 'transaction', 'fraud', 'behaviour'] },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          status: { type: 'string', enum: ['open', 'investigating', 'escalated', 'closed_false_positive', 'closed_true_positive', 'str_filed'] },
          title: { type: 'string' },
          summary: { type: 'string' },
          customer_id: { type: 'string', format: 'uuid' },
          sla_due_at: { type: 'string', format: 'date-time' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Case: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          reference: { type: 'string', example: 'CASE-2026-00001' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['open', 'closed'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          customer_id: { type: 'string', format: 'uuid' },
          owner_id: { type: 'string', format: 'uuid' },
          alert_ids: { type: 'array', items: { type: 'string' } },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      STRReport: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          reference: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'review', 'filed', 'rejected'] },
          report_type: { type: 'string', enum: ['STR', 'CTR'] },
          subject_name: { type: 'string' },
          amount_reported: { type: 'number' },
          currency_reported: { type: 'string' },
          filed_with: { type: 'string', example: 'NFIU' },
          filed_at: { type: 'string', format: 'date-time' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      UsageSummary: {
        type: 'object',
        properties: {
          plan: { type: 'string' },
          sandbox: { type: 'boolean' },
          period: { type: 'string', example: '2026-11' },
          metrics: {
            type: 'object',
            properties: {
              screens:      { $ref: '#/components/schemas/MetricUsage' },
              transactions: { $ref: '#/components/schemas/MetricUsage' },
              api_calls:    { $ref: '#/components/schemas/MetricUsage' },
              cases:        { $ref: '#/components/schemas/MetricUsage' },
              users:        { $ref: '#/components/schemas/MetricUsage' },
              customers:    { $ref: '#/components/schemas/MetricUsage' },
            },
          },
        },
      },
      MetricUsage: {
        type: 'object',
        properties: {
          used: { type: 'integer' },
          limit: { type: 'integer', description: '-1 means unlimited' },
        },
      },
      Webhook: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          url: { type: 'string', format: 'uri' },
          events: { type: 'array', items: { type: 'string' } },
          secret: { type: 'string' },
          active: { type: 'boolean' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
    },
    responses: {
      Unauthorized:   { description: 'Missing or invalid token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Forbidden:      { description: 'Insufficient role', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NotFound:       { description: 'Resource not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      LimitExceeded:  { description: 'Monthly plan limit reached', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Validation:     { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
  },
  paths: {

    // ── Auth ────────────────────────────────────────────────────────────────
    '/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Log in', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['email', 'password'],
          properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' }, totp_code: { type: 'string', description: 'Required if 2FA is enabled' } },
        } } } },
        responses: {
          200: { description: 'Token issued or 2FA challenge', content: { 'application/json': { schema: {
            type: 'object',
            properties: { token: { type: 'string' }, user: { $ref: '#/components/schemas/User' }, totp_required: { type: 'boolean' } },
          } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/signup': {
      post: {
        tags: ['Auth'], summary: 'Create the first tenant + admin user', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['tenant_name', 'email', 'password', 'name'],
          properties: { tenant_name: { type: 'string' }, email: { type: 'string', format: 'email' }, password: { type: 'string' }, name: { type: 'string' } },
        } } } },
        responses: {
          201: { description: 'Tenant and admin user created', content: { 'application/json': { schema: {
            type: 'object', properties: { token: { type: 'string' }, user: { $ref: '#/components/schemas/User' } },
          } } } },
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'], summary: 'Request a password-reset email', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } },
        } } } },
        responses: { 200: { description: 'Always 200 (anti-enumeration)' } },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'], summary: 'Complete password reset with token', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['token', 'password'],
          properties: { token: { type: 'string' }, password: { type: 'string' } },
        } } } },
        responses: { 200: { description: 'Password reset successfully' }, 400: { description: 'Invalid or expired token' } },
      },
    },
    '/auth/change-password': {
      post: {
        tags: ['Auth'], summary: 'Change own password (authenticated)',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['current_password', 'new_password'],
          properties: { current_password: { type: 'string' }, new_password: { type: 'string' } },
        } } } },
        responses: { 200: { description: 'Password changed' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
    },
    '/auth/sessions': {
      get: {
        tags: ['Auth'], summary: 'List active sessions for the current user',
        responses: { 200: { description: 'Session list', content: { 'application/json': { schema: {
          type: 'array', items: { type: 'object', properties: {
            id: { type: 'string' }, ip: { type: 'string' }, user_agent: { type: 'string' },
            last_seen_at: { type: 'string', format: 'date-time' }, current: { type: 'boolean' },
          } },
        } } } } },
      },
    },
    '/auth/sessions/{id}': {
      delete: {
        tags: ['Auth'], summary: 'Revoke a specific session',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Session revoked' } },
      },
    },
    '/auth/sessions/revoke-all': {
      post: {
        tags: ['Auth'], summary: 'Revoke all sessions except the current one',
        responses: { 200: { description: 'All other sessions revoked' } },
      },
    },
    '/auth/2fa/setup': {
      post: { tags: ['Auth'], summary: 'Generate a TOTP secret and QR code', responses: { 200: { description: 'QR code and secret for authenticator app' } } },
    },
    '/auth/2fa/verify': {
      post: {
        tags: ['Auth'], summary: 'Confirm and activate 2FA',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['code'], properties: { code: { type: 'string', minLength: 6, maxLength: 6 } },
        } } } },
        responses: { 200: { description: '2FA activated' } },
      },
    },
    '/auth/2fa/disable': {
      post: {
        tags: ['Auth'], summary: 'Disable 2FA',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', properties: { code: { type: 'string' }, password: { type: 'string' } },
        } } } },
        responses: { 200: { description: '2FA disabled' } },
      },
    },

    // ── Screening ───────────────────────────────────────────────────────────
    '/screen': {
      post: {
        tags: ['Screening'], summary: 'Screen a name against sanctions / PEP / watchlists',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ScreeningRequest' } } } },
        responses: {
          200: { description: 'Screening result', content: { 'application/json': { schema: { $ref: '#/components/schemas/ScreeningResult' } } } },
          429: { $ref: '#/components/responses/LimitExceeded' },
        },
      },
      get: {
        tags: ['Screening'], summary: 'List past screenings',
        parameters: [
          { name: 'customer_id', in: 'query', schema: { type: 'string' } },
          { name: 'outcome', in: 'query', schema: { type: 'string', enum: ['clear', 'potential_match', 'confirmed_match'] } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: { 200: { description: 'List of screenings', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ScreeningResult' } } } } } },
      },
    },
    '/screen/batch': {
      post: {
        tags: ['Screening'], summary: 'Screen up to 500 names in one request',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['items'],
          properties: { items: { type: 'array', maxItems: 500, items: { $ref: '#/components/schemas/ScreeningRequest' } } },
        } } } },
        responses: { 200: { description: 'Batch results summary' } },
      },
    },
    '/screen/bulk': {
      post: {
        tags: ['Screening'], summary: 'Screen a plain-text list of names (CSV or newline-separated)',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['names'],
          properties: {
            names: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
            threshold: { type: 'number' },
            format: { type: 'string', enum: ['json', 'csv'], default: 'json' },
          },
        } } } },
        responses: {
          200: { description: 'Bulk screening results (JSON or CSV download)' },
        },
      },
    },
    '/screen/export': {
      get: {
        tags: ['Screening', 'Export'], summary: 'Download screenings as CSV',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'outcome', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'CSV file download', content: { 'text/csv': { schema: { type: 'string' } } } } },
      },
    },
    '/screen/{id}': {
      get: {
        tags: ['Screening'], summary: 'Get a single screening result',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Screening result', content: { 'application/json': { schema: { $ref: '#/components/schemas/ScreeningResult' } } } }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },

    // ── Customers ───────────────────────────────────────────────────────────
    '/customers': {
      post: {
        tags: ['Customers'], summary: 'Onboard a new customer',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['full_name', 'customer_type'],
          properties: {
            full_name: { type: 'string' }, customer_type: { type: 'string', enum: ['individual', 'corporate'] },
            external_ref: { type: 'string' }, dob: { type: 'string', format: 'date' },
            nationality: { type: 'string' }, residence_country: { type: 'string' },
            id_type: { type: 'string' }, id_number: { type: 'string' },
            occupation: { type: 'string' }, industry: { type: 'string' },
            expected_monthly_turnover: { type: 'number' },
            screen: { type: 'boolean', default: true, description: 'Run sanctions screening on creation' },
          },
        } } } },
        responses: {
          201: { description: 'Customer created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } } },
          429: { $ref: '#/components/responses/LimitExceeded' },
        },
      },
      get: {
        tags: ['Customers'], summary: 'List customers',
        parameters: [
          { name: 'kyc_status', in: 'query', schema: { type: 'string' } },
          { name: 'risk_level', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
        ],
        responses: { 200: { description: 'Customer list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Customer' } } } } } },
      },
    },
    '/customers/export': {
      get: {
        tags: ['Customers', 'Export'], summary: 'Download customers as CSV',
        parameters: [
          { name: 'kyc_status', in: 'query', schema: { type: 'string' } },
          { name: 'risk_level', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'CSV file download', content: { 'text/csv': { schema: { type: 'string' } } } } },
      },
    },
    '/customers/{id}': {
      get: {
        tags: ['Customers'], summary: 'Get a customer',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Customer detail', content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } } }, 404: { $ref: '#/components/responses/NotFound' } },
      },
      patch: {
        tags: ['Customers'], summary: 'Update a customer',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } } },
        responses: { 200: { description: 'Updated customer' } },
      },
    },
    '/customers/{id}/rescore': {
      post: {
        tags: ['Customers'], summary: 'Recalculate risk score for a customer',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Updated risk profile' } },
      },
    },

    // ── Transactions ────────────────────────────────────────────────────────
    '/transactions': {
      post: {
        tags: ['Transactions'], summary: 'Submit a transaction for real-time monitoring',
        description: 'Evaluates the transaction against all enabled rules, optionally screens the counterparty, and returns a decision in under 100ms.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Transaction' } } } },
        responses: {
          200: { description: 'Transaction decision', content: { 'application/json': { schema: { $ref: '#/components/schemas/TransactionResult' } } } },
          429: { $ref: '#/components/responses/LimitExceeded' },
        },
      },
      get: {
        tags: ['Transactions'], summary: 'List transactions',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'customer_id', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
        ],
        responses: { 200: { description: 'Transaction list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/TransactionResult' } } } } } },
      },
    },
    '/transactions/ingest/{system}': {
      post: {
        tags: ['Transactions'], summary: 'Ingest a raw core-banking payload',
        parameters: [{ name: 'system', in: 'path', required: true, schema: { type: 'string', example: 'flexcube' }, description: 'Supported: flexcube, finacle, t24, mambu, mifos, sabre, oracle_fss, metalogic_bvn' }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', description: 'Raw payload in the named core-banking format' } } } },
        responses: { 200: { description: 'Mapped transaction and monitoring result' } },
      },
    },
    '/transactions/batch': {
      post: {
        tags: ['Transactions'], summary: 'Submit up to 5000 transactions in one batch',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['items'],
          properties: { items: { type: 'array', maxItems: 5000, items: { $ref: '#/components/schemas/Transaction' } } },
        } } } },
        responses: { 200: { description: 'Batch summary: accepted / flagged / held / blocked counts' } },
      },
    },
    '/transactions/export': {
      get: {
        tags: ['Transactions', 'Export'], summary: 'Download transactions as CSV',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'CSV file download', content: { 'text/csv': { schema: { type: 'string' } } } } },
      },
    },

    // ── Alerts ──────────────────────────────────────────────────────────────
    '/alerts': {
      get: {
        tags: ['Alerts'], summary: 'List alerts',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'severity', in: 'query', schema: { type: 'string' } },
          { name: 'alert_type', in: 'query', schema: { type: 'string' } },
          { name: 'customer_id', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
        ],
        responses: { 200: { description: 'Alert list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Alert' } } } } } },
      },
    },
    '/alerts/{id}': {
      get: {
        tags: ['Alerts'], summary: 'Get an alert with linked customer and transaction',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Alert detail' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/alerts/{id}/transition': {
      post: {
        tags: ['Alerts'], summary: 'Transition an alert through the workflow',
        description: 'Valid transitions: open → investigating → escalated → closed_false_positive / closed_true_positive / str_filed',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['investigating', 'escalated', 'closed_false_positive', 'closed_true_positive', 'str_filed'] },
            note: { type: 'string' },
            assigned_to: { type: 'string', format: 'uuid' },
          },
        } } } },
        responses: { 200: { description: 'Updated alert' }, 400: { description: 'Invalid transition' } },
      },
    },

    // ── Cases ───────────────────────────────────────────────────────────────
    '/cases': {
      get: {
        tags: ['Cases'], summary: 'List investigation cases',
        responses: { 200: { description: 'Case list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Case' } } } } } },
      },
      post: {
        tags: ['Cases'], summary: 'Open a new investigation case',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['title'],
          properties: {
            title: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
            customer_id: { type: 'string', format: 'uuid' },
            alert_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
          },
        } } } },
        responses: { 201: { description: 'Case created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Case' } } } }, 429: { $ref: '#/components/responses/LimitExceeded' } },
      },
    },
    '/cases/{id}/note': {
      post: {
        tags: ['Cases'], summary: 'Add a note or update case status',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['note'],
          properties: { note: { type: 'string' }, status: { type: 'string' }, outcome: { type: 'string' } },
        } } } },
        responses: { 200: { description: 'Updated case' } },
      },
    },

    // ── STR / CTR Reports ───────────────────────────────────────────────────
    '/str-reports': {
      get: { tags: ['STR Reports'], summary: 'List STR / CTR reports', responses: { 200: { description: 'Report list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/STRReport' } } } } } } },
      post: {
        tags: ['STR Reports'], summary: 'Create a new STR / CTR draft',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object',
          properties: {
            report_type: { type: 'string', enum: ['STR', 'CTR'], default: 'STR' },
            customer_id: { type: 'string', format: 'uuid' },
            alert_ids: { type: 'array', items: { type: 'string' } },
            subject_name: { type: 'string' }, subject_account: { type: 'string' }, subject_country: { type: 'string' },
            amount_reported: { type: 'number' }, currency_reported: { type: 'string' },
            grounds_for_suspicion: { type: 'string' }, nature_of_suspicious_activity: { type: 'string' }, actions_taken: { type: 'string' },
            filed_with: { type: 'string', example: 'NFIU' },
          },
        } } } },
        responses: { 201: { description: 'STR draft created' } },
      },
    },
    '/str-reports/{id}': {
      get: {
        tags: ['STR Reports'], summary: 'Get a report',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Report detail' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
      patch: {
        tags: ['STR Reports'], summary: 'Update a draft report or change status',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/STRReport' } } } },
        responses: { 200: { description: 'Updated report' } },
      },
    },

    // ── Admin ───────────────────────────────────────────────────────────────
    '/admin/users': {
      get: { tags: ['Admin'], summary: 'List users in this tenant', responses: { 200: { description: 'User list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } } } },
      post: {
        tags: ['Admin'], summary: 'Create a user',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['email', 'name', 'role', 'password'],
          properties: { email: { type: 'string', format: 'email' }, name: { type: 'string' }, role: { type: 'string' }, password: { type: 'string' } },
        } } } },
        responses: { 201: { description: 'User created' } },
      },
    },
    '/admin/users/{id}': {
      patch: {
        tags: ['Admin'], summary: 'Update a user',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { role: { type: 'string' }, active: { type: 'boolean' } } } } } },
        responses: { 200: { description: 'Updated user' } },
      },
    },
    '/admin/api-keys': {
      get: { tags: ['Admin'], summary: 'List API keys', responses: { 200: { description: 'Key list' } } },
      post: {
        tags: ['Admin'], summary: 'Generate a new API key',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { label: { type: 'string' } } } } } },
        responses: { 200: { description: 'Key (shown once) + prefix' } },
      },
    },
    '/admin/api-keys/{id}': {
      delete: {
        tags: ['Admin'], summary: 'Revoke an API key',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Key revoked' } },
      },
    },
    '/admin/usage': {
      get: {
        tags: ['Admin'], summary: 'Get current plan usage vs limits',
        responses: { 200: { description: 'Usage summary', content: { 'application/json': { schema: { $ref: '#/components/schemas/UsageSummary' } } } } },
      },
    },
    '/admin/tenant': {
      get: { tags: ['Admin'], summary: 'Get tenant profile and settings', responses: { 200: { description: 'Tenant detail', content: { 'application/json': { schema: { $ref: '#/components/schemas/Tenant' } } } } } },
    },
    '/admin/tenant/settings': {
      put: {
        tags: ['Admin'], summary: 'Update tenant settings',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Updated settings' } },
      },
    },
    '/admin/rules': {
      get: { tags: ['Admin'], summary: 'List transaction monitoring rules', responses: { 200: { description: 'Rules list' } } },
      post: {
        tags: ['Admin'], summary: 'Create a rule',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['code', 'name', 'definition'],
          properties: {
            code: { type: 'string' }, name: { type: 'string' }, category: { type: 'string' },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            definition: { type: 'object' }, enabled: { type: 'boolean', default: true },
          },
        } } } },
        responses: { 201: { description: 'Rule created' } },
      },
    },
    '/admin/rules/library': {
      get: { tags: ['Admin'], summary: 'List built-in rule templates', responses: { 200: { description: 'Rule templates' } } },
    },
    '/admin/rules/test': {
      post: {
        tags: ['Admin'], summary: 'Test a rule definition against a sample transaction',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['definition', 'transaction'], properties: { definition: { type: 'object' }, transaction: { $ref: '#/components/schemas/Transaction' } } } } } },
        responses: { 200: { description: 'Rule evaluation result' } },
      },
    },
    '/admin/webhooks': {
      get: { tags: ['Webhooks'], summary: 'List webhooks', responses: { 200: { description: 'Webhook list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Webhook' } } } } } } },
      post: {
        tags: ['Webhooks'], summary: 'Register a webhook endpoint',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['url', 'events'],
          properties: {
            url: { type: 'string', format: 'uri' },
            events: { type: 'array', items: { type: 'string' }, example: ['alert.created', 'case.created', 'str.submitted'] },
          },
        } } } },
        responses: { 201: { description: 'Webhook registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/Webhook' } } } } },
      },
    },
    '/admin/webhooks/{id}': {
      patch: {
        tags: ['Webhooks'], summary: 'Update a webhook',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { url: { type: 'string' }, events: { type: 'array', items: { type: 'string' } }, active: { type: 'boolean' } } } } } },
        responses: { 200: { description: 'Updated webhook' } },
      },
      delete: {
        tags: ['Webhooks'], summary: 'Delete a webhook',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Webhook deleted' } },
      },
    },
    '/admin/webhooks/{id}/deliveries': {
      get: {
        tags: ['Webhooks'], summary: 'Get delivery history for a webhook',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Delivery log' } },
      },
    },
    '/admin/webhooks/{id}/deliveries/{deliveryId}/retry': {
      post: {
        tags: ['Webhooks'], summary: 'Retry a failed delivery',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'deliveryId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Delivery requeued' } },
      },
    },
    '/admin/audit': {
      get: {
        tags: ['Audit'], summary: 'Query the immutable audit log',
        parameters: [
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'actor_id', in: 'query', schema: { type: 'string' } },
          { name: 'resource_type', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
        ],
        responses: { 200: { description: 'Audit log entries' } },
      },
    },
    '/admin/audit/verify': {
      get: { tags: ['Audit'], summary: 'Verify the hash chain integrity of the audit log', responses: { 200: { description: 'Chain verification result' } } },
    },
    '/admin/audit/export': {
      get: {
        tags: ['Audit', 'Export'], summary: 'Download audit log as CSV',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'CSV file download', content: { 'text/csv': { schema: { type: 'string' } } } } },
      },
    },

    // ── Lists ───────────────────────────────────────────────────────────────
    '/lists': {
      get: { tags: ['Lists'], summary: 'List all screening list sources', responses: { 200: { description: 'List sources' } } },
    },
    '/lists/{code}/sync': {
      post: {
        tags: ['Lists'], summary: 'Trigger an immediate sync for a list source',
        parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Sync result' } },
      },
    },

    // ── Country risk ────────────────────────────────────────────────────────
    '/country-risk': {
      get: { tags: ['Country Risk'], summary: 'Get country risk scores', responses: { 200: { description: 'Country risk table' } } },
    },

    // ── Dashboards ──────────────────────────────────────────────────────────
    '/dashboards/overview': {
      get: { tags: ['Dashboards'], summary: 'Overview KPIs: open alerts, cases, flagged transactions', responses: { 200: { description: 'Dashboard data' } } },
    },
  },
  tags: [
    { name: 'Auth', description: 'Login, signup, 2FA, session management, password reset' },
    { name: 'Screening', description: 'Sanctions, PEP and watchlist screening' },
    { name: 'Customers', description: 'Customer onboarding, KYC and risk management' },
    { name: 'Transactions', description: 'Real-time transaction monitoring and rule evaluation' },
    { name: 'Alerts', description: 'AML alert workflow management' },
    { name: 'Cases', description: 'Investigation case management' },
    { name: 'STR Reports', description: 'Suspicious Transaction Report filing' },
    { name: 'Admin', description: 'Users, API keys, rules, usage, tenant settings' },
    { name: 'Webhooks', description: 'Webhook registration and delivery management' },
    { name: 'Audit', description: 'Tamper-evident audit log' },
    { name: 'Lists', description: 'Screening list registry and sync management' },
    { name: 'Country Risk', description: 'FATF and country risk scoring' },
    { name: 'Dashboards', description: 'KPI and summary data' },
    { name: 'Export', description: 'CSV data exports for all major entities' },
  ],
};
