/**
 * The code language (P / R / F / MT): parser, amounts, Directory code checks.
 *
 * One copy for both sides: the server (Code.gs) uses it to re-check every write, and the publish script
 * copies this exact file to the app site as core.js, so typing preview and server checks can never disagree.
 * Keep it self-contained: nothing in here may refer to anything outside LedgerCore().
 */
function LedgerCore() {
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var RUPEE = '₹';
  var CLIENT = 'CL';
  var RESERVED = ['P', 'R', 'F', 'MT', 'CL'];

  // The table that drives the parser: each type lists its parts in order. New parts (GST, advance
  // and so on) are added by defining them in PARTS and naming them here.
  var TYPES = {
    P: { label: 'Paid', money: true, parts: ['project', 'who', 'amount', 'mode', 'note'] },
    R: { label: 'Received', money: true, parts: ['project', 'who', 'amount', 'mode', 'note'] },
    F: { label: 'Follow-up', task: true, parts: ['project', 'who', 'due', 'note'] },
    // An optional @CODE gives the task to that team member: MT NST @VNK 26/11 seal pantry joint.
    MT: { label: 'Task', task: true, noteRequired: true, parts: ['project', 'assignee', 'due', 'note'] }
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromIso(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function nice(s) { if (!s) return ''; var d = fromIso(s); return d.getDate() + ' ' + MON[d.getMonth()]; }
  function cap(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function inr(n) {
    n = Math.round(Number(n) || 0);
    var s = String(Math.abs(n)), last = s.slice(-3), rest = s.slice(0, -3);
    if (rest) last = ',' + last;
    return (n < 0 ? '-' : '') + RUPEE + rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + last;
  }
  function trim2(x) { return String(Math.round(x * 100) / 100); }
  function short(n) {
    n = Number(n) || 0;
    if (n >= 1e7) return trim2(n / 1e7) + 'Cr';
    if (n >= 1e5) return trim2(n / 1e5) + 'L';
    if (n >= 1e3) return trim2(n / 1e3) + 'k';
    return String(n);
  }
  function amountOf(s) {
    var m = /^(\d+(?:\.\d+)?)(k|l|cr)?$/i.exec(String(s || '').replace(/,/g, ''));
    if (!m) return null;
    var mult = { k: 1e3, l: 1e5, cr: 1e7 }[(m[2] || '').toLowerCase()] || 1;
    var v = Math.round(parseFloat(m[1]) * mult);
    return v > 0 ? v : null;
  }

  var ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  var TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function two(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''); }
  function three(n) {
    var h = Math.floor(n / 100), r = n % 100;
    return (h ? ONES[h] + ' hundred' : '') + (h && r ? ' ' : '') + (r ? two(r) : '');
  }
  function words(n) {
    n = Math.floor(n);
    if (n === 0) return 'zero';
    var out = [];
    var cr = Math.floor(n / 1e7); n %= 1e7;
    var lk = Math.floor(n / 1e5); n %= 1e5;
    var th = Math.floor(n / 1e3); n %= 1e3;
    if (cr) out.push(words(cr) + ' crore');
    if (lk) out.push(two(lk) + ' lakh');
    if (th) out.push(two(th) + ' thousand');
    if (n) out.push(three(n));
    return out.join(' ');
  }
  function amountWords(n) { return words(n) + (n === 1 ? ' rupee' : ' rupees'); }

  // Directory: { projects: {SA: {name, client, active}}, people: {BAB: {...}}, modes: {C: {...}}, team: {VNK: {name, role}} }
  function buildDir(data) {
    var dir = { projects: {}, people: {}, modes: {}, team: {} };
    // Archived people keep their code (old tasks show their name) but can't be given new tasks.
    (data.users || []).forEach(function (u) {
      if (u.code && (!dir.team[u.code] || (dir.team[u.code].archived && !u.archived))) dir.team[u.code] = { name: u.name || u.email, role: u.role, archived: !!u.archived };
    });
    (data.projects || []).forEach(function (p) { dir.projects[p.code] = { name: p.name, client: p.client, active: p.active }; });
    (data.people || []).forEach(function (p) {
      dir.people[p.code] = { name: p.name, kind: p.kind, detail: p.detail, active: p.active, system: p.code === CLIENT };
    });
    (data.modes || []).forEach(function (m) { dir.modes[m.code] = { label: m.label, active: m.active }; });
    if (!dir.people[CLIENT]) dir.people[CLIENT] = { name: 'Client', kind: 'client', detail: 'Client of the project', active: true, system: true };
    dir.people[CLIENT].active = true;
    return dir;
  }
  function storeFor(dir, kind) { return kind === 'project' ? dir.projects : kind === 'mode' ? dir.modes : dir.people; }
  function activeCodes(map) { return Object.keys(map).filter(function (k) { return map[k].active; }); }
  function whoCodes(dir) { return activeCodes(dir.people).filter(function (k) { return k !== CLIENT; }).concat([CLIENT]); }
  function listCodes(l) { return l.length > 12 ? l.slice(0, 10).join(', ') + ', …, ' + l[l.length - 1] : l.join(', '); }

  // A project is called by its site name; until one is filled in, by its code.
  function projName(dir, c) { var p = dir.projects[c]; return p && p.name ? p.name : c; }
  function clientName(dir, pc) { var p = dir.projects[pc]; return p && p.client ? p.client : projName(dir, pc) + ' client'; }
  function whoName(dir, code, pc) {
    if (code === CLIENT) return clientName(dir, pc);
    var p = dir.people[code];
    return p ? p.name : code;
  }
  function modeLabel(dir, m) { var r = dir.modes[m]; return r ? r.label : m; }
  function taskTitle(dir, e) {
    if (e.type === 'F') return 'Follow up with ' + whoName(dir, e.who, e.project) + (e.note ? ': ' + e.note : '');
    return cap(e.note);
  }
  function teamName(dir, code) { var u = dir.team && dir.team[code]; return u ? u.name : code; }
  function describe(dir, e) {
    if (TYPES[e.type] && TYPES[e.type].task) return taskTitle(dir, e) + (e.assignee ? ' · for ' + teamName(dir, e.assignee) : '') + ' (due ' + nice(e.due) + ')';
    var nm = whoName(dir, e.who, e.project);
    var by = e.mode ? ' by ' + modeLabel(dir, e.mode) : '';
    var note = e.note ? ' — ' + e.note : '';
    if (e.type === 'P') return 'Paid ' + nm + ' ' + inr(e.amount) + by + note;
    return 'Received ' + inr(e.amount) + ' from ' + nm + by + note;
  }

  function good(m) { return { ok: true, meaning: m }; }
  function bad(m) { return { ok: false, meaning: m }; }
  // When editing, ctx.keep lists the entry's own codes; those stay valid even if archived since.
  function kept(ctx, field, c) { return !!(ctx.keep && ctx.keep[field] === c); }

  var PARTS = {
    project: {
      hint: function (ctx) {
        var l = activeCodes(ctx.dir.projects);
        return 'project code (' + (l.length ? listCodes(l) : 'none yet: add one in Directory') + ')';
      },
      read: function (raw, st, ctx) {
        var c = raw.toUpperCase(), p = ctx.dir.projects[c];
        if (!p) return bad('unknown project — add in Directory');
        if (!p.active && !kept(ctx, 'project', c)) return bad(p.name + ' is archived — restore in Directory');
        st.project = c;
        return good(p.name + (p.active ? '' : ' (archived)'));
      }
    },
    who: {
      hint: function (ctx, type) {
        if (type === 'R') return 'who paid: CL for the client, e.g. R NST CL 50L T (or ' + listCodes(whoCodes(ctx.dir)) + ')';
        return 'who (' + listCodes(whoCodes(ctx.dir)) + ')';
      },
      read: function (raw, st, ctx, type) {
        var c = raw.toUpperCase(), p = ctx.dir.people[c];
        // An amount where the person should be: say what goes there (CL for a client's payment).
        if (!p && amountOf(raw) !== null && (type === 'R' || type === 'P')) {
          return bad(type === 'R' ? 'Who paid? Type CL for the client, e.g. R NST CL 50L T' : 'Who was paid? Type their code, e.g. P NST BAB 25k C');
        }
        if (!p) return bad('unknown person — add in Directory');
        if (!p.active && !kept(ctx, 'who', c)) return bad(p.name + ' is archived — restore in Directory');
        st.who = c;
        return good(c === CLIENT ? clientName(ctx.dir, st.project) + ' · client' : p.name + (p.detail ? ' · ' + p.detail : '') + (p.active ? '' : ' (archived)'));
      }
    },
    amount: {
      hint: function () { return 'amount (25k, 2.5L, 18000)'; },
      read: function (raw, st) {
        var v = amountOf(raw);
        if (v === null) return bad('amount like 25k, 2.5L, 18000');
        st.amount = v;
        return good(inr(v));
      }
    },
    mode: {
      optional: true,
      hint: function (ctx) {
        var l = activeCodes(ctx.dir.modes).map(function (k) { return k + ' ' + ctx.dir.modes[k].label; });
        return l.length ? 'mode ' + l.join(', ') + ' (optional), then a note' : 'a note (optional)';
      },
      match: function (raw, ctx) { return !!ctx.dir.modes[raw.toUpperCase()]; },
      read: function (raw, st, ctx) {
        var c = raw.toUpperCase(), m = ctx.dir.modes[c];
        if (!m.active && !kept(ctx, 'mode', c)) return bad(cap(m.label) + ' is archived — restore in Directory');
        st.mode = c;
        return good(m.label + (m.active ? '' : ' (archived)'));
      }
    },
    assignee: {
      optional: true,
      hint: function (ctx) {
        var l = Object.keys(ctx.dir.team || {}).filter(function (k) { return !ctx.dir.team[k].archived; }).map(function (k) { return '@' + k; });
        return l.length ? '@code to give it to someone (' + listCodes(l) + '), or a date dd/mm, or what to do' : 'date dd/mm (optional), then what to do';
      },
      match: function (raw) { return /^@/.test(raw); },
      read: function (raw, st, ctx) {
        var c = raw.slice(1).toUpperCase(), u = ctx.dir.team && ctx.dir.team[c];
        if (!u) return bad('no one has the code ' + (c || '…') + ' — see Directory → Team');
        if (u.archived) return bad(u.name + ' is archived — see Directory → Team');
        st.assignee = c;
        return good('for ' + u.name);
      }
    },
    due: {
      optional: true,
      hint: function (ctx, type) { return 'date dd/mm (optional), then ' + (TYPES[type].noteRequired ? 'what to do' : 'a note'); },
      match: function (raw) { return /^\d{1,2}\/\d{1,2}$/.test(raw); },
      read: function (raw, st, ctx) {
        var m = /^(\d{1,2})\/(\d{1,2})$/.exec(raw), day = +m[1], mon = +m[2];
        var d = new Date(fromIso(ctx.sel).getFullYear(), mon - 1, day);
        if (mon < 1 || mon > 12 || d.getMonth() !== mon - 1 || d.getDate() !== day) return bad('no such date — use dd/mm');
        st.due = iso(d);
        return good('due ' + nice(st.due));
      }
    },
    note: {
      rest: true,
      hint: function (ctx, type) { return TYPES[type].noteRequired ? 'what to do' : ''; }
    }
  };

  // ctx = { dir, sel: 'yyyy-mm-dd' (the calendar day the code is typed on), keep?: {project, who, mode} }
  function parse(code, ctx) {
    var t = String(code || '').trim().split(/\s+/).filter(function (x) { return x; });
    var out = { tokens: [], hint: 'P paid, R received, F follow-up, MT task', ready: false, entry: null, problem: 'Type a code first.' };
    if (!t.length) return out;
    var type = t[0].toUpperCase(), def = TYPES[type];
    if (!def) {
      out.tokens.push({ txt: t[0], meaning: 'use P, R, F or MT', ok: false });
      out.hint = '';
      out.problem = '"' + t[0] + '": use P, R, F or MT';
      return out;
    }
    out.tokens.push({ txt: t[0], meaning: def.label, ok: true });
    var st = { project: '', who: '', amount: null, mode: '', due: '', note: '', assignee: '' };
    var i = 1, hint = '', problem = '';
    for (var p = 0; p < def.parts.length; p++) {
      var name = def.parts[p], part = PARTS[name];
      if (i >= t.length) { hint = part.hint(ctx, type); break; }
      if (part.rest) {
        st.note = t.slice(i).join(' ');
        out.tokens.push({ txt: def.noteRequired ? 'task' : 'note', meaning: st.note, ok: true });
        i = t.length;
        continue;
      }
      if (part.optional && !part.match(t[i], ctx)) continue;
      var r = part.read(t[i], st, ctx, type);
      out.tokens.push({ txt: t[i], meaning: r.meaning, ok: r.ok });
      if (!r.ok && !problem) problem = '"' + t[i] + '": ' + r.meaning;
      i++;
    }
    out.hint = problem ? '' : hint;
    var complete = def.parts.every(function (n) {
      if (n === 'project') return !!st.project;
      if (n === 'who') return !!st.who;
      if (n === 'amount') return st.amount !== null;
      if (n === 'note') return !def.noteRequired || !!st.note;
      return true;
    });
    out.ready = !problem && complete;
    if (out.ready) {
      out.entry = {
        type: type, project: st.project, who: st.who, amount: def.money ? st.amount : null, mode: st.mode,
        due: def.task ? (st.due || ctx.sel) : '', note: st.note, date: ctx.sel, raw_code: t.join(' '), assignee: st.assignee
      };
    }
    out.problem = problem || (out.ready ? '' : 'This code is not complete yet' + (hint ? ' (next: ' + hint + ')' : '') + '.');
    return out;
  }

  // Directory code checks (shared by the add/edit forms and the server).
  function codeIssue(kind, code, dir, except) {
    var store = storeFor(dir, kind);
    if (!code) return 'Give it a code.';
    var pattern = kind === 'mode' ? /^[A-Z]{1,2}$/ : /^[A-Z][A-Z0-9]{1,3}$/;
    if (!pattern.test(code)) {
      return kind === 'mode' ? 'Mode codes are 1–2 letters, like U or CQ.' : 'Codes are 2–4 letters or numbers, starting with a letter, like BAB or S12.';
    }
    if (RESERVED.indexOf(code) >= 0) return code + ' is reserved for the code system (P, R, F, MT, CL). Pick another.';
    if (code !== except && store[code]) {
      var r = store[code];
      return code + ' is already taken by ' + (r.name || r.label) +
        (r.active ? '. Pick another code.' : ' (archived). Restore it from the Archived list, or pick another code.');
    }
    return '';
  }
  function nameDup(kind, name, dir, except) {
    var n = String(name || '').trim().toLowerCase();
    if (!n) return '';
    var store = storeFor(dir, kind);
    var hit = Object.keys(store).filter(function (k) {
      return k !== except && !store[k].system && String(store[k].name || store[k].label || '').toLowerCase() === n;
    })[0];
    if (!hit) return '';
    return (store[hit].name || store[hit].label) + ' already exists as ' + hit + (store[hit].active ? '' : ' (archived)') + '. Make sure this isn’t a repeat.';
  }
  function suggestCode(kind, name, dir) {
    var store = storeFor(dir, kind);
    var letters = String(name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
    if (!letters || !/^[A-Z]/.test(letters)) return '';
    var ws = letters.split(/\s+/);
    var base = ws.length > 1 && kind !== 'mode' ? ws.map(function (w) { return w[0]; }).join('').slice(0, 3) : ws[0].slice(0, kind === 'mode' ? 1 : 3);
    if (kind !== 'mode' && base.length < 2) base = ws.join('').slice(0, 3);
    if (kind === 'mode') base = base.replace(/[^A-Z]/g, '');
    var free = function (c) { return c && !store[c] && RESERVED.indexOf(c) < 0 && !codeIssue(kind, c, dir, null); };
    if (free(base)) return base;
    if (kind === 'mode') {
      var twoL = ws.join('').replace(/[^A-Z]/g, '').slice(0, 2);
      return twoL.length === 2 && free(twoL) ? twoL : '';
    }
    for (var i = 2; i <= 9; i++) { var c = base.slice(0, 3) + i; if (free(c)) return c; }
    return '';
  }
  // Swap a renamed code inside a saved raw code, by position (field is project, who or mode).
  function renameRaw(raw, type, field, oldCode, newCode) {
    var def = TYPES[String(type || '').toUpperCase()];
    if (!def) return raw;
    var idx = def.parts.indexOf(field) + 1;
    if (idx < 1) return raw;
    var t = String(raw || '').trim().split(/\s+/);
    if ((t[idx] || '').toUpperCase() === oldCode) t[idx] = newCode;
    return t.join(' ');
  }

  // Trades for labour and vendors, and the trade a Details text points to ("Painting & polish" → Painting), or ''.
  var TRADES = ['POP', 'Carpentry', 'Painting', 'Specialist finishes', 'Flooring', 'Aluminium & glass', 'Lighting', 'Metal ceiling',
    'Signage', 'Tiling', 'Plumbing', 'Furniture', 'Civil', 'Fabrication', 'Electrical', 'Others'];
  // A team can have more than one trade: stored and shown as "Painting · Polish".
  function tradesOf(s) {
    var seen = {};
    return String(s || '').split(/\s*[·,;]\s*/).map(function (t) { return t.trim(); }).filter(function (t) {
      var k = t.toLowerCase();
      if (!t || seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  // How late a task is: "3 days overdue" (late), "Due today" (today), "Due tomorrow" / "due Sat 24 Oct" (later).
  var WDS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function dueText(due, today) {
    if (!due) return { text: 'No due date', level: 'none' };
    var n = Math.round((fromIso(today) - fromIso(due)) / 86400000);
    if (n > 0) return { text: n === 1 ? '1 day overdue' : n + ' days overdue', level: 'late' };
    if (n === 0) return { text: 'Due today', level: 'today' };
    if (n === -1) return { text: 'Due tomorrow', level: 'later' };
    var d = fromIso(due);
    return { text: 'due ' + WDS[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()], level: 'later' };
  }
  // Task order everywhere: most overdue first, then due today, then by date; no due date last.
  function byDue(a, b) {
    if (!a.due !== !b.due) return a.due ? -1 : 1;
    return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
  }
  var TRADE_WORDS = [
    ['Metal ceiling', /metal ceiling|baffle|grid ceiling/i], ['Specialist finishes', /special|texture|stucco|wallpaper|venetian|micro ?cement/i],
    ['POP', /\bpop\b|plaster of paris|gypsum|false ceiling/i], ['Carpentry', /carpent|joiner|wood ?work|modular/i],
    ['Painting', /paint|polish/i], ['Flooring', /floor|vinyl|carpet|epoxy|laminate/i], ['Aluminium & glass', /alumin|glass|glaz/i],
    ['Lighting', /light|electric/i], ['Signage', /sign/i], ['Tiling', /\btil(e|es|ing)\b|granite|marble/i],
    ['Plumbing', /plumb|sanitary/i], ['Furniture', /furniture|sofa|upholster/i]
  ];
  function tradeFromDetail(detail) {
    var s = String(detail || '');
    for (var i = 0; i < TRADE_WORDS.length; i++) if (TRADE_WORDS[i][1].test(s)) return TRADE_WORDS[i][0];
    return '';
  }

  /* Drawings: the file name says what it is. "NEST-RCP Dwg-241126-R4" = project (its code or site name) · drawing
   * type · date made (ddmmyy) · revision. The usual types have a title; a new type is named on its first upload. */
  var DWG_TYPES = { RCP: 'Reflected ceiling plan', ELE: 'Electrical layout', CAR: 'Carpentry details', FLR: 'Flooring layout',
    FUR: 'Furniture layout', CIV: 'Civil and masonry', PLB: 'Plumbing layout', HVAC: 'HVAC layout', LGT: 'Lighting layout',
    FCL: 'False ceiling details', ELV: 'Elevations', GA: 'General arrangement', PAR: 'Partition layout', SGN: 'Signage' };
  // Returns { prefix, code, dated: 'yyyy-mm-dd', revNo } or null when the name doesn't follow the pattern.
  function parseDwgName(name) {
    // Any kind of file (.pdf, .dwg, .xlsx…), also with a hidden doubled ending ("…R1.dwg.pdf": Windows hides endings),
    // a copy number ("…R1 (1).xlsx") or long dashes typed or pasted in.
    var s = String(name || '').replace(/(\.[A-Za-z0-9]{1,6})+$/, '').replace(/\s*\(\d{1,3}\)$/, '').replace(/[‐-―]/g, '-').trim();
    var m = /^([A-Za-z0-9]{2,12})[\s_-]+([A-Za-z]{2,6})[\s_-]*Dwg[\s_-]*(\d{2})(\d{2})(\d{2})[\s_-]*R(\d{1,3})$/i.exec(s);
    if (!m) return null;
    var dd = Number(m[3]), mm = Number(m[4]);
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
    return { prefix: m[1].toUpperCase(), code: m[2].toUpperCase(), dated: '20' + m[5] + '-' + m[4] + '-' + m[3], revNo: Number(m[6]) };
  }
  // Does the file name's project part mean this project (its code, or its site name without spaces)?
  function dwgPrefixIs(dir, prefix, code) {
    var p = dir.projects[code], name = p && p.name ? String(p.name).replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
    prefix = String(prefix || '').toUpperCase();
    return prefix === code || (!!name && prefix === name);
  }

  /* ---------- Schedule ----------
   * Plan dates are day numbers from Day 1 (the real site start once set, else the planned start), so moving Day 1
   * moves the whole plan. Durations count every calendar day; sundayOff (a per-project setting, coming later) skips
   * Sundays. Weeks run Monday to Sunday. Week 1 is the week Day 1 falls in, except that a Saturday or Sunday start
   * folds into the next week (Day 1 Sat 31 Oct: Week 1 is Mon 2 to Sun 8 Nov and also covers 31 Oct and 1 Nov). */
  function ymd(s) { var p = String(s).split('-'); return [+p[0], +p[1] - 1, +p[2]]; }
  function addDaysIso(s, n) { var d = fromIso(s); d.setDate(d.getDate() + n); return iso(d); }
  function dayDiff(a, b) { var x = ymd(a), y = ymd(b); return Math.round((Date.UTC(y[0], y[1], y[2]) - Date.UTC(x[0], x[1], x[2])) / 86400000); }
  function weekday(s) { return fromIso(s).getDay(); }
  // The date of plan day n (n = 1 is Day 1).
  function planDate(day1, n, sundayOff) {
    if (!day1 || !n) return '';
    if (!sundayOff) return addDaysIso(day1, n - 1);
    var d = day1, k = weekday(d) === 0 ? 0 : 1;
    while (weekday(d) === 0) { d = addDaysIso(d, 1); k = 1; }
    while (k < n) { d = addDaysIso(d, 1); if (weekday(d) !== 0) k++; }
    return d;
  }
  // The plan day a date falls on (a Sunday off counts as the working day before it). Before Day 1: 0 or less.
  function planDay(day1, s, sundayOff) {
    if (!day1 || !s) return null;
    var diff = dayDiff(day1, s);
    if (!sundayOff || diff < 0) return diff + 1;
    var n = 0, d = day1;
    for (var i = 0; i <= diff; i++) { if (weekday(d) !== 0) n++; d = addDaysIso(d, 1); }
    return Math.max(n, 1);
  }
  function weekMonday(s) { return addDaysIso(s, -((weekday(s) + 6) % 7)); }
  function firstWeek(day1) { var m = weekMonday(day1), w = weekday(day1); return w === 6 || w === 0 ? addDaysIso(m, 7) : m; }
  // Week number of a date (1 for anything up to the end of Week 1).
  function weekNo(day1, s) { return Math.max(1, Math.floor(dayDiff(firstWeek(day1), weekMonday(s)) / 7) + 1); }
  // The days a week's log covers: Week 1 starts on Day 1.
  function weekSpan(day1, monday) { var from = monday === firstWeek(day1) && day1 < monday ? day1 : monday; return { from: from, to: addDaysIso(monday, 6) }; }

  var REASONS = ['Short of people', 'Team didn’t turn up', 'Waiting for material', 'Waiting for another team', 'Bigger job than planned'];
  var STEPS = [0, 25, 50, 75, 100];
  var BEHIND = 25; // points behind plan that need a reason

  // Each row's bar: its own days, stretched to cover its sub-rows. acts: [{ id, parent, start, days }].
  // Returns { id: { start, end } } for the rows that have a bar.
  function planSpans(acts) {
    var kids = {}, by = {}, out = {};
    acts.forEach(function (a) { by[a.id] = a; if (a.parent) (kids[a.parent] = kids[a.parent] || []).push(a.id); });
    var span = function (id, depth) {
      if (out[id] !== undefined || depth > 6) return out[id] || null;
      var a = by[id], s = a && a.start && a.days ? { start: a.start, end: a.start + a.days - 1 } : null;
      (kids[id] || []).forEach(function (k) {
        var c = span(k, depth + 1);
        if (c) s = s ? { start: Math.min(s.start, c.start), end: Math.max(s.end, c.end) } : { start: c.start, end: c.end };
      });
      out[id] = s;
      return s;
    };
    acts.forEach(function (a) { span(a.id, 0); });
    Object.keys(out).forEach(function (k) { if (!out[k]) delete out[k]; });
    return out;
  }
  // How much of a bar the plan expects done by the end of plan day n (0 to 100, rounded).
  function planPct(span, n) {
    if (!span || n === null || n === undefined) return null;
    if (n < span.start) return 0;
    if (n >= span.end) return 100;
    return Math.round((n - span.start + 1) / (span.end - span.start + 1) * 100);
  }
  // Rows the engineer logs: planned work (not sections or purchases) with days of its own. A row with no days whose
  // sub-rows have them (#35 "Finalization of wall surfaces") is a heading: its sub-rows are logged instead.
  function loggable(a, spans) { return a.kind === 'activity' && a.status !== 'removed' && !!a.start && !!a.days && !!spans[a.id]; }
  // Each activity's weekly values, oldest first: { id: [{ week, pct, reason, by, at }] }.
  function progressBy(progress) {
    var out = {};
    progress.forEach(function (p) { (out[p.activity] = out[p.activity] || []).push(p); });
    Object.keys(out).forEach(function (k) { out[k].sort(function (a, b) { return a.week < b.week ? -1 : 1; }); });
    return out;
  }
  function lastBefore(list, monday) { var v = null; (list || []).forEach(function (p) { if (p.week < monday) v = p; }); return v; }
  // The list for one week's log: what the plan has running that week, plus anything started and not finished.
  // Each: { act, plan (% expected by the week's Sunday), before (last week's value or null), now (this week's, if logged) }.
  function weekList(acts, progress, day1, monday, sundayOff) {
    var spans = planSpans(acts), by = progressBy(progress), span = weekSpan(day1, monday);
    var a0 = planDay(day1, span.from, sundayOff), a1 = planDay(day1, span.to, sundayOff);
    var out = [];
    acts.forEach(function (a) {
      if (!loggable(a, spans)) return;
      var s = spans[a.id], before = lastBefore(by[a.id], monday);
      var now = (by[a.id] || []).filter(function (p) { return p.week === monday; })[0] || null;
      if (before && before.pct === 100 && !now) return;
      var running = s.start <= a1 && s.end >= a0, going = before && before.pct > 0 && before.pct < 100;
      if (running || going || now) out.push({ act: a, span: s, plan: planPct(s, a1), before: before, now: now });
    });
    return out;
  }
  // Started in the first week logged above 0%, finished in the week it reached 100% (week by week).
  function actualOf(list, day1) {
    var st = null, fin = null, last = null;
    (list || []).forEach(function (p) {
      last = p;
      if (p.pct > 0 && !st) st = weekSpan(day1, p.week).from;
      if (p.pct === 100 && !fin) fin = addDaysIso(p.week, 6);
      if (p.pct < 100) fin = null;
    });
    return st ? { start: st, finish: fin, pct: last.pct, week: last.week } : (last ? { start: '', finish: null, pct: last.pct, week: last.week } : null);
  }

  /* The planner Excel ("Project Planner" sheet), read on the owner's laptop. Columns are found by their header text,
   * so inserting columns doesn't break it: ACTIVITY, PLAN START DAY, PLAN DURATION, and optionally TEAM and REMARKS;
   * the column just left of ACTIVITY holds the section letter or the activity number.
   *   letter, no days        → a section ("A · PROJECT INITIALIZING WORK")
   *   number                 → an activity ("12 Carpentry Framework", start 15, 25 days)
   *   no number              → a sub-row of the numbered row above it ("Ply backing for doors"); "a. vendor 1" under
   *                            a sub-row is a sub-row of that one
   *   no days                → a row without a bar (procurement items, headings)
   * Rows under an activity named "…procurement…" are purchases (not in the engineer's weekly log). Sections named
   * "client…" are the client's scope. rows: the sheet's cells, row by row. */
  function cellText(v) { return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); }
  function plannerCols(rows) {
    for (var r = 0; r < Math.min(rows.length, 40); r++) {
      var row = rows[r] || [], c = { row: r };
      for (var j = 0; j < row.length; j++) {
        var h = cellText(row[j]).toUpperCase();
        if (!h) continue;
        if (c.name === undefined && /^ACTIVIT(Y|IES)( NAME)?$/.test(h)) c.name = j;
        else if (c.start === undefined && /^PLAN(NED)? START/.test(h)) c.start = j;
        else if (c.days === undefined && /^PLAN(NED)? DURATION|^DURATION/.test(h)) c.days = j;
        else if (c.note === undefined && /^(REMARKS?|NOTES?)$/.test(h)) c.note = j;
        else if (c.team === undefined && /^TEAM( CODE)?$/.test(h)) c.team = j;
      }
      if (c.name !== undefined && c.start !== undefined && c.days !== undefined) { c.no = c.name - 1; return c; }
    }
    return null;
  }
  function schedNorm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function parsePlanner(rows) {
    var c = plannerCols(rows || []);
    if (!c) return { error: 'This file has no planner sheet: no header row with ACTIVITY, PLAN START DAY and PLAN DURATION.' };
    var items = [], problems = [], section = null, top = null, sub = null, seen = {};
    var num = function (v, what, line) {
      if (v === null || v === undefined || cellText(v) === '') return null;
      var n = typeof v === 'number' ? v : Number(cellText(v));
      if (!isFinite(n) || n < 1 || Math.round(n) !== n) { problems.push('Row ' + line + ': ' + what + ' “' + cellText(v) + '” isn’t a whole number of days, left empty.'); return null; }
      return n;
    };
    for (var r = c.row + 1; r < rows.length; r++) {
      var row = rows[r] || [], line = r + 1;
      var name = cellText(row[c.name]);
      if (!name) continue;
      var no = c.no >= 0 ? cellText(row[c.no]) : '';
      var start = num(row[c.start], 'plan start', line), days = num(row[c.days], 'duration', line);
      var it = { line: line, name: name, no: '', start: start, days: days, parent: -1, level: 0,
        note: c.note !== undefined ? cellText(row[c.note]) : '', team: c.team !== undefined ? cellText(row[c.team]) : '' };
      if (/^[A-Za-z]$/.test(no) && start === null && days === null) {
        section = { letter: no.toUpperCase(), name: name };
        top = sub = null;
        it.kind = 'section'; it.no = section.letter; it.level = -1;
      } else if (/^\d+$/.test(no)) {
        it.no = no; top = it; sub = null;
      } else if (top) {
        var under = sub && /^[a-z][.)]\s*\S/i.test(name) ? sub : top;
        it.parent = items.indexOf(under);
        it.level = under === top ? 1 : 2;
        under.kids = (under.kids || 0) + 1;
        it.no = under.no + (under === top ? String.fromCharCode(96 + Math.min(under.kids, 26)) : '.' + under.kids);
        if (under === top) sub = it;
      }
      if (it.kind !== 'section') {
        var head = top || it;
        it.kind = /procure/i.test(head.name) ? 'procurement' : 'activity';
      }
      it.section = section ? section.name : '';
      it.clientScope = !!section && /\bclient/i.test(section.name);
      var parentName = it.parent >= 0 ? items[it.parent].name : '';
      var key = (it.kind === 'section' ? 'section|' : schedNorm(it.section) + '|' + schedNorm(parentName) + '|') + schedNorm(name);
      seen[key] = (seen[key] || 0) + 1;
      it.key = key + (seen[key] > 1 ? '#' + seen[key] : '');
      items.push(it);
    }
    items.forEach(function (x) { delete x.kids; });
    if (!items.some(function (x) { return x.kind !== 'section'; })) return { error: 'The planner sheet has no activities under its header row.' };
    return { items: items, problems: problems };
  }
  /* A re-import against the plan already saved. Rows are matched by section, parent and name, so a matched row keeps
   * its id and its logged progress. old: the saved rows [{ id, key, name, start, days, status }]; status 'gone' is a
   * row an earlier import left out that has progress (kept, "not in the planner any more"): it comes back if the
   * file has it again. links: { oldId: item index } for rows the owner says were renamed. Returns { rows: [{ i, id,
   * change: 'new'|'same'|'dates'|'name'|'renamed'|'back', was }], removed: [rows still in the plan that the new file
   * leaves out] }. */
  function schedMatch(old, items, links) {
    var byKey = {}, used = {}, linked = {};
    links = links || {};
    Object.keys(links).forEach(function (id) { linked[links[id]] = id; });
    old.forEach(function (a) { if (a.status !== 'removed' && (!byKey[a.key] || byKey[a.key].status === 'gone')) byKey[a.key] = a; });
    var rows = items.map(function (it, i) {
      var a = linked[i] !== undefined ? old.filter(function (x) { return x.id === linked[i]; })[0] : byKey[it.key];
      if (!a || used[a.id]) return { i: i, id: '', change: 'new', was: null };
      used[a.id] = true;
      var change = linked[i] !== undefined ? 'renamed' : a.status === 'gone' ? 'back' :
        (a.start !== it.start || a.days !== it.days) ? 'dates' : a.name !== it.name ? 'name' : 'same';
      return { i: i, id: a.id, change: change, was: { start: a.start, days: a.days, name: a.name } };
    });
    // Second pass: a spelling fixed in the Excel ("Fasle" → "False") is the same row, when one saved row in the same
    // section is that close (its name and its parent's name together) and nothing else is. So a parent's fixed
    // spelling keeps its sub-rows too.
    var parts = function (k) { var p = String(k).replace(/#\d+$/, '').split('|'); return p.length === 3 ? p : ['section', '', p[1] || '']; };
    var near = function (x, y) {
      if (x[0] !== y[0]) return -1;
      var d = editDist(x[1], y[1]) + editDist(x[2], y[2]), n = Math.max(x[1].length + x[2].length, y[1].length + y[2].length);
      return d <= Math.max(2, Math.floor(n * 0.15)) ? d : -1;
    };
    rows.forEach(function (x) {
      if (x.id) return;
      var it = items[x.i], best = null, bestD = 99, tie = false;
      old.forEach(function (a) {
        if (used[a.id] || a.status === 'removed') return;
        var d = near(parts(a.key), parts(it.key));
        if (d < 0) return;
        if (d < bestD) { best = a; bestD = d; tie = false; } else if (d === bestD) tie = true;
      });
      if (!best || tie) return;
      used[best.id] = true;
      x.id = best.id; x.was = { start: best.start, days: best.days, name: best.name };
      x.change = best.start !== it.start || best.days !== it.days ? 'dates' : best.name !== it.name ? 'name' : 'same';
    });
    return { rows: rows, removed: old.filter(function (a) { return a.status === 'active' && !used[a.id]; }) };
  }
  function editDist(a, b) {
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  // The plan as the import preview saw it: an import is refused if the plan changed in between.
  function schedBase(acts, lastImportId) {
    var live = acts.filter(function (a) { return a.status !== 'removed'; });
    var s = live.map(function (a) { return a.id + '.' + (a.start || 0) + '.' + (a.days || 0) + '.' + a.status; }).sort().join(','), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000000007;
    return (lastImportId || 'none') + ':' + live.length + ':' + h;
  }

  return {
    REASONS: REASONS, STEPS: STEPS, BEHIND: BEHIND, addDaysIso: addDaysIso, dayDiff: dayDiff, planDate: planDate, planDay: planDay,
    weekMonday: weekMonday, firstWeek: firstWeek, weekNo: weekNo, weekSpan: weekSpan, planSpans: planSpans, planPct: planPct,
    loggable: loggable, progressBy: progressBy, weekList: weekList, actualOf: actualOf, parsePlanner: parsePlanner, schedMatch: schedMatch, schedBase: schedBase,
    DWG_TYPES: DWG_TYPES, parseDwgName: parseDwgName, dwgPrefixIs: dwgPrefixIs,
    MON: MON, TYPES: TYPES, RESERVED: RESERVED, CLIENT: CLIENT, TRADES: TRADES, tradeFromDetail: tradeFromDetail, tradesOf: tradesOf,
    dueText: dueText, byDue: byDue,
    pad: pad, iso: iso, fromIso: fromIso, nice: nice, cap: cap, inr: inr, short: short, amountOf: amountOf, amountWords: amountWords,
    buildDir: buildDir, storeFor: storeFor, activeCodes: activeCodes, whoCodes: whoCodes,
    projName: projName, clientName: clientName, whoName: whoName, modeLabel: modeLabel, taskTitle: taskTitle, describe: describe, teamName: teamName,
    parse: parse, codeIssue: codeIssue, nameDup: nameDup, suggestCode: suggestCode, renameRaw: renameRaw
  };
}
