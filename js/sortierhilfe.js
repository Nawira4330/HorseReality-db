let scoredHorses = [];
let currentSort = { field: 'totalScore', dir: 'desc' };
let selectedIds = new Set();

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  document.querySelector('#session-email').textContent = `Angemeldet als: ${displayIdentity(session.user.email)}`;

  document.querySelector('#f-focus').addEventListener('change', render);
  document.querySelector('#f-breed').addEventListener('change', render);
  document.querySelector('#f-owner').addEventListener('change', render);
  document.querySelector('#f-color').addEventListener('input', render);
  document.querySelectorAll('#score-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (currentSort.field === field) currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
      else currentSort = { field, dir: field === 'name' ? 'asc' : 'desc' };
      render();
    });
  });
  document.querySelector('#select-all').addEventListener('change', onSelectAll);
  document.querySelector('#bulk-delete-btn').addEventListener('click', onBulkDelete);

  const allHorses = await fetchAllHorsesLight();
  scoredHorses = computeScores(allHorses);
  populateBreedFilter();
  populateOwnerFilter();
  render();
}

// Merkt sich, welche Namen zuletzt gerendert wurden, damit "Alle auswählen"
// nur die aktuell (gefiltert) sichtbaren Pferde erfasst, nicht den ganzen
// Bestand.
let lastRenderedIds = [];

function onSelectAll(e) {
  if (e.target.checked) lastRenderedIds.forEach((id) => selectedIds.add(id));
  else lastRenderedIds.forEach((id) => selectedIds.delete(id));
  render();
}

function onToggleSelect(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  updateBulkBar();
  document.querySelector('#select-all').checked = lastRenderedIds.length > 0 && lastRenderedIds.every((i) => selectedIds.has(i));
}

function updateBulkBar() {
  const bar = document.querySelector('#bulk-actions');
  bar.hidden = selectedIds.size === 0;
  document.querySelector('#bulk-count').textContent = `${selectedIds.size} ausgewählt`;
}

async function onBulkDelete() {
  if (selectedIds.size === 0) return;
  if (!confirm(`${selectedIds.size} Pferd(e) wirklich endgültig löschen?`)) return;
  const ids = [...selectedIds];
  const { error } = await supabaseClient.from('horses').delete().in('id', ids);
  if (error) {
    alert('Fehler beim Löschen: ' + error.message);
    return;
  }
  scoredHorses = scoredHorses.filter((h) => !selectedIds.has(h.id));
  selectedIds.clear();
  render();
}

function populateBreedFilter() {
  const breeds = [...new Set(scoredHorses.map((h) => h.breed).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const select = document.querySelector('#f-breed');
  breeds.forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    select.appendChild(opt);
  });
}

