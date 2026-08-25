// Name-screening engine: multi-signal scoring (token Jaro-Winkler, phonetic, sorted-token, initials,
// plus DOB / nationality corroboration). Returns 0-100 score with explanations for analyst review.
import natural from 'natural';
import { normalizeName, tokens, sortedKey, phoneticKeys } from './normalize.js';

const jw = (a, b) => natural.JaroWinklerDistance(a, b, { ignoreCase: true });

function tokenAlignment(qTokens, cTokens) {
  if (!qTokens.length || !cTokens.length) return 0;
  const [shorter, longer] = qTokens.length <= cTokens.length ? [qTokens, cTokens] : [cTokens, qTokens];
  const used = new Set(); let total = 0;
  for (const q of shorter) {
    let best = 0, bi = -1;
    longer.forEach((c, i) => { if (used.has(i)) return; const s = jw(q, c); if (s > best) { best = s; bi = i; } });
    if (bi >= 0) used.add(bi); total += best;
  }
  const coverage = shorter.length / longer.length;
  return (total / shorter.length) * (0.6 + 0.4 * coverage);
}

function phoneticOverlap(q, c) {
  const a = new Set(phoneticKeys(q)), b = new Set(phoneticKeys(c));
  if (!a.size || !b.size) return 0;
  let hit = 0; for (const k of a) if (b.has(k)) hit++;
  return hit / Math.min(a.size, b.size);
}

function yearOf(d) { const m = String(d || '').match(/(\d{4})/); return m ? Number(m[1]) : null; }

export function scoreNames(queryName, candidateName) {
  const qn = normalizeName(queryName), cn = normalizeName(candidateName);
  if (!qn || !cn) return 0;
  if (qn === cn) return 100;
  const qt = tokens(qn), ct = tokens(cn);
  const align = tokenAlignment(qt, ct);
  const sorted = jw(sortedKey(qn), sortedKey(cn));
  const phon = phoneticOverlap(qn, cn);
  const whole = jw(qn, cn);
  const score = 100 * (0.45 * align + 0.25 * sorted + 0.15 * phon + 0.15 * whole);
  return Math.round(score * 100) / 100;
}

/**
 * @param query { name, dob?, nationality?, country?, entityType? }
 * @param entry list_entries row (aliases parsed)
 * @param opts { threshold }
 */
export function scoreEntry(query, entry, opts = {}) {
  const names = [entry.primary_name, ...(entry.aliases || [])].filter(Boolean);
  let best = 0, bestName = entry.primary_name;
  for (const n of names) { const s = scoreNames(query.name, n); if (s > best) { best = s; bestName = n; } }
  const reasons = [`name similarity ${best}% vs "${bestName}"`];
  let adj = 0;

  if (query.entityType && entry.entity_type && query.entityType !== entry.entity_type) { adj -= 15; reasons.push('entity type differs'); }

  const qy = yearOf(query.dob);
  const eys = (entry.dobs || []).map(yearOf).filter(Boolean);
  if (qy && eys.length) {
    const diff = Math.min(...eys.map(y => Math.abs(y - qy)));
    if (diff === 0) { adj += 8; reasons.push('date of birth year matches'); }
    else if (diff <= 2) { adj += 2; reasons.push('date of birth within 2 years'); }
    else { adj -= 20; reasons.push(`date of birth differs by ${diff}y`); }
  }
  const qnat = (query.nationality || query.country || '').toUpperCase();
  const enat = [...(entry.nationalities || []), ...(entry.countries || [])].map(x => String(x).toUpperCase());
  if (qnat && enat.length) {
    if (enat.includes(qnat)) { adj += 5; reasons.push('nationality/country matches'); }
    else { adj -= 8; reasons.push('nationality/country differs'); }
  }
  const final = Math.max(0, Math.min(100, Math.round((best + adj) * 100) / 100));
  return { score: final, nameScore: best, matchedName: bestName, reasons };
}

export function candidateFilter(queryName) {
  // Cheap prefilter: share ≥1 phonetic key or ≥1 token prefix. Used to avoid scoring every entry.
  const pk = new Set(phoneticKeys(queryName));
  const tk = tokens(queryName).map(t => t.slice(0, 4));
  return (entry) => {
    const ek = entry.phonetic_keys || [];
    if (ek.some(k => pk.has(k))) return true;
    const nn = entry.name_normalized || '';
    return tk.some(p => p.length >= 3 && nn.includes(p));
  };
}
