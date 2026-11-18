/**
 * =====================================================================
 *  LEAD CRM – BACKEND W GOOGLE APPS SCRIPT
 *  Plik: 1-baza-google-sheets/Code.gs
 *
 *  Arkusz Google jest bazą danych:
 *    • zakładka „Leady”     – wszystkie firmy,
 *    • zakładka „Historia”  – każda rozmowa,
 *    • zakładka „Konfiguracja” – hasło dostępu i adres API.
 *
 *  Ten skrypt:
 *    1) wystawia API (aplikacja internetowa) dla panelu CRM i wtyczki Chrome,
 *    2) co 5 minut dodaje leady „Chcą” i „Do zastanowienia”
 *       do Kontaktów Google z etykietą „Agencja - Leady”.
 *
 *  Pierwsze uruchomienie: wybierz u góry funkcję „instaluj” i kliknij ▶.
 * =====================================================================
 */

const TZ = 'Europe/Warsaw';
const SHEET_LEADS = 'Leady';
const SHEET_LOGS = 'Historia';
const SHEET_CONFIG = 'Konfiguracja';
const CONTACT_GROUP_NAME = 'Agencja - Leady';
const CLAIM_MINUTES = 15;

// Kolejność kolumn w zakładce „Leady” – [klucz w API, nagłówek w arkuszu]
const LEAD_COLUMNS = [
  ['id', 'ID'],
  ['company_name', 'Firma'],
  ['category', 'Kategoria'],
  ['city', 'Miasto'],
  ['address', 'Adres'],
  ['phone', 'Telefon'],
  ['status', 'Status'],
  ['notes', 'Notatka'],
  ['follow_up_at', 'Follow-up'],
  ['website_status', 'Status WWW'],
  ['website_url', 'Obecna strona'],
  ['google_rating', 'Ocena Google'],
  ['google_reviews_count', 'Liczba opinii'],
  ['last_called_at', 'Ostatni telefon'],
  ['call_count', 'Liczba telefonów'],
  ['maps_url', 'Link do Map'],
  ['maps_place_id', 'ID miejsca'],
  ['phone_normalized', 'Telefon (cyfry)'],
  ['created_at', 'Dodano'],
  ['updated_at', 'Zmieniono'],
  ['source', 'Źródło'],
  ['created_by', 'Dodał(a)'],
  ['claimed_by', 'Obsługuje'],
  ['claimed_at', 'Zablokowano'],
  ['google_contact_id', 'ID kontaktu Google'],
  ['google_contact_synced_at', 'Dodano do Kontaktów'],
];

const LOG_COLUMNS = [
  ['id', 'ID'],
  ['created_at', 'Data'],
  ['company_name', 'Firma'],
  ['outcome', 'Wynik'],
  ['notes', 'Notatka'],
  ['follow_up_at', 'Follow-up'],
  ['user', 'Kto dzwonił'],
  ['lead_id', 'ID firmy'],
];

const TEXT_FIELDS = ['id', 'lead_id', 'phone', 'phone_normalized', 'maps_place_id', 'google_contact_id'];
const DATE_FIELDS = ['follow_up_at'];
const TIMESTAMP_FIELDS = ['created_at', 'updated_at', 'last_called_at', 'claimed_at', 'google_contact_synced_at'];
const NUMBER_FIELDS = ['google_rating', 'google_reviews_count', 'call_count'];

// Kody statusów ↔ czytelne etykiety w arkuszu
const STATUS_LABELS = {
  NOWY: 'Nowy',
  CHCA: 'Chcą',
  DO_ZASTANOWIENIA: 'Do zastanowienia',
  NIE_CHCA: 'Nie chcą',
};
const WEBSITE_LABELS = {
  BRAK_WWW: 'BRAK WWW',
  TYLKO_FB: 'TYLKO FB',
  TYLKO_IG: 'TYLKO IG',
  TYLKO_BOOKSY: 'TYLKO BOOKSY',
  INNE_SOCIAL: 'INNE SOCIAL',
  MA_WWW: 'MA WWW',
};
const OUTCOMES = ['CHCA', 'DO_ZASTANOWIENIA', 'NIE_CHCA'];

// =====================================================================
// INSTALACJA I MENU
// =====================================================================

