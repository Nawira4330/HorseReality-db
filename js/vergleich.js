let allHorses = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  document.querySelector('#session-email').textContent = `Angemeldet als: ${session.user.email}`;

  allHorses = await fetchAllHorsesLight();

  const parentHrIds = new Set();
  allHorses.forEach((h) => {
    if (h.sire_hr_id) parentHrIds.add(h.sire_hr_id);
    if (h.dam_hr_id) parentHrIds.add(h.dam_hr_id);
  });
  const parents = allHorses
    .filter((h) => h.hr_id && parentHrIds.has(h.hr_id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));

  const select = document.querySelector('#f-parent');
  parents.forEach((h) => {
    const opt = document.createElement('option');
    opt.value = h.hr_id;
    opt.textContent = h.name;
    select.appendChild(opt);
  });
  select.addEventListener('change', render);

  if (parents.length === 0) {
    select.disabled = true;
    document.querySelector('#empty-note').hidden = false;
    document.querySelector('#empty-note').textContent =
      'Noch keine Pferde mit verknüpften Nachkommen in der Datenbank (dafür müssen Stammbaum-Link und Fohlen beide gespeichert sein).';
  }
}

function render() {
  const parentHrId = document.querySelector('#f-parent').value;
  const wrap = document.querySelector('#result-wrap');
  const emptyNote = document.querySelector('#empty-note');

  if (!parentHrId) {
    wrap.hidden = true;
    emptyNote.hidden = true;
    return;
  }

  const offspring = allHorses.filter((h) => h.sire_hr_id === parentHrId || h.dam_hr_id === parentHrId);
  if (offspring.length === 0) {
    wrap.hidden = true;
    emptyNote.hidden = false;
    return;
  }

  emptyNote.hidden = true;
  wrap.hidden = false;

  const gpValues = offspring.map((h) => h.genetic_potential).filter((v) => v != null);
  const coiValues = offspring.map((h) => h.coi).filter((v) => v != null);
  const gpBest = gpValues.length ? Math.max(...gpValues) : null;
  const gpWorst = gpValues.length ? Math.min(...gpValues) : null;
  const coiBest = coiValues.length ? Math.min(...coiValues) : null;
  const coiWorst = coiValues.length ? Math.max(...coiValues) : null;

  const otherParentLabel = (h) => {
    const otherHrId = h.sire_hr_id === parentHrId ? h.dam_hr_id : h.sire_hr_id;
    const otherName = h.sire_hr_id === parentHrId ? h.dam_name : h.sire_name;
    return otherHrId ? escapeHtml(otherName || otherHrId) : '<span class="muted">unbekannt</span>';
  };

  const rows = offspring
    .sort((a, b) => (b.genetic_potential ?? -Infinity) - (a.genetic_potential ?? -Infinity))
    .map((h) => {
      const gpClass = cmpClass(h.genetic_potential, gpBest, gpWorst);
      const coiClass = cmpClass(h.coi, coiBest, coiWorst);
      return `<tr>
        <td><a href="view.html?id=${h.id}">${escapeHtml(h.name)}</a></td>
        <td>${escapeHtml(h.gender || '')}</td>
        <td>${otherParentLabel(h)}</td>
        <td class="${gpClass}">${h.genetic_potential ?? ''}</td>
        <td>${escapeHtml(h.conformation || '')}</td>
        <td>${escapeHtml(h.tested_colours || '')}</td>
        <td class="${coiClass}">${h.coi != null ? h.coi + '%' : ''}</td>
      </tr>`;
    }).join('');

  document.querySelector('#compare-table').innerHTML =
    `<tr><th>Name</th><th>Geschlecht</th><th>Anderer Elternteil</th><th>GP</th><th>Conformation</th><th>Tested Colours</th><th>COI</th></tr>${rows}`;
}

function cmpClass(value, best, worst) {
  if (value == null || best === worst) return '';
  if (value === best) return 'cmp-good';
  if (value === worst) return 'cmp-bad';
  return '';
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
