// =====================================================================
//  Lead Scanner – okienko wtyczki (ustawienia, logowanie, podsumowanie)
// =====================================================================
const $ = (id) => document.getElementById(id);

function send(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (res) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(res || { ok: false, error: 'Brak odpowiedzi.' });
    });
  });
}

function showMessage(text, type = 'error') {
  const m = $('msg');
  if (!text) {
    m.classList.add('hidden');
    return;
  }
  m.textContent = text;
  m.className = `msg ${type}`;
}

function showView(name) {
  for (const v of ['config', 'login', 'main']) $(`view-${v}`).classList.toggle('hidden', v !== name);
}

let state = null;

async function render() {
  const res = await send('status');
  if (!res.ok) {
    showMessage(res.error);
    return;
  }
  state = res.data;

  if (!state.configured) {
    $('cfg-url').value = state.supabaseUrl;
    $('cfg-key').value = state.supabaseKey;
    $('cfg-crm').value = state.crmUrl;
    $('btn-cancel-config').classList.add('hidden');
    showView('config');
    return;
  }
  if (!state.loggedIn) {
    showView('login');
    $('login-email').focus();
    return;
  }

  $('user-email').textContent = state.email;
  $('user-avatar').textContent = (state.email || '?')[0];
  if (state.crmUrl) {
    $('btn-crm').href = state.crmUrl;
    $('btn-crm').classList.remove('hidden');
  } else {
    $('btn-crm').classList.add('hidden');
  }
  showView('main');

  const stats = await send('stats');
  if (stats.ok && stats.data) {
    $('st-queue').textContent = stats.data.queue_new ?? 0;
    $('st-today').textContent = stats.data.calls_today ?? 0;
    $('st-int').textContent = stats.data.interested_total ?? 0;
  } else if (!stats.ok) {
    showMessage(stats.error);
    // Sesja została wyczyszczona w tle → pokaż ekran logowania
    if (/Sesja wygasła|Nie jesteś zalogowany/i.test(stats.error)) render();
  }
}

function openConfig() {
  $('cfg-url').value = state?.supabaseUrl || '';
  $('cfg-key').value = state?.supabaseKey || '';
  $('cfg-crm').value = state?.crmUrl || '';
  $('btn-cancel-config').classList.toggle('hidden', !state?.configured);
  showMessage('');
  showView('config');
}

$('btn-save-config').addEventListener('click', async () => {
  const btn = $('btn-save-config');
  btn.disabled = true;
  const res = await send('saveConfig', {
    supabaseUrl: $('cfg-url').value,
    supabaseKey: $('cfg-key').value,
    crmUrl: $('cfg-crm').value,
  });
  btn.disabled = false;
  if (!res.ok) {
    showMessage(res.error);
    return;
  }
  showMessage('Zapisano ustawienia.', 'success');
  render();
});

$('btn-cancel-config').addEventListener('click', () => {
  showMessage('');
  render();
});

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('btn-login');
  btn.disabled = true;
  btn.textContent = 'Logowanie…';
  const res = await send('login', { email: $('login-email').value, password: $('login-password').value });
  btn.disabled = false;
  btn.textContent = 'Zaloguj się';
  if (!res.ok) {
    showMessage(res.error);
    return;
  }
  $('login-password').value = '';
  showMessage('');
  render();
});

$('btn-logout').addEventListener('click', async () => {
  await send('logout');
  showMessage('Wylogowano.', 'success');
  render();
});

$('btn-edit-config-1').addEventListener('click', openConfig);
$('btn-edit-config-2').addEventListener('click', openConfig);

render();
