import natural from 'natural';

const STOP = new Set(['mr','mrs','ms','dr','the','of','and','ltd','limited','llc','inc','plc','co','company','corp','corporation','sa','ag','gmbh','bv','nv','ltda','alhaji','chief','hon','engr','al','el','bin','ibn','de','da','do','du','von','van','der']);
const HONORIFIC_KEEP_MIN_TOKENS = 2;

export function normalizeName(input = '') {
  return String(input)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')   // strip diacritics
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(name) {
  const t = normalizeName(name).split(' ').filter(Boolean);
  const kept = t.filter(x => !STOP.has(x));
  return kept.length >= HONORIFIC_KEEP_MIN_TOKENS ? kept : t;
}

export function sortedKey(name) { return tokens(name).sort().join(' '); }

const dm = new natural.DoubleMetaphone();
export function phoneticKeys(name) {
  const keys = new Set();
  for (const tok of tokens(name)) {
    const [p, s] = dm.process(tok);
    if (p) keys.add(p); if (s) keys.add(s);
  }
  return [...keys];
}

export function initials(name) { return tokens(name).map(t => t[0]).join(''); }
