let editingId = null;
let currentPedigreeTree = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  document.querySelector('#session-email').textContent = `Angemeldet als: ${session.user.email}`;

  document.querySelector('#parse-btn').addEventListener('click', onParse);
  document.querySelector('#horse-form').addEventListener('submit', onSave);
  document.querySelector('#delete-btn').addEventListener('click', onDelete);

  const params = new URLSearchParams(location.search);
  editingId = params.get('id');
  if (editingId) {
    document.querySelector('#form-title').textContent = 'Pferd bearbeiten';
    document.querySelector('#delete-btn').hidden = false;
    document.querySelector('#paste-box').open = false;
    await loadExisting(editingId);
  }
}

async function loadExisting(id) {
  const { data, error } = await supabaseClient.from('horses').select('*').eq('id', id).maybeSingle();
  if (error || !data) {
    alert('Pferd konnte nicht geladen werden: ' + (error?.message || 'nicht gefunden'));
    location.href = 'index.html';
    return;
  }
  fillForm(data);
}

function onParse() {
  const raw = document.querySelector('#paste-text').value;
  if (!raw.trim()) return;
  const parsed = parseHorseRealityText(raw);
  fillForm(parsed);
}

// Befüllt nur Felder, für die parsed tatsächlich einen Wert liefert -
// bereits vorhandene Werte im Formular bleiben erhalten, wenn ein erneutes
// Einfügen (z.B. nur der Colour-Reiter) diese Felder nicht enthält.
function fillForm(parsed) {
  setIf('#f-name', parsed.name);
  setIf('#f-description', parsed.description);
  setIf('#f-gender', parsed.gender);
  setIf('#f-breed', parsed.breed);
  setIf('#f-age', parsed.age_text);
  setIf('#f-link', parsed.link);
  setIf('#f-image', parsed.image_url);
  setIf('#f-gp', parsed.genetic_potential);
  setIf('#f-conformation', parsed.conformation);
  setIf('#f-colours', parsed.tested_colours);
  setIf('#f-training', parsed.training);
  setIf('#f-predicates', parsed.predicates);
  setIf('#f-coi', parsed.coi);
  setIf('#f-pangare', parsed.pangare);
  setIf('#f-sooty', parsed.sooty);
  setIf('#f-flaxen', parsed.flaxen);
  setIf('#f-sabino', parsed.sabino);
  setIf('#f-notes', parsed.notes);

  if (parsed.pedigree_tree && parsed.pedigree_tree.length) {
    currentPedigreeTree = parsed.pedigree_tree;
    renderPedigreePreview(parsed.pedigree_tree);
  }
}

function setIf(selector, value) {
  if (value === undefined || value === null || value === '') return;
  document.querySelector(selector).value = value;
}

function renderPedigreePreview(tree) {
  const fieldset = document.querySelector('#pedigree-fieldset');
  fieldset.hidden = false;
  const sire = tree.find((t) => t.path === 'S');
  const dam = tree.find((t) => t.path === 'D');
  document.querySelector('#pedigree-summary').textContent =
    `Vater: ${sire?.name || 'unbekannt'} · Mutter: ${dam?.name || 'unbekannt'} · ` +
    `${tree.length} erkannte Stammbaum-Plätze`;

  const lines = tree
    .filter((t) => t.name)
    .map((t) => `<div>${'　'.repeat(t.generation - 1)}${t.side === 'S' ? '♂' : '♀'} <a href="${escapeHtml(t.link)}" target="_blank">${escapeHtml(t.name)}</a> <span class="muted small">(Gen. ${t.generation})</span></div>`)
    .join('');
  document.querySelector('#pedigree-preview').innerHTML = lines || '<p class="muted small">Keine bekannten Vorfahren im eingefügten Text.</p>';
}

function extractHrIdFromLink(link) {
  if (!link) return null;
  const m = link.match(/\/horses\/(\d+)/);
  return m ? m[1] : null;
}

function numOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

