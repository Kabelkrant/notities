import { $ } from './ui.js';
import { api } from './api.js';

const dlg = $('aboutDialog'), statusEl = $('aboutStatus'), updateBtn = $('updateBtn'), err = $('updateError');
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }) : '';

function showError(msg) { err.textContent = msg; err.hidden = !msg; }

function render(info) {
  $('aboutTitle').textContent = info.name;
  const v = info.version, c = info.check, l = c.latest;
  $('aboutVersion').textContent = v.short ? v.short + (v.date ? ` (${fmtDate(v.date)})` : '') : 'onbekend';
  const latest = $('aboutLatest');
  latest.replaceChildren();
  if (l) {
    const a = Object.assign(document.createElement('a'), { href: info.repo, target: '_blank', rel: 'noopener noreferrer', textContent: 'GitHub' });
    latest.append('Nieuwste op ', a, `: ${l.short} – ${l.message}${l.date ? ` (${fmtDate(l.date)})` : ''}`);
  }
  const updatable = c.state === 'update' || (c.state === 'unknown' && !v.short);
  statusEl.classList.toggle('update', updatable);
  statusEl.textContent = {
    current: 'Je hebt de nieuwste versie.',
    update: 'Er is een update beschikbaar.',
    unknown: v.short ? 'Deze versie is niet op GitHub gevonden (nog niet gepusht?).' : 'Je versie is onbekend; er kan een update beschikbaar zijn.',
    newer: 'Deze installatie loopt voor op GitHub.',
    error: 'Controleren mislukt: ' + (c.message || 'onbekende fout'),
  }[c.state] || '';
  updateBtn.disabled = !updatable || !!info.blocked;
  updateBtn.title = updatable && info.blocked ? info.blocked : '';
  if (updatable && info.blocked) showError(info.blocked);
}

export async function openAbout() {
  showError('');
  updateBtn.disabled = true; // pas actief als de controle een update meldt
  updateBtn.title = '';
  statusEl.textContent = 'Controleren op updates…';
  statusEl.classList.remove('update');
  $('aboutVersion').textContent = '…';
  $('aboutLatest').replaceChildren();
  dlg.showModal();
  try {
    const res = await fetch('api.php?about=1', { cache: 'no-store' });
    if (res.status === 401) return location.reload();
    if (!res.ok) throw new Error(`Fout ${res.status}`);
    render(await res.json());
  } catch (e) {
    statusEl.textContent = 'Controleren mislukt: ' + e.message;
  }
}

$('aboutClose').addEventListener('click', () => dlg.close());
updateBtn.addEventListener('click', async () => {
  showError('');
  updateBtn.disabled = true;
  statusEl.classList.remove('update');
  statusEl.textContent = 'Bijwerken… even geduld';
  try {
    const { version } = await api({ action: 'self_update' });
    statusEl.textContent = `Bijgewerkt naar ${version.short}. De pagina wordt herladen…`;
    setTimeout(() => location.reload(), 1200);
  } catch (e) {
    statusEl.textContent = '';
    showError(e.message);
    updateBtn.disabled = false;
  }
});
