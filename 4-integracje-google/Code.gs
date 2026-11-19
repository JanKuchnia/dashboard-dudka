/**
 * =====================================================================
 *  INTEGRACJE GOOGLE DLA CRM (Google Apps Script)
 *  Plik: 4-integracje-google/Code.gs
 *
 *  1) Kontakty Google – leady „Chcą” i „Do zastanowienia” trafiają
 *     automatycznie do Kontaktów z etykietą „Agencja - Leady”.
 *  2) Google Sheets – arkusz „Leady” to podglądowa kopia bazy na żywo.
 *
 *  Konfiguracja: Ustawienia projektu (⚙) → Właściwości skryptu:
 *    SUPABASE_URL          https://xxxx.supabase.co
 *    SUPABASE_SERVICE_KEY  klucz secret / service_role (NIE publishable!)
 *    WEBHOOK_SECRET        dowolne długie hasło (tylko dla webhooka)
 *
 *  Potem uruchom raz funkcję „instaluj” (wybierz ją u góry i kliknij ▶).
 * =====================================================================
 */

const CONTACT_GROUP_NAME = 'Agencja - Leady';
const SHEET_NAME = 'Leady';

const STATUS_LABELS = {
  NOWY: 'Nowy',
  CHCA: 'Chcą',
  DO_ZASTANOWIENIA: 'Do zastanowienia',
  NIE_CHCA: 'Nie chcą',
  NIE_ODEBRAL: 'Nie odbiera',
};

const WEBSITE_LABELS = {
  BRAK_WWW: 'BRAK WWW',
  TYLKO_FB: 'TYLKO FB',
  TYLKO_IG: 'TYLKO IG',
  TYLKO_BOOKSY: 'TYLKO BOOKSY',
  INNE_SOCIAL: 'INNE SOCIAL',
  MA_WWW: 'MA WWW',
};

// ---------------------------------------------------------------------
// INSTALACJA – uruchom raz
// ---------------------------------------------------------------------
function instaluj() {
  getConfig_(); // sprawdza, czy właściwości są ustawione

  // Usuwamy stare wyzwalacze tego skryptu, żeby nie dublować
  ScriptApp.getProjectTriggers().forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('synchronizujKontakty').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('synchronizujArkusz').timeBased().everyMinutes(15).create();

  synchronizujKontakty();
  synchronizujArkusz();
  console.log('Gotowe! Kontakty: co 5 min, arkusz: co 15 min.');
}

// Menu „CRM” w arkuszu
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CRM')
    .addItem('Odśwież arkusz teraz', 'synchronizujArkusz')
    .addItem('Wyślij nowe kontakty teraz', 'synchronizujKontakty')
    .addSeparator()
    .addItem('Instaluj automatyczną synchronizację', 'instaluj')
    .addToUi();
}

// ---------------------------------------------------------------------
// 1) KONTAKTY GOOGLE
// ---------------------------------------------------------------------
function synchronizujKontakty() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return; // inna synchronizacja właśnie trwa
  try {
    const leads = supabase_('v_google_contacts_queue?select=*&order=updated_at.asc&limit=50');
    if (!leads || !leads.length) return;

    const groupResource = getOrCreateContactGroup_();
    let ok = 0;

    leads.forEach(function (lead) {
      try {
        const contact = People.People.createContact(buildContact_(lead, groupResource));
        try {
          supabase_('leads?id=eq.' + encodeURIComponent(lead.id), {
            method: 'patch',
            body: {
              google_contact_id: contact.resourceName,
              google_contact_synced_at: new Date().toISOString(),
            },
            prefer: 'return=minimal',
          });
        } catch (e) {
          // Lead nie został oznaczony – usuwamy kontakt, inaczej następna synchronizacja doda go drugi raz
          People.People.deleteContact(contact.resourceName);
          throw e;
        }
        ok++;
      } catch (e) {
        console.error('Nie udało się dodać kontaktu „' + lead.company_name + '”: ' + e.message);
      }
    });

    console.log('Dodano kontaktów: ' + ok + ' z ' + leads.length);
  } finally {
    lock.releaseLock();
  }
}

function buildContact_(lead, groupResource) {
  const note = [
    'Status: ' + (STATUS_LABELS[lead.status] || lead.status),
    lead.category ? 'Branża: ' + lead.category : null,
    lead.notes ? 'Notatka z rozmowy: ' + lead.notes : null,
    lead.maps_url ? 'Mapy Google: ' + lead.maps_url : null,
    'Dodano z CRM: ' + Utilities.formatDate(new Date(), 'Europe/Warsaw', 'dd.MM.yyyy HH:mm'),
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

/** Zwraca etykietę „Agencja - Leady” (tworzy ją, jeśli nie istnieje) */
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
    const created = People.ContactGroups.create({ contactGroup: { name: CONTACT_GROUP_NAME } });
    resourceName = created.resourceName;
  }
  props.setProperty('CONTACT_GROUP_RESOURCE', resourceName);
  return resourceName;
}

