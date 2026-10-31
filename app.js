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
const PRINT_TYPE_LABELS = { P: 'Paid', R: 'Received', F: 'Follow-ups', MT: 'Tasks' };
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
// Whose task, in words, as on the phone: "for Engineer Test · from Shruthi". Nothing on my own task.
function taskWho(e) {
  const owner = e.assignee ? LC.teamName(S.dir, e.assignee) : userName(e.added_by);
  const bits = [];
  if (!isMine(e)) bits.push('for ' + owner);
  if (e.assignee && e.added_by && userName(e.added_by) !== owner) bits.push('from ' + userName(e.added_by));
  return bits.length ? '<span class="for-tag">' + esc(bits.join(' · ')) + '</span>' : '';
}
function withWho(e) { const w = taskWho(e); return w ? ' · ' + w : ''; }
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
// Project associate architects: only their own projects (the server sends no others), never money. They reply to
// queries, comment on photos and give tasks to the engineers on their projects.
function isAssociate() { return !!S.data && S.data.role === 'associate'; }
// Owners and contributors tick any task; associates their own.
function canTick(e) { return canWrite() || (isAssociate() && isMine(e)); }
// People who can sign in now (archived people stay in the lists only for names on old items).
function activeUsers(list) { return (list || []).filter((u) => !u.archived); }
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
  // Ticks still on their way: the screen keeps showing what was asked for, whatever an earlier answer says.
  S.entries.forEach((e) => { if (TICKS[e.id]) e.done = TICKS[e.id].want; });
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
  'ph-task': 'Sending…', 'ph-send': 'Sending…', 'brief-preview': 'Loading…', refresh: 'Updating…', 'pcode-save': 'Saving…', save: 'Saving…',
  'qc-approve': 'Approving…', 'tcode-save': 'Saving…', 'test-alert': 'Sending…' };
function actKey(el) { const d = el.dataset; return d.act + ':' + (d.id || d.code || d.email || d.kind || d.v || ''); }
// Moving around (tabs, sections, opening a query or a task) is never "busy", even when it loads something in the
// background: the bottom bar and tabs must always answer. Only saves lock their button.
const NAV_ACTS = { 'eng-tab': 1, tab: 1, 'proj-tab': 1, 'proj-sec': 1, 'q-view': 1, 'q-open': 1, 'eq-open': 1, 'eq-back': 1, 'eq-register': 1, 'eng-task-open': 1,
  'task-src': 1, 'needs-query': 1, 'today-query': 1, 'today-mine': 1, 'ph-open': 1, 'ph-open-site': 1, lightbox: 1, 'lightbox-close': 1,
  'eng-done-toggle': 1, 'done-toggle': 1, 'reg-open': 1,
  'sc-pick': 1, 'sc-fold': 1, 'sc-step': 1, 'sc-why': 1, 'sc-log-open': 1, 'sc-ownerlog': 1, 'sc-imp-only': 1, 'sc-imp-cancel': 1 };
// Background reads (and "opened") never make a button look busy.
const QUIET_CALLS = { getData: 1, getSite: 1, listPhotos: 1, photoThumbs: 1, photoFull: 1, listQueries: 1, devices: 1, markSeen: 1, changed: 1, refresh: 1 };
// Reads only: safe to ask again.
const READ_CALLS = { boot: 1, getData: 1, getSite: 1, listPhotos: 1, photoThumbs: 1, photoFull: 1, listQueries: 1, devices: 1, previewBriefs: 1 };
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
  // Attachments (replies, photo comments): same idea, kept in memory until sent.
  const atts = Array.from(root.querySelectorAll('input[type=file][data-att]'));
  if (root.matches('input[type=file][data-att]')) atts.push(root);
  atts.forEach((el) => {
    if (el.oftWired) return;
    el.oftWired = true;
    el.addEventListener('change', () => { addAttachments(el.files, el.dataset.att); el.value = ''; });
  });
  // Drawings: the released PDF an owner picked (read, then checked in the upload panel before it goes).
  const dwgs = Array.from(root.querySelectorAll('input[type=file][data-dwg-pick]'));
  if (root.matches('input[type=file][data-dwg-pick]')) dwgs.push(root);
  dwgs.forEach((el) => {
    if (el.oftWired) return;
    el.oftWired = true;
    el.addEventListener('change', () => { if (el.files && el.files[0]) pickDrawing(el.files[0]); el.value = ''; });
  });
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

const BUSY_RE = /busy saving|try again in a moment|lock timeout|too many times|server error occurred|timed out|temporarily unavailable/i;
// One request to the server: { a, s, args } goes in as plain text (no cookies, so the phone's Google
// accounts play no part); { ok, result } or { ok: false, error, signin } comes back.
function api(action, args) {
  const busyKey = QUIET_CALLS[action] ? null : CURRENT_KEY;
  if (busyKey && INFLIGHT[busyKey]) INFLIGHT[busyKey].n++;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  const t0 = performance.now();
  // A read that Google answers with an error code (404, 500…) is asked once more after a moment; saves are not
  // (the first one may have gone through). The message names which address answered, to find the cause.
  const send = (again) => fetch(CONFIG.api, {
    method: 'POST', body: JSON.stringify({ a: action, s: sessionToken(), args: args || [] }),
    credentials: 'omit', redirect: 'follow', cache: 'no-store', signal: ctrl.signal
  }).then((r) => {
    if (r.ok) return r;
    if (again && READ_CALLS[action]) return new Promise((res) => setTimeout(res, 1500)).then(() => send(false));
    let host = '';
    try { host = new URL(r.url).host; } catch (_) { /* no address */ }
    console.warn('Server answered ' + r.status + ' for ' + action + ' from ' + r.url);
    throw new Error('The server answered ' + r.status + (host ? ' (' + host + ')' : '') + '. Please try again.');
  });
  return send(true).then((r) => {
    return r.json().catch(() => { throw new Error('The server sent something unexpected. Please try again.'); });
  }, (err) => {
    if (err && /^The server answered/.test(err.message)) throw err;
    const e = new Error(err && err.name === 'AbortError' ? 'No answer from the server after 90 seconds. Check your signal and try again.'
      : navigator.onLine === false ? 'No signal. Nothing was sent.' : 'Couldn’t reach the server. Check your connection and try again.');
    e.network = true; // the outbox keeps the item and tries again later
    throw e;
  }).then((res) => {
    if (action !== 'changed') { S.timing = { action: action, server: res.ms, total: Math.round(performance.now() - t0) }; renderEnvStrip(); }
    if (!res.ok) {
      const e = new Error(res.error || 'Something went wrong.');
      e.signin = !!res.signin;
      // The sheet busy for a moment, or Google slow: not a refusal. The outbox keeps the item and tries again.
      e.retry = BUSY_RE.test(res.error || '');
      throw e;
    }
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
    if (changedSnack(msg)) { if (onFail) onFail(''); renderAll(); return; }
    if (onFail) onFail(msg); else snack(msg, { error: true });
    renderAll();
  });
}
// Someone changed it since this screen opened it (the server refused the save): say so, with Reload.
function changedSnack(msg) {
  if (!/changed since you opened it/i.test(String(msg || ''))) return false;
  snack(cleanErr(msg), { error: true, action: { act: 'changed-reload', label: 'Reload' } });
  return true;
}
// Brings everything on screen up to date: ledger, queries, and the open project's photos.
function refresh(quiet) {
  call('getData', [], quiet ? null : () => snack('Up to date.'));
  if (S.queries) loadQueries();
  if (S.photosFor) loadPhotos(S.photosFor);
}

// New things show up by themselves: while the app is on the screen it asks every 45 s when anything was last saved
// (a tiny request) and, only if that moved, loads the data again in the background (no "Syncing…", nothing typed is
// disturbed: the redraw waits for typing). Coming back to the screen asks at once.
const POLL_MS = 45000, PAGE_T0 = Date.now();
// After something new arrived, ask every 15 s for the next 2 minutes: what follows straight after (the note after a tick,
// the question after its photo, a reply) then shows within seconds instead of at the next 45 s check.
const FOLLOW_MS = 120000, FOLLOW_EVERY_MS = 15000;
// Test app: what the background refresh did (shown by window.oftDebug for the automated checks).
const POLLDBG = { polls: 0, refreshes: 0, err: '', stamp: '', last: null, follow: 0 };
let lastStamp = null, polling = false, followUntil = 0, followTimer = null;
function pollChanges() {
  if (polling || document.visibilityState !== 'visible' || !sessionToken() || !S.me || (!S.started && !S.engineer)) return;
  polling = true;
  POLLDBG.polls++;
  api('changed', []).then((res) => {
    const st = String(res.stamp || '');
    POLLDBG.stamp = st; POLLDBG.last = lastStamp;
    // The first time: anything saved since this page opened (give or take the clocks) counts as new.
    // A moment's random wait, so every open phone and laptop doesn't ask the server at the same second.
    const moved = lastStamp !== null ? st !== lastStamp : Number(st) > PAGE_T0 - 5000;
    if (moved) { setTimeout(quietRefresh, Math.random() * 8000); followUntil = Date.now() + FOLLOW_MS; }
    lastStamp = st;
    if (Date.now() < followUntil) { clearTimeout(followTimer); followTimer = setTimeout(() => { POLLDBG.follow++; pollChanges(); }, FOLLOW_EVERY_MS); }
  }, (err) => {
    POLLDBG.err = String(err && err.message);
    if (err.signin) { signedOut(err.message); return; }
    // Google busy or the signal gone for a moment: ask again soon rather than in 45 s.
    setTimeout(pollChanges, 10000);
  }).finally(() => { polling = false; });
}
// Only what is on screen is asked for again. The redraw waits until nobody has touched the screen for a few seconds,
// so it never undoes a half-filled form (ticked boxes, a picked option) or moves a button under a finger.
function quietRefresh() {
  const photos = S.engineer ? (S.engTab === 'photos' && S.photosFor) || ''
    : (S.photosFor && S.tab === 'projects' && (S.projSec === 'site' || S.projSec === 'overview')) ? S.photosFor : '';
  // One request for all of it (the server reads the sheet once).
  // An answer that took long must never replace something newer that arrived meanwhile (a save's own answer, Refresh).
  const t0 = Date.now();
  api('refresh', [{ queries: !!S.queries, photos: photos }]).then((res) => {
    POLLDBG.refreshes++;
    if (res.site && !((S.siteAt || 0) > t0) && !OUT.items.some((x) => !x.error)) { S.site = res.site; S.siteAt = Date.now(); store(SITE_KEY, JSON.stringify({ email: S.me.email, site: res.site })); }
    if (res.data && !S.pending && !((S.lastLoad || 0) > t0)) { setData(res.data); saveCache(); }
    if (res.queries && !((S.queriesAt || 0) > t0)) setQueries(res.queries);
    if (res.photos && res.photos.project === S.photosFor && !((S.photosAt || 0) > t0)) { S.photos = res.photos; loadThumbs(res.photos.photos.slice(0, 40).map((p) => p.id)); }
    // A new or withdrawn drawing on his projects: saved (or swapped back) on the phone at once.
    // (Also the first time after opening: it only fetches what the phone doesn't have yet.)
    if (S.engineer && res.dwgs !== undefined && res.dwgs !== S.dwgStamp) { S.dwgStamp = res.dwgs; autoSaveDrawings(true); }
    idleRedraw();
  }, (err) => { POLLDBG.err = 'refresh: ' + String(err && err.message); if (err.signin) signedOut(err.message); });
}
let lastTouch = 0, idleWaiting = false;
['pointerdown', 'keydown', 'input', 'change'].forEach((t) => document.addEventListener(t, () => { lastTouch = Date.now(); }, true));
const IDLE_MS = 8000;
function idleRedraw() {
  if (Date.now() - lastTouch < IDLE_MS) {
    if (!idleWaiting) { idleWaiting = true; setTimeout(() => { idleWaiting = false; idleRedraw(); }, 2000); }
    return;
  }
  bgRedraw();
}
setInterval(pollChanges, POLL_MS);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { pollChanges(); if (S.engineer) autoSaveDrawings(); } });

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
    store(ALERTS_ON_KEY, S.me.email);
    $('notifyBar').hidden = true;
    if (res.data) { setData(res.data); saveCache(); }
    redraw();
    tell(res.notice || 'Alerts are on for this device.');
  }, (err) => { if (err.signin) signedOut(err.message); else { tell(cleanErr(err.message), true); redraw(); } });
}
// "Send me a test alert" (engineer's Today in the test app; owners have it in Directory): only to this device.
function engTestAlert() {
  S.sendingTest = true; renderEng();
  engCall('sendTestAlert', [], () => { S.sendingTest = false; engSnack('Test alert sent to this phone. It should arrive in a few seconds.'); },
    (msg) => { S.sendingTest = false; engSnack(msg, true); });
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
  S.signInAt = performance.now(); // "screen ready" counts from here, not from when the sign-in screen opened
  showGate('O F Turnkey', 'Signing you in…');
  api('signIn', [credential, deviceName()]).then((res) => {
    if (res.noAccess) { showNoAccess(res.me.email); return; }
    store(SESSION_KEY, res.session);
    store(ME_KEY, JSON.stringify(res.me));
    S.me = res.me;
    // The first screen's data usually comes with the sign-in (one call to the server, not two).
    if (res.boot) { bootDone(res.boot); return; }
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
  if (photoClick(act, el) || queryClick(act, el) || dwgClick(act, el) || schedClick(act, el)) return;
  if (act === 'eng-tab') {
    // Leaving Photos with photos not sent: "Send now?" (Cancel leaves them on the phone; Today reminds them).
    const unsent = S.drafts.filter((d) => d.project === S.engProject && !d.purpose);
    if (S.engTab === 'photos' && el.dataset.tab !== 'photos' && unsent.length &&
      window.confirm('You have ' + plural(unsent.length, 'photo', 'photos') + ' not sent. Send now?')) {
      if (unsent.some((d) => !String(d.area || '').trim())) { engSnack('Pick or type an area for each photo, then Send.', true); return; }
      sendDrafts(S.engProject);
    }
    if (el.dataset.proj && el.dataset.proj !== S.engProject) { S.engProject = el.dataset.proj; S.photosFor = ''; }
    S.engTab = el.dataset.tab; S.engQuery = ''; S.engRegister = false; S.engBack = ''; window.scrollTo(0, 0);
    if ((S.engTab === 'queries' || S.engTab === 'today') && S.queries) loadQueries();
    if (S.engTab === 'photos' && S.photosFor) loadPhotos(S.photosFor);
    if (S.engTab === 'drawings') S.dwgsFor = ''; // asked again each time: a new revision shows at once
    renderEng();
  }
  else if (act === 'eng-done') engTick(el.dataset.id, el.checked);
  else if (act === 'eng-undo') { $('engSnack').hidden = true; engTick(el.dataset.id, false); }
  else if (act === 'eng-task-open') {
    const x = ((S.site && S.site.tasks) || []).find((t) => t.id === el.dataset.id);
    if (!x) return;
    markSeenTask(x.id);
    if (x.source && taskSources()[x.source]) openTaskSource(x.source, x.id); else renderEng();
  }
  else if (act === 'done-send') sendDonePhotos(el.dataset.id);
  else if (act === 'done-skip') {
    if (S.holdDone[el.dataset.id]) { engTick(el.dataset.id, false); return; }
    const x = ((S.site && S.site.tasks) || []).find((t) => t.id === el.dataset.id); skipDoneOffer(x ? doneKey(x) : el.dataset.id);
    delete S.justDone[el.dataset.id]; // "No thanks": now it moves to Done recently
    renderEng();
  }
  else if (act === 'eng-done-toggle') { S.engDoneOpen = !S.engDoneOpen; renderEng(); }
  else if (act === 'eng-add') engAddTask();
  else if (act === 'eng-add-open') { S.engAddOpen = true; renderEng(); const n = $('engAddNote'); if (n) n.focus(); }
  else if (act === 'alerts-on') enableAlerts();
  else if (act === 'test-alert') engTestAlert();
}
// Ticks (and unticks) are instant on screen and saved through the outbox. "Ticked off" has Undo for a few
// seconds; unticking puts the task back exactly as it was.
S.ticks = {};
// Tasks from an approved change are finished with a photo: the tick waits on this phone ("held") until the photo is
// added, then the photo and the tick go together. Unticking a held task just puts it back.
S.holdDone = {}; S.justDone = {}; S.doneNote = {};
function photoNeeded(x) { const s = x && taskSources()[x.source]; return !!s && s.kind === 'query' && !!s.changeNo; }
function engTick(id, done) {
  const x = ((S.site && S.site.tasks) || []).find((t) => t.id === id);
  if (done && x && !x.done && !x.done_photo && photoNeeded(x)) {
    S.holdDone[id] = true;
    renderEng();
    engSnack('Add a photo of the finished work to finish this task.');
    return;
  }
  if (!done && S.holdDone[id]) {
    delete S.holdDone[id];
    S.drafts.filter((d) => d.purpose === 'done:' + id).forEach((d) => idbDel('drafts', d.id).catch(() => { /* gone already */ }));
    loadDrafts().then(renderEng);
    return;
  }
  if (done) S.justDone[id] = true; else delete S.justDone[id];
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
    S.engTab = ['queries', 'photos', 'drawings', 'schedule'].indexOf(qs.get('tab')) >= 0 ? qs.get('tab') : 'today';
    if (qs.get('project')) S.engProject = qs.get('project').toUpperCase(); // checked against the engineer's projects on the first draw
    if (qs.get('q')) S.engQuery = qs.get('q');
    setTimeout(checkVersion, 4000);
    setTimeout(askNotifications, 2500);
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
    if (res && res.site) { S.site = res.site; S.siteAt = Date.now(); }
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
const ENG_TABS = [['today', 'Today'], ['queries', 'Queries'], ['photos', 'Photos'], ['drawings', 'Drawings'], ['schedule', 'Schedule']];
// Small icons above the bottom bar's labels (as the design board).
const svgIcon = (d) => '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const ENG_ICONS = {
  today: svgIcon('<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'),
  queries: svgIcon('<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>'),
  photos: svgIcon('<path d="M4 8h3l2-2h6l2 2h3v10H4z"/><circle cx="12" cy="13" r="3"/>'),
  schedule: svgIcon('<rect x="4" y="5" width="16" height="15" rx="1"/><path d="M4 9h16M9 3v4M15 3v4"/>'),
  drawings: svgIcon('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>')
};
const CAMERA_ICON = svgIcon('<path d="M4 8h3l2-2h6l2 2h3v10H4z"/><circle cx="12" cy="13" r="3"/>');
function renderEng() {
  // Keep the cursor where it was: the screen redraws when things arrive in the background.
  const a = document.activeElement, fid = a && a.id;
  let s0 = null, s1 = null;
  try { if (fid && typeof a.selectionStart === 'number') { s0 = a.selectionStart; s1 = a.selectionEnd; } } catch (_) { /* not a text field */ }
  const chartAt = schedScrollBefore();
  renderEngInner();
  schedScrollAfter(chartAt);
  decorateBusy();
  doJump();
  if (fid) {
    const el = $(fid);
    if (el && document.activeElement !== el) { el.focus({ preventScroll: true }); try { if (s0 !== null) el.setSelectionRange(s0, s1); } catch (_) { /* ignore */ } }
  }
}
function renderEngInner() {
  // The bottom bar first, and on its own: nothing below can stop it showing.
  const nav = $('engNav');
  nav.hidden = false;
  // Rebuilt only when it changes: a tap that lands while the screen redraws in the background is never lost.
  const navHtml = ENG_TABS.map((t) => '<button type="button" class="eng-tab' + (S.engTab === t[0] ? ' on' : '') + '" data-act="eng-tab" data-tab="' + t[0] +
    '" aria-pressed="' + (S.engTab === t[0]) + '">' + ENG_ICONS[t[0]] + '<span>' + esc(t[1]) + '</span></button>').join('');
  if (nav.dataset.drawn !== S.engTab) { nav.innerHTML = navHtml; nav.dataset.drawn = S.engTab; }
  const main = $('engMain');
  try {
    const projs = engProjects();
    if (!S.engProject || !projs.some((p) => p.code === S.engProject)) S.engProject = projs.length ? projs[0].code : '';
    $('engProject').innerHTML = projs.length ? projs.map((p) => '<option value="' + esc(p.code) + '"' + (p.code === S.engProject ? ' selected' : '') + '>' + esc(engProjName(p.code)) + '</option>').join('') : '<option>Loading…</option>';
    if (!S.site) main.innerHTML = '<p class="empty">Opening…</p>';
    else if (S.engTab === 'today') main.innerHTML = engTodayHtml();
    else if (S.engTab === 'photos') main.innerHTML = engPhotosHtml();
    else if (S.engTab === 'queries') main.innerHTML = engQueriesHtml();
    else if (S.engTab === 'drawings') main.innerHTML = engDrawingsHtml();
    else if (S.engTab === 'schedule') main.innerHTML = engScheduleHtml();
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
  // A held tick (waiting for its finished-work photo) stays UNticked among the open tasks, marked "Photo needed",
  // with the photo box under it: nothing is done until the photo goes.
  tasks.forEach((x) => { if (S.holdDone[x.id]) { if (x.done) delete S.holdDone[x.id]; else x.held = true; } });
  // Just ticked on this phone: stays where it is, with the note/photo box under it, until Send or No thanks; then it
  // moves to Done recently.
  const stays = (x) => x.done && S.justDone[x.id] && !x.done_note && !x.done_photo && !doneOfferOff(doneKey(x));
  const open = tasks.filter((x) => !x.done || stays(x));
  const doneKeyAt = (x) => x.done_at || '9999'; // ticked here, not saved yet: newest
  const done = tasks.filter((x) => x.done && !stays(x) && (x.done_at ? Date.now() - stampMs(x.done_at) < 86400000 : !!S.ticks[x.id] || !!x.pending))
    .sort((a, b) => (doneKeyAt(a) < doneKeyAt(b) ? 1 : -1));
  const projName = engProjName;
  const who = (email) => { const u = ((S.site && S.site.users) || []).find((x) => x.email === email); return u ? u.name : email; };
  // Only the box ticks. The text opens where the task came from (a query or a photo); a new task shows "New" until then.
  const row = (x) => {
    const fresh = isNewTask(x, engMe().code);
    return '<div class="eng-task' + (x.done ? ' done' : '') + (x.held ? ' held' : '') + (fresh ? ' new' : '') + '">' +
      '<input type="checkbox" data-act="eng-done" data-id="' + esc(x.id) + '"' + (x.done ? ' checked' : '') + ' aria-label="Done: ' + esc(x.note) + '">' +
      '<div class="eng-task-text"><button type="button" class="eng-task-open" data-act="eng-task-open" data-id="' + esc(x.id) + '">' +
      (x.held ? '<b class="photo-needed">Photo needed</b> ' : '') +
      (fresh ? '<span class="new-dot" aria-hidden="true"></span><b class="new-tag">New</b> ' : '') + '<span class="eng-task-note">' + esc(LC.cap(x.note)) + '</span></button>' +
      '<span class="eng-meta">' + esc(projName(x.project)) + ' · ' + dueChip(x) +
      (x.added_by && x.added_by !== S.me.email ? ' · from ' + esc(who(x.added_by)) : '') + (x.pending ? ' · <span class="sending">Sending…</span>' : '') + '</span>' +
      (x.review === 'redo' && x.review_note && !x.done ? '<span class="redo-line">Redo: ' + esc(x.review_note) + '</span>' : '') +
      taskSourceHtml(x.source, x.id) + donePhotoHtml(x) + '</div></div>';
  };
  const a = S.engAdd || (S.engAdd = { note: '', due: '', err: '' });
  // Site photos picked but not sent (per project): "3 photos not sent yet · Send".
  const unsent = {};
  S.drafts.filter((d) => !d.purpose).forEach((d) => { unsent[d.project] = (unsent[d.project] || 0) + 1; });
  const unsentHtml = Object.keys(unsent).map((p) => '<button type="button" class="eng-need eng-need-main eng-unsent" data-act="eng-tab" data-tab="photos" data-proj="' + esc(p) + '">' +
    '<b>' + esc(plural(unsent[p], 'photo', 'photos') + ' not sent yet · Send') + '</b><span class="muted small">' + esc(engProjName(p)) + '</span></button>').join('');
  // Boxes like the owners' Today, in this order; an empty box is one line. Late: most overdue first. Today and coming up:
  // due today, then the next days (later and undated ones last).
  const late = open.filter((x) => x.due && x.due < t), soon = open.filter((x) => !(x.due && x.due < t));
  const doneOpen = !!S.engDoneOpen;
  const doneBox = done.length
    ? '<section class="card eng-card eng-box eng-box-done"><button type="button" class="eng-box-h eng-box-toggle" data-act="eng-done-toggle" aria-expanded="' + doneOpen + '">' +
      '<b>Done recently</b><span class="nbox-n">' + done.length + '</span><span class="muted small">last 24 hours · ' + (doneOpen ? 'hide' : 'show') + '</span></button>' +
      (doneOpen ? done.map(row).join('') : '') + '</section>'
    : engBoxHtml('eng-box-done', 'Done recently', 0, '', 'nothing in the last 24 hours');
  return '<div class="eng-greet"><div class="muted">' + esc(niceDay(t)) + '</div><h1>' + esc(greet + ', ' + name) + '</h1></div>' +
    outboxStatusHtml() + engAlertsHtml() +
    (unsentHtml ? '<section class="card eng-card eng-needs">' + unsentHtml + '</section>' : '') +
    '<button type="button" class="eng-big" data-act="eng-tab" data-tab="queries">' + CAMERA_ICON + '<span>Ask a question</span></button>' +
    engLogCardHtml() +
    '<div class="eng-boxes">' + engNeedsHtml() +
    engBoxHtml('eng-box-late', 'Late', late.length, late.map(row).join('')) +
    engBoxHtml('eng-box-soon', 'Today and coming up', soon.length, soon.map(row).join('')) +
    engWaitingHtml() + doneBox + '</div>' +
    // His own tasks: a small link that opens the form, so the home screen stays quiet.
    (S.engAddOpen || a.note || a.err
      ? '<section class="card eng-card"><h2 class="eng-h2">Add a task for yourself</h2>' +
        '<div class="eng-form"><label>What to do<input id="engAddNote" data-ea="note" value="' + esc(a.note) + '" autocomplete="off" placeholder="Check cove light level at reception"></label>' +
        '<label>Due (optional)<input id="engAddDue" data-ea="due" type="date" value="' + esc(a.due) + '"></label>' +
        '<button type="button" class="btn-main eng-addbtn" data-act="eng-add">Add to my tasks · ' + esc(engProjName(S.engProject)) + '</button>' +
        (a.err ? '<p class="err" role="alert">' + esc(a.err) + '</p>' : '') + '</div></section>'
      : '<button type="button" class="link-btn eng-add-open" data-act="eng-add-open">+ Add a task for yourself</button>') +
    (alertsOnHere() ? '<p class="foot eng-foot">Alerts are on for this phone. <button type="button" class="link-btn" data-act="test-alert"' + (S.sendingTest ? ' disabled' : '') + '>' +
      (S.sendingTest ? 'Sending…' : 'Send me a test alert') + '</button></p>' : '') +
    '<p class="foot eng-foot">Signed in as ' + esc(S.me.email) + '. <button type="button" class="link-btn" data-act="sign-out-here">Sign out of this device</button></p>';
}
// One box of the engineer's Today: its title and count, or a single line when empty.
function engBoxHtml(cls, title, n, body, emptyText) {
  if (!n) return '<section class="card eng-card eng-box ' + cls + ' empty"><div class="eng-box-h"><b>' + esc(title) + '</b><span class="muted small">· ' + esc(emptyText || 'none') + '</span></div></section>';
  return '<section class="card eng-card eng-box ' + cls + '"><div class="eng-box-h"><b>' + esc(title) + '</b><span class="nbox-n">' + n + '</span></div>' + body + '</section>';
}
// Engineer Today, first box: clearer photos Shruthi or Savan asked for (take it right here; gone once sent), and their
// replies to his questions until he opens them.
function engNeedsHtml() {
  if (!S.queries) { if (!S.queriesLoading) { S.queriesLoading = true; loadQueries(() => { S.queriesLoading = false; }); } return ''; }
  const me = S.me.email, mine = S.queries.queries.filter((q) => q.askedBy === me);
  const sending = (qid) => waiting('replyQuery').some((w) => w.args[0] === qid && (w.args[3] || []).length);
  const photoAsks = mine.filter((q) => q.status === 'waiting_photo' && !sending(q.id));
  // An answer that gave him a task shows as that task in My tasks ("New"), not here as well.
  const replies = mine.filter(isNewAnswer);
  if (!photoAsks.length && !replies.length) return engBoxHtml('eng-box-needs', 'Needs you', 0, '');
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
    // An associate's suggestion that an owner approved is the answer.
    const by = nameOfEmail(q.last.by), m = msgs(q).filter((x) => (x.kind === 'reply' || (x.kind === 'suggest' && x.approvedBy)) && x.by !== me && x.text).pop();
    const head = q.last.what === 'closed' ? (q.outcome === 'change' ? 'Change approved' + (q.changeNo ? ' ' + q.changeNo : '') : 'Answered') + ' by ' + by : 'Reply from ' + by;
    return '<button type="button" class="eng-need eng-need-main" data-act="eq-open" data-id="' + esc(q.id) + '"><b><span class="new-dot" aria-label="New"></span>' + esc(head + (m ? ': ' + m.text.slice(0, 120) : '')) + '</b>' +
      '<span class="muted small">' + esc(shortText(q.text) + ' · ' + engProjName(q.project) + ' · ' + ageText(q.last.at) + ' ago') + '</span></button>';
  };
  return engBoxHtml('eng-box-needs eng-needs', 'Needs you', photoAsks.length + replies.length, photoAsks.map(photoItem).join('') + replies.map(replyItem).join(''));
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
  if (!list.length && !sendingAsks.length) return engBoxHtml('eng-box-wait', 'Waiting for an answer', 0, '');
  // "Pantry · work continuing · waiting 7 min" (the area first), with the latest photo.
  const state = (q) => {
    const l = q.last || { what: 'asked', by: me, at: q.askedAt };
    const what = l.by !== me ? (l.what === 'suggest' ? 'suggestion from ' : 'reply from ') + nameOfEmail(l.by) : l.what === 'photo' ? 'photo sent' : l.what === 'reply' ? 'you replied' : '';
    return [q.area, q.workOnHold ? 'work on hold' : 'work continuing', what, waitSince(q) ? 'waiting ' + ageText(waitSince(q)) : ''].filter(Boolean).join(' · ');
  };
  const thumb = (q) => { const ph = cardPhoto(q); wantThumb(ph); return ph ? '<span class="q-thumb">' + (S.thumbs[ph] ? '<img src="' + S.thumbs[ph] + '" alt="">' : '<span class="ph-wait"></span>') + '</span>' : ''; };
  return engBoxHtml('eng-box-wait', 'Waiting for an answer', list.length + sendingAsks.length,
    sendingAsks.map((x) => '<div class="eng-wait"><span class="eng-wait-main"><b>' + esc(x.text) + '</b><span class="muted small">' + esc([x.area, engProjName(x.project)].filter(Boolean).join(' · ')) + ' · <span class="sending">Sending…</span></span></span></div>').join('') +
    list.map((q) => '<button type="button" class="eng-wait' + (q.workOnHold || waitDays(q) ? ' hold' : '') + '" data-act="eq-open" data-id="' + esc(q.id) + '">' + thumb(q) + '<span class="eng-wait-main"><b>' + esc(q.text) + '</b>' +
      '<span class="small eng-wait-state">' + esc(LC.cap(state(q))) + '</span><span class="muted small">' + esc(engProjName(q.project)) + '</span></span></button>').join(''));
}
// After ticking: "Done. Add a note or a photo of the finished work?" (optional; for tasks from a query or a photo, and
// any task just ticked on this phone). A task from an approved change: the photo is needed before it counts as done.
// Owners then see "Done, with photo" and the note.
function donePhotoHtml(x) {
  if (!x.done && !S.holdDone[x.id]) return '';
  const sending = waiting('addDonePhoto').concat(waiting('setDone').filter((w) => (w.args[2] || []).length)).some((w) => w.args[0] === x.id);
  const noteLine = x.done_note ? '<span class="done-note small">Your note: ' + esc(x.done_note) + '</span>' : '';
  if (sending) return '<span class="done-photo">Done, with photo · <span class="sending">Sending…</span></span>';
  if (x.done_photo) return '<span class="done-photo">Done, with photo</span>' + noteLine;
  const held = !!S.holdDone[x.id];
  if (!held && (x.done_note || doneOfferOff(doneKey(x)) || !(/^(query|photo):/.test(x.source || '') || S.justDone[x.id]))) return noteLine;
  const drafts = S.drafts.filter((d) => d.purpose === 'done:' + x.id);
  return '<div class="done-offer' + (held ? ' needed' : '') + '"><span class="small">' + (held
    ? '<b>Add a photo of the finished work to finish this task.</b> Approved changes are checked from the photo.'
    : '<b>Done. Add a note or a photo of the finished work?</b> (optional)') + '</span>' +
    (drafts.length ? '<div class="q-photos">' + drafts.map((d) => '<span class="q-photo"><img src="data:image/jpeg;base64,' + d.thumb + '" alt=""><button type="button" class="q-x" data-act="draft-del" data-id="' + esc(d.id) + '" aria-label="Remove photo">×</button></span>').join('') + '</div>' : '') +
    photoPickHtml('done:' + x.id) +
    '<label class="done-note-in small">Note (optional)<input id="dn-' + esc(x.id) + '" data-dn="' + esc(x.id) + '" value="' + esc(S.doneNote[x.id] || '') + '" autocomplete="off" placeholder="e.g. used the white from the store"></label>' +
    '<div class="ph-btns"><button type="button" class="btn-save" data-act="done-send" data-id="' + esc(x.id) + '">' +
    (held ? (drafts.length ? 'Send and finish' : 'Add the photo first') : drafts.length ? 'Send ' + plural(drafts.length, 'photo', 'photos') : 'Send note') + '</button>' +
    '<button type="button" class="link-btn" data-act="done-skip" data-id="' + esc(x.id) + '">' + (held ? 'Not finished yet' : 'No thanks') + '</button></div></div>';
}
const DONE_SKIP_KEY = 'oft.doneskip.' + CONFIG.env;
// "No photo" is remembered per task, and asked again after a "Redo".
function doneKey(x) { return x.id + (x.review === 'redo' ? ':redo:' + String(x.review_note || '').slice(0, 20) : ''); }
function doneOfferOff(id) { try { return (JSON.parse(stored(DONE_SKIP_KEY) || '[]')).indexOf(id) >= 0; } catch (_) { return false; } }
function skipDoneOffer(id) {
  let list = [];
  try { list = JSON.parse(stored(DONE_SKIP_KEY) || '[]'); } catch (_) { list = []; }
  list.push(id);
  store(DONE_SKIP_KEY, JSON.stringify(list.slice(-50)));
}
// The photos (through the outbox, one by one), then the tick with them (a held task) or the photos and note on the tick.
function sendDonePhotos(id) {
  const x = ((S.site && S.site.tasks) || []).find((t) => t.id === id);
  const drafts = S.drafts.filter((d) => d.purpose === 'done:' + id), note = String(S.doneNote[id] || '').trim(), held = !!S.holdDone[id];
  if (!x) return;
  if (held && !drafts.length) { engSnack('Take or pick a photo of the finished work first.', true); return; }
  if (!drafts.length && !note) { engSnack('Type a note or add a photo, or tap “No thanks”.', true); return; }
  const src = taskSources()[x.source] || {};
  let chain = Promise.resolve();
  drafts.forEach((d) => {
    chain = chain.then(() => outboxAdd('uploadPhoto', [{ id: d.id, project: x.project, batchId: id, area: src.area || '', caption: '', linkedTo: 'done:' + id, full: d.full, thumb: d.thumb }], 'Photo of finished work'))
      .then(() => idbDel('drafts', d.id));
  });
  const ids = drafts.map((d) => d.id);
  chain.then(() => (held ? outboxAdd('setDone', [id, true, ids, note], 'Tick with photo') : outboxAdd('addDonePhoto', [id, ids, note], drafts.length ? 'Done, with photo' : 'Note on a done task')))
    .then(loadDrafts).then(() => {
      if (held) { delete S.holdDone[id]; S.ticks[id] = { done: true, at: Date.now() }; }
      delete S.doneNote[id];
      delete S.justDone[id]; // now it moves to Done recently
      skipDoneOffer(doneKey(x));
      engSnack(!drafts.length ? 'Note sent.' : navigator.onLine ? 'Sending the photo. Shruthi and Savan will see “Done, with photo”.' : 'Saved on your phone. It will send by itself.');
      renderEng();
    });
}
// Every place a photo can be added: the camera, or the gallery (withFiles: PDFs from the phone's files too).
function photoPickHtml(purpose, withFiles) {
  return '<div class="ph-pick"><label class="btn-main ph-pick-btn">Take photo<input type="file" accept="image/*" capture="environment" data-q-pick="' + esc(purpose) + '" hidden></label>' +
    '<label class="btn-outline ph-pick-btn">' + (withFiles ? 'Gallery or PDF' : 'From gallery') + '<input type="file" accept="' + (withFiles ? 'image/*,application/pdf' : 'image/*') + '" multiple data-q-pick="' + esc(purpose) + '" hidden></label></div>';
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
  // On his list at once ("Sending…"), even with the cursor still in the box (a background redraw would wait for typing).
  outboxAdd('addEntry', [code, sel, cid], 'Task', { id: cid, note: note, project: S.engProject, due: a.due || todayIso() }).then(renderEng);
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
  // Drawings kept for no signal go too (a lost phone keeps nothing).
  try { Object.keys(localStorage).filter((k) => k.indexOf(DWG_LIST_KEY) === 0).forEach((k) => localStorage.removeItem(k)); } catch (_) { /* storage blocked */ }
  idbDo('dwgs', 'readwrite', (st) => st.clear()).catch(() => { /* nothing saved */ });
  S.dwgs = null; S.dwgsFor = ''; S.dwgKeys = [];
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

// The server's first answer (from boot, or with the sign-in): who this is and their data.
function bootDone(res) {
  S.me = res.me;
  store(ME_KEY, JSON.stringify(res.me));
  if (res.noAccess) { forgetDevice(); showNoAccess(res.me.email); return; }
  if (res.engineer) {
    store(CACHE_KEY, null); store(SITE_KEY, JSON.stringify({ email: res.me.email, site: res.site })); showEngineer(res.me, res.site); startOutbox();
    setTimeout(() => autoSaveDrawings(true), 3000); // his drawings, saved on the phone by themselves
    return;
  }
  S.sheetUrl = res.sheetUrl || '';
  setData(res.data);
  saveCache();
  firstRender(true);
  startOutbox();
}
// fromCache: the ledger is already on screen from this device's copy; this just brings it up to date.
function boot(fromCache) {
  if (!fromCache) showGate('O F Turnkey', 'Opening…');
  S.pending++;
  renderStatus();
  api('boot', []).then((res) => {
    S.pending--;
    bootDone(res);
  }, (err) => {
    S.pending--;
    if (err.signin) { signedOut(err.message); return; }
    const why = err.network ? 'No signal right now.' : cleanErr(err.message);
    if (S.started) { snack(why + ' Showing what was last saved on this device.', { error: !err.network }); renderAll(); return; }
    if (S.engineer) { engSnack(why + ' Showing what was saved on this phone. Anything you send waits and goes by itself.', !err.network); startOutbox(); return; }
    showGate('O F Turnkey', cleanErr(err.message), { error: true, button: TRY_AGAIN });
  });
}

// What the opening time was spent on (test strip): loading the page files, waiting for the server (nothing saved on
// this device yet), or a tab that opened in the background. So a slow "screen ready" can be explained.
function readyReason(fromServer) {
  const bits = [];
  try {
    const app = performance.getEntriesByType('resource').find((r) => /\/app\.js(\?|$)/.test(r.name));
    if (app && app.responseEnd > 1500) bits.push('page files ' + secs(app.responseEnd));
  } catch (_) { /* timing not available */ }
  if (S.signInAt) bits.push('after sign-in');
  else if (fromServer) bits.push('waited for the server: nothing saved on this device yet');
  else bits.push('from this device’s copy');
  if (S.openedHidden) bits.push('opened in the background');
  return bits.join(', ');
}
S.openedHidden = document.visibilityState === 'hidden';

/* ---------- new versions ---------- */
// A tab or installed app left open keeps running the code it loaded. So whenever the app opens or comes back to the
// screen (and every 30 minutes), it asks for the published version. Newer: it reloads by itself when nothing is being
// typed or waiting to send; otherwise (or if a reload didn't bring it) it offers "New version · Tap to update".
let versionAskedAt = 0;
const RELOADED_KEY = 'oft.reloadedFor.' + CONFIG.env;
function checkVersion() {
  if (Date.now() - versionAskedAt < 60000 || /__VERSION__/.test(CONFIG.version)) return;
  versionAskedAt = Date.now();
  fetch('config.js?v=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((t) => {
    const m = /version:\s*'([^']+)'/.exec(t);
    if (!m || m[1] === CONFIG.version || m[1] < CONFIG.version) return;
    let tried = '';
    try { tried = sessionStorage.getItem(RELOADED_KEY) || ''; } catch (_) { /* storage blocked */ }
    const busy = isTyping() || OUT.items.some((x) => !x.error) || S.pending || S.saving || OUT.sending;
    if (!busy && tried !== m[1]) {
      try { sessionStorage.setItem(RELOADED_KEY, m[1]); } catch (_) { /* reload anyway */ }
      location.reload();
      return;
    }
    $('updStrip').hidden = false;
  }, () => { /* offline: next time */ });
}
setInterval(checkVersion, 30 * 60000);

