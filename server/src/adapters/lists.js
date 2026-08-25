// List ingestion adapters. Each returns normalised entries: {external_id, entity_type, primary_name, aliases[], dobs[], nationalities[], countries[], identifiers[], addresses[], programs[], remarks, listed_on}
// Real fetch URLs are included; when LIST_FETCH_ENABLED=false (air-gapped / demo) fixtures are used.
import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const xml = new XMLParser({ ignoreAttributes: false });
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

export const SOURCE_URLS = {
  'OFAC_SDN':   'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML',
  'OFAC_CONS':  'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/CONS_ADVANCED.XML',
  'UN_CONS':    'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
  'UK_OFSI':    'https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv',
  'EU_FSF':     'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw',
  'AU_DFAT':    'https://www.dfat.gov.au/sites/default/files/regulation8_sanctions.xlsx',
  'CH_SECO':    'https://www.sesam.search.admin.ch/sesam-search-web/pages/downloadXmlGesamtliste.xhtml?lang=en&action=downloadXmlGesamtlisteAction',
  'CA_SEMA':    'https://www.international.gc.ca/world-monde/assets/office_docs/international_relations-relations_internationales/sanctions/sema-lmes.xml',
  'INTERPOL_RED': 'https://ws-public.interpol.int/notices/v1/red',
  'NG_EFCC_WANTED': 'https://www.efcc.gov.ng/efcc/wanted',           // scrape adapter (HTML)
  'NG_NFIU_TFS':    'https://www.nfiu.gov.ng/',                       // Nigeria Sanctions Committee list (HTML/PDF)
  'WB_DEBARRED':    'https://apigwext.worldbank.org/dvsvc/v1.0/json/APPLICATION/ADOBE_EXPRNCE_MGR/FIRM/SANCTIONED_FIRM',
};

export async function fetchText(url) { const r = await fetch(url, { headers: { 'user-agent': 'EdgeVerify/0.1' } }); if (!r.ok) throw new Error(`${url} → ${r.status}`); return r.text(); }

export function parseOfacSdn(text) {
  const doc = xml.parse(text); const root = doc.sdnList || doc;
  return arr(root.sdnEntry).map(e => ({
    external_id: String(e.uid), entity_type: mapType(e.sdnType),
    primary_name: [e.firstName, e.lastName].filter(Boolean).join(' ').trim() || String(e.lastName || ''),
    aliases: arr(e.akaList?.aka).map(a => [a.firstName, a.lastName].filter(Boolean).join(' ')).filter(Boolean),
    dobs: arr(e.dateOfBirthList?.dateOfBirthItem).map(d => d.dateOfBirth), nationalities: arr(e.nationalityList?.nationality).map(n => n.country),
    countries: arr(e.addressList?.address).map(a => a.country).filter(Boolean),
    identifiers: arr(e.idList?.id).map(i => ({ type: i.idType, value: i.idNumber, country: i.idCountry })),
    addresses: arr(e.addressList?.address).map(a => [a.address1, a.city, a.country].filter(Boolean).join(', ')),
    programs: arr(e.programList?.program), remarks: e.remarks || '', listed_on: null,
  }));
}

