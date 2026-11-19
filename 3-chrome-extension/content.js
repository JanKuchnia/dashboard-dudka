// =====================================================================
//  Lead Scanner – skrypt działający na stronie Map Google
//  • skanuje listę wyników wyszukiwania,
//  • wyróżnia firmy bez strony WWW (lub tylko z FB / IG / Booksy),
//  • ostrzega o firmach, które już są w CRM,
//  • wysyła zaznaczone firmy do Supabase jednym kliknięciem.
// =====================================================================
(() => {
  if (window.__leadScannerLoaded) return;
  window.__leadScannerLoaded = true;

  // ------------------------------------------------------------------
  // Konfiguracja statusów strony
  // ------------------------------------------------------------------
  const WEBSITE = {
    BRAK_WWW: { label: 'BRAK WWW', cls: 'crmx-b-none', hot: true },
    TYLKO_FB: { label: 'TYLKO FB', cls: 'crmx-b-fb', hot: true },
    TYLKO_IG: { label: 'TYLKO IG', cls: 'crmx-b-ig', hot: true },
    TYLKO_BOOKSY: { label: 'TYLKO BOOKSY', cls: 'crmx-b-booksy', hot: true },
    INNE_SOCIAL: { label: 'INNE SOCIAL', cls: 'crmx-b-social', hot: true },
    MA_WWW: { label: 'MA WWW', cls: 'crmx-b-www', hot: false },
  };

  const STATUS_LABEL = {
    NOWY: 'Nowy',
    CHCA: 'Chcą',
    DO_ZASTANOWIENIA: 'Do zastanowienia',
    NIE_CHCA: 'Nie chcą',
    NIE_ODEBRAL: 'Nie odbiera',
  };

  const PHONE_RE = /(?:\+48[\s-]?)?(?:\d{3}[\s-]?\d{3}[\s-]?\d{3}|\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})/;

  // ------------------------------------------------------------------
  // Stan
  // ------------------------------------------------------------------
  const items = new Map(); // key → dane firmy
  const selected = new Set(); // klucze zaznaczonych firm
  const dupByKey = new Map(); // key → { status, company_name }
  const checkedKeys = new Set(); // już sprawdzone pod kątem duplikatów
  let settings = { collapsed: false, onlyHot: false, city: '' };
  let auth = { configured: false, loggedIn: false, email: '' };
  let busy = false;
  let lastMessage = { text: '', type: 'info' };

  // ------------------------------------------------------------------
  // Pomocnicze
  // ------------------------------------------------------------------
  const send = (type, payload) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, payload }, (res) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: 'Wtyczka została przeładowana – odśwież stronę Map.' });
          else resolve(res || { ok: false, error: 'Brak odpowiedzi wtyczki.' });
        });
      } catch {
        resolve({ ok: false, error: 'Wtyczka została przeładowana – odśwież stronę Map.' });
      }
    });

  function normalizePhone(p) {
    if (!p) return '';
    let d = String(p).replace(/\D/g, '');
    if (d.startsWith('0048')) d = d.slice(4);
    else if (d.startsWith('48') && d.length === 11) d = d.slice(2);
    return d;
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c) node.append(c);
    return node;
  }

  // Ikony Lucide (licencja ISC) jako SVG – wtyczka nie ma bundlera
  const ICONS = {
    phone: ['M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384'],
    plus: ['M5 12h14', 'M12 5v14'],
    alert: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
    check: ['M20 6 9 17l-5-5'],
  };
  function icon(name) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    for (const [k, v] of Object.entries({
      class: 'crmx-svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
    })) svg.setAttribute(k, v);
    for (const d of ICONS[name]) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      svg.append(p);
    }
    return svg;
  }

  /** Wyciąga prawdziwy adres z przekierowań Google (/url?q=...) */
  function unwrapUrl(href) {
    try {
      const u = new URL(href);
      if (/google\./.test(u.hostname) && u.pathname === '/url') return u.searchParams.get('q') || href;
      return href;
    } catch {
      return href;
    }
  }

  /** Klasyfikacja strony WWW na podstawie linku */
  function classifyWebsite(url) {
    if (!url) return 'BRAK_WWW';
    const u = url.toLowerCase();
    if (/facebook\.com|fb\.com|fb\.me|m\.facebook/.test(u)) return 'TYLKO_FB';
    if (/instagram\.com|instagr\.am/.test(u)) return 'TYLKO_IG';
    if (/booksy\.|moment\.pl|versum\.|fresha\.|treatwell\.|znanylekarz\.|nailsoft|salonsoft/.test(u)) return 'TYLKO_BOOKSY';
    if (/linktr\.ee|tiktok\.com|sites\.google|business\.site|wixsite\.com\/?$|olx\.pl|allegro\.pl|oferteo|fixly|yt\.be|youtube\.com|wa\.me|whatsapp/.test(u))
      return 'INNE_SOCIAL';
    return 'MA_WWW';
  }

  function extractPlaceId(href) {
    if (!href) return null;
    const chij = href.match(/!19s(ChIJ[^!?&/]+)/);
    if (chij) return decodeURIComponent(chij[1]);
    const ftid = href.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
    if (ftid) return ftid[1];
    return null;
  }

  function parseRating(text) {
    if (!text) return {};
    const r = text.match(/(\d[,.]\d)/);
    const n = text.match(/\(([\d\s .]+)\)/) || text.match(/([\d\s .]+)\s*(opini|recenz|review)/i);
    return {
      rating: r ? Number(r[1].replace(',', '.')) : null,
      reviews: n ? parseInt(n[1].replace(/[^\d]/g, ''), 10) || null : null,
    };
  }

  /** "ul. Długa 12, 31-147 Kraków" → "Kraków" */
  function cityFromAddress(address) {
    if (!address) return '';
    const m = address.match(/\d{2}-\d{3}\s+([^,]+)/);
    return m ? m[1].trim() : '';
  }

  /** Zgadywanie miasta z wyszukiwanej frazy: "fryzjer kraków" → "Kraków" */
  function guessCityFromSearch() {
    const input = document.querySelector('#searchboxinput, input[name="q"]');
    const words = (input?.value || '').trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return '';
    const w = words[words.length - 1];
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }

  function isIconOnly(s) {
    return !s.replace(/[-\s·⋅]/g, '');
  }

  // ------------------------------------------------------------------
  // Parsowanie kart w liście wyników
  // ------------------------------------------------------------------
  function parseCard(card, link) {
    const name = (link.getAttribute('aria-label') || card.querySelector('.fontHeadlineSmall')?.textContent || '').trim();
    if (!name) return null;
    const href = link.href;
    const placeId = extractPlaceId(href);

    const lines = (card.innerText || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    // Ocena i liczba opinii
    const ratingEl = card.querySelector('span[role="img"][aria-label]');
    let { rating, reviews } = parseRating(ratingEl?.getAttribute('aria-label'));
    if (rating == null) {
      const rl = lines.find((l) => /^\d[,.]\d(\s*\([\d\s.]+\))?/.test(l));
      ({ rating, reviews } = parseRating(rl));
    }

    // Telefon
    let phone = '';
    for (const l of lines) {
      const m = l.match(PHONE_RE);
      if (m && normalizePhone(m[0]).length >= 9) {
        phone = m[0].trim();
        break;
      }
    }

    // Kategoria i adres (linia w stylu "Fryzjer · ul. Długa 12")
    let category = '';
    let address = '';
    for (const l of lines) {
      if (!l.includes('·')) continue;
      if (/^\d[,.]\d/.test(l)) continue;
      const tokens = l
        .split(/[·⋅]/)
        .map((t) => t.trim())
        .filter((t) => t && !isIconOnly(t));
      if (!tokens.length) continue;
      if (/otwar|zamkn|czynne|godzin|open|closed/i.test(tokens[0])) continue;
      if (!category && !PHONE_RE.test(tokens[0]) && !/\d/.test(tokens[0]) && !/^[$€zł]+$/.test(tokens[0])) category = tokens[0];
      const addr = tokens.find(
        (t) => t !== category && /\d/.test(t) && !PHONE_RE.test(t) && !/otwar|zamkn|czynne|godz|^\d[,.]\d/i.test(t),
      );
      if (addr && !address) address = addr;
      if (category && address) break;
    }

    // Strona WWW – link prowadzący poza Google
    let websiteUrl = '';
    for (const a of card.querySelectorAll('a[href]')) {
      const h = unwrapUrl(a.href);
      if (!/^https?:/.test(h)) continue;
      if (/(^|\.)google\.[a-z.]+\//.test(h.replace(/^https?:\/\//, '')) || /googleadservices|doubleclick/.test(h)) continue;
      websiteUrl = h;
      break;
    }

    const sponsored = /Sponsorowan|Sponsored/i.test(card.innerText || '');

    return {
      key: placeId || `nazwa:${name}|${address}`,
      name,
      placeId,
      mapsUrl: href.split('?')[0],
      phone,
      rating,
      reviews,
      category,
      address,
      websiteUrl,
      websiteStatus: classifyWebsite(websiteUrl),
      sponsored,
    };
  }

  // ------------------------------------------------------------------
  // Parsowanie otwartej wizytówki (panel szczegółów)
  // ------------------------------------------------------------------
  function parseDetail() {
    const main = document.querySelector('div[role="main"]');
    const h1 = main?.querySelector('h1');
    if (!h1 || !/\/maps\/place\//.test(location.href)) return null;
    const name = h1.textContent.trim();
    if (!name) return null;

    const phoneEl = main.querySelector('[data-item-id^="phone:tel:"]');
    const phone = phoneEl ? phoneEl.getAttribute('data-item-id').replace('phone:tel:', '') : '';
    const webEl = main.querySelector('a[data-item-id="authority"]');
    const websiteUrl = webEl ? unwrapUrl(webEl.href) : '';
    const addrEl = main.querySelector('[data-item-id="address"]');
    const address = addrEl
      ? (addrEl.getAttribute('aria-label') || addrEl.textContent || '').replace(/^Adres:\s*|^Address:\s*/i, '').trim()
      : '';
    const catEl = main.querySelector('button[jsaction*="category"]');
    const category = catEl ? catEl.textContent.trim() : '';
    const ratingBox = main.querySelector('div.F7nice') || main.querySelector('span[role="img"][aria-label*="gwiazd"]');
    const { rating, reviews } = parseRating(ratingBox?.textContent || ratingBox?.getAttribute?.('aria-label'));
    const placeId = extractPlaceId(location.href);

    return {
      key: placeId || `nazwa:${name}|${address}`,
      name,
      placeId,
      mapsUrl: location.href.split('?')[0],
      phone,
      rating,
      reviews,
      category,
      address,
      websiteUrl,
      websiteStatus: classifyWebsite(websiteUrl),
      sponsored: false,
    };
  }

  // ------------------------------------------------------------------
  // Dekorowanie kart (plakietka + checkbox)
  // ------------------------------------------------------------------
  function decorate(card, item) {
    card.classList.add('crmx-card');
    const w = WEBSITE[item.websiteStatus];
    const dup = dupByKey.get(item.key);
    card.classList.toggle('crmx-hot', w.hot && !dup);
    card.classList.toggle('crmx-dup', !!dup);
    card.classList.toggle('crmx-dim', settings.onlyHot && (!w.hot || !!dup));
    card.classList.toggle('crmx-selected', selected.has(item.key));

    let box = card.querySelector(':scope > .crmx-overlay');
    if (!box) {
      box = el('div', { class: 'crmx-overlay' });
      // Kliknięcia w nakładkę nie otwierają wizytówki
      ['click', 'mousedown', 'mouseup', 'pointerdown'].forEach((ev) =>
        box.addEventListener(ev, (e) => e.stopPropagation()),
      );
      card.append(box);
    }
    const sig = `${item.websiteStatus}|${dup?.status || ''}|${selected.has(item.key)}`;
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.replaceChildren();

    if (dup) {
      box.append(
        el(
          'span',
          { class: 'crmx-badge crmx-b-dup', title: `Ta firma jest już w CRM (${dup.company_name})` },
          [icon('alert'), `W BAZIE – ${STATUS_LABEL[dup.status] || dup.status}`],
        ),
      );
    } else {
      box.append(el('span', { class: `crmx-badge ${w.cls}`, text: w.label }));
      const cb = el('input', {
        type: 'checkbox',
        class: 'crmx-check',
        title: 'Zaznacz do wysłania do CRM',
        onchange: (e) => {
          if (e.target.checked) selected.add(item.key);
          else selected.delete(item.key);
          renderAll();
        },
      });
      cb.checked = selected.has(item.key);
      box.append(cb);
    }
  }

  // ------------------------------------------------------------------
  // Skanowanie strony
  // ------------------------------------------------------------------
  function scan() {
    const feed = document.querySelector('div[role="feed"]');
    const seenNow = new Set();
    if (feed) {
      const links = feed.querySelectorAll('a[href*="/maps/place/"]');
      for (const link of links) {
        const card = link.parentElement;
        if (!card || seenNow.has(card)) continue;
        seenNow.add(card);
        const item = parseCard(card, link);
        if (!item) continue;
        const prev = items.get(item.key);
        // Zachowujemy telefon, jeśli wcześniej był znany (np. z wizytówki)
        if (prev && !item.phone && prev.phone) item.phone = prev.phone;
        item.card = card;
        items.set(item.key, item);
        decorate(card, item);
      }
    }
    checkDuplicates();
    renderPanel();
  }

  function renderAll() {
    for (const item of items.values()) if (item.card?.isConnected) decorate(item.card, item);
    renderPanel();
  }

  // ------------------------------------------------------------------
  // Duplikaty
  // ------------------------------------------------------------------
  let dupTimer = null;
  function checkDuplicates(force = false) {
    clearTimeout(dupTimer);
    dupTimer = setTimeout(async () => {
      if (!auth.loggedIn) return;
      const detail = parseDetail();
      const pool = [...items.values()];
      if (detail) pool.push(detail);
      const todo = pool.filter((i) => force || !checkedKeys.has(i.key));
      if (!todo.length) return;
      const placeIds = [...new Set(todo.map((i) => i.placeId || i.key))];
      const phones = [...new Set(todo.map((i) => normalizePhone(i.phone)).filter((p) => p.length >= 9))];
      const res = await send('checkDuplicates', { placeIds, phones });
      if (!res.ok) {
        setMessage(res.error, 'error');
        return;
      }
      todo.forEach((i) => checkedKeys.add(i.key));
      for (const row of res.data || []) {
        for (const i of pool) {
          const pid = i.placeId || i.key;
          if ((row.maps_place_id && row.maps_place_id === pid) || (row.phone_normalized && row.phone_normalized === normalizePhone(i.phone))) {
            dupByKey.set(i.key, { status: row.status, company_name: row.company_name });
            selected.delete(i.key);
          }
        }
      }
      renderAll();
    }, 500);
  }

  // ------------------------------------------------------------------
  // Wysyłanie do CRM
  // ------------------------------------------------------------------
  function toLead(item) {
    const city = cityFromAddress(item.address) || settings.city || guessCityFromSearch() || null;
    return {
      company_name: item.name,
      category: item.category || null,
      city,
      address: item.address || null,
      phone: item.phone || null,
      google_rating: item.rating ?? null,
      google_reviews_count: item.reviews ?? null,
      maps_url: item.mapsUrl || null,
      maps_place_id: item.placeId || item.key,
      website_url: item.websiteUrl || null,
      website_status: item.websiteStatus,
      source: 'chrome_extension',
    };
  }

  async function sendItems(list) {
    if (busy || !list.length) return;
    if (!auth.loggedIn) {
      setMessage('Zaloguj się – kliknij ikonę wtyczki na pasku przeglądarki.', 'error');
      return;
    }
    busy = true;
    setMessage(`Wysyłanie ${list.length} firm…`, 'info');
    const res = await send('saveLeads', { leads: list.map(toLead) });
    busy = false;
    if (!res.ok) {
      setMessage(res.error, 'error');
      return;
    }
    const inserted = res.data.inserted.length;
    const skipped = list.length - inserted;
    for (const i of list) {
      dupByKey.set(i.key, { status: 'NOWY', company_name: i.name });
      selected.delete(i.key);
    }
    setMessage(
      `Dodano ${inserted} ${inserted === 1 ? 'firmę' : 'firm'} do CRM${skipped ? ` · ${skipped} już było w bazie` : ''}.`,
      'success',
    );
    renderAll();
  }

  function setMessage(text, type = 'info') {
    lastMessage = { text, type };
    renderPanel();
  }

  // ------------------------------------------------------------------
  // Pływający panel
  // ------------------------------------------------------------------
  let panel = null;

  function saveSettings() {
    chrome.storage.local.set({ scannerSettings: settings });
  }

  function renderPanel() {
    if (!panel) {
      panel = el('div', { class: 'crmx-panel', id: 'crmx-panel' });
      ['click', 'mousedown', 'keydown', 'keyup', 'wheel'].forEach((ev) =>
        panel.addEventListener(ev, (e) => e.stopPropagation()),
      );
      document.body.append(panel);
    }

    // Nie przebudowujemy panelu, gdy użytkownik pisze w polu tekstowym
    const active = document.activeElement;
    if (panel.contains(active) && active.tagName === 'INPUT' && active.type !== 'checkbox') return;

    const all = [...items.values()].filter((i) => i.card?.isConnected);
    const hot = all.filter((i) => WEBSITE[i.websiteStatus].hot && !dupByKey.has(i.key));
    const dups = all.filter((i) => dupByKey.has(i.key));
    const sel = [...selected].map((k) => items.get(k)).filter(Boolean);
    const detail = parseDetail();

    panel.classList.toggle('crmx-collapsed', settings.collapsed);
    panel.replaceChildren();

    // Nagłówek
    panel.append(
      el('div', { class: 'crmx-head' }, [
        el('div', { class: 'crmx-title' }, [el('span', { class: 'crmx-logo' }, [icon('phone')]), el('span', { text: 'Lead Scanner' })]),
        el('button', {
          class: 'crmx-icon-btn',
          title: settings.collapsed ? 'Rozwiń' : 'Zwiń',
          text: settings.collapsed ? '▴' : '▾',
          onclick: () => {
            settings.collapsed = !settings.collapsed;
            saveSettings();
            renderPanel();
          },
        }),
      ]),
    );
    if (settings.collapsed) {
      panel.append(el('div', { class: 'crmx-mini', text: `${hot.length} bez WWW · ${sel.length} zaznaczonych` }));
      return;
    }

    if (!auth.configured || !auth.loggedIn) {
      panel.append(
        el('div', {
          class: 'crmx-alert',
          text: auth.configured
            ? 'Nie jesteś zalogowany. Kliknij ikonę wtyczki na pasku przeglądarki i zaloguj się.'
            : 'Wtyczka nie jest skonfigurowana. Kliknij jej ikonę i wpisz dane Supabase.',
        }),
      );
    }

    // Statystyki
    panel.append(
      el('div', { class: 'crmx-stats' }, [
        statBox(all.length, 'wyników'),
        statBox(hot.length, 'bez WWW', 'crmx-red'),
        statBox(dups.length, 'w bazie', 'crmx-gray'),
      ]),
    );

    if (!all.length && !detail) {
      panel.append(
        el('p', {
          class: 'crmx-hint',
          text: 'Wyszukaj w Mapach np. „fryzjer Kraków” – wyniki z listy pojawią się tutaj.',
        }),
      );
    }

    // Miasto
    const cityInput = el('input', {
      class: 'crmx-input',
      placeholder: guessCityFromSearch() || 'np. Kraków',
      value: settings.city || '',
      oninput: (e) => {
        settings.city = e.target.value;
        saveSettings();
      },
    });
    panel.append(el('label', { class: 'crmx-label', text: 'Miasto (gdy brak w adresie)' }), cityInput);

    // Filtr
    const onlyHot = el('input', {
      type: 'checkbox',
      onchange: (e) => {
        settings.onlyHot = e.target.checked;
        saveSettings();
        renderAll();
      },
    });
    onlyHot.checked = settings.onlyHot;
    panel.append(el('label', { class: 'crmx-toggle' }, [onlyHot, el('span', { text: 'Przyciemnij firmy z WWW i duplikaty' })]));

    // Akcje
    panel.append(
      el('div', { class: 'crmx-row' }, [
        el('button', {
          class: 'crmx-btn crmx-btn-secondary',
          text: `Zaznacz bez WWW (${hot.length})`,
          disabled: hot.length ? null : 'disabled',
          onclick: () => {
            hot.forEach((i) => selected.add(i.key));
            renderAll();
          },
        }),
        el('button', {
          class: 'crmx-btn crmx-btn-ghost',
          text: 'Wyczyść',
          disabled: sel.length ? null : 'disabled',
          onclick: () => {
            selected.clear();
            renderAll();
          },
        }),
      ]),
    );
    const sendBtn = el('button', {
      class: 'crmx-btn crmx-btn-primary',
      text: busy ? 'Wysyłanie…' : `Wyślij do CRM (${sel.length})`,
      onclick: () => sendItems(sel),
    });
    if (!sel.length || busy) sendBtn.disabled = true;
    panel.append(sendBtn);

    // Otwarta wizytówka
    if (detail) {
      const w = WEBSITE[detail.websiteStatus];
      const dup = dupByKey.get(detail.key);
      const box = el('div', { class: 'crmx-detail' }, [
        el('div', { class: 'crmx-detail-label', text: 'Otwarta wizytówka' }),
        el('div', { class: 'crmx-detail-name', text: detail.name }),
        el('div', { class: 'crmx-detail-meta' }, [
          el('span', { class: `crmx-badge ${w.cls}`, text: w.label }),
          el('span', { text: detail.phone || 'brak telefonu' }),
        ]),
      ]);
      if (dup) {
        box.append(el('div', { class: 'crmx-dup-note' }, [icon('alert'), `Już w CRM · ${STATUS_LABEL[dup.status] || dup.status}`]));
      } else {
        const b = el('button', { class: 'crmx-btn crmx-btn-primary', onclick: () => sendItems([detail]) }, [
          icon('plus'),
          'Dodaj tę firmę do CRM',
        ]);
        if (busy) b.disabled = true;
        box.append(b);
      }
      panel.append(box);
    }

    if (lastMessage.text) {
      const ico = { success: 'check', error: 'alert' }[lastMessage.type];
      panel.append(el('div', { class: `crmx-msg crmx-msg-${lastMessage.type}` }, [ico && icon(ico), lastMessage.text]));
    }
  }

  function statBox(value, label, cls = '') {
    return el('div', { class: `crmx-stat ${cls}` }, [
      el('div', { class: 'crmx-stat-v', text: String(value) }),
      el('div', { class: 'crmx-stat-l', text: label }),
    ]);
  }

  // ------------------------------------------------------------------
  // Start
  // ------------------------------------------------------------------
  async function refreshAuth() {
    const res = await send('status');
    if (res.ok) auth = res.data;
  }

  let scanTimer = null;
  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 400);
  }

  async function init() {
    const stored = await chrome.storage.local.get('scannerSettings');
    settings = { ...settings, ...(stored.scannerSettings || {}) };
    await refreshAuth();
    scan();

    // Mapy to aplikacja SPA – obserwujemy zmiany w DOM
    const observer = new MutationObserver((mutations) => {
      // Ignorujemy zmiany wywołane przez nasz własny panel
      if (mutations.every((m) => panel && panel.contains(m.target))) return;
      scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Zmiana logowania w popupie → odświeżamy stan
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.session || changes.supabaseUrl || changes.supabaseKey) {
        refreshAuth().then(() => {
          checkedKeys.clear();
          dupByKey.clear();
          checkDuplicates(true);
          renderPanel();
        });
      }
    });
  }

  init();
})();
