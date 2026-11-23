const KEY = 'ev.session';
export const session = {
  get: () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  set: (s) => localStorage.setItem(KEY, JSON.stringify(s)),
  clear: () => localStorage.removeItem(KEY),
};
export async function api(path, { method = 'GET', body, params } = {}) {
  const s = session.get();
  const qs = params ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))) : '';
  const r = await fetch(`/v1${path}${qs}`, { method, headers: { 'content-type': 'application/json', ...(s?.token ? { authorization: `Bearer ${s.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/auth/login') { session.clear(); location.href = '/login'; }
  if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { status: r.status, issues: data.issues });
  return data;
}
// Download a CSV export — triggers browser file save
export async function downloadCsv(path, filename, params) {
  const s = session.get();
  const qs = params ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))) : '';
  const r = await fetch(`/v1${path}${qs}`, { headers: { ...(s?.token ? { authorization: `Bearer ${s.token}` } : {}) } });
  if (!r.ok) throw new Error('Export failed');
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const fmt = {
  n: (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }),
  money: (v, c = '') => `${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${c}`.trim(),
  dt: (v) => v ? new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—',
  d: (v) => v ? new Date(v).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—',
  ago: (v) => { if (!v) return '—'; const m = (Date.now() - new Date(v)) / 60000; return m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; },
};
