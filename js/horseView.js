const PEDIGREE_DISPLAY_GENERATIONS = 5;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  document.querySelector('#session-email').textContent = `Angemeldet als: ${displayIdentity(session.user.email)}`;

  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.href = 'index.html'; return; }

  const { data: horse, error } = await supabaseClient.from('horses').select('*').eq('id', id).maybeSingle();
  if (error || !horse) {
    alert('Pferd konnte nicht geladen werden: ' + (error?.message || 'nicht gefunden'));
    location.href = 'index.html';
    return;
  }

  render(horse);

  const allHorses = await fetchAllHorsesLight();
  const horsesByHrId = buildHorsesByHrId(allHorses);
  renderPedigreeSection(horse, horsesByHrId);
  renderOffspring(horse, allHorses);
  renderOpticalTraitHints(horse, horsesByHrId);
}

// Ergänzt Pangaré/Sooty/Flaxen/Sabino um einen aus den Eltern abgeleiteten
// Hinweis, wenn der Wert bei diesem Pferd selbst noch nicht manuell gesetzt
// ist - siehe js/genetics.js (inferOpticalTraitHint) für die je nach
// Merkmal unterschiedliche Vererbungslogik (Flaxen/Sabino rezessiv+sicher,
// Sooty/Pangaré nur als schwacher Hinweis).
function renderOpticalTraitHints(horse, horsesByHrId) {
  ['pangare', 'sooty', 'flaxen', 'sabino'].forEach((trait) => {
    const hint = inferOpticalTraitHint(horse, trait, horsesByHrId);
    if (!hint) return;
    const cell = document.querySelector(`#v-${trait}`);
    const hintSpan = `<span class="pill ${hint.level === 'strong' ? 'yes' : ''}" title="${escapeHtml(hint.text)}">${hint.level === 'strong' ? '●' : '○'} ${escapeHtml(hint.text)}</span>`;
    cell.innerHTML = (horse[trait] ? escapeHtml(horse[trait]) + ' ' : '') + hintSpan;
  });
}

