/* O F Turnkey: the app's screens. Served from GitHub Pages; all data comes from the Apps Script server
 * through api() (CONFIG.api in config.js). core.js is the same code language file the server uses. */
(function () {
'use strict';

const LC = LedgerCore();
const LOGO_URL = 'logo.png';
// Kept on this device: the sign-in key, who it belongs to, and the last ledger data (so the app opens at once).
const SESSION_KEY = 'oft.session.' + CONFIG.env;
const ME_KEY = 'oft.me.' + CONFIG.env;
const CACHE_KEY = 'oft.cache.' + CONFIG.env;
// Site engineers: their projects, team and tasks (no ledger data), so the app opens without signal.
const SITE_KEY = 'oft.site.' + CONFIG.env;
const MON = LC.MON;
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WDS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TYPE_ORDER = ['P', 'R', 'F', 'MT'];
const TFG = { P: '#7A3414', R: '#2F4019', F: '#5E4500', MT: '#1F3A5F' };
const KINDS = ['project', 'labour', 'vendor', 'mode'];
const KIND_FIELD = { project: 'project', labour: 'who', vendor: 'who', mode: 'mode' };
const PRINT_TYPE_LABELS = { P: 'Paid', R: 'Received', F: 'Follow-ups', MT: 'My tasks' };
// Print choices. Modes apply to P and R only (tasks have no mode). A mode missing from pf.modes counts as
// on, so modes added later are included by default. from/to are used only when period is 'custom'.
const blankPf = () => ({ project: '', who: '', period: 'month', from: '', to: '', types: { P: true, R: true, F: false, MT: false }, modes: {}, noMode: true });
const CHECK = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#FFFFFF" stroke-width="2" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-5"></path></svg>';
const ARROW_L = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M10 3L5 8l5 5"></path></svg>';
const ARROW_R = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 3l5 5-5 5"></path></svg>';
const blankForm = () => ({ code: '', name: '', detail: '', trades: [], tradeTyped: '', location: '' });
function tradeOf(code) { const p = ((S.data && S.data.people) || []).find((x) => x.code === code); return p ? p.trade || '' : ''; }

const PANELS = {
  project: {
    title: 'Projects & clients', desc: 'One code per site. In codes, CL always means this project’s client.',
    nameLabel: 'Site name', namePh: 'NEST', detailLabel: 'Client name', detailPh: 'Client name', codePh: 'SD', location: true,
    detailOf: (r, k) => projectDetailOf(Object.assign({ code: k }, r))
  },
  labour: {
    title: 'Labour', desc: 'Team heads you pay for work. Payments to them count as labour.',
    // Labour and vendors: Trade only (the sheet's old Details column stays, no longer shown or asked for).
    nameLabel: 'Name', namePh: 'Name', detailLabel: '', detailPh: '', codePh: 'ELE', trade: true,
    detailOf: (r, k) => tradeOf(k) || 'Labour · no trade yet'
  },
  vendor: {
    title: 'Vendors', desc: 'Shops and suppliers. Payments to them count as material.',
    nameLabel: 'Name', namePh: 'Vendor name', detailLabel: '', detailPh: '', codePh: 'TIL', trade: true,
    detailOf: (r, k) => tradeOf(k) || 'Material · no trade yet'
  },
  mode: {
    title: 'Payment modes', desc: 'Used at the end of P and R codes.',
    nameLabel: 'Label', namePh: 'UPI', detailLabel: '', detailPh: '', codePh: 'U',
    detailOf: () => 'Mode'
  }
};

const S = {
  data: null, dir: null, entries: [], loadedAt: '', lastLoad: 0,
  sel: '', y: 0, m: 0, tab: 'ledger', kind: '', project: null,
  code: '', parsed: null, warns: [], armed: '', saving: false, saveErr: '', editId: null,
  guide: false, print: false, showVoided: false, confirmVoid: null,
  forms: { project: blankForm(), labour: blankForm(), vendor: blankForm(), mode: blankForm() },
  errs: { project: '', labour: '', vendor: '', mode: '' },
  showArch: {}, dirEdit: null, confirmDel: null,
  editDate: '',
  pf: blankPf(),
  paper: 'A4', orient: 'portrait',
  pending: 0, snackMsg: null,
  projTab: '', projSec: 'overview', projEdit: null, memberEdit: null, memberAdd: { email: '', name: '', code: '', projects: [], err: '' },
  me: null, sheetUrl: '', devices: null, devicesErr: '', timing: null, readyMs: 0, started: false
};

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function todayIso() { return LC.iso(new Date()); }
function addDays(s, n) { const d = LC.fromIso(s); d.setDate(d.getDate() + n); return LC.iso(d); }
function niceY(s) { const d = LC.fromIso(s); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); }
function isTask(e) { return e.type === 'F' || e.type === 'MT'; }
function sitsOn(e) { return isTask(e) ? e.due : e.date; }
// Active entries. A follow-up task (after_task) stays out of sight until the task before it is ticked.
function live() { return S.entries.filter((e) => e.status !== 'void' && !(e.after_task && !S.doneIds[e.after_task])); }
// Team code of the signed-in person (the @ in tasks).
function myCode() { const u = ((S.data && S.data.users) || []).find((x) => x.email === (S.data && S.data.user)); return u ? u.code || '' : ''; }
// Whose task: the person it was given to (@), else whoever added it.
function isMine(e) { return e.assignee ? !!myCode() && e.assignee === myCode() : e.added_by === (S.data && S.data.user); }
function forTag(e) { return e.assignee ? ' · <span class="for-tag">for ' + esc(LC.teamName(S.dir, e.assignee)) + '</span>' : ''; }
function inFilter(e) { return !S.project || e.project === S.project; }
function norm(s) { return String(s || '').trim().split(/\s+/).filter(Boolean).join(' '); }
function byDue(a, b) { return LC.byDue(a, b); }
function findEntry(id) { return S.entries.find((e) => e.id === id); }
function editing() { const e = S.editId ? findEntry(S.editId) : null; return e && e.status !== 'void' ? e : null; }
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
function cleanErr(m) { return String(m || 'Something went wrong.').replace(/^(Exception|Error|ScriptError):\s*/i, ''); }
function chev(open) {
  return '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" style="transform:rotate(' + (open ? 90 : 0) + 'deg)"><path d="M4 2.5L7.5 6 4 9.5"></path></svg>';
}
function badge(t, sm) { return '<span class="badge' + (sm ? ' sm' : '') + ' t-' + t + '">' + t + '</span>'; }
function projName(c) { return LC.projName(S.dir, c); }
function shortLine(e) {
  const who = LC.whoName(S.dir, e.who, e.project);
  if (e.type === 'P') return 'Paid ' + who + ' ' + LC.inr(e.amount);
  if (e.type === 'R') return 'Received ' + LC.inr(e.amount) + ' from ' + who;
  return LC.taskTitle(S.dir, e);
}
function isOwner() { return !!S.data && S.data.role === 'owner'; }
// Owners and contributors can add entries and tick tasks; viewers only see and print.
function canWrite() { return !!S.data && (S.data.role === 'owner' || S.data.role === 'contributor'); }
function userName(email) { const u = ((S.data && S.data.users) || []).find((x) => x.email === email); return u && u.name ? u.name : email; }
function initials(email) {
  const w = String(userName(email) || '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((w[0] || '').charAt(0) + (w[1] || '').charAt(0)).toUpperCase() || String(email).slice(0, 2).toUpperCase();
}
function byTag(e) {
  if (!e.added_by) return '';
  return ' · <span class="by" title="Added by ' + esc(userName(e.added_by)) + '">' + esc(initials(e.added_by)) + '</span>';
}
// Owners can open any entry for editing: a visible Edit button, and the sentence itself.
function editBtn(e) { return isOwner() ? '<button type="button" class="btn-sm edit-btn" data-act="edit" data-id="' + esc(e.id) + '" aria-label="Edit: ' + esc(shortLine(e)) + '">Edit</button>' : ''; }
function mainOpen(e) { return isOwner() ? '<button type="button" class="item-main" data-act="edit" data-id="' + esc(e.id) + '">' : '<div class="item-main">'; }
function mainClose() { return isOwner() ? '</button>' : '</div>'; }
function usage(kind, code) { const f = KIND_FIELD[kind]; return S.entries.filter((e) => e[f] === code).length; }
function logoHtml() {
  if (LOGO_URL) return '<div class="brand"><img class="brand-logo" src="' + esc(LOGO_URL) + '" alt="" width="40" height="40"><span class="brand-name">O F Turnkey</span></div>';
  return '<div class="logo" role="img" aria-label="O F Turnkey logo placeholder"><span class="logo-name">O F TURNKEY</span><span class="logo-tag">Logo</span></div>';
}
/* ---------- paper size & orientation ---------- */
const PAPERS = ['A4', 'A3'];
const ORIENTS = ['portrait', 'landscape'];
function applyPageSize() {
  let el = $('pageSizeRule');
  if (!el) { el = document.createElement('style'); el.id = 'pageSizeRule'; document.head.appendChild(el); }
  el.textContent = '@page { size: ' + S.paper + ' ' + S.orient + '; }';
}

/* ---------- server ---------- */
function setData(d) {
  S.data = d;
  S.dir = LC.buildDir(d);
  S.entries = d.entries || [];
  S.doneIds = {};
  S.entries.forEach((e) => { if (e.done) S.doneIds[e.id] = true; });
  S.loadedAt = d.loadedAt || '';
  S.lastLoad = Date.now();
  if (S.project && !S.dir.projects[S.project]) S.project = null;
  if (S.editId && !editing()) S.editId = null;
}

function store(key, val) { try { if (val == null) localStorage.removeItem(key); else localStorage.setItem(key, val); } catch (_) { /* storage blocked */ } }
function stored(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
function sessionToken() { return stored(SESSION_KEY) || ''; }
const secs = (ms) => (ms / 1000).toFixed(1) + ' s';

/* Double clicks. A button that sends something to the server turns lighter, says "Saving…" (or Sending…, Asking…)
 * and ignores clicks until the server has answered. Works for every button: whatever server request a click starts
 * is counted against that button (api() below). The server also ignores a repeat within a few seconds. */
const INFLIGHT = {};
let CURRENT_KEY = null;
const BUSY_LABEL = { 'qc-photo-send': 'Asking…', 'qc-send': 'Sending…', 'er-send': 'Sending…', 'ask-send': 'Sending…', 'ph-comment': 'Sending…',
  'ph-task': 'Sending…', 'ph-send': 'Sending…', 'brief-preview': 'Loading…', refresh: 'Updating…', 'pcode-save': 'Saving…', save: 'Saving…' };
function actKey(el) { const d = el.dataset; return d.act + ':' + (d.id || d.code || d.email || d.kind || d.v || ''); }
// Moving around (tabs, sections, opening a query or a task) is never "busy", even when it loads something in the
// background: the bottom bar and tabs must always answer. Only saves lock their button.
const NAV_ACTS = { 'eng-tab': 1, tab: 1, 'proj-tab': 1, 'proj-sec': 1, 'q-view': 1, 'q-open': 1, 'eq-open': 1, 'eq-back': 1, 'eq-register': 1, 'eng-task-open': 1,
  'task-src': 1, 'needs-query': 1, 'today-query': 1, 'today-mine': 1, 'ph-open': 1, 'ph-open-site': 1, lightbox: 1, 'lightbox-close': 1 };
// Background reads (and "opened") never make a button look busy.
const QUIET_CALLS = { getData: 1, getSite: 1, listPhotos: 1, photoThumbs: 1, photoFull: 1, listQueries: 1, devices: 1, markSeen: 1 };
function withBusy(el, fn) {
  if (NAV_ACTS[el.dataset.act]) { fn(); return; }
  const key = actKey(el);
  if (INFLIGHT[key]) return; // still saving: a second click does nothing
  INFLIGHT[key] = { label: BUSY_LABEL[el.dataset.act] || 'Saving…', n: 0 };
  CURRENT_KEY = key;
  try { fn(); } finally {
    CURRENT_KEY = null;
    if (!INFLIGHT[key].n) delete INFLIGHT[key]; else decorateBusy();
  }
}
// Puts the busy look on buttons whose save is still running (also after the screen redraws), and takes it off
// again when the save is done. Buttons that are never redrawn (Refresh and Print in the header) need the latter.
function decorateBusy() {
  document.querySelectorAll('.busy').forEach((el) => {
    if (INFLIGHT[actKey(el)]) return;
    el.classList.remove('busy');
    el.disabled = false;
    if (el.dataset.busyText !== undefined) { el.textContent = el.dataset.busyText; delete el.dataset.busyText; }
  });
  if (!Object.keys(INFLIGHT).length) return;
  document.querySelectorAll('[data-act]').forEach((el) => {
    const b = INFLIGHT[actKey(el)];
    if (!b || !b.n || el.classList.contains('busy')) return;
    el.disabled = true;
    el.classList.add('busy');
    if (el.tagName === 'BUTTON' && b.label) { el.dataset.busyText = el.textContent; el.textContent = b.label; }
  });
}

// No browser autofill on any of the app's text boxes. Chrome ignores autocomplete="off" when it guesses a box is
// part of an address (it offered a PIN code in the project bar), but leaves alone a box whose autocomplete value it
// doesn't recognise. Every box gets that value as soon as it appears, on every screen.
const NO_FILL = 'oft-no-fill';
function noAutofill(root) {
  if (!root.querySelectorAll) return;
  const boxes = Array.from(root.querySelectorAll('input, textarea'));
  if (root.matches('input, textarea')) boxes.push(root);
  boxes.forEach((el) => {
    const text = el.tagName === 'TEXTAREA' || /^(text|search|email|tel|url|number)?$/i.test(el.getAttribute('type') || '');
    if (text && el.getAttribute('autocomplete') !== NO_FILL) el.setAttribute('autocomplete', NO_FILL);
  });
}
noAutofill(document.body);
// Photo buttons: each one handles its own photos. The camera or gallery can be open for a while, and if the screen
// redraws meanwhile (something arrived in the background) the button is replaced; a photo coming back to the old
// button must still be kept, not lost.
function wirePhotoPicks(root) {
  if (!root.querySelectorAll) return;
  const picks = Array.from(root.querySelectorAll('input[type=file][data-ph-pick], input[type=file][data-q-pick]'));
  if (root.matches('input[type=file][data-ph-pick], input[type=file][data-q-pick]')) picks.push(root);
  picks.forEach((el) => {
    if (el.oftWired) return;
    el.oftWired = true;
    el.addEventListener('change', () => {
      const project = S.engProject;
      if (el.dataset.phPick) addDraftFiles(el.files, project); else addQueryDraftFiles(el.files, el.dataset.qPick, project);
      el.value = '';
    });
  });
}
wirePhotoPicks(document.body);
new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => { noAutofill(n); wirePhotoPicks(n); }))).observe(document.body, { childList: true, subtree: true });

// Things arriving in the background (devices, queries, photos, the outbox) redraw the screen, but never while
// someone is typing: that would move the cursor or swap a button under a finger. It redraws when they leave the box.
// "Typing" means keys pressed in a text box within the last few seconds: a cursor merely left in a box (the code
// bar after saving, say) must not hold back updates for good.
const TYPING_PAUSE_MS = 3000;
let lastTyped = 0;
document.addEventListener('input', () => { lastTyped = Date.now(); }, true);
function isTyping() {
  const a = document.activeElement;
  const textBox = !!a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(checkbox|radio|file|button|submit|date)$/i.test(a.type)));
  return textBox && Date.now() - lastTyped < TYPING_PAUSE_MS;
}
let redrawWaiting = false;
function bgRedraw() {
  if (isTyping()) {
    if (!redrawWaiting) { redrawWaiting = true; setTimeout(() => { redrawWaiting = false; bgRedraw(); }, TYPING_PAUSE_MS + 100); }
    return;
  }
  redrawWaiting = false;
  if (S.engineer) renderEng(); else if (S.started) renderAll();
}
document.addEventListener('focusout', () => { if (redrawWaiting) setTimeout(() => { if (!isTyping()) { redrawWaiting = false; bgRedraw(); } }, 0); });

// One request to the server: { a, s, args } goes in as plain text (no cookies, so the phone's Google
// accounts play no part); { ok, result } or { ok: false, error, signin } comes back.
function api(action, args) {
  const busyKey = QUIET_CALLS[action] ? null : CURRENT_KEY;
  if (busyKey && INFLIGHT[busyKey]) INFLIGHT[busyKey].n++;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  const t0 = performance.now();
  return fetch(CONFIG.api, {
    method: 'POST', body: JSON.stringify({ a: action, s: sessionToken(), args: args || [] }),
    credentials: 'omit', redirect: 'follow', cache: 'no-store', signal: ctrl.signal
  }).then((r) => {
    if (!r.ok) throw new Error('The server answered ' + r.status + '. Please try again.');
    return r.json().catch(() => { throw new Error('The server sent something unexpected. Please try again.'); });
  }, (err) => {
    const e = new Error(err && err.name === 'AbortError' ? 'No answer from the server after 90 seconds. Check your signal and try again.'
      : navigator.onLine === false ? 'No signal. Nothing was sent.' : 'Couldn’t reach the server. Check your connection and try again.');
    e.network = true; // the outbox keeps the item and tries again later
    throw e;
  }).then((res) => {
    S.timing = { action: action, server: res.ms, total: Math.round(performance.now() - t0) };
    renderEnvStrip();
    if (!res.ok) { const e = new Error(res.error || 'Something went wrong.'); e.signin = !!res.signin; throw e; }
    if (res.result && res.result.duplicate) { const e = new Error('That was already saved.'); e.dup = true; throw e; }
    return res.result;
  }).finally(() => {
    clearTimeout(timer);
    if (busyKey && INFLIGHT[busyKey] && --INFLIGHT[busyKey].n <= 0) { delete INFLIGHT[busyKey]; setTimeout(decorateBusy, 0); }
  });
}

// Ledger actions: show "Syncing…", then fresh data (every write answers with it) or the error.
function call(fn, args, onOk, onFail) {
  S.pending++;
  renderStatus();
  api(fn, args).then((res) => {
    S.pending--;
    if (res && res.data) { setData(res.data); saveCache(); }
    if (onOk) onOk(res);
    renderAll();
  }, (err) => {
    S.pending--;
    if (err.signin) { signedOut(err.message); return; }
    if (err.dup) { renderAll(); return; } // a repeat of a save that already went through
    const msg = cleanErr(err.message);
    if (onFail) onFail(msg); else snack(msg, { error: true });
    renderAll();
  });
}
// Brings everything on screen up to date: ledger, queries, and the open project's photos.
function refresh(quiet) {
  call('getData', [], quiet ? null : () => snack('Up to date.'));
  if (S.queries) loadQueries();
  if (S.photosFor) loadPhotos(S.photosFor);
}

function saveCache() {
  if (S.data && S.me) store(CACHE_KEY, JSON.stringify({ email: S.me.email, sheetUrl: S.sheetUrl, data: S.data }));
}
function loadCache() {
  try { const c = JSON.parse(stored(CACHE_KEY) || 'null'); return c && c.data ? c : null; } catch (_) { return null; }
}