/** Uruchom raz: tworzy zakładki, hasło dostępu i automatyczne Kontakty */
function instaluj() {
  const ss = getSpreadsheet_();
  getSheet_(SHEET_LEADS, LEAD_COLUMNS);
  getSheet_(SHEET_LOGS, LOG_COLUMNS);

  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('APP_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props.setProperty('APP_TOKEN', token);
  }

  // Wyzwalacz: Kontakty Google co 5 minut
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'synchronizujKontakty') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('synchronizujKontakty').timeBased().everyMinutes(5).create();

  // Sprawdzenie dostępu do Kontaktów (wywoła prośbę o uprawnienia)
  getOrCreateContactGroup_();

  writeConfigSheet_(ss, token);
  console.log('Gotowe! Hasło dostępu do CRM: ' + token);
  try {
    SpreadsheetApp.getUi().alert('CRM zainstalowany', 'Hasło dostępu do CRM: ' + token + '\n\nZnajdziesz je też w zakładce „Konfiguracja”.', SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    /* uruchomione z edytora – komunikat jest w dzienniku */
  }
}

function writeConfigSheet_(ss, token) {
  let sh = ss.getSheetByName(SHEET_CONFIG);
  if (!sh) sh = ss.insertSheet(SHEET_CONFIG);
  let url = '';
  try {
    url = ScriptApp.getService().getUrl() || '';
  } catch (e) {
    url = '';
  }
  sh.clear();
  sh.getRange(1, 1, 4, 2).setValues([
    ['Hasło dostępu do CRM', token],
    ['Adres API (aplikacja internetowa)', url || 'Wdróż skrypt jako aplikację internetową'],
    ['Etykieta w Kontaktach Google', CONTACT_GROUP_NAME],
    ['Uwaga', 'Nie zmieniaj kolejności kolumn w zakładkach „Leady” i „Historia”.'],
  ]);
  sh.getRange('A1:A4').setFontWeight('bold');
  sh.setColumnWidth(1, 260);
  sh.setColumnWidth(2, 520);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CRM')
    .addItem('Wyślij nowe kontakty teraz', 'synchronizujKontakty')
    .addItem('Pokaż hasło dostępu', 'pokazHaslo')
    .addSeparator()
    .addItem('Instaluj / napraw', 'instaluj')
    .addToUi();
}

function pokazHaslo() {
  const token = PropertiesService.getScriptProperties().getProperty('APP_TOKEN') || '(brak – uruchom „Instaluj”)';
  SpreadsheetApp.getUi().alert('Hasło dostępu do CRM: ' + token);
}

// =====================================================================
// API – aplikacja internetowa
// =====================================================================

