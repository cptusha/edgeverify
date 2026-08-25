// Single consolidated migration; every business table carries tenant_id for multi-tenancy.
export async function up(db) {
  const has = (t) => db.schema.hasTable(t);

  if (!(await has('tenants'))) await db.schema.createTable('tenants', t => {
    t.string('id').primary(); t.string('name').notNullable(); t.string('plan').defaultTo('enterprise');
    t.json('risk_config'); t.json('settings'); t.timestamps(true, true);
  });

  if (!(await has('users'))) await db.schema.createTable('users', t => {
    t.string('id').primary(); t.string('tenant_id').index(); t.string('email').notNullable();
    t.string('name'); t.string('password_hash'); t.string('role').notNullable();
    t.boolean('active').defaultTo(true); t.timestamps(true, true);
    t.unique(['tenant_id', 'email']);
  });

  if (!(await has('api_keys'))) await db.schema.createTable('api_keys', t => {
    t.string('id').primary(); t.string('tenant_id').index(); t.string('label'); t.string('key_hash').index();
    t.string('prefix'); t.json('scopes'); t.timestamp('last_used_at'); t.boolean('active').defaultTo(true); t.timestamps(true, true);
  });

  if (!(await has('list_sources'))) await db.schema.createTable('list_sources', t => {
    t.string('code').primary(); t.string('slug').index(); t.string('name').notNullable(); t.string('list_type').index();
    t.string('country').index(); t.string('region').index(); t.integer('tier').defaultTo(3); t.string('origin');
    t.string('adapter').defaultTo('generic'); t.string('source_url'); t.integer('refresh_hours').defaultTo(24);
    t.boolean('enabled').defaultTo(false); t.timestamp('last_synced_at'); t.integer('entry_count').defaultTo(0); t.string('last_status');
  });

  if (!(await has('list_entries'))) await db.schema.createTable('list_entries', t => {
    t.string('id').primary(); t.string('source_code').index(); t.string('external_id');
    t.string('entity_type').index(); t.string('primary_name').notNullable(); t.string('name_normalized').index();
    t.json('aliases'); t.json('aliases_normalized'); t.json('phonetic_keys'); t.json('dobs'); t.json('nationalities');
    t.json('countries'); t.json('identifiers'); t.json('addresses'); t.json('programs'); t.text('remarks');
    t.string('pep_tier'); t.string('pep_role'); t.string('rca_of'); t.json('raw');
    t.timestamp('listed_on'); t.timestamp('delisted_on'); t.timestamps(true, true);
  });

  if (!(await has('customers'))) await db.schema.createTable('customers', t => {
    t.string('id').primary(); t.string('tenant_id').index(); t.string('external_ref').index(); t.string('customer_type');
    t.string('full_name').notNullable(); t.string('name_normalized').index(); t.date('dob'); t.string('nationality'); t.string('residence_country');
    t.string('id_type'); t.string('id_number'); t.string('occupation'); t.string('industry'); t.json('products'); t.string('channel');
    t.decimal('expected_monthly_turnover', 18, 2); t.json('ubos'); t.boolean('is_pep').defaultTo(false); t.boolean('is_rca').defaultTo(false);
    t.boolean('is_sip').defaultTo(false); t.boolean('adverse_media').defaultTo(false);
    t.integer('risk_score').defaultTo(0); t.string('risk_level').defaultTo('unrated'); t.json('risk_factors'); t.string('kyc_status').defaultTo('pending');
    t.string('monitoring_status').defaultTo('active'); t.timestamp('last_screened_at'); t.timestamp('next_review_at'); t.timestamps(true, true);
  });

  if (!(await has('screenings'))) await db.schema.createTable('screenings', t => {
    t.string('id').primary(); t.string('tenant_id').index(); t.string('customer_id').index(); t.string('context');
    t.string('query_name'); t.json('query'); t.integer('match_count'); t.decimal('top_score', 5, 2); t.string('outcome');
    t.json('matches'); t.integer('lists_screened'); t.integer('duration_ms'); t.string('requested_by'); t.timestamps(true, true);
  });

  if (!(await has('rules'))) await db.schema.createTable('rules', t => {
    t.string('id').primary(); t.string('tenant_id').index(); t.string('code').notNullable(); t.string('name'); t.text('description');
    t.string('category'); t.string('severity').defaultTo('medium'); t.json('definition').notNullable(); t.boolean('enabled').defaultTo(true);
    t.string('action').defaultTo('alert'); t.string('created_by'); t.timestamps(true, true); t.unique(['tenant_id', 'code']);
  });

  if (!(await has('transactions'))) await db.schema.createTable('transactions', t => {
    t.string('id').primary(); t.string('tenant_id').index(); t.string('external_ref').index(); t.string('customer_id').index();
    t.string('account_id').index(); t.string('direction'); t.string('tx_type');
    t.decimal('amount', 18, 2); t.string('currency'); t.decimal('amount_base', 18, 2);
    t.string('counterparty_name'); t.string('counterparty_account'); t.string('counterparty_bank'); t.string('counterparty_country');
    t.string('origin_country'); t.string('destination_country'); t.string('channel'); t.string('device_id'); t.string('ip_address');
    t.text('narrative'); t.timestamp('occurred_at').index(); t.string('status').defaultTo('cleared');
    t.json('rule_hits'); t.integer('risk_score').defaultTo(0); t.integer('latency_ms'); t.json('raw'); t.timestamps(true, true);
  });

  if (!(await has('alerts'))) await db.schema.createTable('alerts', t => {
    t.string('id').primary(); t.string('tenant_id').index(); t.string('alert_type'); t.string('severity').index(); t.string('status').defaultTo('open').index();
    t.string('customer_id').index(); t.string('transaction_id'); t.string('screening_id'); t.string('rule_code'); t.string('title');
    t.text('summary'); t.json('evidence'); t.string('assigned_to'); t.string('case_id'); t.timestamp('sla_due_at'); t.timestamp('resolved_at'); t.string('resolution_note'); t.timestamps(true, true);
  });

  if (!(await has('cases'))) await db.schema.createTable('cases', t => {
    t.string('id').primary(); t.string('tenant_id').index(); t.string('reference'); t.string('title'); t.string('status').defaultTo('open');
    t.string('priority'); t.string('customer_id'); t.string('owner_id'); t.json('alert_ids'); t.json('timeline'); t.string('outcome'); t.timestamps(true, true);
  });

  if (!(await has('audit_log'))) await db.schema.createTable('audit_log', t => {
    t.increments('seq'); t.string('id').index(); t.string('tenant_id').index(); t.string('actor_id'); t.string('actor_type');
    t.string('action').index(); t.string('resource_type'); t.string('resource_id'); t.json('before'); t.json('after'); t.string('ip'); t.string('user_agent');
    t.string('prev_hash'); t.string('hash'); t.timestamp('at').defaultTo(db.fn.now()).index();
  });

  if (!(await has('webhooks'))) await db.schema.createTable('webhooks', t => {
    t.string('id').primary(); t.string('tenant_id').index(); t.string('url'); t.json('events'); t.string('secret'); t.boolean('active').defaultTo(true); t.timestamps(true, true);
  });

  if (!(await has('country_risk'))) await db.schema.createTable('country_risk', t => {
    t.string('iso2').primary(); t.string('name'); t.integer('score'); t.string('band');
    t.boolean('fatf_blacklist').defaultTo(false); t.boolean('fatf_greylist').defaultTo(false); t.boolean('eu_high_risk').defaultTo(false);
  });
}