/* ---------- alerts on this device (live app only: CONFIG.firebase) ---------- */
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Couldn’t load ' + src));
    document.head.appendChild(s);
  });
}
function enableAlerts() {
  const cfg = CONFIG.firebase, tell = (t, err) => (S.engineer ? engSnack(t, err) : snack(t, { error: err }));
  if (!cfg) { tell('The test app never sends alerts.', true); return; }
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) { tell('This browser can’t receive alerts. Use Chrome.', true); return; }
  tell('Asking for permission…');
  Notification.requestPermission().then((perm) => {
    if (perm !== 'granted') throw new Error('Notifications are blocked for O F Turnkey. Allow them in the browser or app settings, then try again.');
    return navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready);
  }).then((reg) => loadScript(FIREBASE_SDK + 'firebase-app-compat.js').then(() => loadScript(FIREBASE_SDK + 'firebase-messaging-compat.js')).then(() => {
    if (!firebase.apps.length) firebase.initializeApp(cfg.app);
    return firebase.messaging().getToken({ vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
  })).then((token) => {
    if (!token) throw new Error('Couldn’t get an alert address for this device. Try again.');
    return api('registerDevice', [token, deviceName()]);
  }).then((res) => {
    if (res.data) { setData(res.data); saveCache(); renderAll(); }
    tell(res.notice || 'Alerts are on for this device.');
  }, (err) => { if (err.signin) signedOut(err.message); else tell(cleanErr(err.message), true); });
}

/* ---------- opening, sign-in and signed-in devices ---------- */
// The screen before the ledger: opening, sign in, no access, site engineer.
function showGate(title, text, opts) {
  opts = opts || {};
  $('appScreen').hidden = true;
  $('gate').hidden = false;
  $('gateTitle').textContent = title;
  const t = $('gateText');
  t.textContent = text;
  t.className = 'gate-text' + (opts.error ? ' err' : '');
  $('gateButton').innerHTML = opts.button || '';
  $('gateExtra').innerHTML = opts.extra || '';
}
const TRY_AGAIN = '<button type="button" class="btn-big" data-act="reload">Try again</button>';

let gisLoading = null;
function loadGis() {
  if (window.google && google.accounts && google.accounts.id) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { gisLoading = null; reject(new Error('Couldn’t reach Google to sign in. Check your connection, then try again.')); };
      document.head.appendChild(s);
    });
  }
  return gisLoading;
}
// chooseAccount: show Google's account list instead of signing straight back in to the last account.
function showSignIn(message, opts) {
  opts = opts || {};
  showGate('O F Turnkey', message || 'Sign in with the Google account you use for O F Turnkey.', { error: opts.error });
  loadGis().then(() => {
    google.accounts.id.initialize({
      client_id: CONFIG.clientId, callback: (res) => signInWith(res.credential),
      auto_select: !opts.chooseAccount, cancel_on_tap_outside: false, context: 'signin', itp_support: true,
      use_fedcm_for_prompt: true, use_fedcm_for_button: true
    });
    if (opts.chooseAccount) google.accounts.id.disableAutoSelect();
    google.accounts.id.renderButton($('gateButton'), {
      type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', logo_alignment: 'left', width: 280
    });
    if (!opts.chooseAccount) google.accounts.id.prompt();
  }, (err) => showGate('O F Turnkey', err.message, { error: true, button: TRY_AGAIN }));
}
function signInWith(credential) {
  showGate('O F Turnkey', 'Signing you in…');
  api('signIn', [credential, deviceName()]).then((res) => {
    if (res.noAccess) { showNoAccess(res.me.email); return; }
    store(SESSION_KEY, res.session);
    store(ME_KEY, JSON.stringify(res.me));
    S.me = res.me;
    // Site engineers see their own screen (with its bottom bar) at once; it fills in when the data arrives.
    if (res.me.role === 'site_engineer') { showEngineer(res.me, null); boot(true); } else boot(false);
  }, (err) => showSignIn(cleanErr(err.message), { error: true, chooseAccount: true }));
}
function showNoAccess(email) {
  try { google.accounts.id.disableAutoSelect(); } catch (_) { /* Google sign-in not loaded */ }
  showGate('No access', 'This Google account isn’t on O F Turnkey’s list of users. Ask Shruthi to add it.', {
    extra: '<span>You signed in as <b>' + esc(email) + '</b>.</span>',
    button: '<button type="button" class="btn-big" data-act="choose-account">Use another account</button>'
  });
}
/* ---------- site engineer screens (phone first; no ledger data ever reaches them) ---------- */
function engClick(act, el) {
  if (photoClick(act, el) || queryClick(act, el)) return;
  if (act === 'eng-tab') {
    S.engTab = el.dataset.tab; S.engQuery = ''; S.engRegister = false; window.scrollTo(0, 0);
    if ((S.engTab === 'queries' || S.engTab === 'today') && S.queries) loadQueries();
    if (S.engTab === 'photos' && S.photosFor) loadPhotos(S.photosFor);
    renderEng();
  }
  else if (act === 'eng-done') engTick(el.dataset.id, el.checked);
  else if (act === 'eng-undo') { $('engSnack').hidden = true; engTick(el.dataset.id, false); }
  else if (act === 'eng-task-open') {
    const x = ((S.site && S.site.tasks) || []).find((t) => t.id === el.dataset.id);
    if (!x) return;
    markSeenTask(x.id);
    if (x.source && taskSources()[x.source]) openTaskSource(x.source); else renderEng();
  }
  else if (act === 'done-send') sendDonePhotos(el.dataset.id);
  else if (act === 'done-skip') { skipDoneOffer(el.dataset.id); renderEng(); }
  else if (act === 'eng-add') engAddTask();
}
// Ticks (and unticks) are instant on screen and saved through the outbox. "Ticked off" has Undo for a few
// seconds; unticking puts the task back exactly as it was.
S.ticks = {};
function engTick(id, done) {
  S.ticks[id] = { done: done, at: Date.now() };
  renderEng();
  outboxAdd('setDone', [id, done], 'Tick').then(renderEng);
  if (done) engSnack('Ticked off.', false, '<button type="button" class="undo" data-act="eng-undo" data-id="' + esc(id) + '">Undo</button>', 5000);
  else engSnack('Back on your list.');
}
function showEngineer(me, site) {
  S.me = me;
  S.site = site;
  S.engineer = true;
  $('gate').hidden = true;
  $('appScreen').hidden = true;
  $('engScreen').hidden = false;
  if (!S.engTab) {
    const qs = new URLSearchParams(location.search);
    S.engTab = ['queries', 'photos', 'schedule'].indexOf(qs.get('tab')) >= 0 ? qs.get('tab') : 'today';
    if (qs.get('q')) S.engQuery = qs.get('q');
  }
  renderEng();
  renderEnvStrip();
}
// Engineer screens use the site's name (E-City) everywhere: the picker, task lines, headings.
function engProjName(code) { const p = ((S.site && S.site.projects) || []).find((x) => x.code === code); return p && p.name ? p.name : code; }
function engMe() { return ((S.site && S.site.users) || []).find((u) => u.email === S.me.email) || { projects: [], code: '' }; }
function engProjects() {
  // His own projects first, then the rest (engineers can see every project, to help each other).
  const mine = engMe().projects || [];
  return ((S.site && S.site.projects) || []).filter((p) => p.stage !== 'archive')
    .sort((a, b) => (mine.indexOf(b.code) >= 0) - (mine.indexOf(a.code) >= 0) || (a.code < b.code ? -1 : 1));
}
function engCall(fn, args, onOk, onFail) {
  api(fn, args).then((res) => {
    if (res && res.site) S.site = res.site;
    if (onOk) onOk(res);
    renderEng();
  }, (err) => {
    if (err.signin) { signedOut(err.message); return; }
    const msg = cleanErr(err.message);
    if (onFail) onFail(msg); else engSnack(msg, true);
    renderEng();
  });
}
let engSnackTimer = null;
// buttonHtml: e.g. Undo; ms: how long it stays.
function engSnack(text, error, buttonHtml, ms) {
  const el = $('engSnack');
  el.hidden = false;
  el.className = 'snack' + (error ? ' error' : '');
  el.innerHTML = '<span class="snack-text">' + esc(text) + '</span>' + (buttonHtml || '');
  clearTimeout(engSnackTimer);
  engSnackTimer = setTimeout(() => { el.hidden = true; }, ms || (error ? 8000 : 4000));
}
const ENG_TABS = [['today', 'Today'], ['queries', 'Queries'], ['photos', 'Photos'], ['schedule', 'Schedule']];
function renderEng() {
  // Keep the cursor where it was: the screen redraws when things arrive in the background.
  const a = document.activeElement, fid = a && a.id;
  let s0 = null, s1 = null;
  try { if (fid && typeof a.selectionStart === 'number') { s0 = a.selectionStart; s1 = a.selectionEnd; } } catch (_) { /* not a text field */ }
  renderEngInner();
  decorateBusy();
  if (fid) {
    const el = $(fid);
    if (el && document.activeElement !== el) { el.focus({ preventScroll: true }); try { if (s0 !== null) el.setSelectionRange(s0, s1); } catch (_) { /* ignore */ } }
  }
}
function renderEngInner() {
  // The bottom bar first, and on its own: nothing below can stop it showing.
  const nav = $('engNav');
  nav.hidden = false;
  nav.innerHTML = ENG_TABS.map((t) => '<button type="button" class="eng-tab' + (S.engTab === t[0] ? ' on' : '') + '" data-act="eng-tab" data-tab="' + t[0] +
    '" aria-pressed="' + (S.engTab === t[0]) + '">' + esc(t[1]) + '</button>').join('');
  const main = $('engMain');
  try {
    const projs = engProjects();
    if (!S.engProject || !projs.some((p) => p.code === S.engProject)) S.engProject = projs.length ? projs[0].code : '';
    $('engProject').innerHTML = projs.length ? projs.map((p) => '<option value="' + esc(p.code) + '"' + (p.code === S.engProject ? ' selected' : '') + '>' + esc(engProjName(p.code)) + '</option>').join('') : '<option>Loading…</option>';
    if (!S.site) main.innerHTML = '<p class="empty">Opening…</p>';
    else if (S.engTab === 'today') main.innerHTML = engTodayHtml();
    else if (S.engTab === 'photos') main.innerHTML = engPhotosHtml();
    else if (S.engTab === 'queries') main.innerHTML = engQueriesHtml();
    else main.innerHTML = '<section class="card"><h2 class="eng-h2">' + esc(ENG_TABS.find((t) => t[0] === S.engTab)[1]) + '</h2>' +
      '<p class="empty">This comes in the next test version.</p></section>';
  } catch (err) {
    console.error(err);
    main.innerHTML = '<section class="card eng-card eng-pad"><p class="err" role="alert">Something on this screen didn’t load: ' + esc(cleanErr(err && err.message)) +
      '</p><button type="button" class="btn-outline" data-act="reload">Open again</button></section>';
  }
}
function engTodayHtml() {
  const now = new Date(), t = todayIso();
  const greet = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const name = (engMe().name || S.me.email).split(/\s+/)[0];
  // Tasks from the server, plus ones added on this phone that are still sending; ticks still sending show at once.
  const tasks = ((S.site && S.site.tasks) || []).map((x) => Object.assign({}, x));
  waiting('addEntry').forEach((w) => { if (w.meta && !tasks.some((x) => x.id === w.meta.id)) tasks.push({ id: w.meta.id, note: w.meta.note, project: w.meta.project, due: w.meta.due, done: false, added_by: S.me.email, pending: true }); });
  waiting('setDone').forEach((w) => { const x = tasks.find((y) => y.id === w.args[0]); if (x) { x.done = !!w.args[1]; x.pending = true; } });
  // A tap shows at once, even before the phone's outbox has it on its list (no flicker back).
  Object.keys(S.ticks).forEach((id) => {
    const x = tasks.find((y) => y.id === id), k = S.ticks[id];
    if (!x || Date.now() - k.at > 120000) { delete S.ticks[id]; return; }
    if (x.done === k.done && !x.pending) delete S.ticks[id]; else x.done = k.done;
  });
  tasks.sort(LC.byDue);
  const open = tasks.filter((x) => !x.done), done = tasks.filter((x) => x.done).slice(-5).reverse();
  const projName = engProjName;
  const who = (email) => { const u = ((S.site && S.site.users) || []).find((x) => x.email === email); return u ? u.name : email; };
  // Only the box ticks. The text opens where the task came from (a query or a photo); a new task shows "New" until then.
  const row = (x) => {
    const fresh = isNewTask(x, engMe().code);
    return '<div class="eng-task' + (x.done ? ' done' : '') + (fresh ? ' new' : '') + '">' +
      '<input type="checkbox" data-act="eng-done" data-id="' + esc(x.id) + '"' + (x.done ? ' checked' : '') + ' aria-label="Done: ' + esc(x.note) + '">' +
      '<div class="eng-task-text"><button type="button" class="eng-task-open" data-act="eng-task-open" data-id="' + esc(x.id) + '">' +
      (fresh ? '<span class="new-dot" aria-hidden="true"></span><b class="new-tag">New</b> ' : '') + '<span class="eng-task-note">' + esc(LC.cap(x.note)) + '</span></button>' +
      '<span class="eng-meta">' + esc(projName(x.project)) + ' · ' + dueChip(x) +
      (x.added_by && x.added_by !== S.me.email ? ' · from ' + esc(who(x.added_by)) : '') + (x.pending ? ' · <span class="sending">Sending…</span>' : '') + '</span>' +
      taskSourceHtml(x.source, x.id) + donePhotoHtml(x) + '</div></div>';
  };
  const a = S.engAdd || (S.engAdd = { note: '', due: '', err: '' });
  return '<div class="eng-greet"><div class="muted">' + esc(niceDay(t)) + '</div><h1>' + esc(greet + ', ' + name) + '</h1></div>' +
    engNeedsHtml() +
    '<button type="button" class="eng-big" data-act="eng-tab" data-tab="queries">Ask a question</button>' +
    '<section class="card eng-card"><h2 class="eng-h2">My tasks <span class="muted">· ' + open.length + '</span></h2>' +
    (open.length ? open.map(row).join('') : '<p class="empty eng-pad">Nothing on your list.</p>') +
    (done.length ? '<div class="eng-done-h">Done recently</div>' + done.map(row).join('') : '') + '</section>' +
    engWaitingHtml() +
    '<section class="card eng-card"><h2 class="eng-h2">Add a task for yourself</h2>' +
    '<div class="eng-form"><label>What to do<input id="engAddNote" data-ea="note" value="' + esc(a.note) + '" autocomplete="off" placeholder="Check cove light level at reception"></label>' +
    '<label>Due (optional)<input id="engAddDue" data-ea="due" type="date" value="' + esc(a.due) + '"></label>' +
    '<button type="button" class="btn-save" data-act="eng-add">Add to my tasks · ' + esc(engProjName(S.engProject)) + '</button>' +
    (a.err ? '<p class="err" role="alert">' + esc(a.err) + '</p>' : '') + '</div></section>' +
    '<p class="foot eng-foot">Signed in as ' + esc(S.me.email) + '. <button type="button" class="link-btn" data-act="sign-out-here">Sign out of this device</button></p>';
}
// Engineer home, above My tasks: clearer photos Shruthi or Savan asked for (take it right here; gone once sent),
// and their replies to his questions until he opens them.
function engNeedsHtml() {
  if (!S.queries) { if (!S.queriesLoading) { S.queriesLoading = true; loadQueries(() => { S.queriesLoading = false; }); } return ''; }
  const me = S.me.email, mine = S.queries.queries.filter((q) => q.askedBy === me);
  const sending = (qid) => waiting('replyQuery').some((w) => w.args[0] === qid && (w.args[3] || []).length);
  const photoAsks = mine.filter((q) => q.status === 'waiting_photo' && !sending(q.id));
  // An answer that gave him a task shows as that task in My tasks ("New"), not here as well.
  const replies = mine.filter(isNewAnswer);
  if (!photoAsks.length && !replies.length) return '';
  const msgs = (q) => S.queries.messages.filter((m) => m.queryId === q.id);
  const asked = (q) => { const m = msgs(q).filter((x) => x.kind === 'photo_request').pop(); return m ? LC.cap(m.text.replace(/^Please send a clearer photo[:.]?\s*/i, '').trim()) : ''; };
  const photoItem = (q) => {
    const drafts = S.drafts.filter((d) => d.purpose === 'reply:' + q.id), r = S.engReply && S.engReply.qid === q.id ? S.engReply : {};
    return '<div class="eng-need"><button type="button" class="eng-need-main" data-act="eq-open" data-id="' + esc(q.id) + '"><b>Send a clearer photo: ' + esc(shortText(q.text)) + '</b>' +
      '<span class="muted small">' + esc([asked(q), engProjName(q.project)].filter(Boolean).join(' · ')) + '</span></button>' +
      (drafts.length ? '<div class="q-photos">' + drafts.map((d) => '<span class="q-photo"><img src="data:image/jpeg;base64,' + d.thumb + '" alt=""><button type="button" class="q-x" data-act="draft-del" data-id="' + esc(d.id) + '" aria-label="Remove photo">×</button></span>').join('') + '</div>' : '') +
      photoPickHtml('reply:' + q.id) +
      (drafts.length ? '<button type="button" class="eng-big" data-act="need-send" data-id="' + esc(q.id) + '"' + (r.sending ? ' disabled' : '') + '>' +
        (r.sending ? 'Sending…' : 'Send ' + plural(drafts.length, 'photo', 'photos')) + '</button>' : '') + '</div>';
  };
  const replyItem = (q) => {
    const by = nameOfEmail(q.last.by), m = msgs(q).filter((x) => x.kind === 'reply' && x.by !== me && x.text).pop();
    const head = q.last.what === 'closed' ? (q.outcome === 'change' ? 'Change approved' + (q.changeNo ? ' ' + q.changeNo : '') : 'Answered') + ' by ' + by : 'Reply from ' + by;
    return '<button type="button" class="eng-need eng-need-main" data-act="eq-open" data-id="' + esc(q.id) + '"><b><span class="new-dot" aria-label="New"></span>' + esc(head + (m ? ': ' + m.text.slice(0, 120) : '')) + '</b>' +
      '<span class="muted small">' + esc(shortText(q.text) + ' · ' + engProjName(q.project) + ' · ' + ageText(q.last.at) + ' ago') + '</span></button>';
  };
  return '<section class="card eng-card eng-needs"><h2 class="eng-h2">Needs you <span class="muted">· ' + (photoAsks.length + replies.length) + '</span></h2>' +
    photoAsks.map(photoItem).join('') + replies.map(replyItem).join('') + '</section>';
}
// A reply or answer to his question he hasn't opened, that didn't come with a task for him.
function isNewAnswer(q) {
  const code = engMe().code;
  return q.status !== 'waiting_photo' && isNewQ(q) && q.last && (q.last.what === 'reply' || q.last.what === 'closed') &&
    !queryTasks(q).some((t) => t.assignee && t.assignee === code);
}
// Engineer home, under My tasks: his open questions, not tickable: on hold first (red), then the longest waiting.
// A question leaves this list when it is closed or moves up to Needs you.
function engWaitingHtml() {
  if (!S.queries) return '';
  const me = S.me.email;
  const list = S.queries.queries.filter((q) => q.askedBy === me && q.status !== 'closed' && q.status !== 'waiting_photo' && !isNewAnswer(q))
    .sort((a, b) => (b.workOnHold - a.workOnHold) || ((a.last ? a.last.at : a.askedAt) < (b.last ? b.last.at : b.askedAt) ? -1 : 1));
  const sendingAsks = waiting('askQuery').map((w) => w.args[0]);
  if (!list.length && !sendingAsks.length) return '';
  const state = (q) => {
    const l = q.last || { what: 'asked', by: me, at: q.askedAt };
    const what = l.by !== me ? 'reply from ' + nameOfEmail(l.by) : l.what === 'photo' ? 'photo sent' : l.what === 'reply' ? 'you replied' : '';
    return [q.workOnHold ? 'work on hold' : '', what, 'waiting ' + ageText(l.at)].filter(Boolean).join(' · ');
  };
  return '<section class="card eng-card"><h2 class="eng-h2">Waiting for an answer <span class="muted">· ' + (list.length + sendingAsks.length) + '</span></h2>' +
    sendingAsks.map((x) => '<div class="eng-wait"><b>' + esc(x.text) + '</b><span class="muted small">' + esc(engProjName(x.project)) + ' · <span class="sending">Sending…</span></span></div>').join('') +
    list.map((q) => '<button type="button" class="eng-wait' + (q.workOnHold ? ' hold' : '') + '" data-act="eq-open" data-id="' + esc(q.id) + '"><b>' + esc(q.text) + '</b>' +
      '<span class="small eng-wait-state">' + esc(LC.cap(state(q))) + ' · ' + esc(engProjName(q.project)) + '</span></button>').join('') + '</section>';
}
// After ticking a task from a query or a photo: "Add a photo of the finished work" (optional). Owners then see
// "Done, with photo".
function donePhotoHtml(x) {
  if (!x.done) return '';
  if (x.done_photo) return '<span class="done-photo">Done, with photo</span>';
  if (waiting('addDonePhoto').some((w) => w.args[0] === x.id)) return '<span class="done-photo">Done, with photo · <span class="sending">Sending…</span></span>';
  if (!/^(query|photo):/.test(x.source || '') || doneOfferOff(x.id)) return '';
  const drafts = S.drafts.filter((d) => d.purpose === 'done:' + x.id);
  return '<div class="done-offer"><span class="small"><b>Add a photo of the finished work</b> (optional)</span>' +
    (drafts.length ? '<div class="q-photos">' + drafts.map((d) => '<span class="q-photo"><img src="data:image/jpeg;base64,' + d.thumb + '" alt=""><button type="button" class="q-x" data-act="draft-del" data-id="' + esc(d.id) + '" aria-label="Remove photo">×</button></span>').join('') + '</div>' : '') +
    photoPickHtml('done:' + x.id) +
    '<div class="ph-btns">' + (drafts.length ? '<button type="button" class="btn-save" data-act="done-send" data-id="' + esc(x.id) + '">Send ' + plural(drafts.length, 'photo', 'photos') + '</button>' : '') +
    '<button type="button" class="link-btn" data-act="done-skip" data-id="' + esc(x.id) + '">No photo</button></div></div>';
}
const DONE_SKIP_KEY = 'oft.doneskip.' + CONFIG.env;
function doneOfferOff(id) { try { return (JSON.parse(stored(DONE_SKIP_KEY) || '[]')).indexOf(id) >= 0; } catch (_) { return false; } }
function skipDoneOffer(id) {
  let list = [];
  try { list = JSON.parse(stored(DONE_SKIP_KEY) || '[]'); } catch (_) { list = []; }
  list.push(id);
  store(DONE_SKIP_KEY, JSON.stringify(list.slice(-50)));
}
function sendDonePhotos(id) {
  const x = ((S.site && S.site.tasks) || []).find((t) => t.id === id);
  const drafts = S.drafts.filter((d) => d.purpose === 'done:' + id);
  if (!x || !drafts.length) return;
  const src = taskSources()[x.source] || {};
  let chain = Promise.resolve();
  drafts.forEach((d) => {
    chain = chain.then(() => outboxAdd('uploadPhoto', [{ id: d.id, project: x.project, batchId: id, area: src.area || '', caption: '', linkedTo: 'done:' + id, full: d.full, thumb: d.thumb }], 'Photo of finished work'))
      .then(() => idbDel('drafts', d.id));
  });
  chain.then(() => outboxAdd('addDonePhoto', [id, drafts.map((d) => d.id)], 'Done, with photo')).then(loadDrafts).then(() => {
    engSnack(navigator.onLine ? 'Photo sent. Shruthi and Savan see “Done, with photo”.' : 'Saved on your phone. It will send by itself.');
    renderEng();
  });
}
// Every place a photo can be added: the camera, or the gallery.
function photoPickHtml(purpose) {
  return '<div class="ph-pick"><label class="btn-save ph-pick-btn">Take photo<input type="file" accept="image/*" capture="environment" data-q-pick="' + esc(purpose) + '" hidden></label>' +
    '<label class="btn-outline ph-pick-btn">From gallery<input type="file" accept="image/*" multiple data-q-pick="' + esc(purpose) + '" hidden></label></div>';
}
// Goes through the phone's outbox: on the list at once ("Sending…"), saved on the server in the background.
function engAddTask() {
  const a = S.engAdd, note = String(a.note || '').trim();
  if (!note && Date.now() - (S.engAddedAt || 0) < 2000) return; // the second tap of a double tap
  if (!note) { a.err = 'Type what to do.'; renderEng(); return; }
  if (!S.engProject) { a.err = 'Pick a project at the top.'; renderEng(); return; }
  const due = a.due ? LC.fromIso(a.due) : null;
  const code = 'MT ' + S.engProject + (due ? ' ' + due.getDate() + '/' + (due.getMonth() + 1) : '') + ' ' + note;
  // dd/mm takes the year of the day it is noted on, so a due date in another year is noted on that date.
  const sel = a.due && a.due.slice(0, 4) !== todayIso().slice(0, 4) ? a.due : todayIso();
  const cid = 'e_' + newId().replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12);
  S.engAdd = { note: '', due: '', err: '' };
  S.engAddedAt = Date.now();
  outboxAdd('addEntry', [code, sel, cid], 'Task', { id: cid, note: note, project: S.engProject, due: a.due || todayIso() });
  engSnack('Added to your tasks.');
  renderEng();
}
function isStandalone() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
// How this device is listed under "Signed-in devices".
function deviceName() {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? (/Mobile/i.test(ua) ? 'Android phone' : 'Android tablet') : /iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) ? 'iPad'
    : /Windows/i.test(ua) ? 'Windows computer' : /Macintosh/i.test(ua) ? 'Mac' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return os + (br ? ' · ' + br : '') + (isStandalone() ? ' (installed app)' : '');
}
function forgetDevice() {
  store(SESSION_KEY, null); store(ME_KEY, null); store(CACHE_KEY, null); store(SITE_KEY, null);
  S.engineer = false;
  $('engScreen').hidden = true;
  S.me = null; S.devices = null;
}
// The server says this device is no longer signed in (signed out from another device, or unused for months).
function signedOut(message) {
  // Already signed out here (e.g. a background refresh answering after "Sign out of this device"): nothing to do.
  if (!sessionToken() && !$('gate').hidden) return;
  forgetDevice();
  showSignIn(message || 'This device has been signed out. Please sign in again.', { chooseAccount: true });
}
function signOutHere() {
  try { google.accounts.id.disableAutoSelect(); } catch (_) { /* Google sign-in not loaded */ }
  showGate('O F Turnkey', 'Signing out…');
  api('signOut', ['']).catch(() => { /* offline: forget it here anyway; an owner can remove it from the list */ })
    .finally(() => { forgetDevice(); showSignIn('Signed out of this device.', { chooseAccount: true }); });
}

// fromCache: the ledger is already on screen from this device's copy; this just brings it up to date.
function boot(fromCache) {
  if (!fromCache) showGate('O F Turnkey', 'Opening…');
  S.pending++;
  renderStatus();
  api('boot', []).then((res) => {
    S.pending--;
    S.me = res.me;
    store(ME_KEY, JSON.stringify(res.me));
    if (res.noAccess) { forgetDevice(); showNoAccess(res.me.email); return; }
    if (res.engineer) { store(CACHE_KEY, null); store(SITE_KEY, JSON.stringify({ email: res.me.email, site: res.site })); showEngineer(res.me, res.site); startOutbox(); return; }
    S.sheetUrl = res.sheetUrl || '';
    setData(res.data);
    saveCache();
    firstRender();
    startOutbox();
  }, (err) => {
    S.pending--;
    if (err.signin) { signedOut(err.message); return; }
    const why = err.network ? 'No signal right now.' : cleanErr(err.message);
    if (S.started) { snack(why + ' Showing what was last saved on this device.', { error: !err.network }); renderAll(); return; }
    if (S.engineer) { engSnack(why + ' Showing what was saved on this phone. Anything you send waits and goes by itself.', !err.network); startOutbox(); return; }
    showGate('O F Turnkey', cleanErr(err.message), { error: true, button: TRY_AGAIN });
  });
}

function firstRender() {
  if (!S.started) {
    S.started = true;
    const now = new Date();
    S.sel = LC.iso(now);
    S.y = now.getFullYear();
    S.m = now.getMonth();
    // Links from alerts: ?tab=projects&project=NST&sec=queries&q=<id>
    const qs = new URLSearchParams(location.search), tab = qs.get('tab');
    S.tab = ['ledger', 'projects', 'tasks', 'dir'].indexOf(tab) >= 0 ? tab : 'ledger';
    if (qs.get('project')) S.projTab = qs.get('project').toUpperCase();
    if (['overview', 'site', 'queries'].indexOf(qs.get('sec')) >= 0) S.projSec = qs.get('sec');
    if (qs.get('q')) S.qSel = qs.get('q');
    $('logoSlot').innerHTML = logoHtml();
    loadPrintChoices();
    applyPageSize();
    S.readyMs = Math.round(performance.now());
  }
  $('gate').hidden = true;
  $('appScreen').hidden = false;
  renderAll();
  renderEnvStrip();
  if (S.tab === 'dir' && !S.devices) loadDevices();
}

function loadDevices() {
  api('devices', []).then((res) => {
    S.devices = res.devices;
    S.devicesErr = '';
    if (S.tab === 'dir') bgRedraw();
  }, (err) => {
    if (err.signin) { signedOut(err.message); return; }
    S.devicesErr = cleanErr(err.message);
    if (S.tab === 'dir') bgRedraw();
  });
}
function devicesPanelHtml() {
  const owner = isOwner(), list = S.devices;
  const rows = !list
    ? '<p class="empty">' + esc(S.devicesErr || 'Loading…') + '</p>'
    : list.map((d) => {
      const conf = S.confirmDel === 'sess:' + d.id;
      return '<div class="drow"><div class="drow-view"><div class="drow-text"><b>' + esc(d.device) + (d.here ? '<span class="dev-here">this device</span>' : '') + '</b><span>' +
        (owner ? esc(d.name && d.name !== d.email ? d.name + ' · ' + d.email : d.email) + ' · ' : '') +
        'signed in ' + esc(d.signedIn) + ' · last used ' + esc(d.lastUsed) + '</span></div>' +
        '<button type="button" class="btn-sm' + (conf ? ' btn-danger' : '') + '" data-act="sess-out" data-id="' + esc(d.id) + '">' + (conf ? 'Confirm sign out?' : 'Sign out') + '</button></div></div>';
    }).join('') || '<p class="empty">No signed-in devices.</p>';
  return '<div class="panel"><div class="panel-head"><h3>Signed-in devices</h3><span class="mono">' + (list ? list.length : '') + '</span></div>' +
    '<p class="panel-desc">' + (owner
      ? 'Every phone and computer signed in to O F Turnkey. Lost a phone? Sign it out here: it can’t open anything until someone signs in on it with Google again.'
      : 'Your phones and computers signed in to O F Turnkey.') + '</p>' + rows + '</div>';
}
function signOutDevice(id) {
  api('signOut', [id]).then((res) => {
    if (res.here) { forgetDevice(); showSignIn('Signed out of this device.', { chooseAccount: true }); return; }
    snack(res.signedOut ? 'Signed out. That device needs Google sign-in again before it can open anything.' : 'That device was already signed out.');
    loadDevices();
  }, (err) => {
    if (err.signin) { signedOut(err.message); return; }
    snack(cleanErr(err.message), { error: true });
  });
}

// Test app only: a strip saying so, who is signed in, and how long the last request took.
function renderEnvStrip() {
  const el = $('envStrip');
  if (CONFIG.env !== 'test') { el.hidden = true; return; }
  el.hidden = false;
  const bits = [];
  if (S.me) bits.push('Signed in as ' + esc(S.me.email) + ' (' + esc(S.me.role || 'no access') + ')');
  if (S.readyMs) bits.push('screen ready ' + secs(S.readyMs));
  if (S.timing) bits.push('last request “' + esc(S.timing.action) + '”: server ' + secs(S.timing.server || 0) + ', total ' + secs(S.timing.total));
  bits.push('version ' + esc(CONFIG.version));
  el.innerHTML = '<b>TEST APP</b> · works on a test copy of the sheet · nothing here changes the real ledger<br>' + bits.join(' · ');
}

/* ---------- snack bar ---------- */
let snackTimer = null;
function snack(text, opts) {
  opts = opts || {};
  S.snackMsg = { text: text, error: !!opts.error, undoId: opts.undoId || null, undoTick: opts.undoTick || null };
  renderSnack();
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => { S.snackMsg = null; renderSnack(); }, opts.undoId ? 10000 : opts.undoTick ? 5000 : opts.error ? 9000 : 4500);
}
function renderSnack() {
  const el = $('snack'), m = S.snackMsg;
  el.hidden = !m;
  if (!m) { el.innerHTML = ''; return; }
  el.className = 'snack' + (m.error ? ' error' : '');
  el.setAttribute('role', m.error ? 'alert' : 'status');
  el.innerHTML = '<span class="snack-text">' + esc(m.text) + '</span>' +
    (m.undoId ? '<button type="button" class="undo" data-act="undo" data-id="' + esc(m.undoId) + '">Undo</button>' : '') +
    (m.undoTick ? '<button type="button" class="undo" data-act="undo-tick" data-id="' + esc(m.undoTick) + '">Undo</button>' : '') +
    '<button type="button" class="close" data-act="snack-close" aria-label="Dismiss">×</button>';
}

/* ---------- header, tabs ---------- */
function renderStatus() {
  const el = $('status');
  el.textContent = S.pending ? 'Syncing…' : (S.loadedAt ? 'Updated ' + S.loadedAt.slice(11) : '');
  $('backupNote').textContent = (S.data && S.data.user ? 'Signed in as ' + S.data.user + '. ' : '') +
    (S.data && S.data.lastBackup ? 'Last weekly backup: ' + S.data.lastBackup + '.' : 'A backup copy is made in Drive every Sunday night.');
  const link = $('sheetLink');
  link.href = S.sheetUrl || '#';
  link.textContent = CONFIG.env === 'test' ? 'TEST copy of the sheet' : 'O F Turnkey sheet';
}
function renderTabs() {
  const open = live().filter((e) => isTask(e) && !e.done).length;
  const t = (key, label, count) => '<button type="button" class="tab' + (S.tab === key ? ' on' : '') + '" data-act="tab" data-tab="' + key +
    '" aria-pressed="' + (S.tab === key) + '">' + label + (count != null ? '<span class="tab-count">' + count + '</span>' : '') + '</button>';
  $('tabs').innerHTML = t('ledger', 'Ledger') + t('projects', 'Projects') + t('tasks', 'Tasks', open) + t('dir', 'Directory');
}

/* ---------- code bar ---------- */
// Editing parses on the entry's (possibly changed) date and keeps its own codes valid even if archived since.
function parseCtx() {
  const ed = editing();
  return ed
    ? { dir: S.dir, sel: S.editDate || ed.date, keep: { project: ed.project, who: ed.who, mode: ed.mode } }
    : { dir: S.dir, sel: S.sel };
}
function editUnchanged(ed) { return !!ed && norm(S.code) === norm(ed.raw_code) && (S.editDate || ed.date) === ed.date; }

function warningsFor(en) {
  const out = [], ed = editing();
  const others = live().filter((e) => !ed || e.id !== ed.id);
  const who = LC.whoName(S.dir, en.who, en.project);
  if (en.type === 'P') {
    const past = others.filter((e) => e.type === 'P' && e.who === en.who && e.amount > 0).map((e) => e.amount).sort((a, b) => a - b);
    if (past.length >= 3) {
      const h = past.length / 2;
      const med = past.length % 2 ? past[Math.floor(h)] : (past[h - 1] + past[h]) / 2;
      if (en.amount > 3 * med || en.amount < med / 10) {
        const lo = past[Math.floor((past.length - 1) * 0.25)], hi = past[Math.ceil((past.length - 1) * 0.75)];
        out.push({ title: 'Unusual amount', text: who + ' is usually paid ' + (lo === hi ? LC.inr(lo) : LC.inr(lo) + '–' + LC.inr(hi)) + '. This is ' + LC.inr(en.amount) + '.' });
      }
    }
    const same = ed && ed.type === 'P' && ed.who === en.who && ed.project === en.project;
    if (!same && !others.some((e) => e.type === 'P' && e.who === en.who && e.project === en.project)) {
      out.push({ title: 'New to this project', text: 'First payment to ' + who + ' on ' + projName(en.project) + '.' });
    }
  }
  if (en.type === 'P' || en.type === 'R') {
    const dup = others.find((e) => e.type === en.type && e.project === en.project && e.who === en.who && e.amount === en.amount && e.date === en.date);
    if (dup) out.push({ title: 'Possible double entry', text: '“' + dup.raw_code + '” is already saved on ' + LC.nice(en.date) + '.' });
  } else {
    const t = todayIso();
    if (en.due < t) out.push({ title: 'Odd due date', text: 'Due ' + niceY(en.due) + ', which is in the past.' });
    else if (en.due > addDays(t, 90)) out.push({ title: 'Odd due date', text: 'Due ' + niceY(en.due) + ', more than 90 days away.' });
  }
  return out;
}

function pvLine(e, tag) {
  return '<div class="pv-line' + (tag === 'was' ? ' was' : '') + '">' + (tag ? '<span class="pv-tag">' + tag + '</span>' : '') + badge(e.type) +
    '<span class="pv-sent">' + esc(LC.describe(S.dir, e)) + '</span><span class="pv-proj">' + esc(projName(e.project)) + '</span></div>';
}

