/* plan-data.js — the long-range plans: one big goal cut into dozens of stages, like a syllabus.
 * A plan:  { id, title, start, target, hours, level, note, hue, created, face, summary, ex, steps: [stage] }
 * A stage: { id, title, phase, days, goal, status: 'todo'|'doing'|'done', doneOn,
 *            tasks: [{id, t, done}], res: [{id, kind, title, note, url, q}], practice: [{id, q, hint, a, fb, model, v}],
 *            notes, results: [{id, text, url, date}], log: [{id, date, min, text}] }
 * Stages are chained: a stage lasts `days` and the next one starts the day after, so inserting, deleting, moving or resizing a stage moves everything after it
 * (dates are worked out from plan.start and the durations, never stored). Phases are just a name on each stage; neighbours with the same name form a phase.
 * Kept on this device (localStorage "tf-plans"). Nothing here touches the page, so it can be tested on its own. */
(function (global) {
  'use strict';
  var KEY = 'tf-plans', KINDS = ['book', 'video', 'course', 'web', 'tool', 'other'], STATUS = ['todo', 'doing', 'done'], VERDICTS = ['right', 'partly', 'wrong'];
  var HUES = [215, 155, 5, 35, 275, 185];
  var GM = global.GoalMath, seq = 0;

  /* ---------- small helpers ---------- */
  function uid(p) { seq = (seq + 1) % 1296; return (p || '') + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 4); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function str(v, n) { return String(v == null ? '' : v).replace(/\r\n?/g, '\n').slice(0, n); }
  function line(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }
  function int(v, lo, hi, d) { var n = parseInt(v, 10); if (isNaN(n)) n = d; return clamp(n, lo, hi); }
  function isoOk(s) { return typeof s === 'string' && !!GM.parse(s); }
  function today() { return GM.iso(GM.startOfToday()); }
  function url(v) { v = String(v == null ? '' : v).trim(); return /^https?:\/\/[^\s]+$/i.test(v) && v.length <= 600 ? v : ''; }
  function arr(v) { return Array.isArray(v) ? v : []; }

  /* ---------- cleaning (everything read from storage or an import goes through here) ---------- */
  function cleanStage(s) {
    s = s || {};
    var st = STATUS.indexOf(s.status) >= 0 ? s.status : 'todo';
    return {
      id: s.id ? String(s.id).slice(0, 40) : uid('s'), title: line(s.title, 120), phase: line(s.phase, 60), days: int(s.days, 1, 3650, 14), goal: str(s.goal, 500),
      status: st, doneOn: st === 'done' && isoOk(s.doneOn) ? s.doneOn : '',
      tasks: arr(s.tasks).map(function (x) { x = x || {}; return { id: x.id ? String(x.id).slice(0, 40) : uid('t'), t: line(x.t, 240), done: !!x.done }; }).filter(function (x) { return x.t; }).slice(0, 300),
      res: arr(s.res).map(function (x) { x = x || {}; return { id: x.id ? String(x.id).slice(0, 40) : uid('r'), kind: KINDS.indexOf(x.kind) >= 0 ? x.kind : 'other', title: line(x.title, 160), note: line(x.note, 300), url: url(x.url), q: line(x.q, 120) }; })
        .filter(function (x) { return x.title || x.url; }).slice(0, 100),
      practice: arr(s.practice).map(function (x) { x = x || {}; return { id: x.id ? String(x.id).slice(0, 40) : uid('q'), q: str(x.q, 1000), hint: str(x.hint, 400), a: str(x.a, 6000), fb: str(x.fb, 2000), model: str(x.model, 3000), v: VERDICTS.indexOf(x.v) >= 0 ? x.v : '' }; })
        .filter(function (x) { return x.q.trim(); }).slice(0, 100),
      notes: str(s.notes, 30000),
      results: arr(s.results).map(function (x) { x = x || {}; return { id: x.id ? String(x.id).slice(0, 40) : uid('z'), text: str(x.text, 1200), url: url(x.url), date: isoOk(x.date) ? x.date : '' }; })
        .filter(function (x) { return x.text.trim() || x.url; }).slice(0, 300),
      log: arr(s.log).map(function (x) { x = x || {}; return { id: x.id ? String(x.id).slice(0, 40) : uid('l'), date: isoOk(x.date) ? x.date : today(), min: int(x.min, 0, 1440, 0), text: line(x.text, 300) }; }).slice(0, 500)
    };
  }
  function cleanPlan(p) {
    p = p || {};
    return {
      id: p.id ? String(p.id).slice(0, 40) : uid('p'), title: line(p.title, 100), start: isoOk(p.start) ? p.start : today(), target: isoOk(p.target) ? p.target : '',
      hours: int(p.hours, 1, 80, 6), level: str(p.level, 400), note: str(p.note, 800), hue: int(p.hue, 0, 359, 215), created: isoOk(p.created) ? p.created : today(),
      face: line(p.face, 60), summary: str(p.summary, 400), ex: !!p.ex, steps: arr(p.steps).slice(0, 400).map(cleanStage)
    };
  }

  /* ---------- storage ---------- */
  var state = null, lastError = null;
  function load() {
    var o = null;
    try { o = JSON.parse(global.localStorage.getItem(KEY) || 'null'); } catch (e) {}
    state = { v: 1, plans: o && Array.isArray(o.plans) ? o.plans.map(cleanPlan) : [] };
    return state;
  }
  function S() { return state || load(); }
  function save() {
    try { global.localStorage.setItem(KEY, JSON.stringify(S())); lastError = null; return true; }
    catch (e) { lastError = e; return false; }
  }
  function list() { return S().plans; }
  function get(id) { var a = S().plans; for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function create(o) {
    o = o || {};
    var p = cleanPlan({ title: o.title, start: o.start || today(), target: o.target, hours: o.hours, level: o.level, note: o.note, face: o.face, hue: o.hue != null ? o.hue : HUES[S().plans.length % HUES.length], steps: o.steps || [], summary: o.summary, ex: o.ex });
    S().plans.push(p); save(); return p;
  }
  function remove(id) { S().plans = S().plans.filter(function (p) { return p.id !== id; }); save(); }
  /* one-step undo: a plan as text, and putting it back (into the same object, so everyone holding it sees the change) */
  function snapshot(plan) { return JSON.stringify(plan); }
  function restore(plan, snap) {
    var o = cleanPlan(JSON.parse(snap));
    Object.keys(plan).forEach(function (k) { delete plan[k]; });
    Object.keys(o).forEach(function (k) { plan[k] = o[k]; });
    save(); return plan;
  }

  /* ---------- time: the chain of stages ---------- */
  function dates(plan) {
    var d = GM.parse(plan.start) || GM.startOfToday(), out = [];
    plan.steps.forEach(function (s) { out.push({ from: GM.iso(d), to: GM.iso(GM.addDays(d, s.days - 1)) }); d = GM.addDays(d, s.days); });
    return out;
  }
  function totalDays(plan) { return plan.steps.reduce(function (a, s) { return a + s.days; }, 0); }
  function endDate(plan) { var n = totalDays(plan); return GM.iso(GM.addDays(GM.parse(plan.start) || GM.startOfToday(), Math.max(0, n - 1))); }
  function dayOf(plan, iso) { var d = GM.parse(iso); return d ? GM.nDays(GM.parse(plan.start) || GM.startOfToday(), d) : 0; }   // days after the start (0 = the first day)
  /* where a day falls on the road: a stage index with a fraction (3.5 = halfway through the fourth stage); before the start < 0, after the end > N */
  function pos(plan, iso) {
    var n = dayOf(plan, iso), a = 0;
    if (n < 0) return n / Math.max(1, plan.steps[0] ? plan.steps[0].days : 14);
    for (var i = 0; i < plan.steps.length; i++) { var dd = plan.steps[i].days; if (n < a + dd) return i + (n - a) / dd; a += dd; }
    return plan.steps.length + (n - a) / 14;
  }
  /* the stage you are really in: the first one not finished (a late plan is still where you are, not where the calendar says) */
  function hereIndex(plan) {
    for (var i = 0; i < plan.steps.length; i++) if (plan.steps[i].status !== 'done') return i;
    return plan.steps.length;
  }
  /* the stage the calendar puts today in */
  function calendarIndex(plan) { var p = pos(plan, today()); return p < 0 ? 0 : Math.min(plan.steps.length, Math.floor(p)); }
  /* start counting from today: the first unfinished stage begins today, everything after follows */
  function reschedule(plan) {
    var k = hereIndex(plan), days = 0;
    for (var i = 0; i < k; i++) days += plan.steps[i].days;
    plan.start = GM.iso(GM.addDays(GM.startOfToday(), -days)); save(); return plan.start;
  }

  /* stretch or squeeze the durations so they add up to `total` days (never below a day each) */
  function fitDays(steps, total) {
    var n = steps.length; if (!n) return steps;
    total = Math.max(total, n);
    var sum = steps.reduce(function (a, s) { return a + s.days; }, 0); if (!sum) return steps;
    var k = total / sum, got = 0, rest = [];
    steps.forEach(function (s, i) { var raw = s.days * k, d = Math.max(1, Math.floor(raw)); s.days = d; got += d; rest.push({ i: i, f: raw - Math.floor(raw) }); });
    rest.sort(function (a, b) { return b.f - a.f; });
    for (var j = 0; got < total; j = (j + 1) % n) { steps[rest[j].i].days++; got++; }      // the largest remainders get the spare days
    for (var m = 0; got > total && m < 5000; m++) { var big = 0; for (var q = 1; q < n; q++) if (steps[q].days > steps[big].days) big = q; if (steps[big].days <= 1) break; steps[big].days--; got--; }
    return steps;
  }
  function fitToTarget(plan) {
    if (!plan.target) return false;
    var want = dayOf(plan, plan.target) + 1; if (want < plan.steps.length) return false;
    fitDays(plan.steps, want); save(); return true;
  }

  /* ---------- progress ---------- */
  function stageFill(plan, i) {
    var s = plan.steps[i]; if (!s) return 0;
    if (s.status === 'done') return 1;
    var n = s.tasks.length, d = n ? s.tasks.filter(function (x) { return x.done; }).length / n : 0;
    return Math.min(0.99, d);
  }
  function progress(plan) {
    var num = 0, den = 0;
    plan.steps.forEach(function (s, i) { num += stageFill(plan, i) * s.days; den += s.days; });
    return den ? num / den : 0;
  }
  function counts(plan) {
    var c = { done: 0, doing: 0, todo: 0 };
    plan.steps.forEach(function (s) { c[s.status]++; });
    return c;
  }
  function minutes(s) { return s.log.reduce(function (a, x) { return a + x.min; }, 0); }

  /* ---------- editing the outline ---------- */
  function indexOf(plan, id) { for (var i = 0; i < plan.steps.length; i++) if (plan.steps[i].id === id) return i; return -1; }
  function addStage(plan, at, init) {
    init = init || {};
    at = clamp(at == null ? plan.steps.length : at, 0, plan.steps.length);
    var near = plan.steps[at - 1] || plan.steps[at] || null;
    var s = cleanStage({ title: init.title || '', days: init.days || (near ? Math.min(near.days, 28) : 14), phase: init.phase != null ? init.phase : (near ? near.phase : ''), goal: init.goal, tasks: init.tasks, res: init.res, practice: init.practice });
    plan.steps.splice(at, 0, s); save(); return s;
  }
  function removeStage(plan, id) { var i = indexOf(plan, id); if (i < 0) return false; plan.steps.splice(i, 1); save(); return true; }
  /* one place up or down. At the edge of a phase the stage crosses into the neighbouring phase (it keeps its place in the order); inside a phase it swaps with its neighbour */
  function nudge(plan, id, dir) {
    var i = indexOf(plan, id), j = i + dir; if (i < 0 || j < 0 || j >= plan.steps.length) return false;
    var a = plan.steps[i], b = plan.steps[j];
    if (a.phase !== b.phase) a.phase = b.phase; else { plan.steps[i] = b; plan.steps[j] = a; }
    save(); return true;
  }
  function moveStage(plan, id, to) {
    var i = indexOf(plan, id); if (i < 0) return false;
    to = clamp(to, 0, plan.steps.length - 1); if (to === i) return false;
    var a = plan.steps.splice(i, 1)[0];
    plan.steps.splice(to, 0, a);
    var nb = plan.steps[to - 1] || plan.steps[to + 1]; if (nb) a.phase = (plan.steps[to - 1] ? plan.steps[to - 1].phase : nb.phase);
    save(); return true;
  }
  function dupStage(plan, id) {
    var i = indexOf(plan, id); if (i < 0) return null;
    var o = JSON.parse(JSON.stringify(plan.steps[i]));
    o.id = uid('s'); o.status = 'todo'; o.doneOn = ''; o.notes = ''; o.results = []; o.log = [];
    o.tasks.forEach(function (x) { x.id = uid('t'); x.done = false; });
    o.res.forEach(function (x) { x.id = uid('r'); });
    o.practice.forEach(function (x) { x.id = uid('q'); x.a = ''; x.fb = ''; x.model = ''; x.v = ''; });
    var s = cleanStage(o); plan.steps.splice(i + 1, 0, s); save(); return s;
  }
  /* put several stages in place of one (splitting a stage). Together they last as long as the one they replace; they keep its phase and, for the first, its status */
  function replaceStage(plan, id, parts) {
    var i = indexOf(plan, id); if (i < 0 || !parts.length) return false;
    var old = plan.steps[i], total = old.days;
    var ps = parts.map(function (p) { return cleanStage({ title: p.title, goal: p.goal, days: p.days || 1, phase: old.phase }); });
    if (ps.length > total) total = ps.length;
    fitDays(ps, total);
    plan.steps.splice.apply(plan.steps, [i, 1].concat(ps)); save(); return ps;
  }
  function setStatus(plan, id, status) {
    var s = plan.steps[indexOf(plan, id)]; if (!s || STATUS.indexOf(status) < 0) return false;
    s.status = status; s.doneOn = status === 'done' ? today() : ''; save(); return true;
  }
  /* phases: runs of neighbouring stages with the same (non-empty) name */
  function phases(plan) {
    var out = [];
    plan.steps.forEach(function (s, i) {
      var last = out[out.length - 1];
      if (last && last.name === s.phase) { last.to = i; last.n++; } else out.push({ name: s.phase, from: i, to: i, n: 1 });
    });
    return out;
  }
  function renamePhase(plan, from, to, name) { name = line(name, 60); for (var i = from; i <= to && i < plan.steps.length; i++) plan.steps[i].phase = name; save(); }
  /* a new phase begins at stage i: it and the rest of its old phase take the name */
  function startPhaseAt(plan, i, name) {
    name = line(name, 60); var old = plan.steps[i] && plan.steps[i].phase; if (!plan.steps[i]) return false;
    for (var k = i; k < plan.steps.length && plan.steps[k].phase === old; k++) plan.steps[k].phase = name;
    save(); return true;
  }

  /* ---------- an outline from the AI, or typed in ---------- */
  /* outline: { summary, stages: [{ phase, title, goal, days }] }.  opts.fit: make the durations add up to this many days */
  function applyOutline(plan, outline, opts) {
    opts = opts || {};
    var steps = arr(outline && outline.stages).slice(0, 300).map(function (x) { x = x || {}; return cleanStage({ phase: x.phase, title: x.title, goal: x.goal, days: x.days }); }).filter(function (s) { return s.title; });
    if (!steps.length) return false;
    if (opts.fit) fitDays(steps, opts.fit);
    plan.steps = steps; if (outline.summary) plan.summary = str(outline.summary, 400);
    save(); return true;
  }
  /* A typed or pasted outline: "# Phase" (or "Phase name:") lines name phases, other lines are stages, an indented line under a stage is its goal,
   * and "(14d)", "(2 weeks)", "（3个月）" at the end of a line sets how long it takes. Stages without a length share what is left of opts.total evenly. */
  var UNIT = { d: 1, day: 1, days: 1, '天': 1, '日': 1, w: 7, wk: 7, week: 7, weeks: 7, '周': 7, '星期': 7, m: 30, mo: 30, month: 30, months: 30, '个月': 30, '月': 30 };
  var LEN = /\s*[（(\[【]\s*(\d+(?:\.\d+)?)\s*(d|days?|w|wk|weeks?|mo|months?|m|天|日|周|星期|个月|月)\s*[）)\]】]\s*$/i;
  function parseOutlineText(text, opts) {
    opts = opts || {};
    var stages = [], phase = '', lastStage = null;
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      if (!raw.trim()) return;
      var indented = /^[ \t]{2,}|^\t/.test(raw), s = raw.trim();
      var head = /^#+\s*(.+)$/.exec(s) || /^(.{1,60}?)[:：]$/.exec(s);
      if (head && !indented) { phase = line(head[1].replace(/[#*]+/g, '').replace(/\s*[:：]\s*$/, ''), 60); lastStage = null; return; }
      s = s.replace(/^([-*•·▪◦►]|\d+[.)、．]|\(\d+\)|[（(]?[一二三四五六七八九十]+[）).、])\s*/, '');
      if (!s) return;
      if (indented && lastStage) { lastStage.goal = line((lastStage.goal ? lastStage.goal + '; ' : '') + s, 500); return; }
      var days = 0, m = LEN.exec(s);
      if (m) { days = Math.max(1, Math.round(parseFloat(m[1]) * (UNIT[m[2].toLowerCase()] || 1))); s = s.slice(0, m.index); }
      s = line(s, 120); if (!s) return;
      lastStage = { phase: phase, title: s, goal: '', days: days };
      stages.push(lastStage);
    });
    var fixed = stages.filter(function (x) { return x.days; }), free = stages.filter(function (x) { return !x.days; });
    if (free.length) {
      var used = fixed.reduce(function (a, x) { return a + x.days; }, 0), each = opts.total ? Math.max(1, Math.round((opts.total - used) / free.length)) : 14;
      free.forEach(function (x) { x.days = each; });
    }
    return { stages: stages.slice(0, 300), fixed: fixed.length };
  }

  /* ---------- sharing an outline: what a predecessor worked out, without anyone's notes or answers ---------- */
  function exportPlan(plan, full) {
    var o = JSON.parse(JSON.stringify(plan));
    var out = { app: 'twelve-faces', kind: 'plan', v: 1, plan: { title: o.title, hours: o.hours, level: o.level, note: o.note, summary: o.summary, hue: o.hue, steps: o.steps.map(function (s) {
      var r = { title: s.title, phase: s.phase, days: s.days, goal: s.goal, tasks: s.tasks.map(function (x) { return { t: x.t, done: full ? x.done : false }; }),
        res: s.res.map(function (x) { return { kind: x.kind, title: x.title, note: x.note, url: x.url, q: x.q }; }), practice: s.practice.map(function (x) { return full ? { q: x.q, hint: x.hint, a: x.a, fb: x.fb, model: x.model, v: x.v } : { q: x.q, hint: x.hint }; }) };
      if (full) { r.status = s.status; r.doneOn = s.doneOn; r.notes = s.notes; r.results = s.results; r.log = s.log; }
      return r;
    }) } };
    if (full) { out.plan.start = plan.start; out.plan.target = plan.target; out.plan.created = plan.created; out.plan.face = plan.face; out.full = true; }
    return JSON.stringify(out, null, 1);
  }
  /* text (JSON from exportPlan, or an outline typed line by line) -> a new plan, saved; null when there is nothing in it */
  function importPlan(text, opts) {
    opts = opts || {};
    var o = null; text = String(text || '').trim(); if (!text) return null;
    if (text.charAt(0) === '{') { try { o = JSON.parse(text); } catch (e) { o = null; } }
    if (o && o.kind === 'plan' && o.plan && Array.isArray(o.plan.steps)) {
      var src = o.plan, p = cleanPlan({ title: src.title, hours: src.hours, level: src.level, note: src.note, summary: src.summary, hue: src.hue, steps: src.steps });
      if (o.full) { p.start = isoOk(src.start) ? src.start : today(); p.target = isoOk(src.target) ? src.target : ''; p.face = line(src.face, 60); }
      else p.start = today();
      if (!p.steps.length) return null;
      p.id = uid('p'); p.created = today(); p.hue = src.hue != null ? p.hue : HUES[S().plans.length % HUES.length];
      S().plans.push(p); save(); return p;
    }
    var parsed = parseOutlineText(text, opts);
    if (!parsed.stages.length) return null;
    var q = create({ title: opts.title || '', hours: opts.hours, steps: parsed.stages.map(function (x) { return cleanStage(x); }) });
    if (!parsed.fixed && opts.total) { fitDays(q.steps, opts.total); save(); }      // no lengths typed: spread the stages over the time given
    return q;
  }

  /* ---------- from the "Beyond today" road: each of its stages becomes a stage here (a copy; the two are not linked) ---------- */
  function fromGoal(g) {
    var steps = arr(g.stages).map(function (s) {
      var a = GM.parse(s.from), b = GM.parse(s.to), n = a && b ? Math.max(1, GM.nDays(a, b) + 1) : 14;
      return { title: s.label, days: n, tasks: arr(s.tasks).map(function (x) { return { t: x.t, done: !!x.done }; }), status: arr(s.tasks).length && s.tasks.every(function (x) { return x.done; }) ? 'done' : 'todo' };
    });
    var p = create({ title: g.title, start: isoOk(g.created) && arr(g.stages)[0] && isoOk(g.stages[0].from) ? g.stages[0].from : today(), target: g.date, hours: g.hours, level: g.level, hue: g.hue, face: g.face, summary: g.summary, steps: steps });
    return p;
  }

  /* ---------- an example, so there is something to look at before any AI is set up ---------- */
  var EX = [   // [phase, days]  (the titles and goals come from the language pack: pl.ex.s<n> and pl.ex.g<n>)
    [0, 10], [0, 14], [0, 14], [0, 14], [0, 21], [0, 14],
    [1, 21], [1, 21], [1, 28], [1, 28], [1, 21], [1, 28], [1, 28],
    [2, 35], [2, 35], [2, 35], [2, 42], [2, 42], [2, 35],
    [3, 42], [3, 56], [3, 56], [3, 49],
    [4, 56], [4, 56], [4, 70], [4, 70],
    [5, 84], [5, 98], [5, 112], [5, 105], [5, 120]
  ];
  function example(start) {
    var steps = EX.map(function (e, i) { return { phase: t('pl.ex.p' + e[0]), days: e[1], title: t('pl.ex.s' + (i + 1)), goal: t('pl.ex.g' + (i + 1)) }; });
    var p = cleanPlan({ title: t('pl.ex.title'), start: start || today(), hours: 8, level: t('pl.ex.level'), hue: 215, summary: t('pl.ex.summary'), ex: true, steps: steps });
    p.target = endDate(p);
    // the first stages are already under way, so the example shows a road with something behind it
    for (var i = 0; i < 3; i++) { p.steps[i].status = 'done'; p.steps[i].doneOn = today(); }
    p.steps[3].status = 'doing';
    [['pl.ex.t1', 1], ['pl.ex.t2', 1], ['pl.ex.t3', 0], ['pl.ex.t4', 0], ['pl.ex.t5', 0]].forEach(function (x) { p.steps[3].tasks.push({ id: uid('t'), t: t(x[0]), done: !!x[1] }); });
    p.steps[3].res.push({ id: uid('r'), kind: 'book', title: t('pl.ex.r1'), note: t('pl.ex.r1n'), url: '', q: t('pl.ex.r1') });
    p.steps[3].res.push({ id: uid('r'), kind: 'video', title: t('pl.ex.r2'), note: t('pl.ex.r2n'), url: '', q: t('pl.ex.r2') });
    p.steps[3].practice.push({ id: uid('q'), q: t('pl.ex.q1'), hint: t('pl.ex.q1h'), a: '', fb: '', model: '', v: '' });
    p.steps[3].practice.push({ id: uid('q'), q: t('pl.ex.q2'), hint: t('pl.ex.q2h'), a: '', fb: '', model: '', v: '' });
    S().plans.push(p); save(); return p;
  }

  global.PlanData = {
    KEY: KEY, KINDS: KINDS, HUES: HUES, load: load, save: save, list: list, get: get, create: create, remove: remove, snapshot: snapshot, restore: restore,
    uid: uid, today: today, url: url, cleanStage: cleanStage, cleanPlan: cleanPlan, lastError: function () { return lastError; },
    dates: dates, totalDays: totalDays, endDate: endDate, dayOf: dayOf, pos: pos, hereIndex: hereIndex, calendarIndex: calendarIndex, reschedule: reschedule, fitDays: fitDays, fitToTarget: fitToTarget,
    stageFill: stageFill, progress: progress, counts: counts, minutes: minutes,
    indexOf: indexOf, addStage: addStage, removeStage: removeStage, nudge: nudge, moveStage: moveStage, dupStage: dupStage, replaceStage: replaceStage, setStatus: setStatus,
    phases: phases, renamePhase: renamePhase, startPhaseAt: startPhaseAt,
    applyOutline: applyOutline, parseOutlineText: parseOutlineText, exportPlan: exportPlan, importPlan: importPlan, fromGoal: fromGoal, example: example
  };
})(typeof window !== 'undefined' ? window : globalThis);