function doGet() {
  return json_({ ok: true, data: { app: 'Lead CRM', info: 'API działa. Panel wysyła zapytania metodą POST.' } });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Nieprawidłowe zapytanie.' });
  }

  const token = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (!token) return json_({ ok: false, code: 'SETUP', error: 'CRM nie jest zainstalowany – uruchom funkcję „instaluj” w Apps Script.' });
  if (!req.token || String(req.token).trim() !== token) {
    return json_({ ok: false, code: 'AUTH', error: 'Nieprawidłowe hasło dostępu.' });
  }

  const handler = ACTIONS[req.action];
  if (!handler) return json_({ ok: false, error: 'Nieznana akcja: ' + req.action });

  try {
    const user = String(req.user || '').trim().slice(0, 60) || 'Nieznany';
    return json_({ ok: true, data: handler(req.payload || {}, user) });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: err.message || String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

const ACTIONS = {
  ping: function (p, user) {
    return { user: user };
  },

  // ---------- Power Dialer ----------
  claimNextLead: function (p, user) {
    return withLock_(function () {
      const t = loadTable_(SHEET_LEADS, LEAD_COLUMNS);
      const skip = p.skip || [];
      const limit = Date.now() - CLAIM_MINUTES * 60000;
      const candidates = t.rows.filter(function (r) {
        const l = r.obj;
        if (l.status !== 'NOWY' || skip.indexOf(l.id) !== -1) return false;
        if (!l.claimed_at || l.claimed_by === user) return true;
        return new Date(l.claimed_at).getTime() < limit;
      });
      candidates.sort(function (a, b) {
        return String(a.obj.created_at || '').localeCompare(String(b.obj.created_at || ''));
      });
      const next = candidates[0];
      if (!next) return null;
      next.obj.claimed_by = user;
      next.obj.claimed_at = new Date().toISOString();
      writeRow_(t, next);
      return next.obj;
    });
  },

  logCall: function (p, user) {
    if (OUTCOMES.indexOf(p.outcome) === -1) throw new Error('Nieprawidłowy wynik rozmowy.');
    return withLock_(function () {
      const t = loadTable_(SHEET_LEADS, LEAD_COLUMNS);
      const row = findById_(t, p.id);
      const now = new Date().toISOString();
      const notes = p.notes ? String(p.notes).trim() : null;
      Object.assign(row.obj, {
        status: p.outcome,
        notes: notes || null,
        follow_up_at: p.followUpAt || null,
        last_called_at: now,
        call_count: (Number(row.obj.call_count) || 0) + 1,
        claimed_by: null,
        claimed_at: null,
        updated_at: now,
      });
      writeRow_(t, row);

      const logs = loadTable_(SHEET_LOGS, LOG_COLUMNS);
      appendRows_(logs, [
        {
          id: Utilities.getUuid(),
          lead_id: row.obj.id,
          company_name: row.obj.company_name,
          created_at: now,
          outcome: p.outcome,
          notes: notes,
          follow_up_at: p.followUpAt || null,
          user: user,
        },
      ]);
      return row.obj;
    });
  },

  // ---------- Follow-upy ----------
  fetchFollowUps: function () {
    const rows = loadTable_(SHEET_LEADS, LEAD_COLUMNS).rows.map(objOf_);
    return rows
      .filter(function (l) {
        return l.status === 'DO_ZASTANOWIENIA';
      })
      .sort(compare_('follow_up_at', true));
  },

  // ---------- Baza ----------
  fetchLeads: function (p) {
    const pageSize = Math.min(Number(p.pageSize) || 50, 100000);
    const page = Number(p.page) || 0;
    const sort = p.sort || {};
    const all = loadTable_(SHEET_LEADS, LEAD_COLUMNS)
      .rows.map(objOf_)
      .filter(function (l) {
        return matches_(l, p);
      })
      .sort(compare_(sort.column || 'created_at', !!sort.asc));
    return { rows: all.slice(page * pageSize, page * pageSize + pageSize), count: all.length };
  },

  fetchCities: function () {
    const set = {};
    loadTable_(SHEET_LEADS, LEAD_COLUMNS).rows.forEach(function (r) {
      if (r.obj.city) set[r.obj.city] = true;
    });
    return Object.keys(set).sort(function (a, b) {
      return a.localeCompare(b, 'pl');
    });
  },

  createLead: function (p, user) {
    return withLock_(function () {
      const t = loadTable_(SHEET_LEADS, LEAD_COLUMNS);
      const lead = newLead_(p, user, 'manual');
      appendRows_(t, [lead]);
      return lead;
    });
  },

  updateLead: function (p) {
    return withLock_(function () {
      const t = loadTable_(SHEET_LEADS, LEAD_COLUMNS);
      const row = findById_(t, p.id);
      const patch = p.patch || {};
      LEAD_COLUMNS.forEach(function (c) {
        const k = c[0];
        if (k === 'id' || k === 'created_at') return;
        if (Object.prototype.hasOwnProperty.call(patch, k)) row.obj[k] = patch[k];
      });
      row.obj.phone_normalized = normalizePhone_(row.obj.phone);
      row.obj.updated_at = new Date().toISOString();
      writeRow_(t, row);
      return row.obj;
    });
  },

  deleteLead: function (p) {
    return withLock_(function () {
      const t = loadTable_(SHEET_LEADS, LEAD_COLUMNS);
      const row = findById_(t, p.id);
      t.sheet.deleteRow(row.rowIndex);
      return true;
    });
  },

  fetchCallLogs: function (p) {
    return loadTable_(SHEET_LOGS, LOG_COLUMNS)
      .rows.map(objOf_)
      .filter(function (g) {
        return g.lead_id === p.id;
      })
      .sort(compare_('created_at', false))
      .slice(0, 50);
  },

  // ---------- Statystyki ----------
  getStats: function () {
    const leads = loadTable_(SHEET_LEADS, LEAD_COLUMNS).rows.map(objOf_);
    const logs = loadTable_(SHEET_LOGS, LOG_COLUMNS).rows.map(objOf_);
    const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');

    const todayLeads = {};
    const todayInterested = {};
    logs.forEach(function (g) {
      if (!g.created_at) return;
      if (Utilities.formatDate(new Date(g.created_at), TZ, 'yyyy-MM-dd') !== today) return;
      todayLeads[g.lead_id] = true;
      if (g.outcome === 'CHCA') todayInterested[g.lead_id] = true;
    });
    const callsToday = Object.keys(todayLeads).length;
    const interestedToday = Object.keys(todayInterested).length;
    const count = function (fn) {
      return leads.filter(fn).length;
    };
    const called = count(function (l) {
      return l.status !== 'NOWY';
    });
    const interested = count(function (l) {
      return l.status === 'CHCA';
    });
    const pct = function (a, b) {
      return b === 0 ? 0 : Math.round((1000 * a) / b) / 10;
    };

    return {
      calls_today: callsToday,
      interested_today: interestedToday,
      success_rate_today: pct(interestedToday, callsToday),
      interested_total: interested,
      thinking_total: count(function (l) {
        return l.status === 'DO_ZASTANOWIENIA';
      }),
      rejected_total: count(function (l) {
        return l.status === 'NIE_CHCA';
      }),
      queue_new: count(function (l) {
        return l.status === 'NOWY';
      }),
      called_total: called,
      success_rate: pct(interested, called),
      followups_due: count(function (l) {
        return l.status === 'DO_ZASTANOWIENIA' && l.follow_up_at && l.follow_up_at <= today;
      }),
    };
  },

  // ---------- Wtyczka Chrome ----------
  checkDuplicates: function (p) {
    const placeIds = p.placeIds || [];
    const phones = (p.phones || []).map(normalizePhone_).filter(Boolean);
    return loadTable_(SHEET_LEADS, LEAD_COLUMNS)
      .rows.map(objOf_)
      .filter(function (l) {
        return (
          (l.maps_place_id && placeIds.indexOf(l.maps_place_id) !== -1) ||
          (l.phone_normalized && phones.indexOf(l.phone_normalized) !== -1)
        );
      })
      .map(function (l) {
        return {
          id: l.id,
          company_name: l.company_name,
          status: l.status,
          maps_place_id: l.maps_place_id,
          phone_normalized: l.phone_normalized,
        };
      });
  },

  saveLeads: function (p, user) {
    return withLock_(function () {
      const t = loadTable_(SHEET_LEADS, LEAD_COLUMNS);
      const placeIds = {};
      const phones = {};
      t.rows.forEach(function (r) {
        if (r.obj.maps_place_id) placeIds[r.obj.maps_place_id] = true;
        if (r.obj.phone_normalized) phones[r.obj.phone_normalized] = true;
      });
      const inserted = [];
      (p.leads || []).forEach(function (raw) {
        const lead = newLead_(raw, user, 'chrome_extension');
        if (lead.maps_place_id && placeIds[lead.maps_place_id]) return;
        if (lead.phone_normalized && phones[lead.phone_normalized]) return;
        if (lead.maps_place_id) placeIds[lead.maps_place_id] = true;
        if (lead.phone_normalized) phones[lead.phone_normalized] = true;
        inserted.push(lead);
      });
      appendRows_(t, inserted);
      return { inserted: inserted };
    });
  },
};

// =====================================================================
// KONTAKTY GOOGLE (wyzwalacz co 5 minut)
// =====================================================================

function synchronizujKontakty() {
  const pending = loadTable_(SHEET_LEADS, LEAD_COLUMNS)
    .rows.map(objOf_)
    .filter(function (l) {
      return (l.status === 'CHCA' || l.status === 'DO_ZASTANOWIENIA') && l.phone && !l.google_contact_synced_at;
    })
    .slice(0, 30);
  if (!pending.length) return;

  const group = getOrCreateContactGroup_();
  const done = {};
  pending.forEach(function (lead) {
    try {
      const contact = People.People.createContact(buildContact_(lead, group));
      done[lead.id] = contact.resourceName;
    } catch (e) {
      console.error('Nie udało się dodać kontaktu „' + lead.company_name + '”: ' + e.message);
    }
  });

  // Zapisujemy znaczniki pod blokadą (świeże dane, żeby nie nadpisać zmian)
  withLock_(function () {
    const t = loadTable_(SHEET_LEADS, LEAD_COLUMNS);
    const now = new Date().toISOString();
    t.rows.forEach(function (r) {
      if (done[r.obj.id]) {
        r.obj.google_contact_id = done[r.obj.id];
        r.obj.google_contact_synced_at = now;
        writeRow_(t, r);
      }
    });
  });
  console.log('Dodano kontaktów: ' + Object.keys(done).length);
}

function buildContact_(lead, groupResource) {
  const note = [
    'Status: ' + (STATUS_LABELS[lead.status] || lead.status),
    lead.category ? 'Branża: ' + lead.category : null,
    lead.notes ? 'Notatka z rozmowy: ' + lead.notes : null,
    lead.maps_url ? 'Mapy Google: ' + lead.maps_url : null,
    'Dodano z CRM: ' + Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm'),
  ]
    .filter(Boolean)
    .join('\n');

  const contact = {
    names: [{ givenName: lead.company_name }],
    organizations: [{ name: lead.company_name, title: lead.category || '' }],
    phoneNumbers: [{ value: formatPhone_(lead.phone), type: 'work' }],
    biographies: [{ value: note, contentType: 'TEXT_PLAIN' }],
    memberships: [{ contactGroupMembership: { contactGroupResourceName: groupResource } }],
  };
  if (lead.city) contact.addresses = [{ city: lead.city, country: 'Polska', type: 'work' }];
  if (lead.maps_url) contact.urls = [{ value: lead.maps_url, type: 'Mapy Google' }];
  return contact;
}

function getOrCreateContactGroup_() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('CONTACT_GROUP_RESOURCE');
  if (cached) return cached;

  let resourceName = null;
  let pageToken;
  do {
    const res = People.ContactGroups.list({ pageSize: 1000, pageToken: pageToken });
    (res.contactGroups || []).forEach(function (g) {
      if (g.name === CONTACT_GROUP_NAME || g.formattedName === CONTACT_GROUP_NAME) resourceName = g.resourceName;
    });
    pageToken = res.nextPageToken;
  } while (pageToken && !resourceName);

  if (!resourceName) {
    resourceName = People.ContactGroups.create({ contactGroup: { name: CONTACT_GROUP_NAME } }).resourceName;
  }
  props.setProperty('CONTACT_GROUP_RESOURCE', resourceName);
  return resourceName;
}

