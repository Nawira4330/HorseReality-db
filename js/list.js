let allHorses = [];
let currentSort = { field: 'name', dir: 'asc' };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  document.querySelector('#session-email').textContent = `Angemeldet als: ${displayIdentity(session.user.email)}`;

  showFlashBanner();

  document.querySelector('#apply-filters-btn').addEventListener('click', render);
  document.querySelector('#reset-filters-btn').addEventListener('click', resetFilters);
  document.querySelector('#check-links-btn').addEventListener('click', runLinkCheck);
  document.querySelectorAll('#horse-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (currentSort.field === field) currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
      else currentSort = { field, dir: 'asc' };
      render();
    });
  });

  await loadHorses();
  populateFilterOptions();
  render();
}

async function loadHorses() {
  const { data, error } = await supabaseClient.from('horses').select('*').order('name');
  if (error) {
    alert('Fehler beim Laden: ' + error.message);
    return;
  }
  allHorses = data || [];
}

function populateFilterOptions() {
  const genders = [...new Set(allHorses.map((h) => h.gender).filter(Boolean))].sort();
  const breeds = [...new Set(allHorses.map((h) => h.breed).filter(Boolean))].sort();
  const owners = [...new Set(allHorses.map((h) => h.owner).filter(Boolean))].sort();
  fillSelect('#f-gender', genders);
  fillSelect('#f-breed', breeds);
  fillSelect('#f-owner', owners);
  fillSelect('#f-tag', HORSE_TAG_OPTIONS.map((t) => t.label));
}

function fillSelect(selector, values) {
  const select = document.querySelector(selector);
  values.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

function resetFilters() {
  document.querySelector('#f-name').value = '';
  document.querySelector('#f-gender').value = '';
  document.querySelector('#f-breed').value = '';
  document.querySelector('#f-owner').value = '';
  document.querySelector('#f-tag').value = '';
  document.querySelector('#f-gp-min').value = '';
  document.querySelector('#f-coi-max').value = '';
  render();
}

function getFiltered() {
  const name = document.querySelector('#f-name').value.trim().toLowerCase();
  const gender = document.querySelector('#f-gender').value;
  const breed = document.querySelector('#f-breed').value;
  const owner = document.querySelector('#f-owner').value;
  const tag = document.querySelector('#f-tag').value;
  const gpMin = document.querySelector('#f-gp-min').value;
  const coiMax = document.querySelector('#f-coi-max').value;

  return allHorses.filter((h) => {
    if (name && !h.name.toLowerCase().includes(name)) return false;
    if (gender && h.gender !== gender) return false;
    if (breed && h.breed !== breed) return false;
    if (owner && h.owner !== owner) return false;
    if (tag && !(h.tags || []).includes(tag)) return false;
    if (gpMin && !(h.genetic_potential >= parseFloat(gpMin))) return false;
    if (coiMax && !(h.coi <= parseFloat(coiMax))) return false;
    return true;
  });
}

function sortHorses(list) {
  const { field, dir } = currentSort;
  const mul = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
    return String(av).localeCompare(String(bv), 'de') * mul;
  });
}

function render() {
  const filtered = sortHorses(getFiltered());
  document.querySelector('#result-count').textContent = `${filtered.length} von ${allHorses.length} Pferden`;

  const tbody = document.querySelector('#horse-tbody');
  tbody.innerHTML = filtered.map(rowHtml).join('');
}

function rowHtml(h) {
  const img = h.image_url
    ? `<img src="${escapeHtml(h.image_url)}" alt="" />`
    : '';
  const nameLink = h.link
    ? `<a href="view.html?id=${h.id}">${escapeHtml(h.name)}</a> <a href="${escapeHtml(h.link)}" target="_blank" title="Im Spiel öffnen">🔗</a>`
    : `<a href="view.html?id=${h.id}">${escapeHtml(h.name)}</a>`;
  const nameCell = `<div class="name-cell-inner">${nameLink}${tagsBadgesHtml(h.tags)}</div>`;
  const genetics = h.tested_colours ? escapeHtml(h.tested_colours) : '<span class="muted">–</span>';
  const parents = [h.sire_name, h.dam_name].filter(Boolean).map(escapeHtml).join(' × ') || '<span class="muted">–</span>';

  return `
    <tr>
      <td class="horse-thumb" data-label="">${img}</td>
      <td data-label="Name">${nameCell}</td>
      <td data-label="Geschlecht">${escapeHtml(h.gender || '')}</td>
      <td data-label="Rasse">${escapeHtml(h.breed || '')}</td>
      <td data-label="Besitzer">${escapeHtml(h.owner || '')}</td>
      <td data-label="GP">${h.genetic_potential ?? ''}</td>
      <td data-label="Conformation">${escapeHtml(h.conformation || '')}</td>
      <td data-label="Genetik" class="small">${genetics}</td>
      <td data-label="COI">${h.coi != null ? h.coi + '%' : ''}</td>
      <td data-label="Eltern" class="small">${parents}</td>
      <td data-label="Aktionen" class="actions-cell">
        <a class="btn secondary icon-btn" href="horse.html?id=${h.id}" title="Bearbeiten">✏️</a>
        <button class="danger icon-btn" title="Löschen" onclick="deleteHorse('${h.id}')">✗</button>
      </td>
    </tr>`;
}

