document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  document.querySelector('#session-email').textContent = `Angemeldet als: ${session.user.email}`;

  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.href = 'index.html'; return; }

  const { data: horse, error } = await supabaseClient.from('horses').select('*').eq('id', id).maybeSingle();
  if (error || !horse) {
    alert('Pferd konnte nicht geladen werden: ' + (error?.message || 'nicht gefunden'));
    location.href = 'index.html';
    return;
  }

  render(horse);
}

function render(h) {
  document.querySelector('#edit-link').href = `horse.html?id=${h.id}`;
  if (h.link) {
    const gameLink = document.querySelector('#game-link');
    gameLink.href = h.link;
    gameLink.hidden = false;
  }

  document.querySelector('#v-name').textContent = h.name;
  document.querySelector('#v-description').textContent = h.description || '';

  if (h.image_url) {
    const img = document.querySelector('#v-image');
    img.src = h.image_url;
    img.hidden = false;
  }

  setText('#v-gender', h.gender);
  setText('#v-breed', h.breed);
  setText('#v-age', h.age_text);
  setText('#v-gp', h.genetic_potential);
  setText('#v-conformation', h.conformation);
  setText('#v-colours', h.tested_colours);
  setText('#v-training', h.training);
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

  if (h.pedigree_tree && h.pedigree_tree.length) {
    document.querySelector('#pedigree-fieldset').hidden = false;
    document.querySelector('#pedigree-fan').innerHTML = renderPedigreeFan(h.pedigree_tree, h.name);
  }
}

function setText(selector, value) {
  document.querySelector(selector).textContent = (value === null || value === undefined || value === '') ? '–' : value;
}

function renderPedigreeFan(tree, horseName) {
  const maxGen = Math.max(...tree.map((t) => t.generation));

  function cellHtml(node, gen, rowspan) {
    const rs = rowspan ? ` rowspan="${rowspan}"` : '';
    if (node && node.name) {
      const marker = node.side === 'S' ? '♂' : '♀';
      return `<td${rs}><div class="pedigree-node">${marker} <a href="${escapeHtml(node.link)}" target="_blank">${escapeHtml(node.name)}</a></div></td>`;
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