function renderCodebar() {
  const ed = editing();
  const r = LC.parse(S.code, parseCtx());
  S.parsed = r;
  const day = LC.fromIso(ed ? (S.editDate || ed.date) : S.sel);
  const dayTxt = WDS[day.getDay()] + ' ' + day.getDate() + ' ' + MON[day.getMonth()];
  const lab = $('cbLabel');
  lab.textContent = ed ? 'Editing entry · ' + (isTask(ed) ? 'noted ' : '') + dayTxt : 'New entry · ' + dayTxt;
  lab.classList.toggle('editing', !!ed);
  $('code').classList.toggle('editing', !!ed);

  let chips = r.tokens.map((t) => '<div class="tk ' + (t.ok ? 'ok' : 'bad') + '"><b>' + esc(t.txt) + '</b><span>' + esc(t.ok ? t.meaning : '? ' + t.meaning) + '</span></div>').join('');
  if (r.hint) chips += '<div class="hint">Next: ' + esc(r.hint) + '</div>';
  $('cbChips').innerHTML = chips;

  let pv = '';
  if (ed) pv += pvLine(ed, 'was');
  if (r.entry) pv += pvLine(r.entry, ed ? 'now' : '');
  else if (!ed) pv += '<span class="muted" style="font-size:14px">The plain-English line appears here as you type.</span>';
  if (r.entry && LC.TYPES[r.entry.type].money) pv += '<div class="words">' + esc(LC.amountWords(r.entry.amount)) + '</div>';
  $('cbPreview').innerHTML = pv;

  const warns = r.ready ? warningsFor(r.entry) : [];
  S.warns = warns;
  let w = warns.map((x) => '<p class="warn" role="status"><b>' + esc(x.title) + '.</b> ' + esc(x.text) + '</p>').join('');
  if (warns.length && S.armed === norm(S.code)) w += '<div class="warn-note">Press Enter again to save anyway.</div>';
  if (S.saveErr) w += '<p class="err" role="alert">' + esc(S.saveErr) + '</p>';
  $('cbWarn').innerHTML = w;

  const unchanged = editUnchanged(ed);
  const btn = $('saveBtn');
  btn.disabled = !r.ready || S.saving || unchanged;
  btn.textContent = S.saving ? 'Saving…' : warns.length ? 'Save anyway' : ed ? 'Save changes' : 'Save entry';
  btn.classList.toggle('anyway', warns.length > 0 && !S.saving);

  const ce = $('cbEdit');
  ce.hidden = !ed;
  // Rebuilt only when the entry or the void confirmation changes, so the date field keeps focus while typing.
  const key = ed ? ed.id + '|' + (S.confirmVoid === ed.id) : '';
  if (ce.dataset.key !== key) {
    ce.dataset.key = key;
    if (ed) {
      const conf = S.confirmVoid === ed.id;
      ce.innerHTML =
        '<label class="edit-date" for="editDate">' + (isTask(ed) ? 'Noted on' : 'Date') + '<input type="date" id="editDate" value="' + esc(S.editDate || ed.date) + '"></label>' +
        '<button type="button" class="btn-sm" data-act="cancel-edit">Cancel</button>' +
        '<button type="button" class="btn-sm' + (conf ? ' btn-danger' : '') + '" data-act="void" data-id="' + esc(ed.id) + '">' + (conf ? 'Void this entry?' : 'Void entry') + '</button>' +
        '<span class="edit-help">Change the code or the date, check the “now” line, then save. The change is logged.' +
        (isTask(ed) ? ' The due date is the dd/mm in the code, or this date if the code has none.' : '') + '</span>';
    } else {
      ce.innerHTML = '';
    }
  }
  $('guideBtn').textContent = S.guide ? 'Hide code guide' : 'Code guide';
  $('cbGuide').hidden = !S.guide;
  if (S.guide) renderGuide();
}

function renderGuide() {
  const d = S.dir;
  const groups = [
    ['Type (first)', TYPE_ORDER.map((k) => [k, LC.TYPES[k].label])],
    ['Projects', LC.activeCodes(d.projects).map((k) => [k, d.projects[k].name])],
    ['People & vendors', LC.whoCodes(d).map((k) => [k, k === LC.CLIENT ? 'Client of the project' : d.people[k].name + (d.people[k].detail ? ' · ' + d.people[k].detail : '')])],
    ['Mode (P / R only)', LC.activeCodes(d.modes).map((k) => [k, d.modes[k].label])],
    ['Amounts', [['18000', LC.inr(18000)], ['25k', LC.inr(25000)], ['2.5L', LC.inr(250000)], ['1Cr', LC.inr(10000000)]]]
  ];
  $('cbGuide').innerHTML =
    '<div class="guide-formats">' +
    '<span><b>P / R</b>   TYPE PROJECT WHO AMOUNT MODE note       e.g. P SA BAB 25k C</span>' +
    '<span><b>F</b>       TYPE PROJECT WHO dd/mm note             e.g. F SA ZAM 18/10 gate drawings</span>' +
    '<span><b>MT</b>      TYPE PROJECT dd/mm what-to-do           e.g. MT SA 15/10 send revised BOQ</span>' +
    '<span><b>MT @</b>    TYPE PROJECT @CODE dd/mm what-to-do     e.g. MT NST @VNK 26/11 seal pantry joint (a task for Venky)</span>' +
    '<p>No date on F or MT means the task is due on the day you picked. CL always means the client of that project. Add or change codes in the Directory tab.</p>' +
    '</div><div class="guide-groups">' +
    groups.map((g) => '<div class="guide-group"><h4>' + esc(g[0]) + '</h4>' +
      (g[1].length ? g[1].map((it) => '<div class="guide-item"><b>' + esc(it[0]) + '</b><span>' + esc(it[1]) + '</span></div>').join('') : '<div class="guide-item muted">None yet. Add in Directory.</div>') +
      '</div>').join('') +
    '</div>';
}

function setCode(v) { S.code = v; S.armed = ''; $('code').value = v; }

function onEnter() {
  const r = S.parsed;
  if (!r || !r.ready || S.saving) return;
  const ed = editing();
  if (editUnchanged(ed)) return;
  if (S.warns.length && S.armed !== norm(S.code)) { S.armed = norm(S.code); renderCodebar(); return; }
  saveCode();
}

function saveCode() {
  const r = S.parsed;
  if (!r || !r.ready || S.saving) return;
  const ed = editing(), raw = norm(S.code);
  S.saving = true;
  S.saveErr = '';
  renderCodebar();
  const fail = (msg) => { S.saving = false; S.saveErr = msg; };
  if (ed) {
    const date = S.editDate || ed.date;
    call('editEntry', [ed.id, raw, date], () => {
      S.saving = false; S.editId = null; S.editDate = ''; setCode('');
      const e = findEntry(ed.id);
      if (e) { S.sel = sitsOn(e); const d = LC.fromIso(S.sel); S.y = d.getFullYear(); S.m = d.getMonth(); }
      snack('Entry updated. Before and after are in the Changes tab.');
    }, fail);
  } else {
    call('addEntry', [raw, S.sel], (res) => {
      S.saving = false; setCode('');
      const e = findEntry(res.id);
      snack('Saved: ' + (e ? shortLine(e) : raw), { undoId: res.id });
    }, fail);
  }
}

function startEdit(id) {
  const e = findEntry(id);
  if (!e || e.status === 'void' || !isOwner()) return;
  S.editId = id;
  S.editDate = e.date;
  S.saveErr = '';
  setCode(e.raw_code);
  renderAll();
  $('codebar').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const input = $('code');
  input.focus({ preventScroll: true });
  try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) { /* ignore */ }
}
function cancelEdit() { S.editId = null; S.editDate = ''; S.saveErr = ''; setCode(''); renderAll(); }

/* ---------- entry actions ---------- */
// "Ticked off" has Undo for a few seconds; unticking puts the task back exactly as it was.
function toggleDone(id) {
  const e = findEntry(id);
  if (!e) return;
  e.done = !e.done;
  call('setDone', [id, e.done], null, (msg) => { snack(msg, { error: true }); refresh(true); });
  if (e.done) snack('Ticked off: ' + LC.taskTitle(S.dir, e), { undoTick: id });
  else if (S.snackMsg && S.snackMsg.undoTick === id) S.snackMsg = null;
}
function doVoid(id) {
  const e = findEntry(id);
  if (!e) return;
  if (S.editId === id) { S.editId = null; setCode(''); }
  e.status = 'void';
  call('setEntryStatus', [id, 'void'], () => snack('Entry voided. Its day’s “Show voided” list has Unvoid.'), (msg) => { snack(msg, { error: true }); refresh(true); });
}

/* ---------- calendar & payments tab ---------- */
function renderCalendar() {
  const t = todayIso();
  const first = new Date(S.y, S.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const dim = new Date(S.y, S.m + 1, 0).getDate();
  const cellsN = Math.ceil((offset + dim) / 7) * 7;
  const money = {}, tasks = {};
  live().filter(inFilter).forEach((e) => {
    if (isTask(e)) (tasks[e.due] = tasks[e.due] || []).push(e);
    else (money[e.date] = money[e.date] || []).push(e);
  });
  let cells = '';
  for (let k = 0; k < cellsN; k++) {
    const d = new Date(S.y, S.m, 1 - offset + k), di = LC.iso(d);
    const mo = money[di] || [], tk = tasks[di] || [];
    const cls = ['cal-day'];
    if (di === S.sel) cls.push('sel');
    if (di === t) cls.push('today');
    if (d.getMonth() !== S.m) cls.push('out');
    let h = '<span class="cal-num">' + d.getDate() + '</span>';
    h += mo.slice(0, 2).map((e) => '<span class="cal-chip t-' + e.type + '">' + esc(e.type + ' ' + LC.short(e.amount) + ' ' + e.who) + '</span>').join('');
    if (mo.length > 2) h += '<span class="cal-more">+' + (mo.length - 2) + ' more</span>';
    if (tk.length) {
      h += '<span class="cal-tasks">' + tk.slice(0, 2).map((e) => '<span class="cal-task t-' + e.type + (e.done ? ' done' : '') + '"><span class="cal-box"></span><span class="cal-tt">' + e.type +
        '</span><span class="cal-tl">' + esc(e.type === 'F' ? LC.whoName(S.dir, e.who, e.project) : LC.cap(e.note)) + '</span></span>').join('') +
        (tk.length > 2 ? '<span class="cal-more">+' + (tk.length - 2) + ' more</span>' : '') + '</span>';
    }
    const types = TYPE_ORDER.filter((ty) => mo.some((e) => e.type === ty) || tk.some((e) => e.type === ty));
    if (types.length) h += '<span class="cal-dots" aria-hidden="true">' + types.map((ty) => '<i class="dot d-' + ty + '"></i>').join('') + '</span>';
    const aria = d.getDate() + ' ' + MONL[d.getMonth()] + ', ' + plural(mo.length, 'payment', 'payments') + ', ' + plural(tk.length, 'task', 'tasks') + ' due';
    cells += '<button type="button" class="' + cls.join(' ') + '" data-act="pick" data-date="' + di + '" aria-label="' + esc(aria) + '" aria-pressed="' + (di === S.sel) + '">' + h + '</button>';
  }
  const filter = S.project
    ? '<span class="filter-chip">Showing ' + esc(projName(S.project)) + '<button type="button" data-act="clear-filter">Show all</button></span>'
    : '';
  $('calendar').innerHTML =
    '<div class="cal-head"><h2 id="cal-h">' + MONL[S.m] + ' ' + S.y + '</h2>' + filter +
    '<div class="cal-nav"><button type="button" class="icon-btn" data-act="prev" aria-label="Previous month">' + ARROW_L + '</button>' +
    '<button type="button" class="today-btn" data-act="today">Today</button>' +
    '<button type="button" class="icon-btn" data-act="next" aria-label="Next month">' + ARROW_R + '</button></div></div>' +
    '<div class="cal-grid" aria-hidden="true">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => '<span class="cal-wd">' + w + '</span>').join('') + '</div>' +
    '<div class="cal-grid">' + cells + '</div>' +
    '<div class="legend">' +
    '<span>' + badge('P', true) + 'Paid out</span><span>' + badge('R', true) + 'Received</span>' +
    '<span>' + badge('F', true) + 'Follow-up due (below the line)</span><span>' + badge('MT', true) + 'My task due (below the line)</span></div>';
}

function voidBtn(e) {
  if (!isOwner()) return '';
  const c = S.confirmVoid === e.id;
  return '<button type="button" class="void-btn' + (c ? ' confirm' : '') + '" data-act="void" data-id="' + esc(e.id) + '">' + (c ? 'Void this entry?' : 'Void') + '</button>';
}
function tickBtn(e) {
  const fg = TFG[e.type];
  const box = '<span class="tick-box" style="border-color:' + fg + ';background:' + (e.done ? fg : '#FFFFFF') + '">' + (e.done ? CHECK : '') + '</span>';
  if (!canWrite()) return '<span class="tick" role="img" aria-label="' + (e.done ? 'Done' : 'Not done') + '">' + box + '</span>';
  return '<button type="button" class="tick" data-act="done" data-id="' + esc(e.id) + '" aria-label="' + (e.done ? 'Mark not done' : 'Mark done') + '" aria-pressed="' + !!e.done + '">' + box + '</button>';
}
function itemActions(e) { const h = editBtn(e) + voidBtn(e); return h ? '<span class="item-actions">' + h + '</span>' : ''; }
function moneyItem(e) {
  return '<div class="item">' + badge(e.type) + mainOpen(e) + '<span>' + esc(LC.describe(S.dir, e)) + '</span>' +
    '<span class="item-meta">' + esc(projName(e.project)) + ' · <code>' + esc(e.raw_code) + '</code>' + byTag(e) + '</span>' + mainClose() + itemActions(e) + '</div>';
}
function taskItem(e) {
  return '<div class="item">' + tickBtn(e) + '<div class="tcard-body">' + mainOpen(e) + '<span' + (e.done ? ' style="text-decoration:line-through"' : '') + '>' +
    badge(e.type, true) + ' ' + newTaskTag(e) + esc(LC.taskTitle(S.dir, e)) + '</span>' +
    '<span class="item-meta">' + esc(projName(e.project)) + forTag(e) + ' · ' + dueChip(e) + ' · noted ' + esc(LC.nice(e.date)) + ' · <code>' + esc(e.raw_code) + '</code>' + byTag(e) + '</span>' + mainClose() +
    taskSourceHtml(e.source, e.id) + '</div>' + itemActions(e) + '</div>';
}
function voidedItem(e) {
  return '<div class="item voided">' + badge(e.type) +
    '<div class="item-main"><span>' + esc(LC.describe(S.dir, e)) + '</span><span class="item-meta">' + esc(projName(e.project)) + ' · <code>' + esc(e.raw_code) + '</code>' + byTag(e) + '</span></div>' +
    (isOwner() ? '<button type="button" class="void-btn" data-act="unvoid" data-id="' + esc(e.id) + '">Unvoid</button>' : '') + '</div>';
}

function renderDay() {
  const sd = LC.fromIso(S.sel);
  const L = live().filter(inFilter);
  const dm = L.filter((e) => !isTask(e) && e.date === S.sel);
  const dt = L.filter((e) => isTask(e) && e.due === S.sel);
  const voided = S.entries.filter((e) => e.status === 'void' && inFilter(e) && sitsOn(e) === S.sel);
  let h = '<h2 id="day-h" style="font-size:18px">' + WDL[sd.getDay()] + ', ' + sd.getDate() + ' ' + MONL[sd.getMonth()] + '</h2>';
  h += '<div class="list"><div class="label-caps">Payments · ' + dm.length + '</div>' +
    (dm.length ? dm.map(moneyItem).join('') : '<p class="empty">No payments on this day.</p>') + '</div>';
  h += '<div class="list"><div class="label-caps">Tasks due · ' + dt.length + '</div>' +
    (dt.length ? dt.map(taskItem).join('') : '<p class="empty">No follow-ups or tasks due.</p>') + '</div>';
  h += '<button type="button" class="toggle-link" data-act="show-voided" aria-expanded="' + S.showVoided + '">' + chev(S.showVoided) + 'Show voided (' + voided.length + ')</button>';
  if (S.showVoided) h += '<div class="list">' + (voided.length ? voided.map(voidedItem).join('') : '<p class="empty">No voided entries on this day.</p>') + '</div>';
  $('dayPanel').innerHTML = h;
}

function remItem(e) {
  return '<div class="rem-item">' + badge(e.type, true) + '<div class="tcard-body">' + mainOpen(e) + '<span style="font-size:13px">' + newTaskTag(e) + esc(LC.taskTitle(S.dir, e)) + '</span>' +
    '<span class="item-meta">' + esc(projName(e.project)) + forTag(e) + ' · ' + dueChip(e) + byTag(e) + '</span>' + mainClose() + taskSourceHtml(e.source, e.id) + '</div>' +
    (canWrite() ? '<span class="item-actions">' + editBtn(e) + '<button type="button" class="btn-sm" data-act="done" data-id="' + esc(e.id) + '">Done</button></span>' : '') + '</div>';
}

function renderReminders() {
  const t = todayIso(), in7 = addDays(t, 7);
  const open = live().filter((e) => isTask(e) && !e.done && inFilter(e)).sort(byDue);
  const groups = [
    ['Overdue', '#8C1D18', open.filter((e) => e.due < t)],
    ['Today', '#5E4500', open.filter((e) => e.due === t)],
    ['Next 7 days', '#3B4A26', open.filter((e) => e.due > t && e.due <= in7)]
  ];
  $('reminders').innerHTML =
    '<div class="sec-head" style="align-items:center"><h2 id="al-h">Reminders</h2>' +
    '<button type="button" class="btn-outline" style="margin-left:auto" data-act="tab" data-tab="tasks">All tasks</button></div>' +
    groups.map((g) => '<div class="rem-group"><div class="rem-title" style="color:' + g[1] + '">' + g[0] + '<span class="mono">' + g[2].length + '</span></div>' +
      (g[2].length ? g[2].map(remItem).join('') : '<span class="empty">None</span>') + '</div>').join('');
}

function projectRow(list) {
  let labour = 0, material = 0, other = 0, received = 0;
  list.forEach((e) => {
    if (e.type === 'P') {
      const p = S.dir.people[e.who], k = p ? p.kind : '';
      if (k === 'labour') labour += e.amount; else if (k === 'material') material += e.amount; else other += e.amount;
    } else if (e.type === 'R') received += e.amount;
  });
  return {
    labour: labour, material: material, received: received, net: received - labour - material - other,
    follow: list.filter((e) => e.type === 'F' && !e.done).length,
    mine: list.filter((e) => e.type === 'MT' && !e.done).length
  };
}
function renderProjects() {
  const L = live();
  const codes = LC.activeCodes(S.dir.projects);
  const cells = (r) => '<td class="num">' + LC.inr(r.labour) + '</td><td class="num">' + LC.inr(r.material) + '</td><td class="num">' + LC.inr(r.received) +
    '</td><td class="num" style="font-weight:600">' + LC.inr(r.net) + '</td><td class="num">' + r.follow + ' / ' + r.mine + '</td>';
  let body = codes.map((c) => {
    const p = S.dir.projects[c], on = S.project === c;
    return '<tr class="' + (on ? 'on' : '') + '"><td><button type="button" class="proj-btn" data-act="filter-project" data-code="' + esc(c) + '" aria-pressed="' + on + '">' +
      '<span class="code-tag">' + esc(c) + '</span>' + esc(p.name) + '<span style="font-weight:400;color:#5C615D;font-size:13px">' + esc(p.client || '') + '</span></button></td>' +
      cells(projectRow(L.filter((e) => e.project === c))) + '</tr>';
  }).join('');
  if (!codes.length) {
    body = '<tr><td colspan="6" style="padding:14px 12px" class="empty">No projects yet. Add your first one in the Directory tab.</td></tr>';
  }
  const tot = projectRow(L);
  $('projects').innerHTML =
    '<div class="sec-head"><h2 id="pr-h">Active projects</h2><span class="sec-note">Pick a project to filter the calendar and tasks.</span></div>' +
    '<div class="table-box"><table class="ptable"><thead><tr><th scope="col">Project</th><th scope="col" class="num">Paid · labour</th><th scope="col" class="num">Paid · material</th>' +
    '<th scope="col" class="num">Received</th><th scope="col" class="num">Net in hand</th><th scope="col" class="num">Open F / MT</th></tr></thead><tbody>' + body +
    '<tr class="total"><td>All projects</td>' + cells(tot) + '</tr></tbody></table></div>';
}

/* ---------- tasks tab ---------- */
// "New" (blue) on a task someone else gave me, until I open it (Edit, its source, or the tick).
function newTaskTag(e) { return isNewTask(e, myCode()) ? '<span class="new-dot" aria-hidden="true"></span><b class="new-tag">New</b> ' : ''; }
function donePhotoStrip(e) {
  const ids = String(e.done_photo || '').split(',').filter(Boolean);
  ids.forEach(wantThumb);
  return ids.length ? '<div class="q-photos done-ph">' + ids.map((id) => '<button type="button" class="q-photo" data-act="lightbox" data-id="' + esc(id) + '">' +
    (S.thumbs[id] ? '<img src="' + S.thumbs[id] + '" alt="Finished work">' : '<span class="ph-wait"></span>') + '</button>').join('') + '</div>' : '';
}
function taskCard(e) {
  return '<div class="tcard' + (e.done ? ' done' : '') + (isNewTask(e, myCode()) ? ' new' : '') + '">' + tickBtn(e) + '<div class="tcard-body">' + mainOpen(e) + '<span class="tcard-title">' + newTaskTag(e) + esc(LC.taskTitle(S.dir, e)) + '</span>' +
    '<span class="tcard-meta">' + badge(e.type, true) + '<span>' + esc(projName(e.project)) + forTag(e) + '</span>' + dueChip(e) +
    (e.added_by ? '<span class="by" title="Added by ' + esc(userName(e.added_by)) + '">' + esc(initials(e.added_by)) + '</span>' : '') + '</span>' +
    '<span class="raw">' + esc(e.raw_code) + '</span>' + mainClose() + taskSourceHtml(e.source, e.id) + donePhotoStrip(e) + '</div>' + (isOwner() ? '<span class="item-actions">' + editBtn(e) + '</span>' : '') + '</div>';
}
function renderTasks() {
  const t = todayIso(), in7 = addDays(t, 7);
  const all = live().filter((e) => isTask(e) && inFilter(e) && (!S.kind || e.type === S.kind) && (!S.mine || isMine(e)));
  const open = all.filter((e) => !e.done).sort(byDue);
  const done = all.filter((e) => e.done).sort(byDue).reverse();
  const cols = [
    ['Overdue', '#8C1D18', open.filter((e) => e.due < t)],
    ['Today', '#5E4500', open.filter((e) => e.due === t)],
    ['Next 7 days', '#3B4A26', open.filter((e) => e.due > t && e.due <= in7)],
    ['Later', '#1F3A5F', open.filter((e) => e.due > in7)],
    ['Done', '#5C615D', done]
  ];
  const chip = (label, on, attrs) => '<button type="button" class="fchip' + (on ? ' on' : '') + '" ' + attrs + ' aria-pressed="' + on + '">' + esc(label) + '</button>';
  const kinds = chip('All', !S.kind, 'data-act="kind" data-kind=""') + chip('F · Follow-ups', S.kind === 'F', 'data-act="kind" data-kind="F"') + chip('MT · My tasks', S.kind === 'MT', 'data-act="kind" data-kind="MT"');
  const whose = chip('Everyone', !S.mine, 'data-act="mine" data-v=""') + chip('Just mine', !!S.mine, 'data-act="mine" data-v="1"');
  const projs = chip('All projects', !S.project, 'data-act="clear-filter"') +
    LC.activeCodes(S.dir.projects).map((k) => chip(S.dir.projects[k].name, S.project === k, 'data-act="set-project" data-code="' + esc(k) + '"')).join('');
  const DONE_SHOWN = 40;
  $('view-tasks').innerHTML =
    '<div class="view-head"><h2 id="tasks-h">Tasks</h2><span class="sec-note">Every F (follow-up with someone) and MT (my task) lands here by due date. Tick it off when it’s done.</span></div>' +
    '<div class="filters"><div class="chip-group" role="group" aria-label="Whose tasks">' + whose + '</div><div class="chip-group" role="group" aria-label="Task kind">' + kinds + '</div><div class="chip-group" role="group" aria-label="Project">' + projs + '</div></div>' +
    '<div class="cols">' + cols.map((c) => {
      const items = c[0] === 'Done' ? c[2].slice(0, DONE_SHOWN) : c[2];
      return '<div class="col"><div class="col-title" style="color:' + c[1] + '">' + c[0] + '<span class="mono">' + c[2].length + '</span></div>' +
        (items.length ? items.map(taskCard).join('') : '<span class="empty">Nothing here.</span>') +
        (c[2].length > items.length ? '<span class="empty">Showing the latest ' + DONE_SHOWN + '.</span>' : '') + '</div>';
    }).join('') + '</div>';
}

/* ---------- directory tab ---------- */
function kindCodes(kind) {
  const d = S.dir;
  if (kind === 'project') return Object.keys(d.projects);
  if (kind === 'mode') return Object.keys(d.modes);
  return Object.keys(d.people).filter((k) => {
    const p = d.people[k];
    if (p.system || p.kind === 'client') return false;
    return kind === 'labour' ? p.kind === 'labour' : p.kind !== 'labour';
  });
}
function recName(kind, r) { return kind === 'mode' ? r.label : r.name; }

function dirMsgHtml(kind) {
  const f = S.forms[kind], typed = f.code.trim().toUpperCase();
  const liveErr = typed ? LC.codeIssue(kind, typed, S.dir, null) : '';
  const nameWarn = LC.nameDup(kind, f.name, S.dir, null);
  const sug = !typed && f.name.trim() ? LC.suggestCode(kind, f.name, S.dir) : '';
  let h = '';
  if (sug) h += '<div class="suggest">Suggested code<button type="button" data-act="dir-suggest" data-kind="' + kind + '" data-code="' + esc(sug) + '" aria-label="Use suggested code ' + esc(sug) + '">' + esc(sug) + '</button>tap to use, or type your own</div>';
  if (liveErr) h += '<p class="err" role="alert">' + esc(liveErr) + '</p>';
  if (nameWarn) h += '<p class="warn" role="status">' + esc(nameWarn) + '</p>';
  if (S.errs[kind] && S.errs[kind] !== liveErr) h += '<p class="err" role="alert">' + esc(S.errs[kind]) + '</p>';
  return h;
}

function editMsgHtml() {
  const ed = S.dirEdit;
  if (!ed) return '';
  const k = ed.code, kind = ed.kind, nu = ed.newCode.trim().toUpperCase(), n = usage(kind, k);
  const changed = nu !== k;
  const issue = changed ? LC.codeIssue(kind, nu, S.dir, k) : '';
  let note, cls = '';
  if (issue) { note = issue; cls = 'bad'; }
  else if (changed) {
    note = n > 0 ? 'Saving changes ' + k + ' to ' + nu + ' in all ' + plural(n, 'entry', 'entries') + '.' : k + ' becomes ' + nu + '. Nothing uses it yet.';
    cls = 'change';
  } else {
    note = n > 0 ? 'Change the code and every entry that uses ' + k + ' (' + n + ') updates with it. A new name shows on old entries too.' : 'Nothing uses this code yet.';
  }
  const warn = LC.nameDup(kind, ed.name, S.dir, k);
  return '<span class="dedit-note ' + cls + '"' + (issue ? ' role="alert"' : '') + '>' + esc(note) + '</span>' +
    (warn ? '<p class="warn" role="status">' + esc(warn) + '</p>' : '') +
    (ed.err && ed.err !== issue ? '<p class="err" role="alert">' + esc(ed.err) + '</p>' : '');
}

function editRowHtml(kind) {
  const ed = S.dirEdit, P = PANELS[kind];
  return '<div class="drow"><div class="dform">' +
    '<div class="fld code"><label for="edit-code">Code</label><input id="edit-code" data-edit="newCode" value="' + esc(ed.newCode) + '" maxlength="' + (kind === 'mode' ? 2 : 4) + '" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>' +
    '<div class="fld"><label for="edit-name">' + esc(P.nameLabel) + '</label><input id="edit-name" data-edit="name" value="' + esc(ed.name) + '" autocomplete="off"></div>' +
    (P.detailLabel ? '<div class="fld"><label for="edit-detail">' + esc(P.detailLabel) + '</label><input id="edit-detail" data-edit="detail" value="' + esc(ed.detail) + '" autocomplete="off"></div>' : '') +
    (P.trade ? '<div class="fld fld-trade"><label for="tp-edit">Trade</label>' + tradePickHtml('edit') + '</div>' : '') +
    (P.location ? '<div class="fld"><label for="edit-location">Location</label><input id="edit-location" data-edit="location" value="' + esc(ed.location || '') + '" autocomplete="off"></div>' : '') +
    '<button type="button" class="btn-accent" data-act="dir-save">Save</button>' +
    '<button type="button" class="btn-outline" data-act="dir-cancel">Cancel</button>' +
    '<div id="editMsg" class="dmsg" style="flex:1 1 100%">' + editMsgHtml() + '</div></div></div>';
}

function rowHtml(kind, k, rec) {
  const n = usage(kind, k), conf = S.confirmDel === kind + ':' + k;
  const label = !canDelete(kind, k) ? 'Archive' : conf ? 'Confirm delete?' : 'Delete';
  return '<div class="drow"><div class="drow-view"><span class="code-tag">' + esc(k) + '</span>' +
    '<div class="drow-text"><b>' + esc(LC.cap(recName(kind, rec)) || 'No site name yet') + '</b><span>' + esc(PANELS[kind].detailOf(rec, k)) + ' · ' + plural(n, 'entry', 'entries') + '</span></div>' +
    (isOwner()
      ? '<button type="button" class="btn-sm" data-act="dir-edit" data-kind="' + kind + '" data-code="' + esc(k) + '" aria-label="Edit ' + esc(k) + '">Edit</button>' +
        (kind === 'project' ? '<button type="button" class="btn-sm" data-act="pi-edit" data-code="' + esc(k) + '">Stage &amp; dates</button>' : '') +
        '<button type="button" class="btn-sm' + (conf ? ' btn-danger' : '') + '" data-act="dir-remove" data-kind="' + kind + '" data-code="' + esc(k) + '" aria-label="' + label + ' ' + esc(k) + '">' + label + '</button>'
      : '') +
    '</div></div>';
}

function panelHtml(kind) {
  const P = PANELS[kind], store = LC.storeFor(S.dir, kind), f = S.forms[kind];
  const codes = kindCodes(kind).sort();
  const act = codes.filter((k) => store[k].active), arch = codes.filter((k) => !store[k].active);
  const open = !!S.showArch[kind];
  let h = '<div class="panel"><div class="panel-head"><h3>' + esc(P.title) + '</h3><span class="mono">' + act.length + ' active</span></div>' +
    '<p class="panel-desc">' + esc(P.desc) + '</p>';
  if (isOwner()) h +=
    '<div class="dform">' +
    '<div class="fld code"><label for="dir-' + kind + '-code">Code</label><input id="dir-' + kind + '-code" data-form="' + kind + '" data-field="code" value="' + esc(f.code) +
    '" placeholder="' + esc(P.codePh) + '" maxlength="' + (kind === 'mode' ? 2 : 4) + '" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>' +
    '<div class="fld"><label for="dir-' + kind + '-name">' + esc(P.nameLabel) + '</label><input id="dir-' + kind + '-name" data-form="' + kind + '" data-field="name" value="' + esc(f.name) +
    '" placeholder="' + esc(P.namePh) + '" autocomplete="off"></div>' +
    (P.detailLabel ? '<div class="fld"><label for="dir-' + kind + '-detail">' + esc(P.detailLabel) + '</label><input id="dir-' + kind + '-detail" data-form="' + kind + '" data-field="detail" value="' + esc(f.detail) +
      '" placeholder="' + esc(P.detailPh) + '" autocomplete="off"></div>' : '') +
    (P.trade ? '<div class="fld fld-trade"><label for="tp-add-' + kind + '">Trade</label>' + tradePickHtml('add-' + kind) + '</div>' : '') +
    (P.location ? '<div class="fld"><label for="dir-' + kind + '-location">Location</label><input id="dir-' + kind + '-location" data-form="' + kind + '" data-field="location" value="' + esc(f.location || '') + '" placeholder="E-City" autocomplete="off"></div>' : '') +
    '<button type="button" class="btn-accent" data-act="dir-add" data-kind="' + kind + '">Add</button></div>' +
    '<div class="dmsg" id="dmsg-' + kind + '">' + dirMsgHtml(kind) + '</div>';
  h += '<div>' + act.map((k) => (S.dirEdit && S.dirEdit.kind === kind && S.dirEdit.code === k ? editRowHtml(kind) : rowHtml(kind, k, store[k])) +
    (kind === 'project' && S.projEdit && S.projEdit.code === k ? projInfoFormHtml(k) : '')).join('') + '</div>';
  if (!act.length) h += '<p class="empty">Nothing here yet.</p>';
  if (arch.length) {
    h += '<div style="border-top:1px solid #E6E7E2;display:flex;flex-direction:column">' +
      '<button type="button" class="toggle-link" data-act="dir-arch" data-kind="' + kind + '" aria-expanded="' + open + '">' + chev(open) + 'Archived (' + arch.length + ')</button>';
    if (open) {
      h += arch.map((k) => {
        const r = store[k], n = usage(kind, k);
        return '<div class="drow arch"><div class="drow-view"><span class="code-tag arch">' + esc(k) + '</span>' +
          '<div class="drow-text"><b>' + esc(LC.cap(recName(kind, r))) + '</b><span>' + esc(PANELS[kind].detailOf(r, k)) + ' · ' + plural(n, 'entry', 'entries') + '</span></div>' +
          (isOwner() ? '<button type="button" class="btn-sm" data-act="dir-restore" data-kind="' + kind + '" data-code="' + esc(k) + '" aria-label="Restore ' + esc(k) + '">Restore</button>' : '') + '</div></div>';
      }).join('');
    }
    h += '</div>';
  }
  return h + '</div>';
}

function renderDir() {
  const intro = isOwner()
    ? 'These are the codes you type. Anything you add works in the code box straight away. A code already used in entries can be archived but not deleted: it stops working for new entries, old entries keep the name, and you can restore it any time from the Archived list. A code with no entries can be deleted.'
    : canWrite()
      ? 'These are the codes you can type in the code box. Only an owner can add or change them.'
      : 'These are the codes used in the ledger’s entries. Only an owner can add or change them.';
  $('view-dir').innerHTML =
    '<div style="display:flex;flex-direction:column;gap:4px"><h2 id="dir-h" style="font-size:22px">Directory</h2>' +
    '<p class="dir-intro">' + esc(intro) + '</p></div>' +
    '<div class="panels">' + KINDS.map(panelHtml).join('') + teamPanelHtml() + (canWrite() ? alertsPanelHtml() : '') + devicesPanelHtml() + '</div>' +
    '<datalist id="tradeList">' + allTrades().map((t) => '<option value="' + esc(t) + '">').join('') + '</datalist>';
}

/* ---------- morning alerts (owners: everything; contributors: their own devices) ---------- */
// Morning alerts. The test app (no CONFIG.firebase) sends nothing: it shows the preview only.
function alertsPanelHtml() {
  const owner = isOwner();
  const preview = owner ? '<div class="brief-prev"><button type="button" class="btn-outline" data-act="brief-preview">What today’s 7:00 alert says</button>' +
    (S.briefs ? S.briefs.map((b) => '<div class="brief"><b>' + esc(b.name) + '</b> <span class="muted small">' + esc(b.email) + '</span>' +
      '<div class="brief-card"><div class="brief-title">' + esc(b.title) + '</div><pre>' + esc(b.body) + '</pre></div>' +
      (b.total ? '' : '<span class="muted small">Nothing due: on a normal morning nothing is sent.</span>') + '</div>').join('') : '') + '</div>' : '';
  if (!CONFIG.firebase) {
    return '<div class="panel alerts-panel"><div class="panel-head"><h3>Morning alerts</h3></div>' +
      '<p class="panel-desc">Every day at 7:00 IST each person gets their own alert, grouped by project: tasks late or due today, queries waiting for a reply, sites with no photos for 3 days. Site engineers only get their own tasks, never amounts. ' +
      '<b>The test app never sends alerts</b>; here you can see what they would say.</p>' + preview + '</div>';
  }
  const a = (S.data && S.data.alerts) || { devices: [] };
  const devs = a.devices.map((d) => {
    const conf = S.confirmDel === 'dev:' + d.id;
    return '<div class="drow"><div class="drow-view"><div class="drow-text"><b>' + esc(d.name || 'Device') + '</b><span>' +
      (owner ? esc(d.email) + ' · ' : '') + 'added ' + esc(d.added) + (owner && d.pending ? ' · not in the Devices tab yet' : '') + '</span></div>' +
      '<button type="button" class="btn-sm' + (conf ? ' btn-danger' : '') + '" data-act="dev-remove" data-id="' + esc(d.id) + '">' + (conf ? 'Confirm remove?' : 'Remove') + '</button></div></div>';
  }).join('');
  return '<div class="panel alerts-panel"><div class="panel-head"><h3>Morning alerts</h3><span class="mono">' +
    plural(a.devices.length, owner ? 'device' : 'device of yours', owner ? 'devices' : 'devices of yours') + '</span></div>' +
    '<p class="panel-desc">Every day at 7:00 IST each person gets their own alert, grouped by project: tasks late or due today' +
    (owner ? ', queries waiting for a reply, sites with no photos for 3 days. Site engineers only get their own tasks.' : '.') + ' No amounts. Days with nothing due are skipped.</p>' + preview +
    (owner
      ? '<div class="alerts-status"><span>Firebase key: <b>' + (a.configured ? 'set (' + esc(a.project) + ')' : 'not set yet') + '</b></span>' +
        (a.lastBrief ? '<span>Last morning brief: ' + esc(a.lastBrief) + '</span>' : '') + '</div>' +
        '<div class="fld"><label for="alertsKey">' + (a.configured ? 'Replace' : 'Upload') + ' the Firebase service-account key (.json)</label>' +
        '<input type="file" id="alertsKey" accept=".json,application/json"></div>'
      : '') +
    (S.alertsErr ? '<p class="err" role="alert">' + esc(S.alertsErr) + '</p>' : '') +
    '<div>' + (devs || '<p class="empty">No devices yet. Use “Turn on alerts on this device” on each phone or laptop.</p>') + '</div>' +
    '<div class="pf-actions"><button type="button" class="btn-accent" data-act="test-alert"' + (S.sendingTest ? ' disabled' : '') + '>' +
    (S.sendingTest ? 'Sending…' : owner ? 'Send test alert' : 'Send test alert to my devices') + '</button>' +
    '<button type="button" class="btn-outline" data-act="alerts-on">Turn on alerts on this device</button></div>' +
    (owner ? '<p class="panel-desc">“Send test alert” goes to owners’ devices. Contributors can test their own from their app.</p>' : '') + '</div>';
}

function addCodeFromForm(kind) {
  const f = S.forms[kind];
  if (PANELS[kind].trade && !tradeTypedOk('add-' + kind)) { S.errs[kind] = 'Pick one of the trades offered, or add yours as a new trade.'; $('dmsg-' + kind).innerHTML = dirMsgHtml(kind); return; }
  const code = f.code.trim().toUpperCase(), name = f.name.trim(), detail = f.detail.trim(), trade = PANELS[kind].trade ? f.trades.join(' · ') : '';
  const issue = LC.codeIssue(kind, code, S.dir, null);
  if (issue) { S.errs[kind] = issue; $('dmsg-' + kind).innerHTML = dirMsgHtml(kind); return; }
  if (!name && kind !== 'project') { S.errs[kind] = kind === 'mode' ? 'Give the mode a label.' : 'Give it a name.'; $('dmsg-' + kind).innerHTML = dirMsgHtml(kind); return; }
  call('addCode', [kind, code, name, detail, trade, kind === 'project' ? f.location.trim() : ''], () => {
    S.forms[kind] = blankForm();
    S.errs[kind] = '';
    snack(code + ' added. It works in the code box now.');
  }, (msg) => { S.errs[kind] = msg; });
}

function startDirEdit(kind, code) {
  const r = LC.storeFor(S.dir, kind)[code];
  if (!r) return;
  S.dirEdit = {
    kind: kind, code: code, newCode: code, name: recName(kind, r) || '',
    detail: kind === 'project' ? (r.client || '') : '', trades: LC.tradesOf(tradeOf(code)), tradeTyped: '',
    location: kind === 'project' ? ((projInfo(code) || {}).location || '') : '', err: ''
  };
}

function saveDirEdit() {
  const ed = S.dirEdit;
  if (!ed) return;
  if (PANELS[ed.kind].trade && !tradeTypedOk('edit')) { ed.err = 'Pick one of the trades offered, or add yours as a new trade.'; renderAll(); return; }
  const nu = ed.newCode.trim().toUpperCase(), name = ed.name.trim(), detail = ed.detail.trim();
  const issue = nu !== ed.code ? LC.codeIssue(ed.kind, nu, S.dir, ed.code) : '';
  if (issue || (!name && ed.kind !== 'project')) {
    ed.err = issue || 'The name can’t be empty.';
    $('editMsg').innerHTML = editMsgHtml();
    return;
  }
  const old = ed.code, kind = ed.kind;
  const hadFilter = kind === 'project' && S.project === old;
  call('editCode', [kind, old, nu, name, PANELS[kind].trade ? null : detail, PANELS[kind].trade ? ed.trades.join(' · ') : null, kind === 'project' ? String(ed.location || '').trim() : null], (res) => {
    S.dirEdit = null;
    if (nu !== old) {
      if (hadFilter) S.project = nu;
      if (kind === 'project' && S.pf.project === old) S.pf.project = nu;
      if ((kind === 'labour' || kind === 'vendor') && S.pf.who === old) S.pf.who = nu;
      snack(old + ' is now ' + nu + (res.moved ? ' in ' + plural(res.moved, 'entry', 'entries') + '.' : '.'));
    } else {
      snack(nu + ' saved.');
    }
  }, (msg) => { if (S.dirEdit) S.dirEdit.err = msg; });
}

// A code no entry uses can be deleted; projects only by Shruthi (others archive them).
function canDelete(kind, code) {
  return usage(kind, code) === 0 && (kind !== 'project' || !!(S.data && S.data.canDeleteProjects));
}
function removeCode(kind, code, prevDel) {
  if (!canDelete(kind, code)) {
    if (S.dirEdit && S.dirEdit.code === code) S.dirEdit = null;
    call('archiveCode', [kind, code], () => {
      if (kind === 'project' && S.project === code) S.project = null;
      snack(code + ' archived. Old entries keep the name; restore it from Archived any time.');
    });
  } else if (prevDel === kind + ':' + code) {
    if (S.dirEdit && S.dirEdit.code === code) S.dirEdit = null;
    call('deleteCode', [kind, code], () => snack(code + ' deleted.'));
  } else {
    S.confirmDel = kind + ':' + code;
  }
}

/* ---------- print ---------- */
// The print panel: numbered choices on the left, a live preview of the printed page on the right.
// The preview and the printed sheet are built by the same sheetHtml(), so what you see is what prints.
// All choices are remembered on this device.
const PRINT_KEY = 'ofLedger.print';
const PERIODS = [['week', 'This week'], ['month', 'This month'], ['last', 'Last month'], ['all', 'All time'], ['custom', 'Custom…']];
const PRINTER_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6V2h8v4M4 12H2.5V6.5h11V12H12M4 9.5h8V14H4z"></path></svg>';

function loadPrintChoices() {
  try {
    const saved = JSON.parse(localStorage.getItem(PRINT_KEY) || 'null') || {};
    const older = JSON.parse(localStorage.getItem('ofLedger.printPage') || '{}'); // paper/orientation from the previous panel
    const paper = saved.paper || older.paper, orient = saved.orient || older.orient;
    if (PAPERS.indexOf(paper) >= 0) S.paper = paper;
    if (ORIENTS.indexOf(orient) >= 0) S.orient = orient;
    if (saved.pf) {
      const pf = Object.assign(blankPf(), saved.pf);
      pf.types = Object.assign(blankPf().types, saved.pf.types || {});
      pf.modes = Object.assign({}, saved.pf.modes || {});
      if (!PERIODS.some((p) => p[0] === pf.period)) pf.period = 'month';
      S.pf = pf;
    }
  } catch (_) { /* storage blocked: keep defaults */ }
}
function savePrintChoices() {
  try { localStorage.setItem(PRINT_KEY, JSON.stringify({ pf: S.pf, paper: S.paper, orient: S.orient })); } catch (_) { /* ignore */ }
}

function periodRange() {
  const pf = S.pf, t = todayIso(), d = LC.fromIso(t);
  if (pf.period === 'week') return { from: addDays(t, -6), to: t };
  if (pf.period === 'month') return { from: LC.iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: LC.iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  if (pf.period === 'last') return { from: LC.iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: LC.iso(new Date(d.getFullYear(), d.getMonth(), 0)) };
  if (pf.period === 'custom') return { from: pf.from, to: pf.to };
  return { from: '', to: '' };
}
function rangeLabel(from, to) {
  if (!from && !to) return '';
  if (from && !to) return 'From ' + niceY(from);
  if (!from && to) return 'Up to ' + niceY(to);
  if (from > to) return 'From is after To';
  const a = LC.fromIso(from), b = LC.fromIso(to);
  if (from === to) return niceY(from);
  if (a.getFullYear() === b.getFullYear()) {
    if (a.getMonth() === b.getMonth()) return a.getDate() + ' – ' + b.getDate() + ' ' + MON[b.getMonth()] + ' ' + b.getFullYear();
    return a.getDate() + ' ' + MON[a.getMonth()] + ' – ' + niceY(to);
  }
  return niceY(from) + ' – ' + niceY(to);
}
function periodText() {
  if (S.pf.period === 'all') return 'Every entry on record';
  const r = periodRange();
  return rangeLabel(r.from, r.to) || 'Pick From and To dates';
}

// Modes: every active mode, plus archived modes that entries still use.
function printModes() {
  const used = {};
  S.entries.forEach((e) => { if (e.mode) used[e.mode] = true; });
  return Object.keys(S.dir.modes).filter((k) => S.dir.modes[k].active || used[k]);
}
function modeOn(code) { return S.pf.modes[code] !== false; }
function allModesOn() { return printModes().every(modeOn) && S.pf.noMode; }
function titleCase(s) { return String(s).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()); }
function modeLabelOf(code) { return String(LC.modeLabel(S.dir, code) || code).trim(); }
// Cash: any mode whose label starts with "Cash" (plain Cash is "Me"). Bank: Direct and Transfer. Other: the rest.
function modeGroup(code) {
  const lab = modeLabelOf(code);
  if (/^cash\b/i.test(lab)) return 'Cash';
  if (/^(direct|transfer)$/i.test(lab)) return 'Bank';
  return 'Other';
}
// The name after "Cash" is a person ("CASH SAVAN" → "Savan"); other labels keep their own case ("UPI").
function cashRest(lab) { return titleCase(lab.replace(/^cash\b[\s:·\-]*/i, '').trim()); }
function modeChipLabel(code) {
  const lab = modeLabelOf(code);
  if (/^cash\b/i.test(lab)) return cashRest(lab) || 'Me';
  return LC.cap(lab);
}
function modeFull(code) {
  if (!code) return 'No mode';
  const lab = modeLabelOf(code);
  if (/^cash\b/i.test(lab)) return cashRest(lab) ? 'Cash ' + cashRest(lab) : 'Cash';
  return LC.cap(lab);
}

function printList() {
  const pf = S.pf, r = periodRange();
  return live().filter((e) => pf.types[e.type] &&
    (isTask(e) || (e.mode ? modeOn(e.mode) : pf.noMode)) &&
    (!pf.project || e.project === pf.project) && (!pf.who || e.who === pf.who) &&
    (!r.from || sitsOn(e) >= r.from) && (!r.to || sitsOn(e) <= r.to))
    .sort((a, b) => (sitsOn(a) < sitsOn(b) ? -1 : sitsOn(a) > sitsOn(b) ? 1 : a.created_at < b.created_at ? -1 : 1));
}
function sums(list) {
  let paid = 0, received = 0;
  list.forEach((e) => { if (e.type === 'P') paid += e.amount; else if (e.type === 'R') received += e.amount; });
  return { paid: paid, received: received, net: received - paid };
}
// Paid / received per mode (P and R only), in the order of the mode chips, "No mode" last.
function modeTotals(list) {
  const m = {}, order = printModes();
  list.forEach((e) => {
    if (e.type !== 'P' && e.type !== 'R') return;
    const k = e.mode || '';
    m[k] = m[k] || { paid: 0, received: 0 };
    if (e.type === 'P') m[k].paid += e.amount; else m[k].received += e.amount;
  });
  return Object.keys(m).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : order.indexOf(a) - order.indexOf(b)))
    .map((k) => ({ code: k, name: modeFull(k), paid: m[k].paid, received: m[k].received }));
}
function whoLabel(code) {
  if (!code) return 'Everyone';
  if (code === LC.CLIENT) return S.pf.project ? LC.clientName(S.dir, S.pf.project) : 'Clients';
  const p = S.dir.people[code];
  return p ? p.name : code;
}
// Rough page count for the preview header (rows that fit per printed page).
function pageEstimate(n) {
  const per = { A4portrait: 30, A4landscape: 18, A3portrait: 46, A3landscape: 30 }[S.paper + S.orient] || 30;
  return n <= per ? 1 : 1 + Math.ceil((n - per) / (per + 6));
}

