let editingId = null;
let currentPedigreeTree = null;
let currentColors = null;
let currentDisciplines = null;
let currentExterior = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  document.querySelector('#session-email').textContent = `Angemeldet als: ${displayIdentity(session.user.email)}`;

  document.querySelector('#parse-btn').addEventListener('click', onParse);
  document.querySelector('#horse-form').addEventListener('submit', onSave);
  document.querySelector('#delete-btn').addEventListener('click', onDelete);
  document.querySelector('#f-image').addEventListener('paste', onImagePaste);
  document.querySelector('#paste-text').addEventListener('paste', onPasteTextHtml);
  renderTagCheckboxes('#tag-checkboxes');

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
  // Bereits gespeicherte strukturierte Daten vormerken, damit ein erneutes
  // Speichern (ohne erneutes Einfügen) sie nicht verliert.
  if (data.colors) currentColors = data.colors;
  if (data.disciplines) currentDisciplines = data.disciplines;
  if (data.exterior) currentExterior = data.exterior;
  fillForm(data);
  fillTagCheckboxes('#tag-checkboxes', data.tags);
}

// Erlaubt das Einfügen eines direkt kopierten Bilds (z.B. per Rechtsklick
// "Bild kopieren" im Browser auf der Pferdeseite, dann Strg+V hier) statt
// nur einer Bild-URL - wird automatisch in den "horse-images"-Storage-
// Bucket hochgeladen (siehe supabase/schema.sql) und die entstehende
// öffentliche URL ins Feld eingetragen.
async function onImagePaste(e) {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  const imageItem = [...items].find((item) => item.type.startsWith('image/'));
  if (!imageItem) return; // normaler Text-Paste (z.B. eine getippte URL) - unverändert lassen

  e.preventDefault();
  const file = imageItem.getAsFile();
  const ext = file.type.split('/')[1] || 'png';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const field = document.querySelector('#f-image');
  field.value = 'Bild wird hochgeladen...';
  const { error } = await supabaseClient.storage.from('horse-images').upload(path, file);
  if (error) {
    field.value = '';
    alert('Fehler beim Bild-Upload: ' + error.message);
    return;
  }
  const { data } = supabaseClient.storage.from('horse-images').getPublicUrl(path);
  field.value = data.publicUrl;
}

// Liest zusätzlich zum reinen Text die HTML-Fassung der Zwischenablage aus
// (siehe extractFromPasteHtml in parser.js) - kein preventDefault, der
// normale Text-Paste in die Box läuft unverändert weiter, hier werden nur
// Bild-URL/Link ergänzt, falls die Seite komplett kopiert wurde.
function onPasteTextHtml(e) {
  const html = e.clipboardData && e.clipboardData.getData('text/html');
  if (!html) return;
  const extra = extractFromPasteHtml(html);
  if (extra.image_url) document.querySelector('#f-image').value = extra.image_url;
  if (extra.link) document.querySelector('#f-link').value = extra.link;
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
  setIf('#f-gender', parsed.gender);
  setIf('#f-breed', parsed.breed);
  setIf('#f-owner', parsed.owner);
  setIf('#f-link', parsed.link);
  setIf('#f-image', parsed.image_url);
  setIf('#f-gp', parsed.genetic_potential);
  setIf('#f-conformation', parsed.conformation);
  setIf('#f-colours', parsed.tested_colours);
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
  if (parsed.colors && parsed.colors.length) {
    currentColors = parsed.colors;
    renderStructuredPreview('#colors-preview', '#colors-fieldset',
      parsed.colors.map((c) => `${c.label} (${c.technical_name}): ${c.genotype}`).join(' · '));
  }
  if (parsed.disciplines) {
    currentDisciplines = parsed.disciplines;
    renderStructuredPreview('#disciplines-preview', '#disciplines-fieldset',
      Object.entries(parsed.disciplines).map(([k, v]) => `${k}: ${v}`).join(' · '));
  }
  if (parsed.exterior) {
    currentExterior = parsed.exterior;
    renderStructuredPreview('#exterior-preview', '#exterior-fieldset',
      Object.entries(parsed.exterior).map(([k, v]) => `${k}: ${v}`).join(' · '));
  }
}