function populateOwnerFilter() {
  const owners = [...new Set(scoredHorses.map((h) => h.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const select = document.querySelector('#f-owner');
  owners.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    select.appendChild(opt);
  });
}

// --- Conformation-Aufschlüsselung aus dem Grade-Text (z.B. "1VG 12G 1A") ---
// Horse Reality kennt 4 Noten: Very Good > Good > Acceptable > Bad. Die
// Gesamtzahl bewerteter Körperteile ist NICHT immer gleich (z.B. 14 bei
// manchen, 12 bei anderen Pferden) - deshalb wird immer relativ zur
// tatsächlich vorhandenen Gesamtzahl gerechnet, nie ein fester Nenner
// angenommen. Score = gewichteter Durchschnitt aus festen Punktwerten je
// Note (Vorgabe: nur VG = 100%, nur G = 50%, nur A = 25%, nur BA = 0%).
// Unbekannte/nicht erkannte Codes werden übersprungen statt zu Fehlern zu
// führen (best effort, wie beim Text-Parser).
const CONFORMATION_GRADE_SCORES = { VG: 100, G: 50, A: 25, BA: 0 };
const CONFORMATION_GRADE_ORDER = ['VG', 'G', 'A', 'BA'];
const CONFORMATION_GRADE_RE = /(\d+)(VG|G|A|BA)(?![A-Za-z])/g;

function parseConformationBreakdown(text) {
  const counts = { VG: 0, G: 0, A: 0, BA: 0 };
  if (!text) return { counts, score: null };
  const re = new RegExp(CONFORMATION_GRADE_RE);
  let m;
  let totalCount = 0;
  let weightedSum = 0;
  while ((m = re.exec(text))) {
    const count = parseInt(m[1], 10);
    const grade = m[2];
    counts[grade] += count;
    totalCount += count;
    weightedSum += count * CONFORMATION_GRADE_SCORES[grade];
  }
  const score = totalCount === 0 ? null : Math.round((weightedSum / totalCount) * 10) / 10;
  return { counts, score };
}

// --- Farb-Seltenheit: wie viele andere Pferde im Bestand exakt denselben
// genetischen Farbcode (Tested Colours) teilen. 100% = einzigartig im
// Bestand, niedrigere Werte = häufiger vorhanden. Reiner Text-Abgleich
// (kein Verständnis der Genetik dahinter) - zwei Pferde mit
// unterschiedlicher Reihenfolge derselben Gene würden fälschlich als
// verschieden gelten, das kommt aber laut bisherigen Beispielen nicht vor.
function computeColorRarity(horses) {
  const counts = new Map();
  horses.forEach((h) => {
    if (!h.tested_colours) return;
    const key = h.tested_colours.trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return (h) => {
    if (!h.tested_colours) return null;
    const key = h.tested_colours.trim();
    const shared = counts.get(key) || 1;
    const withColours = horses.filter((x) => x.tested_colours).length;
    if (withColours <= 1) return 100;
    return Math.round((1 - (shared - 1) / (withColours - 1)) * 1000) / 10;
  };
}

// --- Verwandtschaftsgrad: Ø-COI dieses Pferds mit jedem anderen Pferd im
// Bestand (gedachte Verpaarungen, nicht tatsächliche) - ein Pferd mit
// vielen engen Verwandten im eigenen Bestand ist für die Zuchtvielfalt
// redundanter als ein genetisch "einzigartiges" Pferd.
function computeRelatedness(horses, horsesByHrId) {
  const pedigreeCache = new Map();
  horses.forEach((h) => pedigreeCache.set(h.id, buildDeepPedigree(h, horsesByHrId, PEDIGREE_MAX_GENERATION)));

  return (horse) => {
    const others = horses.filter((h) => h.id !== horse.id);
    if (others.length === 0) return null;
    const pedA = pedigreeCache.get(horse.id);
    let sum = 0;
    others.forEach((other) => {
      const pedB = pedigreeCache.get(other.id);
      sum += estimateCOI(pedA, pedB, horsesByHrId).coiPct;
    });
    return Math.round((sum / others.length) * 100) / 100;
  };
}

function computeScores(horses) {
  const horsesByHrId = buildHorsesByHrId(horses);
  const rarityFn = computeColorRarity(horses);
  const relatednessFn = computeRelatedness(horses, horsesByHrId);

  return horses.map((h) => {
    const { counts, score } = parseConformationBreakdown(h.conformation);
    const specialTraitLoss = computeSpecialTraitLoss(h, horsesByHrId);
    return {
      ...h,
      conformationCounts: counts,
      conformationScore: score,
      colorRarity: rarityFn(h),
      relatedness: relatednessFn(h),
      offspringCount: findOffspring(h, horses).length,
      specialTraitLoss,
      specialTraitLossRatio: specialTraitLoss ? specialTraitLoss.lossRatio * 100 : null,
    };
  });
}

// Normiert einen Wert linear auf 0-100 relativ zu min/max in der Liste.
function normalize(value, min, max) {
  if (value == null || min == null || max == null || min === max) return null;
  return ((value - min) / (max - min)) * 100;
}

// Gesamt-Score = gewichteter Durchschnitt aus GP, Conformation und
// Farb-Seltenheit (0-100 je Wert, der gewählte Schwerpunkt zählt doppelt),
// ABZÜGLICH dreier Abzüge: bis zu 30 Punkte für hohen Verwandtschaftsgrad
// (Ø-COI zum restlichen Bestand), bis zu 20 Punkte für eine hohe
// Nachkommenzahl (beides relativ zum höchsten Wert im Bestand normiert),
// und bis zu 20 Punkte dafür, dass ein Pferd Sonderfarben/Musterungen
// seiner Eltern nicht geerbt hat - je mehr ein Pferd bereits genetisch im
// Bestand vertreten ist (durch Verwandtschaft oder eigene Nachkommen) oder
// je mehr elterliche Sonderfarben ihm fehlen, desto stärker drückt das den
// Score, unabhängig vom gewählten Schwerpunkt. Ergebnis auf 0-100 begrenzt.
const RELATEDNESS_MAX_PENALTY = 30;
const OFFSPRING_MAX_PENALTY = 20;
const SPECIAL_TRAIT_LOSS_MAX_PENALTY = 20;

function totalScore(h, focus, ranges) {
  const gpNorm = normalize(h.genetic_potential, ranges.gp.min, ranges.gp.max);
  const confNorm = h.conformationScore;
  const colorNorm = h.colorRarity;

  const parts = [];
  if (gpNorm != null) parts.push({ value: gpNorm, weight: focus === 'gp' ? 2 : 1 });
  if (confNorm != null) parts.push({ value: confNorm, weight: focus === 'conformation' ? 2 : 1 });
  if (colorNorm != null) parts.push({ value: colorNorm, weight: focus === 'color' ? 2 : 1 });
  if (parts.length === 0) return null;

  const weightSum = parts.reduce((s, p) => s + p.weight, 0);
  const baseScore = parts.reduce((s, p) => s + p.value * p.weight, 0) / weightSum;

  const relPenalty = h.relatedness == null ? 0
    : (normalize(h.relatedness, 0, ranges.rel.max) / 100) * RELATEDNESS_MAX_PENALTY;
  const offspringPenalty = ranges.offspring.max === 0 ? 0
    : (normalize(h.offspringCount, 0, ranges.offspring.max) / 100) * OFFSPRING_MAX_PENALTY;
  const specialTraitPenalty = h.specialTraitLossRatio == null ? 0
    : (h.specialTraitLossRatio / 100) * SPECIAL_TRAIT_LOSS_MAX_PENALTY;

  const total = baseScore - relPenalty - offspringPenalty - specialTraitPenalty;
  return Math.round(Math.max(0, Math.min(100, total)) * 10) / 10;
}

function getFiltered() {
  const breed = document.querySelector('#f-breed').value;
  const owner = document.querySelector('#f-owner').value;
  const colorSearch = document.querySelector('#f-color').value.trim().toLowerCase();
  return scoredHorses.filter((h) => {
    if (breed && h.breed !== breed) return false;
    if (owner && h.owner !== owner) return false;
    if (colorSearch && !(h.tested_colours || '').toLowerCase().includes(colorSearch)) return false;
    return true;
  });
}

function render() {
  const focus = document.querySelector('#f-focus').value;
  const filtered = getFiltered();

  // Score-Bereiche (min/max für Normierung) werden immer aus ALLEN Pferden
  // berechnet, nicht nur den gefilterten - sonst würde sich der Gesamt-Score
  // eines Pferds ändern, je nachdem wonach gerade gefiltert wird.
  const gpValues = scoredHorses.map((h) => h.genetic_potential).filter((v) => v != null);
  const relValues = scoredHorses.map((h) => h.relatedness).filter((v) => v != null);
  const offspringValues = scoredHorses.map((h) => h.offspringCount);
  const ranges = {
    gp: { min: gpValues.length ? Math.min(...gpValues) : null, max: gpValues.length ? Math.max(...gpValues) : null },
    rel: { max: relValues.length ? Math.max(...relValues) : 0 },
    offspring: { max: offspringValues.length ? Math.max(...offspringValues) : 0 },
  };

  const withTotal = filtered.map((h) => ({ ...h, totalScore: totalScore(h, focus, ranges) }));

  const { field, dir } = currentSort;
  const mul = dir === 'asc' ? 1 : -1;
  const sorted = [...withTotal].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
    return String(av).localeCompare(String(bv), 'de') * mul;
  });

  document.querySelector('#result-count').textContent = `${sorted.length} von ${scoredHorses.length} Pferden`;
  document.querySelector('#score-tbody').innerHTML = sorted.map(rowHtml).join('');

  lastRenderedIds = sorted.map((h) => h.id);
  document.querySelector('#select-all').checked = lastRenderedIds.length > 0 && lastRenderedIds.every((id) => selectedIds.has(id));
  updateBulkBar();
}

async function deleteHorse(id, name) {
  if (!confirm(`"${name}" wirklich endgültig löschen?`)) return;
  const { error } = await supabaseClient.from('horses').delete().eq('id', id);
  if (error) {
    alert('Fehler beim Löschen: ' + error.message);
    return;
  }
  scoredHorses = scoredHorses.filter((h) => h.id !== id);
  selectedIds.delete(id);
  render();
}

function conformationText(counts) {
  return CONFORMATION_GRADE_ORDER.map((g) => `${counts[g]} ${g}`).join(' · ');
}

function specialTraitLossText(loss) {
  if (!loss) return '<span class="muted small">Eltern unbekannt/keine Sonderfarbe</span>';
  if (loss.lost === 0) return `<span class="pill yes">alle ${loss.checked} geerbt</span>`;
  return `<span class="pill no">${loss.lost}/${loss.checked} fehlen</span> <span class="muted small">(${escapeHtml(loss.lostCodes.join(', '))})</span>`;
}

function rowHtml(h) {
  const img = h.image_url ? `<img src="${escapeHtml(h.image_url)}" alt="" style="width:2.6rem;height:2.6rem;object-fit:cover;border-radius:6px;" />` : '';
  const checked = selectedIds.has(h.id) ? 'checked' : '';
  return `<tr>
    <td><input type="checkbox" ${checked} onchange="onToggleSelect('${h.id}', this.checked)" /></td>
    <td class="horse-thumb">${img}</td>
    <td><a href="view.html?id=${h.id}">${escapeHtml(h.name)}</a></td>
    <td>${escapeHtml(h.breed || '')}</td>
    <td>${h.genetic_potential ?? ''}</td>
    <td>${conformationText(h.conformationCounts)}<br><span class="muted small">Score: ${h.conformationScore != null ? h.conformationScore + '%' : '–'}</span></td>
    <td>${escapeHtml(h.tested_colours || '–')}<br><span class="muted small">${h.colorRarity != null ? h.colorRarity + '% einzigartig' : ''}</span></td>
    <td>${specialTraitLossText(h.specialTraitLoss)}</td>
    <td>${h.relatedness != null ? h.relatedness + '%' : '–'}</td>
    <td>${h.offspringCount}</td>
    <td><strong>${h.totalScore != null ? h.totalScore : '–'}</strong></td>
    <td class="actions-cell">
      <a class="btn secondary icon-btn" href="horse.html?id=${h.id}" title="Bearbeiten">✏️</a>
      <button class="danger icon-btn" title="Löschen" onclick="deleteHorse('${h.id}', '${escapeHtml(h.name).replace(/'/g, "\\'")}')">✗</button>
    </td>
  </tr>`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
