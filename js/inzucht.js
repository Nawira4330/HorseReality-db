let allHorses = [];
let pedigreeIndex = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  document.querySelector('#session-email').textContent = `Angemeldet als: ${displayIdentity(session.user.email)}`;

  allHorses = await fetchAllHorsesLight();
  pedigreeIndex = buildPedigreeIndex(allHorses);

  populateOwnerFilter();
  populateHorseSelects();

  document.querySelector('#f-owner').addEventListener('change', populateHorseSelects);
  document.querySelector('#check-btn').addEventListener('click', onCheck);
}

function populateOwnerFilter() {
  const owners = [...new Set(allHorses.map((h) => h.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const select = document.querySelector('#f-owner');
  owners.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    select.appendChild(opt);
  });
}

function populateHorseSelects() {
  const owner = document.querySelector('#f-owner').value;
  const filtered = owner ? allHorses.filter((h) => h.owner === owner) : allHorses;
  const sorted = [...filtered].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
  fillSelect('#f-sire', sorted);
  fillSelect('#f-dam', sorted);
}

function fillSelect(selector, horses) {
  const select = document.querySelector(selector);
  select.innerHTML = '<option value="">– auswählen –</option>';
  horses.forEach((h) => {
    const opt = document.createElement('option');
    opt.value = h.id;
    opt.textContent = h.name + (h.hr_id ? '' : ' (ohne Link/hr_id - Stammbaum evtl. unvollständig)');
    select.appendChild(opt);
  });
}

function onCheck() {
  const sireId = document.querySelector('#f-sire').value;
  const damId = document.querySelector('#f-dam').value;
  if (!sireId || !damId) {
    alert('Bitte beide Pferde auswählen.');
    return;
  }
  const sire = allHorses.find((h) => h.id === sireId);
  const dam = allHorses.find((h) => h.id === damId);

  const pedigreeSire = buildDeepPedigree(sire, pedigreeIndex, PEDIGREE_MAX_GENERATION);
  const pedigreeDam = buildDeepPedigree(dam, pedigreeIndex, PEDIGREE_MAX_GENERATION);
  const { coiPct, commonAncestors } = estimateCOI(pedigreeSire, pedigreeDam, pedigreeIndex);

  document.querySelector('#result').hidden = false;
  document.querySelector('#result-coi').textContent = `COI: ${coiPct.toFixed(2)}%`;
  document.querySelector('#result-note').textContent = coiNote(coiPct, commonAncestors.length, sire, dam);

  const fieldset = document.querySelector('#common-ancestors-fieldset');
  if (commonAncestors.length === 0) {
    fieldset.hidden = true;
  } else {
    fieldset.hidden = false;
    const rows = commonAncestors.map((c) => `<tr>
      <td>${escapeHtml(c.name || c.hr_id)}</td>
      <td>Generation ${c.generationA} (${escapeHtml(sire.name)})</td>
      <td>Generation ${c.generationB} (${escapeHtml(dam.name)})</td>
      <td>${c.contributionPct.toFixed(2)}%</td>
    </tr>`).join('');
    document.querySelector('#common-ancestors-table').innerHTML =
      `<tr><th>Vorfahre</th><th>Seite Deckhengst</th><th>Seite Stute</th><th>Beitrag zum COI</th></tr>${rows}`;
  }
}

// Grobe Einordnung als Orientierung, keine feste Zucht-Empfehlung - je nach
// Rasse/Zuchtziel werden unterschiedliche Grenzwerte akzeptiert.
function coiNote(coiPct, commonCount, sire, dam) {
  if (commonCount === 0) {
    return 'Keine gemeinsamen Vorfahren im aufgelösten Stammbaum gefunden - das COI kann trotzdem höher liegen, falls einer der Stammbäume nicht vollständig bekannt ist.';
  }
  let level;
  if (coiPct < 3) level = 'niedrig';
  else if (coiPct < 6.25) level = 'moderat';
  else if (coiPct < 12.5) level = 'erhöht (entspricht z.B. etwa Halbgeschwister- oder Großeltern-Enkel-Niveau)';
  else level = 'hoch';
  return `Einordnung: ${level}. Basiert auf ${commonCount} gemeinsamen Vorfahren-Pfad(en) im bekannten Stammbaum von ${sire.name} und ${dam.name}.`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