function sheetHtml(list) {
  const pf = S.pf, s = sums(list), wide = S.orient === 'landscape' || S.paper === 'A3';
  const types = TYPE_ORDER.filter((t) => pf.types[t]).map((t) => PRINT_TYPE_LABELS[t]);
  const sub = [types.length ? types.join(', ') : 'Nothing selected', periodText(), whoLabel(pf.who)].join(' · ');
  const tiles = [];
  if (pf.types.P) tiles.push(['Paid', LC.inr(s.paid)]);
  if (pf.types.R) tiles.push(['Received', LC.inr(s.received)]);
  if (pf.types.P && pf.types.R) tiles.push(['Net', LC.inr(s.net)]);
  if (pf.types.F || pf.types.MT) tiles.push(['Tasks', String(list.filter(isTask).length)]);
  const byMode = modeTotals(list).map((m) => {
    const bits = [];
    if (pf.types.P && pf.types.R) {
      if (m.paid) bits.push(LC.inr(m.paid) + ' paid');
      if (m.received) bits.push(LC.inr(m.received) + ' received');
    } else bits.push(LC.inr(m.paid + m.received));
    return '<span>' + esc(m.name) + ' <span class="v">' + esc(bits.join(' · ')) + '</span></span>';
  });
  const years = {};
  list.forEach((e) => { years[sitsOn(e).slice(0, 4)] = true; });
  const showYear = Object.keys(years).length > 1;
  const rows = list.map((e) => '<tr><td class="d">' + esc(showYear ? niceY(sitsOn(e)) : LC.nice(sitsOn(e))) + '</td>' +
    '<td><span class="sh-badge t-' + e.type + '">' + e.type + '</span>' + esc(LC.describe(S.dir, e)) + (pf.project ? '' : ' · ' + esc(projName(e.project))) + '</td>' +
    (wide ? '<td class="m">' + (isTask(e) ? '' : esc(modeFull(e.mode))) + '</td>' : '') +
    '<td class="num">' + (isTask(e) ? '—' : esc(LC.inr(e.amount))) + '</td></tr>').join('');
  return '<div class="sh-head">' + (LOGO_URL ? '<img class="sh-logo" src="' + esc(LOGO_URL) + '" alt="O F Turnkey">' : '') +
    '<div class="sh-titles"><span class="sh-title">' + esc(pf.project ? projName(pf.project) : 'All projects') +
    (pf.project && S.dir.projects[pf.project].client ? '<span class="sh-client"> · Client: ' + esc(S.dir.projects[pf.project].client) + '</span>' : '') +
    '</span><span class="sh-sub">' + esc(sub) + '</span></div>' +
    '<span class="sh-date">Printed ' + esc(niceY(todayIso())) + '</span></div>' +
    (tiles.length ? '<div class="sh-tiles">' + tiles.map((t) => '<div class="sh-tile"><span>' + t[0] + '</span><b>' + esc(t[1]) + '</b></div>').join('') + '</div>' : '') +
    (byMode.length ? '<div class="sh-modes"><b>By mode</b>' + byMode.join('') + '</div>' : '') +
    (list.length
      ? '<table class="sh-table"><thead><tr><th scope="col">Date</th><th scope="col">Details</th>' + (wide ? '<th scope="col">Mode</th>' : '') +
        '<th scope="col" class="num">Amount</th></tr></thead><tbody>' + rows + '</tbody></table>'
      : '<p class="sh-empty">Nothing matches these choices.</p>');
}

function choiceChip(cls, on, act, v, label, extra) {
  return '<button type="button" class="' + cls + (on ? ' on' : '') + '" id="' + act + '-' + esc(v || 'none') + '" data-act="' + act + '" data-v="' + esc(v) + '" aria-pressed="' + on + '"' + (extra || '') + '>' + label + '</button>';
}

function renderPrint() {
  const panel = $('printPanel');
  $('printToggle').textContent = S.print ? 'Close print' : 'Print sheets';
  panel.hidden = !S.print;
  applyPageSize();
  if (!S.print) { $('printSheet').innerHTML = ''; return; }
  const pf = S.pf;
  if (pf.project && !S.dir.projects[pf.project]) pf.project = '';
  if (pf.who && !S.dir.people[pf.who]) pf.who = '';
  const list = printList(), n = list.length, pages = pageEstimate(n);
  const money = pf.types.P || pf.types.R;
  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>';
  const projOpts = opt('', 'All projects', pf.project) + Object.keys(S.dir.projects).map((k) => opt(k, k + ' · ' + S.dir.projects[k].name + (S.dir.projects[k].active ? '' : ' (archived)'), pf.project)).join('');
  const whoOpts = opt('', 'Everyone', pf.who) + Object.keys(S.dir.people).filter((k) => k !== LC.CLIENT).map((k) => {
    const p = S.dir.people[k];
    return opt(k, p.name + (p.detail ? ' · ' + p.detail : '') + (p.active ? '' : ' (archived)'), pf.who);
  }).join('') + opt(LC.CLIENT, 'Client (CL)', pf.who);

  const periods = PERIODS.map((p) => choiceChip('pp-chip', pf.period === p[0], 'pp-period', p[0], esc(p[1]))).join('');
  const custom = pf.period === 'custom'
    ? '<div class="pp-row"><div class="pp-fld"><label for="pf-from">From</label><input id="pf-from" type="date" data-pf="from" value="' + esc(pf.from) + '"></div>' +
      '<div class="pp-fld"><label for="pf-to">To</label><input id="pf-to" type="date" data-pf="to" value="' + esc(pf.to) + '"></div></div>'
    : '';
  const types = TYPE_ORDER.map((t) => choiceChip('pp-chip pp-type', !!pf.types[t], 'pp-type', t,
    '<span class="tb t-' + t + '">' + t + '</span>' + esc(PRINT_TYPE_LABELS[t]))).join('');
  const dis = money ? '' : ' disabled';
  const groups = ['Cash', 'Bank', 'Other'].map((g) => {
    const items = printModes().filter((k) => modeGroup(k) === g)
      .map((k) => choiceChip('pp-mode', modeOn(k), 'pp-mode', k, esc(modeChipLabel(k)) + (S.dir.modes[k].active ? '' : ' (archived)'), dis + ' title="' + esc(modeFull(k)) + '"'));
    if (g === 'Other') items.push(choiceChip('pp-mode', pf.noMode, 'pp-mode', '', 'No mode', dis));
    return items.length ? '<div class="pp-mode-row"><span>' + g + '</span>' + items.join('') + '</div>' : '';
  }).join('');
  const papers = PAPERS.map((p) => choiceChip('', S.paper === p, 'pp-paper', p, p)).join('');
  const orients = ORIENTS.map((o) => choiceChip('pp-orient', S.orient === o, 'pp-orient', o, '<i class="' + o + '" aria-hidden="true"></i>' + (o === 'portrait' ? 'Portrait' : 'Landscape'))).join('');

  panel.innerHTML =
    '<div class="pp-head"><div class="pp-titles"><h2 id="print-h">Print a sheet</h2><span>Choose what goes on the page. The preview updates as you go.</span></div>' +
    '<div class="spacer"></div>' +
    '<button type="button" class="pp-close" data-act="print-toggle">Close</button>' +
    '<button type="button" class="pp-print" id="pp-print" data-act="print-go"' + (n ? '' : ' disabled') + '>' + PRINTER_ICON + 'Print ' + plural(n, 'entry', 'entries') + '</button></div>' +
    '<div class="pp-body"><div class="pp-left">' +
    '<div class="pp-sec"><span class="pp-step">1 · Whose entries</span><div class="pp-row">' +
    '<div class="pp-fld"><label for="pf-project">Project</label><select id="pf-project" data-pf="project">' + projOpts + '</select></div>' +
    '<div class="pp-fld"><label for="pf-who">Person or vendor</label><select id="pf-who" data-pf="who">' + whoOpts + '</select></div></div></div>' +
    '<div class="pp-sec"><span class="pp-step">2 · Period</span><div class="pp-chips" role="group" aria-label="Period">' + periods + '</div>' +
    '<span class="pp-note">' + esc(periodText()) + '</span>' + custom + '</div>' +
    '<div class="pp-sec"><span class="pp-step">3 · Show</span><div class="pp-chips" role="group" aria-label="Entry types">' + types + '</div></div>' +
    '<div class="pp-sec pp-modes' + (money ? '' : ' off') + '"><div class="pp-step-row"><span class="pp-step">4 · Payment mode</span>' +
    '<button type="button" class="pp-link" id="pp-modes-all" data-act="pp-modes-all"' + dis + '>' + (allModesOn() ? 'Clear all' : 'Select all') + '</button></div>' +
    (money ? '' : '<span class="pp-note">Only applies to Paid and Received.</span>') +
    '<div class="pp-mode-box" role="group" aria-label="Payment modes">' + groups + '</div></div>' +
    '<div class="pp-sec"><span class="pp-step">5 · Page</span><div class="pp-row pp-center">' +
    '<div class="pp-seg" role="group" aria-label="Paper size">' + papers + '</div>' +
    '<div class="pp-orients" role="group" aria-label="Orientation">' + orients + '</div></div>' +
    '<span class="pp-note">Pick the same size and orientation in the print dialog.</span></div>' +
    '</div>' +
    '<div class="pp-right"><div class="pp-meta"><span>Preview · ' + S.paper + ' ' + S.orient + '</span><span>' + plural(n, 'entry', 'entries') + ' · ' +
    (pages === 1 ? '1 page' : 'about ' + pages + ' pages') + '</span></div>' +
    '<div class="pv-page paper-' + S.paper + ' ' + S.orient + '" role="img" aria-label="Preview of the first printed page">' +
    '<div class="sheet">' + sheetHtml(list) + '</div>' +
    '<div class="pv-foot"><span>O F Turnkey · Site ledger</span><span>Page 1 of ' + pages + '</span></div></div></div></div>';

  $('printSheet').className = 'print-sheet sheet paper-' + S.paper + ' ' + S.orient;
  $('printSheet').innerHTML = sheetHtml(list);
}

