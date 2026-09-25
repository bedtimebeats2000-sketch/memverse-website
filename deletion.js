// Public Firebase Web configuration is supplied as firebase-config.json during deployment.
// No Admin credential or user credential belongs in this static site.
const root = document.querySelector('#deletion-app');
const status = (message, error = false) => {
  const target = document.querySelector('#deletion-status');
  target.textContent = message;
  target.setAttribute('role', error ? 'alert' : 'status');
};

root.innerHTML = `
  <section class="card" aria-label="Sichere MemVerse-Anmeldung">
    <h2>Sicher anmelden</h2>
    <p id="signed-out">Melde dich mit deinem MemVerse-Konto an, um deine eigenen Daten selbst zu löschen.</p>
    <form id="login-form">
      <label for="email">E-Mail</label><input id="email" type="email" autocomplete="username" required>
      <label for="password">Passwort</label><input id="password" type="password" autocomplete="current-password" required>
      <button type="submit">Mit E-Mail anmelden</button>
    </form>
    <button id="google-login" type="button">Mit Google anmelden</button>
    <p id="signed-in" hidden>Angemeldet als <strong id="account-email"></strong> <button id="logout" type="button">Abmelden</button></p>
  </section>
  <section id="actions" hidden>
    <div class="card"><h2>Serverdaten löschen</h2>
      <p>Dein Shared/MMap-Paar, freigegebene Inhalte, Aufgaben, Einkaufsdaten, Einladungen und Profil werden vom Server entfernt. Dein Firebase-Konto, ein laufendes Play-Abo und ausschließlich lokale Erinnerungen bleiben bestehen.</p>
      <button id="delete-data" type="button">Serverdaten löschen</button></div>
    <div class="card"><h2>Konto vollständig löschen</h2>
      <p>Das Online-Konto und die dazugehörigen MemVerse-Serverdaten einschließlich Berechtigungen werden entfernt. Lokale Inhalte auf deinen Geräten bleiben dort. Ein Play-Abo musst du separat in Google Play kündigen.</p>
      <button id="delete-account" type="button">Konto löschen</button></div>
  </section>
  <p id="deletion-status" role="status" aria-live="polite"></p>
  <dialog id="confirm-dialog" aria-labelledby="confirm-title">
    <form method="dialog"><h2 id="confirm-title"></h2><p id="confirm-explanation"></p>
      <label for="confirm-word">Zur Bestätigung LÖSCHEN eingeben</label>
      <input id="confirm-word" autocomplete="off" required>
      <div id="reauth-box" hidden><p>Für die Kontolöschung ist eine frische Anmeldung erforderlich.</p>
        <label for="reauth-password">Passwort erneut eingeben (bei E-Mail-Anmeldung)</label>
        <input id="reauth-password" type="password" autocomplete="current-password">
        <button id="reauth-google" type="button">Mit Google erneut bestätigen</button></div>
      <button id="cancel" value="cancel">Abbrechen</button>
      <button id="confirm" type="button">Endgültig löschen</button>
    </form>
  </dialog>`;

const $ = (id) => document.getElementById(id);
let auth, functions, sdk, currentAction, busy = false;
function setBusy(value) {
  busy = value;
  document.querySelectorAll('button').forEach((button) => { button.disabled = value; });
}
function describe(error) {
  switch (error?.code) {
    case 'auth/wrong-password': case 'auth/invalid-credential': case 'auth/user-not-found':
      return 'E-Mail oder Passwort ist nicht korrekt.';
    case 'auth/network-request-failed': case 'functions/unavailable': return 'Keine Verbindung. Bitte erneut versuchen.';
    case 'functions/unauthenticated': return 'Bitte melde dich erneut an.';
    case 'functions/failed-precondition': return 'Bitte bestätige deine Anmeldung erneut und versuche es noch einmal.';
    default: return 'Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.';
  }
}

