document.addEventListener('DOMContentLoaded', init);

async function init() {
  const session = await requireSession();
  if (!session) return;
  wireLogout();
  document.querySelector('#session-email').textContent = `Angemeldet als: ${displayIdentity(session.user.email)}`;

  const { data, error } = await supabaseClient
    .from('horses')
    .select('id,name,breed,image_url,pangare,sooty,flaxen,sabino')
    .order('breed')
    .order('name');
  if (error) {
    alert('Fehler beim Laden: ' + error.message);
    return;
  }

  document.querySelector('#result-count').textContent = `${data.length} Pferde`;
  render(data);
}

function render(horses) {
  const root = document.querySelector('#gallery-root');
  let html = '';
  let lastBreed = null;
  horses.forEach((h) => {
    const breed = h.breed || 'Ohne Rasse';
    if (breed !== lastBreed) {
      if (lastBreed !== null) html += '</div>';
      html += `<h3 class="breed-heading">${escapeHtml(breed)}</h3><div class="gallery">`;
      lastBreed = breed;
    }
    const traits = ['pangare', 'sooty', 'flaxen', 'sabino']
      .filter((t) => h[t] === 'ja')
      .map((t) => t[0].toUpperCase() + t.slice(1))
      .join(', ');
    const img = h.image_url
      ? `<img src="${escapeHtml(h.image_url)}" alt="${escapeHtml(h.name)}" />`
      : `<div class="gallery-noimg">kein Bild</div>`;
    html += `<div class="gallery-card" data-id="${h.id}">
      ${img}
      <div class="gallery-info">
        <div class="gallery-name"><a href="horse.html?id=${h.id}" target="_blank">${escapeHtml(h.name)}</a></div>
        <div class="gallery-traits">${traits ? escapeHtml(traits) : ''}</div>
      </div>
    </div>`;
  });
  if (lastBreed !== null) html += '</div>';
  root.innerHTML = html;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