/* ---------- projects (Phase 2): stages, project tabs, overview ---------- */
const STAGE_LABEL = { design: 'Design', execution: 'Execution', handover: 'Handover', archive: 'Archive' };
const SCHEDULE_LABEL = { full: 'Full schedule', light: 'Light schedule', none: 'No schedule yet' };
// Sections per stage. [key, label, ready in this version]. Later steps switch the others on.
const SECTIONS = {
  design: [['overview', 'Overview', true], ['drawings', 'Drawings', false], ['queries', 'Queries', true]],
  execution: [['overview', 'Overview', true], ['schedule', 'Schedule', false], ['site', 'Site', true], ['queries', 'Queries', true],
    ['budget', 'Budget', false], ['bills', 'Bills', false], ['drawings', 'Drawings', false], ['visits', 'Site visits', false]],
  handover: [['overview', 'Overview', true]],
  archive: [['overview', 'Overview', true]]
};
const TRADES = ['POP', 'Carpentry', 'Painting', 'Specialist finishes', 'Flooring', 'Aluminium & glass', 'Lighting', 'Metal ceiling',
  'Signage', 'Tiling', 'Plumbing', 'Furniture', 'Others'];

function projInfo(code) { return ((S.data && S.data.projects) || []).find((p) => p.code === code) || null; }
// Day 1 is the real site start once set, else the planned start. Plan days count from it.
function day1Of(p) { return p.day1 || p.plannedStart || ''; }
function dayDate(p, n) { const d1 = day1Of(p); return d1 && n ? addDays(d1, n - 1) : ''; }
function dayNumber(p, iso) {
  const d1 = day1Of(p);
  if (!d1) return null;
  return Math.round((LC.fromIso(iso) - LC.fromIso(d1)) / 86400000) + 1;
}
function niceDay(s) { const d = LC.fromIso(s); return WDS[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
function engineersOf(code) { return ((S.data && S.data.users) || []).filter((u) => u.role === 'site_engineer' && (u.projects || []).indexOf(code) >= 0); }
function liveProjects() {
  const order = { execution: 0, design: 1, handover: 2 };
  return ((S.data && S.data.projects) || []).filter((p) => p.active && p.stage !== 'archive')
    .sort((a, b) => (order[a.stage] - order[b.stage]) || (a.code < b.code ? -1 : 1));
}
function stagePill(stage) { return '<span class="stage-pill st-' + esc(stage) + '">' + esc(STAGE_LABEL[stage] || stage) + '</span>'; }
// "Execution · Day 38 of 113 · Handover Sun 7 Feb · Site engineer Venky"
// The project is called by its code everywhere; the site name (its location, e.g. E-City) leads this line.
function projectLine(p) {
  const bits = [STAGE_LABEL[p.stage]];
  const t = todayIso(), n = dayNumber(p, t);
  if (p.stage === 'execution' && n !== null) {
    if (n < 1) bits.push((p.day1 ? 'Site starts ' : 'Planned start ') + niceDay(day1Of(p)));
    else bits.push('Day ' + n + (p.handoverDay ? ' of ' + p.handoverDay : ''));
  }
  if (p.handoverDay && day1Of(p)) bits.push('Handover ' + niceDay(dayDate(p, p.handoverDay)));
  const eng = engineersOf(p.code);
  if (eng.length) bits.push('Site engineer ' + eng.map((u) => u.name).join(', '));
  return bits.join(' · ');
}

function renderProjectsView() {
  if (!S.queries && !S.queriesLoading) { S.queriesLoading = true; loadQueries(() => { S.queriesLoading = false; }); }
  const list = liveProjects();
  // First tab: Today, everything that needs you across all projects.
  if (!S.projTab || (S.projTab !== '_today' && !list.some((p) => p.code === S.projTab))) S.projTab = '_today';
  const p = projInfo(S.projTab);
  const tabs = list.map((x) => '<button type="button" class="ptab' + (x.code === S.projTab ? ' on' : '') + '" data-act="proj-tab" data-code="' + esc(x.code) +
    '" aria-pressed="' + (x.code === S.projTab) + '"><span class="ptab-name">' + esc(x.name || x.code) + '</span>' + stagePill(x.stage) +
    (isOwner() && hasNeeds(x.code) ? '<span class="red-dot" title="Needs you"></span>' : '') + '</button>').join('');
  const todayTab = '<button type="button" class="ptab' + (S.projTab === '_today' ? ' on' : '') + '" data-act="proj-tab" data-code="_today" aria-pressed="' + (S.projTab === '_today') + '"><span class="ptab-name">Today</span></button>';
  if (!p) {
    $('view-projects').innerHTML = '<nav class="ptabs" aria-label="Projects">' + todayTab + tabs + '</nav>' + (list.length ? todayAllHtml(list) : '<p class="empty">No live projects. Add one in Directory → Projects.</p>');
    return;
  }
  const secs = SECTIONS[p.stage] || SECTIONS.execution;
  if (!S.projSec || !secs.some((s) => s[0] === S.projSec && s[2])) S.projSec = 'overview';
  const nav = secs.map((s) => s[2]
    ? '<button type="button" class="psec' + (S.projSec === s[0] ? ' on' : '') + '" data-act="proj-sec" data-sec="' + s[0] + '" aria-pressed="' + (S.projSec === s[0]) + '">' + esc(s[1]) + '</button>'
    : '<span class="psec off" title="Comes in a later step">' + esc(s[1]) + '</span>').join('');
  $('view-projects').innerHTML =
    '<nav class="ptabs" aria-label="Projects">' + todayTab + tabs + '</nav>' +
    '<div class="phead"><h2 id="proj-h" class="view-title">' + esc(p.name || p.code) + '</h2>' + placeLine(p) +
    '<div class="psub">' + esc(projectLine(p)) + '</div></div>' +
    '<nav class="psecs" aria-label="Project sections">' + nav + '</nav>' +
    (S.projSec === 'site' ? projectSiteHtml(p) : S.projSec === 'queries' ? projectQueriesHtml(p) : projectOverviewHtml(p));
}

// Today across all projects (the morning view): each project's Needs you items, Everyone or Just mine.
function todayAllHtml(list) {
  const mine = !!S.todayMine;
  const groups = list.map((p) => {
    let items = needsFor(p.code);
    if (mine) items = items.filter((n) => n.act === 'needs-query' || (n.act === 'done' && isMine(findEntry(n.id) || {})));
    const shown = items.slice(0, 5);
    return '<section class="card tday"><button type="button" class="tday-h" data-act="proj-tab" data-code="' + esc(p.code) + '"><b>' + esc(p.name || p.code) + '</b><span class="muted small">' + esc(projectLine(p)) + '</span></button>' +
      (shown.length ? shown.map((n) => needLineHtml(n, n.act === 'needs-query' ? 'today-query' : 'done', p.code)).join('') : '<p class="empty">Nothing urgent.</p>') +
      (items.length > shown.length ? '<p class="muted small">+ ' + (items.length - shown.length) + ' more · open the project</p>' : '') + '</section>';
  }).join('');
  return '<div class="phead"><h2 id="proj-h" class="view-title">Today <span class="muted" style="font-size:16px;font-weight:400">' + esc(niceDay(todayIso())) + '</span></h2></div>' +
    '<div class="seg" role="group" aria-label="Whose items" style="margin:10px 0"><button type="button" class="seg-b' + (!mine ? ' on' : '') + '" data-act="today-mine" data-v="">Everyone</button>' +
    '<button type="button" class="seg-b' + (mine ? ' on' : '') + '" data-act="today-mine" data-v="1">Just mine</button></div>' + groups;
}

// The project's own code bar: the project code is filled in, so "MT 26/11 check cove gap" or "P ALM 12k C" is enough.
function projCodeFull(raw, proj) {
  const t = String(raw || '').trim().split(/\s+/).filter(Boolean);
  if (!t.length) return '';
  if (LC.TYPES[t[0].toUpperCase()] && (t[1] || '').toUpperCase() !== proj) t.splice(1, 0, proj);
  return t.join(' ');
}
function projCodePreview(proj) {
  const full = projCodeFull(S.pcode, proj);
  const r = LC.parse(full, { dir: S.dir, sel: todayIso() });
  S.pcodeParsed = r;
  const chips = r.tokens.map((x) => '<div class="tk ' + (x.ok ? 'ok' : 'bad') + '"><b>' + esc(x.txt) + '</b><span>' + esc(x.ok ? x.meaning : '? ' + x.meaning) + '</span></div>').join('') +
    (r.hint ? '<div class="hint">Next: ' + esc(r.hint) + '</div>' : '');
  return (full ? '<div class="chips">' + chips + '</div>' : '') + (r.entry ? '<div class="pv-line">' + badge(r.entry.type) + '<span class="pv-sent">' + esc(LC.describe(S.dir, r.entry)) + '</span></div>' : '');
}
function projCodeSave(proj) {
  const r = S.pcodeParsed;
  if (!r || !r.ready) { snack(r && r.problem ? r.problem : 'Type a code first.', { error: true }); return; }
  const full = projCodeFull(S.pcode, proj);
  call('addEntry', [full, todayIso()], (res) => {
    S.pcode = ''; S.pcodeParsed = null;
    const e = findEntry(res.id);
    snack('Saved: ' + (e ? shortLine(e) : full), { undoId: res.id });
  });
}

function projectOverviewHtml(p) {
  const pbar = canWrite() ? '<div class="card pbar"><div class="pbar-row"><label for="projBar" class="sr-only">Quick entry for ' + esc(p.code) + '</label>' +
    '<input id="projBar" data-pcode="' + esc(p.code) + '" value="' + esc(S.pcode || '') + '" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Type anything for ' + esc(p.code) + ', e.g. MT 26/11 check cove gap  or  P ALM 12k C">' +
    '<button type="button" class="btn-save" data-act="pcode-save" data-code="' + esc(p.code) + '">Add</button></div>' +
    '<div id="pcodePreview" class="pbar-prev">' + projCodePreview(p.code) + '</div></div>' : '';
  const needs = pbar + needsHtml(p.code);
  if (p.stage === 'execution' && S.photosFor !== p.code) { S.photosFor = p.code; S.photos = null; S.photoSel = ''; loadPhotos(p.code); }
  const latest = S.photos && S.photos.project === p.code ? S.photos.photos.slice(0, 4) : [];
  const photos = p.stage !== 'execution' ? '' : '<section class="card" aria-labelledby="lp-h"><div class="sec-head"><h3 id="lp-h">Latest site photos</h3>' +
    '<button type="button" class="link-btn" data-act="proj-sec" data-sec="site">All photos</button></div>' +
    (latest.length ? '<div class="ph-grid">' + latest.map((x) => '<button type="button" class="ph-tile" data-act="ph-open-site" data-id="' + esc(x.id) + '"><span class="ph-frame">' + thumbImg(x) + '</span><span class="ph-area">' + esc(x.area || '—') + ' · ' + esc(niceDay(photoDay(x.at))) + '</span></button>').join('') + '</div>'
      : '<p class="empty">' + (S.photos ? 'No site photos yet.' : 'Loading…') + '</p>') + '</section>';
  let money = '';
  if (isOwner()) {
    const got = live().filter((e) => e.type === 'R' && e.project === p.code && e.who === LC.CLIENT).reduce((s, e) => s + e.amount, 0);
    money = '<section class="card" aria-labelledby="cp-h"><div class="label-caps" id="cp-h">Client payments</div>' +
      '<div class="big-num">' + esc(LC.inr(got)) + ' <span class="muted">received from the client</span></div>' +
      '<p class="muted small">From R entries with CL in the ledger. Instalments and what’s due next come with the schedule.</p></section>';
  }
  const d1 = day1Of(p);
  const rows = [
    ['Stage', STAGE_LABEL[p.stage]],
    [p.day1 ? 'Site start (Day 1)' : 'Planned start', d1 ? niceY(d1) : 'Not set'],
    ['Target handover', p.handoverDay && d1 ? niceY(dayDate(p, p.handoverDay)) + ' · Day ' + p.handoverDay : 'Not set'],
    ['Schedule', SCHEDULE_LABEL[p.scheduleType] || SCHEDULE_LABEL.none],
    ['Site engineer', engineersOf(p.code).map((u) => u.name).join(', ') || 'None assigned']
  ];
  const details = '<section class="card" aria-labelledby="pd-h"><div class="label-caps" id="pd-h">Project</div><dl class="pdl">' +
    rows.map((r) => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('') + '</dl>' +
    (isOwner() ? '<button type="button" class="btn-outline" data-act="proj-edit-dir" data-code="' + esc(p.code) + '">Change in Directory</button>' : '') + '</section>';
  return '<div class="pgrid"><div class="pmain">' + needs + photos + '</div><div class="pside">' + money + details + '</div></div>';
}

/* ---------- Directory additions: project stage & dates, trade, team ---------- */
// Under the project heading: where it is and whose it is ("E-City · Client: Mr Rao").
function placeLine(p) {
  const bits = [p.location, p.client ? 'Client: ' + p.client : ''].filter(Boolean);
  return bits.length ? '<div class="pplace">' + esc(bits.join(' · ')) + '</div>' : '';
}
function projectDetailOf(r) {
  const p = projInfo(r.code || '') || {};
  return ['Client: ' + (r.client || '—'), p.location, p.stage ? STAGE_LABEL[p.stage] : ''].filter(Boolean).join(' · ');
}
function projInfoFormHtml(code) {
  const p = projInfo(code) || {}, f = S.projEdit;
  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>';
  return '<div class="drow pinfo"><div class="dform">' +
    '<div class="fld"><label for="pi-stage">Stage</label><select id="pi-stage" data-pi="stage">' +
    Object.keys(STAGE_LABEL).map((k) => opt(k, STAGE_LABEL[k], f.stage)).join('') + '</select></div>' +
    '<div class="fld"><label for="pi-start">' + (p.day1 ? 'Planned start (site started ' + esc(niceY(p.day1)) + ')' : 'Planned start (Day 1)') + '</label>' +
    '<input type="date" id="pi-start" data-pi="plannedStart" value="' + esc(f.plannedStart) + '"></div>' +
    '<div class="fld"><label for="pi-hand">Target handover</label><input type="date" id="pi-hand" data-pi="handover" value="' + esc(f.handover) + '"></div>' +
    '<div class="fld"><label for="pi-type">Schedule</label><select id="pi-type" data-pi="scheduleType">' +
    Object.keys(SCHEDULE_LABEL).map((k) => opt(k, SCHEDULE_LABEL[k], f.scheduleType)).join('') + '</select></div>' +
    '<button type="button" class="btn-accent" data-act="pi-save">Save</button>' +
    '<button type="button" class="btn-outline" data-act="pi-cancel">Cancel</button>' +
    (f.err ? '<p class="err" role="alert" style="flex:1 1 100%">' + esc(f.err) + '</p>' : '') + '</div></div>';
}
function startProjInfo(code) {
  const p = projInfo(code) || {};
  S.projEdit = {
    code: code, stage: p.stage || 'execution', plannedStart: p.plannedStart || '', scheduleType: p.scheduleType || 'none', err: '',
    handover: p.handoverDay && day1Of(p) ? dayDate(p, p.handoverDay) : ''
  };
}
function saveProjInfo() {
  const f = S.projEdit;
  if (!f) return;
  call('saveProjectInfo', [f.code, { stage: f.stage, plannedStart: f.plannedStart, handover: f.handover, scheduleType: f.scheduleType }], () => {
    S.projEdit = null;
    snack(f.code + ' saved.');
  }, (msg) => { if (S.projEdit) S.projEdit.err = msg; });
}
// Directory → Labour / Vendors → Trade, "pick or type" (like Area on photos). Typing shows the matching trades
// (any capitals); a close spelling offers the trade that exists ("Paintng" → Painting) rather than a duplicate;
// anything else becomes a new trade, saved for everyone. A team can have several: "Painting · Polish".
// key: 'add-labour', 'add-vendor' or 'edit'.
function tpObj(key) { return key === 'edit' ? S.dirEdit : S.forms[key.slice(4)]; }
function allTrades() { return (S.data && S.data.trades) || LC.TRADES; }
function editDistance(a, b) {
  const d = [];
  for (let i = 0; i <= a.length; i++) d.push([i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
function tradeMatch(typed) {
  const low = String(typed || '').trim().toLowerCase(), list = allTrades();
  if (!low) return { exact: '', offers: [] };
  const exact = list.find((x) => x.toLowerCase() === low) || '';
  const starts = list.filter((x) => x.toLowerCase() !== low && x.toLowerCase().indexOf(low) === 0);
  const close = list.filter((x) => x.toLowerCase() !== low && starts.indexOf(x) < 0 && editDistance(x.toLowerCase(), low) <= (low.length <= 4 ? 1 : 2));
  return { exact: exact, offers: starts.concat(close).slice(0, 4), close: close.length > 0 };
}
function tradePickHtml(key) {
  const o = tpObj(key), trades = o.trades || (o.trades = []);
  return '<div class="tpick">' + trades.map((t) => '<span class="tchip">' + esc(t) + '<button type="button" class="tchip-x" data-act="tp-remove" data-tp="' + key + '" data-v="' + esc(t) +
    '" aria-label="Remove ' + esc(t) + '">×</button></span>').join('') +
    '<input id="tp-' + key + '" data-tp="' + key + '" list="tradeList" value="' + esc(o.tradeTyped || '') + '" placeholder="' + (trades.length ? 'Add another trade' : 'Pick or type a trade') + '">' +
    '<div class="tp-msg" id="tp-' + key + '-msg">' + tradeMsgHtml(key) + '</div></div>';
}
function tradeMsgHtml(key) {
  const o = tpObj(key), typed = String(o.tradeTyped || '').trim();
  if (!typed) return '';
  const m = tradeMatch(typed);
  const btn = (v, label) => '<button type="button" class="fchip" data-act="tp-add" data-tp="' + key + '" data-v="' + esc(v) + '">' + esc(label) + '</button>';
  if (m.exact) return btn(m.exact, 'Add ' + m.exact);
  return (m.offers.length ? '<span class="small">' + (m.close ? 'Did you mean' : 'Pick') + '</span>' + m.offers.map((x) => btn(x, x)).join('') + '<span class="small">or</span>' : '') +
    btn(LC.cap(typed), 'Add “' + LC.cap(typed) + '” as a new trade');
}
function addTrade(key, v) {
  const o = tpObj(key);
  if (!o || !String(v || '').trim()) return;
  const t = String(v).trim();
  if (!o.trades.some((x) => x.toLowerCase() === t.toLowerCase())) o.trades.push(t);
  o.tradeTyped = '';
  renderAll();
}
// Enter, or saving with something still typed: an exact trade is added; a new one only when nothing close exists.
function tradeTypedOk(key) {
  const o = tpObj(key), typed = String(o.tradeTyped || '').trim();
  if (!typed) return true;
  const m = tradeMatch(typed);
  if (m.exact) { addTrade(key, m.exact); return true; }
  if (m.offers.length) return false;
  addTrade(key, LC.cap(typed));
  return true;
}

// Team: everyone who uses the app. Owners add and change site engineers; owners' own rows: name and code.
const ROLE_LABEL = { owner: 'Owner', contributor: 'Contributor', viewer: 'Viewer', site_engineer: 'Site engineer' };
const blankMember = () => ({ email: '', name: '', code: '', projects: [], err: '' });
function teamPanelHtml() {
  const users = ((S.data && S.data.users) || []).slice().sort((a, b) => (a.role === b.role ? (a.name < b.name ? -1 : 1) : a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.role < b.role ? -1 : 1));
  const owner = isOwner();
  const projBoxes = (sel, prefix) => '<div class="pchecks" role="group" aria-label="Projects">' + LC.activeCodes(S.dir.projects).map((c) =>
    '<label class="pcheck"><input type="checkbox" data-' + prefix + '-proj="' + esc(c) + '"' + (sel.indexOf(c) >= 0 ? ' checked' : '') + '> ' + esc(c) + '</label>').join('') + '</div>';
  const row = (u) => {
    if (S.memberEdit && S.memberEdit.email === u.email) {
      const m = S.memberEdit;
      return '<div class="drow"><div class="dform">' +
        '<div class="fld"><label for="me-name">Name</label><input id="me-name" data-me="name" value="' + esc(m.name) + '" autocomplete="off"></div>' +
        '<div class="fld code"><label for="me-code">Code</label><input id="me-code" data-me="code" value="' + esc(m.code) + '" maxlength="4" autocapitalize="characters" autocomplete="off"></div>' +
        (u.role === 'site_engineer' ? '<div class="fld" style="flex:1 1 100%"><span class="lbl">Projects</span>' + projBoxes(m.projects, 'me') + '</div>' : '') +
        '<button type="button" class="btn-accent" data-act="me-save">Save</button><button type="button" class="btn-outline" data-act="me-cancel">Cancel</button>' +
        (m.err ? '<p class="err" role="alert" style="flex:1 1 100%">' + esc(m.err) + '</p>' : '') + '</div></div>';
    }
    const conf = S.confirmDel === 'member:' + u.email;
    return '<div class="drow"><div class="drow-view">' + (u.code ? '<span class="code-tag">' + esc(u.code) + '</span>' : '<span class="code-tag arch">—</span>') +
      '<div class="drow-text"><b>' + esc(u.name || u.email) + '</b><span>' + esc(ROLE_LABEL[u.role] || u.role) + ' · ' + esc(u.email) +
      (u.role === 'site_engineer' ? ' · ' + esc((u.projects || []).join(', ') || 'no projects yet') : '') + '</span></div>' +
      (owner ? '<button type="button" class="btn-sm" data-act="me-edit" data-email="' + esc(u.email) + '">Edit</button>' +
        (u.role === 'site_engineer' ? '<button type="button" class="btn-sm' + (conf ? ' btn-danger' : '') + '" data-act="me-remove" data-email="' + esc(u.email) + '">' + (conf ? 'Confirm remove?' : 'Remove') + '</button>' : '') : '') +
      '</div></div>';
  };
  const a = S.memberAdd;
  const addForm = owner
    ? '<div class="dform">' +
      '<div class="fld"><label for="ma-name">Name</label><input id="ma-name" data-ma="name" value="' + esc(a.name) + '" placeholder="Venky" autocomplete="off"></div>' +
      '<div class="fld code"><label for="ma-code">Code</label><input id="ma-code" data-ma="code" value="' + esc(a.code) + '" placeholder="VNK" maxlength="4" autocapitalize="characters" autocomplete="off"></div>' +
      '<div class="fld"><label for="ma-email">Google account</label><input id="ma-email" data-ma="email" type="text" inputmode="email" autocapitalize="none" spellcheck="false" value="' + esc(a.email) + '" placeholder="name@gmail.com" autocomplete="off"></div>' +
      '<div class="fld" style="flex:1 1 100%"><span class="lbl">Projects</span>' + projBoxes(a.projects, 'ma') + '</div>' +
      '<button type="button" class="btn-accent" data-act="ma-add">Add site engineer</button>' +
      (a.err ? '<p class="err" role="alert" style="flex:1 1 100%">' + esc(a.err) + '</p>' : '') + '</div>'
    : '';
  return '<div class="panel"><div class="panel-head"><h3>Team</h3><span class="mono">' + users.length + '</span></div>' +
    '<p class="panel-desc">' + (owner
      ? 'Everyone who can sign in. Site engineers see projects, never the ledger. Adding someone sends them nothing: tell them yourself, then they sign in with that Google account. Codes are used for tasks, like MT NST @VNK.'
      : 'Everyone who can sign in to O F Turnkey.') + '</p>' + addForm + users.map(row).join('') + '</div>';
}
function memberProjects(prefix) { return Array.from(document.querySelectorAll('[data-' + prefix + '-proj]:checked')).map((el) => el.getAttribute('data-' + prefix + '-proj')); }
function addMember() {
  const a = S.memberAdd;
  a.projects = memberProjects('ma');
  call('saveMember', [{ email: a.email, name: a.name, code: a.code.toUpperCase(), projects: a.projects }], () => {
    snack(a.name + ' added as a site engineer. Nothing was sent to them.');
    S.memberAdd = blankMember();
  }, (msg) => { S.memberAdd.err = msg; });
}
function saveMemberEdit() {
  const m = S.memberEdit;
  if (!m) return;
  m.projects = memberProjects('me');
  call('saveMember', [{ email: m.email, name: m.name, code: m.code.toUpperCase(), projects: m.projects }], () => {
    S.memberEdit = null;
    snack(m.name + ' saved.');
  }, (msg) => { if (S.memberEdit) S.memberEdit.err = msg; });
}

/* ---------- the phone's outbox: things that wait for signal, then send by themselves ---------- */
// IndexedDB on this device: "drafts" (photos picked but not sent yet) and "outbox" (sent when there is
// signal, in order, each with its own id so a resend after a dropped signal is saved once on the server).
const IDB_NAME = 'oft-phone-' + CONFIG.env;
let idbOpen = null;
function idb() {
  if (!idbOpen) {
    idbOpen = new Promise((resolve, reject) => {
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('drafts', { keyPath: 'id' }); r.result.createObjectStore('outbox', { keyPath: 'id' }); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { idbOpen = null; reject(r.error || new Error('This phone’s storage isn’t available.')); };
    });
  }
  return idbOpen;
}
function idbDo(store, mode, fn) {
  return idb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode), st = tx.objectStore(store);
    let out;
    const req = fn(st);
    if (req) req.onsuccess = () => { out = req.result; };
    tx.oncomplete = () => resolve(out);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Couldn’t save on this phone.'));
  }));
}
const idbAll = (store) => idbDo(store, 'readonly', (st) => st.getAll()).then((l) => (l || []).sort((a, b) => a.createdAt - b.createdAt));
const idbPut = (store, item) => idbDo(store, 'readwrite', (st) => st.put(item));
const idbDel = (store, id) => idbDo(store, 'readwrite', (st) => st.delete(id));
function newId() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^a-z0-9-]/gi, ''); }

