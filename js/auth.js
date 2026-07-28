// Anmeldung mit einer echten E-Mail-Adresse (Supabase Auth kennt nur
// E-Mail-Logins). Dieses Projekt ist bewusst persönlich (dein eigener
// Horse-Reality-Account) - falls du später ein zweites Konto anlegen
// willst (z.B. für einen Zuchtpartner/eine Zuchtpartnerin), funktioniert
// das genau wie bei der MDR-Datenbank: im Supabase-Dashboard unter
// "Authentication -> Users -> Add user" anlegen.
async function requireSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

function wireLogout(selector) {
  const btn = document.querySelector(selector || '#logout-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
  });
}