// =====================================================================
// WARSTWA ARKUSZA
// =====================================================================

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    ss = null;
  }
  if (ss) {
    props.setProperty('SPREADSHEET_ID', ss.getId());
    return ss;
  }
  const id = props.getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Nie znaleziono arkusza – uruchom funkcję „instaluj” z poziomu arkusza.');
  return SpreadsheetApp.openById(id);
}

/** Zwraca zakładkę, tworząc ją z nagłówkami, jeśli nie istnieje */
function getSheet_(name, columns) {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const headers = columns.map(function (c) {
      return c[1];
    });
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#f4f4f5');
    sh.setFrozenRows(1);
    // Kolumny tekstowe – Arkusze nie zamienią numerów telefonów na liczby
    columns.forEach(function (c, i) {
      if (TEXT_FIELDS.indexOf(c[0]) !== -1) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    });
    // Pusty arkusz domyślny „Arkusz1” usuwamy, jeśli nic w nim nie ma
    const def = ss.getSheetByName('Arkusz1') || ss.getSheetByName('Sheet1');
    if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  }
  return sh;
}

function loadTable_(name, columns) {
  const sheet = getSheet_(name, columns);
  const last = sheet.getLastRow();
  const values = last > 1 ? sheet.getRange(2, 1, last - 1, columns.length).getValues() : [];
  const rows = [];
  values.forEach(function (v, i) {
    if (v.every(function (x) { return x === ''; })) return; // pusty wiersz
    rows.push({ obj: rowToObj_(v, columns), rowIndex: i + 2 });
  });
  return { sheet: sheet, columns: columns, rows: rows };
}

