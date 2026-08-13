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
    opt.textContent = h.name;
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

  document.querySelector('#result').hidden = false;

  renderCOI(sire, dam);
  renderGP(sire, dam);
  renderConformation(sire, dam);
  renderGenetics(sire, dam);
}

function renderCOI(sire, dam) {
  const pedigreeSire = buildDeepPedigree(sire, pedigreeIndex, PEDIGREE_MAX_GENERATION);
  const pedigreeDam = buildDeepPedigree(dam, pedigreeIndex, PEDIGREE_MAX_GENERATION);
  const { coiPct, commonAncestors } = estimateCOI(pedigreeSire, pedigreeDam, pedigreeIndex);
  document.querySelector('#result-coi').textContent = `COI: ${coiPct.toFixed(2)}%`;
  document.querySelector('#result-coi-note').textContent = commonAncestors.length
    ? `${commonAncestors.length} gemeinsame(r) Vorfahren-Pfad(e) - Details im Inzuchtprüfer.`
    : 'Keine gemeinsamen Vorfahren im bekannten Stammbaum gefunden.';
}

function renderGP(sire, dam) {
  const box = document.querySelector('#result-gp');
  if (sire.genetic_potential == null || dam.genetic_potential == null) {
    box.textContent = 'GP von mindestens einem Elternteil unbekannt - keine Schätzung möglich.';
    return;
  }
  const lo = Math.min(sire.genetic_potential, dam.genetic_potential);
  const hi = Math.max(sire.genetic_potential, dam.genetic_potential);
  const avg = Math.round((sire.genetic_potential + dam.genetic_potential) / 2);
  box.textContent = `geschätzt ${lo} – ${hi} (Mittel ${avg})`;
}

function renderConformation(sire, dam) {
  document.querySelector('#result-sire-name-label').textContent = sire.name;
  document.querySelector('#result-dam-name-label').textContent = dam.name;
  document.querySelector('#result-sire-conformation').textContent = sire.conformation || '–';
  document.querySelector('#result-dam-conformation').textContent = dam.conformation || '–';
}

// parseGenotypeToken/tokenizeColours/codeOfAlleles kommen jetzt aus
// js/genetics.js (gemeinsam mit sortierhilfe.js genutzt).

// Punnett-Quadrat je Genort: 4 gleichwahrscheinliche Eltern-Allel-
// Kombinationen, nach resultierendem (ungeordnetem) Genotyp gruppiert.
function punnett(allelesA, allelesB) {
  const combos = [
    [allelesA[0], allelesB[0]], [allelesA[0], allelesB[1]],
    [allelesA[1], allelesB[0]], [allelesA[1], allelesB[1]],
  ];
  const counts = new Map();
  combos.forEach(([a, b]) => {
    const key = [a, b].sort().join('/');
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([genotype, count]) => ({ genotype, probabilityPct: (count / 4) * 100 }))
    .sort((a, b) => b.probabilityPct - a.probabilityPct);
}

function renderGenetics(sire, dam) {
  document.querySelector('#raw-sire-colours').textContent = sire.tested_colours || '(keine Angabe)';
  document.querySelector('#raw-dam-colours').textContent = dam.tested_colours || '(keine Angabe)';

  const sireLoci = tokenizeColours(sire.tested_colours);
  const damLoci = tokenizeColours(dam.tested_colours);

  // Genorte werden über die Code-Wurzel (Allel ohne "n") gematcht, damit
  // z.B. "SW1n" (Vater) und "SW1SW1" (Mutter) trotz unterschiedlicher
  // Schreibweise als derselbe Genort erkannt werden.
  const sireByCode = new Map([...sireLoci.entries()].map(([token, alleles]) => [codeOfAlleles(alleles), { token, alleles }]));
  const damByCode = new Map([...damLoci.entries()].map(([token, alleles]) => [codeOfAlleles(alleles), { token, alleles }]));

  const commonCodes = [...sireByCode.keys()].filter((c) => damByCode.has(c));

  const fieldset = document.querySelector('#genetics-fieldset');
  if (commonCodes.length === 0) {
    fieldset.hidden = true;
    return;
  }
  fieldset.hidden = false;

  const rows = commonCodes.map((code) => {
    const sireEntry = sireByCode.get(code);
    const damEntry = damByCode.get(code);
    const combos = punnett(sireEntry.alleles, damEntry.alleles);
    const comboText = combos.map((c) => `${c.genotype} (${c.probabilityPct}%)`).join(', ');
    return `<tr>
      <td>${escapeHtml(code)}</td>
      <td>${escapeHtml(sireEntry.token)} × ${escapeHtml(damEntry.token)}</td>
      <td>${escapeHtml(comboText)}</td>
    </tr>`;
  }).join('');

  document.querySelector('#genetics-table').innerHTML =
    `<tr><th>Genort</th><th>Eltern-Genotypen</th><th>Mögliche Fohlen-Genotypen</th></tr>${rows}`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
