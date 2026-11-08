/* future.js — "Beyond today": a road from the future down to now.
 * You stand at the bottom. The road runs away from you in true perspective, so the next weeks are big and sharp and a whole
 * year out is squeezed toward the horizon, faint and broad. The goal floats there as a slowly turning dodecahedron; its twelve
 * faces light up as you finish tasks. Tap a band on the road to see that stage's tasks below.
 * Learning, skill and career goals only. Goals are kept on this device (tf-goals). */
(function () {
  'use strict';
  var KEY = 'tf-goals', DAY = 86400000, HUES = [215, 5, 155, 35, 275, 185];
  var NS = 'http://www.w3.org/2000/svg';
  var panel = document.getElementById('future'), tabsEl = document.getElementById('fuTabs'),
      scene = document.getElementById('fuScene'), sheet = document.getElementById('fuBody');
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var msgText = '', msgBad = false, ctl = null, working = false;
  var draft = { title: '', date: '', level: '', hours: '5' };
  var picked = {};                                   // goal id -> index of the stage shown below the road (not saved)

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function sv(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- storage ---------- */
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (o && Array.isArray(o.goals)) return { goals: o.goals.filter(function (g) { return g && g.id && Array.isArray(g.stages); }), sel: o.sel || 'all' };
    } catch (e) {}
    return { goals: [], sel: 'all' };
  }
  var st = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  /* ---------- dates ---------- */
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function parse(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s)); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function startOfToday() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function nDays(a, b) { return Math.round((b - a) / DAY); }
  function daysTo(s) { var d = parse(s); return d ? nDays(startOfToday(), d) : 0; }
  function fmtD(s, withYear) {
    var d = parse(s); if (!d) return s;
    try { return d.toLocaleDateString(t('lang.html'), withYear ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }); }
    catch (e) { return s; }
  }
  function range(s) { return s.from === s.to ? fmtD(s.from) : fmtD(s.from) + ' – ' + fmtD(s.to); }

  /* cut the time between today and the goal date into stages: weeks, then months, quarters, half-years */
  function slices(endIso) {
    var s0 = startOfToday(), e = parse(endIso), out = [], d = s0;
    if (!e || e <= s0) return out;
    while (d < e && out.length < 40) {
      var off = nDays(s0, d);
      var kind = off < 28 ? 'week' : off < 180 ? 'month' : off < 730 ? 'quarter' : 'half';
      var step = { week: 7, month: 30, quarter: 91, half: 182 }[kind];
      var to = addDays(d, step);
      if (to >= e || nDays(to, e) < step / 2) to = e;       // the last stage takes any small remainder
      var last = addDays(to, -1); if (last < d) last = d;
      out.push({ kind: kind, from: iso(d), to: iso(last) });
      d = to;
    }
    return out;
  }

  /* ---------- progress ---------- */
  function done(g) { return g.stages.reduce(function (a, s) { return a + s.tasks.filter(function (x) { return x.done; }).length; }, 0) + (g.doneBefore || 0); }
  function total(g) { return g.stages.reduce(function (a, s) { return a + s.tasks.length; }, 0) + (g.doneBefore || 0); }
  function pct(g) { var n = total(g); return n ? Math.round(done(g) / n * 100) : 0; }
  function curIndex(g) {
    var td = iso(startOfToday());
    for (var i = 0; i < g.stages.length; i++) if (g.stages[i].to >= td) return i;
    return g.stages.length;                  // everything is behind us
  }
  function shownIndex(g) {
    var ci = curIndex(g), i = picked[g.id];
    if (i == null || i < ci || i >= g.stages.length) i = Math.min(ci, g.stages.length - 1);
    return i;
  }

  /* ---------- the AI ---------- */
  function ask(g, sl, doneTexts) {
    var lines = sl.map(function (s, i) { return i + ' | ' + t('fu.kind.' + s.kind) + ' | ' + s.from + ' → ' + s.to; }).join('\n');
    var prompt = t('fu.prompt', {
      today: iso(startOfToday()), goal: g.title, date: g.date, days: daysTo(g.date), level: g.level || t('none'), hours: g.hours,
      redo: doneTexts && doneTexts.length ? t('fu.redo', { done: doneTexts.slice(0, 15).join('; ') }) : '', stages: lines
    });
    ctl = new AbortController();
    return AI.json({ system: t('fu.sys'), messages: [{ role: 'user', content: prompt }], maxTokens: 4000, signal: ctl.signal, idleMs: 60000 });
  }
  function apply(g, sl, raw) {
    var by = {}; (raw && Array.isArray(raw.stages) ? raw.stages : []).forEach(function (x) { if (x && x.i != null) by[x.i] = x; });
    g.stages = sl.map(function (s, i) {
      var x = by[i] || {};
      var tasks = (Array.isArray(x.tasks) ? x.tasks : []).slice(0, s.kind === 'week' ? 4 : s.kind === 'month' ? 3 : 2)
        .map(function (z) { return String(z || '').trim().slice(0, 100); }).filter(Boolean)
        .map(function (z) { return { id: uid(), t: z, done: false, pushed: false }; });
      if (s.kind === 'quarter' || s.kind === 'half') tasks = [];
      return { id: uid(), kind: s.kind, from: s.from, to: s.to, label: String(x.label || '').trim().slice(0, 80) || t('fu.noLabel'), tasks: tasks };
    });
    g.summary = String(raw.summary || '').trim().slice(0, 160);
  }
  function setMsg(m, bad) { msgText = m || ''; msgBad = !!bad; var n = document.getElementById('fuMsg'); if (n) { n.textContent = msgText; n.className = 'fu-msg' + (bad ? ' bad' : ''); } }
  function fail(e) {
    working = false; ctl = null;
    if (e && e.code === 'cancelled') setMsg('');
    else setMsg(e && /^(bad_json|cut|empty)$/.test(e.code) ? t('fu.fail') : AI.explain(e), true);
    render(false);
  }

  function create() {
    if (working) return;
    var d = parse(draft.date), title = draft.title.trim();
    if (!title || !d) { setMsg(t('fu.f.need'), true); return; }
    if (d <= startOfToday()) { setMsg(t('fu.f.past'), true); return; }
    var g = { id: uid(), title: title.slice(0, 80), date: draft.date, level: draft.level.trim().slice(0, 200),
      hours: Math.max(1, Math.min(60, parseInt(draft.hours, 10) || 5)), hue: HUES[st.goals.length % HUES.length], created: iso(startOfToday()), stages: [], doneBefore: 0 };
    var sl = slices(g.date);
    working = true; setMsg(t('fu.working')); render(false);
    ask(g, sl, null).then(function (raw) {
      if (raw && raw.ok === false) { working = false; ctl = null; setMsg(String(raw.reason || '').slice(0, 200) || t('fu.notScope'), true); render(false); return; }
      apply(g, sl, raw);
      st.goals.push(g); st.sel = g.id; draft = { title: '', date: '', level: '', hours: '5' };
      working = false; ctl = null; setMsg(''); save(); render(true);
    }, fail);
  }
  /* plan the rest again from today; finished tasks are remembered, unfinished ones are planned afresh */
  function replan(g) {
    if (working) return;
    var sl = slices(g.date);
    if (!sl.length) { setMsg(t('fu.f.past'), true); render(false); return; }
    var texts = []; g.stages.forEach(function (s) { s.tasks.forEach(function (x) { if (x.done) texts.push(x.t); }); });
    working = true; setMsg(t('fu.working')); render(false);
    ask(g, sl, texts).then(function (raw) {
      if (raw && raw.ok === false) { working = false; ctl = null; setMsg(String(raw.reason || '').slice(0, 200) || t('fu.notScope'), true); render(false); return; }
      g.doneBefore = done(g); apply(g, sl, raw); delete picked[g.id];
      working = false; ctl = null; setMsg(''); save(); render(true);
    }, fail);
  }

  /* ================= the road ================= */
  /* a dodecahedron: 20 vertices, 12 pentagon faces (found from the vertices, so there is no table to get wrong) */
  var PHI = (1 + Math.sqrt(5)) / 2, DV = [], DF = [];
  function vnorm(v) { var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
  function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  (function () {
    var sg = [-1, 1], A = [], B = [];
    sg.forEach(function (x) { sg.forEach(function (y) { sg.forEach(function (z) { DV.push([x, y, z]); }); }); });
    sg.forEach(function (y) { sg.forEach(function (z) { DV.push([0, y / PHI, z * PHI]); DV.push([y / PHI, z * PHI, 0]); DV.push([y * PHI, 0, z / PHI]); }); });
    sg.forEach(function (a) { sg.forEach(function (b) {
      A.push([0, a, b * PHI], [a, b * PHI, 0], [a * PHI, 0, b]);
      B.push([0, a * PHI, b], [a * PHI, b, 0], [a, 0, b * PHI]);
    }); });
    [A, B].forEach(function (set) {
      if (DF.length === 12) return;
      var out = [];
      set.forEach(function (n) {
        var d = DV.map(function (v, i) { return [vdot(v, n), i]; }).sort(function (p, q) { return q[0] - p[0]; });
        if (Math.abs(d[0][0] - d[4][0]) < 1e-6 && d[4][0] - d[5][0] > 1e-3) out.push({ n: vnorm(n), idx: d.slice(0, 5).map(function (p) { return p[1]; }) });
      });
      if (out.length === 12) DF = out;
    });
    DF.forEach(function (f) {
      var u = vcross(f.n, [0, 0, 1]); if (Math.abs(u[0]) + Math.abs(u[1]) + Math.abs(u[2]) < 1e-3) u = vcross(f.n, [0, 1, 0]);
      u = vnorm(u); var w = vcross(f.n, u);
      f.idx.sort(function (a, b) { return Math.atan2(vdot(DV[a], w), vdot(DV[a], u)) - Math.atan2(vdot(DV[b], w), vdot(DV[b], u)); });
    });
    // faces light up from the bottom of the die upward as the goal fills in
    var ord = DF.slice().sort(function (a, b) { return a.n[1] - b.n[1]; });
    DF.forEach(function (f) { f.rank = ord.indexOf(f); });
  })();
  var LIGHT = vnorm([-0.4, 0.7, 0.6]), TILT = 0.4;

  var dice = [], raf = 0;
  function makeDie(parent, o) {            // o: x, y(centre), r, lit (0..12), ghost, phase
    var g = sv('g', { class: 'die' + (o.ghost ? ' ghost' : '') }, parent);
    var polys = DF.map(function (f) { return sv('polygon', { class: f.rank < o.lit ? 'lit' : 'dim' }, g); });
    var d = { g: g, polys: polys, o: o };
    dice.push(d); return d;
  }
  function spin(d, tm) {
    var o = d.o, a = tm * 0.00032 + o.phase, ca = Math.cos(a), sa = Math.sin(a), cx = Math.cos(TILT), sx = Math.sin(TILT), k = o.r / 1.5;
    var P = DV.map(function (v) {
      var x1 = v[0] * ca + v[2] * sa, z1 = -v[0] * sa + v[2] * ca;
      return [o.x + k * x1, o.y - k * (v[1] * cx - z1 * sx)];
    });
    DF.forEach(function (f, i) {
      var n = f.n, x1 = n[0] * ca + n[2] * sa, z1 = -n[0] * sa + n[2] * ca;
      var ny = n[1] * cx - z1 * sx, nz = n[1] * sx + z1 * cx, p = d.polys[i];
      if (nz < 0.02) { p.setAttribute('visibility', 'hidden'); return; }
      p.setAttribute('visibility', 'visible');
      p.setAttribute('points', f.idx.map(function (j) { return P[j][0].toFixed(1) + ',' + P[j][1].toFixed(1); }).join(' '));
      var shade = Math.max(0, x1 * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      p.setAttribute('fill-opacity', (0.62 + 0.38 * shade).toFixed(2));
    });
    d.g.setAttribute('transform', 'translate(0,' + (reduced ? 0 : Math.sin(tm / 760 + o.phase * 2) * 3).toFixed(1) + ')');
  }
  function loop(tm) { dice.forEach(function (d) { spin(d, tm); }); raf = requestAnimationFrame(loop); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function startLoop() {
    stopLoop();
    if (!dice.length || panel.hidden) return;
    if (reduced) { dice.forEach(function (d) { spin(d, 0); }); return; }
    raf = requestAnimationFrame(loop);
  }

  var MARKS = [[7, 'fu.m.w1'], [30, 'fu.m.m1'], [91, 'fu.m.m3'], [182, 'fu.m.m6'], [365, 'fu.m.y1'], [730, 'fu.m.y2']];
  function fit(node, str, maxW) {                    // shorten an SVG text to a width
    node.textContent = str;
    try {
      if (node.getComputedTextLength() <= maxW) return true;
      var lo = 0, hi = str.length;
      while (lo < hi) { var mid = (lo + hi + 1) >> 1; node.textContent = str.slice(0, mid) + '…'; if (node.getComputedTextLength() <= maxW) lo = mid; else hi = mid - 1; }
      node.textContent = lo > 0 ? str.slice(0, lo) + '…' : '';
      return lo > 0;
    } catch (e) { return true; }
  }
  function mode() { return st.sel === 'new' ? 'ghost' : st.sel === 'all' ? 'all' : 'goal'; }
  function curGoal() { return st.goals.filter(function (x) { return x.id === st.sel; })[0]; }

  function drawScene(intro) {
    stopLoop(); dice = []; scene.textContent = ''; scene.classList.remove('intro');
    var W = scene.clientWidth, H = scene.clientHeight;
    if (W < 120 || H < 120) return;
    var md = mode(), g = md === 'goal' ? curGoal() : null;
    var gs = md === 'goal' ? [g] : md === 'all' ? st.goals : [];
    if (g) scene.style.setProperty('--gh', g.hue); else scene.style.removeProperty('--gh');

    var cx = W / 2, yHor = Math.round(H * 0.25), yNow = H - 26, span = yNow - yHor, halfNear = W * 0.43;
    var dMax = gs.reduce(function (m, x) { return Math.max(m, daysTo(x.date)); }, 0) || 120;
    var kk = Math.max(6, dMax / 7.33);                // the goal's date always lands near the horizon, so the road fills the view
    function yOf(d) { return yHor + span / (1 + Math.max(0, d) / kk); }
    function half(y) { return 3 + halfNear * (y - yHor) / span; }
    function sOf(y) { return (y - yHor) / span; }

    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group', 'aria-label': t('fu.sceneAria') }, scene);
    var defs = sv('defs', {}, svg);
    function grad(id, attrs, stops) { var e = sv(attrs.r ? 'radialGradient' : 'linearGradient', Object.assign({ id: id }, attrs), defs); stops.forEach(function (s) { sv('stop', { offset: s[0], style: 'stop-color:' + s[1] + ';stop-opacity:' + s[2] }, e); }); }
    grad('fuSky', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, 'var(--sky1)', 1], [1, 'var(--horizon)', 1]]);
    grad('fuGlow', { cx: 0.5, cy: 0.5, r: 0.5 }, [[0, 'var(--glow)', 0.9], [1, 'var(--glow)', 0]]);
    grad('fuFloor', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, 'var(--horizon)', 1], [0.35, 'var(--floor1)', 1], [1, 'var(--floor2)', 1]]);
    grad('fuRoad', { x1: 0, y1: yNow, x2: 0, y2: yHor, gradientUnits: 'userSpaceOnUse' }, [[0, 'var(--road)', 0.95], [0.8, 'var(--road)', 0.6], [1, 'var(--road)', 0.08]]);
    grad('fuFog', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, 'var(--horizon)', 0.95], [0.55, 'var(--horizon)', 0.4], [1, 'var(--horizon)', 0]]);
    grad('fuShadow', { cx: 0.5, cy: 0.5, r: 0.5 }, [[0, 'var(--shadow-c)', 0.55], [1, 'var(--shadow-c)', 0]]);

    sv('rect', { x: 0, y: 0, width: W, height: yHor + 1, fill: 'url(#fuSky)' }, svg);
    sv('ellipse', { cx: cx, cy: yHor, rx: W * 0.7, ry: H * 0.3, fill: 'url(#fuGlow)' }, svg);
    sv('rect', { x: 0, y: yHor, width: W, height: H - yHor, fill: 'url(#fuFloor)' }, svg);
    for (var i = -7; i <= 7; i++) sv('line', { x1: cx, y1: yHor, x2: cx + i * W * 0.17, y2: H, class: 'ray' }, svg);

    // the road
    var yB = H;
    sv('polygon', { points: (cx - 3) + ',' + yHor + ' ' + (cx + 3) + ',' + yHor + ' ' + (cx + half(yB)) + ',' + yB + ' ' + (cx - half(yB)) + ',' + yB, fill: 'url(#fuRoad)' }, svg);
    sv('line', { x1: cx - 3, y1: yHor, x2: cx - half(yB), y2: yB, class: 'edge' }, svg);
    sv('line', { x1: cx + 3, y1: yHor, x2: cx + half(yB), y2: yB, class: 'edge' }, svg);
    var step = kk / 6, dash = sv('g', { class: 'dashes' }, svg);
    for (var dd = 0; dd < dMax * 1.5; dd += step) {
      var ya = yOf(dd), yb = yOf(dd + step * 0.45);
      sv('line', { x1: cx, y1: ya, x2: cx, y2: yb, 'stroke-width': (0.8 + 2.4 * sOf(ya)).toFixed(1) }, dash);
    }

    // stages: bands across the road
    var ci = g ? curIndex(g) : 0, sel = g ? shownIndex(g) : -1, labels = [], die = null;
    if (g) { var yG0 = yOf(daysTo(g.date)), rG0 = 44 + 22 * sOf(yG0); die = { r: rG0, top: yG0 - rG0 * 2.2, bottom: yG0 + 6 }; }
    if (g) {
      var up = g.stages.slice(ci), count = up.length;
      up.forEach(function (s, k) {
        var i = ci + k, dA = Math.max(0, daysTo(s.from)), dB = daysTo(s.to) + 1;
        var ya = yOf(dA) - 0.8, yb = yOf(dB) + 0.8, h = ya - yb; if (h < 1.2) return;
        var sm = sOf((ya + yb) / 2), full = s.tasks.length && s.tasks.every(function (x) { return x.done; });
        var grp = sv('g', { class: 'band' + (i === ci ? ' cur' : '') + (i === sel ? ' sel' : '') + (full ? ' full' : '') + (i % 2 ? ' odd' : ''), tabindex: 0, role: 'button',
          'aria-label': t('fu.stageAria', { label: s.label, range: range(s) }), 'aria-pressed': i === sel ? 'true' : 'false' }, svg);
        grp.style.setProperty('--n', String(count - 1 - k)); grp.style.setProperty('--dy', (-(sOf(ya)) * span * 0.6).toFixed(0) + 'px');
        sv('polygon', { points: (cx - half(ya)) + ',' + ya + ' ' + (cx + half(ya)) + ',' + ya + ' ' + (cx + half(yb)) + ',' + yb + ' ' + (cx - half(yb)) + ',' + yb }, grp);
        var pick = function () { picked[g.id] = i; render(false); };
        grp.addEventListener('click', pick);
        grp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        var mid = (ya + yb) / 2, fs = Math.round(11.5 + 2.5 * sm), op = (0.5 + 0.5 * Math.min(1, sm * 2.2)).toFixed(2);
        if (h >= 17) {
          fs = Math.max(10, Math.min(fs, Math.floor(h * 0.62)));
          var tx = sv('text', { x: cx, y: mid + (s.tasks.length && h >= 46 ? -2 : fs * 0.35), class: 'lbl in', 'text-anchor': 'middle', 'font-size': fs, opacity: op }, grp);
          fit(tx, s.label, half(mid) * 2 - 22);
          if (s.tasks.length && h >= 46) {                 // one pip per task, filled when done
            var pw = (s.tasks.length - 1) * 11;
            s.tasks.forEach(function (x, j) { sv('circle', { cx: cx - pw / 2 + j * 11, cy: mid + 13, r: 3.2, class: 'pip' + (x.done ? ' on' : '') }, grp); });
          }
        } else {
          labels.push({ grp: grp, mid: mid, edge: half(mid), s: s, fs: fs, op: op, sm: sm });
        }
        // the date this stage begins, in the left margin when there is room
        if (cx - half(ya) > 92 && h >= 9) {
          var dt = sv('text', { x: cx - half(ya) - 8, y: ya - 3, class: 'dt', 'text-anchor': 'end', 'font-size': 10.5 }, grp);
          dt.textContent = fmtD(s.from);
        }
      });
      // stages too thin to hold a label are named in the right-hand margin, nudged apart
      var prev = 1e9, evenly = Math.ceil(labels.length / 5);                      // at most about five names out here, spread along the road
      labels.sort(function (a, b) { return b.mid - a.mid; }).filter(function (L, i) { return i % evenly === 0; }).forEach(function (L) {
        var y = Math.min(L.mid, prev - 15); if (y < 12) return; prev = y;
        var x0 = cx + L.edge + 12;
        if (die && y > die.top && y < die.bottom) x0 = Math.max(x0, cx + die.r * 1.35 + 6);   // keep clear of the floating goal
        var room = W - x0 - 8; if (room < 44) return;
        sv('line', { x1: cx + half(L.mid), y1: L.mid, x2: x0 - 3, y2: y, class: 'lead' }, L.grp);
        var tx = sv('text', { x: x0, y: y + 4, class: 'lbl out', 'font-size': 12, opacity: L.op }, L.grp);
        fit(tx, L.s.label, room);
      });
    }

    // distance haze
    sv('rect', { x: 0, y: yHor, width: W, height: span * 0.62, fill: 'url(#fuFog)', 'pointer-events': 'none' }, svg);

    // time marks: how far away is each line
    var lastY = 1e9;
    MARKS.forEach(function (m) {
      if (m[0] > dMax * 1.05) return;
      var y = yOf(m[0]); if (lastY - y < 13 || y < yHor + 6) return; lastY = y;
      sv('line', { x1: 0, y1: y, x2: W, y2: y, class: 'mark' }, svg);
      var tx = sv('text', { x: 8, y: y - 3, class: 'mk', 'font-size': 10.5 }, svg); tx.textContent = t(m[1]);
    });

    // the goals: floating dodecahedra
    var sorted = gs.slice().sort(function (a, b) { return daysTo(a.date) - daysTo(b.date); });
    function goalDie(x, ground, r, lit, label, ghost, phase, onClick, side) {
      sv('ellipse', { cx: x, cy: ground, rx: r * 1.25, ry: r * 0.28, fill: 'url(#fuShadow)' }, svg);
      sv('circle', { cx: x, cy: ground - r * 1.05, r: r * 1.7, class: 'halo', opacity: ghost ? 0.25 : (0.35 + 0.65 * lit / 12).toFixed(2), fill: 'url(#fuGlow)' }, svg);
      var d = makeDie(svg, { x: x, y: ground - r * 1.05, r: r, lit: lit, ghost: ghost, phase: phase });
      if (intro) { d.g.classList.add('arrive'); }
      if (onClick) {
        d.g.setAttribute('tabindex', 0); d.g.setAttribute('role', 'button'); d.g.setAttribute('aria-label', label);
        d.g.addEventListener('click', onClick);
        d.g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } });
      }
      return d;
    }
    if (md === 'goal') {
      var yG = yOf(daysTo(g.date)), rG = die.r;
      goalDie(cx, yG, rG, Math.round(pct(g) / 100 * 12), g.title, false, 0.6);
      var tt = sv('text', { x: cx, y: Math.max(14, yG - rG * 2.2 - 13), class: 'goal-t', 'text-anchor': 'middle', 'font-size': 14 }, svg);
      fit(tt, g.title, W - 28);
    } else if (md === 'all') {
      sorted.forEach(function (x, j) {
        var yG = yOf(daysTo(x.date)), r = 20 + 26 * sOf(yG), side = j % 2 ? 1 : -1, px = cx + side * half(yG) * 0.42;
        goalDie(px, yG, r, Math.round(pct(x) / 100 * 12), x.title, false, j * 1.3, function () { st.sel = x.id; save(); render(true); });
        var room = side > 0 ? W - (px + r * 1.5) - 8 : px - r * 1.5 - 44;      // on the left, stay clear of the time marks
        if (room > 48) {
          var tx = sv('text', { x: side > 0 ? px + r * 1.5 : px - r * 1.5, y: yG - r - 2, class: 'goal-t sm', 'text-anchor': side > 0 ? 'start' : 'end', 'font-size': 12 }, svg);
          fit(tx, x.title, room);
          var t2 = sv('text', { x: side > 0 ? px + r * 1.5 : px - r * 1.5, y: yG - r + 12, class: 'dt', 'text-anchor': side > 0 ? 'start' : 'end', 'font-size': 10.5 }, svg);
          fit(t2, fmtD(x.date, true), room);
        } else {                                       // a big, near die has no room beside it: name it underneath
          var t3 = sv('text', { x: px, y: yG + 15, class: 'goal-t sm', 'text-anchor': 'middle', 'font-size': 12 }, svg);
          fit(t3, x.title + ' · ' + fmtD(x.date, true), Math.min(W - 16, 220));
        }
      });
    } else {
      var yGh = yOf(dMax), rGh = Math.max(26, Math.min(44, (yGh - 30) / 2.3));
      goalDie(cx, yGh, rGh, 0, '', true, 0.6);
      var gt = sv('text', { x: cx, y: Math.max(16, yGh - rGh * 2.2 - 13), class: 'goal-t', 'text-anchor': 'middle', 'font-size': 15 }, svg);
      gt.textContent = t('fu.ghost');
    }

    // you are here
    var here = sv('g', { class: 'here' }, svg);
    sv('circle', { cx: cx, cy: yNow, r: 7, class: 'ping' }, here);
    sv('circle', { cx: cx, cy: yNow, r: 5.5, class: 'pt' }, here);
    var ht = sv('text', { x: cx, y: yNow + 20, class: 'here-t', 'text-anchor': 'middle', 'font-size': 11.5 }, svg); ht.textContent = t('fu.now');

    if (intro && !reduced) scene.classList.add('intro');
    startLoop();
  }

  /* ================= the part below the road ================= */
  function daysLeft(g) {
    var n = daysTo(g.date);
    return n > 0 ? t('fu.daysLeft', { n: n }) : n === 0 ? t('fu.dayToday') : t('fu.daysPast', { n: -n });
  }
  function renderTabs() {
    tabsEl.textContent = '';
    function chip(label, on, fn, hue) {
      var b = el('button', 'fu-chip', label); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (hue != null) b.style.setProperty('--gh', hue);
      b.addEventListener('click', fn); tabsEl.appendChild(b);
    }
    if (st.goals.length > 1) chip(t('fu.all'), st.sel === 'all', function () { st.sel = 'all'; save(); render(true); });
    st.goals.forEach(function (g) { chip(g.title, st.sel === g.id, function () { st.sel = g.id; save(); render(true); }, g.hue); });
    chip(t('fu.new'), st.sel === 'new' || !st.goals.length, function () { st.sel = 'new'; save(); render(true); });
  }

  function formView() {
    var box = el('div', 'fu-form');
    if (!st.goals.length) box.appendChild(el('p', 'fu-intro', t('fu.intro')));
    function field(label, inp) { var l = el('label', 'fu-field'); l.appendChild(el('span', '', label)); l.appendChild(inp); box.appendChild(l); return inp; }
    var a = el('input'); a.type = 'text'; a.maxLength = 80; a.value = draft.title; a.placeholder = t('fu.f.titlePh'); a.disabled = working;
    a.addEventListener('input', function () { draft.title = a.value; });
    field(t('fu.f.title'), a);
    var b = el('input'); b.type = 'date'; b.value = draft.date; b.disabled = working; b.min = iso(addDays(startOfToday(), 1));
    b.addEventListener('input', function () { draft.date = b.value; });
    field(t('fu.f.date'), b);
    var c = el('textarea'); c.rows = 2; c.maxLength = 200; c.value = draft.level; c.placeholder = t('fu.f.levelPh'); c.disabled = working;
    c.addEventListener('input', function () { draft.level = c.value; });
    field(t('fu.f.level'), c);
    var h = el('input'); h.type = 'number'; h.min = 1; h.max = 60; h.value = draft.hours; h.inputMode = 'numeric'; h.disabled = working;
    h.addEventListener('input', function () { draft.hours = h.value; });
    field(t('fu.f.hours'), h);
    var row = el('div', 'fu-btns');
    var go = el('button', 'btn', t('fu.f.go')); go.type = 'button'; go.id = 'fuGo'; go.disabled = working; go.addEventListener('click', create);
    row.appendChild(go);
    if (working) { var sp = el('button', 'btn alt', t('ask.stop')); sp.type = 'button'; sp.addEventListener('click', function () { if (ctl) ctl.abort(); }); row.appendChild(sp); }
    box.appendChild(row);
    box.appendChild(msgLine());
    return box;
  }
  function msgLine() { var m = el('p', 'fu-msg' + (msgBad ? ' bad' : ''), msgText); m.id = 'fuMsg'; m.setAttribute('aria-live', 'polite'); return m; }

  /* every goal on one road: a row each, nearest first */
  function overviewSheet() {
    var box = el('div', 'fu-list');
    st.goals.slice().sort(function (a, b) { return daysTo(a.date) - daysTo(b.date); }).forEach(function (g) {
      var b = el('button', 'fu-row'); b.type = 'button'; b.style.setProperty('--gh', g.hue);
      var top = el('span', 'r-top'); top.appendChild(el('b', '', g.title)); top.appendChild(el('span', 'r-pct', t('fu.progress', { p: pct(g) })));
      b.appendChild(top);
      b.appendChild(el('small', '', fmtD(g.date, true) + ' · ' + daysLeft(g)));
      var cs = g.stages[curIndex(g)]; if (cs) b.appendChild(el('span', 'r-now', t('fu.ov.next', { label: cs.label })));
      b.addEventListener('click', function () { st.sel = g.id; save(); render(true); });
      box.appendChild(b);
    });
    return box;
  }

  function faceSelect(g) {
    var faces = (window.TFApp && TFApp.faces()) || [];
    var sel = el('select', 'fu-face'); sel.setAttribute('aria-label', t('fu.putTo'));
    var want = g.face && faces.some(function (f) { return f.key === g.face; }) ? g.face : (window.TFApp && TFApp.cur());
    faces.forEach(function (f) { var o = el('option', '', f.name); o.value = f.key; if (f.key === want) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', function () { g.face = sel.value; save(); });
    return sel;
  }

  function stageSheet(g, i) {
    var s = g.stages[i], ci = curIndex(g), box = el('div', 'fu-stage');
    var head = el('div', 'fs-h');
    head.appendChild(el('b', '', s.label));
    head.appendChild(el('small', '', range(s) + ' · ' + t('fu.kind.' + s.kind) + (i === ci ? ' · ' + t('fu.here') : '')));
    box.appendChild(head);
    if (s.tasks.length) {
      var ul = el('ul', 'st-tasks');
      s.tasks.forEach(function (x) {
        var li = el('li', x.done ? 'done' : '');
        var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!x.done; cb.setAttribute('aria-label', t('fu.doneAria', { t: x.t }));
        cb.addEventListener('change', function () { x.done = cb.checked; save(); render(false); });
        li.appendChild(cb); li.appendChild(el('span', 't', x.t));
        if (x.pushed) li.appendChild(el('em', 'st-pushed', t('fu.pushed')));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    } else {
      box.appendChild(el('p', 'fs-note', t('fu.noTasks') + ' ' + t('fu.fuzzy')));
    }
    if (i === ci && s.tasks.some(function (x) { return !x.done && !x.pushed; })) {
      var row = el('div', 'st-put'), sel = faceSelect(g);
      var b = el('button', 'btn sm fu-put', t('fu.put')); b.type = 'button';
      b.addEventListener('click', function () {
        if (!window.TFApp) return;
        var key = sel.value, todo = s.tasks.filter(function (x) { return !x.done && !x.pushed; });
        Promise.all(todo.map(function (x) { return TFApp.addTodo(key, x.t).then(function () { x.pushed = true; }); })).then(function () {
          save(); setMsg(t('fu.putDone', { n: todo.length, name: TFApp.faceName(key) })); render(false);
        });
      });
      row.appendChild(sel); row.appendChild(b); box.appendChild(row);
    }
    return box;
  }

  function goalSheet(g) {
    var box = el('div', 'fu-goal'); box.style.setProperty('--gh', g.hue);
    var strip = el('div', 'fg-strip');
    var l = el('div', 'fg-l'); l.appendChild(el('b', '', g.title)); l.appendChild(el('small', '', fmtD(g.date, true) + ' · ' + daysLeft(g)));
    strip.appendChild(l); strip.appendChild(el('span', 'fg-pct', t('fu.progress', { p: pct(g) })));
    box.appendChild(strip);
    if (g.stages.length && curIndex(g) < g.stages.length) box.appendChild(stageSheet(g, shownIndex(g)));
    // earlier stages, the re-plan and delete buttons
    var ci = curIndex(g), passed = g.stages.slice(0, ci), missed = passed.reduce(function (a, s) { return a + s.tasks.filter(function (x) { return !x.done; }).length; }, 0);
    if (missed) box.appendChild(el('p', 'fu-miss', t('fu.missed', { n: missed })));
    var more = el('details', 'fu-more'); more.appendChild(el('summary', '', t('fu.manage')));
    if (g.summary) more.appendChild(el('p', 'fs-note', g.summary));
    if (passed.length) more.appendChild(el('p', 'fs-note', t('fu.passed', { n: passed.length })));
    var row = el('div', 'fu-btns');
    var rp = el('button', 'btn alt sm', t('fu.replan')); rp.type = 'button'; rp.disabled = working; rp.addEventListener('click', function () { replan(g); });
    var del = el('button', 'btn alt sm', t('fu.delete')); del.type = 'button';
    del.addEventListener('click', function () {
      if (!confirm(t('fu.deleteConfirm', { title: g.title }))) return;
      st.goals = st.goals.filter(function (x) { return x !== g; }); st.sel = st.goals.length > 1 ? 'all' : (st.goals[0] ? st.goals[0].id : 'new'); save(); render(true);
    });
    row.appendChild(rp); row.appendChild(del); more.appendChild(row);
    if (missed) more.open = true;
    box.appendChild(more);
    box.appendChild(msgLine());
    return box;
  }

  function render(intro) {
    if (st.sel !== 'all' && st.sel !== 'new' && !st.goals.some(function (g) { return g.id === st.sel; })) st.sel = st.goals.length > 1 ? 'all' : (st.goals[0] ? st.goals[0].id : 'new');
    if (st.goals.length === 1 && st.sel === 'all') st.sel = st.goals[0].id;
    if (!st.goals.length) st.sel = 'new';
    renderTabs();
    var md = mode();
    panel.dataset.mode = md;
    scene.className = 'fu-scene' + (working ? ' working' : '');
    drawScene(intro);
    sheet.textContent = '';
    sheet.appendChild(md === 'ghost' ? formView() : md === 'all' ? overviewSheet() : goalSheet(curGoal()));
    var cs = sheet.querySelector('.fu-stage'); if (cs && !intro) { /* keep scroll */ }
  }

  /* ---------- open / close ---------- */
  var btn = document.getElementById('fuBtn');
  function open() { panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); document.body.classList.add('fu-open'); render(true); var c = document.getElementById('fuClose'); if (c) c.focus(); }
  function close() { panel.hidden = true; stopLoop(); btn.setAttribute('aria-expanded', 'false'); document.body.classList.remove('fu-open'); btn.focus(); }
  btn.addEventListener('click', function () { panel.hidden ? open() : close(); });
  document.getElementById('fuClose').addEventListener('click', close);
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  if (window.ResizeObserver) {
    var last = '', pend = 0;
    new ResizeObserver(function () {
      if (panel.hidden) return;
      var k = scene.clientWidth + 'x' + scene.clientHeight; if (k === last) return; last = k;
      if (pend) cancelAnimationFrame(pend);
      pend = requestAnimationFrame(function () { pend = 0; drawScene(false); });
    }).observe(scene);
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopLoop(); else startLoop(); });
  window.openFuture = open;
})();
