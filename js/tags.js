// Schlagwoerter fuers Kennzeichnen eigener Pferde - bewusst eine feste statt
// frei eintippbaren Liste, damit Farben/Filter eindeutig bleiben (wie beim
// Schwesterprojekt MDR-Datenbank). Jedes Pferd kann mehrere gleichzeitig
// tragen (Array von Labels, z.B. ["Zucht", "Behalten"]), gespeichert in
// horses.tags (jsonb). Wird von horse.html/massenerfassung.js (Zuweisung),
// index.html/list.js (Anzeige+Filter) und sortierhilfe.html/js (Filter)
// genutzt - deshalb als eigene Datei statt Teil von parser.js/pedigree.js.
const HORSE_TAG_OPTIONS = [
  { label: 'LastFoal', color: 'var(--warning)' },
  { label: 'Verkauf / Abgabe', color: 'var(--danger)' },
  { label: 'Behalten', color: 'var(--success)' },
  { label: 'Zucht', color: 'var(--accent)' },
  { label: '???', color: 'var(--muted)' },
];

function tagColor(label) {
  return HORSE_TAG_OPTIONS.find((t) => t.label === label)?.color || 'var(--muted)';
}

function tagsBadgesHtml(tags) {
  return (tags || []).map((label) =>
    `<span class="horse-tag-badge" style="background:${tagColor(label)}">${escapeHtmlForTags(label)}</span>`
  ).join('');
}

// Baut die Checkbox-Liste einmalig ins Ziel-Element ein (Aufruf z.B. beim
// Laden von horse.html) - welche Häkchen gesetzt sind, wird separat über
// fillTagCheckboxes (beim Bearbeiten eines bestehenden Pferds) bzw.
// readTagCheckboxes (beim Speichern) gesteuert/ausgelesen.
function renderTagCheckboxes(containerSelector) {
  const container = document.querySelector(containerSelector);
  container.innerHTML = HORSE_TAG_OPTIONS.map(({ label, color }) => `
    <label class="tag-checkbox-row">
      <input type="checkbox" data-tag-checkbox="${escapeHtmlForTags(label)}" />
      <span class="tag-dot" style="background:${color}"></span>
      ${escapeHtmlForTags(label)}
    </label>
  `).join('');
}

function fillTagCheckboxes(containerSelector, tags) {
  const container = document.querySelector(containerSelector);
  const set = new Set(tags || []);
  container.querySelectorAll('[data-tag-checkbox]').forEach((cb) => {
    cb.checked = set.has(cb.dataset.tagCheckbox);
  });
}

function readTagCheckboxes(containerSelector) {
  const container = document.querySelector(containerSelector);
  return [...container.querySelectorAll('[data-tag-checkbox]:checked')].map((cb) => cb.dataset.tagCheckbox);
}

function escapeHtmlForTags(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
