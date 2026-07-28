document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    window.location.href = 'index.html';
    return;
  }

  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.textContent = '';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      errorBox.textContent = 'Anmeldung fehlgeschlagen: ' + error.message;
      return;
    }
    window.location.href = 'index.html';
  });
});
