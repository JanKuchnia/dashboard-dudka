/* client-edit.js (ASCII only: non-ASCII text is \u-escaped so it renders whatever charset the server sends) \u2014 click-to-request-changes overlay.
 * Add to a site:  <script src="https://CRM_HOST/client-edit.js" data-url="SUPABASE_URL" data-key="SUPABASE_ANON_KEY" defer></script>
 * Client opens:   https://site.com/?edit=EDIT_TOKEN (leads.edit_token; requests land in the CRM)
 */
(function () {
  'use strict';

  var me = document.currentScript || {};
  var SB_URL = me.dataset && me.dataset.url, SB_KEY = me.dataset && me.dataset.key;
  var SB_HEADERS = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
  // PostgREST/Storage errors come back as JSON with message/error fields
  function sbFetch(url, opts) {
    return fetch(SB_URL + url, opts).then(function (r) {
      if (r.ok) return r;
      return r.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.message || j.error || ('HTTP ' + r.status)); });
    });
  }
  var KEY_STORE = 'client-edit:key';

  // Unique selector for an element: id if unique, else a path of tag/class/nth-of-type.
  function cssPath(el) {
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement) {
      var part = el.tagName.toLowerCase();
      if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
        parts.unshift('#' + CSS.escape(el.id));
        break;
      }
      // skip generated-looking classes (hashes, long tokens)
      var cls = Array.prototype.filter.call(el.classList, function (c) {
        return c.length < 25 && !/\d{3,}|__|^css-|^sc-/.test(c);
      }).slice(0, 2);
      if (cls.length) part += '.' + cls.map(CSS.escape).join('.');
      var parent = el.parentElement;
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (s) { return s.tagName === el.tagName; });
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(el) + 1) + ')';
      }
      parts.unshift(part);
      if (document.querySelectorAll(parts.join(' > ')).length === 1) break;
      el = parent;
    }
    return parts.join(' > ');
  }
  window.ClientEdit = { cssPath: cssPath };

  var params = new URLSearchParams(location.search);
  var key;
  try {
    if (params.has('edit')) sessionStorage.setItem(KEY_STORE, params.get('edit'));
    key = sessionStorage.getItem(KEY_STORE);
  } catch (e) { key = params.get('edit'); }
  if (!key || !/^[0-9a-f]{32}$/.test(key) || !SB_URL || !SB_KEY) return;
  var STORE = 'client-edit:items:' + key; // per project, so test items never mix with a client's

  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch (e) { return []; } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(items)); } catch (e) { /* private mode: items live in memory only */ } }
  var items = load();

  function snippet(el) {
    var t = (el.innerText || el.alt || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
    return t.length > 120 ? t.slice(0, 117) + '...' : t;
  }

  // ---- UI in Shadow DOM so site CSS can't touch it ----
  var host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  document.documentElement.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<style>' +
    '*{box-sizing:border-box;font:14px/1.4 system-ui,sans-serif}' +
    '.hl{position:fixed;border:2px solid #2563eb;background:rgba(37,99,235,.08);pointer-events:none;display:none;border-radius:3px}' +
    '.bar{position:fixed;right:16px;bottom:16px;pointer-events:auto;background:#111;color:#fff;border-radius:10px;padding:10px;box-shadow:0 6px 24px rgba(0,0,0,.3);width:300px;max-height:70vh;display:flex;flex-direction:column;gap:8px}' +
    '.row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}' +
    'button{cursor:pointer;border:0;border-radius:6px;padding:6px 10px;background:#333;color:#fff}' +
    'button.p{background:#2563eb}button.d{background:#b91c1c}button:disabled{opacity:.5;cursor:default}' +
    'ul{list-style:none;margin:0;padding:0;overflow:auto}' +
    'li{background:#222;border-radius:6px;padding:6px 8px;margin-top:4px;display:flex;gap:6px;justify-content:space-between}' +
    'li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    'li button{padding:0 6px;background:transparent;color:#aaa}' +
    '.pop{position:fixed;pointer-events:auto;background:#fff;color:#111;border-radius:10px;padding:12px;width:320px;box-shadow:0 8px 30px rgba(0,0,0,.35);display:none;flex-direction:column;gap:8px}' +
    'input[type=file]{font-size:12px;width:100%}textarea{width:100%;min-height:80px;border:1px solid #ccc;border-radius:6px;padding:6px;resize:vertical}' +
    '.pop button{background:#e5e7eb;color:#111}.pop button.p{background:#2563eb;color:#fff}.pop button.d{background:#b91c1c;color:#fff}' +
    '.muted{color:#888;font-size:12px}' +
    '.head{justify-content:space-between}.head button{padding:4px 8px}' +
    'button.on{background:#16a34a}' +
    'li span{cursor:pointer}li span:hover{text-decoration:underline}' +
    '.tip{background:#1e3a8a;border-radius:6px;padding:8px;display:none;gap:6px;flex-direction:column}' +
    '.bar.min>:not(.head){display:none}.bar.min{width:auto}' +
    '.hl.flash{border-color:#f59e0b;background:rgba(245,158,11,.2)}' +
    '</style>' +
    '<div class="hl"></div>' +
    '<div class="pop" role="dialog" aria-label="Zg\u0142o\u015b zmian\u0119">' +
    '  <div class="muted pop-target"></div>' +
    '  <label class="muted" for="ce-text">Wpisz nowy tekst lub uwag\u0119:</label>' +
    '  <textarea id="ce-text"></textarea>' +
    '  <label class="muted">Do\u0142\u0105cz zdj\u0119cie (opcjonalnie): <input type="file" class="files" accept="image/*" multiple></label>' +
    '  <div class="row"><button class="p" data-act="change">Zamie\u0144 tekst</button><button data-act="note">Dodaj jako uwag\u0119</button>' +
    '  <button class="d" data-act="delete">Usu\u0144 to</button><button data-act="cancel">Anuluj</button></div>' +
    '</div>' +
    '<div class="bar">' +
    '  <div class="row head"><strong>Zmiany <span class="muted count"></span></strong>' +
    '    <span class="row"><button class="mode"></button><button class="minb" aria-label="Zwi\u0144 panel">\u2013</button></span></div>' +
    '  <div class="tip"><div>Witaj! Kliknij dowolny tekst, obrazek lub sekcj\u0119, aby zg\u0142osi\u0107 zmian\u0119. ' +
    'Prze\u0142\u0105cz na \u201ePrzegl\u0105daj\u201d, aby normalnie klika\u0107 linki i przej\u015b\u0107 na inn\u0105 podstron\u0119 \u2014 lista zmian zostaje. ' +
    'Na koniec kliknij \u201eWy\u015blij do developera\u201d.</div><button class="p tipok">Rozumiem</button></div>' +
    '  <div class="muted hint"></div>' +
    '  <ul></ul>' +
    '  <div class="row"><button class="p send">Wy\u015blij do developera</button><button class="dl">Pobierz</button><button class="d clear">Wyczy\u015b\u0107</button></div>' +
    '  <div class="muted status" aria-live="polite"></div>' +
    '</div>';

  var $ = function (s) { return root.querySelector(s); };
  var hl = $('.hl'), pop = $('.pop'), text = $('textarea'), list = $('ul'), status = $('.status');
  var target = null, editIndex = null, bar = $('.bar'), fileIn = $('.files');

  // per-viewer UI prefs; failures (private mode) just fall back to defaults
  function pref(k, v) {
    try { if (v === undefined) return localStorage.getItem('client-edit:' + k); localStorage.setItem('client-edit:' + k, v); } catch (e) { return null; }
  }
  var editing = pref('mode') !== 'browse';
  function setMode(on) {
    editing = on;
    pref('mode', on ? 'edit' : 'browse');
    $('.mode').textContent = on ? 'Tryb: Edycja' : 'Tryb: Przegl\u0105daj';
    $('.mode').className = 'mode' + (on ? ' on' : '');
    $('.hint').textContent = on ? 'Kliknij element strony, aby zg\u0142osi\u0107 zmian\u0119.' : 'Linki dzia\u0142aj\u0105 normalnie. W\u0142\u0105cz Edycj\u0119, aby zg\u0142asza\u0107 zmiany.';
    if (!on) { hl.style.display = 'none'; closePop(); }
  }
  $('.mode').onclick = function () { setMode(!editing); };
  $('.minb').onclick = function () {
    var min = bar.classList.toggle('min');
    pref('min', min ? '1' : '');
    this.textContent = min ? '+' : '\u2013';
  };
  if (pref('min')) $('.minb').onclick.call($('.minb'));
  if (!pref('seen')) $('.tip').style.display = 'flex';
  $('.tipok').onclick = function () { $('.tip').style.display = 'none'; pref('seen', '1'); };

  function closePop() { pop.style.display = 'none'; target = null; editIndex = null; }
  function openPop(el, value, x, y) {
    target = el;
    text.value = value;
    fileIn.value = '';
    $('.pop-target').textContent = '<' + el.tagName.toLowerCase() + '> ' + (snippet(el) || '(brak tekstu)');
    pop.style.left = Math.max(8, Math.min(x, innerWidth - 336)) + 'px';
    pop.style.top = Math.max(8, Math.min(y, innerHeight - 220)) + 'px';
    pop.style.display = 'flex';
    text.focus();
  }

  function inUI(e) { return e.composedPath().indexOf(host) !== -1; }

  document.addEventListener('mouseover', function (e) {
    if (!editing || inUI(e) || pop.style.display === 'flex') return;
    var r = e.target.getBoundingClientRect();
    hl.style.cssText = 'display:block;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
  }, true);

  // capture phase: stop links/buttons on the site from firing while editing
  document.addEventListener('click', function (e) {
    if (inUI(e)) return;
    if (!editing) {
      // carry ?edit through site links: sessionStorage is lost on new tabs and www/non-www redirects
      var a = e.target.closest && e.target.closest('a[href]');
      var bare = function (h) { return h.replace(/^www\./, ''); };
      if (a && /^https?:$/.test(a.protocol) && bare(a.hostname) === bare(location.hostname)) {
        var u = new URL(a.href);
        u.searchParams.set('edit', key);
        a.href = u.href;
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    editIndex = null;
    openPop(e.target, snippet(e.target), e.clientX, e.clientY + 12);
  }, true);

  function upload(f) {
    var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic' }[f.type];
    if (!ext) return Promise.reject(new Error('Tylko zdj\u0119cia JPG, PNG, WEBP, GIF lub HEIC'));
    var rnd = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(8)), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    var name = key + '/' + rnd + '.' + ext;
    return sbFetch('/storage/v1/object/change-uploads/' + name, { method: 'POST', headers: Object.assign({ 'Content-Type': f.type }, SB_HEADERS), body: f })
      .then(function () { return name; });
  }

  function commit(act) {
    if (act === 'cancel' || !target) return closePop();
    var el = target, idx = editIndex, value = act === 'delete' ? '' : text.value.trim();
    var picked = Array.prototype.slice.call(fileIn.files);
    if (picked.length) status.textContent = 'Wysy\u0142anie zdj\u0119\u0107...';
    closePop();
    Promise.all(picked.map(upload)).then(function (names) {
      var old = idx !== null ? items[idx] : null;
      var it = {
        path: location.pathname,
        selector: old ? old.selector : cssPath(el),
        tag: el.tagName.toLowerCase(),
        // preview may have rewritten the element, so keep the original text when re-editing
        current: old ? old.current : snippet(el),
        action: act,
        value: value,
        files: ((old && old.files) || []).concat(names),
        vw: innerWidth
      };
      if (old) items[idx] = it; else items.push(it);
      save();
      if (picked.length) status.textContent = '';
      if (old && old.action === 'change' && act !== 'change') { location.reload(); return; } // undo stale preview
      render();
    }).catch(function (err) { status.textContent = 'Nie uda\u0142o si\u0119 doda\u0107 zdj\u0119cia (' + err.message + ').'; });
  }
  pop.addEventListener('click', function (e) {
    var act = e.target.dataset && e.target.dataset.act;
    if (act) commit(act);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePop();
  });
  text.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit('change'); }
  });

  // Click a list item: go to its element (other page: navigate), flash it, reopen it for editing
  function flash(el, then) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(function () {
      var r = el.getBoundingClientRect();
      hl.style.cssText = 'display:block;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
      hl.classList.add('flash');
      setTimeout(function () { hl.classList.remove('flash'); }, 1200);
      if (then) then(r);
    }, 400);
  }
  function find(sel) { try { return document.querySelector(sel); } catch (e) { return null; } }

  function jumpTo(i) {
    var it = items[i];
    if (it.path !== location.pathname) { location.href = it.path; return; }
    var el = find(it.selector);
    if (!el) { status.textContent = 'Nie znaleziono tego elementu na stronie.'; return; }
    flash(el, function (r) {
      editIndex = i;
      openPop(el, it.value || it.current, r.left, r.bottom + 8);
    });
  }

  // Markdown stays English (it's for the developer); the client-facing list is Polish.
  var LABEL = { change: 'CHANGE', delete: 'DELETE', note: 'NOTE' };
  var LABEL_PL = { change: 'ZMIANA', delete: 'USU\u0143', note: 'UWAGA' };
  function plural(n) {
    if (n === 1) return 'zmiana';
    var d = n % 10, t = n % 100;
    return d >= 2 && d <= 4 && (t < 12 || t > 14) ? 'zmiany' : 'zmian';
  }

  // Preview requested changes on the current page (reload restores originals)
  function preview() {
    items.forEach(function (it) {
      if (it.path !== location.pathname) return;
      var el = find(it.selector);
      if (!el) return;
      // only rewrite leaf text; replacing nested markup would drop links/formatting, so just mark it
      if (it.action === 'change') { if (el.children.length === 0) el.textContent = it.value; else el.style.outline = '2px dashed #2563eb'; }
      if (it.action === 'delete') { el.style.opacity = '.35'; el.style.outline = '2px dashed #b91c1c'; }
      if (it.action === 'note') el.style.outline = '2px dashed #f59e0b';
    });
  }

  function render() {
    list.innerHTML = '';
    items.forEach(function (it, i) {
      var li = document.createElement('li');
      var s = document.createElement('span');
      s.textContent = LABEL_PL[it.action] + ' ' + it.path + ' \u2014 ' + (it.value || it.current || it.tag);
      s.title = 'Poka\u017c i edytuj';
      s.onclick = function () { jumpTo(i); };
      var x = document.createElement('button');
      x.textContent = '\u2715';
      x.setAttribute('aria-label', 'Usu\u0144');
      x.onclick = function () { items.splice(i, 1); save(); render(); };
      li.append(s, x);
      list.appendChild(li);
    });
    $('.count').textContent = items.length + ' ' + plural(items.length);
    $('.send').disabled = $('.dl').disabled = !items.length;
    preview();
  }

  // indent continuation lines so client text can't start a new list item or heading
  function block(s) { return s.replace(/\r?\n/g, '\n     '); }

  function toMarkdown() {
    var md = '# Change request \u2014 ' + location.host + ' \u2014 ' + new Date().toISOString().slice(0, 10) + '\n\n';
    md += 'Selectors are hints; the "currently" text is the reliable way to find each spot. "open" links highlight the element.\n';
    md += 'Browser: ' + navigator.userAgent + '\n';
    var byPath = {};
    items.forEach(function (it) { (byPath[it.path] = byPath[it.path] || []).push(it); });
    Object.keys(byPath).forEach(function (p) {
      md += '\n## ' + p + '\n\n';
      byPath[p].forEach(function (it, i) {
        md += (i + 1) + '. **' + LABEL[it.action] + '** `' + it.selector + '` (<' + it.tag + '>)\n';
        if (it.current) md += '   - currently: "' + it.current + '"\n';
        if (it.action === 'change') md += '   - change to: "' + block(it.value) + '"\n';
        if (it.action === 'note') md += '   - note: ' + block(it.value) + '\n';
        (it.files || []).forEach(function (f) { md += '   - attached image: ' + f + ' (w CRM)\n'; });
        if (it.vw) md += '   - screen width: ' + it.vw + 'px\n';
        md += '   - open: ' + location.origin + p + '?edit=' + encodeURIComponent(key) + '&ce=' + encodeURIComponent(it.selector) + '\n';
      });
    });
    return md;
  }

  $('.dl').onclick = function () {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toMarkdown()], { type: 'text/markdown' }));
    a.download = 'change-request-' + location.host + '.md';
    a.click();
  };

  // two-click confirm instead of a browser dialog
  $('.clear').onclick = function () {
    var btn = this;
    if (btn.dataset.armed) { items = []; save(); location.reload(); return; }
    btn.dataset.armed = '1';
    btn.textContent = 'Na pewno?';
    setTimeout(function () { delete btn.dataset.armed; btn.textContent = 'Wyczy\u015b\u0107'; }, 3000);
  };

  $('.send').onclick = function () {
    var btn = this;
    btn.disabled = true;
    status.textContent = 'Wysy\u0142anie...';
    sbFetch('/rest/v1/rpc/submit_change_request', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, SB_HEADERS), body: JSON.stringify({ p_token: key, p_count: items.length, p_files: [].concat.apply([], items.map(function (it) { return it.files || []; })), p_markdown: toMarkdown() }) })
      .then(function () {
        // delivered, so the list is done; keep the preview until the next reload
        items = []; save(); render();
        status.textContent = 'Wys\u0142ano! Zmiany zosta\u0142y dostarczone. Dzi\u0119kujemy!';
      })
      .catch(function (err) { status.textContent = 'Nie uda\u0142o si\u0119 wys\u0142a\u0107 (' + err.message + '). U\u017cyj przycisku Pobierz.'; })
      .then(function () { btn.disabled = !items.length; });
  };

  setMode(editing);
  render();
  // developer opening an "open" link from the request
  var ceEl = params.get('ce') && find(params.get('ce'));
  if (ceEl) flash(ceEl);
})();
