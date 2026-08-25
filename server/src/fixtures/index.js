// Maps catalogue codes → bundled fixture files. Codes are 'LS-' + sha1(name)[:8] from data/list_catalog.json.
// Fixture contents are SYNTHETIC demo records for offline/air-gapped evaluation — never treat them as real designations.
export const FIXTURES = {
  'LS-7D41BF56': 'ofac_sdn.json',        // US Department of The Treasury OFAC SDN List
  'LS-5A022320': 'un_consolidated.json', // United Nations Sanctions (UN)
  'LS-B0D28FB5': 'uk_ofsi.json',         // UK HM Treasury OFSI
  'LS-1D5CF011': 'eu_fsf.json',          // EEAS Consolidated
  'LS-E14B0A20': 'ng_efcc_wanted.json',  // Nigeria EFCC Wanted
  'LS-1411804A': 'interpol_red.json',    // Interpol Red Notices
  'LS-787E20BA': 'fatf.json',            // FATF High Risk & Monitored
  'LS-PEP-GLOBAL': 'pep_global.json',    // EdgeVerify PEP/RCA/SIP register (own source, added at seed)
};