const OUT = { items: [], sending: false, online: navigator.onLine, lastError: '' };
// Adds a request to the outbox and tries to send it straight away.
// meta: what to draw on screen while the item waits ("Sending…"), e.g. a task's text and due date.
function outboxAdd(action, args, label, meta) {
  const item = { id: newId(), action: action, args: args, label: label, meta: meta || null, email: S.me ? S.me.email : '', createdAt: Date.now(), error: '' };
  return idbPut('outbox', item).then(() => { refreshOutbox(); flushOutbox(); });
}
function refreshOutbox() {
  return idbAll('outbox').then((items) => { OUT.items = items; renderNetStrip(); if (S.engineer) bgRedraw(); }, () => { /* no storage: nothing waiting */ });
}
// Items of one kind still waiting on this phone (drawn as "Sending…").
function waiting(action) { return OUT.items.filter((x) => x.action === action && !x.error && S.me && x.email === S.me.email); }
// Sends waiting items one by one. Stops at the first network problem (tries again on signal); an item the
// server refuses is kept aside with the reason, so it can't block the rest.
function flushOutbox() {
  if (OUT.sending || !sessionToken() || !S.me) return;
  OUT.sending = true;
  renderNetStrip();
  const next = () => idbAll('outbox').then((items) => {
    OUT.items = items;
    const item = items.find((x) => !x.error && x.email === S.me.email);
    if (!item) return null;
    return api(item.action, item.args).then((res) => idbDel('outbox', item.id).then(() => { OUT.online = true; outboxSent(item, res); return next(); }), (err) => {
      if (err.network) { OUT.online = false; return null; }
      if (err.signin) { signedOut(err.message); return null; }
      item.error = cleanErr(err.message);
      return idbPut('outbox', item).then(next);
    });
  });
  next().catch(() => { /* storage trouble: leave items as they are */ }).finally(() => { OUT.sending = false; refreshOutbox(); });
}
// What to refresh on screen once something from the outbox has arrived.
function outboxSent(item, res) {
  if (res && res.site) { S.site = res.site; if (S.me) store(SITE_KEY, JSON.stringify({ email: S.me.email, site: res.site })); }
  if (item.action === 'uploadPhoto') {
    const p = item.args[0];
    if (S.photos && S.photos.project === p.project && res && res.photo && !S.photos.photos.some((x) => x.id === res.photo.id)) S.photos.photos.unshift(res.photo);
    if (res && res.photo && p.thumb) S.thumbs[res.photo.id] = 'data:image/jpeg;base64,' + p.thumb;
  }
  if ((item.action === 'askQuery' || item.action === 'replyQuery') && res && res.queries) setQueries(res);
  bgRedraw();
}
function renderNetStrip() {
  const el = $('netStrip'), mine = OUT.items.filter((x) => S.me && x.email === S.me.email);
  const waiting = mine.filter((x) => !x.error), failed = mine.filter((x) => x.error);
  if (!waiting.length && !failed.length && OUT.online) { el.hidden = true; return; }
  el.hidden = false;
  let h = '';
  if (waiting.length) {
    h += !OUT.online ? 'No signal · ' + plural(waiting.length, 'item', 'items') + ' waiting. ' + (waiting.length === 1 ? 'It' : 'They') + ' will send by ' + (waiting.length === 1 ? 'itself' : 'themselves') + '.'
      : OUT.sending ? 'Sending ' + plural(waiting.length, 'item', 'items') + '…' : plural(waiting.length, 'item', 'items') + ' waiting to send.';
  } else if (!OUT.online) h += 'No signal.';
  if (failed.length) {
    h += (h ? ' ' : '') + plural(failed.length, 'item', 'items') + ' couldn’t be sent: ' + esc(failed[0].error) +
      ' <button type="button" data-act="out-drop">Remove</button>';
  }
  el.innerHTML = h;
  el.className = 'net-strip' + (failed.length ? ' bad' : '');
}
window.addEventListener('online', () => { OUT.online = true; flushOutbox(); renderNetStrip(); });
window.addEventListener('offline', () => { OUT.online = false; renderNetStrip(); });
setInterval(() => { if (OUT.items.some((x) => !x.error)) flushOutbox(); }, 30000);

// After sign-in on this device: show what is waiting and send it.
function startOutbox() { loadDrafts().then(refreshOutbox).then(() => { if (S.engineer) renderEng(); flushOutbox(); }); }

/* ---------- photos: shrink on the phone, then send ---------- */
// About 1600 px on the long side at JPEG 0.7 (roughly 300 KB), plus a 400 px preview. Turned the right way up.
function shrinkPhoto(file) {
  const fromBitmap = () => createImageBitmap(file, { imageOrientation: 'from-image' });
  const fromImg = () => new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t a photo the phone can read.')); };
    img.src = url;
  });
  return (window.createImageBitmap ? fromBitmap().catch(fromImg) : fromImg()).then((src) => {
    const draw = (maxSide, q) => {
      const w = src.width, h = src.height, k = Math.min(1, maxSide / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', q).split(',')[1];
    };
    const full = draw(1600, 0.7);
    return { full: full, thumb: draw(400, 0.6), bytes: Math.round(full.length * 3 / 4) };
  });
}
// Photos picked on the phone are saved here at once, so a reload (or the camera closing the app) can't lose them.
S.drafts = []; S.thumbs = {}; S.photos = null; S.photoSel = '';
function loadDrafts() { return idbAll('drafts').then((d) => { S.drafts = d; }, () => { S.drafts = []; }); }
function addDraftFiles(files, project) {
  const list = Array.from(files || []);
  if (!list.length) return;
  engSnack('Getting ' + plural(list.length, 'photo', 'photos') + ' ready…');
  let chain = Promise.resolve();
  list.forEach((f) => {
    chain = chain.then(() => shrinkPhoto(f)).then((p) => idbPut('drafts', { id: newId(), project: project, area: '', full: p.full, thumb: p.thumb, bytes: p.bytes, createdAt: Date.now() }),
      (err) => engSnack(cleanErr(err.message), true));
  });
  chain.then(loadDrafts).then(renderEng);
}
function sendDrafts(project) {
  const drafts = S.drafts.filter((d) => d.project === project && !d.purpose);
  if (!drafts.length || S.sendingPhotos) return; // a second tap while sending does nothing
  const missing = drafts.find((d) => !String(d.area || '').trim());
  if (missing) { engSnack('Pick or type an area for each photo.', true); return; }
  const batch = newId();
  S.sendingPhotos = true;
  // New areas are offered straight away (Photos and Ask a question); the server keeps them for the project too.
  const all = S.site.areas || (S.site.areas = {}), known = all[project] || (all[project] = []);
  drafts.forEach((d) => { const a = d.area.trim(); if (!known.some((x) => x.toLowerCase() === a.toLowerCase())) known.push(a); });
  renderEng();
  let chain = Promise.resolve();
  drafts.forEach((d) => {
    chain = chain.then(() => outboxAdd('uploadPhoto', [{ id: d.id, project: project, batchId: batch, area: d.area.trim(), caption: '', linkedTo: '', full: d.full, thumb: d.thumb }],
      'Photo · ' + d.area.trim())).then(() => idbDel('drafts', d.id));
  });
  chain.then(loadDrafts).finally(() => { S.sendingPhotos = false; }).then(() => {
    engSnack(navigator.onLine ? 'Sending ' + plural(drafts.length, 'photo', 'photos') + '…' : 'Saved on your phone. ' + (drafts.length === 1 ? 'It' : 'They') + ' will send by ' + (drafts.length === 1 ? 'itself' : 'themselves') + ' when there’s signal.');
    renderEng();
  });
}
function loadPhotos(project, then) {
  api('listPhotos', [project]).then((res) => {
    S.photos = res;
    if (then) then();
    loadThumbs(res.photos.slice(0, 40).map((p) => p.id));
    bgRedraw();
  }, (err) => { if (err.signin) signedOut(err.message); else if (S.engineer) engSnack(cleanErr(err.message), true); else snack(cleanErr(err.message), { error: true }); });
}
// Each preview is asked for once (a removed photo has none, and must not be asked for again on every redraw).
const THUMB_ASKED = new Set();
function loadThumbs(ids) {
  const need = Array.from(new Set(ids)).filter((i) => i && !S.thumbs[i] && !THUMB_ASKED.has(i)).slice(0, 40);
  if (!need.length) return;
  need.forEach((i) => THUMB_ASKED.add(i));
  api('photoThumbs', [need]).then((res) => {
    Object.assign(S.thumbs, res.thumbs || {});
    bgRedraw();
  }, () => { need.forEach((i) => THUMB_ASKED.delete(i)); /* previews come next time */ });
}
// A small picture wanted on screen: fetched in one batch after this redraw.
let thumbWant = [];
function wantThumb(id) {
  if (!id || S.thumbs[id] || THUMB_ASKED.has(id)) return;
  if (!thumbWant.length) setTimeout(() => { const ids = thumbWant; thumbWant = []; loadThumbs(ids); }, 0);
  thumbWant.push(id);
}
// Where an app-made task came from: "From query C-01 · Colour change" or "From photo · Study · Wed 21 Oct", with a
// small picture. Tapping it opens the query or the photo.
function taskSources() { return (S.engineer ? S.site && S.site.taskSources : S.data && S.data.taskSources) || {}; }
function shortText(t) { const s = String(t || '').split(/[.!?\n]/)[0].trim() || String(t || '').trim(); return s.length > 40 ? s.slice(0, 38) + '…' : s; }
function taskSourceHtml(src, taskId) {
  const s = src && taskSources()[src];
  if (!s) return '';
  const label = s.kind === 'query' ? 'From query ' + (s.changeNo ? s.changeNo + ' · ' : '· ') + shortText(s.text)
    : 'From photo · ' + [s.area || 'Site photo', s.at ? niceDay(s.at.slice(0, 10)) : ''].filter(Boolean).join(' · ');
  wantThumb(s.photoId);
  return '<button type="button" class="tsrc" data-act="task-src" data-src="' + esc(src) + '"' + (taskId ? ' data-id="' + esc(taskId) + '"' : '') + '>' +
    (s.photoId ? '<span class="tsrc-ph">' + (S.thumbs[s.photoId] ? '<img src="' + S.thumbs[s.photoId] + '" alt="">' : '<span class="ph-wait"></span>') + '</span>' : '') +
    '<span class="tsrc-text">' + esc(label) + '</span></button>';
}
// Opens a task's source: owners go to the project's query or site photo; engineers to Queries or Photos.
function openTaskSource(src) {
  const s = taskSources()[src];
  if (!s) return;
  window.scrollTo(0, 0);
  if (S.engineer) {
    S.engProject = s.project; S.engRegister = false;
    if (s.kind === 'query') { S.engTab = 'queries'; S.engQuery = s.id; markSeenQ(s.id); if (!S.queries) loadQueries(); }
    else {
      S.engTab = 'photos'; S.engQuery = '';
      if (S.photosFor !== s.project) { S.photosFor = s.project; S.photos = null; loadPhotos(s.project); }
      openPhoto(s.id);
    }
    renderEng();
    return;
  }
  S.tab = 'projects'; S.projTab = s.project;
  if (s.kind === 'query') { S.projSec = 'queries'; S.qView = 'list'; S.qSel = s.id; S.qc = null; }
  else {
    S.projSec = 'site';
    if (S.photosFor !== s.project) { S.photosFor = s.project; S.photos = null; S.photoSel = ''; loadPhotos(s.project); }
    openPhoto(s.id);
  }
  renderAll();
}
function thumbImg(p, cls) {
  const src = S.thumbs[p.id];
  return src ? '<img class="' + (cls || 'ph-img') + '" src="' + src + '" alt="' + esc(p.area || 'Site photo') + '">' : '<span class="' + (cls || 'ph-img') + ' ph-wait" aria-label="Loading photo"></span>';
}
function photoDay(at) { return String(at || '').slice(0, 10); }
// The dated photo feed. sel: the photo opened beside (laptop) or below (phone) the feed.
function photoFeedHtml(photos, opts) {
  opts = opts || {};
  if (!photos.length) return '<p class="empty">No site photos yet.</p>';
  const days = [];
  photos.forEach((p) => { const d = photoDay(p.at); let g = days.find((x) => x.d === d); if (!g) days.push(g = { d: d, items: [] }); g.items.push(p); });
  const users = (S.engineer ? S.site.users : S.data.users) || [];
  const nameOf = (email) => { const u = users.find((x) => x.email === email); return u ? u.name : email; };
  const counts = {};
  ((S.photos && S.photos.comments) || []).forEach((c) => { counts[c.photoId] = (counts[c.photoId] || 0) + 1; });
  return days.map((g) => {
    const who = Array.from(new Set(g.items.map((p) => nameOf(p.by)))).join(', ');
    return '<section class="ph-day"><div class="ph-day-h"><b>' + esc(g.d === todayIso() ? 'Today · ' + niceDay(g.d) : niceDay(g.d)) + '</b><span class="muted">' + esc(who) + ' · ' + plural(g.items.length, 'photo', 'photos') + '</span></div>' +
      '<div class="ph-grid">' + g.items.map((p) => '<div class="ph-cell"><button type="button" class="ph-tile' + (S.photoSel === p.id ? ' on' : '') + '" data-act="ph-open" data-id="' + esc(p.id) + '">' +
        '<span class="ph-frame">' + thumbImg(p) + (counts[p.id] ? '<span class="ph-badge">' + plural(counts[p.id], 'comment', 'comments') + '</span>' : '') + '</span>' +
        '<span class="ph-area">' + esc(p.area || '—') + '</span></button>' +
        (opts.ask ? '<button type="button" class="link-btn ph-ask" data-act="ph-ask" data-id="' + esc(p.id) + '">Ask about this photo</button>' : '') + '</div>').join('') + '</div></section>';
  }).join('');
}
// The opened photo: big picture, who/when/line, comments, and (owners) comment or comment + task.
function photoPanelHtml() {
  const p = S.photos && S.photos.photos.find((x) => x.id === S.photoSel);
  if (!p) return '<p class="empty">Tap a photo to see it bigger, comment on it, or make it a task.</p>';
  const users = (S.engineer ? S.site.users : S.data.users) || [];
  const nameOf = (email) => { const u = users.find((x) => x.email === email); return u ? u.name : email; };
  const comments = S.photos.comments.filter((c) => c.photoId === p.id);
  const owner = !S.engineer && isOwner();
  const full = S.fullPhoto && S.fullPhoto.id === p.id ? '<img class="ph-big" src="' + S.fullPhoto.url + '" alt="' + esc(p.area || 'Site photo') + '">'
    : '<span class="ph-big-wrap">' + thumbImg(p, 'ph-big') + '<span class="ph-hint">Loading full size…</span></span>';
  const c = S.photoComment || (S.photoComment = { text: '', due: addDays(todayIso(), 2), err: '' });
  if (c.who === undefined) c.who = owner ? defaultTaskFor(p.by, p.project) : '';
  const canDelete = owner || (p.by === (S.me && S.me.email) && Date.now() - Date.parse(p.at.replace(' ', 'T') + ':00+05:30') < 86400000);
  return full +
    '<div class="ph-info"><b>' + esc(p.area || 'Site photo') + '</b><span class="muted">' + esc(nameOf(p.by)) + ' · ' + esc(niceDay(photoDay(p.at)) + ' ' + p.at.slice(11, 16)) +
    (p.caption ? ' · ' + esc(p.caption) : '') + '</span></div>' +
    comments.map((x) => '<div class="ph-comment"><b>' + esc(nameOf(x.by)) + '</b> <span class="muted">' + esc(niceDay(x.at.slice(0, 10)) + ' ' + x.at.slice(11, 16)) + '</span><div>' + esc(x.text) + '</div>' +
      ((x.photoIds || []).length ? ((x.photoIds.forEach(wantThumb), '') + photoStrip(x.photoIds) + '<span class="pill pill-ok">Done, with photo</span>')
        : x.taskId ? '<span class="ph-task">Task for ' + esc(taskForName(x.taskFor)) + '</span>' : '') + '</div>').join('') +
    '<div class="ph-form"><label for="phComment">Comment on this photo</label><textarea id="phComment" data-pc="text" rows="2">' + esc(c.text) + '</textarea>' +
    (owner ? '<div class="ph-taskrow"><label class="q-for">Task for' + taskForSelect('id="phWho" data-pc="who"', p.project, p.by, c.who) + '</label>' +
      '<label class="ph-due">Task due <input type="date" data-pc="due" value="' + esc(c.due) + '"></label></div>' : '') +
    '<div class="ph-btns"><button type="button" class="btn-outline" data-act="ph-comment">Comment</button>' +
    (owner ? '<button type="button" class="btn-accent" data-act="ph-task">Comment + task for ' + esc(c.who ? taskForName(c.who) : '…') + '</button>' : '') + '</div>' +
    (owner ? '<span class="muted small">The task goes with this photo, due in 2 days unless you change the date.</span>' : '') +
    (c.err ? '<p class="err" role="alert">' + esc(c.err) + '</p>' : '') +
    (canDelete ? '<button type="button" class="link-btn ph-del" data-act="ph-delete" data-id="' + esc(p.id) + '">' + (S.confirmPhotoDel === p.id ? 'Confirm: remove this photo?' : 'Remove photo') + '</button>' : '') + '</div>';
}
function openPhoto(id) {
  S.photoSel = id;
  S.photoComment = null;
  if (!S.fullPhoto || S.fullPhoto.id !== id) {
    S.fullPhoto = null;
    api('photoFull', [id]).then((res) => { if (S.photoSel === id) { S.fullPhoto = res; bgRedraw(); } }, () => { /* the preview stays */ });
  }
}
function sendPhotoComment(makeTask) {
  const c = S.photoComment, p = S.photos && S.photos.photos.find((x) => x.id === S.photoSel);
  if (!c || !p) return;
  if (!String(c.text || '').trim()) { c.err = 'Type a comment.'; if (S.engineer) renderEng(); else renderAll(); return; }
  if (makeTask && !c.who) { c.err = 'Pick who the task is for.'; renderAll(); return; }
  api('commentPhoto', [p.id, c.text, !!makeTask, makeTask ? c.due : '', makeTask ? c.who : '']).then((res) => {
    S.photos = res;
    S.photoComment = null;
    if (S.engineer) { engSnack('Comment sent.'); renderEng(); }
    else { snack(makeTask ? 'Comment sent and made a task for ' + taskForName(c.who) + '.' : 'Comment sent.'); if (makeTask) refresh(true); renderAll(); }
  }, (err) => { c.err = cleanErr(err.message); if (S.engineer) renderEng(); else renderAll(); });
}
function deletePhotoNow(id) {
  api('deletePhoto', [id]).then((res) => {
    S.photos = res; S.photoSel = ''; S.confirmPhotoDel = '';
    if (S.engineer) { engSnack('Photo removed.'); renderEng(); } else { snack('Photo removed.'); renderAll(); }
  }, (err) => { if (S.engineer) engSnack(cleanErr(err.message), true); else snack(cleanErr(err.message), { error: true }); });
}

// Engineer → Photos: take or pick photos, an area for each (pick or type; new ones are kept), send.
function engPhotosHtml() {
  const proj = S.engProject;
  if (proj && S.photosFor !== proj) { S.photosFor = proj; S.photos = null; S.photoSel = ''; loadPhotos(proj); }
  const drafts = S.drafts.filter((d) => d.project === proj && !d.purpose);
  const areas = ((S.site && S.site.areas) || {})[proj] || [];
  const mine = (S.photos && S.photos.photos.filter((p) => p.by === S.me.email)) || [];
  return '<section class="card eng-card"><h2 class="eng-h2">Site photos · ' + esc(engProjName(proj)) + '</h2>' +
    '<p class="muted small eng-pad">' + (mine.length ? 'You last sent photos ' + esc(niceDay(photoDay(mine[0].at))) + '.' : 'No photos from you on this project yet.') + '</p>' +
    '<div class="ph-pick eng-pad"><label class="btn-save ph-pick-btn">Take photos<input type="file" accept="image/*" capture="environment" data-ph-pick="1" hidden></label>' +
    '<label class="btn-outline ph-pick-btn">From gallery<input type="file" accept="image/*" multiple data-ph-pick="1" hidden></label></div>' +
    '<datalist id="areaList">' + areas.map((a) => '<option value="' + esc(a) + '">').join('') + '</datalist>' +
    (drafts.length ? '<p class="muted small eng-pad">' + plural(drafts.length, 'photo', 'photos') + ' · pick an area or type a new one. New areas are saved for this project.</p>' +
      drafts.map((d) => '<div class="ph-draft"><img src="data:image/jpeg;base64,' + d.thumb + '" alt="">' +
        '<label>Area · pick or type<input id="da-' + esc(d.id) + '" list="areaList" data-draft-area="' + esc(d.id) + '" value="' + esc(d.area || '') + '" autocomplete="off"></label>' +
        '<button type="button" class="icon-btn" data-act="draft-del" data-id="' + esc(d.id) + '" aria-label="Remove this photo">×</button></div>').join('') +
      '<div class="eng-form"><button type="button" class="btn-save" data-act="ph-send"' + (S.sendingPhotos ? ' disabled' : '') + '>' + (S.sendingPhotos ? 'Sending…' : 'Send ' + plural(drafts.length, 'photo', 'photos')) + '</button>' +
      '<span class="muted small">Shrunk before sending. No signal? They wait on the phone and send later.</span></div>'
      : '') + '</section>' +
    '<section class="card eng-card"><h2 class="eng-h2">Photos from site</h2><div class="eng-pad">' + pendingPhotosHtml(proj) +
    (S.photos ? photoFeedHtml(S.photos.photos, { ask: true }) : '<p class="empty">Loading…</p>') + '</div></section>' +
    (S.photoSel ? '<section class="card eng-card eng-pad" id="phPanel">' + photoPanelHtml() + '</section>' : '');
}
// Photos on this phone still sending: shown at the top of the feed at once.
function pendingPhotosHtml(proj) {
  const items = waiting('uploadPhoto').map((w) => w.args[0]).filter((p) => p.project === proj && !p.linkedTo);
  if (!items.length) return '';
  return '<section class="ph-day"><div class="ph-day-h"><b>Sending from this phone</b><span class="muted">' + plural(items.length, 'photo', 'photos') + '</span></div><div class="ph-grid">' +
    items.map((p) => '<div class="ph-cell"><span class="ph-tile"><span class="ph-frame"><img class="ph-img" src="data:image/jpeg;base64,' + p.thumb + '" alt=""><span class="ph-badge sending">Sending…</span></span>' +
      '<span class="ph-area">' + esc(p.area || '—') + '</span></span></div>').join('') + '</div></section>';
}
// "Ask about this photo": the question form opens with that photo already attached.
function askAboutPhoto(id) {
  const ph = S.photos && S.photos.photos.find((x) => x.id === id);
  S.ask = { text: '', area: (ph && ph.area) || '', work: 'continuing', other: 'no', team: '', which: '', photoIds: [id] };
  S.engTab = 'queries'; S.engQuery = ''; S.engRegister = false;
  window.scrollTo(0, 0);
  renderEng();
}

// Owners → project → Site: the dated photo feed, with the opened photo beside it.
function projectSiteHtml(p) {
  if (S.photosFor !== p.code) { S.photosFor = p.code; S.photos = null; S.photoSel = ''; loadPhotos(p.code); }
  return '<div class="pgrid"><div class="pmain"><section class="card"><div class="sec-head"><h3>Photos from site</h3>' +
    '<button type="button" class="btn-outline" data-act="ph-reload">Refresh</button></div>' +
    (S.photos ? photoFeedHtml(S.photos.photos) : '<p class="empty">Loading…</p>') + '</section></div>' +
    '<div class="pside"><section class="card ph-side" id="phPanel">' + photoPanelHtml() + '</section></div></div>';
}

