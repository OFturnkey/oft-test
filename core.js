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
    MT: { label: 'My task', task: true, noteRequired: true, parts: ['project', 'due', 'note'] }
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

  // Directory: { projects: {SA: {name, client, active}}, people: {BAB: {...}}, modes: {C: {...}} }
  function buildDir(data) {
    var dir = { projects: {}, people: {}, modes: {} };
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

  function projName(dir, c) { var p = dir.projects[c]; return p ? p.name : c; }
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
  function describe(dir, e) {
    if (TYPES[e.type] && TYPES[e.type].task) return taskTitle(dir, e) + ' (due ' + nice(e.due) + ')';
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
      hint: function (ctx) { return 'who (' + listCodes(whoCodes(ctx.dir)) + ')'; },
      read: function (raw, st, ctx) {
        var c = raw.toUpperCase(), p = ctx.dir.people[c];
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
    var out = { tokens: [], hint: 'P paid, R received, F follow-up, MT my task', ready: false, entry: null, problem: 'Type a code first.' };
    if (!t.length) return out;
    var type = t[0].toUpperCase(), def = TYPES[type];
    if (!def) {
      out.tokens.push({ txt: t[0], meaning: 'use P, R, F or MT', ok: false });
      out.hint = '';
      out.problem = '"' + t[0] + '": use P, R, F or MT';
      return out;
    }
    out.tokens.push({ txt: t[0], meaning: def.label, ok: true });
    var st = { project: '', who: '', amount: null, mode: '', due: '', note: '' };
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
        due: def.task ? (st.due || ctx.sel) : '', note: st.note, date: ctx.sel, raw_code: t.join(' ')
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

  return {
    MON: MON, TYPES: TYPES, RESERVED: RESERVED, CLIENT: CLIENT,
    pad: pad, iso: iso, fromIso: fromIso, nice: nice, cap: cap, inr: inr, short: short, amountOf: amountOf, amountWords: amountWords,
    buildDir: buildDir, storeFor: storeFor, activeCodes: activeCodes, whoCodes: whoCodes,
    projName: projName, clientName: clientName, whoName: whoName, modeLabel: modeLabel, taskTitle: taskTitle, describe: describe,
    parse: parse, codeIssue: codeIssue, nameDup: nameDup, suggestCode: suggestCode, renameRaw: renameRaw
  };
}
