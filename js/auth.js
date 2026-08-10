// Supabase Auth kennt nur echte E-Mail-Logins. Damit auch Personen ohne
// eigene E-Mail-Adresse (z.B. ein Zuchtpartner/eine Zuchtpartnerin) sich
// mit einem einfachen Benutzernamen anmelden können, gilt dieselbe
// Konvention wie bei der MDR-Datenbank: ein "Benutzername"-Konto bekommt
// im Supabase-Dashboard die (frei erfundene, aber genau so zu schreibende)
// E-Mail-Adresse "<benutzername>@benutzer.horsereality-datenbank.local".
// Beim Anmelden reicht dann der Benutzername allein (ohne die "@..."-Domain).
// Enthält die Eingabe ein "@", wird sie unverändert als echte E-Mail
// behandelt (fürs Admin-/Haupt-Konto mit echter Adresse).
const USERNAME_EMAIL_DOMAIN = '@benutzer.horsereality-datenbank.local';

function resolveLoginEmail(identifier) {
  return identifier.includes('@') ? identifier : identifier + USERNAME_EMAIL_DOMAIN;
}

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