export function parseUnConsolidated(text) {
  const doc = xml.parse(text); const root = doc.CONSOLIDATED_LIST || doc; const out = [];
  for (const i of arr(root.INDIVIDUALS?.INDIVIDUAL)) out.push({
    external_id: i.DATAID, entity_type: 'person', primary_name: [i.FIRST_NAME, i.SECOND_NAME, i.THIRD_NAME, i.FOURTH_NAME].filter(Boolean).join(' '),
    aliases: arr(i.INDIVIDUAL_ALIAS).map(a => a.ALIAS_NAME).filter(Boolean), dobs: arr(i.INDIVIDUAL_DATE_OF_BIRTH).map(d => d.DATE || d.YEAR).filter(Boolean),
    nationalities: arr(i.NATIONALITY?.VALUE), countries: arr(i.INDIVIDUAL_ADDRESS).map(a => a.COUNTRY).filter(Boolean),
    identifiers: arr(i.INDIVIDUAL_DOCUMENT).map(d => ({ type: d.TYPE_OF_DOCUMENT, value: d.NUMBER })), addresses: [],
    programs: [i.UN_LIST_TYPE].filter(Boolean), remarks: i.COMMENTS1 || '', listed_on: i.LISTED_ON,
  });
  for (const e of arr(root.ENTITIES?.ENTITY)) out.push({
    external_id: e.DATAID, entity_type: 'organisation', primary_name: e.FIRST_NAME, aliases: arr(e.ENTITY_ALIAS).map(a => a.ALIAS_NAME).filter(Boolean),
    dobs: [], nationalities: [], countries: arr(e.ENTITY_ADDRESS).map(a => a.COUNTRY).filter(Boolean), identifiers: [], addresses: [],
    programs: [e.UN_LIST_TYPE].filter(Boolean), remarks: e.COMMENTS1 || '', listed_on: e.LISTED_ON,
  });
  return out;
}

export function parseOfsiCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean); const hdrIdx = lines.findIndex(l => l.startsWith('Name 6'));
  const rows = lines.slice(hdrIdx + 1).map(l => l.split(',').map(s => s.replace(/^"|"$/g, '')));
  const byGroup = new Map();
  for (const r of rows) {
    const [n6, n1, n2, n3, n4, n5, title, aliasType, , , dob, , , nat, , , , , , , , , , , , , , , , , , , , , country, , , , , , groupType, aliasQuality, regime, listedOn, , groupId] = r;
    const name = [n1, n2, n3, n4, n5, n6].filter(Boolean).join(' ');
    if (!groupId || !name) continue;
    const g = byGroup.get(groupId) || { external_id: groupId, entity_type: /individual/i.test(groupType) ? 'person' : 'organisation', primary_name: null, aliases: [], dobs: [], nationalities: [], countries: [], identifiers: [], addresses: [], programs: [regime], remarks: '', listed_on: listedOn };
    if (aliasType === 'Primary name' && !g.primary_name) g.primary_name = name; else g.aliases.push(name);
    if (dob) g.dobs.push(dob); if (nat) g.nationalities.push(nat); if (country) g.countries.push(country);
    byGroup.set(groupId, g);
  }
  return [...byGroup.values()].map(g => ({ ...g, primary_name: g.primary_name || g.aliases.shift() }));
}

// Generic adapter: CSV or JSON with column mapping — lets any of the 1,259 catalogued sources be onboarded via config.
export function parseGeneric(text, mapping = {}) {
  const m = { name: 'name', aliases: 'aliases', dob: 'dob', nationality: 'nationality', country: 'country', entity_type: 'entity_type', id: 'id', program: 'program', ...mapping };
  let rows;
  try { rows = JSON.parse(text); rows = Array.isArray(rows) ? rows : rows.data || rows.results || []; }
  catch { const [h, ...ls] = text.split(/\r?\n/).filter(Boolean); const hd = h.split(','); rows = ls.map(l => Object.fromEntries(l.split(',').map((v, i) => [hd[i]?.trim(), v.trim()]))); }
  return rows.map((r, i) => ({ external_id: String(r[m.id] ?? i), entity_type: r[m.entity_type] || 'person', primary_name: r[m.name],
    aliases: String(r[m.aliases] || '').split(/;|\|/).map(s => s.trim()).filter(Boolean), dobs: [r[m.dob]].filter(Boolean),
    nationalities: [r[m.nationality]].filter(Boolean), countries: [r[m.country]].filter(Boolean), identifiers: [], addresses: [], programs: [r[m.program]].filter(Boolean), remarks: '', listed_on: null })).filter(e => e.primary_name);
}

export function loadFixture(name) { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8')); }

const mapType = (t) => ({ Individual: 'person', Entity: 'organisation', Vessel: 'vessel', Aircraft: 'aircraft' }[t] || 'organisation');

export const ADAPTERS = { ofac_sdn: parseOfacSdn, un_consolidated: parseUnConsolidated, uk_ofsi: parseOfsiCsv, generic: parseGeneric };