async function deleteHorse(id) {
  if (!confirm('Dieses Pferd wirklich endgültig löschen?')) return;
  const { error } = await supabaseClient.from('horses').delete().eq('id', id);
  if (error) {
    alert('Fehler beim Löschen: ' + error.message);
    return;
  }
  allHorses = allHorses.filter((h) => h.id !== id);
  render();
}

// --- Links/Spiel-IDs-Prüfung (einmaliger Diagnose-Check, siehe Vorfall
// 12.08.2026: falsch zugeordnete hr_id/Links durch die inzwischen wieder
// abgeschaltete automatische Link-Erkennung, siehe parser.js). Prüft rein
// mechanisch, ob Link und Spiel-ID jedes Pferds zusammenpassen (die hr_id
// steckt als Zahl im Link) - kein Zugriff auf horsereality.com nötig, nur
// ein Abgleich der bereits gespeicherten Werte untereinander.
function extractHrIdFromLink(link) {
  if (!link) return null;
  const m = link.match(/\/horses\/(\d+)/);
  return m ? m[1] : null;
}

function runLinkCheck() {
  const mismatches = allHorses.filter((h) => {
    const linkHrId = extractHrIdFromLink(h.link);
    if (!h.link && !h.hr_id) return false;
    return linkHrId !== h.hr_id;
  });

  const byHrId = new Map();
  allHorses.forEach((h) => {
    if (!h.hr_id) return;
    if (!byHrId.has(h.hr_id)) byHrId.set(h.hr_id, []);
    byHrId.get(h.hr_id).push(h);
  });
  const dupHrId = [...byHrId.values()].filter((list) => list.length > 1);

  const byLink = new Map();
  allHorses.forEach((h) => {
    if (!h.link) return;
    if (!byLink.has(h.link)) byLink.set(h.link, []);
    byLink.get(h.link).push(h);
  });
  const dupLink = [...byLink.values()].filter((list) => list.length > 1);

  const noLink = allHorses.filter((h) => !h.link);

  renderLinkCheckResults({ mismatches, dupHrId, dupLink, noLink });
}

function linkCheckHorseListHtml(horses) {
  return `<ul>${horses.map((h) => `<li><a href="horse.html?id=${h.id}" target="_blank">${escapeHtml(h.name)}</a>
    <span class="muted small">- hr_id: ${escapeHtml(h.hr_id || '–')}, Link: ${h.link ? escapeHtml(h.link) : '–'}</span></li>`).join('')}</ul>`;
}

function renderLinkCheckResults({ mismatches, dupHrId, dupLink, noLink }) {
  document.querySelector('#link-check-results').hidden = false;
  let html = '';

  html += `<p><strong>${mismatches.length}</strong> Pferd(e), bei denen Link und gespeicherte Spiel-ID nicht zusammenpassen:</p>`;
  html += mismatches.length ? linkCheckHorseListHtml(mismatches) : '<p class="muted small">Keine gefunden.</p>';

  html += `<p><strong>${dupHrId.length}</strong> Spiel-ID(s), die bei mehreren Pferden gleichzeitig steht:</p>`;
  html += dupHrId.length ? dupHrId.map(linkCheckHorseListHtml).join('') : '<p class="muted small">Keine gefunden.</p>';

  html += `<p><strong>${dupLink.length}</strong> Link(s), die bei mehreren Pferden gleichzeitig steht:</p>`;
  html += dupLink.length ? dupLink.map(linkCheckHorseListHtml).join('') : '<p class="muted small">Keine gefunden.</p>';

  html += `<p><strong>${noLink.length}</strong> Pferd(e) ganz ohne Link.</p>`;

  document.querySelector('#link-check-body').innerHTML = html;
}

function showFlashBanner() {
  const msg = sessionStorage.getItem('flashMessage');
  if (!msg) return;
  sessionStorage.removeItem('flashMessage');
  const banner = document.querySelector('#flash-banner');
  banner.textContent = msg;
  banner.hidden = false;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