function objOf_(r) {
  return r.obj;
}

function findById_(table, id) {
  for (let i = 0; i < table.rows.length; i++) if (table.rows[i].obj.id === id) return table.rows[i];
  throw new Error('Nie znaleziono firmy – mogła zostać usunięta. Odśwież stronę.');
}

function writeRow_(table, row) {
  table.sheet.getRange(row.rowIndex, 1, 1, table.columns.length).setValues([objToRow_(row.obj, table.columns)]);
}

function appendRows_(table, objs) {
  if (!objs.length) return;
  const start = table.sheet.getLastRow() + 1;
  const values = objs.map(function (o) {
    return objToRow_(o, table.columns);
  });
  table.sheet.getRange(start, 1, values.length, table.columns.length).setValues(values);
}

function rowToObj_(row, columns) {
  const o = {};
  columns.forEach(function (c, i) {
    const k = c[0];
    let v = row[i];
    if (v === '' || v === null || v === undefined) {
      o[k] = k === 'call_count' ? 0 : null;
      return;
    }
    if (k === 'status' || k === 'outcome') v = labelToCode_(STATUS_LABELS, v);
    else if (k === 'website_status') v = labelToCode_(WEBSITE_LABELS, v);
    else if (DATE_FIELDS.indexOf(k) !== -1) {
      v = v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v).slice(0, 10);
    } else if (TIMESTAMP_FIELDS.indexOf(k) !== -1 || k === 'created_at') {
      v = v instanceof Date ? v.toISOString() : String(v);
    } else if (NUMBER_FIELDS.indexOf(k) !== -1) {
      v = Number(String(v).replace(',', '.'));
      if (isNaN(v)) v = null;
    } else {
      v = String(v);
    }
    o[k] = v;
  });
  return o;
}