try {
  const response = await fetch('./firebase-config.json', {cache: 'no-store'});
  if (!response.ok) throw Error('CONFIG_MISSING');
  const config = await response.json();
  if (config.projectId !== 'memverse-5faf0' || !config.apiKey || !config.appId ||
      config.authDomain !== 'memverse-5faf0.firebaseapp.com') throw Error('CONFIG_INVALID');
  const [appSdk, authSdk, functionsSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js'),
  ]);
  sdk = authSdk;
  const app = appSdk.initializeApp(config);
  auth = authSdk.getAuth(app);
  functions = functionsSdk.getFunctions(app, 'europe-west1');
  authSdk.onAuthStateChanged(auth, (user) => {
    $('login-form').hidden = !!user;
    $('google-login').hidden = !!user;
    $('signed-out').hidden = !!user;
    $('signed-in').hidden = !user;
    $('actions').hidden = !user;
    $('account-email').textContent = user?.email || 'MemVerse-Konto';
  });
  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (busy) return;
    setBusy(true);
    try {
      await authSdk.signInWithEmailAndPassword(auth, $('email').value, $('password').value);
      $('password').value = '';
      status('Angemeldet. Wähle die gewünschte Löschaktion.');
    } catch (error) { status(describe(error), true); }
    finally { $('password').value = ''; setBusy(false); }
  });
  $('google-login').addEventListener('click', async () => {
    if (busy) return; setBusy(true);
    try { await sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider()); status('Angemeldet.'); }
    catch (error) { if (error?.code !== 'auth/popup-closed-by-user') status(describe(error), true); }
    finally { setBusy(false); }
  });
  $('logout').addEventListener('click', async () => { await sdk.signOut(auth); status('Abgemeldet.'); });
  $('delete-data').addEventListener('click', () => openConfirmation('data'));
  $('delete-account').addEventListener('click', () => openConfirmation('account'));
  $('reauth-google').addEventListener('click', async () => {
    try { await sdk.reauthenticateWithPopup(auth.currentUser, new sdk.GoogleAuthProvider()); status('Anmeldung bestätigt.'); }
    catch (error) { status(describe(error), true); }
  });
  $('confirm').addEventListener('click', async () => {
    if (busy || $('confirm-word').value.trim() !== 'LÖSCHEN' || !auth.currentUser) {
      status('Bitte LÖSCHEN eingeben und angemeldet bleiben.', true); return;
    }
    setBusy(true);
    try {
      if (currentAction === 'account' && $('reauth-password').value) {
        const credential = sdk.EmailAuthProvider.credential(auth.currentUser.email, $('reauth-password').value);
        await sdk.reauthenticateWithCredential(auth.currentUser, credential);
      }
      const callable = functionsSdk.httpsCallable(functions, currentAction === 'account' ? 'deleteMyAccount' : 'deleteMyServerData');
      await callable({});
      if (currentAction === 'account') {
        await sdk.signOut(auth);
        status('Dein MemVerse-Online-Konto und deine Serverdaten wurden gelöscht. Lokale Gerätedaten sind davon unberührt.');
      } else {
        status('Deine MemVerse-Serverdaten wurden gelöscht. Dein Konto und lokale Daten bleiben bestehen.');
      }
      $('confirm-dialog').close();
    } catch (error) {
      if (error?.code === 'functions/failed-precondition' && currentAction === 'account') $('reauth-box').hidden = false;
      status(describe(error), true);
    } finally { $('reauth-password').value = ''; setBusy(false); }
  });
} catch {
  $('login-form').hidden = true;
  $('google-login').hidden = true;
  status('Die sichere Online-Löschung ist auf dieser Seite derzeit nicht verfügbar. Bitte versuche es später erneut.', true);
}

function openConfirmation(action) {
  if (busy || !auth?.currentUser) return;
  currentAction = action;
  $('confirm-word').value = '';
  $('reauth-password').value = '';
  $('reauth-box').hidden = action !== 'account';
  $('confirm-title').textContent = action === 'account' ? 'Konto endgültig löschen?' : 'Serverdaten endgültig löschen?';
  $('confirm-explanation').textContent = action === 'account' ?
    'Das Online-Konto wird nach der Serverbereinigung gelöscht. Dieser Schritt kann nicht rückgängig gemacht werden.' :
    'Deine Shared-Verbindung und Serverinhalte werden entfernt. Dein Konto bleibt bestehen.';
  $('confirm-dialog').showModal();
}
