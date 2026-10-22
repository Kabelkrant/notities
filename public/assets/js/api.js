import { csrf } from './state.js';

export async function api(payload, opts = {}) {
  const res = await fetch('api.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify(payload),
    keepalive: opts.keepalive || false,
    signal: AbortSignal.timeout(30000), // een hangende verbinding mag het opslaan en het wisselen van notitie niet eindeloos blokkeren
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) location.reload(); // sessie verlopen: inlogscherm
  if (!res.ok) throw Object.assign(new Error(data.error || `Fout ${res.status}`), { status: res.status });
  return data;
}