function formatPhone_(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.indexOf('0048') === 0) d = d.slice(4);
  else if (d.indexOf('48') === 0 && d.length === 11) d = d.slice(2);
  if (d.length === 9) return '+48 ' + d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6);
  return phone;
}

// ---------------------------------------------------------------------
// 2) GOOGLE SHEETS – podgląd bazy na żywo
// ---------------------------------------------------------------------
function synchronizujArkusz() {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const page = supabase_('v_sheets_export?select=*&order=Dodano.desc&limit=' + pageSize + '&offset=' + offset);
    rows.push.apply(rows, page || []);
    if (!page || page.length < pageSize) break;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Ten skrypt musi być podpięty do arkusza (Rozszerzenia → Apps Script w arkuszu).');
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  const headers = rows.length
    ? Object.keys(rows[0])
    : ['ID', 'Dodano', 'Firma', 'Kategoria', 'Miasto', 'Adres', 'Telefon', 'Status', 'Notatka'];

  const values = rows.map(function (r) {
    return headers.map(function (h) {
      let v = r[h];
      if (v === null || v === undefined) return '';
      if (h === 'Status') return STATUS_LABELS[v] || v;
      if (h === 'Status WWW') return WEBSITE_LABELS[v] || v;
      if ((h === 'Dodano' || h === 'Ostatni telefon') && v) return new Date(v);
      return v;
    });
  });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#f4f4f5');
  if (values.length) sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  sheet.setFrozenRows(1);
  sheet
    .getRange(1, 1)
    .setNote('Kopia tylko do podglądu – zmiany wprowadzaj w panelu CRM.\nOstatnia synchronizacja: ' +
      Utilities.formatDate(new Date(), 'Europe/Warsaw', 'dd.MM.yyyy HH:mm'));
  console.log('Arkusz zaktualizowany: ' + values.length + ' wierszy.');
}

// ---------------------------------------------------------------------
// WEBHOOK (opcjonalnie) – natychmiastowe dodanie kontaktu
// Supabase → Database → Webhooks → wywołuje adres aplikacji internetowej
// z parametrem ?secret=TWOJE_HASLO przy każdej zmianie w tabeli leads.
// ---------------------------------------------------------------------
function doPost(e) {
  const cfg = getConfig_();
  const secret = e && e.parameter ? e.parameter.secret : '';
  if (!cfg.secret || secret !== cfg.secret) {
    return ContentService.createTextOutput('Brak dostępu');
  }
  try {
    const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const status = body.record ? body.record.status : null;
    if (!status || status === 'CHCA' || status === 'DO_ZASTANOWIENIA') synchronizujKontakty();
    return ContentService.createTextOutput('OK');
  } catch (err) {
    console.error(err);
    return ContentService.createTextOutput('Błąd: ' + err.message);
  }
}

// ---------------------------------------------------------------------
// Komunikacja z Supabase
// ---------------------------------------------------------------------
function getConfig_() {
  const p = PropertiesService.getScriptProperties();
  const url = p.getProperty('SUPABASE_URL');
  const key = p.getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !key) {
    throw new Error('Uzupełnij SUPABASE_URL i SUPABASE_SERVICE_KEY w Ustawieniach projektu → Właściwości skryptu.');
  }
  return { url: url.replace(/\/+$/, ''), key: key.trim(), secret: p.getProperty('WEBHOOK_SECRET') };
}

function supabase_(path, options) {
  options = options || {};
  const cfg = getConfig_();
  const headers = { apikey: cfg.key };
  // Stare klucze service_role to JWT (eyJ…) i idą też w nagłówku Authorization.
  // Nowe klucze sb_secret_… wystarczą w nagłówku apikey.
  if (cfg.key.indexOf('eyJ') === 0) headers.Authorization = 'Bearer ' + cfg.key;
  if (options.prefer) headers.Prefer = options.prefer;

  const params = {
    method: options.method || 'get',
    headers: headers,
    contentType: 'application/json',
    muteHttpExceptions: true,
  };
  if (options.body) params.payload = JSON.stringify(options.body);

  const res = UrlFetchApp.fetch(cfg.url + '/rest/v1/' + path, params);
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code >= 300) throw new Error('Supabase ' + code + ': ' + text);
  return text ? JSON.parse(text) : null;
}