function render(h) {
  document.querySelector('#edit-link').href = `horse.html?id=${h.id}`;
  if (h.link) {
    const gameLink = document.querySelector('#game-link');
    gameLink.href = h.link;
    gameLink.hidden = false;
  }

  document.querySelector('#v-name').textContent = h.name;

  if (h.image_url) {
    const img = document.querySelector('#v-image');
    img.src = h.image_url;
    img.hidden = false;
  }

  setText('#v-gender', h.gender);
  setText('#v-breed', h.breed);
  setText('#v-owner', h.owner);
  setText('#v-gp', h.genetic_potential);
  setText('#v-conformation', h.conformation);
  setText('#v-colours', h.tested_colours);
  setText('#v-predicates', h.predicates);
  setText('#v-coi', h.coi != null ? `${h.coi}%` : null);
  setText('#v-pangare', h.pangare);
  setText('#v-sooty', h.sooty);
  setText('#v-flaxen', h.flaxen);
  setText('#v-sabino', h.sabino);

  if (h.notes) {
    document.querySelector('#notes-fieldset').hidden = false;
    document.querySelector('#v-notes').textContent = h.notes;
  }

  if (h.colors && h.colors.length) {
    document.querySelector('#colors-fieldset').hidden = false;
    const rows = h.colors.map((c) => `<tr>
      <td>${escapeHtml(c.category || '')}</td>
      <td>${escapeHtml(c.label)}${c.label !== c.technical_name ? ` <span class="muted small">(${escapeHtml(c.technical_name)})</span>` : ''}</td>
      <td>${escapeHtml(c.genotype)}</td>
    </tr>`).join('');
    document.querySelector('#colors-table').innerHTML = `<tr><th>Gruppe</th><th>Genort</th><th>Genotyp</th></tr>${rows}`;
  }

  if (h.exterior && Object.keys(h.exterior).length) {
    document.querySelector('#exterior-fieldset').hidden = false;
    document.querySelector('#exterior-table').innerHTML =
      Object.entries(h.exterior).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('');
  }

  if (h.disciplines && Object.keys(h.disciplines).length) {
    document.querySelector('#disciplines-fieldset').hidden = false;
    document.querySelector('#disciplines-table').innerHTML =
      Object.entries(h.disciplines).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${v}</td></tr>`).join('');
  }
}

function setText(selector, value) {
  document.querySelector(selector).textContent = (value === null || value === undefined || value === '') ? '–' : value;
}

// Stammbaum kann über mehrere eigene Pferde hinweg bis zu 18 Generationen
// tief aufgelöst werden (siehe js/pedigree.js) - als komplettes Fächer-
// Diagramm gerendert würde das aber bei tiefen, aber lückenhaften Zweigen
// zu einer riesigen, größtenteils leeren Tabelle führen (2^17 Zeilen bei
// voller Tiefe). Die Fächer-Ansicht zeigt deshalb nur die ersten
// PEDIGREE_DISPLAY_GENERATIONS Generationen; die volle Tiefe fließt aber in
// den Zusammenfassungstext und in den Inzuchtprüfer ein.
function renderPedigreeSection(horse, horsesByHrId) {
  const fullTree = buildDeepPedigree(horse, horsesByHrId, PEDIGREE_MAX_GENERATION);
  const known = fullTree.filter((n) => n.hr_id);
  if (known.length === 0) return;

  document.querySelector('#pedigree-fieldset').hidden = false;
  const deepestGen = Math.max(...known.map((n) => n.generation));
  document.querySelector('#pedigree-summary').textContent =
    `${known.length} bekannte Vorfahren, tiefste aufgelöste Generation: ${deepestGen}` +
    (deepestGen > PEDIGREE_DISPLAY_GENERATIONS ? ` (Anzeige unten begrenzt auf ${PEDIGREE_DISPLAY_GENERATIONS} Generationen)` : '');

  const displayTree = buildDeepPedigree(horse, horsesByHrId, PEDIGREE_DISPLAY_GENERATIONS);
  document.querySelector('#pedigree-fan').innerHTML = renderPedigreeFan(displayTree, horse.name, PEDIGREE_DISPLAY_GENERATIONS);
}

function renderOffspring(horse, allHorses) {
  const offspring = findOffspring(horse, allHorses);
  if (offspring.length === 0) return;

  document.querySelector('#offspring-fieldset').hidden = false;
  const rows = offspring
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'))
    .map((o) => `<tr>
      <td><a href="view.html?id=${o.id}">${escapeHtml(o.name)}</a></td>
      <td>${escapeHtml(o.gender || '')}</td>
      <td>${o.genetic_potential ?? ''}</td>
      <td>${escapeHtml(o.conformation || '')}</td>
    </tr>`).join('');
  document.querySelector('#offspring-table').innerHTML =
    `<tr><th>Name</th><th>Geschlecht</th><th>GP</th><th>Conformation</th></tr>${rows}`;
}

function renderPedigreeFan(tree, horseName, maxGen) {
  function cellHtml(node, gen, rowspan) {
    const rs = rowspan ? ` rowspan="${rowspan}"` : '';
    if (node && node.name) {
      const marker = node.side === 'S' ? '♂' : '♀';
      const stats = [node.genetic_potential != null ? `GP ${node.genetic_potential}` : null, node.conformation]
        .filter(Boolean).join(', ');
      const statsHtml = stats ? `<div class="muted small">${escapeHtml(stats)}</div>` : '';
      return `<td${rs}><div class="pedigree-node">${marker} <a href="${escapeHtml(node.link)}" target="_blank">${escapeHtml(node.name)}</a>${statsHtml}</div></td>`;
    }
    return `<td${rs}><div class="pedigree-node unknown">Unbekannt</div></td>`;
  }

  function buildRows(path, gen) {
    const node = tree.find((t) => t.path === path) || null;
    if (gen === maxGen) {
      return [[cellHtml(node, gen)]];
    }
    const sireRows = buildRows(path + 'S', gen + 1);
    const damRows = buildRows(path + 'D', gen + 1);
    const combined = sireRows.concat(damRows);
    combined[0] = [cellHtml(node, gen, combined.length), ...combined[0]];
    return combined;
  }

  const sireRows = buildRows('S', 1);
  const damRows = buildRows('D', 1);
  const allRows = sireRows.concat(damRows);
  allRows[0] = [`<td rowspan="${allRows.length}"><div class="pedigree-node">${escapeHtml(horseName)}</div></td>`, ...allRows[0]];

  return `<table><tbody>${allRows.map((row) => `<tr>${row.join('')}</tr>`).join('')}</tbody></table>`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