function renderStructuredPreview(previewSelector, fieldsetSelector, text) {
  document.querySelector(fieldsetSelector).hidden = false;
  document.querySelector(previewSelector).textContent = text;
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
    .map((t) => {
      const stats = [t.genetic_potential != null ? `GP ${t.genetic_potential}` : null, t.conformation]
        .filter(Boolean).join(', ');
      return `<div>${'　'.repeat(t.generation - 1)}${t.side === 'S' ? '♂' : '♀'} <a href="${escapeHtml(t.link)}" target="_blank">${escapeHtml(t.name)}</a> <span class="muted small">(Gen. ${t.generation}${stats ? ' · ' + escapeHtml(stats) : ''})</span></div>`;
    })
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
  const owner = document.querySelector('#f-owner').value.trim();
  const payload = {
    name: document.querySelector('#f-name').value.trim(),
    gender: textOrNull(document.querySelector('#f-gender').value),
    breed: textOrNull(document.querySelector('#f-breed').value.trim()),
    link: textOrNull(link),
    hr_id: extractHrIdFromLink(link),
    image_url: textOrNull(document.querySelector('#f-image').value.trim()),
    genetic_potential: numOrNull(document.querySelector('#f-gp').value),
    conformation: textOrNull(document.querySelector('#f-conformation').value.trim()),
    tested_colours: textOrNull(document.querySelector('#f-colours').value.trim()),
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
  if (currentColors) payload.colors = currentColors;
  if (currentDisciplines) payload.disciplines = currentDisciplines;
  if (currentExterior) payload.exterior = currentExterior;
  // "owner"/"tags" nur mitschicken, wenn tatsächlich ausgefüllt - so bricht
  // das Speichern nicht, solange migration_001_owner.sql/migration_002_tags.sql
  // noch nicht ausgeführt wurden (die Spalten existieren dann noch nicht in
  // der Datenbank).
  if (owner) payload.owner = owner;
  const tags = readTagCheckboxes('#tag-checkboxes');
  if (tags.length) payload.tags = tags;
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
  let updated = !!editingId;
  if (editingId) {
    result = await supabaseClient.from('horses').update(payload).eq('id', editingId).select().maybeSingle();
  } else {
    // Gleiche hr_id oder gleicher Name -> bestehendes Pferd statt einer
    // Dopplung aktualisieren - aber erst nachfragen und nur ergänzen (siehe
    // mergePayloadWithExisting), damit ein erneuter Teil-Paste (z.B. nur
    // Colour, ohne Passport/Stammbaum) nicht versehentlich bereits erfasste
    // Werte des bestehenden Pferds überschreibt.
    let existing = null;
    if (payload.hr_id) {
      const { data } = await supabaseClient.from('horses').select('*').eq('hr_id', payload.hr_id).maybeSingle();
      existing = data;
    }
    if (!existing) {
      const { data } = await supabaseClient.from('horses').select('*').ilike('name', payload.name).maybeSingle();
      existing = data;
    }
    if (existing) {
      const proceed = confirm(buildDuplicateConfirmMessage(payload.name, existing.name));
      if (!proceed) {
        errorBox.textContent = 'Speichern abgebrochen.';
        return;
      }
      updated = true;
      const merged = mergePayloadWithExisting(payload, existing);
      result = await supabaseClient.from('horses').update(merged).eq('id', existing.id).select().maybeSingle();
    } else {
      result = await supabaseClient.from('horses').insert(payload).select().maybeSingle();
    }
  }

  if (result.error) {
    errorBox.textContent = 'Fehler beim Speichern: ' + result.error.message;
    return;
  }

  sessionStorage.setItem('flashMessage', `"${payload.name}" wurde ${updated ? 'aktualisiert' : 'neu angelegt'}.`);
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
