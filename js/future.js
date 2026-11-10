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
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} try { document.dispatchEvent(new Event('tf-goals')); } catch (e) {} }

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
  /* How far along is a goal? Each stage has a time budget (hours a week x its length). A stage is filled by the minutes you
   * studied on the goal's subject (tf-hist, written by the timer) or by its ticked tasks, whichever is further along.
   * The goal's progress is the filled share of all the planned time. */
  var histMemo = null;
  function hist() { if (!histMemo) histMemo = GoalMath.hist(); return histMemo; }
  function studied(g, s) { return GoalMath.studied(g, s, hist()); }
  function budget(g, s) { return GoalMath.budget(g, s); }
  function fillOf(g, s) { return GoalMath.fillOf(g, s, hist()); }
  function progress(g) { return GoalMath.progress(g, hist()); }
  function pct(g) { return Math.round(progress(g) * 100); }
  function fmtMin(m) {
    m = Math.round(m);
    if (m < 60) return t('dur', { n: m, u: t('unit.min') });
    var h = Math.floor(m / 60), r = m % 60;
    return t('dur', { n: h, u: t('unit.hour') }) + (r ? ' ' + t('dur', { n: r, u: t('unit.min') }) : '');
  }
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
      hours: Math.max(1, Math.min(60, parseInt(draft.hours, 10) || 5)), hue: HUES[st.goals.length % HUES.length], created: iso(startOfToday()), stages: [], doneBefore: 0,
      face: window.TFApp ? TFApp.cur() : '' };
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
      g.doneBefore = done(g);
      var td = iso(startOfToday()), cm = g.credit ? g.credit.m : 0, cb = g.credit ? g.credit.b : 0;
      g.stages.forEach(function (s0) {                     // what the old plan had already earned, so progress is not thrown away
        if (s0.from > td) return;
        var b0 = budget(g, s0), len = nDays(parse(s0.from), parse(s0.to)) + 1, el0 = Math.min(1, (nDays(parse(s0.from), startOfToday()) + 1) / len), f0 = fillOf(g, s0) * b0;
        cm += f0; cb += Math.max(f0, b0 * el0);
      });
      g.credit = { m: cm, b: cb };
      apply(g, sl, raw); delete picked[g.id];
      working = false; ctl = null; setMsg(''); save(); render(true);
    }, fail);
  }

  /* ================= the road ================= */
  /* The goals are Dodeca dice (js/dodeca.js), painted on one canvas laid over the SVG. Each goal keeps an invisible round hit area in the SVG, which takes the clicks and the focus. */
  var dice = [], raf = 0, dieCv = null, dieCtx = null, dpr = 1, sceneT0 = 0, sceneArrive = false, lastTm = 0;
  var darkMq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function isLight() { var th = document.documentElement.getAttribute('data-theme'); return th === 'light' || (th !== 'dark' && !(darkMq && darkMq.matches)); }
  function roomHue() { var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--h')); return isNaN(v) ? 215 : v; }
  function makeDie(parent, o) {            // o: x, y(centre), r, lit (0..12), ghost, phase, id, hue
    var g = sv('g', { class: 'die' + (o.ghost ? ' ghost' : ''), 'data-lit': o.lit }, parent);
    sv('circle', { class: 'hit', cx: o.x, cy: o.y, r: (o.r * 1.12).toFixed(1) }, g);
    var d = { g: g, o: o, style: Dodeca.styleOf(o.id), hl: 0, hot: false };
    dice.push(d); return d;
  }
  function drawDice(tm, dt) {
    if (!dieCtx) return;
    var W = dieCv.width / dpr, H = dieCv.height / dpr, light = isLight(), k = 1 - Math.exp(-dt * 9), pulse = 1;
    var arrive = sceneArrive ? Math.min(1, Math.max(0, (tm - sceneT0) / 900)) : 1;       // the goal fades in once, when the road opens
    if (scene.classList.contains('working') && !reduced) { var ph = (tm % 2400) / 2400, tri = ph < 0.5 ? ph * 2 : 2 - ph * 2; pulse = 0.45 + 0.55 * tri * tri * (3 - 2 * tri); }   // and breathes while the AI is busy
    dieCtx.setTransform(dpr, 0, 0, dpr, 0, 0); dieCtx.clearRect(0, 0, W, H);
    dice.forEach(function (d) {
      var o = d.o; d.hl += ((d.hot ? 1 : 0) - d.hl) * k;
      Dodeca.paint(dieCtx, { x: o.x, y: o.y + (reduced ? 0 : Math.sin(tm / 760 + o.phase * 2) * 3), r: o.r, spin: tm * 0.00032 + o.phase, style: d.style, hl: d.hl, lit: o.lit, ghost: o.ghost ? 1 : 0,
        hue: o.hue, sat: light ? 78 : 75, lum: light ? 62 : 66, light: light, alpha: arrive * (2 - arrive) * pulse });
    });
  }
  function loop(tm) { var dt = Math.min(0.05, (tm - (lastTm || tm)) / 1000); lastTm = tm; drawDice(tm, dt); raf = requestAnimationFrame(loop); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; lastTm = 0; }
  function startLoop() {
    stopLoop();
    if (!dice.length || panel.hidden) return;
    if (reduced) { drawDice(0, 0); return; }
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
        var sm = sOf((ya + yb) / 2), fl = fillOf(g, s), full = fl >= 0.999;
        var grp = sv('g', { class: 'band' + (i === ci ? ' cur' : '') + (i === sel ? ' sel' : '') + (full ? ' full' : '') + (i % 2 ? ' odd' : ''), tabindex: 0, role: 'button',
          'aria-label': t('fu.stageAria', { label: s.label, range: range(s) }), 'aria-pressed': i === sel ? 'true' : 'false' }, svg);
        grp.style.setProperty('--bh', Countdown.journeyHue(g.hue, i, g.stages.length));
        grp.style.setProperty('--n', String(count - 1 - k)); grp.style.setProperty('--dy', (-(sOf(ya)) * span * 0.6).toFixed(0) + 'px');
        sv('polygon', { points: (cx - half(ya)) + ',' + ya + ' ' + (cx + half(ya)) + ',' + ya + ' ' + (cx + half(yb)) + ',' + yb + ' ' + (cx - half(yb)) + ',' + yb }, grp);
        if (fl > 0.01 && !full) {                          // the part of this stage already walked, filled from the near edge
          var yf = ya - h * fl;
          sv('polygon', { class: 'bfill', style: 'stroke:none;pointer-events:none', points: (cx - half(ya)) + ',' + ya + ' ' + (cx + half(ya)) + ',' + ya + ' ' + (cx + half(yf)) + ',' + yf + ' ' + (cx - half(yf)) + ',' + yf }, grp);
        }
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
    function goalDie(x, ground, r, lit, label, ghost, phase, onClick, id, hue) {
      sv('ellipse', { cx: x, cy: ground, rx: r * 1.25, ry: r * 0.28, fill: 'url(#fuShadow)' }, svg);
      sv('circle', { cx: x, cy: ground - r * 1.05, r: r * 1.7, class: 'halo', opacity: ghost ? 0.25 : (0.35 + 0.65 * lit / 12).toFixed(2), fill: 'url(#fuGlow)' }, svg);
      var d = makeDie(svg, { x: x, y: ground - r * 1.05, r: r, lit: lit, ghost: ghost, phase: phase, id: id, hue: hue });
      if (onClick) {
        d.g.setAttribute('tabindex', 0); d.g.setAttribute('role', 'button'); d.g.setAttribute('aria-label', label);
        d.g.addEventListener('click', onClick);
        ['pointerenter', 'focus'].forEach(function (ev) { d.g.addEventListener(ev, function () { d.hot = true; }); });
        ['pointerleave', 'blur'].forEach(function (ev) { d.g.addEventListener(ev, function () { d.hot = false; }); });
        d.g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } });
      }
      return d;
    }
    if (md === 'goal') {
      var yG = yOf(daysTo(g.date)), rG = die.r;
      goalDie(cx, yG, rG, Math.round(pct(g) / 100 * 12), g.title, false, 0.6, null, 'g:' + g.id, g.hue);
      var tt = sv('text', { x: cx, y: Math.max(14, yG - rG * 2.2 - 13), class: 'goal-t', 'text-anchor': 'middle', 'font-size': 14 }, svg);
      fit(tt, g.title, W - 28);
    } else if (md === 'all') {
      sorted.forEach(function (x, j) {
        var yG = yOf(daysTo(x.date)), r = 20 + 26 * sOf(yG), side = j % 2 ? 1 : -1, px = cx + side * half(yG) * 0.42;
        goalDie(px, yG, r, Math.round(pct(x) / 100 * 12), x.title, false, j * 1.3, function () { st.sel = x.id; save(); render(true); }, 'g:' + x.id, x.hue);
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
      goalDie(cx, yGh, rGh, 0, '', true, 0.6, null, 'ghost', roomHue());
      var gt = sv('text', { x: cx, y: Math.max(16, yGh - rGh * 2.2 - 13), class: 'goal-t', 'text-anchor': 'middle', 'font-size': 15 }, svg);
      gt.textContent = t('fu.ghost');
    }

    // you are here
    var here = sv('g', { class: 'here' }, svg);
    sv('circle', { cx: cx, cy: yNow, r: 7, class: 'ping' }, here);
    sv('circle', { cx: cx, cy: yNow, r: 5.5, class: 'pt' }, here);
    var ht = sv('text', { x: cx, y: yNow + 20, class: 'here-t', 'text-anchor': 'middle', 'font-size': 11.5 }, svg); ht.textContent = t('fu.now');

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    dieCv = document.createElement('canvas'); dieCv.className = 'fu-dice'; dieCv.width = Math.round(W * dpr); dieCv.height = Math.round(H * dpr); dieCv.setAttribute('aria-hidden', 'true');
    scene.appendChild(dieCv); dieCtx = dieCv.getContext('2d');
    sceneArrive = !!intro && !reduced; sceneT0 = window.performance.now();
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
    box.appendChild(Countdown.pill({ icon: s.kind, label: s.label, sub: t('fu.kind.' + s.kind), days: daysTo(s.to),
      date: range(s), hue: Countdown.journeyHue(g.hue, i, g.stages.length), state: (i === ci ? 'cur ' : i < ci ? 'past ' : '') + 'sm', fill: fillOf(g, s) }));
    var bud = budget(g, s);
    box.appendChild(el('p', 'fs-studied', t('fu.studied', { a: fmtMin(studied(g, s)), b: fmtMin(bud) })));
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
    if (!g.face && window.TFApp) { g.face = TFApp.cur(); save(); }
    box.appendChild(Countdown.pill({ icon: 'goal', label: g.title, sub: t('fu.progress', { p: pct(g) }), days: daysTo(g.date), date: fmtD(g.date, true),
      hue: Countdown.journeyHue(g.hue, 1, 1), state: 'goal', fill: progress(g) }));
    if (g.stages.length && curIndex(g) < g.stages.length) { box.appendChild(el('i', 'fu-link')); box.appendChild(stageSheet(g, shownIndex(g))); }
    // earlier stages, the re-plan and delete buttons
    var ci = curIndex(g), passed = g.stages.slice(0, ci), missed = passed.reduce(function (a, s) { return a + s.tasks.filter(function (x) { return !x.done; }).length; }, 0);
    if (missed) box.appendChild(el('p', 'fu-miss', t('fu.missed', { n: missed })));
    var more = el('details', 'fu-more'); more.appendChild(el('summary', '', t('fu.manage')));
    if (g.summary) more.appendChild(el('p', 'fs-note', g.summary));
    var cf = el('label', 'fu-field fu-count'); cf.appendChild(el('span', '', t('fu.countFrom'))); cf.appendChild(faceSelect(g)); more.appendChild(cf);
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
    histMemo = null;
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
  /* a link from the universe page: index.html#future/<goalId> opens that goal's road ("#future/new" opens the form) */
  function fromHash() {
    var m = /^#future(?:\/([\w-]+))?$/.exec(location.hash || '');
    if (!m) return;
    if (m[1] === 'new') st.sel = 'new'; else if (m[1] && st.goals.some(function (g) { return g.id === m[1]; })) st.sel = m[1];
    open();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