/* ---------- notifications on this device ---------- */
// First open: "Allow notifications?" with the reason; blocked: how to turn them on. Everyone who gets alerts is asked
// (the test app too: there it is only for each person's own test alert). "Not now" hides it for a day, then it asks
// again; until alerts are on, the engineer's Today also has a "Turn on alerts" card.
const NOTIFY_ASKED_KEY = 'oft.notifyAsked.' + CONFIG.env;
// Alerts were turned on from this device, for this person (the server has its address).
const ALERTS_ON_KEY = 'oft.alertsOn.' + CONFIG.env;
const NOTIFY_AGAIN_MS = 24 * 3600 * 1000;
function notifyWanted() {
  if (!CONFIG.firebase || !('Notification' in window)) return false;
  return ['owner', 'contributor', 'site_engineer', 'associate'].indexOf(S.me && S.me.role) >= 0;
}
function alertsOnHere() { return notifyWanted() && Notification.permission === 'granted' && !!S.me && stored(ALERTS_ON_KEY) === S.me.email; }
function notifyReason() {
  return CONFIG.env === 'test' ? 'Test app: only so you can send yourself a test alert. Nothing else is ever sent from here.'
    : S.engineer ? 'So you hear at once when Shruthi or Savan reply, give you a task, or need a photo.' : 'So you hear at once about urgent queries, new site photos and your 7:00 brief.';
}
// The site's own permission first: on 28 Oct Venky's phone stayed blocked with only the phone's Chrome setting on.
const BLOCKED_HELP = '1. In Chrome (not the home-screen icon), open this app, tap the icon left of the address (the bar may be at the bottom) → Notifications → Allow. ' +
  '2. Phone Settings → Apps → Chrome → Notifications → on; if the app is on your home screen, also Apps → O F Turnkey → Notifications → on. ' +
  '3. Close the app fully and open it again.';
function askNotifications() {
  const bar = $('notifyBar');
  if (!notifyWanted() || alertsOnHere()) { bar.hidden = true; return; }
  const perm = Notification.permission;
  if (perm === 'denied') {
    bar.hidden = false;
    bar.className = 'notify-bar blocked';
    bar.innerHTML = '<b>Notifications are blocked for O F Turnkey.</b> ' + esc(BLOCKED_HELP) + ' <button type="button" class="link-btn" data-act="notify-hide">Hide</button>';
    return;
  }
  // Allowed, but this person's alerts aren't on here yet (e.g. another account used this phone): the same question.
  const asked = Number(stored(NOTIFY_ASKED_KEY)) || 0;
  if (Date.now() - asked < NOTIFY_AGAIN_MS) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.className = 'notify-bar';
  bar.innerHTML = '<b>Allow notifications?</b> ' + esc(notifyReason()) +
    ' <button type="button" class="btn-main" data-act="notify-allow">Allow</button> <button type="button" class="link-btn" data-act="notify-hide">Not now</button>';
  if (S.engineer) renderEng(); // its Today card waits while the bar asks
}
// Engineer's Today, until alerts are on for this phone: a clear card (blocked: where to allow them). Test app: once on,
// "Send me a test alert" (only this phone gets it).
function engAlertsHtml() {
  if (!notifyWanted()) return '';
  // Not while the "Allow notifications?" bar asks the same thing at the top.
  if (alertsOnHere() || !$('notifyBar').hidden) return '';
  const blocked = Notification.permission === 'denied';
  return '<section class="card eng-card eng-alerts"><h2 class="eng-h2">' + (blocked ? 'Alerts are blocked on this phone' : 'Turn on alerts') + '</h2><div class="eng-pad">' +
    (blocked ? '<p class="small">' + esc(BLOCKED_HELP) + ' Then tap Turn on alerts.</p>' : '<p class="small">' + esc(notifyReason()) + '</p>') +
    '<button type="button" class="btn-main eng-addbtn" data-act="alerts-on">Turn on alerts</button></div></section>';
}
function firstRender(fromServer) {
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
    if (['overview', 'site', 'queries', 'drawings'].indexOf(qs.get('sec')) >= 0) S.projSec = qs.get('sec');
    // A "New drawing" alert (?tab=drawings&project=NST): that project's Drawings.
    if (tab === 'drawings') { S.tab = 'projects'; S.projSec = 'drawings'; }
    if (qs.get('q')) S.qSel = qs.get('q');
    $('logoSlot').innerHTML = logoHtml();
    // Phones open on Today (the morning view); laptops on the Ledger. A link from an alert says where to go.
    if (!tab && phone.matches) { S.tab = 'projects'; if (!S.projTab) S.projTab = '_today'; }
    loadPrintChoices();
    applyPageSize();
    S.readyMs = Math.round(performance.now() - (S.signInAt || 0));
    S.readyWhy = readyReason(fromServer);
    setTimeout(checkVersion, 4000);
    setTimeout(askNotifications, 2500);
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
  if (S.readyMs) bits.push('screen ready ' + secs(S.readyMs) + (S.readyWhy ? ' (' + esc(S.readyWhy) + ')' : ''));
  if (S.timing) bits.push('last request “' + esc(S.timing.action) + '”: server ' + secs(S.timing.server || 0) + ', total ' + secs(S.timing.total));
  bits.push('version ' + esc(CONFIG.version));
  el.innerHTML = '<b>TEST APP</b> · works on a test copy of the sheet · nothing here changes the real ledger<br>' + bits.join(' · ');
}

