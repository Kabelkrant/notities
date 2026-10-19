import { csrf } from './state.js';

export async function api(payload, opts = {}) {
  const res = await fetch('api.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify(payload),
    keepalive: opts.keepalive || false,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) location.reload(); // sessie verlopen: inlogscherm
  if (!res.ok) throw Object.assign(new Error(data.error || `Fout ${res.status}`), { status: res.status });
  return data;
}