function textOrNull(value) {
  return value === '' ? null : value;
}

function buildPayload() {
  const link = document.querySelector('#f-link').value.trim();
  const payload = {
    name: document.querySelector('#f-name').value.trim(),
    description: textOrNull(document.querySelector('#f-description').value.trim()),
    gender: textOrNull(document.querySelector('#f-gender').value),
    breed: textOrNull(document.querySelector('#f-breed').value.trim()),
    age_text: textOrNull(document.querySelector('#f-age').value.trim()),
    link: textOrNull(link),
    hr_id: extractHrIdFromLink(link),
    image_url: textOrNull(document.querySelector('#f-image').value.trim()),
    genetic_potential: numOrNull(document.querySelector('#f-gp').value),
    conformation: textOrNull(document.querySelector('#f-conformation').value.trim()),
    tested_colours: textOrNull(document.querySelector('#f-colours').value.trim()),
    training: textOrNull(document.querySelector('#f-training').value.trim()),
    predicates: textOrNull(document.querySelector('#f-predicates').value.trim()),
    coi: numOrNull(document.querySelector('#f-coi').value),
    pangare: textOrNull(document.querySelector('#f-pangare').value),
    sooty: textOrNull(document.querySelector('#f-sooty').value),
    flaxen: textOrNull(document.querySelector('#f-flaxen').value),
    sabino: textOrNull(document.querySelector('#f-sabino').value),
    notes: textOrNull(document.querySelector('#f-notes').value.trim()),
    raw_text_info: textOrNull(document.querySelector('#paste-text').value),
  };
  if (currentPedigreeTree) {
    payload.pedigree_tree = currentPedigreeTree;
    const sire = currentPedigreeTree.find((t) => t.path === 'S');
    const dam = currentPedigreeTree.find((t) => t.path === 'D');
    if (sire && sire.hr_id) { payload.sire_hr_id = sire.hr_id; payload.sire_name = sire.name; payload.sire_link = sire.link; }
    if (dam && dam.hr_id) { payload.dam_hr_id = dam.hr_id; payload.dam_name = dam.name; payload.dam_link = dam.link; }
  }
  return payload;
}

async function onSave(e) {
  e.preventDefault();
  const errorBox = document.querySelector('#form-error');
  errorBox.textContent = '';

  const payload = buildPayload();
  if (!payload.name) {
    errorBox.textContent = 'Name ist ein Pflichtfeld.';
    return;
  }

  let result;
  if (editingId) {
    result = await supabaseClient.from('horses').update(payload).eq('id', editingId).select().maybeSingle();
  } else {
    // Gleiche hr_id oder gleicher Name -> bestehendes Pferd aktualisieren statt doppelt anzulegen.
    let existing = null;
    if (payload.hr_id) {
      const { data } = await supabaseClient.from('horses').select('id').eq('hr_id', payload.hr_id).maybeSingle();
      existing = data;
    }
    if (!existing) {
      const { data } = await supabaseClient.from('horses').select('id').ilike('name', payload.name).maybeSingle();
      existing = data;
    }
    if (existing) {
      result = await supabaseClient.from('horses').update(payload).eq('id', existing.id).select().maybeSingle();
    } else {
      result = await supabaseClient.from('horses').insert(payload).select().maybeSingle();
    }
  }

  if (result.error) {
    errorBox.textContent = 'Fehler beim Speichern: ' + result.error.message;
    return;
  }

  sessionStorage.setItem('flashMessage', `"${payload.name}" wurde ${editingId ? 'aktualisiert' : 'neu angelegt'}.`);
  location.href = 'index.html';
}

async function onDelete() {
  if (!editingId) return;
  if (!confirm('Dieses Pferd wirklich endgültig löschen?')) return;
  const { error } = await supabaseClient.from('horses').delete().eq('id', editingId);
  if (error) {
    alert('Fehler beim Löschen: ' + error.message);
    return;
  }
  location.href = 'index.html';
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