/* ---------- snack bar ---------- */
let snackTimer = null;
function snack(text, opts) {
  opts = opts || {};
  S.snackMsg = { text: text, error: !!opts.error, undoId: opts.undoId || null, undoTick: opts.undoTick || null, action: opts.action || null };
  renderSnack();
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => { S.snackMsg = null; renderSnack(); }, opts.action ? 15000 : opts.undoId ? 10000 : opts.undoTick ? 5000 : opts.error ? 9000 : 4500);
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
    (m.action ? '<button type="button" class="undo" data-act="' + esc(m.action.act) + '">' + esc(m.action.label) + '</button>' : '') +
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
  // Associates: no ledger, no Directory.
  $('tabs').innerHTML = isAssociate() ? t('projects', 'Projects') + t('tasks', 'Tasks', open)
    : t('ledger', 'Ledger') + t('projects', 'Projects') + t('tasks', 'Tasks', open) + t('dir', 'Directory');
}
function photoAlertsOn() { return !(S.data && S.data.prefs && S.data.prefs.photoAlerts === false); }
// The header and footer say what this person's app is: associates have no ledger, sheet or print sheets.
function renderShell() {
  const a = isAssociate();
  document.querySelector('.hdr-title b').textContent = a ? 'Projects' : 'Site ledger';
  document.querySelector('.hdr-sub').textContent = a ? 'Site photos, queries, changes and tasks on your projects' : 'Payments, receipts, follow-ups & tasks across all projects';
  $('printToggle').hidden = a;
  $('sheetNote').hidden = a;
  // Each person's own setting: photo alerts on or off (owners and associates get them).
  $('prefNote').innerHTML = isOwner() || a ? 'Photo alerts for me: <b>' + (photoAlertsOn() ? 'on' : 'off') + '</b> <button type="button" class="link-btn" data-act="pref-photo">' +
    (photoAlertsOn() ? 'Turn off' : 'Turn on') + '</button> · ' : '';
  if (a && ['projects', 'tasks'].indexOf(S.tab) < 0) S.tab = 'projects';
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
    '<span><b>P</b>       TYPE PROJECT WHO AMOUNT MODE note       e.g. P SA BAB 25k C</span>' +
    '<span><b>R</b>       TYPE PROJECT WHO-PAID AMOUNT MODE note  e.g. R NST CL 50L T (received from the client: CL)</span>' +
    '<span><b>F</b>       TYPE PROJECT WHO dd/mm note             e.g. F SA ZAM 18/10 gate drawings</span>' +
    '<span><b>MT</b>      task: TYPE PROJECT dd/mm what-to-do     e.g. MT SA 15/10 send revised BOQ</span>' +
    '<span><b>MT @</b>    add @code to give it to someone         e.g. MT NST @VNK 26/11 seal pantry joint (a task for Venky)</span>' +
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
    call('editEntry', [ed.id, raw, date, S.editBase || ''], (res) => {
      S.saving = false; S.editId = null; S.editDate = ''; setCode('');
      const e = findEntry(ed.id);
      if (e) { S.sel = sitsOn(e); const d = LC.fromIso(S.sel); S.y = d.getFullYear(); S.m = d.getMonth(); }
      // A task from a change: its new text can go into the change register too.
      const o = res && res.registerOffer;
      S.regOffer = o || null;
      if (o) snack('Task updated. ' + o.no + ' in the change register still says “' + o.was + '”.', { action: { act: 'reg-sync', label: 'Change ' + o.no + ' too' } });
      else snack('Entry updated. Before and after are in the Changes tab.');
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
  S.editBase = e.updated_at || ''; // the version opened: a save is refused if it changed since
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
// A tick shows at once and is sent one at a time per task, and the last wish wins: a quick Undo must never be
// overtaken by the tick's own answer (or a background refresh) arriving afterwards and ticking it again.
const TICKS = {}; // task id → { want: true/false, busy: a request is on its way }
function toggleDone(id) {
  const e = findEntry(id);
  if (!e) return;
  setTick(id, !e.done);
  if (e.done) snack('Ticked off: ' + LC.taskTitle(S.dir, e), { undoTick: id });
  else if (S.snackMsg && S.snackMsg.undoTick === id) S.snackMsg = null;
}
function setTick(id, done) {
  const t = TICKS[id] || (TICKS[id] = { want: done, busy: false });
  t.want = done;
  const e = findEntry(id);
  if (e) { e.done = done; if (done) S.doneIds[id] = true; else delete S.doneIds[id]; }
  if (!t.busy) sendTick(id);
}
function sendTick(id) {
  const t = TICKS[id], want = t.want;
  t.busy = true;
  S.pending++;
  renderStatus();
  api('setDone', [id, want]).then((res) => {
    S.pending--;
    t.busy = false;
    if (t.want !== want) { sendTick(id); return; } // changed meanwhile (Undo): send the latest
    delete TICKS[id];
    if (res && res.data) { setData(res.data); saveCache(); }
    renderAll();
  }, (err) => {
    S.pending--;
    delete TICKS[id];
    if (err.signin) { signedOut(err.message); return; }
    if (!err.dup) snack(cleanErr(err.message), { error: true });
    refresh(true);
  });
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
    // Cut-off lines show in full on hover (laptop); overdue tasks are red, as everywhere else.
    h += mo.slice(0, 2).map((e) => '<span class="cal-chip t-' + e.type + '" title="' + esc(LC.describe(S.dir, e) + ' · ' + projName(e.project)) + '">' + esc(e.type + ' ' + LC.short(e.amount) + ' ' + e.who) + '</span>').join('');
    if (mo.length > 2) h += '<span class="cal-more">+' + (mo.length - 2) + ' more</span>';
    if (tk.length) {
      h += '<span class="cal-tasks">' + tk.slice(0, 2).map((e) => '<span class="cal-task t-' + e.type + (e.done ? ' done' : e.due < t ? ' late' : '') + '" title="' +
        esc(LC.taskTitle(S.dir, e) + ' · ' + projName(e.project) + (e.done ? ' · done' : ' · ' + LC.dueText(e.due, t).text)) + '"><span class="cal-box"></span><span class="cal-tt">' + e.type +
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
    '<span>' + badge('F', true) + 'Follow-up due (below the line)</span><span>' + badge('MT', true) + 'Task due (below the line)</span></div>';
}

function voidBtn(e) {
  if (!isOwner()) return '';
  const c = S.confirmVoid === e.id;
  return '<button type="button" class="void-btn' + (c ? ' confirm' : '') + '" data-act="void" data-id="' + esc(e.id) + '">' + (c ? 'Void this entry?' : 'Void') + '</button>';
}
function tickBtn(e) {
  const fg = TFG[e.type];
  const box = '<span class="tick-box" style="border-color:' + fg + ';background:' + (e.done ? fg : '#FFFFFF') + '">' + (e.done ? CHECK : '') + '</span>';
  if (!canTick(e)) return '<span class="tick" role="img" aria-label="' + (e.done ? 'Done' : 'Not done') + '">' + box + '</span>';
  return '<button type="button" class="tick" data-act="done" data-id="' + esc(e.id) + '" aria-label="' + (e.done ? 'Mark not done' : 'Mark done') + '" aria-pressed="' + !!e.done + '">' + box + '</button>';
}
function itemActions(e) { const h = editBtn(e) + voidBtn(e); return h ? '<span class="item-actions">' + h + '</span>' : ''; }
function moneyItem(e) {
  return '<div class="item">' + badge(e.type) + mainOpen(e) + '<span>' + esc(LC.describe(S.dir, e)) + '</span>' +
    '<span class="item-meta">' + esc(projName(e.project)) + ' · <code>' + esc(e.raw_code) + '</code>' + byTag(e) + '</span>' + mainClose() + itemActions(e) + '</div>';
}
// Task lines everywhere say whose task it is in words ("for Engineer Test · from Shruthi"); the code (MT NST @ETS …)
// shows only when the task is opened for editing.
function taskItem(e) {
  return '<div class="item">' + tickBtn(e) + '<div class="tcard-body">' + mainOpen(e) + '<span' + (e.done ? ' style="text-decoration:line-through"' : '') + '>' +
    newTaskTag(e) + esc(LC.taskTitle(S.dir, e)) + '</span>' +
    '<span class="item-meta">' + esc(projName(e.project)) + withWho(e) + ' · ' + dueChip(e) + ' · noted ' + esc(LC.nice(e.date)) + '</span>' + mainClose() +
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
  return '<div class="rem-item"><div class="tcard-body">' + mainOpen(e) + '<span style="font-size:13px">' + newTaskTag(e) + esc(LC.taskTitle(S.dir, e)) + '</span>' +
    '<span class="item-meta">' + esc(projName(e.project)) + withWho(e) + ' · ' + dueChip(e) + '</span>' + mainClose() + taskSourceHtml(e.source, e.id) + '</div>' +
    (canTick(e) ? '<span class="item-actions">' + editBtn(e) + '<button type="button" class="btn-sm" data-act="done" data-id="' + esc(e.id) + '">Done</button></span>' : '') + '</div>';
}

function renderReminders() {
  const t = todayIso(), in7 = addDays(t, 7);
  const open = live().filter((e) => isTask(e) && !e.done && inFilter(e)).sort(byDue);
  // Overdue and Today in full; the next 7 days as one line to the Tasks tab, so this column is no taller than the calendar.
  // The 3 most overdue and today's, then "+ N more · All tasks →": the column ends cleanly, no scrolling inside it.
  const late = open.filter((e) => e.due < t), today = open.filter((e) => e.due === t);
  const groups = [
    ['Overdue', '#8C1D18', late.slice(0, 3), late.length],
    ['Today', '#5E4500', today, today.length]
  ];
  const more = (late.length - Math.min(3, late.length)) + open.filter((e) => e.due > t && e.due <= in7).length;
  $('reminders').innerHTML =
    '<div class="sec-head" style="align-items:center"><h2 id="al-h">Reminders</h2>' +
    '<button type="button" class="btn-outline" style="margin-left:auto" data-act="tab" data-tab="tasks">All tasks</button></div>' +
    groups.map((g) => '<div class="rem-group"><div class="rem-title" style="color:' + g[1] + '">' + g[0] + '<span class="mono">' + g[3] + '</span></div>' +
      (g[2].length ? g[2].map(remItem).join('') : '<span class="empty">None</span>') + '</div>').join('') +
    '<button type="button" class="link-btn rem-more" data-act="tab" data-tab="tasks">' + (more ? '+ ' + more + ' more · ' : '') + 'All tasks →</button>';
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
    '<span class="tcard-meta"><span>' + esc(projName(e.project)) + withWho(e) + '</span>' + dueChip(e) + '</span>' + redoLine(e) + (e.done ? doneNoteHtml(e) : '') + mainClose() +
    taskSourceHtml(e.source, e.id) + donePhotoStrip(e) + reviewHtml(e) + '</div>' + (isOwner() ? '<span class="item-actions">' + editBtn(e) + '</span>' : '') + '</div>';
}
// "Redo: …" on a task an owner sent back.
function redoLine(e) { return e.review === 'redo' && e.review_note && !e.done ? '<span class="redo-line">Redo: ' + esc(e.review_note) + '</span>' : ''; }
// A ticked task with a photo of the finished work (or redone after "Redo") that no owner has checked yet.
function needsReview(e) { return !!e && e.type === 'MT' && e.status !== 'void' && e.done && e.review !== 'ok' && (!!e.done_photo || e.review === 'redo'); }
// Owners: "Looks good ✓" closes it; "Redo" sends it back to its person's list with a note (and a new due date).
// anyDone: "Done recently" offers the check on every ticked task, with a photo or not.
function reviewHtml(e, anyDone) {
  if (!isOwner()) return e && e.done && e.review === 'ok' ? '<span class="due due-done">Checked ✓</span>' : '';
  if (e.done && e.review === 'ok') return '<span class="due due-done">Checked ✓</span>';
  if (!needsReview(e) && !(anyDone && e.done && e.type === 'MT' && e.status !== 'void')) return '';
  const r = S.redo && S.redo.id === e.id ? S.redo : null;
  if (!r) {
    return '<div class="review"><button type="button" class="btn-accent" data-act="rv-ok" data-id="' + esc(e.id) + '">Looks good ✓</button>' +
      '<button type="button" class="btn-outline" data-act="rv-redo" data-id="' + esc(e.id) + '">Redo</button></div>';
  }
  return '<div class="review review-form"><label>What needs redoing<textarea id="rvNote" data-rv="note" rows="2" placeholder="The joint is still visible near the door">' + esc(r.note) + '</textarea></label>' +
    '<label class="ph-due">Due <input type="date" data-rv="due" value="' + esc(r.due) + '"></label>' +
    (r.err ? '<p class="err" role="alert">' + esc(r.err) + '</p>' : '') +
    '<div class="ph-btns"><button type="button" class="btn-accent" data-act="rv-send" data-id="' + esc(e.id) + '">Send back to ' + esc(e.assignee ? LC.teamName(S.dir, e.assignee) : userName(e.added_by)) + '</button>' +
    '<button type="button" class="btn-outline" data-act="rv-cancel">Cancel</button></div></div>';
}
function reviewTaskNow(id, verdict) {
  const e = findEntry(id), r = S.redo;
  if (verdict === 'redo' && (!r || !String(r.note || '').trim())) { if (r) r.err = 'Say what needs redoing.'; renderAll(); return; }
  call('reviewTask', [id, verdict, verdict === 'redo' ? r.note : '', verdict === 'redo' ? r.due : ''], () => {
    S.redo = null;
    snack(verdict === 'ok' ? 'Checked. ' + (e ? LC.cap(e.note) : 'The task') + ' is closed.' : 'Sent back to ' + (e && e.assignee ? LC.teamName(S.dir, e.assignee) : 'its person') + ' with your note.');
    if (S.queries) loadQueries();
    if (S.photosFor) loadPhotos(S.photosFor);
  }, (msg) => { if (S.redo) S.redo.err = msg; else snack(msg, { error: true }); });
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
  const kinds = isAssociate() ? '' : chip('All', !S.kind, 'data-act="kind" data-kind=""') + chip('Follow-ups', S.kind === 'F', 'data-act="kind" data-kind="F"') + chip('Tasks', S.kind === 'MT', 'data-act="kind" data-kind="MT"');
  const whose = chip('Everyone', !S.mine, 'data-act="mine" data-v=""') + chip('Just mine', !!S.mine, 'data-act="mine" data-v="1"');
  const projs = chip('All projects', !S.project, 'data-act="clear-filter"') +
    LC.activeCodes(S.dir.projects).map((k) => chip(S.dir.projects[k].name, S.project === k, 'data-act="set-project" data-code="' + esc(k) + '"')).join('');
  const DONE_SHOWN = 40;
  $('view-tasks').innerHTML =
    '<div class="view-head"><h2 id="tasks-h">Tasks</h2><span class="sec-note">' + (isAssociate()
      ? 'Tasks you gave on your projects, and tasks given to you, by due date.'
      : 'Every follow-up (F) and task (MT) lands here by due date. Tick it off when it’s done.') + '</span></div>' +
    '<div class="filters"><div class="chip-group" role="group" aria-label="Whose tasks">' + whose + '</div>' + (kinds ? '<div class="chip-group" role="group" aria-label="Task kind">' + kinds + '</div>' : '') + '<div class="chip-group" role="group" aria-label="Project">' + projs + '</div></div>' +
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
  const n = usage(kind, k);
  return '<div class="drow"><div class="drow-view"><span class="code-tag">' + esc(k) + '</span>' +
    '<div class="drow-text"><b>' + esc(LC.cap(recName(kind, rec)) || 'No site name yet') + '</b><span>' + esc(PANELS[kind].detailOf(rec, k)) + ' · ' + plural(n, 'entry', 'entries') + '</span></div>' +
    dirButtons(kind, k) + '</div></div>';
}
function dirButtons(kind, k) {
  if (!isOwner()) return '';
  const conf = S.confirmDel === kind + ':' + k;
  const label = !canDelete(kind, k) ? 'Archive' : conf ? 'Confirm delete?' : 'Delete';
  return '<button type="button" class="btn-sm" data-act="dir-edit" data-kind="' + kind + '" data-code="' + esc(k) + '" aria-label="Edit ' + esc(k) + '">Edit</button>' +
    (kind === 'project' ? '<button type="button" class="btn-sm" data-act="pi-edit" data-code="' + esc(k) + '">Stage &amp; dates</button>' : '') +
    '<button type="button" class="btn-sm' + (conf ? ' btn-danger' : '') + '" data-act="dir-remove" data-kind="' + kind + '" data-code="' + esc(k) + '" aria-label="' + label + ' ' + esc(k) + '">' + label + '</button>';
}
// Directory → Projects & clients: one full-width table, a row per project (Code · Site name · Client · Location ·
// Stage · Entries · buttons). Editing opens a form row right under the project.
function projectTableHtml(codes) {
  if (!codes.length) return '';
  const store = S.dir.projects;
  return '<div class="table-box"><table class="ptable dirp"><thead><tr><th scope="col">Code</th><th scope="col">Site name</th><th scope="col">Client</th>' +
    '<th scope="col">Location</th><th scope="col">Stage</th><th scope="col" class="num">Entries</th><th scope="col"><span class="sr-only">Change</span></th></tr></thead><tbody>' +
    codes.map((k) => {
      const p = projInfo(k) || {}, r = store[k];
      const editing = S.dirEdit && S.dirEdit.kind === 'project' && S.dirEdit.code === k;
      const row = editing ? '<tr class="dirp-form"><td colspan="7">' + editRowHtml('project') + '</td></tr>'
        : '<tr><td data-l="Code"><span class="code-tag">' + esc(k) + '</span></td><td data-l="Site name"><b>' + esc(LC.cap(r.name) || 'No site name yet') + '</b></td>' +
          '<td data-l="Client">' + esc(r.client || '—') + '</td><td data-l="Location">' + esc(p.location || '—') + '</td>' +
          '<td data-l="Stage">' + (p.stage ? stagePill(p.stage) : '—') + '</td><td data-l="Entries" class="num">' + usage('project', k) + '</td>' +
          '<td class="dirp-btns">' + dirButtons('project', k) + '</td></tr>';
      return row + (S.projEdit && S.projEdit.code === k ? '<tr class="dirp-form"><td colspan="7">' + projInfoFormHtml(k) + '</td></tr>' : '');
    }).join('') + '</tbody></table></div>';
}

function panelHtml(kind) {
  const P = PANELS[kind], store = LC.storeFor(S.dir, kind), f = S.forms[kind];
  const codes = kindCodes(kind).sort();
  const act = codes.filter((k) => store[k].active), arch = codes.filter((k) => !store[k].active);
  const open = !!S.showArch[kind];
  let h = '<div class="panel' + (kind === 'project' ? ' panel-wide' : '') + '"><div class="panel-head"><h3>' + esc(P.title) + '</h3><span class="mono">' + act.length + ' active</span></div>' +
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
    '<button type="button" class="btn-main" data-act="dir-add" data-kind="' + kind + '">Add</button></div>' +
    '<div class="dmsg" id="dmsg-' + kind + '">' + dirMsgHtml(kind) + '</div>';
  h += kind === 'project' ? projectTableHtml(act)
    : '<div>' + act.map((k) => (S.dirEdit && S.dirEdit.kind === kind && S.dirEdit.code === k ? editRowHtml(kind) : rowHtml(kind, k, store[k]))).join('') + '</div>';
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
    // Projects across the full width; Labour, Vendors and Payment modes side by side below; then Team and the rest.
    panelHtml('project') +
    '<div class="dir-cols">' + ['labour', 'vendor', 'mode'].map(panelHtml).join('') + '</div>' +
    '<div class="panels">' + teamPanelHtml() + (canWrite() ? alertsPanelHtml() : '') + devicesPanelHtml() + '</div>' +
    '<datalist id="tradeList">' + allTrades().map((t) => '<option value="' + esc(t) + '">').join('') + '</datalist>';
}

/* ---------- morning alerts (owners: everything; contributors: their own devices) ---------- */
// Morning alerts. The test app (no CONFIG.firebase) sends nothing: it shows the preview only.
function alertsPanelHtml() {
  const owner = isOwner();
  const preview = owner ? '<div class="brief-prev"><button type="button" class="btn-outline" data-act="brief-preview">What today’s 7:00 alert says</button>' +
    (S.briefs ? S.briefs.map((b) => '<div class="brief"><b>' + esc(b.name) + '</b> <span class="muted small">' + esc(b.email) + '</span>' +
      '<div class="brief-card"><div class="brief-title">' + esc(b.title) + '</div><pre>' + esc(b.body) + '</pre></div>' +
      (b.total ? '' : '<span class="muted small">Nothing due: on a normal morning nothing is sent.</span>') + '</div>').join('') : '') +
    // Test app: the instant alerts it would have sent (new site photos, queries, replies, tasks), newest first.
    (S.instant ? '<div class="brief"><b>Instant alerts the test app would have sent</b> <span class="muted small">(never sent)</span>' +
      (S.instant.length ? S.instant.map((x) => '<div class="brief-card"><div class="brief-title">' + esc(x.title) + '</div><pre>' + esc(x.body) + '</pre>' +
        '<span class="muted small">to ' + esc(x.to) + ' · ' + esc(x.at) + '</span></div>').join('') : '<p class="empty">None yet.</p>') + '</div>' : '') + '</div>' : '';
  if (CONFIG.env === 'test' && CONFIG.firebase) {
    const a0 = (S.data && S.data.alerts) || {};
    return '<div class="panel alerts-panel"><div class="panel-head"><h3>Morning alerts</h3></div>' +
      '<p class="panel-desc"><b>Test app: nothing is ever sent to anyone</b>, except a test alert you send yourself, to the device you press it on. ' +
      'Below: what each person’s 7:00 alert and the instant alerts would say.</p>' + preview +
      (owner ? '<div class="alerts-status"><span>Firebase key: <b>' + (a0.configured ? 'set (' + esc(a0.project) + ')' : 'not set yet') + '</b></span></div>' +
        '<div class="fld"><label for="alertsKey">' + (a0.configured ? 'Replace' : 'Upload') + ' the Firebase service-account key (.json)</label><input type="file" id="alertsKey" accept=".json,application/json"></div>' +
        '<div class="pf-actions"><button type="button" class="btn-outline" data-act="alerts-on">Turn on alerts on this device</button>' +
        '<button type="button" class="btn-accent" data-act="test-alert">Send me a test alert</button></div>' +
        (S.alertsErr ? '<p class="err" role="alert">' + esc(S.alertsErr) + '</p>' : '') : '') + '</div>';
  }
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
    location: kind === 'project' ? ((projInfo(code) || {}).location || '') : '', err: '', base: dirBase(kind, code)
  };
}
// What the edit form opened, in the sheet's own columns: a save is refused if someone changed them since.
function dirBase(kind, code) {
  const d = S.data || {};
  if (kind === 'project') { const p = (d.projects || []).find((x) => x.code === code); return p ? { site_name: p.name, client_name: p.client, location: p.location } : null; }
  if (kind === 'mode') { const m = (d.modes || []).find((x) => x.code === code); return m ? { label: m.label } : null; }
  const p = (d.people || []).find((x) => x.code === code);
  return p ? { name: p.name, trade: p.trade } : null;
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
  call('editCode', [kind, old, nu, name, PANELS[kind].trade ? null : detail, PANELS[kind].trade ? ed.trades.join(' · ') : null, kind === 'project' ? String(ed.location || '').trim() : null, ed.base], (res) => {
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
  design: [['overview', 'Overview', true], ['drawings', 'Drawings', true], ['queries', 'Queries', true]],
  execution: [['overview', 'Overview', true], ['schedule', 'Schedule', true], ['site', 'Site', true], ['queries', 'Queries', true],
    ['budget', 'Budget', false], ['bills', 'Bills', false], ['drawings', 'Drawings', true], ['visits', 'Site visits', false]],
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
function engineersOf(code) { return activeUsers(S.data && S.data.users).filter((u) => u.role === 'site_engineer' && (u.projects || []).indexOf(code) >= 0); }
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
  if (p.scheduleType === 'light' || p.scheduleType === 'full') bits.push(p.scheduleType + ' schedule');
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
    ((isOwner() || isAssociate()) && hasUrgent(x.code) ? '<span class="red-dot" title="Work on hold or overdue"></span>' : '') + '</button>').join('');
  const todayTab = '<button type="button" class="ptab' + (S.projTab === '_today' ? ' on' : '') + '" data-act="proj-tab" data-code="_today" aria-pressed="' + (S.projTab === '_today') + '"><span class="ptab-name">Today</span></button>';
  if (!p) {
    $('view-projects').innerHTML = '<nav class="ptabs" aria-label="Projects">' + todayTab + tabs + '</nav>' + (list.length ? todayAllHtml(list) : '<p class="empty">No live projects. Add one in Directory → Projects.</p>');
    return;
  }
  // Associates never see money: no Budget or Bills.
  const secs = (SECTIONS[p.stage] || SECTIONS.execution).filter((s) => !isAssociate() || (s[0] !== 'budget' && s[0] !== 'bills'));
  if (!S.projSec || !secs.some((s) => s[0] === S.projSec && s[2])) S.projSec = 'overview';
  // Queries shows how many are open: red if any has work on hold, else grey.
  const openQ = ((S.queries && S.queries.queries) || []).filter((q) => q.project === p.code && q.status !== 'closed');
  const qCount = openQ.length ? '<span class="sec-count' + (openQ.some((q) => q.workOnHold) ? ' red' : '') + '">' + openQ.length + '</span>' : '';
  const nav = secs.map((s) => s[2]
    ? '<button type="button" class="psec' + (S.projSec === s[0] ? ' on' : '') + '" data-act="proj-sec" data-sec="' + s[0] + '" aria-pressed="' + (S.projSec === s[0]) + '">' + esc(s[1]) + (s[0] === 'queries' ? qCount : '') + '</button>'
    : '<span class="psec off" title="Comes in a later step">' + esc(s[1]) + '</span>').join('');
  $('view-projects').innerHTML =
    '<nav class="ptabs" aria-label="Projects">' + todayTab + tabs + '</nav>' +
    '<div class="phead"><h2 id="proj-h" class="view-title">' + esc(p.name || p.code) + '</h2>' + placeLine(p) +
    '<div class="psub">' + esc(projectLine(p)) + '</div></div>' +
    '<nav class="psecs" aria-label="Project sections">' + nav + '</nav>' +
    (S.projSec === 'site' ? projectSiteHtml(p) : S.projSec === 'queries' ? projectQueriesHtml(p) : S.projSec === 'drawings' ? projectDrawingsHtml(p) :
      S.projSec === 'schedule' ? projectScheduleHtml(p) : projectOverviewHtml(p));
}

// Today across all projects (the morning view): the same five boxes as a project's Needs you, every project in them
// (each line says which), Everyone or Just mine.
function todayAllHtml(list) {
  const mine = !!S.todayMine, compact = phone.matches;
  let items = [], done = [];
  list.forEach((p) => {
    let its = needsFor(p.code).map((n) => Object.assign(n, { code: p.code }));
    if (mine) its = its.filter((n) => n.act === 'needs-query' || (n.act === 'done' && isMine(findEntry(n.id) || {})));
    items = items.concat(its);
    done = done.concat(doneRecent(p.code).filter((e) => !mine || isMine(e)));
  });
  // Within a box: on-hold and late first as needsFor ordered them per project; across projects, the reddest first.
  items.sort((a, b) => (b.cls === 'bad') - (a.cls === 'bad'));
  done.sort((a, b) => (doneAt(a) < doneAt(b) ? 1 : -1));
  return '<div class="phead"><h2 id="proj-h" class="view-title">Today <span class="muted" style="font-size:16px;font-weight:400">' + esc(niceDay(todayIso())) + '</span></h2></div>' +
    '<div class="seg" role="group" aria-label="Whose items" style="margin:10px 0"><button type="button" class="seg-b' + (!mine ? ' on' : '') + '" data-act="today-mine" data-v="">Everyone</button>' +
    '<button type="button" class="seg-b' + (mine ? ' on' : '') + '" data-act="today-mine" data-v="1">Just mine</button></div>' +
    alertsCardHtml() + boxesHtml(items, done, { all: true, compact: compact, key: '_today' }) + waitingMineHtml('') +
    (compact && canWrite() ? todayBarHtml() : '');
}
// Phones and associates (who have no Directory): "Turn on alerts" on Today until alerts are on for this device.
function alertsCardHtml() {
  if (!notifyWanted() || alertsOnHere() || !(phone.matches || isAssociate())) return '';
  const blocked = Notification.permission === 'denied';
  return '<section class="card alerts-card"><b>' + (blocked ? 'Alerts are blocked on this device.' : 'Turn on alerts on this device') + '</b> <span class="muted small">' +
    esc(blocked ? BLOCKED_HELP : notifyReason()) + '</span> <button type="button" class="btn-main" data-act="alerts-on">Turn on alerts</button></section>';
}
// Phone Today: a small entry bar at the bottom for any code (P ALM 12k C … needs the project: P NST ALM 12k C).
function todayBarHtml() {
  return '<div class="card pbar today-bar"><div class="pbar-row"><label for="todayBar" class="sr-only">Quick entry</label>' +
    '<input id="todayBar" data-tcode="1" value="' + esc(S.tcode || '') + '" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="P NST ALM 12k C  or  MT NST 26/11 …">' +
    '<button type="button" class="btn-main pbar-add" data-act="tcode-save">Add</button></div><div id="tcodePreview" class="pbar-prev">' + todayCodePreview() + '</div></div>';
}
function todayCodePreview() {
  const r = LC.parse(S.tcode || '', { dir: S.dir, sel: todayIso() });
  S.tcodeParsed = r;
  if (!S.tcode) return '';
  return '<div class="chips">' + r.tokens.map((x) => '<div class="tk ' + (x.ok ? 'ok' : 'bad') + '"><b>' + esc(x.txt) + '</b><span>' + esc(x.ok ? x.meaning : '? ' + x.meaning) + '</span></div>').join('') +
    (r.hint ? '<div class="hint">Next: ' + esc(r.hint) + '</div>' : '') + '</div>' + (r.entry ? '<div class="pv-line">' + badge(r.entry.type) + '<span class="pv-sent">' + esc(LC.describe(S.dir, r.entry)) + '</span></div>' : '');
}
function todayCodeSave() {
  const r = S.tcodeParsed;
  if (!r || !r.ready) { snack(r && r.problem ? r.problem : 'Type a code first.', { error: true }); return; }
  const raw = norm(S.tcode);
  call('addEntry', [raw, todayIso()], (res) => {
    S.tcode = ''; S.tcodeParsed = null;
    const e = findEntry(res.id);
    snack('Saved: ' + (e ? shortLine(e) : raw), { undoId: res.id });
  });
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
  if (isAssociate() && r.entry.type !== 'MT') { snack('You can add tasks (MT) only.', { error: true }); return; }
  const full = projCodeFull(S.pcode, proj);
  call('addEntry', [full, todayIso()], (res) => {
    S.pcode = ''; S.pcodeParsed = null;
    const e = findEntry(res.id);
    snack('Saved: ' + (e ? shortLine(e) : full), { undoId: res.id });
  });
}

// Approved changes in a project's register (voided numbers left out).
function regCount(code) { return ((S.queries && S.queries.register) || []).filter((r) => r.project === code && !r.voided).length; }
function projectOverviewHtml(p) {
  // Associates: the same bar for tasks only (MT), for themselves or the project's site engineers.
  const ph = isAssociate() ? 'Give a task, e.g. MT @' + (engineersOf(p.code)[0] ? engineersOf(p.code)[0].code : 'VNK') + ' 26/11 check the cove gap'
    : 'Type anything for ' + p.code + ', e.g. MT 26/11 check cove gap  or  P ALM 12k C';
  const pbar = canWrite() || isAssociate() ? '<div class="card pbar"><div class="pbar-row"><label for="projBar" class="sr-only">Quick entry for ' + esc(p.code) + '</label>' +
    '<input id="projBar" data-pcode="' + esc(p.code) + '" value="' + esc(S.pcode || '') + '" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="' + esc(ph) + '">' +
    '<button type="button" class="btn-main pbar-add" data-act="pcode-save" data-code="' + esc(p.code) + '">Add</button></div>' +
    '<div id="pcodePreview" class="pbar-prev">' + projCodePreview(p.code) + '</div></div>' : '';
  const needs = pbar + needsHtml(p.code);
  if (p.stage === 'execution' && S.photosFor !== p.code) { S.photosFor = p.code; S.photos = null; S.photoSel = ''; loadPhotos(p.code); }
  const latest = S.photos && S.photos.project === p.code ? S.photos.photos.slice(0, 4) : [];
  const photos = p.stage !== 'execution' ? '' : '<section class="card" aria-labelledby="lp-h"><div class="sec-head"><h3 id="lp-h">Latest site photos</h3>' +
    '<button type="button" class="link-btn" data-act="proj-sec" data-sec="site">All photos</button></div>' +
    (latest.length ? '<div class="ph-grid">' + latest.map((x) => '<button type="button" class="ph-tile" data-act="ph-open-site" data-id="' + esc(x.id) + '"><span class="ph-frame">' + thumbImg(x) + '</span><span class="ph-area">' + esc(x.area || '—') + ' · ' + esc(niceDay(photoDay(x.at))) + '</span></button>').join('') + '</div>'
      : '<p class="empty">' + (S.photos ? 'No site photos yet.' : 'Loading…') + '</p>') +
    (regCount(p.code) ? '<button type="button" class="link-btn" data-act="reg-link">Change register: ' + plural(regCount(p.code), 'change approved', 'changes approved') + '</button>' : '') + '</section>';
  let money = '';
  if (isOwner()) {
    const got = live().filter((e) => e.type === 'R' && e.project === p.code && e.who === LC.CLIENT).reduce((s, e) => s + e.amount, 0);
    money = '<section class="card" aria-labelledby="cp-h"><div class="label-caps" id="cp-h">Client payments</div>' +
      '<div class="big-num">' + esc(LC.inr(got)) + ' <span class="muted">received from the client</span></div>' +
      '<p class="muted small">From R … CL entries. Instalments come with the schedule.</p></section>';
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
const ROLE_LABEL = { owner: 'Owner', contributor: 'Contributor', viewer: 'Viewer', site_engineer: 'Site engineer', associate: 'Project associate architect' };
// Where space is tight.
const ROLE_SHORT = { site_engineer: 'Site engineer', associate: 'Associate' };
const TEAM_ROLES = ['site_engineer', 'associate'];
const blankMember = () => ({ email: '', name: '', code: '', role: 'site_engineer', projects: [], err: '' });
// Team: everyone who can sign in. Owners add, change and archive site engineers and project associate architects here
// (nothing is sent to anyone). Only Shruthi adds, changes or archives an owner (or makes someone one); her own accounts
// always stay owners. Someone with several Google accounts (same name and code) is one row listing them.
function teamGroups() {
  const all = ((S.data && S.data.users) || []).slice().sort((a, b) => (a.role === b.role ? (a.name < b.name ? -1 : 1) : a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.role < b.role ? -1 : 1));
  const groups = [];
  all.forEach((u) => {
    const g = u.code && groups.find((x) => x.role === u.role && !!x.archived === !!u.archived && x.name === u.name && x.code === u.code);
    if (g) g.emails.push(u.email); else groups.push(Object.assign({}, u, { emails: [u.email] }));
  });
  return groups;
}
// This person's open tasks (given to their code, or their own without one), for "Hand his N open tasks to …".
function openTasksOf(g) {
  return S.entries.filter((e) => e.type === 'MT' && e.status !== 'void' && !e.done && ((g.code && e.assignee === g.code) || (!e.assignee && g.emails.indexOf(e.added_by) >= 0)));
}
function handOverHtml(g, prefix) {
  const n = openTasksOf(g).length;
  if (!n) return '';
  const opts = activeUsers(S.data.users).filter((u) => u.code && u.code !== g.code && (u.role === 'site_engineer' || u.role === 'associate' || u.role === 'owner'))
    .filter((u, i, a) => a.findIndex((x) => x.code === u.code) === i);
  const cur = S.handTo[g.email] || (opts.find((u) => u.role === 'site_engineer') || opts[0] || {}).code || '';
  S.handTo[g.email] = cur;
  return '<label class="handover">Hand ' + (n === 1 ? 'the 1 open task' : 'the ' + n + ' open tasks') + ' of ' + esc(g.name) + ' to <select data-ho="' + esc(g.email) + '" id="' + prefix + '-ho">' +
    opts.map((u) => '<option value="' + esc(u.code) + '"' + (u.code === cur ? ' selected' : '') + '>' + esc(u.name + ' (' + u.code + ')') + '</option>').join('') + '</select></label>';
}
S.handTo = {};
function teamPanelHtml() {
  const groups = teamGroups();
  const users = groups.filter((u) => !u.archived), arch = groups.filter((u) => u.archived);
  const owner = isOwner(), shruthi = !!(S.data && S.data.canDeleteProjects), me = S.data && S.data.user;
  const roles = TEAM_ROLES.concat(shruthi ? ['owner'] : []);
  const projBoxes = (sel, prefix) => '<div class="pchecks" role="group" aria-label="Projects">' + LC.activeCodes(S.dir.projects).map((c) =>
    '<label class="pcheck"><input type="checkbox" data-' + prefix + '-proj="' + esc(c) + '"' + (sel.indexOf(c) >= 0 ? ' checked' : '') + '> ' + esc(projName(c)) + '</label>').join('') + '</div>';
  const roleSel = (prefix, cur) => '<div class="fld"><label for="' + prefix + '-role">Role</label><select id="' + prefix + '-role" data-' + prefix + '="role">' +
    roles.map((r) => '<option value="' + r + '"' + (r === cur ? ' selected' : '') + '>' + esc(ROLE_LABEL[r]) + '</option>').join('') + '</select></div>';
  const projHelp = (role) => role === 'owner' ? '' : '<span class="muted small">' + (role === 'associate' ? 'An associate sees only the projects ticked here, never money.' : 'The projects he works on. Site engineers can see every project.') + '</span>';
  // Who may change this row: site engineers and associates, any owner; owners, only Shruthi (never her own accounts).
  const mine = (g) => g.emails.indexOf(me) >= 0;
  const canRole = (g) => owner && (TEAM_ROLES.indexOf(g.role) >= 0 || (g.role === 'owner' && shruthi && !mine(g)));
  const canEdit = (g) => owner && (g.role !== 'owner' || shruthi);
  const row = (u) => {
    if (S.memberEdit && S.memberEdit.email === u.email) {
      const m = S.memberEdit;
      const roleChanged = m.role !== u.role && TEAM_ROLES.concat(['owner']).indexOf(u.role) >= 0;
      return '<div class="drow"><div class="dform">' +
        '<div class="fld"><label for="me-name">Name</label><input id="me-name" data-me="name" value="' + esc(m.name) + '" autocomplete="off"></div>' +
        '<div class="fld code"><label for="me-code">Code</label><input id="me-code" data-me="code" value="' + esc(m.code) + '" maxlength="4" autocapitalize="characters" autocomplete="off"></div>' +
        (canRole(u) ? roleSel('me', m.role) + (m.role === 'owner' ? '' : '<div class="fld" style="flex:1 1 100%"><span class="lbl">Projects</span>' + projBoxes(m.projects, 'me') + projHelp(m.role) + '</div>') : '') +
        (roleChanged ? '<div class="fld" style="flex:1 1 100%">' + handOverHtml(u, 'me') + '</div>' : '') +
        '<button type="button" class="btn-accent" data-act="me-save">Save</button><button type="button" class="btn-outline" data-act="me-cancel">Cancel</button>' +
        (m.err ? '<p class="err" role="alert" style="flex:1 1 100%">' + esc(m.err) + '</p>' : '') + '</div></div>';
    }
    const conf = S.confirmDel === 'member:' + u.email;
    return '<div class="drow' + (u.archived ? ' arch' : '') + '"><div class="drow-view">' + (u.code ? '<span class="code-tag' + (u.archived ? ' arch' : '') + '">' + esc(u.code) + '</span>' : '<span class="code-tag arch">—</span>') +
      '<div class="drow-text"><b>' + esc(u.name || u.email) + '</b><span>' + esc(ROLE_LABEL[u.role] || u.role) +
      (TEAM_ROLES.indexOf(u.role) >= 0 ? ' · ' + esc((u.projects || []).map(projName).join(', ') || 'no projects yet') : '') + '</span>' +
      // A long address breaks before the @ ("venkatesh.ashrit" / "@gmail.com"), never in the middle.
      u.emails.map((e) => '<span class="drow-email">' + esc(e.split('@')[0]) + '<wbr>@' + esc(e.split('@').slice(1).join('@')) + '</span>').join('') + '</div>' +
      (!owner ? '' : u.archived ? (canEdit(u) ? '<button type="button" class="btn-sm" data-act="me-restore" data-email="' + esc(u.email) + '">Restore</button>' : '')
        : (!mine(u) ? '<button type="button" class="btn-sm" data-act="copy-invite" data-email="' + esc(u.email) + '">Copy invite</button>' : '') +
          (canEdit(u) ? '<button type="button" class="btn-sm" data-act="me-edit" data-email="' + esc(u.email) + '">Edit</button>' : '') +
          (canRole(u) ? '<button type="button" class="btn-sm' + (conf ? ' btn-danger' : '') + '" data-act="me-archive" data-email="' + esc(u.email) + '">' + (conf ? 'Confirm archive?' : 'Archive') + '</button>' : '')) +
      '</div>' + (conf ? '<div class="drow-ho">' + handOverHtml(u, 'ar') + '</div>' : '') + '</div>';
  };
  const a = S.memberAdd;
  const addForm = owner
    ? '<div class="dform"><b class="dform-title">Add person</b>' +
      '<div class="fld"><label for="ma-name">Name</label><input id="ma-name" data-ma="name" value="' + esc(a.name) + '" placeholder="Venky" autocomplete="off"></div>' +
      '<div class="fld code"><label for="ma-code">Code</label><input id="ma-code" data-ma="code" value="' + esc(a.code) + '" placeholder="VNK" maxlength="4" autocapitalize="characters" autocomplete="off"></div>' +
      '<div class="fld"><label for="ma-email">Google account</label><input id="ma-email" data-ma="email" type="text" inputmode="email" autocapitalize="none" spellcheck="false" value="' + esc(a.email) + '" placeholder="name@gmail.com" autocomplete="off"></div>' +
      roleSel('ma', a.role) +
      '<div class="fld" style="flex:1 1 100%"><span class="lbl">Projects</span>' + projBoxes(a.projects, 'ma') + projHelp(a.role) + '</div>' +
      '<button type="button" class="btn-main" data-act="ma-add">Add ' + esc(a.role === 'associate' ? 'associate' : 'site engineer') + '</button>' +
      (a.err ? '<p class="err" role="alert" style="flex:1 1 100%">' + esc(a.err) + '</p>' : '') + '</div>'
    : '';
  const open = !!S.showArch.team;
  return '<div class="panel"><div class="panel-head"><h3>Team</h3><span class="mono">' + users.length + '</span></div>' +
    '<p class="panel-desc">' + (owner
      ? 'Everyone who can sign in. Site engineers and associates never see the ledger. Adding someone sends them nothing: tell them yourself, then they sign in with that Google account. Archiving signs them out everywhere; what they did keeps their name. Codes are used for tasks, like MT NST @VNK.'
      : 'Everyone who can sign in to O F Turnkey.') + '</p>' + addForm + users.map(row).join('') +
    (arch.length ? '<div style="border-top:1px solid #E6E7E2;display:flex;flex-direction:column"><button type="button" class="toggle-link" data-act="dir-arch" data-kind="team" aria-expanded="' + open + '">' +
      chev(open) + 'Archived (' + arch.length + ')</button>' + (open ? arch.map(row).join('') : '') + '</div>' : '') + '</div>';
}
function memberProjects(prefix) { return Array.from(document.querySelectorAll('[data-' + prefix + '-proj]:checked')).map((el) => el.getAttribute('data-' + prefix + '-proj')); }
function addMember() {
  const a = S.memberAdd;
  a.projects = memberProjects('ma');
  call('saveMember', [{ email: a.email, name: a.name, code: a.code.toUpperCase(), role: a.role, projects: a.projects }], () => {
    snack(a.name + ' added as ' + (a.role === 'associate' ? 'an associate' : 'a site engineer') + '. Nothing was sent to them.');
    S.memberAdd = blankMember();
  }, (msg) => { S.memberAdd.err = msg; });
}
function saveMemberEdit() {
  const m = S.memberEdit;
  if (!m) return;
  m.projects = memberProjects('me');
  const g = teamGroups().find((x) => x.email === m.email) || { emails: [m.email], role: m.role };
  const handTo = m.role !== g.role && openTasksOf(g).length ? S.handTo[m.email] || '' : '';
  // One person with several Google accounts: every account gets the same name and code.
  const emails = g.emails.slice();
  const next = () => {
    const email = emails.shift();
    // Then everything reloads at once (tasks handed over, a new role), so no screen shows the old codes.
    if (!email) { S.memberEdit = null; snack(m.name + ' saved.'); renderAll(); refresh(true); return; }
    call('saveMember', [{ email: email, name: m.name, code: m.code.toUpperCase(), role: m.role, projects: m.projects, handTo: email === m.email ? handTo : '',
      base: (m.bases || {})[email] || null }],
      (res) => { if (res.handedOver) snack(plural(res.handedOver, 'open task', 'open tasks') + ' handed over.'); next(); },
      (msg) => { if (S.memberEdit) S.memberEdit.err = msg; });
  };
  next();
}
// Team → Copy invite: a ready WhatsApp message (name, this app's address, the exact Gmail to sign in with, how to
// install, Desktop site off, battery and notifications on Android). Copied, never sent: Shruthi sends it herself.
function inviteText(g) {
  const link = location.origin + location.pathname.replace(/index\.html$/, '');
  const first = String(g.name || '').split(/\s+/)[0] || 'there';
  const use = g.role === 'associate' ? 'You’ll use it to see site photos and questions on your projects, answer them and give tasks to the site engineers.'
    : g.role === 'site_engineer' ? 'You’ll use it to send site photos, ask questions and see your tasks.'
    : 'You’ll use it for the site ledger, tasks, photos and questions.';
  // Signed by whoever copies it ("- Shruthi").
  const from = String(userName(S.data && S.data.user) || '').split(/\s+/)[0];
  return 'Hi ' + first + ', this is O F Turnkey, our site app' + (CONFIG.env === 'test' ? ' (TEST version)' : '') + '.\n' + use + '\n\n' +
    '1. Open this link in Chrome on your phone: ' + link + '\n' +
    '   If the page looks like a computer screen: Chrome menu ⋮ → untick "Desktop site".\n' +
    '2. Sign in with Google using exactly this account: ' + g.email + '\n' +
    '3. Install it: Chrome menu ⋮ → Add to Home screen (or Install app). Then open it from the new icon.\n' +
    '4. When it asks, tap Allow for notifications. If Chrome ever says "Possible spam" on an O F Turnkey alert, tap it and choose Show notification (or Always allow): it is safe.\n' +
    '5. Android: Settings → Apps → Chrome → Battery → Unrestricted, so alerts arrive on time.\n\n' +
    'Any problem, message me.' + (from ? '\n- ' + from : '');
}
function copyInvite(email) {
  const g = teamGroups().find((x) => x.emails.indexOf(email) >= 0);
  if (!g) return;
  const text = inviteText(Object.assign({}, g, { email: email }));
  S.lastInvite = text; // the automated checks read what was copied
  const done = () => snack('Invite for ' + g.name + ' copied. Paste it into WhatsApp. Nothing was sent.');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const t = document.createElement('textarea');
  t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select();
  try { document.execCommand('copy'); done(); } catch (_) { snack('Couldn’t copy. Long-press to copy instead.', { error: true }); }
  t.remove();
}

/* ---------- the phone's outbox: things that wait for signal, then send by themselves ---------- */
// IndexedDB on this device: "drafts" (photos picked but not sent yet) and "outbox" (sent when there is
// signal, in order, each with its own id so a resend after a dropped signal is saved once on the server).
const IDB_NAME = 'oft-phone-' + CONFIG.env;
let idbOpen = null;
function idb() {
  if (!idbOpen) {
    idbOpen = new Promise((resolve, reject) => {
      // Version 2 adds "dwgs": drawings saved on this device for no signal.
      const r = indexedDB.open(IDB_NAME, 2);
      r.onupgradeneeded = () => {
        ['drafts', 'outbox', 'dwgs'].forEach((n) => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, { keyPath: 'id' }); });
      };
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

const OUT = { items: [], sending: false, online: navigator.onLine, lastError: '', fails: 0, retryAt: 0 };
// Adds a request to the outbox and tries to send it straight away.
// meta: what to draw on screen while the item waits ("Sending…"), e.g. a task's text and due date.
function outboxAdd(action, args, label, meta) {
  const item = { id: newId(), action: action, args: args, label: label, meta: meta || null, email: S.me ? S.me.email : '', createdAt: Date.now(), error: '' };
  // Resolves once the item is on this phone's waiting list (so a redraw then shows it as "Sending…").
  return idbPut('outbox', item).then(() => { const listed = refreshOutbox(); flushOutbox(); return listed; });
}
function refreshOutbox() {
  return idbAll('outbox').then((items) => { OUT.items = items; renderNetStrip(); if (S.engineer) bgRedraw(); }, () => { /* no storage: nothing waiting */ });
}
// Items of one kind still waiting on this phone (drawn as "Sending…").
function waiting(action) { return OUT.items.filter((x) => x.action === action && !x.error && S.me && x.email === S.me.email); }
// Sends waiting items one by one. Stops at the first network problem and tries again soon (5 s, 10 s, 20 s, then
// every 30 s), and at once when signal is back or the app comes back to the screen (a phone freezes an app it has put
// in the background, which is how one of Venky's photos waited 10 minutes); an item the server refuses is kept aside
// with the reason, so it can't block the rest.
let retryTimer = null;
function retrySoon() {
  OUT.fails++;
  const ms = Math.min(30000, 5000 * Math.pow(2, OUT.fails - 1));
  OUT.retryAt = Date.now() + ms;
  clearTimeout(retryTimer);
  retryTimer = setTimeout(flushOutbox, ms);
}
function flushOutbox() {
  if (OUT.sending || !sessionToken() || !S.me) return;
  OUT.sending = true;
  OUT.retryAt = 0;
  renderNetStrip();
  let again = false;
  const next = () => idbAll('outbox').then((items) => {
    OUT.items = items;
    const item = items.find((x) => !x.error && x.email === S.me.email);
    if (!item) return null;
    bgRedraw(); // "Sending 2 photos…" on Today and Photos
    return api(item.action, item.args).then((res) => idbDel('outbox', item.id).then(() => { OUT.online = true; OUT.fails = 0; outboxSent(item, res); return next(); }), (err) => {
      if (err.network) { OUT.online = false; again = true; return null; }
      if (err.retry) { again = true; return null; } // busy for a moment: stays first in line
      if (err.signin) { signedOut(err.message); return null; }
      item.error = cleanErr(err.message);
      return idbPut('outbox', item).then(next);
    });
  });
  next().catch(() => { /* storage trouble: leave items as they are */ }).finally(() => { OUT.sending = false; if (again) retrySoon(); refreshOutbox(); });
}
// What to refresh on screen once something from the outbox has arrived.
function outboxSent(item, res) {
  // Off the waiting list at once, so nothing still says "Sending…" once it's there.
  OUT.items = OUT.items.filter((x) => x.id !== item.id);
  renderNetStrip();
  if (res && res.site) { S.site = res.site; S.siteAt = Date.now(); if (S.me) store(SITE_KEY, JSON.stringify({ email: S.me.email, site: res.site })); }
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
  // Under the header (as the design board), with a crossed-out wifi sign when there is no signal.
  const host = S.engineer ? document.querySelector('.eng-hdr') : (!$('appScreen').hidden ? document.querySelector('.hdr') : null);
  if (host && el.previousElementSibling !== host) host.after(el);
  el.innerHTML = (!OUT.online ? WIFI_OFF : '') + h;
  el.className = 'net-strip' + (failed.length ? ' bad' : '');
}
const WIFI_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="vertical-align:-3px;margin-right:6px">' +
  '<path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M12 19h.01M3 3l18 18"/></svg>';
// Signal back: send what waits, and (engineers) bring the site data up to date (areas, tasks), which may be the copy
// saved on the phone if the app was opened without signal.
window.addEventListener('online', () => { OUT.online = true; OUT.fails = 0; flushOutbox(); renderNetStrip(); if (S.engineer && sessionToken()) engCall('getSite', []); });
window.addEventListener('offline', () => { OUT.online = false; renderNetStrip(); });
setInterval(() => { if (OUT.items.some((x) => !x.error)) flushOutbox(); }, 30000);
// Back on the screen (after the camera, another app, or the phone locked): send what waits straight away.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && OUT.items.some((x) => !x.error)) { OUT.fails = 0; flushOutbox(); } });
window.addEventListener('pageshow', () => { if (OUT.items.some((x) => !x.error)) flushOutbox(); });

// Today and Photos (engineers): "Sending 2 photos…" or "2 photos waiting · they send when there's signal", until done.
function outboxStatusHtml() {
  const mine = OUT.items.filter((x) => !x.error && S.me && x.email === S.me.email);
  if (!mine.length) return '';
  const photos = mine.filter((x) => x.action === 'uploadPhoto' || x.action === 'uploadFile').length, other = mine.length - photos;
  const what = [photos ? plural(photos, 'photo', 'photos') : '', other ? plural(other, 'other item', 'other items') : ''].filter(Boolean).join(' and ');
  const oldest = Math.min.apply(null, mine.map((x) => x.createdAt || Date.now()));
  const slow = Date.now() - oldest > 60000;
  let text, btn = '';
  if (!OUT.online) text = what + ' waiting · ' + (mine.length === 1 ? 'it sends' : 'they send') + ' by ' + (mine.length === 1 ? 'itself' : 'themselves') + ' when the signal is back';
  else if (OUT.sending) text = 'Sending ' + what + '…' + (slow ? ' Keep the app open until it’s done.' : '');
  else { text = what + ' waiting to send'; btn = '<button type="button" class="link-btn" data-act="out-retry">Send now</button>'; }
  return '<div class="out-status' + (!OUT.online ? ' off' : '') + '" role="status"><span class="out-dot" aria-hidden="true"></span><span>' + esc(text) + '</span>' + btn + '</div>';
}

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
    const draw = (from, maxSide) => {
      const w = from.width, h = from.height, k = Math.min(1, maxSide / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d').drawImage(from, 0, 0, c.width, c.height);
      return c;
    };
    // The preview is drawn from the shrunk photo, not again from the camera's 50-megapixel original (much quicker).
    const big = draw(src, 1600), full = big.toDataURL('image/jpeg', 0.7).split(',')[1];
    if (src.close) src.close();
    return { full: full, thumb: draw(big, 400).toDataURL('image/jpeg', 0.6).split(',')[1], bytes: Math.round(full.length * 3 / 4) };
  });
}
// Photos picked on the phone are saved here at once, so a reload (or the camera closing the app) can't lose them.
S.drafts = []; S.thumbs = {}; S.photos = null; S.photoSel = '';
function loadDrafts() { return idbAll('drafts').then((d) => { S.drafts = d; }, () => { S.drafts = []; }); }
function addDraftFiles(files, project) {
  const list = Array.from(files || []);
  if (!list.length) return;
  engSnack('Getting ' + plural(list.length, 'photo', 'photos') + ' ready…');
  // New photos start with the area of the photo before (usually the same room); each can still be changed.
  const prev = S.drafts.filter((d) => d.project === project && !d.purpose).sort((a, b) => a.createdAt - b.createdAt).pop();
  const area = (prev && prev.area) || '';
  let chain = Promise.resolve();
  list.forEach((f) => {
    chain = chain.then(() => shrinkPhoto(f)).then((p) => idbPut('drafts', { id: newId(), project: project, area: area, full: p.full, thumb: p.thumb, bytes: p.bytes, createdAt: Date.now() }),
      (err) => engSnack(cleanErr(err.message), true));
  });
  chain.then(loadDrafts).then(renderEng);
}
function sendDrafts(project) {
  const drafts = S.drafts.filter((d) => d.project === project && !d.purpose);
  if (!drafts.length || S.sendingPhotos) return; // a second tap while sending does nothing
  const missing = drafts.find((d) => !String(d.area || '').trim());
  if (missing) { engSnack('Pick or type an area for each photo.', true); return; }
  if (!confirmOtherProject(project) || !confirmNewAreas(project, drafts.map((d) => d.area))) return;
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
  // After the batch (the outbox keeps the order): one alert to Shruthi and Savan for all of them.
  chain = chain.then(() => outboxAdd('photosDone', [project, batch], 'Photo alert'));
  chain.then(loadDrafts).finally(() => { S.sendingPhotos = false; }).then(() => {
    engSnack(navigator.onLine ? 'Sending ' + plural(drafts.length, 'photo', 'photos') + '…' : 'Saved on your phone. ' + (drafts.length === 1 ? 'It' : 'They') + ' will send by ' + (drafts.length === 1 ? 'itself' : 'themselves') + ' when there’s signal.');
    renderEng();
  });
}
function loadPhotos(project, then) {
  api('listPhotos', [project]).then((res) => {
    S.photos = res;
    S.photosAt = Date.now();
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
// Opens a task's source: owners go to the project's query or site photo; engineers to Queries or Photos. A photo opens
// scrolled straight to it and to the comment the task came from (highlighted).
function openTaskSource(src, taskId) {
  const s = taskSources()[src];
  if (!s) return;
  window.scrollTo(0, 0);
  S.jump = s.kind === 'photo' ? { photo: s.id, task: taskId || '', at: Date.now() } : null;
  if (S.engineer) {
    S.engProject = s.project; S.engRegister = false;
    if (s.kind === 'query') { S.engBack = S.engTab !== 'queries' ? S.engTab : ''; S.engBackY = window.scrollY; S.engTab = 'queries'; S.engQuery = s.id; markSeenQ(s.id); if (!S.queries) loadQueries(); }
    else {
      S.engTab = 'photos'; S.engQuery = '';
      if (S.photosFor !== s.project) { S.photosFor = s.project; S.photos = null; loadPhotos(s.project); }
      openPhoto(s.id);
    }
    renderEng();
    return;
  }
  S.tab = 'projects'; S.projTab = s.project;
  if (s.kind === 'query') { S.projSec = 'queries'; S.qView = 'list'; S.qSel = s.id; S.qOpen = true; S.qc = null; }
  else {
    S.projSec = 'site'; S.photosSeenWant = s.project;
    if (S.photosFor !== s.project) { S.photosFor = s.project; S.photos = null; S.photoSel = ''; loadPhotos(s.project); }
    openPhoto(s.id);
  }
  renderAll();
}
// After a redraw: scroll to the photo (and the comment) a task came from, once it is on screen. Photos may still be
// loading, so this is tried on each redraw for a little while.
function doJump() {
  const j = S.jump;
  if (!j || j.done) return;
  if (Date.now() - j.at > 20000) { S.jump = null; return; }
  const panel = $('phPanel');
  if (!panel || S.photoSel !== j.photo || !S.photos || !S.photos.photos.some((p) => p.id === j.photo)) return;
  // Scrolled at once; the full-size photo above the comments pushes them down when it arrives, so once more then.
  const full = !!(S.fullPhoto && S.fullPhoto.id === j.photo);
  if (j.scrolled && !full && Date.now() - j.at < 10000) return;
  j.scrolled = true;
  if (full || Date.now() - j.at >= 10000) {
    j.done = true;
    setTimeout(() => { if (S.jump === j) S.jump = null; }, 7000);
  }
  // Found again each time: a redraw may have replaced it.
  const target = () => { const p = $('phPanel'); return p && ((j.task && p.querySelector('.ph-comment[data-task="' + j.task + '"]')) || p); };
  const inView = (el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; };
  setTimeout(() => { const t = target(); if (t && !inView(t)) t.scrollIntoView({ block: 'center' }); }, 100);
  setTimeout(() => { const t = target(); if (t && !inView(t)) t.scrollIntoView({ block: 'center' }); }, 900);
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
    return '<section class="ph-day' + (opts.cards ? ' card' : '') + '"><div class="ph-day-h"><b>' + esc(g.d === todayIso() ? 'Today · ' + niceDay(g.d) : niceDay(g.d)) + '</b><span class="muted">' + esc(who) + ' · ' + plural(g.items.length, 'photo', 'photos') + '</span></div>' +
      '<div class="ph-grid">' + g.items.map((p) => '<div class="ph-cell"><button type="button" class="ph-tile' + (S.photoSel === p.id ? ' on' : '') + '" data-act="ph-open" data-id="' + esc(p.id) + '">' +
        '<span class="ph-frame">' + thumbImg(p) + (counts[p.id] ? '<span class="ph-badge">' + plural(counts[p.id], 'comment', 'comments') + '</span>' : '') + '</span>' +
        '<span class="ph-area">' + esc(p.area || '—') + '</span></button>' +
        (opts.ask ? '<button type="button" class="link-btn ph-ask" data-act="ph-ask" data-id="' + esc(p.id) + '">Ask about this photo</button>' : '') + '</div>').join('') + '</div>' +
      // Phones and narrow windows: the opened photo right under its day (one at a time).
      (photosInline() && g.items.some((p) => p.id === S.photoSel) ? '<div class="ph-side ph-inline" id="phPanel">' + photoPanelHtml() + '</div>' : '') + '</section>';
  }).join('');
}
function photosInline() { return !!S.engineer || narrowQ.matches; }
// The opened photo: big picture, who/when/line, comments, and (owners) comment or comment + task.
function photoPanelHtml() {
  const p = S.photos && S.photos.photos.find((x) => x.id === S.photoSel);
  if (!p) return '<p class="empty">Tap a photo to see it bigger, comment on it, or make it a task.</p>';
  const users = (S.engineer ? S.site.users : S.data.users) || [];
  const nameOf = (email) => { const u = users.find((x) => x.email === email); return u ? u.name : email; };
  const comments = S.photos.comments.filter((c) => c.photoId === p.id);
  // Owners and associates can turn a comment into a task (associates: for the project's engineers).
  const owner = !S.engineer && (isOwner() || isAssociate());
  const full = S.fullPhoto && S.fullPhoto.id === p.id ? '<img class="ph-big" src="' + S.fullPhoto.url + '" alt="' + esc(p.area || 'Site photo') + '">'
    : '<span class="ph-big-wrap">' + thumbImg(p, 'ph-big') + '<span class="ph-hint">Loading full size…</span></span>';
  const c = S.photoComment || (S.photoComment = { text: '', due: addDays(todayIso(), 2), err: '' });
  if (c.who === undefined) c.who = owner ? defaultTaskFor(p.by, p.project) : '';
  const canDelete = (!S.engineer && isOwner()) || (p.by === (S.me && S.me.email) && Date.now() - Date.parse(p.at.replace(' ', 'T') + ':00+05:30') < 86400000);
  // The comment a task came from (opened from that task) is highlighted.
  const hit = S.jump && S.jump.photo === p.id ? S.jump.task : '';
  return full +
    '<div class="ph-info"><b>' + esc(p.area || 'Site photo') + '</b><span class="muted">' + esc(nameOf(p.by)) + ' · ' + esc(niceDay(photoDay(p.at)) + ' ' + p.at.slice(11, 16)) +
    (p.caption ? ' · ' + esc(p.caption) : '') + '</span></div>' +
    comments.map((x) => {
      // "Done: …" comments carry the finished-work photo; others may carry attachments (photos, screenshots, PDFs).
      const done = /^Done: /.test(x.text), ids = x.photoIds || [];
      ids.forEach(wantThumb);
      return '<div class="ph-comment' + (hit && x.taskId === hit && !done ? ' flash' : '') + '"' + (x.taskId && !done ? ' data-task="' + esc(x.taskId) + '"' : '') + '>' +
        avatarHtml(x.by) + '<div class="ph-c-body"><b>' + esc(nameOf(x.by)) + '</b> <span class="muted">' + esc(niceDay(x.at.slice(0, 10)) + ' ' + x.at.slice(11, 16)) + '</span><div>' + esc(x.text) + '</div>' +
        photoStrip(ids) + (done ? '<span class="pill pill-ok">Done, with photo</span>'
          : x.taskId ? '<span class="ph-task">Task for ' + esc(taskForName(x.taskFor)) + (x.taskDue ? ' · due ' + esc(niceDay(x.taskDue)) : '') + '</span>' : '') +
        (x.taskId && !S.engineer && isOwner() && !done && !/^Redo:/.test(x.text) ? reviewHtml(findEntry(x.taskId) || {}) : '') + '</div></div>';
    }).join('') +
    '<div class="ph-form"><label for="phComment">Comment on this photo</label><textarea id="phComment" data-pc="text" rows="2">' + esc(c.text) + '</textarea>' +
    attachHtml('pc:' + p.id) +
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
  if (!c || !p || c.sending) return; // a second tap while sending does nothing
  const purpose = 'pc:' + p.id, att = S.att[purpose] || [];
  if (!String(c.text || '').trim() && !att.length) { c.err = 'Type a comment.'; if (S.engineer) renderEng(); else renderAll(); return; }
  if (makeTask && !c.who) { c.err = 'Pick who the task is for.'; renderAll(); return; }
  c.sending = true;
  // Attachments first (photos shrunk, PDFs as they are), then the comment with their ids.
  uploadAttachments(purpose, p.project, 'comment:' + p.id)
    .then((ids) => api('commentPhoto', [p.id, c.text, !!makeTask, makeTask ? c.due : '', makeTask ? c.who : '', ids])).then((res) => {
      S.photos = res;
      S.photoComment = null;
      delete S.att[purpose];
      if (S.engineer) { engSnack('Comment sent.'); renderEng(); }
      else { snack(makeTask ? 'Comment sent and made a task for ' + taskForName(c.who) + '.' : 'Comment sent.'); if (makeTask) refresh(true); renderAll(); }
    }, (err) => { c.sending = false; if (err.signin) { signedOut(err.message); return; } c.err = cleanErr(err.message); if (S.engineer) renderEng(); else renderAll(); });
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
  return outboxStatusHtml() + '<section class="card eng-card"><h2 class="eng-h2">Site photos · ' + esc(engProjName(proj)) + '</h2>' +
    '<p class="muted small eng-pad">' + (mine.length ? 'You last sent photos ' + esc(niceDay(photoDay(mine[0].at))) + '.' : 'No photos from you on this project yet.') + '</p>' +
    '<div class="ph-pick eng-pad"><label class="btn-main ph-pick-btn">Take photos<input type="file" accept="image/*" capture="environment" data-ph-pick="1" hidden></label>' +
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
    (S.photos ? photoFeedHtml(S.photos.photos, { ask: true }) : '<p class="empty">Loading…</p>') + '</div></section>';
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

// Owners → project → Site: the dated photo feed (each day its own card), with the opened photo beside it (narrow:
// under its day). Opening the feed (a tap on Site, All photos, a photo or "N new site photos") clears "N new site
// photos"; photos arriving while the screen just stays open don't count as seen.
function projectSiteHtml(p) {
  if (S.photosFor !== p.code) { S.photosFor = p.code; S.photos = null; S.photoSel = ''; loadPhotos(p.code); }
  if (S.photosSeenWant === p.code && S.photos && S.photos.project === p.code) { S.photosSeenWant = ''; markPhotosSeen(p.code); }
  return '<div class="pgrid"><div class="pmain"><div class="sec-head"><h3>Photos from site</h3>' +
    '<button type="button" class="btn-outline" data-act="ph-reload">Refresh</button></div>' +
    (S.photos ? photoFeedHtml(S.photos.photos, { cards: true }) : '<p class="empty">Loading…</p>') + '</div>' +
    (photosInline() ? '' : '<div class="pside"><section class="card ph-side" id="phPanel">' + photoPanelHtml() + '</section></div>') + '</div>';
}
// "N new site photos" clears for this person once they have opened the project's Site photos.
function markPhotosSeen(code) {
  const newest = S.photos && S.photos.photos[0];
  if (!newest || !newPhotosOf(code) || (S.seenLocal['photos:' + code] || '') >= newest.at) return;
  S.seenLocal['photos:' + code] = newest.at;
  api('markSeen', ['photos:' + code, newest.at]).catch(() => { /* cleared on this device; the server learns next time */ });
}
// "N new site photos" for a project: as the server said, or, once opened on this device and the feed is loaded,
// counted here (photos from others since then).
function newPhotosOf(code) {
  const np = (S.data && S.data.newPhotos && S.data.newPhotos[code]) || null, seen = S.seenLocal['photos:' + code];
  if (!seen) return np && np.n ? np : null;
  if (!S.photos || S.photos.project !== code) return null;
  // Counted as the server counts them: not your own, not finished-work photos (those come with their task's Check).
  const fresh = S.photos.photos.filter((x) => x.at > seen && x.by !== S.me.email && !/^done:/.test(x.linkedTo || ''));
  if (!fresh.length) return null;
  const uniq = (a) => Array.from(new Set(a.filter(Boolean)));
  const byN = {};
  fresh.forEach((x) => { const n = nameOfEmail(x.by); byN[n] = (byN[n] || 0) + 1; });
  return { n: fresh.length, lastId: fresh[0].id, last: fresh[0].at, by: uniq(fresh.map((x) => nameOfEmail(x.by))), byN: byN, areas: uniq(fresh.map((x) => x.area)) };
}

// Query buttons (owners and engineers). Returns true when it handled the click.
function queryClick(act, el) {
  const id = el.dataset.id, v = el.dataset.v;
  if (act === 'lightbox') showLightbox(id);
  else if (act === 'lightbox-close') hideLightbox();
  else if (act === 'eq-open') {
    // Opened from Today (Needs you, Waiting for an answer): on its own, and the back button returns there, to the
    // same place. In the Queries list: under its own card (tap it again to close), scrolled to the top.
    if (S.engTab !== 'queries') {
      S.engBack = S.engTab; S.engBackY = window.scrollY;
      S.engTab = 'queries'; S.engQuery = id; S.engRegister = false; markSeenQ(id); window.scrollTo(0, 0); renderEng();
      return true;
    }
    if (!S.engBack && S.engQuery === id) { S.engQuery = ''; renderEng(); return true; }
    S.engBack = ''; S.engQuery = id; S.engRegister = false; markSeenQ(id); renderEng(); scrollCardTop(id);
  }
  else if (act === 'need-send') { if (!S.engReply || S.engReply.qid !== id) S.engReply = { qid: id, text: '' }; engSendReply(id); }
  else if (act === 'eq-back') {
    const back = S.engQuery && S.engBack, y = S.engBackY || 0;
    S.engQuery = ''; S.engRegister = false; S.engBack = '';
    if (back) { S.engTab = back; renderEng(); window.scrollTo(0, y); } else renderEng();
  }
  else if (act === 'eq-register') { S.engRegister = true; renderEng(); }
  else if (act === 'ask-chip') { S.ask[el.dataset.f] = v; renderEng(); }
  else if (act === 'ask-send') engSendAsk();
  else if (act === 'ask-unattach') { S.ask.photoIds = (S.ask.photoIds || []).filter((x) => x !== id); renderEng(); }
  else if (act === 'er-send') engSendReply(id);
  else if (act === 'q-open') {
    // Narrow: tapping the open card closes it; another card opens under itself, scrolled to the top.
    if (narrowQ.matches && S.qOpen && S.qSel === id) { S.qOpen = false; S.qc = null; renderAll(); return true; }
    S.qSel = id; S.qOpen = true; S.qc = null; renderAll();
    if (narrowQ.matches) scrollCardTop(id);
  }
  else if (act === 'q-view') { S.qView = v; renderAll(); }
  else if (act === 'qm-start') { S.qMove = { qid: id, to: '', err: '', sending: false }; renderAll(); }
  else if (act === 'qm-cancel') { S.qMove = null; renderAll(); }
  else if (act === 'qm-go') moveQueryNow(id);
  else if (act === 'q-print') printRegister(el.dataset.code);
  else if (act === 'qc-photo') { S.qc.photoAsk = true; S.qc.err = ''; renderAll(); }
  else if (act === 'qc-photo-cancel') { S.qc.photoAsk = false; S.qc.photoHow = []; renderAll(); }
  else if (act === 'qc-how') { const h = S.qc.photoHow || (S.qc.photoHow = []); const i = h.indexOf(v); if (i >= 0) h.splice(i, 1); else h.push(v); renderAll(); }
  else if (act === 'qc-photo-send') ownerSend(true);
  else if (act === 'qc-send') ownerSend(false);
  else if (act === 'qc-outcome') {
    S.qc.outcome = v; S.qc.err = '';
    // A change is usually work for the site: the task box starts ticked (it can be unticked).
    if (v === 'change' && !S.qc.taskTouched) S.qc.task = true;
    renderAll();
  }
  else if (act === 'qc-cause') { S.qc.cause = v; S.qc.err = ''; renderAll(); }
  else if (act === 'pcode-save') projCodeSave(el.dataset.code);
  else if (act === 'tcode-save') todayCodeSave();
  else if (act === 'np-open') { S.tab = 'projects'; S.projTab = el.dataset.code || id; S.projSec = 'site'; S.photosSeenWant = S.projTab; renderAll(); window.scrollTo(0, 0); }
  else if (act === 'qc-approve') approveSuggestion(id);
  else if (act === 'q-back') { S.qOpen = false; renderAll(); window.scrollTo(0, 0); }
  else if (act === 'reg-link') { S.projSec = 'queries'; S.qView = 'register'; renderAll(); window.scrollTo(0, 0); }
  else if (act === 'ph-back') { S.photoSel = ''; renderAll(); }
  else if (act === 'open-file') openFile(id);
  else if (act === 'att-del') { const l = S.att[el.dataset.p] || []; S.att[el.dataset.p] = l.filter((x) => x.id !== id); redraw(); }
  else if (act === 'today-mine') { S.todayMine = !!v; renderAll(); }
  else if (act === 'reg-open') { S.qView = 'list'; S.qSel = id; S.qOpen = true; S.qc = null; renderAll(); window.scrollTo(0, 0); if (narrowQ.matches) scrollCardTop(id); }
  else if (act === 'today-query') { S.projTab = el.dataset.code; S.projSec = 'queries'; S.qSel = id; S.qOpen = true; S.qView = 'list'; S.qc = null; renderAll(); window.scrollTo(0, 0); if (narrowQ.matches) scrollCardTop(id); }
  else if (act === 'needs-query') { S.projSec = 'queries'; S.qSel = id; S.qOpen = true; S.qView = 'list'; S.qc = null; renderAll(); window.scrollTo(0, 0); if (narrowQ.matches) scrollCardTop(id); }
  else if (act === 'ph-open-site') { S.projSec = 'site'; S.photosSeenWant = S.projTab; openPhoto(id); renderAll(); }
  else if (act === 'task-src') { if (id) markSeenTask(id); openTaskSource(el.dataset.src, id); }
  else if (act === 'co-start') {
    const q = S.queries.queries.find((x) => x.id === id), t = q ? queryTasks(q).find((x) => !x.after) : null;
    S.co = { qid: id, cause: '', changeText: t ? LC.cap(t.note) : '', area: (q && q.area) || '', date: todayIso(), cost: '', err: '' };
    renderAll();
  }
  else if (act === 'co-cause') { S.co.cause = v; S.co.err = ''; renderAll(); }
  else if (act === 'co-tag') { S.co.answerTag = S.co.answerTag === v ? '' : v; renderAll(); }
  else if (act === 'qc-tag') { S.qc.answerTag = S.qc.answerTag === v ? '' : v; renderAll(); }
  else if (act === 'reg-edit') {
    const r = S.queries.register.find((x) => x.project === el.dataset.code && x.no === id && !x.voided);
    if (r) S.regEdit = { project: r.project, no: r.no, text: r.text, area: r.area || '', cause: r.cause, cost: r.cost == null ? '' : String(r.cost), err: '',
      base: { text: r.text, area: r.area || '', cause: r.cause, cost: r.cost == null ? '' : String(r.cost) } };
    renderAll();
  }
  else if (act === 'reg-save') saveRegisterEdit();
  else if (act === 'reg-cancel') { S.regEdit = null; renderAll(); }
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
    // Opened under its day: tapping the open photo again closes it.
    if (photosInline() && S.photoSel === el.dataset.id) { S.photoSel = ''; redraw(); return true; }
    if (!S.engineer && S.projSec === 'site') S.photosSeenWant = S.projTab;
    openPhoto(el.dataset.id);
    redraw();
    const panel = $('phPanel');
    if (panel && photosInline()) panel.scrollIntoView({ block: 'start' });
  } else if (act === 'ph-comment') sendPhotoComment(false);
  else if (act === 'ph-task') sendPhotoComment(true);
  else if (act === 'ph-delete') {
    if (S.confirmPhotoDel === el.dataset.id) deletePhotoNow(el.dataset.id); else { S.confirmPhotoDel = el.dataset.id; redraw(); }
  } else if (act === 'ph-reload') { if (S.photosFor) { if (!S.engineer) S.photosSeenWant = S.photosFor; S.thumbs = {}; THUMB_ASKED.clear(); loadPhotos(S.photosFor); } }
  else if (act === 'ph-send') sendDrafts(S.engProject);
  else if (act === 'ph-ask') askAboutPhoto(el.dataset.id);
  else if (act === 'draft-del') idbDel('drafts', el.dataset.id).then(loadDrafts).then(redraw);
  else if (act === 'out-drop') {
    Promise.all(OUT.items.filter((x) => x.error).map((x) => idbDel('outbox', x.id))).then(refreshOutbox);
  } else if (act === 'out-retry') { OUT.fails = 0; flushOutbox(); }
  else return false;
  return true;
}

/* ---------- drawings (Drawings lite; design boards Drawings + DwgPhone) ---------- */
// The open project's drawings: { project, drawings: [{ code, title, latest, older }] }. Older revisions come only to
// owners (the server never sends them to site engineers or associates).
S.dwgs = null; S.dwgsFor = ''; S.dwgUp = null; S.dwgKeys = [];
// The last list per project is kept on the device too, so saved drawings open with no signal.
const DWG_LIST_KEY = 'oft.dwgs.' + CONFIG.env + '.';
function loadDrawings(code, then) {
  S.dwgsFor = code;
  let cached = null;
  try { cached = JSON.parse(stored(DWG_LIST_KEY + code) || 'null'); } catch (_) { cached = null; }
  loadSavedDwgs().then(() => { if (S.dwgsFor === code && !S.dwgs && cached) { S.dwgs = cached; bgRedraw(); } });
  api('listDrawings', [code]).then((res) => {
    if (S.dwgsFor !== code) return;
    S.dwgs = res;
    store(DWG_LIST_KEY + code, JSON.stringify(res));
    keepSavedCurrent(res);
    if (then) then();
    bgRedraw();
  }, (err) => {
    if (err.signin) { signedOut(err.message); return; }
    // No signal: the list kept on this device stands (the strip at the top already says there's no signal).
    if (err.network && cached) { if (!S.dwgs) { S.dwgs = cached; bgRedraw(); } return; }
    attErr(err);
  });
}
// Saved on this device for no signal: one per drawing (project|code), always its latest revision. Keys only in
// memory ("NST|RCP|<id>"); the PDFs stay in the phone's storage until opened.
const idbKeys = (store) => idbDo(store, 'readonly', (st) => st.getAllKeys());
const idbGet = (store, id) => idbDo(store, 'readonly', (st) => st.get(id));
function loadSavedDwgs() { return idbKeys('dwgs').then((k) => { S.dwgKeys = (k || []).map(String); }, () => { S.dwgKeys = []; }); }
const dwgKey = (project, d) => project + '|' + d.code + '|' + d.latest.id;
function savedKeyOf(project, code) { return S.dwgKeys.find((k) => k.indexOf(project + '|' + code + '|') === 0) || ''; }
function isSaved(project, d) { return S.dwgKeys.indexOf(dwgKey(project, d)) >= 0; }
// A drawing saved on this device whose newer revision came out: the new one replaces it (when there is signal).
function keepSavedCurrent(res) {
  if (!navigator.onLine) return;
  loadSavedDwgs().then(() => {
    let chain = Promise.resolve();
    res.drawings.forEach((d) => {
      const k = savedKeyOf(res.project, d.code);
      if (k && k !== dwgKey(res.project, d)) chain = chain.then(() => (viewable(d.latest) ? saveDrawing(res.project, d, true) : null)).then(() => idbDel('dwgs', k)).catch(() => { /* next time */ });
    });
    // A drawing withdrawn altogether: its saved copy goes too.
    S.dwgKeys.filter((k) => k.indexOf(res.project + '|') === 0 && !res.drawings.some((d) => d.code === k.split('|')[1]))
      .forEach((k) => { chain = chain.then(() => idbDel('dwgs', k)).catch(() => { /* next time */ }); });
    chain.then(loadSavedDwgs).then(bgRedraw);
  });
}
// PDFs and pictures open in the browser and are kept for no signal; any other file (DWG, XLS…) is downloaded when
// tapped and opens in the device's own app (if it has one).
const VIEWABLE = { PDF: 'application/pdf', JPG: 'image/jpeg', JPEG: 'image/jpeg', PNG: 'image/png', WEBP: 'image/webp' };
function fileTypeOf(x) { return String((x && x.fileType) || 'PDF').toUpperCase(); }
function viewable(x) { return !!VIEWABLE[fileTypeOf(x)]; }
function sizeText(bytes) { return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB'; }
function saveDrawing(project, d, quiet) {
  return api('drawingFile', [d.latest.id]).then((f) => idbPut('dwgs', { id: dwgKey(project, d), name: f.name, mime: f.mime, data: f.data, savedAt: Date.now() }))
    .then(loadSavedDwgs).then(() => { if (!quiet) { (S.engineer ? engSnack : snack)(d.title + ' saved on this device.'); } bgRedraw(); });
}
function unsaveDrawing(project, d) { return idbDel('dwgs', dwgKey(project, d)).then(loadSavedDwgs).then(bgRedraw); }
function saveAllDrawings(project) {
  const list = ((S.dwgs && S.dwgs.drawings) || []).filter((d) => viewable(d.latest) && !isSaved(project, d));
  let chain = Promise.resolve();
  list.forEach((d) => { chain = chain.then(() => saveDrawing(project, d, true)); });
  chain.then(() => (S.engineer ? engSnack : snack)('All ' + plural(((S.dwgs && S.dwgs.drawings) || []).filter((d) => viewable(d.latest)).length, 'drawing', 'drawings') + ' saved on this device.'), attErr);
}
// The file as a link for this page; from this device when saved there, so it opens without signal.
function fileFromBase64(b64, mime) {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime || 'application/pdf' }));
}
function openDrawing(id, download) {
  const project = S.dwgsFor, all = (S.dwgs && S.dwgs.drawings) || [];
  const d = all.find((x) => x.latest.id === id) || null;
  const rev = d ? d.latest : all.reduce((f, x) => f || (x.older || []).find((o) => o.id === id), null);
  // Not a PDF or a picture: always a download (the phone or computer opens it with its own app).
  const save = download || (rev && !viewable(rev));
  const w = save ? null : window.open('', '_blank');
  if (w) w.document.write('<p style="font:16px sans-serif;padding:24px">Opening…</p>');
  if (save && rev && !viewable(rev)) (S.engineer ? engSnack : snack)('Downloading ' + fileTypeOf(rev) + ' · ' + sizeText(rev.size) + '…');
  const show = (name, b64, mime) => {
    const url = fileFromBase64(b64, mime);
    if (w) { w.location.href = url; return; }
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  };
  const local = d && isSaved(project, d) ? idbGet('dwgs', dwgKey(project, d)) : Promise.resolve(null);
  return local.then((rec) => (rec ? show(rec.name, rec.data, rec.mime) : api('drawingFile', [id]).then((f) => show(f.name, f.data, f.mime))))
    .catch((err) => { if (w) w.close(); if (err && err.signin) signedOut(err.message); else attErr(err); });
}
function downloadAllDrawings() {
  let chain = Promise.resolve();
  ((S.dwgs && S.dwgs.drawings) || []).forEach((d) => { chain = chain.then(() => openDrawing(d.latest.id, true)); });
}
// Site engineers: whenever the phone has signal, the latest PDF/picture of every drawing on HIS projects is saved on
// the phone by itself (a new revision replaces the old one at once; a withdrawn one goes back to the one before), so
// he never works from no drawing or an old one. "Save all for no signal" stays as a button. One run at a time.
let autoSaving = false, autoSavedAt = 0;
function autoSaveDrawings(force) {
  if (!S.engineer || autoSaving || !navigator.onLine || !sessionToken()) return;
  if (!force && Date.now() - autoSavedAt < 5 * 60000) return;
  const mine = (engMe().projects || []).filter((p) => engProjects().some((x) => x.code === p));
  if (!mine.length) return;
  autoSaving = true;
  let chain = loadSavedDwgs();
  mine.forEach((p) => {
    chain = chain.then(() => api('listDrawings', [p])).then((res) => {
      store(DWG_LIST_KEY + p, JSON.stringify(res));
      if (S.dwgsFor === p) S.dwgs = res;
      const want = {};
      res.drawings.forEach((d) => { if (viewable(d.latest)) want[d.code] = dwgKey(p, d); });
      // Saved copies that are no longer the latest (a new revision, or withdrawn): out.
      const stale = S.dwgKeys.filter((k) => k.indexOf(p + '|') === 0 && want[k.split('|')[1]] !== k);
      let c = Promise.all(stale.map((k) => idbDel('dwgs', k)));
      res.drawings.filter((d) => viewable(d.latest) && S.dwgKeys.indexOf(dwgKey(p, d)) < 0).forEach((d) => { c = c.then(() => saveDrawing(p, d, true)); });
      return c.then(loadSavedDwgs);
    }).catch(() => { /* no signal or a refusal: next time */ });
  });
  chain.finally(() => { autoSaving = false; autoSavedAt = Date.now(); bgRedraw(); });
}
window.addEventListener('online', () => autoSaveDrawings(true));
function releasedText(at) { const day = String(at || '').slice(0, 10); return 'Released ' + (day === todayIso() ? 'today' : niceDay(day)); }
// One drawing. Phones: title, file name, Save / Saved (for no signal). Wide: latest with "Latest" and its date;
// owners also see the previous revision (crossed out) and can open older ones.
// "DWG · 8.2 MB" (and "Owners only" for owners, on an upload only they get).
function dwgMetaHtml(x) {
  return '<span class="dwg-meta">' + esc(fileTypeOf(x) + ' · ' + sizeText(x.size || 0)) + (x.ownersOnly ? ' · <b class="dwg-own">Owners only</b>' : '') + '</span>';
}
function dwgRowHtml(project, d, compact) {
  const owner = !S.engineer && isOwner();
  const chip = '<span class="dwg-code">' + esc(d.code) + '</span>';
  if (compact) {
    const saved = isSaved(project, d), canSave = viewable(d.latest);
    return '<div class="dwg-row compact">' + chip + '<button type="button" class="dwg-main" data-act="dwg-open" data-id="' + esc(d.latest.id) + '"><b>' + esc(d.title) + '</b>' +
      '<span class="mono small muted">' + esc(d.latest.name) + '</span>' + dwgMetaHtml(d.latest) + '</button>' +
      (canSave ? '<button type="button" class="dwg-save' + (saved ? ' on' : '') + '" data-act="' + (saved ? 'dwg-unsave' : 'dwg-save') + '" data-id="' + esc(d.latest.id) + '" aria-label="' +
        esc((saved ? 'Saved on this device: ' : 'Save on this device: ') + d.title) + '">' + (saved ? 'Saved' : 'Save') + '</button>'
        : '<button type="button" class="dwg-save" data-act="dwg-download" data-id="' + esc(d.latest.id) + '" aria-label="Download ' + esc(d.title) + '">Download</button>') + '</div>';
  }
  const prev = owner && d.older.length ? d.older[0] : null, more = owner ? d.older.slice(1) : [];
  const open = S.dwgOlder === d.code;
  const confirmDel = S.confirmDel === 'dwg:' + d.latest.id;
  return '<div class="dwg-row">' + chip + '<div class="dwg-text"><b>' + esc(d.title) + '</b>' +
    '<span class="dwg-latest"><span class="mono">' + esc(d.latest.name) + '</span><span class="pill pill-ok">Latest</span><span class="muted small">' + esc(releasedText(d.latest.at)) + '</span>' + dwgMetaHtml(d.latest) + '</span>' +
    (prev ? '<span class="dwg-prev"><button type="button" class="link-btn mono" data-act="dwg-open" data-id="' + esc(prev.id) + '">' + esc(prev.name) + '</button><span class="small">Previous</span>' +
      (more.length ? '<button type="button" class="link-btn small" data-act="dwg-older" data-id="' + esc(d.code) + '" aria-expanded="' + open + '">' + (open ? 'Hide older' : '+ ' + plural(more.length, 'older revision', 'older revisions')) + '</button>' : '') + '</span>' : '') +
    (open ? more.map((o) => '<span class="dwg-prev"><button type="button" class="link-btn mono" data-act="dwg-open" data-id="' + esc(o.id) + '">' + esc(o.name) + '</button><span class="small">' + esc(releasedText(o.at)) + '</span></span>').join('') : '') +
    (owner ? '<button type="button" class="link-btn small dwg-del" data-act="dwg-remove" data-id="' + esc(d.latest.id) + '">' +
      (confirmDel ? 'Tap again to take back R' + d.latest.revNo + (prev ? ' (R' + prev.revNo + ' becomes the latest)' : '') : 'Take back this upload') + '</button>' : '') + '</div>' +
    '<span class="dwg-btns"><button type="button" class="btn-outline" data-act="dwg-open" data-id="' + esc(d.latest.id) + '">Open</button>' +
    '<button type="button" class="btn-outline dwg-dl" data-act="dwg-download" data-id="' + esc(d.latest.id) + '" aria-label="Download ' + esc(d.latest.name) + '">' + DOWNLOAD_ICON + '</button></span></div>';
}
const DOWNLOAD_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11 M7 10l5 5 5-5 M5 19h14" fill="none" stroke="currentColor" stroke-width="1.7"></path></svg>';
function dwgListHtml(project, compact) {
  if (!S.dwgs || S.dwgs.project !== project) return '<p class="empty">Loading…</p>';
  const list = S.dwgs.drawings;
  if (!list.length) return '<p class="empty">' + (!S.engineer && isOwner() ? 'No drawings yet. Upload the released PDFs: name each file like ' + esc(project) + '-RCP Dwg-241126-R1 and the app files it for you.'
    : 'No drawings released yet. Shruthi or Savan will upload them here.') + '</p>';
  // Only PDFs and pictures are kept for no signal (other files download when tapped).
  const keep = list.filter((d) => viewable(d.latest)), saved = keep.filter((d) => isSaved(project, d)).length;
  const auto = S.engineer && (engMe().projects || []).indexOf(project) >= 0;
  return (compact && keep.length ? '<div class="dwg-offline small muted"><span>' + saved + ' of ' + keep.length + ' saved on this ' + (phone.matches ? 'phone' : 'device') +
    (auto ? ' · saved by itself when there’s signal' : '') + '</span>' +
    (saved < keep.length ? '<button type="button" class="link-btn" data-act="dwg-save-all">Save all for no signal</button>' : '') + '</div>' : '') +
    list.map((d) => dwgRowHtml(project, d, compact)).join('');
}
// Engineers → Drawings: the latest of each, saved on the phone for no signal.
function engDrawingsHtml() {
  const proj = S.engProject;
  if (proj && S.dwgsFor !== proj) { S.dwgs = null; loadDrawings(proj); }
  // Design board DwgPhone: no intro line; each drawing its own small card.
  return '<section class="eng-dwgs"><h2 class="eng-h2" style="padding-left:0">Drawings · ' + esc(engProjName(proj)) + '</h2>' + dwgListHtml(proj, true) + '</section>';
}
// Owners and associates → project → Drawings. Owners upload; the panel shows what the file name says before it goes.
function projectDrawingsHtml(p) {
  if (S.dwgsFor !== p.code) { S.dwgs = null; S.dwgUp = null; loadDrawings(p.code); }
  const owner = isOwner(), compact = phone.matches, list = (S.dwgs && S.dwgs.drawings) || [];
  const bar = '<div class="sec-head dwg-bar"><div><h3>Drawings</h3><span class="muted small">What the site builds from: the latest released drawing of each kind.</span></div><div class="dwg-btns">' +
    (!compact && list.length ? '<button type="button" class="btn-outline" data-act="dwg-all">' + DOWNLOAD_ICON + ' Download all latest</button>' : '') +
    (owner ? '<label class="btn-main dwg-up">Upload released drawing<input type="file" data-dwg-pick="1" hidden></label>' : '') + '</div></div>';
  const naming = owner ? '<section class="card dwg-help"><b>How naming works</b><span class="mono dwg-eg">' + esc(p.code) + '-ELE Dwg-101026-R2.pdf</span>' +
    '<span class="muted small">' + esc(LC.cap(DWG_RULES)) + '. Name the file this way on your laptop and the app files it for you. The project part can be the code (' + esc(p.code) + ') or the site name.</span>' +
    '<span class="muted small">Any kind of file up to 15 MB: PDF, DWG, XLS, JPG… PDFs and pictures open in the app and are kept on phones for no signal; other files download and open in the device’s own app.</span>' +
    '<span class="muted small">Site engineers and associates get only the latest revision. Older ones stay here for you and Savan.</span></section>' : '';
  const panel = owner && S.dwgUp ? dwgUploadHtml(p) : '';
  if (compact) return bar + panel + '<section class="dwg-list compact">' + dwgListHtml(p.code, true) + '</section>' + naming;
  return bar + '<div class="dwg-wrap"><section class="card dwg-list">' + dwgListHtml(p.code, false) + '</section><aside class="dwg-side">' + panel + naming + '</aside></div>';
}
const MAX_DWG_BYTES = 15 * 1024 * 1024;
function pickDrawing(file) {
  const p = projInfo(S.projTab);
  if (!p) return;
  // Any kind of file (PDF, DWG, XLS, JPG…), up to 15 MB.
  if (file.size > MAX_DWG_BYTES) { snack('That file is ' + sizeText(file.size) + ': over 15 MB. Save it smaller or zip it, then upload again.', { error: true }); return; }
  const m = LC.parseDwgName(file.name), list = (S.dwgs && S.dwgs.drawings) || [];
  const code = m ? m.code : '', have = list.find((d) => d.code === code);
  const ext = (/\.([A-Za-z0-9]{1,6})$/.exec(file.name) || [])[1];
  S.dwgUp = { file: file, fileName: file.name, fileType: ext ? ext.toUpperCase() : 'PDF', size: file.size, read: !!m, prefix: m ? m.prefix : '', code: code,
    title: have ? have.title : (LC.DWG_TYPES[code] || ''), ownersOnly: false,
    revNo: m ? String(m.revNo) : have ? String(have.latest.revNo + 1) : '1', dated: m ? m.dated : todayIso(), err: '', sending: false };
  renderAll();
}
// Why this upload would be refused ("RCP R1 is already released. Use R2 or more."), or ''.
function dwgRefused() {
  const u = S.dwgUp, have = ((S.dwgs && S.dwgs.drawings) || []).find((d) => d.code === String(u.code || '').trim().toUpperCase());
  return have && !(Number(u.revNo) > have.latest.revNo) ? have.code + ' R' + have.latest.revNo + ' is already released. Use R' + (have.latest.revNo + 1) + ' or more.' : '';
}
// "R4 replaces R3. R3 becomes the previous revision; older ones stay for you and Savan." A refusal: one red message.
function dwgNoteHtml() {
  const u = S.dwgUp, have = ((S.dwgs && S.dwgs.drawings) || []).find((d) => d.code === String(u.code || '').trim().toUpperCase());
  const r = Number(u.revNo), no = dwgRefused();
  if (no) return '<span class="err" role="alert">' + esc(no) + '</span>';
  if (!have) return u.code ? 'A new drawing: ' + esc(String(u.code).toUpperCase()) + ' R' + esc(u.revNo) + '.' : '';
  return 'R' + r + ' replaces R' + have.latest.revNo + '. R' + have.latest.revNo + ' becomes the previous revision; the site sees only R' + r + '. Nothing is deleted.';
}
const DWG_RULES = 'project code or site name · type code (2 to 6 letters, no spaces or numbers) · “Dwg” · date ddmmyy · R and the revision';
// The upload panel (design board Drawings): what the file name says, as plain text with a small "Edit"; the boxes open
// by themselves only when the name doesn't follow the pattern (with a hint how to name it next time).
function dwgUploadHtml(p) {
  const u = S.dwgUp;
  const otherProj = u.prefix && !LC.dwgPrefixIs(S.dir, u.prefix, p.code);
  const have = ((S.dwgs && S.dwgs.drawings) || []).find((d) => d.code === String(u.code || '').trim().toUpperCase());
  const head = '<div class="muted small">' + (u.read ? 'Read from the file name' : 'The file name doesn’t follow the pattern: fill these in') + '</div>' +
    // The whole real name, endings included, so a hidden doubled ending ("….dwg.pdf") shows.
    '<div class="mono dwg-fname">' + esc(String(u.fileName)) + '</div>' +
    '<span class="dwg-meta">' + esc((u.fileType || 'PDF') + ' · ' + sizeText(u.size || 0)) + '</span>' +
    (u.read ? '' : '<p class="small dwg-hint">Next time, name the file like <span class="mono">' + esc(p.code) + '-RCP Dwg-' + dwgToday() + '-R1</span>: ' + esc(DWG_RULES) + '. The app then fills these in.</p>') +
    (otherProj ? '<p class="warn small">The file name starts with “' + esc(u.prefix) + '”, but this is ' + esc(p.name || p.code) + ' (' + esc(p.code) + '). Check it’s the right project.</p>' : '');
  // Refused (a revision already out): one red message, and Release greyed out.
  const refused = !!dwgRefused();
  const buttons = (u.err && !refused ? '<p class="err" role="alert">' + esc(u.err) + '</p>' : '') +
    '<label class="pcheck dwg-ownonly"><input type="checkbox" data-dup-own="1"' + (u.ownersOnly ? ' checked' : '') + '> <b>Owners only</b> <span class="muted small">(rates, quotes, contracts: only you and Savan get it; no alert to the site)</span></label>' +
    '<div class="dwg-btns"><button type="button" class="btn-accent" data-act="dwg-release"' + (u.sending || refused ? ' disabled' : '') + '>' + (u.sending ? 'Uploading…' : 'Release' + (u.ownersOnly ? ' (owners only)' : ' to site')) + '</button>' +
    '<button type="button" class="btn-outline" data-act="dwg-cancel">Cancel</button></div>' +
    (u.ownersOnly ? '' : '<span class="muted small">The site engineers and associates on ' + esc(p.name || p.code) + ' get a “New drawing” alert.</span>') + '</section>';
  if (u.read && u.title && !u.editing) {
    const row = (k, v) => '<dt>' + esc(k) + '</dt><dd>' + v + '</dd>';
    return '<section class="card dwg-panel">' + head +
      '<dl class="dwg-read">' + row('Project', esc((p.name || p.code) + ' (' + p.code + ')')) +
      row('Drawing', esc(u.title || u.code) + ' <span class="mono muted">' + esc(u.code) + '</span>') +
      row('Dated', esc(u.dated ? niceY(u.dated) : '—')) +
      row('Revision', 'R' + esc(u.revNo) + (refused ? ' <span class="err-txt">· already released</span>' : have ? ' <span class="muted">replaces R' + esc(have.latest.revNo) + '</span>' : ' <span class="muted">first one</span>')) + '</dl>' +
      '<button type="button" class="link-btn small" data-act="dwg-edit">Edit</button>' +
      '<div class="dwg-note" id="dwgNote">' + dwgNoteHtml() + '</div>' + buttons;
  }
  return '<section class="card dwg-panel">' + head +
    '<div class="muted small dwg-proj">Project: ' + esc((p.name || p.code) + ' (' + p.code + ')') + '</div>' +
    '<div class="dwg-fields">' +
    '<label>Drawing type<input id="dwgCode" data-dup="code" value="' + esc(u.code) + '" maxlength="6" autocapitalize="characters" placeholder="e.g. ELE"></label>' +
    '<label class="dwg-wide">What it is<input id="dwgTitle" data-dup="title" list="dwgTitles" value="' + esc(u.title) + '" placeholder="e.g. Electrical layout"></label>' +
    '<datalist id="dwgTitles">' + Object.keys(LC.DWG_TYPES).map((k) => '<option value="' + esc(LC.DWG_TYPES[k]) + '">').join('') + '</datalist>' +
    '<label>Revision<span class="dwg-rev">R<input id="dwgRev" data-dup="revNo" value="' + esc(u.revNo) + '" inputmode="numeric" maxlength="3"></span></label>' +
    '<label>Dated<input id="dwgDated" data-dup="dated" type="date" value="' + esc(u.dated) + '"></label></div>' +
    '<div class="dwg-note" id="dwgNote">' + dwgNoteHtml() + '</div>' + buttons;
}
function dwgToday() { const d = new Date(); return LC.pad(d.getDate()) + LC.pad(d.getMonth() + 1) + String(d.getFullYear()).slice(2); }
function releaseDrawing() {
  const u = S.dwgUp, p = projInfo(S.projTab);
  if (!u || !p || u.sending) return;
  const code = String(u.code || '').trim().toUpperCase(), title = String(u.title || '').trim(), revNo = Number(u.revNo);
  if (!/^[A-Z]{2,6}$/.test(code)) { u.err = 'The drawing type is 2 to 6 letters, like RCP or ELE.'; renderAll(); return; }
  if (!title) { u.err = 'Say what this drawing is.'; renderAll(); return; }
  if (!(revNo >= 0) || String(u.revNo).trim() === '') { u.err = 'Give the revision number, like 4 for R4.'; renderAll(); return; }
  if (dwgRefused()) { renderAll(); return; }
  u.sending = true; u.err = '';
  renderAll();
  readBase64(u.file).then((data) => api('uploadDrawing', [{ id: newId(), project: p.code, fileName: u.fileName, code: code, title: title, revNo: revNo, dated: u.dated,
    ownersOnly: !!u.ownersOnly, data: data }]))
    .then((res) => {
      // Only this upload's panel closes: a next file picked while this one was uploading stays as it is.
      if (S.dwgsFor === p.code) S.dwgs = res;
      if (S.dwgUp === u) S.dwgUp = null;
      snack(u.ownersOnly ? title + ' R' + revNo + ' saved for owners only. Nobody else gets it.' : title + ' R' + revNo + ' released to site. The site team gets a “New drawing” alert.');
      renderAll();
    }, (err) => {
      if (err.signin) { signedOut(err.message); return; }
      u.sending = false; u.err = cleanErr(err.message);
      if (S.dwgUp !== u) snack(title + ' R' + revNo + ' was not uploaded: ' + u.err, { error: true }); // its panel was replaced by the next file
      renderAll();
    });
}
// Drawing buttons, the same for owners, associates and engineers. Returns true when it handled the click.
function dwgClick(act, el) {
  const id = el.dataset.id, project = S.dwgsFor, d = ((S.dwgs && S.dwgs.drawings) || []).find((x) => x.latest.id === id);
  if (act === 'dwg-open') openDrawing(id, false);
  else if (act === 'dwg-download') openDrawing(id, true);
  else if (act === 'dwg-all') downloadAllDrawings();
  else if (act === 'dwg-save') { if (d) saveDrawing(project, d).catch(attErr); }
  else if (act === 'dwg-unsave') { if (d) unsaveDrawing(project, d); }
  else if (act === 'dwg-save-all') saveAllDrawings(project);
  else if (act === 'dwg-older') { S.dwgOlder = S.dwgOlder === id ? '' : id; redraw(); }
  else if (act === 'dwg-release') releaseDrawing();
  else if (act === 'dwg-cancel') { S.dwgUp = null; redraw(); }
  else if (act === 'dwg-edit') { if (S.dwgUp) S.dwgUp.editing = true; redraw(); }
  else if (act === 'dwg-remove') {
    if (S.confirmDel !== 'dwg:' + id) { S.confirmDel = 'dwg:' + id; redraw(); return true; }
    S.confirmDel = '';
    api('removeDrawing', [id]).then((res) => { S.dwgs = res; snack('Upload taken back. The revision before it is the latest again; the site team gets a “Drawing withdrawn” alert.'); redraw(); }, (err) => { if (err.signin) signedOut(err.message); else attErr(err); });
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
  const t0 = Date.now();
  api('listQueries', ['']).then((res) => {
    if (!((S.queriesAt || 0) > t0)) setQueries(res); // a newer list arrived meanwhile: keep it
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
// "Answered" can say where the answer came from (optional chips; counted for the handover report).
function answerTagHtml(act, cur) {
  const tags = (S.queries && S.queries.answerTags) || [];
  return '<div class="muted small">Where did the answer come from? (optional, for the handover report)</div><div class="chip-group">' +
    tags.map((t) => '<button type="button" class="fchip' + (cur === t ? ' on' : '') + '" data-act="' + act + '" data-v="' + esc(t) + '" aria-pressed="' + (cur === t) + '">' + esc(t) + '</button>').join('') + '</div>';
}
function queryState(q) {
  if (q.status === 'closed') return { text: 'Closed · ' + (q.outcome === 'change' ? 'Change approved' + (q.changeNo ? ' ' + q.changeNo : '') : 'Answered' + (q.answerTag ? ' · ' + q.answerTag : '')) + (queryTasks(q).length ? ' + task' : ''), cls: 'ok' };
  if (q.status === 'waiting_photo') return { text: 'Waiting for photo', cls: 'wait' };
  const since = waitSince(q);
  return { text: since ? 'Waiting ' + ageText(since) : 'Replied · waiting for ' + firstName(q.askedBy), cls: q.workOnHold || waitDays(q) ? 'bad' : 'wait' };
}
// The waiting clock: from the asker's FIRST message after the last answer from someone else (an owner or associate),
// or from when they asked if nobody has answered. '' when the last word was someone else's (it's the asker's move).
// A suggestion still waiting for an owner's OK is not an answer yet.
function waitSince(q) {
  if (!q || q.status !== 'open') return '';
  const msgs = ((S.queries && S.queries.messages) || []).filter((m) => m.queryId === q.id && !(m.kind === 'suggest' && !m.approvedBy))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  let since = q.askedAt;
  msgs.forEach((m) => {
    if (m.by !== q.askedBy) since = '';
    else if (!since) since = m.at;
  });
  return since;
}
// Unanswered for more than a day: "waiting 2 days" in red, even with work continuing (Today, Needs you, the Queries
// list, the engineer's Waiting for an answer).
function waitDays(q) {
  const since = waitSince(q);
  if (!since) return 0;
  const h = (Date.now() - Date.parse(String(since).replace(' ', 'T') + ':00+05:30')) / 3600000;
  return h > 24 ? Math.floor(h / 24) : 0;
}
function waitRed(q) { const d = waitDays(q); return d ? '<span class="hold-txt">waiting ' + plural(d, 'day', 'days') + '</span>' : ''; }
// "work on hold · needs Raju · Painting" with "work on hold" in red (as on Today), for lists drawn as HTML.
function workHtml(q, first) {
  const t = workText(q, true), c = (s) => (first ? LC.cap(s) : s);
  return q.workOnHold && q.status !== 'closed' ? '<span class="hold-txt">' + c('work on hold') + '</span>' + esc(t.slice('work on hold'.length)) : esc(c(t));
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
  const t = l.what === 'photo' ? (me ? 'You sent a photo' : 'New photo from ' + who) : l.what === 'reply' ? (me ? 'You replied' : 'Reply from ' + who)
    : l.what === 'suggest' ? 'Suggested answer from ' + who + (q.status !== 'closed' && !S.engineer && isOwner() ? ' · needs your OK' : '')
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
// A task someone else gave me that I haven't opened yet: "New" (blue) until I open it. A task sent back with "Redo"
// is new again.
function taskSeenMark(e) { return e.review === 'redo' ? ('redo:' + String(e.review_note || '')).slice(0, 50) : '1'; }
function isNewTask(e, code) {
  return !!(e && !e.done && code && e.assignee === code && e.added_by && S.me && e.added_by !== S.me.email && seenMap()['task:' + e.id] !== taskSeenMark(e));
}
function markSeenTask(id) {
  const e = S.engineer ? ((S.site && S.site.tasks) || []).find((x) => x.id === id) : S.entries.find((x) => x.id === id);
  if (!isNewTask(e, S.engineer ? engMe().code : myCode())) return;
  const mark = taskSeenMark(e);
  S.seenLocal['task:' + id] = mark;
  api('markSeen', ['task:' + id, mark]).catch(() => { /* still marked on this device */ });
}
function setQueries(res) {
  S.queries = res;
  S.queriesAt = Date.now();
  loadThumbs(queryPhotoIds());
}
// How late a task is: "3 days overdue" (red), "Due today" (amber), "Due tomorrow" / "due Sat 24 Oct" (grey).
function dueChip(e) {
  if (e.done) return '<span class="due due-done">' + (e.review === 'ok' ? 'Checked ✓' : e.done_photo || e.donePhoto ? 'Done, with photo' : 'Done') + '</span>';
  const d = LC.dueText(e.due, todayIso());
  return '<span class="due due-' + d.level + '">' + esc(d.text) + '</span>';
}
// Photos as small pictures (tap: full size); PDFs as "📄 name.pdf" (tap: open).
function fileInfo(id) { return (S.queries && S.queries.files && S.queries.files[id]) || (S.photos && S.photos.files && S.photos.files[id]) || null; }
// A query card's picture: the latest real image in the thread (the server's pick; a PDF has none), else none.
function cardPhoto(q) { return q.lastPhotoId || (q.photoIds || []).filter((i) => !fileInfo(i)).pop() || ''; }
function photoStrip(ids) {
  if (!ids || !ids.length) return '';
  return '<div class="q-photos">' + ids.map((id) => {
    const f = fileInfo(id);
    if (f) return '<button type="button" class="file-chip" data-act="open-file" data-id="' + esc(id) + '">📄 ' + esc(f.name) + '</button>';
    return '<button type="button" class="q-photo" data-act="lightbox" data-id="' + esc(id) + '">' + (S.thumbs[id] ? '<img src="' + S.thumbs[id] + '" alt="Photo">' : '<span class="ph-wait"></span>') + '</button>';
  }).join('') + '</div>';
}
// A PDF opens in a new tab (through the app; the Drive file itself is never shared).
function openFile(id) {
  const w = window.open('', '_blank');
  if (w) w.document.write('<p style="font:16px sans-serif;padding:24px">Opening…</p>');
  api('photoFull', [id]).then((res) => {
    const bin = atob(res.url.split(',')[1]), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: res.kind === 'pdf' ? 'application/pdf' : 'image/jpeg' }));
    if (w) w.location.href = url;
    else { const a = document.createElement('a'); a.href = url; a.download = res.name || 'file.pdf'; document.body.appendChild(a); a.click(); a.remove(); }
  }, (err) => { if (w) w.close(); if (err.signin) signedOut(err.message); else attErr(err); });
}
// People's circles: owners dark with their code (SN, SK), everyone else blue with their initials.
function avatarHtml(email) {
  const u = teamUsers().find((x) => x.email === email), n = nameOfEmail(email);
  const own = u && u.role === 'owner';
  return '<span class="q-av' + (own ? ' own' : '') + '">' + esc(own && u.code ? u.code : initialsOfName(n)) + '</span>';
}

/* ---------- attachments: photos, screenshots and PDFs on replies and photo comments ---------- */
// purpose 'qc:<query id>' (an owner's or associate's reply) or 'pc:<photo id>' (a photo comment) → what is attached,
// kept in memory until sent. Photos are shrunk like site photos; PDFs go as they are (up to 10 MB).
S.att = {};
const MAX_PDF_BYTES = 10 * 1024 * 1024;
function isPdfFile(f) { return f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''); }
function readBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Couldn’t read that file.'));
    r.readAsDataURL(file);
  });
}
function attErr(err) { const msg = cleanErr(err && err.message); if (S.engineer) engSnack(msg, true); else snack(msg, { error: true }); }
function addAttachments(files, purpose) {
  let chain = Promise.resolve();
  Array.from(files || []).forEach((f) => {
    chain = chain.then(() => {
      if (isPdfFile(f)) {
        if (f.size > MAX_PDF_BYTES) throw new Error((f.name || 'That file') + ' is over 10 MB. Attach a smaller PDF.');
        return readBase64(f).then((data) => ({ id: newId(), kind: 'pdf', name: f.name || 'file.pdf', data: data }));
      }
      if (!/^image\//.test(f.type)) throw new Error('Attach a photo, a screenshot or a PDF.');
      return shrinkPhoto(f).then((p) => ({ id: newId(), kind: 'photo', name: '', full: p.full, thumb: p.thumb }));
    }).then((a) => { (S.att[purpose] = S.att[purpose] || []).push(a); }, attErr);
  });
  chain.then(redraw);
}
function attachHtml(purpose) {
  const list = S.att[purpose] || [];
  return '<div class="att">' + (list.length ? '<div class="q-photos">' + list.map((a) => '<span class="q-photo' + (a.kind === 'pdf' ? ' att-pdf' : '') + '">' +
    (a.kind === 'pdf' ? '<span class="att-name">📄 ' + esc(a.name) + '</span>' : '<img src="data:image/jpeg;base64,' + a.thumb + '" alt="">') +
    '<button type="button" class="q-x" data-act="att-del" data-p="' + esc(purpose) + '" data-id="' + esc(a.id) + '" aria-label="Remove">×</button></span>').join('') + '</div>' : '') +
    '<label class="btn-outline att-btn">Attach photo or PDF<input type="file" accept="image/*,application/pdf" multiple data-att="' + esc(purpose) + '" hidden></label>' +
    (phone.matches ? '' : '<span class="muted small att-hint">or paste a screenshot here (Ctrl+V)</span>') + '</div>';
}
// Sends one reply's or comment's attachments, one by one (a resend is saved once: each has its own id); gives their ids.
function uploadAttachments(purpose, project, linkedTo) {
  const ids = [];
  let chain = Promise.resolve();
  (S.att[purpose] || []).slice().forEach((a) => {
    chain = chain.then(() => (a.kind === 'pdf'
      ? api('uploadFile', [{ id: a.id, project: project, name: a.name, data: a.data, linkedTo: linkedTo }])
      : api('uploadPhoto', [{ id: a.id, project: project, batchId: '', area: '', caption: '', linkedTo: linkedTo, full: a.full, thumb: a.thumb }])))
      .then(() => { ids.push(a.id); if (a.kind === 'photo') S.thumbs[a.id] = 'data:image/jpeg;base64,' + a.thumb; });
  });
  return chain.then(() => ids);
}
// Laptop: Ctrl+V in a reply or comment box attaches the screenshot on the clipboard.
document.addEventListener('paste', (ev) => {
  const t = ev.target;
  const purpose = t.id === 'qcText' && S.qc ? 'qc:' + S.qc.qid : t.id === 'phComment' && S.photoSel ? 'pc:' + S.photoSel : '';
  const files = Array.from((ev.clipboardData && ev.clipboardData.files) || []).filter((f) => /^image\//.test(f.type) || isPdfFile(f));
  if (!purpose || !files.length) return;
  ev.preventDefault();
  addAttachments(files, purpose);
});
function bubble(email, when, body) {
  const n = nameOfEmail(email);
  return '<div class="q-msg">' + avatarHtml(email) + '<div class="q-body"><div class="muted small"><b class="q-name">' + esc(n) + '</b> · ' +
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
    // An associate's suggested answer: waiting for an owner's OK (owners can use it as their answer), or approved.
    // Approve ✓ (owners): one click closes the query as Answered with his words. An owner who answers in their own
    // words instead leaves the suggestion marked "not used".
    const suggest = m.kind !== 'suggest' ? '' : m.approvedBy ? '<span class="pill pill-ok">Suggested answer · approved by ' + esc(nameOfEmail(m.approvedBy)) + '</span>'
      : q.status === 'closed' ? '<span class="pill">Suggested answer · not used</span>'
      : '<span class="pill pill-wait">Suggested answer · waiting for Shruthi or Savan to approve</span>' +
        (!S.engineer && isOwner() ? ' <button type="button" class="btn-accent" data-act="qc-approve" data-id="' + esc(m.id) + '">Approve ✓</button>' : '');
    h += bubble(m.by, m.at, photoStrip(m.photoIds) + (m.text ? '<p>' + esc(m.text) + '</p>' : '') + suggest +
      (answered ? '<span class="pill pill-ok">Photo received</span>' : '') + (m.kind === 'done_photo' ? '<span class="pill pill-ok">Done, with photo</span>' : '') +
      (m.kind === 'redo' ? '<span class="pill pill-bad">Sent back</span>' : ''));
  });
  if (tasks.length) {
    const tname = (code) => esc((S.engineer ? taskForName(code) : LC.teamName(S.dir || { team: {} }, code)) || code);
    // "Task done by Venky · today 17:45" (with or without a photo), and his note.
    const state = (t) => t.done ? ' <span class="pill pill-ok">' + (t.donePhoto ? 'Done, with photo' : 'Done') + (t.review === 'ok' ? ' · checked ✓' : '') + '</span>' +
      (t.doneAt ? ' <span class="muted small">Task done' + (t.doneBy ? ' by ' + esc(firstName(t.doneBy)) : '') + ' · ' + esc(whenText(t.doneAt)) + '</span>' : '') +
      (t.doneNote ? '<span class="done-note">Note: ' + esc(t.doneNote) + '</span>' : '')
      : t.review === 'redo' ? ' <span class="pill pill-bad">Redo</span>' : '';
    const review = (t) => (!S.engineer && isOwner() ? reviewHtml(findEntry(t.id) || {}, true) : '');
    const first = tasks.filter((t) => !t.after), next = tasks.filter((t) => t.after);
    h += '<div class="q-tasks">' + first.map((t, i) => '<div><b>Task ' + (i + 1) + ' · ' + tname(t.assignee) + ' · ' + (t.done ? '' : dueChip(t)) + '</b>' +
      state(t) + '<br>' + esc(t.note) + review(t) + '</div>').join('') +
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
  else if (owner && isOwner()) h += changeOutcomeHtml(q);
  if (!S.engineer && isOwner()) h += moveQueryHtml(q);
  return h;
}
// Owners: a query asked on the wrong project moves to the right one, with its photos and its tasks. Not a change in a
// register (its C-number belongs to that project).
function moveQueryHtml(q) {
  const m = S.qMove && S.qMove.qid === q.id ? S.qMove : null;
  if (q.outcome === 'change' && q.changeNo) return '';
  if (!m) return '<button type="button" class="link-btn small q-move" data-act="qm-start" data-id="' + esc(q.id) + '">Asked on the wrong project? Move it</button>';
  const others = liveProjects().filter((p) => p.code !== q.project);
  return '<div class="q-move-box"><label>Move this query (with its photos and tasks) to<select data-qm="to"><option value="">Pick a project…</option>' +
    others.map((p) => '<option value="' + esc(p.code) + '"' + (m.to === p.code ? ' selected' : '') + '>' + esc((p.name || p.code) + ' (' + p.code + ')') + '</option>').join('') + '</select></label>' +
    (m.err ? '<p class="err" role="alert">' + esc(m.err) + '</p>' : '') +
    '<div class="ph-btns"><button type="button" class="btn-main" data-act="qm-go" data-id="' + esc(q.id) + '"' + (m.sending ? ' disabled' : '') + '>' + (m.sending ? 'Moving…' : 'Move') + '</button>' +
    '<button type="button" class="btn-outline" data-act="qm-cancel">Cancel</button></div></div>';
}
function moveQueryNow(id) {
  const m = S.qMove;
  if (!m || m.sending) return;
  if (!m.to) { m.err = 'Pick the project it belongs to.'; redraw(); return; }
  m.sending = true; m.err = ''; redraw();
  api('moveQuery', [id, m.to]).then((res) => {
    setQueries(res); S.qMove = null;
    // Follow it to its new project.
    S.projTab = m.to; S.projSec = 'queries'; S.qSel = id; S.qOpen = true;
    snack('Moved to ' + projName(m.to) + ', with its photos and tasks.');
    refresh(true);
  }, (err) => { if (err.signin) { signedOut(err.message); return; } m.sending = false; m.err = cleanErr(err.message); redraw(); });
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
    ? '<p class="small">' + esc((q.changeNo || 'Its number') + ' leaves the change register and is marked voided; the number is not used again.') + '</p>' + answerTagHtml('co-tag', c.answerTag)
    : '<div class="q-change"><div class="muted small">Why did this change? (for the handover report)</div><div class="chip-group">' +
      ((S.queries && S.queries.causes) || []).map((x) => chip('co-cause', x, c.cause === x, x)).join('') + '</div>' +
      '<label>What was approved<input id="coText" data-co="changeText" value="' + esc(c.changeText) + '" placeholder="Change colour to white"></label>' +
      '<div class="q-row2"><label>Area · pick or type<input data-co="area" list="coAreaList" value="' + esc(c.area) + '" placeholder="Cabin 3">' + areaListHtml('coAreaList', q.project) + '</label>' +
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
  api('changeOutcome', [c.qid, toChange ? { outcome: 'change', cause: c.cause, changeText: c.changeText, area: c.area, date: c.date, cost: c.cost } : { outcome: 'answered', answerTag: c.answerTag || '' }]).then((res) => {
    setQueries(res); S.co = null;
    const nq = res.queries.find((x) => x.id === c.qid);
    snack(toChange ? 'Now a change: ' + (nq && nq.changeNo) + ' in the change register.' : 'Now Answered. ' + (q.changeNo || 'Its number') + ' is voided.');
    redraw();
  }, (err) => { if (err.signin) { signedOut(err.message); return; } c.err = cleanErr(err.message); redraw(); });
}

// One query in a list (engineer's and owners'): the latest activity (highlighted until opened), its state, the
// question, area and work status, and the latest photo.
function queryCardHtml(q, act, on) {
  const ph = cardPhoto(q), fresh = isNewQ(q);
  const lead = [q.area, q.last && q.last.what !== 'asked' ? 'asked by ' + nameOfEmail(q.askedBy) : ''].filter(Boolean).join(' · ');
  const sub = [lead ? esc(LC.cap(lead)) : '', workHtml(q, !lead), waitRed(q)].filter(Boolean).join(' · ');
  return '<button type="button" class="q-card' + (on ? ' on' : '') + (fresh ? ' new' : '') + (ph ? ' has-ph' : '') + '" data-act="' + act + '" data-id="' + esc(q.id) + '">' +
    (ph ? '<span class="q-thumb">' + (S.thumbs[ph] ? '<img src="' + S.thumbs[ph] + '" alt="">' : '<span class="ph-wait"></span>') + '</span>' : '') +
    '<span class="q-card-main"><span class="q-card-top"><span class="q-last small">' + (fresh ? '<span class="new-dot" aria-label="New"></span>' : '') + esc(lastText(q)) + '</span>' +
    '<span class="pill pill-' + queryState(q).cls + '">' + esc(queryState(q).text) + '</span></span><b>' + esc(q.text) + '</b><span class="muted small">' + sub + '</span></span></button>';
}

// The question's first sentence, for a task made from it ("Sink" from "Sink: left or right of the window?").
function questionTitle(q) {
  const s = String(q.text || '').split(/[.!?\n]/)[0].split(':')[0].trim() || String(q.text || '').trim();
  return LC.cap(s.length > 60 ? s.slice(0, 58) + '…' : s);
}
// A task from a query: as typed; if the box was left as the question (or empty), "[question]: [reply] · [area]",
// e.g. "Sink: to the left · Pantry", not just "to the left".
// Change approved: the task starts from what was approved ("Paint the cabin wall white · Cabin 2"), never the question;
// typing in the task box makes it its own.
function queryTaskNote(q, c) {
  const typed = String(c.taskText || '').trim(), reply = String(c.text || '').trim();
  const area = String(c.area || q.area || '').trim();
  if (c.outcome === 'change') {
    if (c.taskEdited && typed) return typed;
    const base = String(c.changeText || '').trim();
    return base ? base + (area && base.toLowerCase().indexOf(area.toLowerCase()) < 0 ? ' · ' + area : '') : '';
  }
  if (typed && typed !== c.taskPrefill) return typed;
  return (c.taskPrefill || questionTitle(q)) + (reply ? ': ' + reply : '') + (area ? ' · ' + area : '');
}
// Owners: reply, ask for a clearer photo, close as Answered / Change approved, task + follow-up task.
// Associates: the same, except Change approved (owners only); instead they can suggest an answer for an owner to approve.
function ownerComposerHtml(q) {
  const assoc = isAssociate();
  if (!S.qc || S.qc.qid !== q.id) {
    const eng = defaultTaskFor(q.askedBy, q.project);
    S.qc = { qid: q.id, text: '', outcome: '', cause: '', cost: '', area: q.area || '', changeText: '', task: false, taskWho: eng, taskDue: addDays(todayIso(), 2), taskText: '',
      follow: false, followWho: eng, followText: '', answerTag: '', approves: '', err: '', sending: false };
  }
  const c = S.qc, causes = (S.queries && S.queries.causes) || [];
  const chip = (act, v, on, label) => '<button type="button" class="fchip' + (on ? ' on' : '') + '" data-act="' + act + '" data-v="' + esc(v) + '" aria-pressed="' + on + '">' + esc(label) + '</button>';
  const who = (field) => '<label class="q-for">Task for' + taskForSelect('data-qc="' + field + '"', q.project, q.askedBy, c[field]) + '</label>';
  // No preset: Send stays off until Reply only / Answered / Change approved is picked.
  const sendLabel = !c.outcome ? 'Pick how this closes' : c.outcome === 'keep' ? 'Send reply' : c.outcome === 'suggest' ? 'Send suggestion'
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
    '<textarea id="qcText" data-qc="text" rows="2">' + esc(c.text) + '</textarea>' + attachHtml('qc:' + q.id) +
    '<div class="muted small">How does this close?</div><div class="chip-group">' +
    chip('qc-outcome', 'keep', c.outcome === 'keep', 'Reply only, keep open') +
    (assoc ? chip('qc-outcome', 'suggest', c.outcome === 'suggest', 'Suggest an answer (Shruthi or Savan approve it)') : '') +
    chip('qc-outcome', 'answered', c.outcome === 'answered', 'Answered') +
    (assoc ? '' : chip('qc-outcome', 'change', c.outcome === 'change', 'Change approved')) + '</div>' +
    (c.outcome === 'answered' ? answerTagHtml('qc-tag', c.answerTag) : '') +
    (c.outcome === 'change' ? '<div class="q-change"><div class="muted small">Why did this change? (for the handover report)</div><div class="chip-group">' +
      causes.map((x) => chip('qc-cause', x, c.cause === x, x)).join('') + '</div>' +
      '<label>What was approved <span class="req">(needed: it goes in the change register and starts the task)</span><input id="qcChange" data-qc="changeText" value="' + esc(c.changeText) + '" placeholder="Paint the cabin wall white"></label>' +
      '<div class="q-row2"><label>Area · pick or type<input data-qc="area" list="qcAreaList" value="' + esc(c.area) + '" placeholder="Cabin 3" autocomplete="off">' + areaListHtml('qcAreaList', q.project) + '</label>' +
      '<label>Cost to us (optional)<input data-qc="cost" value="' + esc(c.cost) + '" inputmode="numeric" placeholder="₹3,000" autocomplete="off"></label></div>' +
      '<span class="muted small">If the client asked for it and will pay, it belongs in Extras instead (comes with Budget).</span></div>' : '') +
    (c.outcome === 'answered' || c.outcome === 'change' ? '<div class="q-taskbox' + (c.task ? ' on' : '') + '"><label class="pcheck"><input type="checkbox" data-qc-check="task"' + (c.task ? ' checked' : '') + '> <b>Make it a task</b>' +
      (c.outcome === 'change' ? ' <span class="muted small">(the finished-work photo is needed to tick it)</span>' : '') + '</label>' +
      (c.task ? '<div class="q-taskline">' + who('taskWho') + '<input type="date" data-qc="taskDue" value="' + esc(c.taskDue) + '">' +
        '<label class="q-tasktext">What to do<input id="qcTaskText" data-qc="taskText" value="' + esc(c.outcome === 'change' && !c.taskEdited ? c.changeText : c.taskText) + '" placeholder="' +
        esc(c.outcome === 'change' ? 'Starts from what was approved' : 'Get the electrician to raise the switch box by 6 in') + '" autocomplete="off"></label></div>' +
        '<div class="muted small">The task will read: “<span id="qcTaskPreview">' + esc(queryTaskNote(q, c)) + '</span>”</div>' +
        '<label class="pcheck"><input type="checkbox" data-qc-check="follow"' + (c.follow ? ' checked' : '') + '> Add a follow-up task after this one</label>' +
        '<span class="muted small">Only if another team has to come back. It shows on their list only after the first task is ticked.</span>' +
        (c.follow ? '<div class="q-taskline">' + who('followWho') + '<input data-qc="followText" value="' + esc(c.followText) + '" placeholder="Get Raju to patch and repaint around the box" autocomplete="off"></div>' : '') : '') +
      '</div>' : '') +
    (c.err ? '<p class="err" role="alert">' + esc(c.err) + '</p>' : '') +
    '<button type="button" class="btn-accent q-send' + (c.sending ? ' is-sending' : '') + '" data-act="qc-send" data-id="' + esc(q.id) + '"' + (c.outcome && !c.sending ? '' : ' disabled') + '>' +
    esc(c.sending ? 'Sending…' : sendLabel) + '</button></div>';
}
// "Task for": the project's site engineers (and whoever asked or took the photo), then Shruthi and Savan.
// Associates: the project's site engineers, and themselves. Owners also see the project's associates.
function taskForOptions(project, byEmail) {
  const users = activeUsers(teamUsers()).filter((u) => u.code);
  const onIt = (u) => (u.projects || []).indexOf(project) >= 0;
  const list = isAssociate()
    ? users.filter((u) => u.role === 'site_engineer' && onIt(u)).concat(users.filter((u) => S.me && u.email === S.me.email))
    : users.filter((u) => u.role === 'site_engineer' && (onIt(u) || u.email === byEmail))
      .concat(users.filter((u) => u.role === 'owner'), users.filter((u) => u.role === 'associate' && onIt(u)));
  return list.filter((u, i, a) => a.findIndex((x) => x.code === u.code) === i);
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
  if (!c || c.sending) return; // a second click while sending does nothing
  const text = String(c.text || '').trim();
  const purpose = 'qc:' + c.qid, hasAtt = !!(S.att[purpose] || []).length;
  const q0 = S.queries.queries.find((x) => x.id === c.qid) || {};
  // Attachments go first (photos shrunk, PDFs as they are), then the reply or the closing with their ids.
  const withAtt = (send) => uploadAttachments(purpose, q0.project, 'query:' + c.qid).then(send);
  let req;
  if (!photoAsk && !c.outcome) { c.err = 'Pick how this closes.'; redraw(); return; }
  if (photoAsk) req = api('replyQuery', [c.qid, photoAskText(c), 'photo_request', [], newId()]);
  else if (c.outcome === 'keep' || c.outcome === 'suggest') {
    if (!text && !hasAtt) { c.err = c.outcome === 'suggest' ? 'Type the answer you suggest.' : 'Type a reply.'; redraw(); return; }
    const msgId = newId();
    req = withAtt((ids) => api('replyQuery', [c.qid, text, c.outcome === 'suggest' ? 'suggest' : 'reply', ids, msgId, '']));
  } else {
    const q = S.queries.queries.find((x) => x.id === c.qid) || { text: '', area: '' };
    const taskNote = c.task ? queryTaskNote(q, c) : '';
    if (c.outcome === 'change' && !c.cause) { c.err = 'Pick why this changed.'; redraw(); return; }
    // The register's Change column: what was approved (needed for a change; Answered keeps the old fallback).
    const changeText = c.outcome === 'change' ? String(c.changeText || '').trim() : String(c.changeText || '').trim() || taskNote || text;
    if (c.outcome === 'change' && !changeText) { c.err = 'Type what was approved: it goes in the change register and starts the task.'; redraw(); return; }
    if (c.task && !taskNote.trim()) { c.err = 'Type what the task is.'; redraw(); return; }
    if (c.task && !c.taskWho) { c.err = 'Pick who the task is for.'; redraw(); return; }
    if (c.outcome === 'change' && !confirmNewAreas(q0.project, [c.area])) return;
    req = withAtt((ids) => api('closeQuery', [c.qid, {
      outcome: c.outcome, reply: text, cause: c.cause, cost: c.cost, area: c.area, changeText: changeText, answerTag: c.outcome === 'answered' ? c.answerTag || '' : '',
      photoIds: ids,
      task: c.task ? { assignee: c.taskWho, due: c.taskDue, note: taskNote } : null,
      followup: c.task && c.follow && String(c.followText || '').trim() ? { assignee: c.followWho, note: c.followText } : null
    }]));
  }
  c.sending = true; c.err = ''; redraw();
  req.then((res) => {
    setQueries(res); S.qc = null; delete S.att[purpose];
    snack(photoAsk ? 'Asked for a clearer photo.' : c.outcome === 'keep' ? 'Reply sent.' : c.outcome === 'suggest' ? 'Suggestion sent. Shruthi and Savan are asked to approve it.' : 'Reply sent and the query is closed.');
    if (c.task) refresh(true);
    redraw();
  }, (err) => { if (err.signin) { signedOut(err.message); return; } c.sending = false; c.err = cleanErr(err.message); redraw(); });
}
// Owners: "Approve ✓" on an associate's suggested answer: the query closes as Answered with his words, his message is
// marked "approved by …", and the engineer gets it as the answer.
function approveSuggestion(msgId) {
  const m = S.queries && S.queries.messages.find((x) => x.id === msgId);
  if (!m) return;
  api('closeQuery', [m.queryId, { outcome: 'answered', reply: '', approves: msgId }]).then((res) => {
    setQueries(res);
    if (S.qc && S.qc.qid === m.queryId) S.qc = null;
    snack('Approved. ' + firstName(m.by) + '’s answer closes the query.');
    redraw();
  }, (err) => { if (err.signin) { signedOut(err.message); return; } snack(cleanErr(err.message), { error: true }); });
}

// Engineers: reply in the thread, with photos if asked for one (goes through the phone's outbox).
function engComposerHtml(q) {
  const drafts = S.drafts.filter((d) => d.purpose === 'reply:' + q.id);
  const r = (S.engReply && S.engReply.qid === q.id) ? S.engReply : (S.engReply = { qid: q.id, text: '' });
  return '<div class="q-compose"><label for="erText">Your reply</label><textarea id="erText" data-er="text" rows="2">' + esc(r.text) + '</textarea>' +
    (drafts.length ? '<div class="q-photos">' + drafts.map((d) => '<span class="q-photo' + (d.kind === 'pdf' ? ' att-pdf' : '') + '">' +
      (d.kind === 'pdf' ? '<span class="att-name">📄 ' + esc(d.name) + '</span>' : '<img src="data:image/jpeg;base64,' + d.thumb + '" alt="">') +
      '<button type="button" class="q-x" data-act="draft-del" data-id="' + esc(d.id) + '" aria-label="Remove">×</button></span>').join('') + '</div>' : '') +
    photoPickHtml('reply:' + q.id, true) +
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
    chain = chain.then(() => (d.kind === 'pdf'
      ? outboxAdd('uploadFile', [{ id: d.id, project: q.project, name: d.name, data: d.data, linkedTo: 'query:' + qid }], 'File for a query')
      : outboxAdd('uploadPhoto', [{ id: d.id, project: q.project, batchId: qid, area: q.area || '', caption: '', linkedTo: 'query:' + qid, full: d.full, thumb: d.thumb }], 'Photo for a query')))
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
  const openQ = S.engQuery && S.queries && S.queries.queries.find((x) => x.id === S.engQuery);
  if (S.engQuery && S.queries && !openQ) S.engQuery = '';
  if (openQ) markSeenQ(openQ.id);
  if (openQ && S.engBack) {
    const q = openQ;
    const backTo = S.engBack ? (ENG_TABS.find((t) => t[0] === S.engBack) || [, 'Back'])[1] : 'All queries';
    return '<button type="button" class="link-btn" data-act="eq-back">← ' + esc(backTo) + '</button>' +
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
    '<div class="ph-pick" style="padding:0"><label class="btn-main ph-pick-btn">Take photo<input type="file" accept="image/*" capture="environment" data-q-pick="query" hidden></label>' +
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
    (list.length ? list.map((q) => queryCardHtml(q, 'eq-open', q === openQ) +
      (q === openQ ? '<div class="q-thread q-inline eng-pad">' + queryThreadHtml(q, false) + '</div>' : '')).join('') : (waiting('askQuery').some((w) => w.args[0].project === proj) ? '' : '<p class="empty eng-pad">No queries on this project yet.</p>')) +
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
  if (!confirmOtherProject(proj) || !confirmNewAreas(proj, [area])) return;
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
    // A PDF (a reply's drawing or spec) waits on the phone as it is; photos are shrunk first.
    chain = chain.then(() => (isPdfFile(f)
      ? (f.size > MAX_PDF_BYTES ? Promise.reject(new Error((f.name || 'That file') + ' is over 10 MB.'))
        : readBase64(f).then((data) => idbPut('drafts', { id: newId(), project: project, purpose: purpose, kind: 'pdf', name: f.name || 'file.pdf', data: data, createdAt: Date.now() })))
      : shrinkPhoto(f).then((p) => idbPut('drafts', { id: newId(), project: project, purpose: purpose, area: '', full: p.full, thumb: p.thumb, bytes: p.bytes, createdAt: Date.now() }))))
      .catch((err) => engSnack(cleanErr(err.message), true));
  });
  chain.then(loadDrafts).then(renderEng);
}

/* ---------- change register ---------- */
// Voided numbers (a change later made Answered) are left out, with a note so the gap in the numbers is explained.
// editable (owners on screen): each line has Edit (what was approved, area, why, cost), logged in Changes.
// screen ('owner' / 'eng'): newest first, and a line opens its query (photos and thread); Edit stays its own button.
// Printed: oldest first, like a logbook.
function registerRowsHtml(all, showCost, editable, screen) {
  const num = (r) => Number(String(r.no).replace(/\D/g, '')) || 0;
  const rows = all.filter((r) => !r.voided).sort((a, b) => (screen ? num(b) - num(a) : num(a) - num(b))), voided = all.filter((r) => r.voided);
  const note = voided.length ? '<p class="muted small reg-void">Numbers not used: ' + esc(voided.map((r) => r.no).join(', ')) + ' (changed to Answered).</p>' : '';
  if (!rows.length) return '<p class="empty">No changes approved yet.</p>' + note;
  const cols = 7 + (editable ? 1 : 0);
  return '<div class="table-box"><table class="ptable reg"><thead><tr><th>No.</th><th>Date</th><th>Area</th><th>Change</th><th>Approved by</th><th>Raised from</th><th>Why' + (showCost ? ' · cost to us' : '') + '</th>' +
    (editable ? '<th><span class="sr-only">Edit</span></th>' : '') + '</tr></thead><tbody>' +
    rows.map((r) => {
      const ed = editable && S.regEdit && S.regEdit.project === r.project && S.regEdit.no === r.no;
      const open = screen && r.queryId && !ed ? ' data-act="' + (screen === 'eng' ? 'eq-open' : 'reg-open') + '" data-id="' + esc(r.queryId) + '" data-code="' + esc(r.project) + '" title="Open the query"' : '';
      return '<tr class="' + (ed ? 'on' : '') + (open ? ' reg-line' : '') + '"' + open + '><td class="mono">' + esc(r.no) + '</td><td>' + esc(niceDay(r.date)) + '</td><td>' + esc(r.area || '—') + '</td><td>' + esc(r.text) + '</td><td>' + esc(nameOfEmail(r.approvedBy)) +
        '</td><td>' + esc(r.raisedFrom) + '</td><td>' + esc(r.cause) + (showCost ? ' · ' + (r.cost ? LC.inr(r.cost) : 'nil') : '') + '</td>' +
        (editable ? '<td><button type="button" class="btn-sm" data-act="reg-edit" data-code="' + esc(r.project) + '" data-id="' + esc(r.no) + '">Edit</button></td>' : '') + '</tr>' +
        (ed ? '<tr class="reg-form"><td colspan="' + cols + '">' + registerFormHtml(S.regEdit) + '</td></tr>' : '');
    }).join('') + '</tbody></table></div>' + note;
}
// Every Area box picks from the project's areas (the ones on its photos and questions) or takes a new one; the server
// saves any capitals as the project's own spelling ("reception" → "Reception").
function areaOptions(project) { return (((S.data && S.data.areas) || (S.site && S.site.areas) || {})[project]) || []; }
function areaListHtml(id, project) { return '<datalist id="' + id + '">' + areaOptions(project).map((a) => '<option value="' + esc(a) + '">').join('') + '</datalist>'; }
// Engineers: a question or photos on a project he isn't on (Venky's question landed on House Brindhavan) asks first.
function confirmOtherProject(project) {
  if (!S.engineer || (engMe().projects || []).indexOf(project) >= 0) return true;
  return window.confirm('You’re not on ' + engProjName(project) + '. Send here anyway?\n\nOK sends it to ' + engProjName(project) + '. Cancel lets you pick your project at the top.');
}
// A typed area the project doesn't have yet is asked about before it's saved ("Cabin 20" when "Cabin 2" was meant).
// OK: it is added; Cancel: nothing is sent, to change it. Returns true to go on.
function confirmNewAreas(project, typed) {
  const known = areaOptions(project).map((a) => String(a).toLowerCase());
  const fresh = Array.from(new Set((typed || []).map((a) => String(a || '').trim()).filter((a) => a && known.indexOf(a.toLowerCase()) < 0)));
  if (!fresh.length) return true;
  const near = fresh.map((a) => areaOptions(project).find((k) => { const x = k.toLowerCase(), y = a.toLowerCase(); return y.indexOf(x) === 0 || x.indexOf(y) === 0 || editDistance(x, y) <= 2; })).filter(Boolean);
  const name = S.engineer ? engProjName(project) : projName(project);
  return window.confirm((fresh.length === 1 ? 'Add new area “' + fresh[0] + '” to ' + name + '?' : 'Add new areas ' + fresh.map((a) => '“' + a + '”').join(', ') + ' to ' + name + '?') +
    (near.length ? '\n\nThere is already ' + Array.from(new Set(near)).map((a) => '“' + a + '”').join(', ') + '.' : '') + '\n\nOK adds it. Cancel lets you change it.');
}
function registerFormHtml(f) {
  const causes = (S.queries && S.queries.causes) || [];
  return '<div class="dform"><div class="fld" style="flex:2 1 260px"><label for="regText">What was approved</label><input id="regText" data-reg="text" value="' + esc(f.text) + '"></div>' +
    '<div class="fld"><label for="regArea">Area · pick or type</label><input id="regArea" data-reg="area" list="regAreaList" value="' + esc(f.area) + '" placeholder="Cabin 3">' + areaListHtml('regAreaList', f.project) + '</div>' +
    '<div class="fld"><label for="regCause">Why</label><select id="regCause" data-reg="cause">' + causes.map((c) => '<option' + (c === f.cause ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></div>' +
    '<div class="fld"><label for="regCost">Cost to us (optional)</label><input id="regCost" data-reg="cost" value="' + esc(f.cost) + '" inputmode="numeric" placeholder="₹3,000"></div>' +
    '<button type="button" class="btn-accent" data-act="reg-save">Save</button><button type="button" class="btn-outline" data-act="reg-cancel">Cancel</button>' +
    (f.err ? '<p class="err" role="alert" style="flex:1 1 100%">' + esc(f.err) + '</p>' : '') +
    '<span class="muted small" style="flex:1 1 100%">The change is logged (before and after) in the Changes tab.</span></div>';
}
function saveRegisterEdit() {
  const f = S.regEdit;
  if (!f) return;
  if (!String(f.text || '').trim()) { f.err = 'Type what was approved.'; redraw(); return; }
  api('editRegister', [f.project, f.no, { text: f.text, area: f.area, cause: f.cause, cost: f.cost }, f.base]).then((res) => {
    setQueries(res); S.regEdit = null;
    snack(f.no + ' saved. The change is logged.');
    redraw();
  }, (err) => { if (err.signin) { signedOut(err.message); return; } if (changedSnack(err.message)) return; f.err = cleanErr(err.message); redraw(); });
}
// "Change C-02 too" after editing the task that came from it: the register line takes the task's new text.
function syncRegister(o) {
  const go = () => {
    const r = ((S.queries && S.queries.register) || []).find((x) => x.project === o.project && x.no === o.no && !x.voided);
    if (!r) { snack('Couldn’t find ' + o.no + '. Change it in the change register.', { error: true }); return; }
    api('editRegister', [o.project, o.no, { text: o.text, area: r.area, cause: r.cause, cost: r.cost == null ? '' : r.cost }, { text: r.text, area: r.area || '', cause: r.cause, cost: r.cost == null ? '' : String(r.cost) }]).then((res) => {
      setQueries(res); S.regOffer = null;
      snack(o.no + ' now says “' + o.text + '”.');
      redraw();
    }, (err) => { if (err.signin) { signedOut(err.message); return; } if (changedSnack(err.message)) return; snack(cleanErr(err.message), { error: true }); });
  };
  if (S.queries) go(); else loadQueries(go);
}
// Query outcomes per engineer, for the handover report: how many asked, answered (and where the answer came from),
// changes (and why).
function querySummaryHtml(code) {
  const qs = ((S.queries && S.queries.queries) || []).filter((q) => q.project === code);
  if (!qs.length) return '';
  const tags = (S.queries && S.queries.answerTags) || [];
  const by = {};
  qs.forEach((q) => {
    const r = by[q.askedBy] || (by[q.askedBy] = { asked: 0, open: 0, answered: 0, change: 0, tags: {} });
    r.asked++;
    if (q.status !== 'closed') r.open++;
    else if (q.outcome === 'change') r.change++;
    else { r.answered++; const t = q.answerTag || 'Not tagged'; r.tags[t] = (r.tags[t] || 0) + 1; }
  });
  const cell = (r) => '<td class="num">' + r.asked + '</td><td class="num">' + r.open + '</td><td class="num">' + r.answered + '</td>' +
    tags.concat(['Not tagged']).map((t) => '<td class="num">' + (r.tags[t] || 0) + '</td>').join('') + '<td class="num">' + r.change + '</td>';
  const tot = { asked: 0, open: 0, answered: 0, change: 0, tags: {} };
  Object.keys(by).forEach((k) => { const r = by[k]; ['asked', 'open', 'answered', 'change'].forEach((f) => { tot[f] += r[f]; }); Object.keys(r.tags).forEach((t) => { tot.tags[t] = (tot.tags[t] || 0) + r.tags[t]; }); });
  return '<section class="card"><div class="label-caps">Query outcomes · for the handover report</div><div class="table-box"><table class="ptable qsum"><thead><tr><th>Asked by</th><th class="num">Asked</th><th class="num">Open</th><th class="num">Answered</th>' +
    tags.concat(['Not tagged']).map((t) => '<th class="num">' + esc(t) + '</th>').join('') + '<th class="num">Changes</th></tr></thead><tbody>' +
    Object.keys(by).sort().map((k) => '<tr><td>' + esc(nameOfEmail(k)) + '</td>' + cell(by[k]) + '</tr>').join('') +
    '<tr class="total"><td>All</td>' + cell(tot) + '</tr></tbody></table></div></section>';
}
function engRegisterHtml(proj) {
  const rows = ((S.queries && S.queries.register) || []).filter((r) => r.project === proj);
  return '<button type="button" class="link-btn" data-act="eq-back">← All queries</button><section class="card eng-card eng-pad"><h2 class="eng-h2" style="padding-left:0">Change register · ' + esc(proj) + '</h2>' + registerRowsHtml(rows, false, false, 'eng') + '</section>';
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
  const toggle = '<p class="muted small q-explain">Questions from site, answered in one place. Approved changes are logged for the record.</p>' +
    '<div class="q-toolbar"><div class="seg" role="group" aria-label="View"><button type="button" class="seg-b' + (view === 'list' ? ' on' : '') + '" data-act="q-view" data-v="list">Queries</button>' +
    '<button type="button" class="seg-b' + (view === 'register' ? ' on' : '') + '" data-act="q-view" data-v="register">Change register</button></div>' +
    (view === 'register' && isOwner() ? '<button type="button" class="btn-outline" data-act="q-print" data-code="' + esc(p.code) + '">Print change register</button>' : '') + '</div>';
  if (view === 'register') return toggle + '<section class="card">' + registerRowsHtml(S.queries.register.filter((r) => r.project === p.code), isOwner(), isOwner(), 'owner') + '</section>' +
    (isOwner() ? querySummaryHtml(p.code) : '');
  // Too narrow for the list and the opened query side by side (a phone, a narrow laptop window): the opened query
  // opens right under its own card (one at a time; tap the card again to close it). Wide: side by side.
  const narrow = narrowQ.matches;
  if (!S.qSel || !list.some((q) => q.id === S.qSel)) S.qSel = list.length && !narrow ? list[0].id : '';
  const sel = list.find((q) => q.id === S.qSel);
  if (narrow) {
    const open = sel && S.qOpen ? sel : null;
    if (open) markSeenQ(open.id);
    return toggle + '<nav class="q-list" aria-label="Query list">' + (list.map((q) => queryCardHtml(q, 'q-open', q === open) +
      (q === open ? '<article class="card q-thread q-inline" id="qThread">' + queryThreadHtml(q, isOwner() || isAssociate()) + '</article>' : '')).join('') ||
      '<p class="empty">No queries on this project yet.</p>') + '</nav>';
  }
  if (sel) markSeenQ(sel.id); // on screen = opened (before its card is drawn, so it isn't shown as new)
  const cards = list.map((q) => queryCardHtml(q, 'q-open', q.id === S.qSel)).join('') || '<p class="empty">No queries on this project yet.</p>';
  return toggle + '<div class="pgrid"><nav class="pside q-list" aria-label="Query list">' + cards + '</nav>' +
    '<article class="pmain card q-thread" id="qThread">' + (sel ? queryThreadHtml(sel, isOwner() || isAssociate()) : '<p class="empty">Pick a query.</p>') + '</article></div>';
}
const narrowQ = window.matchMedia('(max-width: 899px)');
if (narrowQ.addEventListener) narrowQ.addEventListener('change', () => { if (S.started) renderAll(); });
// A query opened under its own card: that card moves to the top of the screen, the conversation under it.
function scrollCardTop(id) {
  const go = () => { const c = document.querySelector('.q-card.on[data-id="' + String(id).replace(/["\\]/g, '') + '"]'); if (c) c.scrollIntoView({ block: 'start' }); };
  go(); setTimeout(go, 150);
}
// "Needs you" on a project's overview: open queries (work on hold first), tasks overdue or due today, new photos.
function byLastActivity(a, b) {
  const x = (a.last && a.last.at) || a.askedAt, y = (b.last && b.last.at) || b.askedAt;
  return x < y ? 1 : x > y ? -1 : 0;
}
// An associate's suggested answer still waiting for an owner's OK (the newest one on the query), or null.
function pendingSuggestion(q) {
  if (!S.queries || q.status === 'closed') return null;
  return S.queries.messages.filter((m) => m.queryId === q.id && m.kind === 'suggest' && !m.approvedBy).pop() || null;
}
// The associate's own suggestions waiting for Shruthi or Savan: not in his Needs you, but under "Waiting for an answer".
function myWaitingSuggestion(q) { const s = pendingSuggestion(q); return isAssociate() && !!s && s.by === S.me.email && q.last && q.last.by === S.me.email; }
function firstName(email) { return String(nameOfEmail(email) || '').split(/\s+/)[0]; }
function needsFor(code) {
  const out = [], t = todayIso(), me = S.me && S.me.email;
  // Open queries: work on hold first, with a red "On hold" tag and red "work on hold" until closed (opened or not);
  // then the rest, latest activity first ("New photo from Venky · 2 min ago"), highlighted until opened. Unanswered
  // for over a day: "waiting 2 days" in red.
  // Only queries where it's our move: not when an owner or associate moved last (the engineer's move next; it shows in
  // the Queries list), nor while waiting for a clearer photo.
  const qs = ((S.queries && S.queries.queries) || []).filter((q) => q.project === code);
  const ourMove = (q) => { const r = roleOfEmail(lastMover(q)); return r !== 'owner' && r !== 'associate'; };
  const open = qs.filter((q) => q.status === 'open' && ourMove(q) && !myWaitingSuggestion(q)).sort(byLastActivity);
  open.filter((q) => q.workOnHold).concat(open.filter((q) => !q.workOnHold)).forEach((q) => {
    const sug = isOwner() ? pendingSuggestion(q) : null;
    out.push({
      // Box: on hold (red, with a blue dot while new) · new and unseen · waiting.
      box: q.workOnHold ? 'hold' : isNewQ(q) ? 'new' : 'late',
      kind: q.workOnHold ? 'On hold' : 'Query', cls: q.workOnHold ? 'bad' : 'wait', red: q.workOnHold || !!waitDays(q), title: q.text, fresh: isNewQ(q), photo: q.lastPhotoId, who: firstName(q.askedBy),
      subHtml: esc([lastText(q), q.area].filter(Boolean).join(' · ')) + ' · ' + workHtml(q) + (waitDays(q) ? ' · ' + waitRed(q) : '') +
        (q.status === 'waiting_photo' ? ' · waiting for a new photo' : ''),
      short: [q.workOnHold ? 'work on hold' : '', waitDays(q) ? 'waiting ' + plural(waitDays(q), 'day', 'days') : ''].filter(Boolean).join(' · '),
      buttonsHtml: sug ? '<div class="review"><span class="small">' + esc(firstName(sug.by)) + ' suggests: “' + esc(sug.text.slice(0, 140)) + '”</span>' +
        '<button type="button" class="btn-accent" data-act="qc-approve" data-id="' + esc(sug.id) + '">Approve ✓</button></div>' : '',
      act: 'needs-query', id: q.id, label: 'Reply', canAct: canWrite() || isAssociate()
    });
  });
  // An associate's "Answered": owners check it, until one of them opens it.
  if (isOwner()) qs.filter((q) => q.status === 'closed' && q.outcome === 'answered' && isNewQ(q) && roleOfEmail(q.closedBy) === 'associate').forEach((q) => {
    const m = S.queries.messages.filter((x) => x.queryId === q.id && x.by === q.closedBy && x.text).pop();
    out.push({ box: 'new', kind: 'Check', cls: 'blue', title: q.text, fresh: true, who: firstName(q.closedBy), short: 'answered by ' + firstName(q.closedBy),
      subHtml: esc('Answered by ' + nameOfEmail(q.closedBy) + (m ? ': ' + m.text.slice(0, 140) : '')), act: 'needs-query', id: q.id, label: 'Open', canAct: true });
  });
  // Work done with a photo, waiting for an owner's "Looks good" or "Redo".
  if (isOwner()) live().filter((e) => e.project === code && needsReview(e)).forEach((e) => {
    const ph = String(e.done_photo || '').split(',').filter(Boolean)[0];
    out.push({ box: 'new', kind: 'Check', cls: 'blue', title: LC.taskTitle(S.dir, e), src: e.source, photo: ph, id: e.id, who: e.assignee ? LC.teamName(S.dir, e.assignee).split(/\s+/)[0] : '',
      short: e.review === 'redo' ? 'redone' : 'done, with photo', fresh: true,
      subHtml: esc((e.review === 'redo' ? 'Redone' : 'Done, with photo') + doneByText(e)) + doneNoteHtml(e), buttonsHtml: reviewHtml(e) });
  });
  // New site photos from others since this person last opened the project's Site photos (clears per person).
  const np = newPhotosOf(code);
  if (np) out.push({ box: 'new', kind: 'Photos', cls: 'blue', title: plural(np.n, 'new site photo', 'new site photos'), photo: np.lastId, who: (np.by[0] || '').split(/\s+/)[0], fresh: true,
    // "from Venky 2, Engineer Test 2": who sent how many, so the number adds up.
    subHtml: esc(['from ' + np.by.map((b) => b + (np.byN && np.by.length > 1 ? ' ' + np.byN[b] : '')).join(', '), np.areas.join(', '), ageText(np.last) + ' ago'].filter(Boolean).join(' · ')),
    short: np.areas.slice(0, 3).join(', '), act: 'np-open', id: code, label: 'Open', canAct: true });
  // No site photos for 3 days (the 7:00 alert's rule: a started site in execution with a site engineer).
  const p = projInfo(code), last = S.data && S.data.lastPhotoAt && S.data.lastPhotoAt[code];
  if (p && p.stage === 'execution' && (p.day1 || (p.plannedStart && p.plannedStart <= t)) && engineersOf(code).length &&
      (!last || Math.round((LC.fromIso(t) - LC.fromIso(last.slice(0, 10))) / 86400000) >= 3)) {
    out.push({ box: 'late', kind: 'Photos', cls: 'wait', title: last ? 'No site photos from ' + (p.name || code) + ' for ' + plural(Math.round((LC.fromIso(t) - LC.fromIso(last.slice(0, 10))) / 86400000), 'day', 'days') : 'No site photos from ' + (p.name || code) + ' yet',
      subHtml: esc(last ? 'Last photos ' + niceDay(last.slice(0, 10)) : 'Ask the site engineer for photos'), short: '', who: '' });
  }
  // Tasks late or due today: most overdue first.
  live().filter((e) => isTask(e) && !e.done && e.project === code && e.due <= t).sort(byDue).forEach((e) => out.push({
    box: e.due < t ? 'late' : 'today',
    kind: e.due < t ? 'Late' : 'Today', cls: e.due < t ? 'bad' : 'wait', title: LC.taskTitle(S.dir, e), src: e.source, fresh: isNewTask(e, myCode()),
    who: isMine(e) ? 'You' : (e.assignee ? LC.teamName(S.dir, e.assignee) : userName(e.added_by)).split(/\s+/)[0], short: LC.dueText(e.due, t).text,
    subHtml: (taskWho(e) || 'Yours') + redoLine(e), dueHtml: dueChip(e), act: 'done', id: e.id, label: 'Done', canAct: canTick(e)
  }));
  return out;
}
function roleOfEmail(email) { const u = teamUsers().find((x) => x.email === email); return u ? u.role : ''; }
// Who moved last on a query (a suggestion still waiting for an owner's OK is not a move yet).
function lastMover(q) {
  let by = q.askedBy, at = q.askedAt;
  ((S.queries && S.queries.messages) || []).forEach((m) => {
    if (m.queryId !== q.id || (m.kind === 'suggest' && !m.approvedBy) || m.at < at) return;
    by = m.by; at = m.at;
  });
  return by;
}
// One Needs you line (project overview and Today): tag, what, latest activity or whose task, where it came from.
function needLineHtml(n, btnAct, code, all) {
  if (n.photo) wantThumb(n.photo);
  return '<div class="need' + (n.fresh ? ' new' : '') + (n.buttonsHtml ? ' need-check' : '') + '"><span class="need-tag tag-' + n.cls + '">' + esc(n.kind) + '</span>' +
    (n.photo ? '<button type="button" class="need-thumb" data-act="lightbox" data-id="' + esc(n.photo) + '">' + (S.thumbs[n.photo] ? '<img src="' + S.thumbs[n.photo] + '" alt="">' : '<span class="ph-wait"></span>') + '</button>' : '') +
    '<span class="need-text"><b>' + (n.fresh ? '<span class="new-dot" aria-label="New"></span>' : '') + esc(n.title) + '</b><span class="muted small">' + (all && n.code ? '<b class="need-proj">' + esc(projName(n.code)) + '</b> · ' : '') +
    n.subHtml + (n.dueHtml ? ' · ' + n.dueHtml : '') + '</span>' +
    (n.src ? taskSourceHtml(n.src, n.id) : '') + (n.buttonsHtml || '') + '</span>' +
    (n.canAct ? '<button type="button" class="btn-outline" data-act="' + btnAct + '" data-id="' + esc(n.id) + '"' + (code ? ' data-code="' + esc(code) + '"' : '') + '>' + esc(n.label) + '</button>' : '') + '</div>';
}
// Phone Today: one compact row per item (tag, short text, who on the right; red stays red), the whole row opens it.
function needRowHtml(n, code, all) {
  const act = n.act === 'needs-query' ? 'today-query' : n.act === 'np-open' ? 'np-open' : 'proj-tab';
  const id = n.act === 'needs-query' ? n.id : code;
  const short = [all ? projName(code) : '', n.short].filter(Boolean).join(' · ');
  return '<button type="button" class="need-row' + (n.fresh ? ' new' : '') + '" data-act="' + act + '" data-id="' + esc(id) + '" data-code="' + esc(code) + '">' +
    '<span class="need-tag tag-' + n.cls + '">' + esc(n.kind) + '</span><span class="nr-text"><b>' + (n.fresh ? '<span class="new-dot" aria-label="New"></span>' : '') + esc(n.title) + '</b>' +
    (short ? '<span class="small' + (n.cls === 'bad' || n.red ? ' hold-txt' : ' muted') + '">' + esc(short) + '</span>' : '') + '</span><span class="nr-who">' + esc(n.who || '') + '</span></button>';
}
// Needs you (a project) and Today (all projects): five boxes, in this order, each item in one box only. Empty boxes are
// one line; Done recently stays closed ("Done recently · 4") until opened.
const NEED_BOXES = [['hold', 'On hold', 'bad'], ['new', 'New and unseen', 'blue'], ['late', 'Waiting and late', 'wait'], ['today', 'Today', 'today']];
function needsHtml(code) {
  return boxesHtml(needsFor(code).map((n) => Object.assign(n, { code: code })), doneRecent(code), { key: code }) + waitingMineHtml(code);
}
// opts.all: items from every project (each says which); opts.compact: phone rows.
function boxesHtml(items, done, opts) {
  const line = (n) => {
    if (opts.compact) return needRowHtml(n, n.code, opts.all);
    const btn = opts.all ? (n.act === 'needs-query' ? 'today-query' : n.act === 'np-open' ? 'np-open' : 'done') : n.act;
    return needLineHtml(n, btn, opts.all ? n.code : '', opts.all);
  };
  const boxes = NEED_BOXES.map((b) => {
    const list = items.filter((n) => n.box === b[0]);
    if (!list.length) return '<section class="card nbox nbox-' + b[0] + ' empty"><div class="nbox-h"><b>' + esc(b[1]) + '</b><span class="muted small">· none</span></div></section>';
    return '<section class="card nbox nbox-' + b[0] + '"><div class="nbox-h"><b>' + esc(b[1]) + '</b><span class="nbox-n">' + list.length + '</span></div>' + list.map(line).join('') + '</section>';
  }).join('');
  const key = opts.key || '_all', open = !!S.doneOpen[key];
  const doneBox = '<section class="card nbox nbox-done' + (done.length ? '' : ' empty') + '">' +
    (done.length ? '<button type="button" class="nbox-h nbox-toggle" data-act="done-toggle" data-code="' + esc(key) + '" aria-expanded="' + open + '"><b>Done recently</b><span class="nbox-n">' + done.length + '</span>' +
      '<span class="muted small">last 24 hours · ' + (open ? 'hide' : 'show') + '</span></button>' + (open ? done.map((e) => doneLineHtml(e, opts.all)).join('') : '')
      : '<div class="nbox-h"><b>Done recently</b><span class="muted small">· nothing in the last 24 hours</span></div>') + '</section>';
  return '<div class="nboxes needs' + (opts.all ? ' tday-boxes' : '') + (opts.compact ? ' compact' : '') + '">' + boxes + doneBox + '</div>';
}
S.doneOpen = {};
// When a task was ticked: its done_at (since 27 Oct), else when it last changed.
function doneAt(e) { return e.done_at || e.updated_at || ''; }
function stampMs(st) { const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(st || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : 0; }
function whenText(st) { const day = String(st).slice(0, 10); return (day === todayIso() ? 'today' : niceDay(day)) + ' ' + String(st).slice(11, 16); }
// " · Venky · today 17:45"
function doneByText(e) {
  const who = e.done_by ? userName(e.done_by) : e.assignee ? LC.teamName(S.dir, e.assignee) : userName(e.added_by);
  return ' · ' + who + (doneAt(e) ? ' · ' + whenText(doneAt(e)) : '');
}
function doneNoteHtml(e) { return e.done_note ? '<span class="done-note">Note: ' + esc(e.done_note) + '</span>' : ''; }
// Every task ticked in the last 24 hours (newest first), except those already waiting for a Check in New and unseen.
function doneRecent(code) {
  const now = Date.now();
  return live().filter((e) => e.type === 'MT' && e.done && (!code || e.project === code) && !needsReview(e) && now - stampMs(doneAt(e)) < 86400000)
    .sort((a, b) => (doneAt(a) < doneAt(b) ? 1 : -1));
}
function doneLineHtml(e, all) {
  const ph = String(e.done_photo || '').split(',').filter(Boolean)[0];
  if (ph) wantThumb(ph);
  return '<div class="need need-done"><span class="need-tag tag-ok">Done</span>' +
    (ph ? '<button type="button" class="need-thumb" data-act="lightbox" data-id="' + esc(ph) + '">' + (S.thumbs[ph] ? '<img src="' + S.thumbs[ph] + '" alt="">' : '<span class="ph-wait"></span>') + '</button>' : '') +
    '<span class="need-text"><b>' + esc(LC.taskTitle(S.dir, e)) + '</b><span class="muted small">' + (all ? esc(projName(e.project)) + ' · ' : '') +
    esc((e.done_photo ? 'Done, with photo' : 'Done, no photo') + doneByText(e)) + '</span>' + doneNoteHtml(e) +
    taskSourceHtml(e.source, e.id) + reviewHtml(e, true) + '</span></div>';
}
// Associates: their suggested answers still waiting for Shruthi or Savan.
function waitingMineHtml(code) {
  if (!isAssociate()) return '';
  const list = ((S.queries && S.queries.queries) || []).filter((q) => (!code || q.project === code) && myWaitingSuggestion(q));
  if (!list.length) return '';
  return '<section class="card needs"><div class="sec-head"><h3>Waiting for an answer <span class="muted">· ' + list.length + '</span></h3>' +
    '<span class="sec-note">Your suggested answers, waiting for Shruthi or Savan</span></div>' +
    list.map((q) => '<div class="need"><span class="need-tag tag-wait">Suggested</span><span class="need-text"><b>' + esc(q.text) + '</b><span class="muted small">' +
      esc([q.area, 'waiting ' + ageText(q.last.at)].filter(Boolean).join(' · ')) + '</span></span>' +
      '<button type="button" class="btn-outline" data-act="today-query" data-id="' + esc(q.id) + '" data-code="' + esc(q.project) + '">Open</button></div>').join('') + '</section>';
}
function hasNeeds(code) { return needsFor(code).length > 0; }
// The red dot on a project's tab: only for work on hold and overdue (red means urgent).
function hasUrgent(code) { return needsFor(code).some((n) => n.cls === 'bad'); }

/* ---------- layout & render ---------- */
const phone = window.matchMedia('(max-width: 699px)');
function placeCodebar() {
  const bar = $('codebar');
  bar.hidden = !canWrite() || S.tab === 'projects'; // viewers have nothing to type; projects have their own screens
  $('viewOnly').hidden = canWrite() || isAssociate();
  const want = phone.matches && S.tab === 'ledger' ? $('codebarPhoneSlot') : $('codebarHome');
  if (bar.parentNode !== want) want.appendChild(bar);
}

function renderAll() {
  const a = document.activeElement, id = a && a.id;
  let s0 = null, s1 = null;
  try { if (id && typeof a.selectionStart === 'number') { s0 = a.selectionStart; s1 = a.selectionEnd; } } catch (_) { /* not a text field */ }
  const chartAt = schedScrollBefore();
  renderShell();
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
  schedScrollAfter(chartAt);
  placeCodebar();
  decorateBusy();
  doJump();
  if (id) {
    const el = $(id);
    if (el && document.activeElement !== el) {
      el.focus({ preventScroll: true });
      try { if (s0 !== null) el.setSelectionRange(s0, s1); } catch (_) { /* ignore */ }
    }
  }
}

/* ---------- Schedule (release 2) ----------
 * Whole project: every planner row as a bar (sections fold), the actual bar from the weekly log, today's line. Owners
 * import the planner Excel here: it is read on this laptop (SheetJS, loaded only then) and shown with day numbers and
 * real dates side by side before anything replaces the draft. Engineers log last week's % per activity on Mondays
 * (Today), through the outbox; owners can log or correct any week. The rules themselves are in LedgerCore (core.js). */
const XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
S.schedFold = {}; S.schedSel = {}; S.imp = null; S.logs = {}; S.ownerLog = null; S.schedConfirm = '';
function schedAll() { return (S.engineer ? S.site && S.site.schedule : S.data && S.data.schedule) || {}; }
function schedProj(code) { return S.engineer ? ((S.site && S.site.projects) || []).find((p) => p.code === code) || null : projInfo(code); }
function schedDate(p, n) { return LC.planDate(day1Of(p), n, !!p.sundayOff); }
function schedDayOf(p, iso) { return LC.planDay(day1Of(p), iso, !!p.sundayOff); }
// The plan and its progress, with logs still sending from this phone shown as if saved.
function schedOf(code) {
  const sc = schedAll()[code] || { acts: [], progress: [], lastImport: null };
  const mine = waiting('logProgress').filter((w) => w.args[0] === code);
  if (!mine.length) return sc;
  let progress = sc.progress.slice();
  mine.forEach((w) => (w.args[2] || []).forEach((e) => {
    progress = progress.filter((g) => !(g.activity === e.a && g.week === w.args[1]));
    progress.push({ id: 'w' + w.id, activity: e.a, week: w.args[1], pct: e.pct, reason: e.reason || '', by: S.me.email, at: stampNow(), pending: true });
  }));
  return Object.assign({}, sc, { progress: progress });
}
function schedBaseNow(code) { const sc = schedAll()[code] || { acts: [] }, li = sc.lastImport; return LC.schedBase(sc.acts, li ? li.id + (li.undone ? 'u' : '') : ''); }
// A TEAM cell from the planner: a Directory labour or vendor code, a Team code (SN, SK, VNK: work we do ourselves),
// CL for the client, or one of those names typed out. Returns the name, or null when it is none of these.
function teamOf(t) {
  const c = String(t || '').trim(), up = c.toUpperCase(), low = c.toLowerCase();
  if (!c) return null;
  if (up === LC.CLIENT) return 'Client';
  const people = ((S.engineer ? S.site && S.site.people : S.data && S.data.people) || []).filter((x) => x.kind !== 'client');
  const users = teamUsers().filter((u) => u.code);
  const hit = people.find((x) => x.code === up) || users.find((u) => String(u.code).toUpperCase() === up) ||
    people.find((x) => String(x.name).trim().toLowerCase() === low) || users.find((u) => String(u.name).trim().toLowerCase() === low);
  return hit ? hit.name : null;
}
// As shown: the name, else exactly what was typed.
function teamText(t) { return teamOf(t) || String(t || '').trim(); }
function dayRange(p, s, e) {
  const d1 = day1Of(p);
  return 'Day ' + s + (e !== s ? '–' + e : '') + (d1 ? ' · ' + niceDay(schedDate(p, s)) + (e !== s ? ' to ' + niceDay(schedDate(p, e)) : '') : '') + ' · ' + plural(e - s + 1, 'day', 'days');
}
// "Week 1 · Sat 31 Oct to Sun 8 Nov" (short: "Wk 1 · 31 Oct–8 Nov").
function weekLabel(p, monday, short) {
  const d1 = day1Of(p), sp = LC.weekSpan(d1, monday), n = LC.weekNo(d1, monday);
  return short ? 'Wk ' + n + ' · ' + LC.nice(sp.from) + '–' + LC.nice(sp.to) : 'Week ' + n + ' · ' + niceDay(sp.from) + ' to ' + niceDay(sp.to);
}
// Weeks that have ended, oldest first (each can be logged from the Monday after).
function endedWeeks(p) {
  const d1 = day1Of(p), out = [];
  if (!d1) return out;
  const last = addDays(LC.weekMonday(todayIso()), -7);
  for (let m = LC.firstWeek(d1); m <= last; m = addDays(m, 7)) out.push(m);
  return out;
}

function schedChartHtml(p, sc, compact) {
  const acts = sc.acts, d1 = day1Of(p), spans = LC.planSpans(acts), by = LC.progressBy(sc.progress);
  let N = 7;
  Object.keys(spans).forEach((k) => { N = Math.max(N, spans[k].end); });
  if (p.handoverDay) N = Math.max(N, p.handoverDay);
  const pos = (d) => ((d - 1) / N * 100).toFixed(3), wid = (a, b) => ((b - a + 1) / N * 100).toFixed(3);
  const bar = (a, b, cls) => '<span class="' + cls + '" style="left:' + pos(a) + '%;width:' + wid(a, b) + '%"></span>';
  const today = d1 ? schedDayOf(p, todayIso()) : null;
  const todayAt = today !== null && today >= 1 && today <= N ? ((today - 0.5) / N * 100).toFixed(3) : null;
  const todayLine = todayAt !== null ? '<span class="sc-today" style="left:' + todayAt + '%"></span>' : '';
  // The axis: months, and each Monday's date (every 7th day number when there is no start date yet). A thin line
  // down every row at each Monday.
  let axis = '';
  const lines = [];
  for (let d = 1; d <= N; d++) {
    if (d1) {
      const x = LC.fromIso(schedDate(p, d));
      if (d === 1 || x.getDate() === 1) axis += '<span class="sc-month" style="left:' + pos(d) + '%">' + MON[x.getMonth()] + (d === 1 || x.getMonth() === 0 ? ' ' + x.getFullYear() : '') + '</span>';
      if (x.getDay() === 1) { axis += '<span class="sc-wk" style="left:' + pos(d) + '%">' + x.getDate() + '</span>'; lines.push(pos(d)); }
    } else if (d % 7 === 1) { axis += '<span class="sc-wk" style="left:' + pos(d) + '%">D' + d + '</span>'; lines.push(pos(d)); }
  }
  if (todayAt !== null) axis += '<span class="sc-today sc-tlabel-line" style="left:' + todayAt + '%"></span><span class="sc-tlabel" style="left:' + todayAt + '%">Today</span>';
  const grad = lines.length ? 'linear-gradient(to right,' + lines.map((x) => 'transparent ' + x + '%,#ECECE7 ' + x + '%,#ECECE7 calc(' + x + '% + 1px),transparent calc(' + x + '% + 1px)').join(',') + ')' : 'none';
  // Each section's bar covers its rows; its % done is its logged rows' latest values, weighted by their days.
  const secSpan = {}, secDone = {};
  let cur = null;
  acts.forEach((a) => {
    if (a.kind === 'section') { cur = a.id; secDone[cur] = { done: 0, all: 0 }; return; }
    const s = spans[a.id], c = cur && secSpan[cur];
    if (cur && s) secSpan[cur] = c ? { start: Math.min(c.start, s.start), end: Math.max(c.end, s.end) } : { start: s.start, end: s.end };
    if (cur && LC.loggable(a, spans)) {
      const w = s.end - s.start + 1, last = (by[a.id] || []).slice(-1)[0];
      secDone[cur].all += w * 100;
      secDone[cur].done += w * (last ? last.pct : 0);
    }
  });
  // Section names typed in capitals read as ordinary words: "IN-SITU - FRAME WORK" → "In-situ - frame work".
  const secName = (n) => (n === n.toUpperCase() ? n.charAt(0) + n.slice(1).toLowerCase() : n);
  const sel = S.schedSel[p.code];
  let sec = null, rows = '';
  acts.forEach((a) => {
    if (a.kind === 'section') {
      sec = a.id;
      const open = !S.schedFold[p.code + '|' + a.id], s = secSpan[a.id], sd = secDone[a.id];
      // Folded: its dates and how much is done ("16 Nov–20 Jan · 30% done").
      const sum = open ? '' : [s && d1 ? LC.nice(schedDate(p, s.start)) + '–' + LC.nice(schedDate(p, s.end)) : s ? 'Day ' + s.start + '–' + s.end : '',
        sd && sd.all ? Math.round(sd.done / sd.all * 100) + '% done' : ''].filter(Boolean).join(' · ');
      const title = (a.no ? a.no + ' · ' : '') + secName(a.name);
      rows += '<button type="button" class="sc-row sc-sec" data-act="sc-fold" data-code="' + esc(p.code) + '" data-id="' + esc(a.id) + '" aria-expanded="' + open + '">' +
        '<span class="sc-no">' + (open ? '▾' : '▸') + '</span><span class="sc-name" title="' + esc(title + (sum ? ' · ' + sum : '')) + '">' + esc(title) +
        (sum ? '<span class="sc-secsum"> · ' + esc(sum) + '</span>' : '') + '</span>' +
        '<span class="sc-track">' + (s ? bar(s.start, s.end, 'sc-secbar') : '') + todayLine + '</span></button>';
      return;
    }
    if (sec && S.schedFold[p.code + '|' + sec]) return;
    const s = spans[a.id], own = a.start && a.days, act = d1 ? LC.actualOf(by[a.id], d1) : null;
    let track = s ? bar(s.start, s.end, 'sc-plan' + (a.kind === 'procurement' ? ' buy' : '') + (own ? '' : ' sum')) : '';
    // The team (agency) beside its bar: after it, or before it when the bar ends near the right edge.
    const team = teamText(a.team);
    if (s && team) track += s.end / N < 0.8 ? '<span class="sc-blabel" style="left:calc(' + pos(s.end + 1) + '% + 6px)">' + esc(team) + '</span>'
      : '<span class="sc-blabel" style="right:calc(' + (100 - Number(pos(s.start))).toFixed(3) + '% + 6px)">' + esc(team) + '</span>';
    let actText = '';
    if (act && act.start) {
      const as = Math.max(1, schedDayOf(p, act.start)), ae = Math.min(N, act.finish ? schedDayOf(p, act.finish) : Math.max(as, today || as)), pe = s ? s.end : ae;
      track += bar(as, Math.min(ae, pe), 'sc-act');
      if (ae > pe) track += bar(Math.max(pe + 1, as), ae, 'sc-over');
      actText = act.finish ? ' · done ' + LC.nice(act.finish) : ' · ' + act.pct + '% by ' + LC.nice(addDays(act.week, 6));
    }
    const last = (by[a.id] || []).slice(-1)[0];
    const tip = a.name + (s ? ' · plan ' + dayRange(p, s.start, s.end) : ' · no days yet') + actText;
    rows += '<button type="button" class="sc-row lv' + a.level + (sel === a.id ? ' on' : '') + (a.status === 'gone' ? ' gone' : '') + '" data-act="sc-pick" data-code="' + esc(p.code) +
      '" data-id="' + esc(a.id) + '" title="' + esc(tip) + '"><span class="sc-no">' + esc(a.no) + '</span><span class="sc-name" title="' + esc(a.name + (team ? ' · ' + team : '')) + '">' + esc(a.name) + '</span>' +
      (compact ? '' : '<span class="sc-team">' + esc(team || (a.clientScope ? 'Client' : '')) + '</span>') +
      '<span class="sc-done">' + (last ? last.pct + '%' : '') + '</span><span class="sc-track">' + track + todayLine + '</span></button>';
    if (sel === a.id) rows += '<div class="sc-inline">' + schedDetailHtml(p, sc, a.id) + '</div>';
  });
  const legend = '<span class="sc-legend"><span><i class="lg-plan"></i>Plan</span><span><i class="lg-act"></i>Actual</span><span><i class="lg-over"></i>Over plan</span>' +
    (compact ? '' : '<span><i class="lg-buy"></i>Purchase</span>') + '</span>';
  return '<div class="sc-scroll" data-key="' + esc(p.code) + '"><div class="sc-chart' + (compact ? ' compact' : '') + '" style="--sc-wk:' + grad + '">' +
    '<div class="sc-row sc-head"><span class="sc-no"></span><span class="sc-name">' + legend + '</span>' + (compact ? '' : '<span class="sc-team">Team</span>') +
    '<span class="sc-done">Done</span><span class="sc-track sc-axis">' + axis + '</span></div>' + rows + '</div></div>';
}

// The chart scrolls sideways (phones): it opens at this week, and a redraw (things arriving in the background) keeps
// where it was scrolled to.
function schedScrollBefore() { const sc = document.querySelector('.sc-scroll'); return sc ? { key: sc.dataset.key, left: sc.scrollLeft } : null; }
function schedScrollAfter(prev) {
  const sc = document.querySelector('.sc-scroll');
  if (!sc || sc.scrollWidth <= sc.clientWidth) return;
  if (prev && prev.key === sc.dataset.key) { sc.scrollLeft = prev.left; return; }
  const t = sc.querySelector('.sc-today'), names = sc.querySelector('.sc-row:not(.sc-head) .sc-name');
  if (!t) return;
  const x = t.getBoundingClientRect().left - sc.getBoundingClientRect().left + sc.scrollLeft;
  const stuck = names && getComputedStyle(names).position === 'sticky' ? names.getBoundingClientRect().right - sc.getBoundingClientRect().left : 0;
  sc.scrollLeft = Math.max(0, x - stuck - 40);
}
// Under a picked bar: its plan, what was done, and each week's log.
function schedDetailHtml(p, sc, id) {
  const a = sc.acts.find((x) => x.id === id);
  if (!a) return '';
  const d1 = day1Of(p), spans = LC.planSpans(sc.acts), s = spans[a.id], list = LC.progressBy(sc.progress)[a.id] || [];
  let plan = s ? dayRange(p, s.start, s.end) : 'No days in the planner yet.';
  if (s && a.start && a.days && (a.start !== s.start || a.start + a.days - 1 !== s.end)) plan += '. Its own days: ' + dayRange(p, a.start, a.start + a.days - 1) + '; the bar covers its sub-rows.';
  else if (s && !(a.start && a.days)) plan += ' (its sub-rows).';
  let actual = '';
  if (!LC.loggable(a, spans)) actual = a.kind === 'procurement' ? 'Purchases aren’t in the weekly log.' : s ? 'Logged on its sub-rows.' : '';
  else {
    const act = d1 ? LC.actualOf(list, d1) : null;
    actual = !act ? 'Not logged yet.' : !act.start ? '0% so far.' : act.finish
      ? 'Started ' + niceDay(act.start) + ', finished ' + niceDay(act.finish) + (s && schedDayOf(p, act.finish) > s.end ? ' · ' + plural(schedDayOf(p, act.finish) - s.end, 'day', 'days') + ' over plan' : '')
      : 'Started ' + niceDay(act.start) + ' · ' + act.pct + '% by ' + niceDay(addDays(act.week, 6));
  }
  const weeks = list.map((g) => {
    const pl = LC.planPct(s, schedDayOf(p, addDays(g.week, 6))), behind = pl !== null && pl - g.pct >= LC.BEHIND;
    return '<tr><td>' + esc(weekLabel(p, g.week, true)) + '</td><td class="num">' + (pl === null ? '' : pl + '%') + '</td><td class="num' + (behind ? ' bad' : '') + '">' + g.pct + '%</td>' +
      '<td>' + esc(g.reason) + '</td><td class="muted">' + esc(firstName(g.by)) + (g.pending ? ' · <span class="sending">Sending…</span>' : '') + '</td></tr>';
  }).join('');
  const meta = [a.section, a.no ? '#' + a.no : '', teamText(a.team), a.clientScope ? 'Client’s scope' : '', a.kind === 'procurement' ? 'Purchase' : ''].filter(Boolean).join(' · ');
  return '<div class="sc-detail"><div class="muted small">' + esc(meta) + '</div><h3>' + esc(a.name) + '</h3>' +
    (a.status === 'gone' ? '<p class="warn-line">Not in the planner any more. Kept because progress was logged for it.</p>' : '') +
    '<dl class="pdl"><dt>Plan</dt><dd>' + esc(plan) + '</dd>' + (actual ? '<dt>Done</dt><dd>' + esc(actual) + '</dd>' : '') + (a.note ? '<dt>Note</dt><dd>' + esc(a.note) + '</dd>' : '') + '</dl>' +
    (weeks ? '<table class="sc-weeks"><thead><tr><th>Week</th><th class="num">Plan</th><th class="num">Done</th><th>Why behind</th><th>By</th></tr></thead><tbody>' + weeks + '</tbody></table>' : '') + '</div>';
}

// The project's Schedule section (laptop and phone): the plan, and for owners import and the weekly log.
function projectScheduleHtml(p) {
  if (S.imp && S.imp.project === p.code) return importPreviewHtml(p);
  const sc = schedOf(p.code), d1 = day1Of(p), owner = isOwner(), li = sc.lastImport;
  const today = d1 ? schedDayOf(p, todayIso()) : null;
  const info = li ? (li.undone ? 'Draft plan · the last import (' + (li.file || 'Excel') + ') was undone' :
    'Draft plan · imported ' + niceDay(li.at.slice(0, 10)) + ' ' + li.at.slice(11, 16) + ' by ' + firstName(li.by) + (li.file ? ' from ' + li.file : '')) : '';
  const start = !d1 ? 'No start date yet: set the planned start in Directory → Projects → Stage & dates to see dates.'
    : 'Day 1 = ' + niceY(d1) + (p.day1 ? ' (site start)' : ' (planned start)') + (today >= 1 ? ' · today is Day ' + today + ', Week ' + LC.weekNo(d1, todayIso())
      : ' · the site starts in ' + plural(1 - today, 'day', 'days') + '; the green “Today” line shows on the chart from then');
  let btns = '';
  if (owner) {
    btns += '<label class="btn-outline sc-file">' + (sc.acts.length ? 'Import updated planner' : 'Import planner Excel') +
      '<input type="file" id="planFile" data-code="' + esc(p.code) + '" accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" hidden></label>';
    if (li && !li.undone) btns += '<button type="button" class="btn-outline' + (S.schedConfirm === 'undo:' + p.code ? ' btn-danger' : '') + '" data-act="sc-undo" data-code="' + esc(p.code) + '">' +
      (S.schedConfirm === 'undo:' + p.code ? 'Tap again to undo the last import' : 'Undo last import') + '</button>';
    if (sc.acts.length && d1) btns += '<button type="button" class="btn-outline" data-act="sc-ownerlog" data-code="' + esc(p.code) + '" aria-pressed="' + !!(S.ownerLog && S.ownerLog.code === p.code) + '">Log progress</button>';
  }
  const top = '<div class="sc-top"><div>' + (info ? '<div class="sc-info">' + esc(info) + '</div>' : '') + '<div class="muted small">' + esc(start) + '</div></div>' +
    (btns ? '<div class="sc-btns">' + btns + '</div>' : '') + '</div>';
  const logPanel = owner && S.ownerLog && S.ownerLog.code === p.code ? ownerLogHtml(p) : '';
  if (!sc.acts.length) return top + '<section class="card"><p class="empty">No plan yet.' + (owner ? ' Import the planner Excel: you’ll see every row with its days and dates before anything is saved.' : ' Shruthi or Savan imports it.') + '</p></section>';
  return top + logPanel + schedChartHtml(p, sc, phone.matches) + '<p class="muted small sc-foot">Tap a row to see its plan and each week’s progress.' +
    (owner ? ' The plan is a draft until you call the planner final (that saves v2, in the next step).' : '') + '</p>';
}

/* Import: the file is read here, matched against the saved plan (LedgerCore.schedMatch, the same rule the server
 * uses), and shown row by row before anything is saved. */
function schedFilePicked(file, code) {
  if (!file) return;
  S.imp = { project: code, file: file.name, reading: true, err: '', items: null };
  renderAll();
  const buf = file.arrayBuffer ? file.arrayBuffer() : new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('Couldn’t read ' + file.name + '.')); r.readAsArrayBuffer(file);
  });
  Promise.all([buf, window.XLSX ? null : loadScript(XLSX_SRC)]).then((got) => {
    if (!window.XLSX) throw new Error('The Excel reader didn’t load. Check the connection and choose the file again.');
    const wb = XLSX.read(got[0], { type: 'array' });
    // The "Project Planner" sheet first; any sheet with the planner's header row works.
    const names = wb.SheetNames.slice().sort((x, y) => (/planner/i.test(y) ? 1 : 0) - (/planner/i.test(x) ? 1 : 0));
    let res = null, firstErr = '';
    names.some((n) => {
      const r = LC.parsePlanner(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }));
      if (r.error) { firstErr = firstErr || r.error; return false; }
      res = r; res.sheet = n;
      return true;
    });
    if (!res) throw new Error(firstErr || 'No planner sheet in this file.');
    S.imp = { project: code, file: file.name, sheet: res.sheet, items: res.items, problems: res.problems, links: {}, base: schedBaseNow(code), onlyChanges: false, err: '' };
    impRematch();
    renderAll();
  }).catch((err) => { S.imp = { project: code, file: file.name, err: cleanErr(err && err.message), items: null }; renderAll(); });
}
function impRematch() {
  const sc = schedAll()[S.imp.project] || { acts: [] };
  const m = LC.schedMatch(sc.acts, S.imp.items, S.imp.links);
  S.imp.rows = m.rows;
  S.imp.left = LC.schedMatch(sc.acts, S.imp.items, {}).removed; // left out of the new file, before any "renamed to"
}
function importPreviewHtml(p) {
  const im = S.imp, d1 = day1Of(p);
  if (!im.items) {
    return '<section class="card sc-imp">' + (im.reading ? '<p>Reading ' + esc(im.file) + '…</p>' : '<p class="err" role="alert">' + esc(im.err) + '</p>') +
      '<button type="button" class="btn-outline" data-act="sc-imp-cancel">Close</button></section>';
  }
  const sc = schedAll()[p.code] || { acts: [], progress: [] }, first = !sc.acts.length, logged = {};
  sc.progress.forEach((g) => { logged[g.activity] = true; });
  const spans = LC.planSpans(im.items.map((it, i) => ({ id: 'i' + i, parent: it.parent >= 0 ? 'i' + it.parent : '', start: it.start, days: it.days })));
  const days = (st, dy) => (st && dy ? 'Day ' + st + (dy > 1 ? '–' + (st + dy - 1) : '') : st ? 'Day ' + st + ', no days' : '—');
  const dates = (s) => (d1 && s ? niceDay(schedDate(p, s.start)) + (s.end > s.start ? ' to ' + niceDay(schedDate(p, s.end)) : '') : '—');
  const CH = { new: 'New', dates: 'Days changed', name: 'Name changed', team: 'Team changed', renamed: 'Renamed', back: 'Back in the planner', same: '' };
  const count = {};
  im.rows.forEach((x) => { if (im.items[x.i].kind !== 'section') count[x.change] = (count[x.change] || 0) + 1; });
  const body = im.items.map((it, i) => {
    const x = im.rows[i], changed = !first && x.change !== 'same';
    if (im.onlyChanges && !changed) return '';
    if (it.kind === 'section') return '<tr class="sec"><td class="mono">' + esc(it.no) + '</td><td colspan="5">' + esc(it.name) + (changed ? ' · ' + CH[x.change] : '') + '</td></tr>';
    let ch = first ? '' : CH[x.change];
    if (x.change === 'dates' && x.was) ch += ', was ' + days(x.was.start, x.was.days);
    if ((x.change === 'name' || x.change === 'renamed') && x.was) ch += ', was “' + x.was.name + '”';
    if (x.change === 'team' && x.was) ch += ': ' + (teamText(x.was.team) || 'none') + ' → ' + (teamText(it.team) || 'none');
    const s = spans['i' + i], own = it.start && it.days;
    return '<tr class="lv' + it.level + (changed ? ' ch' : '') + '"><td class="mono">' + esc(it.no) + '</td><td>' + esc(it.name) +
      (!it.team ? '' : teamOf(it.team) ? ' <span class="sl-team">' + esc(teamOf(it.team)) + '</span>'
        : ' <span class="sl-team unknown">' + esc(it.team) + ' isn’t a known team</span>') +
      (it.kind === 'procurement' ? ' <span class="muted small">· purchase</span>' : '') + (it.clientScope ? ' <span class="muted small">· client</span>' : '') + '</td>' +
      '<td class="mono nowrap">' + esc(days(it.start, it.days)) + (s && !own ? '<br><span class="muted small">bar Day ' + s.start + '–' + s.end + '</span>' : '') + '</td>' +
      '<td class="nowrap">' + esc(s ? dates(s) : '—') + '</td><td class="num">' + esc(it.days || '') + '</td><td>' + esc(ch) + '</td></tr>';
  }).join('');
  const rowsN = im.items.filter((x) => x.kind !== 'section').length, secN = im.items.length - rowsN;
  // Team codes nobody knows: "MT (#2, #3)".
  const unk = {};
  im.items.forEach((it) => { if (it.team && !teamOf(it.team)) (unk[it.team] = unk[it.team] || []).push('#' + (it.no || it.line)); });
  const unknown = Object.keys(unk).map((t) => t + ' (' + unk[t].join(', ') + ')');
  const summary = first ? plural(rowsN, 'row', 'rows') + ' in ' + plural(secN, 'section', 'sections') + '. Nothing is saved until you press Save this plan.'
    : [count.same ? count.same + ' the same' : '', count.new ? count.new + ' new' : '', count.dates ? count.dates + ' with days changed' : '', count.name ? count.name + ' renamed (spelling)' : '', count.team ? count.team + ' with a team set or changed' : '',
      count.renamed ? count.renamed + ' renamed by you' : '', count.back ? count.back + ' back' : '', im.left.length ? im.left.length + ' not in the new file' : ''].filter(Boolean).join(' · ');
  // Rows the new file leaves out: dropped, or (with progress logged) kept; such a row can be linked to its new name.
  const newRows = (keepI) => im.rows.filter((x) => im.items[x.i].kind !== 'section' && (x.change === 'new' || x.i === keepI));
  const left = im.left.map((a) => {
    const linkI = im.links[a.id];
    const what = !logged[a.id] ? 'Dropped: no progress was logged for it.'
      : '<label class="small">Progress was logged for it, so it is kept as “not in the planner any more”. Or was it renamed? <select data-plink="' + esc(a.id) + '">' +
        '<option value="">No: keep it as it is</option>' + newRows(linkI).map((x) => '<option value="' + x.i + '"' + (x.i === linkI ? ' selected' : '') + '>Renamed to ' +
          esc((im.items[x.i].no ? im.items[x.i].no + ' · ' : '') + im.items[x.i].name) + '</option>').join('') + '</select></label>';
    return '<li><b>' + esc((a.no ? a.no + ' · ' : '') + a.name) + '</b> <span class="muted small">' + esc(a.start && a.days ? days(a.start, a.days) : '') + '</span><br>' + what + '</li>';
  }).join('');
  return '<section class="card sc-imp" aria-labelledby="imp-h"><div class="sc-imp-head"><div><h3 id="imp-h">' + (first ? 'Check the planner before saving it' : 'Check the updated planner before it replaces the draft') + '</h3>' +
    '<div class="muted small">' + esc(im.file + ' · sheet “' + im.sheet + '”') + '</div></div>' +
    (first ? '' : '<button type="button" class="btn-outline" data-act="sc-imp-only" aria-pressed="' + im.onlyChanges + '">' + (im.onlyChanges ? 'Show every row' : 'Show only changes') + '</button>') + '</div>' +
    '<p><b>' + esc(summary) + '</b></p>' +
    '<p class="muted small">' + esc(d1 ? 'Dates count from Day 1 = ' + niceY(d1) + (p.day1 ? ' (site start)' : ' (planned start in Directory)') + '. Every day counts, Sundays too.'
      : 'No start date yet, so no dates: set the planned start in Directory → Projects → Stage & dates.') + '</p>' +
    (im.problems.length ? '<ul class="warn-line">' + im.problems.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
    (unknown.length ? '<p class="warn-line sc-unknown">Not in Directory or Team, so shown as typed: ' + esc(unknown.join(' · ')) +
      '. Use a Directory code (ALM, BAB…), a Team code (SN, SK, VNK) or CL for the client, or add the team in Directory first.</p>' : '') +
    (left ? '<div class="sc-left"><b>Not in the new file</b><ul>' + left + '</ul></div>' : '') +
    '<div class="sc-imp-wrap"><table><thead><tr><th>No</th><th>Activity</th><th>Plan days</th><th>Dates</th><th class="num">Days</th><th>' + (first ? '' : 'Change') + '</th></tr></thead><tbody>' +
    (body || '<tr><td colspan="6" class="muted">No changes.</td></tr>') + '</tbody></table></div>' +
    (im.err ? '<p class="err" role="alert">' + esc(im.err) + '</p>' : '') +
    '<div class="sc-btns"><button type="button" class="btn-accent" data-act="sc-imp-go" data-code="' + esc(p.code) + '">' + (first ? 'Save this plan' : 'Replace draft') + '</button>' +
    '<button type="button" class="btn-outline" data-act="sc-imp-cancel">Cancel</button></div></section>';
}
function importGo() {
  const im = S.imp;
  if (!im || !im.items) return;
  const items = im.items.map((it) => ({ kind: it.kind, level: it.level, section: it.section, no: it.no, name: it.name, parent: it.parent, start: it.start, days: it.days,
    team: it.team, note: it.note, clientScope: it.clientScope, key: it.key }));
  call('importPlanner', [im.project, items, im.links, im.base, im.file], (res) => {
    const c = (res && res.result) || {};
    S.imp = null; S.schedSel[im.project] = '';
    snack('Plan saved from ' + im.file + '.' + (c.removed ? ' ' + plural(c.removed, 'row', 'rows') + ' dropped.' : '') + (c.kept ? ' ' + plural(c.kept, 'row', 'rows') + ' kept for their progress.' : ''));
  }, (msg) => { if (!S.imp) return; if (msg) S.imp.err = msg; else S.imp = null; });
}

/* The weekly log, the same form for the engineer (Today, on Mondays) and owners (Schedule → Log progress). Each row
 * starts at this week's value if logged, else last week's; one tap changes it. 25 points or more behind plan needs a
 * reason. */
function logState(code, monday) { const k = code + '|' + monday; return S.logs[k] || (S.logs[k] = { vals: {}, why: {}, extra: [], err: '', open: false }); }
function logRows(p, monday) {
  const sc = schedOf(p.code), d1 = day1Of(p), st = logState(p.code, monday), spans = LC.planSpans(sc.acts), by = LC.progressBy(sc.progress);
  const list = LC.weekList(sc.acts, sc.progress, d1, monday), end = schedDayOf(p, addDays(monday, 6));
  st.extra.forEach((id) => {
    const a = sc.acts.find((y) => y.id === id);
    if (!a || list.some((x) => x.act.id === id) || !LC.loggable(a, spans)) return;
    list.push({ act: a, span: spans[id], plan: LC.planPct(spans[id], end), before: (by[id] || []).filter((g) => g.week < monday).pop() || null, now: null });
  });
  list.forEach((x) => {
    x.val = st.vals[x.act.id] !== undefined ? st.vals[x.act.id] : x.now ? x.now.pct : x.before ? x.before.pct : null;
    x.behind = x.val !== null && x.plan - x.val >= LC.BEHIND;
    x.why = x.behind ? (st.why[x.act.id] !== undefined ? st.why[x.act.id] : x.now ? x.now.reason : '') : '';
  });
  const others = sc.acts.filter((a) => LC.loggable(a, spans) && !list.some((x) => x.act.id === a.id));
  return { list: list, others: others, st: st };
}
function logFormHtml(p, monday, forEngineer) {
  const r = logRows(p, monday), c = esc(p.code), w = esc(monday);
  if (!r.list.length && !r.others.length) return '<p class="muted">Nothing in the plan to log.</p>';
  const rows = r.list.map((x) => {
    const id = esc(x.act.id);
    const tag = x.val === null ? ['plan', 'Plan ' + x.plan + '%'] : x.val >= 100 ? ['done', 'Done'] : x.behind ? ['bad', 'Behind · plan ' + x.plan + '%'] : ['ok', 'On track · plan ' + x.plan + '%'];
    const team = teamText(x.act.team);
    return '<div class="sl-row"><div class="sl-head"><span class="sl-name">' + esc((x.act.no ? x.act.no + ' · ' : '') + x.act.name) +
      (team ? '<span class="sl-team">' + esc(team) + '</span>' : '') + '</span><span class="sl-tag ' + tag[0] + '">' + esc(tag[1]) + '</span></div>' +
      (x.before ? '<span class="muted small">Last logged ' + x.before.pct + '% (' + esc(weekLabel(p, x.before.week, true)) + ')</span>' : '') +
      '<div class="sl-steps" role="group" aria-label="' + esc(x.act.name) + ': done by the end of the week">' + LC.STEPS.map((n) =>
        '<button type="button" class="sl-step' + (x.val === n ? ' on' : '') + '" data-act="sc-step" data-code="' + c + '" data-week="' + w + '" data-id="' + id + '" data-v="' + n + '" aria-pressed="' + (x.val === n) + '">' + n + '%</button>').join('') + '</div>' +
      (x.behind ? '<div class="sl-why"><span>Behind plan (plan said ' + x.plan + '%). Why?</span><div class="sl-chips">' + LC.REASONS.map((t) =>
        '<button type="button" class="sl-chip' + (x.why === t ? ' on' : '') + '" data-act="sc-why" data-code="' + c + '" data-week="' + w + '" data-id="' + id + '" data-v="' + esc(t) + '" aria-pressed="' + (x.why === t) + '">' + esc(t) + '</button>').join('') + '</div></div>' : '') + '</div>';
  }).join('');
  const add = r.others.length ? '<label class="sl-add"><span class="sr-only">Add an activity</span><select data-sladd="' + c + '" data-week="' + w + '"><option value="">+ Add an activity done this week</option>' +
    r.others.map((a) => '<option value="' + esc(a.id) + '">' + esc((a.no ? a.no + ' · ' : '') + a.name) + '</option>').join('') + '</select></label>' : '';
  return '<div class="sl-form">' + rows + '<div class="sl-foot">' + add + (r.st.err ? '<p class="err" role="alert">' + esc(r.st.err) + '</p>' : '') +
    '<button type="button" class="sl-save" data-act="sc-log-save" data-code="' + c + '" data-week="' + w + '">' + (forEngineer ? 'Save · show to the team all week' : 'Save progress') + '</button></div></div>';
}
function logSave(code, monday) {
  const p = schedProj(code);
  if (!p) return;
  const r = logRows(p, monday), st = r.st;
  const missing = r.list.filter((x) => x.val === null), noWhy = r.list.filter((x) => x.behind && !x.why);
  st.err = missing.length ? 'Pick a % for ' + missing.map((x) => x.act.name).join(', ') + '.' : noWhy.length ? 'Pick why ' + noWhy.map((x) => x.act.name).join(', ') + (noWhy.length > 1 ? ' are' : ' is') + ' behind plan.' : '';
  if (st.err || !r.list.length) { redraw(); return; }
  const entries = r.list.map((x) => ({ a: x.act.id, pct: x.val, reason: x.behind ? x.why : '' }));
  if (S.engineer) {
    outboxAdd('logProgress', [code, monday, entries], 'Progress', { project: code, week: monday }).then(() => {
      delete S.logs[code + '|' + monday];
      renderEng();
      engSnack('Saved. Everyone sees it all week.');
    });
    return;
  }
  call('logProgress', [code, monday, entries], (res) => {
    delete S.logs[code + '|' + monday];
    snack(res && res.saved ? 'Progress saved: ' + weekLabel(p, monday) + '.' : 'Nothing changed.');
  }, (msg) => { st.err = msg; });
}
function ownerLogHtml(p) {
  const weeks = endedWeeks(p), d1 = day1Of(p);
  if (!weeks.length) return '<section class="card sl-panel"><p class="muted">Week 1 ends on ' + esc(niceDay(addDays(LC.firstWeek(d1), 6))) + '. A week is logged from the Monday after it.</p></section>';
  if (weeks.indexOf(S.ownerLog.week) < 0) S.ownerLog.week = weeks[weeks.length - 1];
  return '<section class="card sl-panel" aria-labelledby="ol-h"><div class="sc-imp-head"><h3 id="ol-h">Log progress</h3>' +
    '<label class="small">Week <select data-slweek="' + esc(p.code) + '">' + weeks.slice().reverse().map((m) => '<option value="' + m + '"' + (m === S.ownerLog.week ? ' selected' : '') + '>' + esc(weekLabel(p, m)) + '</option>').join('') + '</select></label></div>' +
    '<p class="muted small">What was done by the end of that week. Venky logs every Monday; change a value here if it needs correcting.</p>' + logFormHtml(p, S.ownerLog.week, false) + '</section>';
}
// Engineer Today: last week's log for each of his projects, until it is saved (then one line, with Change for 24 hours).
function engLogCardHtml() {
  const t = todayIso(), monday = addDays(LC.weekMonday(t), -7);
  return (engMe().projects || []).map((code) => {
    const p = schedProj(code);
    if (!p || p.stage !== 'execution') return '';
    const d1 = day1Of(p), sc = schedOf(code);
    if (!d1 || !sc.acts.length || monday < LC.firstWeek(d1)) return '';
    const list = LC.weekList(sc.acts, sc.progress, d1, monday);
    if (!list.length) return '';
    const st = logState(code, monday), when = weekLabel(p, monday).replace(/^Week \d+ · /, '');
    if (list.every((x) => x.now) && !st.open) {
      const sending = list.some((x) => x.now.pending), newest = Math.max.apply(null, list.map((x) => stampMs(x.now.at)));
      const canChange = !sending && list.every((x) => x.now.by === S.me.email) && Date.now() - newest < 86400000;
      return '<section class="card eng-card sl-card sl-done"><div class="eng-box-h"><b>Last week’s progress logged</b><span class="muted small">' + esc(engProjName(code) + ' · ' + when) + '</span>' +
        (sending ? '<span class="sending small">Sending…</span>' : '') + '</div>' +
        (canChange ? '<button type="button" class="link-btn" data-act="sc-log-open" data-code="' + esc(code) + '" data-week="' + esc(monday) + '">Change</button>' : '') + '</section>';
    }
    const late = t > addDays(monday, 7) || new Date().getHours() >= 10;
    const due = t === addDays(monday, 7) ? (late ? 'was due today at 10 am' : 'due today by 10 am') : 'was due Monday at 10 am';
    return '<section class="card eng-card sl-card"><h2 class="eng-h2">Log last week’s progress</h2><div class="sl-due' + (late ? ' late' : '') + '">' + esc(engProjName(code) + ' · ' + when + ' · ' + due) + '</div>' +
      logFormHtml(p, monday, true) + '</section>';
  }).join('');
}
// Engineer: the whole-project chart, view only (any project; he logs his own on Today).
function engScheduleHtml() {
  const code = S.engProject, p = schedProj(code);
  if (!p) return '<section class="card eng-card eng-pad"><p class="empty">No project.</p></section>';
  const sc = schedOf(code), d1 = day1Of(p), today = d1 ? schedDayOf(p, todayIso()) : null, mine = (engMe().projects || []).indexOf(code) >= 0;
  const line = !d1 ? 'No start date yet.' : today >= 1 ? 'Day ' + today + ' · Week ' + LC.weekNo(d1, todayIso()) + ' · Day 1 was ' + niceDay(d1) : (p.day1 ? 'Site starts ' : 'Planned start ') + niceDay(d1);
  const head = '<section class="card eng-card eng-pad"><h2 class="eng-h2">Schedule · ' + esc(engProjName(code)) + '</h2><div class="muted small">' + esc(line) + '</div>' +
    (sc.acts.length ? '<p class="muted small">View only. Tap a row to see it. Scroll sideways for later weeks.' + (mine ? ' You log progress every Monday, on Today.' : '') + '</p>' : '<p class="empty">No plan yet. Shruthi or Savan imports it.</p>') + '</section>';
  return head + (sc.acts.length ? schedChartHtml(p, sc, true) : '');
}
function schedClick(act, el) {
  if (act.indexOf('sc-') !== 0) return false;
  const code = el.dataset.code, id = el.dataset.id, week = el.dataset.week;
  if (act !== 'sc-undo') S.schedConfirm = '';
  if (act === 'sc-fold') { const k = code + '|' + id; S.schedFold[k] = !S.schedFold[k]; }
  else if (act === 'sc-pick') S.schedSel[code] = S.schedSel[code] === id ? '' : id;
  else if (act === 'sc-step') { const st = logState(code, week); st.vals[id] = Number(el.dataset.v); st.err = ''; }
  else if (act === 'sc-why') { const st = logState(code, week); st.why[id] = el.dataset.v; st.err = ''; }
  else if (act === 'sc-log-save') { logSave(code, week); return true; }
  else if (act === 'sc-log-open') logState(code, week).open = true;
  else if (act === 'sc-ownerlog') S.ownerLog = S.ownerLog && S.ownerLog.code === code ? null : { code: code, week: '' };
  else if (act === 'sc-imp-go') { importGo(); return true; }
  else if (act === 'sc-imp-cancel') S.imp = null;
  else if (act === 'sc-imp-only') { if (S.imp) S.imp.onlyChanges = !S.imp.onlyChanges; }
  else if (act === 'sc-undo') {
    const li = (schedAll()[code] || {}).lastImport;
    if (S.schedConfirm !== 'undo:' + code) S.schedConfirm = 'undo:' + code;
    else if (li) { S.schedConfirm = ''; call('undoImport', [code, li.id], () => snack('Last import undone: the plan before it is back.')); return true; }
  }
  redraw();
  return true;
}
// Picks and lists in the schedule screens (the planner file, "renamed to", "+ Add an activity", the owner's week).
function schedChange(t) {
  if (t.id === 'planFile') { const f = t.files && t.files[0]; t.value = ''; schedFilePicked(f, t.dataset.code); return true; }
  if (t.dataset.plink !== undefined && S.imp) {
    if (t.value === '') delete S.imp.links[t.dataset.plink]; else S.imp.links[t.dataset.plink] = Number(t.value);
    impRematch(); renderAll(); return true;
  }
  if (t.dataset.sladd !== undefined) { if (t.value) logState(t.dataset.sladd, t.dataset.week).extra.push(t.value); redraw(); return true; }
  if (t.dataset.slweek !== undefined && S.ownerLog) { S.ownerLog.week = t.value; renderAll(); return true; }
  return false;
}

/* ---------- events ---------- */
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (CONFIG.env === 'test') CLICKS.push({ act: el && el.dataset.act, disabled: !!(el && el.disabled), busy: el ? !!INFLIGHT[actKey(el)] : false, at: Date.now() });
  if (!el || el.disabled) return;
  withBusy(el, () => onAct(el));
});
// Test app only: what the automated checks can look at when a click seems to do nothing.
const CLICKS = [];
if (CONFIG.env === 'test') window.oftDebug = () => ({ clicks: CLICKS.slice(-10), inflight: JSON.parse(JSON.stringify(INFLIGHT)), qc: S.qc && { qid: S.qc.qid, outcome: S.qc.outcome, task: S.qc.task, sending: S.qc.sending, err: S.qc.err }, qSel: S.qSel,
  lastInvite: S.lastInvite || '', tab: S.tab, projTab: S.projTab, engTab: S.engTab, vis: document.visibilityState, dwgStamp: S.dwgStamp, dwgKeys: S.dwgKeys, poll: POLLDBG, autoSaving: autoSaving });
function onAct(el) {
  const act = el.dataset.act, id = el.dataset.id, kind = el.dataset.kind, code = el.dataset.code;
  // Buttons on the opening / sign-in screens work before any ledger data has loaded.
  if (act === 'reload') { location.reload(); return; }
  if (act === 'choose-account') { showSignIn(null, { chooseAccount: true }); return; }
  if (act === 'sign-out-here') { signOutHere(); return; }
  if (act === 'notify-allow') { store(NOTIFY_ASKED_KEY, String(Date.now())); $('notifyBar').hidden = true; enableAlerts(); return; }
  if (act === 'notify-hide') { store(NOTIFY_ASKED_KEY, String(Date.now())); $('notifyBar').hidden = true; if (S.engineer) renderEng(); return; }
  if (S.engineer) { engClick(act, el); return; }
  if (!S.started) return;
  if (photoClick(act, el) || queryClick(act, el) || dwgClick(act, el) || schedClick(act, el)) return;
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
    case 'proj-tab': S.projTab = code; S.projSec = 'overview'; S.qOpen = false; S.photoSel = ''; break;
    case 'proj-sec': S.projSec = el.dataset.sec; S.qOpen = false; if (el.dataset.sec === 'site') { S.photoSel = ''; S.photosSeenWant = S.projTab; } if (el.dataset.sec === 'drawings') S.dwgsFor = ''; break;
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
      // bases: each of the person's accounts as opened, so a save never overwrites someone else's newer change.
      const g = teamGroups().find((x) => x.email === el.dataset.email) || { emails: [el.dataset.email] }, bases = {};
      g.emails.forEach((em) => { const x = (S.data.users || []).find((y) => y.email === em); if (x) bases[em] = { name: x.name, role: x.role, code: x.code || '' }; });
      if (u) S.memberEdit = { email: u.email, name: u.name, code: u.code || '', role: u.role, projects: (u.projects || []).slice(), err: '', bases: bases };
      break;
    }
    case 'me-save': saveMemberEdit(); return;
    case 'me-cancel': S.memberEdit = null; break;
    case 'me-archive':
      if (prevDel === 'member:' + el.dataset.email) {
        const g = teamGroups().find((x) => x.email === el.dataset.email) || { emails: [el.dataset.email] };
        const handTo = openTasksOf(g).length ? S.handTo[el.dataset.email] || '' : '';
        call('archiveMember', [el.dataset.email, true, handTo], (res) => {
          snack('Archived. Every device they used is signed out; what they did keeps their name.' +
            (res.handedOver ? ' ' + plural(res.handedOver, 'open task', 'open tasks') + ' handed over.' : ''));
          refresh(true);
        });
      } else S.confirmDel = 'member:' + el.dataset.email;
      break;
    case 'copy-invite': copyInvite(el.dataset.email); return;
    case 'pref-photo':
      call('setMyPref', ['photoAlerts', !photoAlertsOn()], (res) => {
        S.data.prefs = res.prefs;
        snack(photoAlertsOn() ? 'Photo alerts are on for you.' : 'Photo alerts are off for you. Needs you still shows new photos.');
      });
      return;
    case 'me-restore': call('archiveMember', [el.dataset.email, false], () => { snack('Restored. They can sign in again.'); refresh(true); }); break;
    case 'done-toggle': S.doneOpen[code] = !S.doneOpen[code]; break;
    case 'rv-ok': reviewTaskNow(id, 'ok'); return;
    case 'rv-redo': {
      const e = findEntry(id);
      S.redo = { id: id, note: '', due: e && e.due > todayIso() ? e.due : addDays(todayIso(), 1), err: '' };
      break;
    }
    case 'rv-send': reviewTaskNow(id, 'redo'); return;
    case 'rv-cancel': S.redo = null; break;
    case 'changed-reload':
      // The edit is dropped; the latest comes in, to change again from there.
      S.snackMsg = null; S.editId = null; S.editBase = ''; S.editDate = ''; setCode('');
      S.dirEdit = null; S.regEdit = null; S.memberEdit = null;
      refresh();
      break;
    case 'reg-sync': {
      const o = S.regOffer;
      S.snackMsg = null;
      if (o) syncRegister(o);
      break;
    }
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
      call('previewBriefs', [], (res) => { S.briefs = res.previews; S.instant = CONFIG.env === 'test' ? res.instant || [] : null; });
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
    if (t.dataset.me === 'role') { S.memberEdit.projects = memberProjects('me'); renderAll(); }
  } else if (t.dataset.tcode) {
    S.tcode = t.value;
    $('tcodePreview').innerHTML = todayCodePreview();
  } else if (t.dataset.pcode) {
    S.pcode = t.value;
    $('pcodePreview').innerHTML = projCodePreview(t.dataset.pcode);
  } else if (t.dataset.qc && S.qc) {
    S.qc[t.dataset.qc] = t.value;
    S.qc.err = '';
    // Change approved: the task box follows "What was approved" until it is typed in itself.
    if (t.dataset.qc === 'taskText') S.qc.taskEdited = true;
    if (t.dataset.qc === 'changeText' && !S.qc.taskEdited && $('qcTaskText')) $('qcTaskText').value = t.value;
    if (t.dataset.qc === 'taskWho') redraw(); // the button names the person
    if (S.qc.photoAsk && $('qcAskPreview')) $('qcAskPreview').textContent = 'The engineer will get: “' + photoAskText(S.qc) + '”';
    const q = $('qcTaskPreview') && S.queries && S.queries.queries.find((x) => x.id === S.qc.qid);
    if (q) $('qcTaskPreview').textContent = queryTaskNote(q, S.qc);
  } else if (t.dataset.co && S.co) {
    S.co[t.dataset.co] = t.value;
    S.co.err = '';
  } else if (t.dataset.qcCheck && S.qc) {
    S.qc[t.dataset.qcCheck] = t.checked;
    if (t.dataset.qcCheck === 'task') S.qc.taskTouched = true;
    // Answered: the task box starts with the question, to edit. (Change approved: with what was approved.)
    const q = S.queries && S.queries.queries.find((x) => x.id === S.qc.qid);
    if (t.dataset.qcCheck === 'task' && t.checked && q && S.qc.outcome !== 'change' && !String(S.qc.taskText || '').trim()) S.qc.taskText = S.qc.taskPrefill = questionTitle(q);
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
  } else if (t.dataset.dup && S.dwgUp) {
    // The upload panel: the note under it ("R4 replaces R3") follows what is typed.
    S.dwgUp[t.dataset.dup] = t.value;
    S.dwgUp.err = '';
    if (t.dataset.dup === 'code') {
      const have = ((S.dwgs && S.dwgs.drawings) || []).find((d) => d.code === t.value.trim().toUpperCase());
      if (have || LC.DWG_TYPES[t.value.trim().toUpperCase()]) { S.dwgUp.title = have ? have.title : LC.DWG_TYPES[t.value.trim().toUpperCase()]; const ti = $('dwgTitle'); if (ti) ti.value = S.dwgUp.title; }
    }
    const note = $('dwgNote');
    if (note) note.innerHTML = dwgNoteHtml();
    const rel = document.querySelector('[data-act="dwg-release"]');
    if (rel) rel.disabled = !!dwgRefused() || S.dwgUp.sending;
  } else if (t.dataset.dupOwn && S.dwgUp) {
    S.dwgUp.ownersOnly = t.checked;
    renderAll();
  } else if (t.dataset.ea && S.engAdd) {
    S.engAdd[t.dataset.ea] = t.value;
  } else if (t.dataset.dn) {
    S.doneNote[t.dataset.dn] = t.value;
  } else if (t.dataset.qm && S.qMove) {
    S.qMove.to = t.value; S.qMove.err = '';
  } else if (t.id === 'engProject') {
    S.engProject = t.value;
    renderEng();
  } else if (t.dataset.ma) {
    S.memberAdd[t.dataset.ma] = t.value;
    if (t.dataset.ma === 'role') { S.memberAdd.projects = memberProjects('ma'); renderAll(); }
  } else if (t.dataset.ho) {
    S.handTo[t.dataset.ho] = t.value;
  } else if (t.dataset.rv && S.redo) {
    S.redo[t.dataset.rv] = t.value;
    S.redo.err = '';
  } else if (t.dataset.reg && S.regEdit) {
    S.regEdit[t.dataset.reg] = t.value;
    S.regEdit.err = '';
  } else if (t.matches('[data-ma-proj]')) {
    S.memberAdd.projects = memberProjects('ma');
  } else if (t.matches('[data-me-proj]') && S.memberEdit) {
    S.memberEdit.projects = memberProjects('me');
  }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (schedChange(t)) return;
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
  } else if (t.dataset.tcode && ev.key === 'Enter') {
    ev.preventDefault();
    todayCodeSave();
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
  checkVersion();
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