function objToRow_(o, columns) {
  return columns.map(function (c) {
    const k = c[0];
    const v = o[k];
    if (v === null || v === undefined || v === '') return '';
    if (k === 'status' || k === 'outcome') return STATUS_LABELS[v] || v;
    if (k === 'website_status') return WEBSITE_LABELS[v] || v;
    if (DATE_FIELDS.indexOf(k) !== -1) return Utilities.parseDate(String(v).slice(0, 10), TZ, 'yyyy-MM-dd');
    if (TIMESTAMP_FIELDS.indexOf(k) !== -1) return new Date(v);
    return v;
  });
}

function labelToCode_(map, value) {
  const s = String(value).trim();
  if (map[s]) return s; // już jest kodem
  for (const code in map) if (map[code].toLowerCase() === s.toLowerCase()) return code;
  return s;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error('Serwer jest zajęty – spróbuj ponownie za chwilę.');
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

// =====================================================================
// POMOCNICZE
// =====================================================================

function newLead_(p, user, source) {
  const now = new Date().toISOString();
  const name = String(p.company_name || '').trim();
  if (!name) throw new Error('Podaj nazwę firmy.');
  const lead = {};
  LEAD_COLUMNS.forEach(function (c) {
    lead[c[0]] = p[c[0]] === undefined || p[c[0]] === '' ? null : p[c[0]];
  });
  return Object.assign(lead, {
    id: Utilities.getUuid(),
    company_name: name,
    status: p.status || 'NOWY',
    website_status: p.website_status || 'BRAK_WWW',
    phone_normalized: normalizePhone_(p.phone),
    call_count: 0,
    created_at: now,
    updated_at: now,
    source: source,
    created_by: user,
    claimed_by: null,
    claimed_at: null,
    google_contact_id: null,
    google_contact_synced_at: null,
  });
}

function matches_(l, f) {
  if (f.status && l.status !== f.status) return false;
  if (f.website && l.website_status !== f.website) return false;
  if (f.city && l.city !== f.city) return false;
  if (f.search) {
    const s = String(f.search).toLowerCase().trim();
    const digits = s.replace(/\D/g, '');
    const hay = [l.company_name, l.city, l.category, l.notes].filter(Boolean).join(' ').toLowerCase();
    const phoneHit = digits.length >= 3 && String(l.phone_normalized || '').indexOf(digits) !== -1;
    if (hay.indexOf(s) === -1 && !phoneHit) return false;
  }
  return true;
}

function compare_(col, asc) {
  return function (a, b) {
    const va = a[col];
    const vb = b[col];
    if ((va === null || va === undefined) && (vb === null || vb === undefined)) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pl');
    return asc ? r : -r;
  };
}

function normalizePhone_(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.indexOf('0048') === 0) d = d.slice(4);
  else if (d.indexOf('48') === 0 && d.length === 11) d = d.slice(2);
  return d || null;
}

function formatPhone_(phone) {
  const d = normalizePhone_(phone) || '';
  if (d.length === 9) return '+48 ' + d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6);
  return phone;
}