// Query buttons (owners and engineers). Returns true when it handled the click.
function queryClick(act, el) {
  const id = el.dataset.id, v = el.dataset.v;
  if (act === 'lightbox') showLightbox(id);
  else if (act === 'lightbox-close') hideLightbox();
  else if (act === 'eq-open') { S.engTab = 'queries'; S.engQuery = id; S.engRegister = false; markSeenQ(id); window.scrollTo(0, 0); renderEng(); }
  else if (act === 'need-send') { if (!S.engReply || S.engReply.qid !== id) S.engReply = { qid: id, text: '' }; engSendReply(id); }
  else if (act === 'eq-back') { S.engQuery = ''; S.engRegister = false; renderEng(); }
  else if (act === 'eq-register') { S.engRegister = true; renderEng(); }
  else if (act === 'ask-chip') { S.ask[el.dataset.f] = v; renderEng(); }
  else if (act === 'ask-send') engSendAsk();
  else if (act === 'ask-unattach') { S.ask.photoIds = (S.ask.photoIds || []).filter((x) => x !== id); renderEng(); }
  else if (act === 'er-send') engSendReply(id);
  else if (act === 'q-open') { S.qSel = id; S.qc = null; renderAll(); const th = $('qThread'); if (th && phone.matches) th.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  else if (act === 'q-view') { S.qView = v; renderAll(); }
  else if (act === 'q-print') printRegister(el.dataset.code);
  else if (act === 'qc-photo') { S.qc.photoAsk = true; S.qc.err = ''; renderAll(); }
  else if (act === 'qc-photo-cancel') { S.qc.photoAsk = false; S.qc.photoHow = []; renderAll(); }
  else if (act === 'qc-how') { const h = S.qc.photoHow || (S.qc.photoHow = []); const i = h.indexOf(v); if (i >= 0) h.splice(i, 1); else h.push(v); renderAll(); }
  else if (act === 'qc-photo-send') ownerSend(true);
  else if (act === 'qc-send') ownerSend(false);
  else if (act === 'qc-outcome') { S.qc.outcome = v; S.qc.err = ''; renderAll(); }
  else if (act === 'qc-cause') { S.qc.cause = v; S.qc.err = ''; renderAll(); }
  else if (act === 'pcode-save') projCodeSave(el.dataset.code);
  else if (act === 'today-mine') { S.todayMine = !!v; renderAll(); }
  else if (act === 'today-query') { S.projTab = el.dataset.code; S.projSec = 'queries'; S.qSel = id; S.qView = 'list'; S.qc = null; renderAll(); window.scrollTo(0, 0); }
  else if (act === 'needs-query') { S.projSec = 'queries'; S.qSel = id; S.qView = 'list'; S.qc = null; renderAll(); window.scrollTo(0, 0); }
  else if (act === 'ph-open-site') { S.projSec = 'site'; openPhoto(id); renderAll(); }
  else if (act === 'task-src') { if (id) markSeenTask(id); openTaskSource(el.dataset.src); }
  else if (act === 'co-start') {
    const q = S.queries.queries.find((x) => x.id === id), t = q ? queryTasks(q).find((x) => !x.after) : null;
    S.co = { qid: id, cause: '', changeText: t ? LC.cap(t.note) : '', area: (q && q.area) || '', date: todayIso(), cost: '', err: '' };
    renderAll();
  }
  else if (act === 'co-cause') { S.co.cause = v; S.co.err = ''; renderAll(); }
  else if (act === 'co-cancel') { S.co = null; renderAll(); }
  else if (act === 'co-save') saveChangeOutcome();
  else return false;
  return true;
}
// A photo full size, over everything (tap to close).
function showLightbox(id) {
  hideLightbox();
  const box = document.createElement('div');
  box.id = 'lightbox';
  box.className = 'lightbox';
  box.setAttribute('data-act', 'lightbox-close');
  box.innerHTML = (S.thumbs[id] ? '<img src="' + S.thumbs[id] + '" alt="Photo">' : '') + '<span class="ph-hint">Loading full size… tap to close</span>';
  document.body.appendChild(box);
  api('photoFull', [id]).then((res) => { const b = $('lightbox'); if (b) b.innerHTML = '<img src="' + res.url + '" alt="Photo"><span class="ph-hint">Tap to close</span>'; }, () => { /* the preview stays */ });
}
function hideLightbox() { const b = $('lightbox'); if (b) b.remove(); }

// Photo buttons, the same for owners and engineers. Returns true when it handled the click.
function photoClick(act, el) {
  const redraw = () => { if (S.engineer) renderEng(); else renderAll(); };
  if (act === 'ph-open') {
    openPhoto(el.dataset.id);
    redraw();
    const panel = $('phPanel');
    if (panel && window.matchMedia('(max-width: 699px)').matches) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (act === 'ph-comment') sendPhotoComment(false);
  else if (act === 'ph-task') sendPhotoComment(true);
  else if (act === 'ph-delete') {
    if (S.confirmPhotoDel === el.dataset.id) deletePhotoNow(el.dataset.id); else { S.confirmPhotoDel = el.dataset.id; redraw(); }
  } else if (act === 'ph-reload') { if (S.photosFor) { S.thumbs = {}; THUMB_ASKED.clear(); loadPhotos(S.photosFor); } }
  else if (act === 'ph-send') sendDrafts(S.engProject);
  else if (act === 'ph-ask') askAboutPhoto(el.dataset.id);
  else if (act === 'draft-del') idbDel('drafts', el.dataset.id).then(loadDrafts).then(redraw);
  else if (act === 'out-drop') {
    Promise.all(OUT.items.filter((x) => x.error).map((x) => idbDel('outbox', x.id))).then(refreshOutbox);
  } else return false;
  return true;
}

/* ---------- site queries (shared by engineers and owners) ---------- */
S.queries = null;
function teamUsers() { return ((S.engineer ? S.site && S.site.users : S.data && S.data.users) || []); }
function nameOfEmail(email) { const u = teamUsers().find((x) => x.email === email); return u ? u.name : email; }
function initialsOfName(n) { const w = String(n || '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean); return ((w[0] || '').charAt(0) + (w[1] || '').charAt(0)).toUpperCase() || '?'; }
function redraw() { if (S.engineer) renderEng(); else if (S.started) renderAll(); }
function loadQueries(then) {
  api('listQueries', ['']).then((res) => {
    setQueries(res);
    if (then) then();
    bgRedraw();
  }, (err) => { if (err.signin) signedOut(err.message); });
}
function queryPhotoIds() {
  if (!S.queries) return [];
  // The pictures on the query cards first, then the rest of each thread.
  const ids = S.queries.queries.map((q) => q.lastPhotoId).filter(Boolean);
  S.queries.queries.forEach((q) => ids.push.apply(ids, q.photoIds));
  S.queries.messages.forEach((m) => ids.push.apply(ids, m.photoIds));
  return ids.slice(0, 40);
}
function stampNow() { const d = new Date(); return LC.iso(d) + ' ' + LC.pad(d.getHours()) + ':' + LC.pad(d.getMinutes()); }
function ageText(stamp) {
  const ms = Date.now() - Date.parse(String(stamp).replace(' ', 'T') + ':00+05:30');
  const h = Math.floor(ms / 3600000);
  return h < 1 ? Math.max(1, Math.floor(ms / 60000)) + ' min' : h < 24 ? h + ' h' : plural(Math.floor(h / 24), 'day', 'days');
}
function queryTasks(q) { return ((S.queries && S.queries.tasks) || []).filter((t) => t.queryId === q.id); }
function queryState(q) {
  if (q.status === 'closed') return { text: 'Closed · ' + (q.outcome === 'change' ? 'Change approved' + (q.changeNo ? ' ' + q.changeNo : '') : 'Answered') + (queryTasks(q).length ? ' + task' : ''), cls: 'ok' };
  if (q.status === 'waiting_photo') return { text: 'Waiting for photo', cls: 'wait' };
  return { text: 'Waiting ' + ageText(q.askedAt), cls: q.workOnHold ? 'bad' : 'wait' };
}
// The team a query needs, as the Directory has it now ("Raju · Painting"); a typed name as typed.
function teamLabel(q) {
  const people = (S.engineer ? S.site && S.site.people : S.data && S.data.people) || [];
  const typed = String(q.otherTeamWhich || '').split(' · ')[0].trim().toLowerCase();
  const p = people.find((x) => x.code === q.otherTeamCode) || (typed ? people.filter((x) => x.kind === 'labour' && x.name.trim().toLowerCase() === typed) : []).find((x, i, a) => a.length === 1);
  return p ? p.name + (p.trade ? ' · ' + p.trade : '') : (q.otherTeamWhich || 'another team');
}
// lower: "work on hold · needs Raju · Painting" for the middle of a line (the team keeps its capitals).
// A closed query no longer says whether work is on hold.
function workText(q, lower) {
  const team = q.otherTeam === 'yes' ? 'needs ' + teamLabel(q) : q.otherTeam === 'not_sure' ? 'another team? not sure' : '';
  if (q.status === 'closed') return team && !lower ? LC.cap(team) : team;
  return (q.workOnHold ? (lower ? 'work on hold' : 'Work on hold') : (lower ? 'work continuing' : 'Work continuing')) + (team ? ' · ' + team : '');
}
// What happened last on a query: "New photo from Venky · 2 min ago".
function lastText(q) {
  const l = q.last;
  if (!l) return nameOfEmail(q.askedBy) + ' · ' + ageText(q.askedAt) + ' ago';
  const me = l.by === (S.me && S.me.email), who = me ? 'you' : nameOfEmail(l.by);
  const t = l.what === 'photo' ? 'New photo from ' + who : l.what === 'reply' ? 'Reply from ' + who
    : l.what === 'photo_request' ? (me ? 'You' : who) + ' asked for a clearer photo'
    : l.what === 'closed' ? (q.outcome === 'change' ? 'Change approved by ' : 'Answered by ') + who : 'Asked by ' + who;
  return t + ' · ' + ageText(l.at) + ' ago';
}
// Something happened on it (by someone else) since I last opened it: highlighted until opened. "Seen" is a
// fingerprint of the thread as it was when opened (latest time, number of messages, state).
function seenMark(q, messages) {
  return (q.last ? q.last.at : q.askedAt) + '|' + (messages || S.queries.messages).filter((m) => m.queryId === q.id).length + '|' + q.status;
}
// What I have opened (queries, new tasks): as the server last said (ledger data, site data, query list), plus
// whatever was opened on this device since.
S.seenLocal = {};
function seenMap() {
  return Object.assign({}, (S.site && S.site.seen) || {}, (S.data && S.data.seen) || {}, (S.queries && S.queries.seen) || {}, S.seenLocal);
}
function isNewQ(q) {
  const l = q.last;
  if (!l || !S.me || l.by === S.me.email) return false;
  return seenMap()[q.id] !== seenMark(q);
}
function markSeenQ(id) {
  const q = S.queries && S.queries.queries.find((x) => x.id === id);
  if (!q || !isNewQ(q)) return;
  const mark = seenMark(q);
  S.seenLocal[id] = mark;
  api('markSeen', [id, mark]).catch(() => { /* still marked on this device; the server learns next time */ });
}
// A task someone else gave me that I haven't opened yet: "New" (blue) until I open it.
function isNewTask(e, code) {
  return !!(e && !e.done && code && e.assignee === code && e.added_by && S.me && e.added_by !== S.me.email && !seenMap()['task:' + e.id]);
}
function markSeenTask(id) {
  const e = S.engineer ? ((S.site && S.site.tasks) || []).find((x) => x.id === id) : S.entries.find((x) => x.id === id);
  if (!isNewTask(e, S.engineer ? engMe().code : myCode())) return;
  S.seenLocal['task:' + id] = '1';
  api('markSeen', ['task:' + id, '1']).catch(() => { /* still marked on this device */ });
}
function setQueries(res) {
  S.queries = res;
  loadThumbs(queryPhotoIds());
}
// How late a task is: "3 days overdue" (red), "Due today" (amber), "Due tomorrow" / "due Sat 24 Oct" (grey).
function dueChip(e) {
  if (e.done) return '<span class="due due-done">' + (e.done_photo ? 'Done, with photo' : 'Done') + '</span>';
  const d = LC.dueText(e.due, todayIso());
  return '<span class="due due-' + d.level + '">' + esc(d.text) + '</span>';
}
function photoStrip(ids) {
  if (!ids || !ids.length) return '';
  return '<div class="q-photos">' + ids.map((id) => '<button type="button" class="q-photo" data-act="lightbox" data-id="' + esc(id) + '">' +
    (S.thumbs[id] ? '<img src="' + S.thumbs[id] + '" alt="Photo">' : '<span class="ph-wait"></span>') + '</button>').join('') + '</div>';
}
function bubble(email, when, body) {
  const n = nameOfEmail(email);
  return '<div class="q-msg"><span class="q-av">' + esc(initialsOfName(n)) + '</span><div class="q-body"><div class="muted small"><b class="q-name">' + esc(n) + '</b> · ' +
    esc(when.slice(0, 10) === todayIso() ? 'today ' + when.slice(11, 16) : niceDay(when.slice(0, 10)) + ' ' + when.slice(11, 16)) + '</div>' + body + '</div></div>';
}
function queryThreadHtml(q, owner) {
  const msgs = S.queries.messages.filter((m) => m.queryId === q.id);
  const tasks = queryTasks(q);
  const closed = q.status === 'closed';
  let h = '<div class="q-pills">' + (closed ? '' : '<span class="pill ' + (q.workOnHold ? 'pill-bad' : 'pill-blue') + '">' + (q.workOnHold ? 'Work on hold' : 'Work continuing') + '</span>') +
    (q.area ? '<span class="pill">' + esc(q.area) + '</span>' : '') +
    '<span class="pill">' + esc(q.otherTeam === 'yes' ? 'Needs ' + teamLabel(q) : q.otherTeam === 'not_sure' ? 'Another team: not sure' : 'No other team needed') + '</span>' +
    '<span class="pill pill-' + queryState(q).cls + '">' + esc(queryState(q).text) + '</span></div>';
  h += bubble(q.askedBy, q.askedAt, photoStrip(q.photoIds) + '<p>' + esc(q.text) + '</p>');
  // "Waiting for a new photo" shows once, at the top; a request answered with a photo says "Photo received".
  msgs.forEach((m, i) => {
    const answered = m.kind === 'photo_request' && msgs.slice(i + 1).some((x) => x.by === q.askedBy && x.photoIds.length);
    h += bubble(m.by, m.at, photoStrip(m.photoIds) + (m.text ? '<p>' + esc(m.text) + '</p>' : '') +
      (answered ? '<span class="pill pill-ok">Photo received</span>' : '') + (m.kind === 'done_photo' ? '<span class="pill pill-ok">Done, with photo</span>' : ''));
  });
  if (tasks.length) {
    const tname = (code) => esc((S.engineer ? taskForName(code) : LC.teamName(S.dir || { team: {} }, code)) || code);
    const state = (t) => t.done ? ' <span class="pill pill-ok">' + (t.donePhoto ? 'Done, with photo' : 'Done') + '</span>' : '';
    const first = tasks.filter((t) => !t.after), next = tasks.filter((t) => t.after);
    h += '<div class="q-tasks">' + first.map((t, i) => '<div><b>Task ' + (i + 1) + ' · ' + tname(t.assignee) + ' · ' + (t.done ? '' : dueChip(t)) + '</b>' +
      state(t) + '<br>' + esc(t.note) + '</div>').join('') +
      next.map((t) => {
        const before = tasks.find((x) => x.id === t.after);
        return '<div class="muted"><b>Then · ' + tname(t.assignee) + '</b> · ' + (t.done ? '' : before && before.done ? 'on their list now · ' + dueChip(t) : 'appears when the task before is ticked') +
          state(t) + '<br>' + esc(t.note) + '</div>';
      }).join('') + '</div>';
  }
  if (!owner) waiting('replyQuery').filter((w) => w.args[0] === q.id).forEach((w) => {
    h += bubble(S.me.email, stampNow(), (w.args[1] ? '<p>' + esc(w.args[1]) + '</p>' : '') + '<span class="pill sending">Sending…</span>');
  });
  if (q.status !== 'closed') h += owner ? ownerComposerHtml(q) : engComposerHtml(q);
  else if (owner) h += changeOutcomeHtml(q);
  return h;
}
// Owners: change how a closed query was closed (Answered ↔ Change approved). A change gets the next C-number; going
// back to Answered voids its number (never used again).
function changeOutcomeHtml(q) {
  const c = S.co && S.co.qid === q.id ? S.co : null;
  if (!c) {
    return '<div class="q-compose q-reclose"><button type="button" class="btn-outline" data-act="co-start" data-id="' + esc(q.id) + '">' +
      (q.outcome === 'change' ? 'Change to Answered' : 'Change to Change approved') + '</button></div>';
  }
  const chip = (act, v, on, label) => '<button type="button" class="fchip' + (on ? ' on' : '') + '" data-act="' + act + '" data-v="' + esc(v) + '" aria-pressed="' + on + '">' + esc(label) + '</button>';
  const body = q.outcome === 'change'
    ? '<p class="small">' + esc((q.changeNo || 'Its number') + ' leaves the change register and is marked voided; the number is not used again.') + '</p>'
    : '<div class="q-change"><div class="muted small">Why did this change? (for the handover report)</div><div class="chip-group">' +
      ((S.queries && S.queries.causes) || []).map((x) => chip('co-cause', x, c.cause === x, x)).join('') + '</div>' +
      '<label>What was approved<input id="coText" data-co="changeText" value="' + esc(c.changeText) + '" placeholder="Change colour to white"></label>' +
      '<div class="q-row2"><label>Area<input data-co="area" value="' + esc(c.area) + '" placeholder="Cabin 3"></label>' +
      '<label>Date<input type="date" data-co="date" value="' + esc(c.date) + '"></label>' +
      '<label>Cost to us (optional)<input data-co="cost" value="' + esc(c.cost) + '" inputmode="numeric" placeholder="₹3,000"></label></div></div>';
  return '<div class="q-compose q-reclose">' + body + (c.err ? '<p class="err" role="alert">' + esc(c.err) + '</p>' : '') +
    '<div class="ph-btns"><button type="button" class="btn-accent" data-act="co-save" data-id="' + esc(q.id) + '">' + (q.outcome === 'change' ? 'Change to Answered' : 'Make it a change') + '</button>' +
    '<button type="button" class="btn-outline" data-act="co-cancel">Cancel</button></div></div>';
}
function saveChangeOutcome() {
  const c = S.co;
  if (!c) return;
  const q = S.queries.queries.find((x) => x.id === c.qid);
  const toChange = q.outcome !== 'change';
  if (toChange && !c.cause) { c.err = 'Pick why this changed.'; redraw(); return; }
  if (toChange && !String(c.changeText || '').trim()) { c.err = 'Type what was approved.'; redraw(); return; }
  api('changeOutcome', [c.qid, toChange ? { outcome: 'change', cause: c.cause, changeText: c.changeText, area: c.area, date: c.date, cost: c.cost } : { outcome: 'answered' }]).then((res) => {
    setQueries(res); S.co = null;
    const nq = res.queries.find((x) => x.id === c.qid);
    snack(toChange ? 'Now a change: ' + (nq && nq.changeNo) + ' in the change register.' : 'Now Answered. ' + (q.changeNo || 'Its number') + ' is voided.');
    redraw();
  }, (err) => { if (err.signin) { signedOut(err.message); return; } c.err = cleanErr(err.message); redraw(); });
}

// One query in a list (engineer's and owners'): the latest activity (highlighted until opened), its state, the
// question, area and work status, and the latest photo.
function queryCardHtml(q, act, on) {
  const ph = q.lastPhotoId || (q.photoIds && q.photoIds[0]), fresh = isNewQ(q);
  const sub = [q.area, q.last && q.last.what !== 'asked' ? 'asked by ' + nameOfEmail(q.askedBy) : '', workText(q, true)].filter(Boolean).join(' · ');
  return '<button type="button" class="q-card' + (on ? ' on' : '') + (fresh ? ' new' : '') + (ph ? ' has-ph' : '') + '" data-act="' + act + '" data-id="' + esc(q.id) + '">' +
    (ph ? '<span class="q-thumb">' + (S.thumbs[ph] ? '<img src="' + S.thumbs[ph] + '" alt="">' : '<span class="ph-wait"></span>') + '</span>' : '') +
    '<span class="q-card-main"><span class="q-card-top"><span class="q-last small">' + (fresh ? '<span class="new-dot" aria-label="New"></span>' : '') + esc(lastText(q)) + '</span>' +
    '<span class="pill pill-' + queryState(q).cls + '">' + esc(queryState(q).text) + '</span></span><b>' + esc(q.text) + '</b><span class="muted small">' + esc(LC.cap(sub)) + '</span></span></button>';
}

// Owners: reply, ask for a clearer photo, close as Answered / Change approved, task + follow-up task.
function ownerComposerHtml(q) {
  if (!S.qc || S.qc.qid !== q.id) {
    const eng = defaultTaskFor(q.askedBy, q.project);
    S.qc = { qid: q.id, text: '', outcome: '', cause: '', cost: '', area: q.area || '', changeText: '', task: false, taskWho: eng, taskDue: addDays(todayIso(), 2), taskText: '',
      follow: false, followWho: eng, followText: '', err: '', sending: false };
  }
  const c = S.qc, causes = (S.queries && S.queries.causes) || [];
  const chip = (act, v, on, label) => '<button type="button" class="fchip' + (on ? ' on' : '') + '" data-act="' + act + '" data-v="' + esc(v) + '" aria-pressed="' + on + '">' + esc(label) + '</button>';
  const who = (field) => '<label class="q-for">Task for' + taskForSelect('data-qc="' + field + '"', q.project, q.askedBy, c[field]) + '</label>';
  // No preset: Send stays off until Reply only / Answered / Change approved is picked.
  const sendLabel = !c.outcome ? 'Pick how this closes' : c.outcome === 'keep' ? 'Send reply'
    : (c.outcome === 'change' ? 'Approve change' : 'Answer and close') + (c.task ? ' · task for ' + taskForName(c.taskWho) : '');
  // Asking for a clearer photo: quick choices plus your own words, then one message to the engineer.
  if (c.photoAsk) {
    c.photoHow = c.photoHow || [];
    return '<div class="q-compose"><div class="muted small">What would make the photo clearer? Pick any, add your own words if you like.</div><div class="chip-group">' +
      PHOTO_ASKS.map((x) => chip('qc-how', x, c.photoHow.indexOf(x) >= 0, x)).join('') + '</div>' +
      '<textarea id="qcText" data-qc="text" rows="2" placeholder="e.g. show the whole wall, with the desk in it">' + esc(c.text) + '</textarea>' +
      '<div class="muted small" id="qcAskPreview">The engineer will get: “' + esc(photoAskText(c)) + '”</div>' +
      (c.err ? '<p class="err" role="alert">' + esc(c.err) + '</p>' : '') +
      '<div class="ph-btns"><button type="button" class="btn-accent" data-act="qc-photo-send" data-id="' + esc(q.id) + '">Ask for the photo</button>' +
      '<button type="button" class="btn-outline" data-act="qc-photo-cancel">Cancel</button></div></div>';
  }
  return '<div class="q-compose"><div class="q-row"><label for="qcText">Your reply</label>' +
    (q.status === 'waiting_photo' ? '' : '<button type="button" class="btn-outline" data-act="qc-photo">Ask for a clearer photo</button>') + '</div>' +
    '<textarea id="qcText" data-qc="text" rows="2">' + esc(c.text) + '</textarea>' +
    '<div class="muted small">How does this close?</div><div class="chip-group">' +
    chip('qc-outcome', 'keep', c.outcome === 'keep', 'Reply only, keep open') + chip('qc-outcome', 'answered', c.outcome === 'answered', 'Answered') +
    chip('qc-outcome', 'change', c.outcome === 'change', 'Change approved') + '</div>' +
    (c.outcome === 'change' ? '<div class="q-change"><div class="muted small">Why did this change? (for the handover report)</div><div class="chip-group">' +
      causes.map((x) => chip('qc-cause', x, c.cause === x, x)).join('') + '</div>' +
      '<label>What was approved (for the change register)<input id="qcChange" data-qc="changeText" value="' + esc(c.changeText) + '" placeholder="Change colour to white"></label>' +
      '<div class="q-row2"><label>Area<input data-qc="area" value="' + esc(c.area) + '" placeholder="Cabin 3" autocomplete="off"></label>' +
      '<label>Cost to us (optional)<input data-qc="cost" value="' + esc(c.cost) + '" inputmode="numeric" placeholder="₹3,000" autocomplete="off"></label></div>' +
      '<span class="muted small">If the client asked for it and will pay, it belongs in Extras instead (comes with Budget).</span></div>' : '') +
    (c.outcome && c.outcome !== 'keep' ? '<div class="q-taskbox"><label class="pcheck"><input type="checkbox" data-qc-check="task"' + (c.task ? ' checked' : '') + '> Make it a task</label>' +
      (c.task ? '<div class="q-taskline">' + who('taskWho') + '<input type="date" data-qc="taskDue" value="' + esc(c.taskDue) + '">' +
        '<input data-qc="taskText" value="' + esc(c.taskText) + '" placeholder="Get the electrician to raise the switch box by 6 in" autocomplete="off"></div>' +
        '<label class="pcheck"><input type="checkbox" data-qc-check="follow"' + (c.follow ? ' checked' : '') + '> Add a follow-up task after this one</label>' +
        '<span class="muted small">Only if another team has to come back. It shows on their list only after the first task is ticked.</span>' +
        (c.follow ? '<div class="q-taskline">' + who('followWho') + '<input data-qc="followText" value="' + esc(c.followText) + '" placeholder="Get Raju to patch and repaint around the box" autocomplete="off"></div>' : '') : '') +
      '</div>' : '') +
    (c.err ? '<p class="err" role="alert">' + esc(c.err) + '</p>' : '') +
    '<button type="button" class="btn-accent q-send" data-act="qc-send" data-id="' + esc(q.id) + '"' + (c.outcome ? '' : ' disabled') + '>' + esc(sendLabel) + '</button></div>';
}
// "Task for": the project's site engineers (and whoever asked or took the photo), then Shruthi and Savan.
function taskForOptions(project, byEmail) {
  const users = teamUsers().filter((u) => u.code);
  return users.filter((u) => u.role === 'site_engineer' && ((u.projects || []).indexOf(project) >= 0 || u.email === byEmail))
    .concat(users.filter((u) => u.role === 'owner'))
    .filter((u, i, a) => a.findIndex((x) => x.code === u.code) === i);
}
// The engineer who asked or took the photo, else the project's engineer.
function defaultTaskFor(byEmail, project) {
  const opts = taskForOptions(project, byEmail);
  return (opts.find((u) => u.email === byEmail && u.role === 'site_engineer') || opts.find((u) => u.role === 'site_engineer') || {}).code || '';
}
function taskForSelect(attrs, project, byEmail, cur) {
  const opts = taskForOptions(project, byEmail);
  return '<select ' + attrs + '>' + (cur ? '' : '<option value="">Pick…</option>') +
    opts.map((u) => '<option value="' + esc(u.code) + '"' + (u.code === cur ? ' selected' : '') + '>' + esc(u.name + ' (' + u.code + ')') + '</option>').join('') + '</select>';
}
function taskForName(code) { const u = teamUsers().find((x) => x.code === code); return u ? u.name : code || 'the site engineer'; }
const PHOTO_ASKS = ['Further back', 'Closer', 'Different angle', 'Better light'];
// "Please send a clearer photo: further back, better light. Show the whole wall."
function photoAskText(c) {
  const how = (c.photoHow || []).map((x) => x.toLowerCase());
  const own = String(c.text || '').trim();
  return 'Please send a clearer photo' + (how.length ? ': ' + how.join(', ') : '') + '.' + (own ? ' ' + own : '');
}
function ownerSend(photoAsk) {
  const c = S.qc;
  if (!c) return;
  const text = String(c.text || '').trim();
  let req;
  if (!photoAsk && !c.outcome) { c.err = 'Pick how this closes.'; redraw(); return; }
  if (photoAsk) req = api('replyQuery', [c.qid, photoAskText(c), 'photo_request', [], newId()]);
  else if (c.outcome === 'keep') {
    if (!text) { c.err = 'Type a reply.'; redraw(); return; }
    req = api('replyQuery', [c.qid, text, 'reply', [], newId()]);
  } else {
    if (c.outcome === 'change' && !c.cause) { c.err = 'Pick why this changed.'; redraw(); return; }
    if (c.task && !String(c.taskText || text).trim()) { c.err = 'Type what the task is.'; redraw(); return; }
    if (c.task && !c.taskWho) { c.err = 'Pick who the task is for.'; redraw(); return; }
    // The register's Change column: what was approved (typed, else the task, else the reply).
    const changeText = String(c.changeText || '').trim() || (c.task ? String(c.taskText || '').trim() : '') || text;
    if (c.outcome === 'change' && !changeText) { c.err = 'Type what was approved.'; redraw(); return; }
    req = api('closeQuery', [c.qid, {
      outcome: c.outcome, reply: text, cause: c.cause, cost: c.cost, area: c.area, changeText: changeText,
      task: c.task ? { assignee: c.taskWho, due: c.taskDue, note: String(c.taskText || text).trim() } : null,
      followup: c.task && c.follow && String(c.followText || '').trim() ? { assignee: c.followWho, note: c.followText } : null
    }]);
  }
  c.sending = true; c.err = ''; redraw();
  req.then((res) => {
    setQueries(res); S.qc = null;
    snack(photoAsk ? 'Asked for a clearer photo.' : c.outcome === 'keep' ? 'Reply sent.' : 'Reply sent and the query is closed.');
    if (c.task) refresh(true);
    redraw();
  }, (err) => { if (err.signin) { signedOut(err.message); return; } c.sending = false; c.err = cleanErr(err.message); redraw(); });
}

// Engineers: reply in the thread, with photos if asked for one (goes through the phone's outbox).
function engComposerHtml(q) {
  const drafts = S.drafts.filter((d) => d.purpose === 'reply:' + q.id);
  const r = (S.engReply && S.engReply.qid === q.id) ? S.engReply : (S.engReply = { qid: q.id, text: '' });
  return '<div class="q-compose"><label for="erText">Your reply</label><textarea id="erText" data-er="text" rows="2">' + esc(r.text) + '</textarea>' +
    (drafts.length ? '<div class="q-photos">' + drafts.map((d) => '<span class="q-photo"><img src="data:image/jpeg;base64,' + d.thumb + '" alt=""><button type="button" class="q-x" data-act="draft-del" data-id="' + esc(d.id) + '" aria-label="Remove photo">×</button></span>').join('') + '</div>' : '') +
    photoPickHtml('reply:' + q.id) +
    '<button type="button" class="btn-save" data-act="er-send" data-id="' + esc(q.id) + '"' + (r.sending ? ' disabled' : '') + '>' + (r.sending ? 'Sending…' : 'Send reply') + '</button></div>';
}
function engSendReply(qid) {
  const r = S.engReply, q = S.queries.queries.find((x) => x.id === qid);
  const drafts = S.drafts.filter((d) => d.purpose === 'reply:' + qid);
  if (!q || r.sending) return;
  if (!String(r.text || '').trim() && !drafts.length) { engSnack('Type a reply or add a photo.', true); return; }
  r.sending = true;
  renderEng();
  let chain = Promise.resolve();
  drafts.forEach((d) => {
    chain = chain.then(() => outboxAdd('uploadPhoto', [{ id: d.id, project: q.project, batchId: qid, area: q.area || '', caption: '', linkedTo: 'query:' + qid, full: d.full, thumb: d.thumb }], 'Photo for a query'))
      .then(() => idbDel('drafts', d.id));
  });
  chain.then(() => outboxAdd('replyQuery', [qid, String(r.text || '').trim(), 'reply', drafts.map((d) => d.id), newId()], 'Reply')).then(loadDrafts).then(() => {
    S.engReply = null;
    engSnack(navigator.onLine ? 'Reply sent.' : 'Saved on your phone. It will send by itself.');
    renderEng();
  });
}

// Engineers → Queries: ask a question (photos, the question, is work on hold, is another team needed) and the list.
function engQueriesHtml() {
  if (!S.queries && !S.queriesLoading) { S.queriesLoading = true; loadQueries(() => { S.queriesLoading = false; }); }
  const proj = S.engProject;
  if (S.engQuery) {
    const q = S.queries && S.queries.queries.find((x) => x.id === S.engQuery);
    if (!q) { S.engQuery = ''; return engQueriesHtml(); }
    markSeenQ(q.id);
    return '<button type="button" class="link-btn" data-act="eq-back">← All queries</button>' +
      '<section class="card eng-card eng-pad q-thread"><h2 class="eng-h2" style="padding-left:0">' + esc(engProjName(q.project)) + ' · ' + esc(q.text.slice(0, 60)) + '</h2>' + queryThreadHtml(q, false) + '</section>';
  }
  if (S.engRegister) return engRegisterHtml(proj);
  const a = S.ask || (S.ask = { text: '', area: '', work: 'continuing', other: 'no', team: '', which: '', photoIds: [] });
  a.photoIds = a.photoIds || [];
  const drafts = S.drafts.filter((d) => d.purpose === 'query' && d.project === proj);
  const areas = ((S.site && S.site.areas) || {})[proj] || [];
  const chip = (field, v, label, red) => '<button type="button" class="q-chip' + (a[field] === v ? (red ? ' on red' : ' on') : '') + '" data-act="ask-chip" data-f="' + field + '" data-v="' + esc(v) + '" aria-pressed="' + (a[field] === v) + '">' + esc(label) + '</button>';
  const list = ((S.queries && S.queries.queries) || []).filter((q) => q.project === proj);
  return '<section class="card eng-card" id="askForm"><h2 class="eng-h2">Ask a question · ' + esc(engProjName(proj)) + '</h2><div class="eng-form">' +
    '<div class="ph-pick" style="padding:0"><label class="btn-save ph-pick-btn">Take photo<input type="file" accept="image/*" capture="environment" data-q-pick="query" hidden></label>' +
    '<label class="btn-outline ph-pick-btn">From gallery<input type="file" accept="image/*" multiple data-q-pick="query" hidden></label></div>' +
    (drafts.length || a.photoIds.length ? '<div class="q-photos">' +
      a.photoIds.map((id) => '<span class="q-photo">' + (S.thumbs[id] ? '<img src="' + S.thumbs[id] + '" alt="">' : '<span class="ph-wait"></span>') + '<button type="button" class="q-x" data-act="ask-unattach" data-id="' + esc(id) + '" aria-label="Remove photo">×</button></span>').join('') +
      drafts.map((d) => '<span class="q-photo"><img src="data:image/jpeg;base64,' + d.thumb + '" alt=""><button type="button" class="q-x" data-act="draft-del" data-id="' + esc(d.id) + '" aria-label="Remove photo">×</button></span>').join('') + '</div>' : '') +
    '<label>Area · pick or type<input id="askArea" list="askAreaList" data-ask="area" value="' + esc(a.area || '') + '" placeholder="e.g. Cabin 3"></label>' +
    '<datalist id="askAreaList">' + areas.map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist>' +
    '<label>Your question<textarea id="askText" data-ask="text" rows="3">' + esc(a.text) + '</textarea></label>' +
    '<div><span class="lbl">Meanwhile, the work is</span><div class="q-chips2">' + chip('work', 'hold', 'On hold', true) + chip('work', 'continuing', 'Continuing') + '</div>' +
    '<span class="muted small">' + (a.work === 'hold' ? 'Shows in red for Shruthi and Savan until someone replies.' : 'They will reply when they can.') + '</span></div>' +
    '<div><span class="lbl">Does another team need to come in?</span><div class="q-chips3">' + chip('other', 'no', 'No') + chip('other', 'yes', 'Yes') + chip('other', 'not_sure', 'Not sure') + '</div>' +
    (a.other === 'yes' ? teamPickHtml(a) : '') + '</div>' +
    '<button type="button" class="eng-big" data-act="ask-send"' + (a.sending ? ' disabled' : '') + '>' + (a.sending ? 'Sending…' : 'Send to Shruthi and Savan') + '</button></div></section>' +
    '<section class="card eng-card"><h2 class="eng-h2">Queries · ' + esc(engProjName(proj)) + '</h2>' +
    waiting('askQuery').map((w) => w.args[0]).filter((x) => x.project === proj).map((x) => '<div class="q-card"><span class="q-card-main"><span class="q-card-top"><span class="muted small">You · just now</span>' +
      '<span class="pill sending">Sending…</span></span><b>' + esc(x.text) + '</b><span class="muted small">' + esc(workText(x)) + '</span></span></div>').join('') +
    (list.length ? list.map((q) => queryCardHtml(q, 'eq-open')).join('') : (waiting('askQuery').some((w) => w.args[0].project === proj) ? '' : '<p class="empty eng-pad">No queries on this project yet.</p>')) +
    '<p class="eng-pad"><button type="button" class="link-btn" data-act="eq-register">Change register</button></p></section>';
}
// "Which team?": Directory labour by trade, so the query links to the real team. Typing a name is the fallback.
const TEAM_OTHER = '__typed';
function teamPickHtml(a) {
  // Grouped by each team's first trade; the option shows them all ("Raju · Painting · Polish").
  const first = (p) => LC.tradesOf(p.trade)[0] || '';
  const labour = ((S.site && S.site.people) || []).filter((p) => p.kind === 'labour').map((p) => Object.assign({}, p, { trade: first(p), all: p.trade }))
    .sort((x, y) => (x.trade || '~').localeCompare(y.trade || '~') || x.name.localeCompare(y.name));
  const opt = (v, label) => '<option value="' + esc(v) + '"' + (a.team === v ? ' selected' : '') + '>' + esc(label) + '</option>';
  const groups = [];
  labour.forEach((p) => {
    const g = p.trade || 'Trade not set';
    if (!groups.length || groups[groups.length - 1].name !== g) groups.push({ name: g, people: [] });
    groups[groups.length - 1].people.push(p);
  });
  return '<label class="q-team">Which team?<select id="askTeam" data-ask-team="1">' + opt('', 'Pick a team…') +
    groups.map((g) => '<optgroup label="' + esc(g.name) + '">' + g.people.map((p) => opt(p.code, p.name + ' · ' + (p.all || g.name))).join('') + '</optgroup>').join('') +
    opt(TEAM_OTHER, 'Not in the list: type the name') + '</select></label>' +
    (a.team === TEAM_OTHER ? '<label class="q-team">Team name<input id="askWhich" data-ask="which" value="' + esc(a.which) + '" placeholder="e.g. AC fitter"></label>' : '');
}
function engSendAsk() {
  const a = S.ask, proj = S.engProject, text = String(a.text || '').trim();
  if (a.sending) return; // a second tap while sending does nothing
  const area = String(a.area || '').trim();
  if (!area) { engSnack('Pick or type the area.', true); return; }
  if (!text) { engSnack('Type your question.', true); return; }
  if (a.other === 'yes' && !a.team) { engSnack('Pick which team needs to come in.', true); return; }
  if (a.other === 'yes' && a.team === TEAM_OTHER && !String(a.which || '').trim()) { engSnack('Type the team’s name.', true); return; }
  const teamCode = a.other === 'yes' && a.team !== TEAM_OTHER ? a.team : '';
  const teamPerson = teamCode && ((S.site && S.site.people) || []).find((p) => p.code === teamCode);
  const which = a.other !== 'yes' ? '' : teamPerson ? teamPerson.name + (teamPerson.trade ? ' · ' + teamPerson.trade : '') : String(a.which || '').trim();
  a.sending = true;
  renderEng();
  const qid = newId(), drafts = S.drafts.filter((d) => d.purpose === 'query' && d.project === proj);
  let chain = Promise.resolve();
  drafts.forEach((d) => {
    chain = chain.then(() => outboxAdd('uploadPhoto', [{ id: d.id, project: proj, batchId: qid, area: area, caption: '', linkedTo: 'query:' + qid, full: d.full, thumb: d.thumb }], 'Photo for a question'))
      .then(() => idbDel('drafts', d.id));
  });
  chain.then(() => outboxAdd('askQuery', [{ id: qid, project: proj, area: area, text: text, workOnHold: a.work === 'hold', otherTeam: a.other, otherTeamCode: teamCode, otherTeamWhich: which, photoIds: (a.photoIds || []).concat(drafts.map((d) => d.id)) }], 'Question'))
    .then(loadDrafts).then(() => {
      // A new area is offered next time straight away (the server keeps it for the project too).
      const all = S.site.areas || (S.site.areas = {}), list = all[proj] || (all[proj] = []);
      if (!list.some((x) => x.toLowerCase() === area.toLowerCase())) list.push(area);
      S.ask = null;
      engSnack(navigator.onLine ? 'Sent. Shruthi and Savan get a notification; you get one when they reply.' : 'Saved on your phone. It will send by itself when there’s signal.');
      renderEng();
    });
}
function addQueryDraftFiles(files, purpose, project) {
  const list = Array.from(files || []);
  if (!list.length) return;
  let chain = Promise.resolve();
  list.forEach((f) => {
    chain = chain.then(() => shrinkPhoto(f)).then((p) => idbPut('drafts', { id: newId(), project: project, purpose: purpose, area: '', full: p.full, thumb: p.thumb, bytes: p.bytes, createdAt: Date.now() }),
      (err) => engSnack(cleanErr(err.message), true));
  });
  chain.then(loadDrafts).then(renderEng);
}

/* ---------- change register ---------- */
// Voided numbers (a change later made Answered) are left out, with a note so the gap in the numbers is explained.
function registerRowsHtml(all, showCost) {
  const rows = all.filter((r) => !r.voided), voided = all.filter((r) => r.voided);
  const note = voided.length ? '<p class="muted small reg-void">Numbers not used: ' + esc(voided.map((r) => r.no).join(', ')) + ' (changed to Answered).</p>' : '';
  if (!rows.length) return '<p class="empty">No changes approved yet.</p>' + note;
  return '<div class="table-box"><table class="ptable reg"><thead><tr><th>No.</th><th>Date</th><th>Area</th><th>Change</th><th>Approved by</th><th>Raised from</th><th>Why' + (showCost ? ' · cost to us' : '') + '</th></tr></thead><tbody>' +
    rows.map((r) => '<tr><td class="mono">' + esc(r.no) + '</td><td>' + esc(niceDay(r.date)) + '</td><td>' + esc(r.area || '—') + '</td><td>' + esc(r.text) + '</td><td>' + esc(nameOfEmail(r.approvedBy)) +
      '</td><td>' + esc(r.raisedFrom) + '</td><td>' + esc(r.cause) + (showCost ? ' · ' + (r.cost ? LC.inr(r.cost) : 'nil') : '') + '</td></tr>').join('') + '</tbody></table></div>' + note;
}
function engRegisterHtml(proj) {
  const rows = ((S.queries && S.queries.register) || []).filter((r) => r.project === proj);
  return '<button type="button" class="link-btn" data-act="eq-back">← All queries</button><section class="card eng-card eng-pad"><h2 class="eng-h2" style="padding-left:0">Change register · ' + esc(proj) + '</h2>' + registerRowsHtml(rows, false) + '</section>';
}
function printRegister(proj) {
  const p = projInfo(proj) || { name: proj };
  const rows = ((S.queries && S.queries.register) || []).filter((r) => r.project === proj);
  S.paper = 'A4'; S.orient = 'landscape'; applyPageSize();
  $('printSheet').className = 'print-sheet sheet paper-A4 landscape';
  $('printSheet').innerHTML = '<div class="sh-head"><img class="sh-logo" src="' + esc(LOGO_URL) + '" alt="O F Turnkey"><div class="sh-titles"><span class="sh-title">' + esc(p.name || proj) +
    ' · Change register</span><span class="sh-sub">' + plural(rows.filter((r) => !r.voided).length, 'approved change', 'approved changes') + '</span></div><span class="sh-date">Printed ' + esc(niceY(todayIso())) + '</span></div>' +
    registerRowsHtml(rows, true);
  window.print();
  loadPrintChoices(); applyPageSize();
}

/* ---------- owners: project → Queries, Needs you, red dots ---------- */
function projectQueriesHtml(p) {
  if (!S.queries && !S.queriesLoading) { S.queriesLoading = true; loadQueries(() => { S.queriesLoading = false; }); }
  if (!S.queries) return '<p class="empty">Loading…</p>';
  const list = S.queries.queries.filter((q) => q.project === p.code).sort(byLastActivity);
  const view = S.qView || 'list';
  const toggle = '<div class="q-toolbar"><div class="seg" role="group" aria-label="View"><button type="button" class="seg-b' + (view === 'list' ? ' on' : '') + '" data-act="q-view" data-v="list">Queries</button>' +
    '<button type="button" class="seg-b' + (view === 'register' ? ' on' : '') + '" data-act="q-view" data-v="register">Change register</button></div>' +
    (view === 'register' && isOwner() ? '<button type="button" class="btn-outline" data-act="q-print" data-code="' + esc(p.code) + '">Print change register</button>' : '') + '</div>';
  if (view === 'register') return toggle + '<section class="card">' + registerRowsHtml(S.queries.register.filter((r) => r.project === p.code), isOwner()) + '</section>';
  if (!S.qSel || !list.some((q) => q.id === S.qSel)) S.qSel = list.length && !phone.matches ? list[0].id : '';
  const sel = list.find((q) => q.id === S.qSel);
  if (sel) markSeenQ(sel.id); // on screen = opened
  const cards = list.map((q) => queryCardHtml(q, 'q-open', q.id === S.qSel)).join('') || '<p class="empty">No queries on this project yet.</p>';
  return toggle + '<div class="pgrid"><nav class="pside q-list" aria-label="Query list">' + cards + '</nav>' +
    '<article class="pmain card q-thread" id="qThread">' + (sel ? queryThreadHtml(sel, isOwner()) : '<p class="empty">Pick a query.</p>') + '</article></div>';
}
// "Needs you" on a project's overview: open queries (work on hold first), tasks overdue or due today, new photos.
function byLastActivity(a, b) {
  const x = (a.last && a.last.at) || a.askedAt, y = (b.last && b.last.at) || b.askedAt;
  return x < y ? 1 : x > y ? -1 : 0;
}
function needsFor(code) {
  const out = [], t = todayIso();
  // Open queries, latest activity first ("New photo from Venky · 2 min ago"), highlighted until opened.
  ((S.queries && S.queries.queries) || []).filter((q) => q.project === code && q.status !== 'closed').sort(byLastActivity).forEach((q) => out.push({
    kind: 'Query', cls: q.workOnHold || q.status === 'open' ? 'bad' : 'wait', title: q.text, fresh: isNewQ(q), photo: q.lastPhotoId,
    sub: lastText(q) + ' · ' + [q.area, workText(q, true)].filter(Boolean).join(' · ') + (q.status === 'waiting_photo' ? ' · waiting for a new photo' : ''),
    act: 'needs-query', id: q.id, label: 'Reply'
  }));
  // Tasks late or due today: most overdue first.
  live().filter((e) => isTask(e) && !e.done && e.project === code && e.due <= t).sort(byDue).forEach((e) => out.push({
    kind: e.due < t ? 'Late' : 'Today', cls: e.due < t ? 'bad' : 'wait', title: LC.taskTitle(S.dir, e), src: e.source, fresh: isNewTask(e, myCode()),
    sub: isMine(e) ? 'Yours' : 'For ' + (e.assignee ? LC.teamName(S.dir, e.assignee) : userName(e.added_by)), dueHtml: dueChip(e), act: 'done', id: e.id, label: 'Done'
  }));
  return out;
}
// One Needs you line (project overview and Today): tag, what, latest activity or whose task, where it came from.
function needLineHtml(n, btnAct, code) {
  return '<div class="need' + (n.fresh ? ' new' : '') + '"><span class="need-tag tag-' + n.cls + '">' + esc(n.kind) + '</span>' +
    (n.photo ? '<span class="need-thumb">' + (S.thumbs[n.photo] ? '<img src="' + S.thumbs[n.photo] + '" alt="">' : '<span class="ph-wait"></span>') + '</span>' : '') +
    '<span class="need-text"><b>' + (n.fresh ? '<span class="new-dot" aria-label="New"></span>' : '') + esc(n.title) + '</b><span class="muted small">' + esc(n.sub) + (n.dueHtml ? ' · ' + n.dueHtml : '') + '</span>' +
    (n.src ? taskSourceHtml(n.src, n.id) : '') + '</span>' +
    (canWrite() ? '<button type="button" class="btn-outline" data-act="' + btnAct + '" data-id="' + esc(n.id) + '"' + (code ? ' data-code="' + esc(code) + '"' : '') + '>' + esc(n.label) + '</button>' : '') + '</div>';
}
function needsHtml(code) {
  const items = needsFor(code);
  return '<section class="card needs" aria-labelledby="needs-h"><div class="sec-head"><h3 id="needs-h">Needs you <span class="muted">· ' + items.length + '</span></h3>' +
    (items.length ? '' : '<span class="sec-note">Everything else is moving on its own</span>') + '</div>' +
    (items.length ? items.map((n) => needLineHtml(n, n.act)).join('') : '<p class="empty">Nothing needs you on this project right now.</p>') + '</section>';
}
function hasNeeds(code) { return needsFor(code).length > 0; }

/* ---------- layout & render ---------- */
const phone = window.matchMedia('(max-width: 699px)');
function placeCodebar() {
  const bar = $('codebar');
  bar.hidden = !canWrite() || S.tab === 'projects'; // viewers have nothing to type; projects have their own screens
  $('viewOnly').hidden = canWrite();
  const want = phone.matches && S.tab === 'ledger' ? $('codebarPhoneSlot') : $('codebarHome');
  if (bar.parentNode !== want) want.appendChild(bar);
}

function renderAll() {
  const a = document.activeElement, id = a && a.id;
  let s0 = null, s1 = null;
  try { if (id && typeof a.selectionStart === 'number') { s0 = a.selectionStart; s1 = a.selectionEnd; } } catch (_) { /* not a text field */ }
  renderStatus();
  renderTabs();
  renderCodebar();
  renderPrint();
  renderSnack();
  $('view-ledger').hidden = S.tab !== 'ledger';
  $('view-projects').hidden = S.tab !== 'projects';
  $('view-tasks').hidden = S.tab !== 'tasks';
  $('view-dir').hidden = S.tab !== 'dir';
  if (S.tab === 'ledger') { renderCalendar(); renderDay(); renderReminders(); renderProjects(); }
  else if (S.tab === 'projects') renderProjectsView();
  else if (S.tab === 'tasks') renderTasks();
  else renderDir();
  placeCodebar();
  decorateBusy();
  if (id) {
    const el = $(id);
    if (el && document.activeElement !== el) {
      el.focus({ preventScroll: true });
      try { if (s0 !== null) el.setSelectionRange(s0, s1); } catch (_) { /* ignore */ }
    }
  }
}

/* ---------- events ---------- */
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  withBusy(el, () => onAct(el));
});
function onAct(el) {
  const act = el.dataset.act, id = el.dataset.id, kind = el.dataset.kind, code = el.dataset.code;
  // Buttons on the opening / sign-in screens work before any ledger data has loaded.
  if (act === 'reload') { location.reload(); return; }
  if (act === 'choose-account') { showSignIn(null, { chooseAccount: true }); return; }
  if (act === 'sign-out-here') { signOutHere(); return; }
  if (S.engineer) { engClick(act, el); return; }
  if (!S.started) return;
  if (photoClick(act, el) || queryClick(act, el)) return;
  const prevVoid = S.confirmVoid, prevDel = S.confirmDel;
  S.confirmVoid = null;
  S.confirmDel = null;
  switch (act) {
    case 'pick': {
      S.sel = el.dataset.date;
      const d = LC.fromIso(S.sel);
      S.y = d.getFullYear(); S.m = d.getMonth(); S.armed = ''; S.saveErr = '';
      break;
    }
    case 'prev': if (S.m === 0) { S.m = 11; S.y--; } else S.m--; break;
    case 'next': if (S.m === 11) { S.m = 0; S.y++; } else S.m++; break;
    case 'today': { const t = new Date(); S.y = t.getFullYear(); S.m = t.getMonth(); S.sel = LC.iso(t); break; }
    case 'filter-project': S.project = S.project === code ? null : code; break;
    case 'set-project': S.project = code; break;
    case 'clear-filter': S.project = null; break;
    case 'tab':
      S.tab = el.dataset.tab;
      window.scrollTo(0, 0);
      if (S.tab === 'dir') loadDevices();
      if (S.tab === 'projects' && S.queries) loadQueries();
      break;
    case 'sess-out':
      if (prevDel === 'sess:' + id) signOutDevice(id); else S.confirmDel = 'sess:' + id;
      break;
    case 'proj-tab': S.projTab = code; S.projSec = 'overview'; break;
    case 'proj-sec': S.projSec = el.dataset.sec; break;
    case 'proj-edit-dir':
      S.tab = 'dir'; startProjInfo(code); loadDevices();
      renderAll();
      { const row = document.querySelector('.pinfo'); if (row) row.scrollIntoView({ block: 'center' }); }
      return;
    case 'pi-edit': startProjInfo(code); break;
    case 'pi-save': saveProjInfo(); return;
    case 'pi-cancel': S.projEdit = null; break;
    case 'me-edit': {
      const u = (S.data.users || []).find((x) => x.email === el.dataset.email);
      if (u) S.memberEdit = { email: u.email, name: u.name, code: u.code || '', projects: (u.projects || []).slice(), err: '' };
      break;
    }
    case 'me-save': saveMemberEdit(); return;
    case 'me-cancel': S.memberEdit = null; break;
    case 'me-remove':
      if (prevDel === 'member:' + el.dataset.email) {
        call('removeMember', [el.dataset.email], () => snack('Removed. Every device they used is signed out.'));
      } else S.confirmDel = 'member:' + el.dataset.email;
      break;
    case 'ma-add': addMember(); return;
    case 'kind': S.kind = kind || ''; break;
    case 'mine': S.mine = !!el.dataset.v; break;
    case 'guide': S.guide = !S.guide; break;
    case 'refresh': refresh(false); break;
    case 'print-toggle':
      S.print = !S.print;
      renderAll();
      if (S.print) $('printPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    case 'pp-period': S.pf.period = el.dataset.v; savePrintChoices(); break;
    case 'pp-type': S.pf.types[el.dataset.v] = !S.pf.types[el.dataset.v]; savePrintChoices(); break;
    case 'pp-mode':
      if (el.dataset.v === '') S.pf.noMode = !S.pf.noMode; else S.pf.modes[el.dataset.v] = !modeOn(el.dataset.v);
      savePrintChoices();
      break;
    case 'pp-modes-all': {
      const on = !allModesOn();
      printModes().forEach((k) => { S.pf.modes[k] = on; });
      S.pf.noMode = on;
      savePrintChoices();
      break;
    }
    case 'pp-paper': S.paper = el.dataset.v; savePrintChoices(); break;
    case 'pp-orient': S.orient = el.dataset.v; savePrintChoices(); break;
    case 'brief-preview':
      call('previewBriefs', [], (res) => { S.briefs = res.previews; });
      break;
    case 'alerts-on': enableAlerts(); return;
    case 'test-alert':
      S.sendingTest = true;
      call('sendTestAlert', [], (res) => {
        S.sendingTest = false;
        const r = res.result || {};
        snack('Test alert sent to ' + plural(r.sent || 0, 'device', 'devices') + (r.failed ? ', ' + r.failed + ' failed' : '') + (r.removed ? ' (' + r.removed + ' old device removed)' : '') + '.', { error: !r.sent });
      }, (msg) => { S.sendingTest = false; snack(msg, { error: true }); });
      break;
    case 'dev-remove':
      if (prevDel === 'dev:' + id) call('removeDevice', [id], () => snack('Device removed. It won’t get morning alerts.'));
      else S.confirmDel = 'dev:' + id;
      break;
    case 'print-go': renderPrint(); window.print(); return;
    case 'save': saveCode(); return;
    case 'cancel-edit': cancelEdit(); return;
    case 'edit': markSeenTask(id); startEdit(id); return;
    case 'done': toggleDone(id); break;
    case 'undo-tick': S.snackMsg = null; { const e = findEntry(id); if (e && e.done) toggleDone(id); } break;
    case 'void': if (prevVoid === id) doVoid(id); else S.confirmVoid = id; break;
    case 'unvoid': call('setEntryStatus', [id, 'unvoid'], () => snack('Entry is back.')); break;
    case 'show-voided': S.showVoided = !S.showVoided; break;
    case 'undo':
      S.snackMsg = null;
      call('setEntryStatus', [id, 'undo'], () => snack('Undone. The entry is voided; “Show voided” on its day can bring it back.'));
      break;
    case 'snack-close': S.snackMsg = null; break;
    case 'dir-add': addCodeFromForm(kind); return;
    case 'tp-add': addTrade(el.dataset.tp, el.dataset.v); return;
    case 'tp-remove': { const o = tpObj(el.dataset.tp); if (o) o.trades = o.trades.filter((x) => x !== el.dataset.v); break; }
    case 'dir-suggest': S.forms[kind].code = code; S.errs[kind] = ''; break;
    case 'dir-edit': startDirEdit(kind, code); break;
    case 'dir-save': saveDirEdit(); return;
    case 'dir-cancel': S.dirEdit = null; break;
    case 'dir-remove': removeCode(kind, code, prevDel); break;
    case 'dir-restore': call('restoreCode', [kind, code], () => snack(code + ' restored. It works in new codes again.')); break;
    case 'dir-arch': S.showArch[kind] = !S.showArch[kind]; break;
    default: return;
  }
  renderAll();
}

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'code') {
    S.code = t.value; S.armed = ''; S.saveErr = '';
    renderCodebar();
  } else if (t.id === 'editDate') {
    if (t.value) { S.editDate = t.value; S.armed = ''; renderCodebar(); }
  } else if (t.dataset.tp) {
    const o = tpObj(t.dataset.tp);
    if (!o) return;
    o.tradeTyped = t.value;
    const m = tradeMatch(t.value);
    // Picked from the list (not typed letter by letter): added straight away.
    if (m.exact && (!ev.inputType || ev.inputType === 'insertReplacementText')) { addTrade(t.dataset.tp, m.exact); return; }
    $('tp-' + t.dataset.tp + '-msg').innerHTML = tradeMsgHtml(t.dataset.tp);
  } else if (t.dataset.form) {
    const k = t.dataset.form;
    S.forms[k][t.dataset.field] = t.value;
    S.errs[k] = '';
    $('dmsg-' + k).innerHTML = dirMsgHtml(k);
  } else if (t.dataset.edit && S.dirEdit) {
    S.dirEdit[t.dataset.edit] = t.value;
    S.dirEdit.err = '';
    $('editMsg').innerHTML = editMsgHtml();
  } else if (t.dataset.pi && S.projEdit) {
    S.projEdit[t.dataset.pi] = t.value;
  } else if (t.dataset.me && S.memberEdit) {
    S.memberEdit[t.dataset.me] = t.value;
  } else if (t.dataset.pcode) {
    S.pcode = t.value;
    $('pcodePreview').innerHTML = projCodePreview(t.dataset.pcode);
  } else if (t.dataset.qc && S.qc) {
    S.qc[t.dataset.qc] = t.value;
    S.qc.err = '';
    if (t.dataset.qc === 'taskWho') redraw(); // the button names the person
    if (S.qc.photoAsk && $('qcAskPreview')) $('qcAskPreview').textContent = 'The engineer will get: “' + photoAskText(S.qc) + '”';
  } else if (t.dataset.co && S.co) {
    S.co[t.dataset.co] = t.value;
    S.co.err = '';
  } else if (t.dataset.qcCheck && S.qc) {
    S.qc[t.dataset.qcCheck] = t.checked;
    renderAll();
  } else if (t.dataset.askTeam && S.ask) {
    S.ask.team = t.value;
    renderEng();
  } else if (t.dataset.ask && S.ask) {
    S.ask[t.dataset.ask] = t.value;
  } else if (t.dataset.er && S.engReply) {
    S.engReply[t.dataset.er] = t.value;
  } else if (t.dataset.draftArea) {
    const d = S.drafts.find((x) => x.id === t.dataset.draftArea);
    if (d) { d.area = t.value; idbPut('drafts', d).catch(() => { /* kept in memory until sent */ }); }
  } else if (t.dataset.phCaption) {
    S.photoCaption = t.value;
  } else if (t.dataset.pc) {
    S.photoComment = S.photoComment || { text: '', due: addDays(todayIso(), 2), err: '' };
    S.photoComment[t.dataset.pc] = t.value;
    if (t.dataset.pc === 'who') renderAll(); // the button names the person
  } else if (t.dataset.ea && S.engAdd) {
    S.engAdd[t.dataset.ea] = t.value;
  } else if (t.id === 'engProject') {
    S.engProject = t.value;
    renderEng();
  } else if (t.dataset.ma) {
    S.memberAdd[t.dataset.ma] = t.value;
  } else if (t.matches('[data-ma-proj]')) {
    S.memberAdd.projects = memberProjects('ma');
  } else if (t.matches('[data-me-proj]') && S.memberEdit) {
    S.memberEdit.projects = memberProjects('me');
  }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'editDate') { S.editDate = t.value || ''; S.armed = ''; S.saveErr = ''; renderCodebar(); return; }
  if (t.id === 'alertsKey' && t.files && t.files[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      S.alertsErr = '';
      call('setAlertsKey', [String(reader.result || '')], () => snack('Firebase key saved. Morning alerts can be sent now.'), (msg) => { S.alertsErr = msg; });
    };
    reader.readAsText(t.files[0]);
    return;
  }
  if (!t.dataset.pf) return;
  S.pf[t.dataset.pf] = t.value;
  savePrintChoices();
  renderPrint();
});

