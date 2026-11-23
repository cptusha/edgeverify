#!/usr/bin/env node
/**
 * Generates a Postman Collection v2.1 from the EdgeVerify OpenAPI spec.
 *
 * Usage:
 *   node server/scripts/gen-postman.js
 *   # Writes: EdgeVerify.postman_collection.json
 *
 * Import into Postman: File → Import → select the JSON file.
 * Set the `baseUrl` and `token` collection variables before running.
 */
import { writeFileSync } from 'node:fs';
import { openApiSpec } from '../src/openapi.js';

const spec = openApiSpec;
const baseVar = '{{baseUrl}}';

// ── helpers ──────────────────────────────────────────────────────────────────

function methodColor(m) {
  return { get: '#00b0f0', post: '#49cc90', put: '#fca130', patch: '#50e3c2', delete: '#f93e3e' }[m] || '#888';
}

function buildHeaders(op) {
  const headers = [{ key: 'Content-Type', value: 'application/json' }];
  const needsAuth = !op.security || !op.security.find(s => Object.keys(s).length === 0);
  if (needsAuth !== false) {
    headers.push({ key: 'Authorization', value: 'Bearer {{token}}' });
  }
  return headers.map(h => ({ key: h.key, value: h.value, type: 'text' }));
}

function schemaToExample(schema, spec, depth = 0) {
  if (!schema || depth > 4) return {};
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop();
    return schemaToExample(spec.components?.schemas?.[name], spec, depth + 1);
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.type === 'object' || schema.properties) {
    const out = {};
    for (const [k, v] of Object.entries(schema.properties || {})) {
      if (schema.required?.includes(k) || depth === 0) {
        out[k] = schemaToExample(v, spec, depth + 1);
      }
    }
    return out;
  }
  if (schema.type === 'array') return [schemaToExample(schema.items, spec, depth + 1)];
  if (schema.enum) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;
  const defaults = { string: '', integer: 0, number: 0, boolean: false };
  if (schema.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
  if (schema.format === 'email') return 'user@example.com';
  if (schema.format === 'date') return '2026-01-01';
  if (schema.format === 'date-time') return '2026-01-01T00:00:00Z';
  if (schema.format === 'uri') return 'https://example.com/webhook';
  return defaults[schema.type] ?? null;
}

function buildBody(op, spec) {
  const rb = op.requestBody;
  if (!rb) return undefined;
  const schema = rb.content?.['application/json']?.schema;
  if (!schema) return undefined;
  const example = schemaToExample(schema, spec);
  return {
    mode: 'raw',
    raw: JSON.stringify(example, null, 2),
    options: { raw: { language: 'json' } },
  };
}

function buildUrl(pathStr, op, params) {
  // Replace path params with Postman variables
  let raw = `${baseVar}/v1${pathStr}`.replace(/{(\w+)}/g, (_, n) => `:${n}`);

  const queryParams = (params || [])
    .concat(op.parameters || [])
    .filter(p => p.in === 'query')
    .map(p => ({ key: p.name, value: '', disabled: true, description: p.description }));

  const pathVars = (params || [])
    .concat(op.parameters || [])
    .filter(p => p.in === 'path')
    .map(p => ({ key: p.name, value: `<${p.name}>` }));

  return { raw, variable: pathVars, query: queryParams };
}

// ── build items (grouped by tag) ─────────────────────────────────────────────

const tagMap = {};  // tag → [item]

for (const [pathStr, pathObj] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(pathObj)) {
    if (typeof op !== 'object' || !op.tags) continue;
    const tag = op.tags[0] || 'General';
    if (!tagMap[tag]) tagMap[tag] = [];

    const item = {
      name: op.summary || `${method.toUpperCase()} ${pathStr}`,
      request: {
        method: method.toUpperCase(),
        header: buildHeaders(op),
        url: buildUrl(pathStr, op, pathObj.parameters),
        description: op.description || '',
        body: buildBody(op, spec),
      },
      response: [],
    };

    tagMap[tag].push(item);
  }
}

// ── assemble collection ───────────────────────────────────────────────────────

const collection = {
  info: {
    name: 'EdgeVerify API',
    description: `EdgeVerify — AML / sanctions screening, transaction monitoring & KYC risk engine.\n\nBuilt by Secure Edge Technologies Limited (SETS).\n\n## Setup\n1. Set the \`baseUrl\` variable (e.g. https://api.edgeverify.io or http://localhost:3000)\n2. Log in via the **Auth / Log in** request and copy the returned token into the \`token\` variable\n3. All subsequent requests will authenticate automatically`,
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    version: { major: 1, minor: 0, patch: 0 },
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000', type: 'string' },
    { key: 'token',   value: '', type: 'string', description: 'JWT from POST /v1/auth/login' },
  ],
  auth: {
    type: 'bearer',
    bearer: [{ key: 'token', value: '{{token}}', type: 'string' }],
  },
  item: Object.entries(tagMap).map(([tag, items]) => ({
    name: tag,
    item: items,
  })),
};

const outPath = new URL('../../EdgeVerify.postman_collection.json', import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(collection, null, 2));
console.log(`Postman collection written to ${outPath}`);
console.log(`  ${Object.values(tagMap).flat().length} requests across ${Object.keys(tagMap).length} folders`);