document.addEventListener('keydown', (ev) => {
  const t = ev.target;
  if (t.id === 'code') {
    if (ev.key === 'Enter') { ev.preventDefault(); onEnter(); }
    else if (ev.key === 'Escape' && S.editId) cancelEdit();
  } else if (t.dataset.tp && ev.key === 'Enter') {
    ev.preventDefault();
    tradeTypedOk(t.dataset.tp);
  } else if (t.dataset.form && ev.key === 'Enter') {
    ev.preventDefault();
    addCodeFromForm(t.dataset.form);
  } else if (t.dataset.edit) {
    if (ev.key === 'Enter') { ev.preventDefault(); saveDirEdit(); }
    else if (ev.key === 'Escape') { S.dirEdit = null; renderAll(); }
  } else if (t.dataset.pcode && ev.key === 'Enter') {
    ev.preventDefault();
    projCodeSave(t.dataset.pcode);
  } else if (t.dataset.ma && ev.key === 'Enter') {
    ev.preventDefault();
    addMember();
  } else if (t.dataset.me && ev.key === 'Enter') {
    ev.preventDefault();
    saveMemberEdit();
  }
});

// Coming back to the app (e.g. phone unlocked) picks up entries made on another device.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !sessionToken()) return;
  if (S.engineer) { engCall('getSite', []); if (S.queries) loadQueries(); }
  else if (S.started && !S.pending && Date.now() - S.lastLoad > 60000) refresh(true);
});
if (phone.addEventListener) phone.addEventListener('change', () => { if (S.started) placeCodebar(); });
else phone.addListener(() => { if (S.started) placeCodebar(); });

/* ---------- start ---------- */
// Signed in before on this device: show the ledger from this device's copy at once and bring it up to date.
// Not signed in: Google sign-in.
renderEnvStrip();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* works without it */ });
if (!sessionToken()) {
  showSignIn();
} else {
  try { S.me = JSON.parse(stored(ME_KEY) || 'null'); } catch (_) { S.me = null; }
  const cache = loadCache();
  let siteCache = null;
  try { siteCache = JSON.parse(stored(SITE_KEY) || 'null'); } catch (_) { siteCache = null; }
  if (siteCache && S.me && siteCache.email === S.me.email && S.me.role === 'site_engineer') {
    showEngineer(S.me, siteCache.site);
    boot(true);
  } else if (S.me && S.me.role === 'site_engineer') {
    showEngineer(S.me, null);
    boot(true);
  } else if (cache && S.me && cache.email === S.me.email) {
    S.sheetUrl = cache.sheetUrl || '';
    setData(cache.data);
    firstRender();
    boot(true);
  } else {
    boot(false);
  }
}
})();
