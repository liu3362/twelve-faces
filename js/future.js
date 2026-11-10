/* future.js — "Beyond today": a road from the future down to now.
 * You stand at the bottom. The road runs away from you in true perspective, so the next weeks are big and sharp and a whole
 * year out is squeezed toward the horizon, faint and broad. The goal floats there as a slowly turning dodecahedron; its twelve
 * faces light up as you finish tasks (or, if you ask, carry the next twelve things to do).
 * You can walk the road: the wheel, a drag, the arrow keys or a tap on any stage's name (on the road or on the die) moves the camera forward or back.
 * The stage you are in is below the road, where its tasks (as many as you like) and the stage itself can be added to, edited, moved and deleted.
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
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

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
  function shownIndex(g) {                      // the stage shown below the road: the one you picked, else the one you are in
    var ci = curIndex(g), i = picked[g.id];
    if (i == null || i < 0 || i >= g.stages.length) i = Math.min(ci, g.stages.length - 1);
    return i;
  }
  function kindFor(from, to) {                  // what to call a stage you drew yourself, by its length
    var n = nDays(parse(from), parse(to)) + 1;
    return n <= 10 ? 'week' : n <= 45 ? 'month' : n <= 120 ? 'quarter' : 'half';
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
      var tasks = (Array.isArray(x.tasks) ? x.tasks : []).slice(0, 8)
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

  /* ask the AI for more tasks for one stage: how a broad stage becomes something you can do */
  function moreTasks(g, i) {
    if (working) return;
    var s = g.stages[i], have = s.tasks.map(function (x) { return x.t; });
    var prompt = t('fu.more.prompt', { today: iso(startOfToday()), goal: g.title, date: g.date, level: g.level || t('none'), hours: g.hours, stage: s.label,
      kind: t('fu.kind.' + s.kind), from: s.from, to: s.to, have: have.length ? have.slice(0, 40).join('; ') : t('none'), n: 6, lang: t('lang.name') });
    ctl = new AbortController(); working = true; setMsg(t('fu.working')); render(false);
    AI.json({ system: t('fu.sys'), messages: [{ role: 'user', content: prompt }], maxTokens: 1500, signal: ctl.signal, idleMs: 60000 }).then(function (raw) {
      var seen = {}; have.forEach(function (z) { seen[z.toLowerCase()] = 1; });
      var fresh = (raw && Array.isArray(raw.tasks) ? raw.tasks : []).map(function (z) { return String(z || '').trim().slice(0, 100); })
        .filter(function (z) { if (!z || seen[z.toLowerCase()]) return false; seen[z.toLowerCase()] = 1; return true; }).slice(0, 12);
      working = false; ctl = null;
      if (!fresh.length) { setMsg(raw && Array.isArray(raw.tasks) && raw.tasks.length ? t('fu.moreNone') : t('fu.fail'), true); render(false); return; }
      fresh.forEach(function (z) { s.tasks.push({ id: uid(), t: z, done: false, pushed: false }); });
      setMsg(t('fu.moreDone', { n: fresh.length })); save(); render(false);
    }, fail);
  }

  /* ================= the road ================= */
  /* The sky, floor, road and bands are one SVG. What depends on where you stand (the lane marks, the bands, the goals) is the group gDyn, redrawn as the camera moves.
   * The goals are Dodeca dice (js/dodeca.js) painted on a canvas laid over the SVG; each keeps an invisible round hit area in the SVG (gHit), which takes the clicks and the focus.
   * The camera: cam.c is where you stand, in days from today (negative = back among the stages already behind you). cam.t is where it is heading. */
  var dice = [], raf = 0, dieCv = null, dieCtx = null, dpr = 1, sceneT0 = 0, sceneArrive = false, lastTm = 0, introT = 0;
  var geo = null, gDyn = null, gHit = null, camBtn = null, facesBtn = null, cams = {}, hintGone = false, famBody = 'system-ui, sans-serif', famHead = famBody, facesOn = false;
  try { hintGone = localStorage.getItem('tf-fu-hint') === '1'; facesOn = localStorage.getItem('tf-fu-faces') === '1'; } catch (e) {}
  var darkMq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function isLight() { var th = document.documentElement.getAttribute('data-theme'); return th === 'light' || (th !== 'dark' && !(darkMq && darkMq.matches)); }
  function roomHue() { var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--h')); return isNaN(v) ? 215 : v; }
  function readFonts() { var cs = getComputedStyle(document.body); famBody = cs.getPropertyValue('--f-body').trim() || 'system-ui, sans-serif'; famHead = cs.getPropertyValue('--f-head').trim() || famBody; }

  /* text widths are measured on a canvas (not in the SVG), so redrawing the road while it moves never forces a layout */
  var mctx = null, mwid = {}, mcount = 0;
  function textW(str, fs, wt, fam) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    var k = wt + '|' + fs + '|' + str, w = mwid[k];
    if (w == null) { mctx.font = wt + ' ' + fs + 'px ' + fam; w = mwid[k] = mctx.measureText(str).width; if (++mcount > 3000) { mwid = {}; mcount = 0; } }
    return w;
  }
  function fit(node, str, maxW, fs, wt, fam) {         // shorten a text to a width; gives back the width it ended up with (0 = nothing fits)
    var w = textW(str, fs, wt, fam);
    if (w <= maxW) { node.textContent = str; return w; }
    var lo = 0, hi = str.length;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (textW(str.slice(0, mid) + '…', fs, wt, fam) <= maxW) lo = mid; else hi = mid - 1; }
    if (lo < 1) { node.textContent = ''; return 0; }
    node.textContent = str.slice(0, lo) + '…'; return textW(str.slice(0, lo) + '…', fs, wt, fam);
  }

  /* the dice: one object per goal for as long as the scene lives, so each keeps its look, its highlight and its hit area while the road moves */
  function dieFor(id, ghost) {
    for (var i = 0; i < dice.length; i++) if (dice[i].id === id) return dice[i];
    var hit = sv('g', { class: 'die' + (ghost ? ' ghost' : '') }, gHit); sv('circle', { class: 'hit' }, hit);
    var d = { id: id, g: hit, o: { x: 0, y: 0, r: 1, lit: 0, ghost: ghost, phase: 0, hue: 215 }, style: Dodeca.styleOf(id), hl: 0, hot: false, wired: false, click: null, labels: null, front: -1, pk: {} };
    dice.push(d); return d;
  }
  function placeDie(d, o, label, click) {
    d.o = o; d.click = click; var hit = d.g.firstChild;
    d.g.setAttribute('data-lit', o.lit); hit.setAttribute('cx', o.x.toFixed(1)); hit.setAttribute('cy', o.y.toFixed(1)); hit.setAttribute('r', (o.r * (facesOn && geo && geo.md === 'goal' && d.style === 'E' ? 2.1 : 1.12)).toFixed(1));   // (the twelve stars put their words beside them, so a wider area)
    if (click) {
      if (!d.wired) {
        d.wired = true;
        d.g.addEventListener('click', function (e) { if (d.click) d.click(e); });
        ['pointerenter', 'focus'].forEach(function (ev) { d.g.addEventListener(ev, function () { d.hot = true; }); });
        ['pointerleave', 'blur'].forEach(function (ev) { d.g.addEventListener(ev, function () { d.hot = false; }); });
        d.g.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && d.click) { e.preventDefault(); d.click(); } });
      }
      d.g.setAttribute('tabindex', 0); d.g.setAttribute('role', 'button'); d.g.setAttribute('aria-label', label);
    } else { d.g.removeAttribute('tabindex'); d.g.removeAttribute('role'); d.g.removeAttribute('aria-label'); d.hot = false; }
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
        hue: o.hue, sat: light ? 78 : 75, lum: light ? 62 : 66, light: light, alpha: arrive * (2 - arrive) * pulse, labels: d.labels, font: famBody, labelOut: d.pk });
      d.front = d.pk.front == null ? -1 : d.pk.front;
    });
  }

  /* the next things to do, nearest first: a stage's open tasks, or the stage itself while it has none. The faces of the die can carry these. */
  function nextItems(g, n) {
    var out = [], ci = curIndex(g);
    for (var i = ci; i < g.stages.length && out.length < n; i++) {
      var s = g.stages[i];
      if (!s.tasks.length) out.push({ text: s.label, stage: i });
      else s.tasks.forEach(function (x) { if (!x.done && out.length < n) out.push({ text: x.t, stage: i }); });
    }
    return out;
  }

  /* ---------- the camera ---------- */
  function camOf(g) { return cams[g.id] || (cams[g.id] = { c: 0, t: 0, v: 0, k: 12, drawn: NaN, drag: false }); }
  function perPx() { return geo ? geo.kk / geo.span : 0.2; }                      // days the road moves for a pixel of drag, at your feet
  function clampC(v) { return clamp(v, geo.cMin, geo.cMax); }
  function seenHint() { hintGone = true; try { localStorage.setItem('tf-fu-hint', '1'); } catch (e) {} }
  function poke() {                                                               // something moved the camera: the loop redraws; with reduced motion it is done here and now
    scene.classList.remove('intro');
    if (reduced && geo && geo.g) { var cm = camOf(geo.g); cm.c = cm.t; drawDyn(); drawDice(0, 0); }
  }
  function nudge(days) { if (!geo || geo.md !== 'goal') return; var cm = camOf(geo.g); cm.k = 12; cm.v = 0; cm.t = clampC(cm.t + days); seenHint(); poke(); }
  function flyTo(c) { if (!geo || geo.md !== 'goal') return; var cm = camOf(geo.g); cm.k = 7; cm.v = 0; cm.t = clampC(c); poke(); }
  function stepCam(dt) {
    var cm = camOf(geo.g);
    if (!cm.drag) {
      if (cm.v) { cm.t = clampC(cm.t + cm.v * dt); cm.v *= Math.exp(-dt * 4); if (Math.abs(cm.v) < 0.5 * perPx() || cm.t <= geo.cMin || cm.t >= geo.cMax) cm.v = 0; }
      if (cm.c !== cm.t) cm.c = Math.abs(cm.t - cm.c) < 0.004 * Math.max(1, geo.kk) ? cm.t : cm.c + (cm.t - cm.c) * (1 - Math.exp(-dt * cm.k));
    }
    if (cm.c !== cm.drawn) drawDyn();
  }
  /* tap a stage (its band, or its name on the road, or the word on the die): the camera walks there and the stage opens below */
  function enter(i) {
    var g = curGoal(); if (!g || !g.stages[i]) return;
    picked[g.id] = i;
    var s = g.stages[i], dA = daysTo(s.from), dB = daysTo(s.to);
    if (geo && geo.md === 'goal') { seenHint(); flyTo(dA > 0 ? dA : dB >= 0 ? 0 : dA); drawDyn(); }
    renderSheet(false); sheet.scrollTop = 0;
  }

  var drag = null, dragged = false;
  scene.addEventListener('wheel', function (e) {                                  // wheel forward = walk on toward the goal, wheel back = walk back
    if (!geo || geo.md !== 'goal' || panel.hidden) return;
    e.preventDefault();
    nudge(-e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? geo.H : 1) * perPx() * 0.9);
  }, { passive: false });
  scene.addEventListener('pointerdown', function (e) {
    if (!geo || geo.md !== 'goal' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    dragged = false; drag = { id: e.pointerId, y0: e.clientY, c0: camOf(geo.g).c, moved: false, v: 0, ly: e.clientY, lt: performance.now() };
  });
  scene.addEventListener('pointermove', function (e) {                            // grab the road and pull it toward you: you walk forward
    if (!drag || e.pointerId !== drag.id || !geo || geo.md !== 'goal') return;
    var dy = e.clientY - drag.y0, cm = camOf(geo.g);
    if (!drag.moved) {
      if (Math.abs(dy) < 6) return;
      drag.moved = true; cm.drag = true; cm.v = 0; scene.classList.add('drag'); seenHint();
      try { scene.setPointerCapture(e.pointerId); } catch (x) {}
    }
    var now = performance.now(), dtm = Math.max(0.001, (now - drag.lt) / 1000);
    drag.v = 0.6 * drag.v + 0.4 * ((e.clientY - drag.ly) * perPx() / dtm); drag.ly = e.clientY; drag.lt = now;
    cm.c = cm.t = clampC(drag.c0 + dy * perPx()); poke();
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    if (drag.moved && geo && geo.g) {
      var cm = camOf(geo.g);
      dragged = true; setTimeout(function () { dragged = false; }, 80);
      cm.drag = false; scene.classList.remove('drag'); cm.k = 12;
      cm.v = reduced || performance.now() - drag.lt > 120 ? 0 : clamp(drag.v, -geo.kk * 6, geo.kk * 6);       // a flick glides on; a drag that had stopped does not
    }
    drag = null;
  }
  scene.addEventListener('pointerup', endDrag); scene.addEventListener('pointercancel', endDrag);
  scene.addEventListener('click', function (e) { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);   // a drag is not a tap
  scene.addEventListener('keydown', function (e) {
    if (!geo || geo.md !== 'goal' || e.altKey || e.ctrlKey || e.metaKey) return;
    var k = e.key;
    if (k === 'ArrowUp') nudge(geo.kk * 0.25); else if (k === 'ArrowDown') nudge(-geo.kk * 0.25);
    else if (k === 'PageUp') nudge(geo.kk); else if (k === 'PageDown') nudge(-geo.kk);
    else if (k === 'Home') flyTo(0); else if (k === 'End') flyTo(geo.cMax);
    else return;
    e.preventDefault();
  });

  var MARKS = [[7, 'fu.m.w1'], [30, 'fu.m.m1'], [91, 'fu.m.m3'], [182, 'fu.m.m6'], [365, 'fu.m.y1'], [730, 'fu.m.y2']];
  function mode() { return st.sel === 'new' ? 'ghost' : st.sel === 'all' ? 'all' : 'goal'; }
  function curGoal() { return st.goals.filter(function (x) { return x.id === st.sel; })[0]; }

  function buildControls() {                      // two small things in the corners of the road: the way back to today, and the switch for words on the die
    camBtn = el('button', 'fu-cam'); camBtn.type = 'button'; camBtn.hidden = true;
    camBtn.addEventListener('click', function () { if (camBtn.dataset.act === 'today') flyTo(0); });
    scene.appendChild(camBtn);
    facesBtn = el('button', 'fu-faces', t('fu.faces')); facesBtn.type = 'button'; facesBtn.setAttribute('aria-pressed', facesOn ? 'true' : 'false');
    facesBtn.addEventListener('click', function () {
      facesOn = !facesOn; try { localStorage.setItem('tf-fu-faces', facesOn ? '1' : '0'); } catch (e) {}
      facesBtn.setAttribute('aria-pressed', facesOn ? 'true' : 'false'); drawDyn(); if (reduced) drawDice(0, 0);
    });
    scene.appendChild(facesBtn);
  }

  function drawScene(intro) {
    stopLoop(); dice = []; scene.textContent = ''; scene.classList.remove('intro'); geo = gDyn = gHit = camBtn = facesBtn = null; clearTimeout(introT);
    var W = scene.clientWidth, H = scene.clientHeight;
    if (W < 120 || H < 120) return;
    readFonts();
    var md = mode(), g = md === 'goal' ? curGoal() : null;
    var gs = md === 'goal' ? [g] : md === 'all' ? st.goals : [];
    if (g) scene.style.setProperty('--gh', g.hue); else scene.style.removeProperty('--gh');
    if (md === 'goal') scene.setAttribute('tabindex', '0'); else scene.removeAttribute('tabindex');

    var cx = W / 2, yHor = Math.round(H * 0.27), yNow = H - 26, span = yNow - yHor, halfNear = W * 0.43;
    var dMax = gs.reduce(function (m, x) { return Math.max(m, daysTo(x.date)); }, 0) || 120;
    var kk = Math.max(6, dMax / 7.33);                // the goal's date always lands near the horizon, so the road fills the view
    geo = { W: W, H: H, cx: cx, yHor: yHor, yNow: yNow, span: span, halfNear: halfNear, dMax: dMax, kk: kk, md: md, g: g, gs: gs, cMin: 0, cMax: 0 };
    if (g) {                                           // how far back and forward you can walk: to the first stage, and up to the goal
      geo.cMin = Math.min(0, g.stages.length ? daysTo(g.stages[0].from) : 0); geo.cMax = Math.max(0, dMax - 3);
      var cm = camOf(g); if (intro) { cm.c = cm.t = 0; cm.v = 0; cm.k = 12; cm.drag = false; }
      cm.c = clampC(cm.c); cm.t = clampC(cm.t); cm.drawn = NaN;
    }

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
    var yB = H, hB = 3 + halfNear * (yB - yHor) / span;                          // the road itself
    sv('polygon', { points: (cx - 3) + ',' + yHor + ' ' + (cx + 3) + ',' + yHor + ' ' + (cx + hB) + ',' + yB + ' ' + (cx - hB) + ',' + yB, fill: 'url(#fuRoad)' }, svg);
    sv('line', { x1: cx - 3, y1: yHor, x2: cx - hB, y2: yB, class: 'edge' }, svg);
    sv('line', { x1: cx + 3, y1: yHor, x2: cx + hB, y2: yB, class: 'edge' }, svg);
    gDyn = sv('g', { class: 'dyn' }, svg); gHit = sv('g', { class: 'hits' }, svg);

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    dieCv = document.createElement('canvas'); dieCv.className = 'fu-dice'; dieCv.width = Math.round(W * dpr); dieCv.height = Math.round(H * dpr); dieCv.setAttribute('aria-hidden', 'true');
    scene.appendChild(dieCv); dieCtx = dieCv.getContext('2d');
    if (md === 'goal') buildControls();
    sceneArrive = !!intro && !reduced; sceneT0 = window.performance.now();
    if (intro && !reduced) { scene.classList.add('intro'); introT = setTimeout(function () { scene.classList.remove('intro'); }, 1900); }
    drawDyn();
    startLoop();
  }

  function drawDyn() {
    var G = geo; if (!G || !gDyn) return;
    var W = G.W, H = G.H, cx = G.cx, yHor = G.yHor, yNow = G.yNow, span = G.span, kk = G.kk, md = G.md, g = G.g, dMax = G.dMax;
    var cm = g ? camOf(g) : null, c = cm ? cm.c : 0; if (cm) cm.drawn = c;
    var ae = document.activeElement, refocus = ae && gDyn.contains(ae) && ae.getAttribute && ae.getAttribute('data-i') != null ? +ae.getAttribute('data-i') : -1, bandEl = {};
    gDyn.textContent = '';
    var svg = gDyn;
    function yOf(d) { return yHor + span / (1 + Math.max(-0.92 * kk, d - c) / kk); }       // where, on the screen, a day lands: days behind you slide off the bottom
    function half(y) { return 3 + G.halfNear * (y - yHor) / span; }
    function sOf(y) { return (y - yHor) / span; }

    var step = kk / 6, dash = sv('g', { class: 'dashes' }, svg);                           // the lane marks slide past as you walk
    for (var dd = Math.floor(c / step) * step; dd < dMax * 1.5; dd += step) {
      var ya0 = yOf(dd), yb0 = yOf(dd + step * 0.45); if (ya0 > H + 30) continue;
      sv('line', { x1: cx, y1: ya0, x2: cx, y2: yb0, 'stroke-width': (0.8 + 2.4 * sOf(ya0)).toFixed(1) }, dash);
    }

    // stages: bands across the road
    var labels = [], die = null, items = null, yG0 = 0, rG = 0, cyG = 0;
    if (g) {
      yG0 = yOf(daysTo(g.date)); rG = 44 + 22 * sOf(yG0);
      if (facesOn) { items = nextItems(g, 12); rG = Math.min(rG * 1.5, H * 0.21); }          // words on the die: it is bigger so that they can be read
      else rG = Math.max(26, Math.min(rG, (yG0 - 32) / 2.2));                                // on a short screen the die gives way, so that its name still has room above it
      cyG = facesOn ? Math.max(yG0 - rG * 1.05, rG * 1.15 + 28) : yG0 - rG * 1.05;
      die = { r: rG, top: cyG - rG * 1.15, bottom: Math.max(yG0 + 6, cyG + rG * 1.1) };
      var ci = curIndex(g), sel = shownIndex(g), nst = g.stages.length;
      g.stages.forEach(function (s, i) {
        var dA = daysTo(s.from), dB = daysTo(s.to) + 1;
        var ya = yOf(dA) - 0.8, yb = yOf(dB) + 0.8, h = ya - yb;
        if (yb > H + 2 || h < 1.2 || ya < yHor + 1) return;                                   // behind you, or too far to see
        var yaV = ya > yNow ? Math.min(ya, yNow - 5) : ya, hV = yaV - yb, mid = (yaV + yb) / 2, sm = sOf(mid), fl = fillOf(g, s), full = fl >= 0.999;
        var grp = sv('g', { class: 'band' + (i === ci ? ' cur' : '') + (i === sel ? ' sel' : '') + (full ? ' full' : '') + (i % 2 ? ' odd' : '') + (i < ci ? ' past' : ''), tabindex: 0, role: 'button', 'data-i': i,
          'aria-label': t('fu.stageAria', { label: s.label, range: range(s) }), 'aria-pressed': i === sel ? 'true' : 'false' }, svg);
        bandEl[i] = grp;
        grp.style.setProperty('--bh', Countdown.journeyHue(g.hue, i, nst));
        grp.style.setProperty('--n', String(clamp(nst - 1 - i, 0, 40))); grp.style.setProperty('--dy', (-(sOf(yaV)) * span * 0.6).toFixed(0) + 'px');
        sv('polygon', { points: (cx - half(ya)) + ',' + ya + ' ' + (cx + half(ya)) + ',' + ya + ' ' + (cx + half(yb)) + ',' + yb + ' ' + (cx - half(yb)) + ',' + yb }, grp);
        if (fl > 0.01 && !full) {                          // the part of this stage already walked, filled from the near edge
          var yf = ya - h * fl;
          sv('polygon', { class: 'bfill', style: 'stroke:none;pointer-events:none', points: (cx - half(ya)) + ',' + ya + ' ' + (cx + half(ya)) + ',' + ya + ' ' + (cx + half(yf)) + ',' + yf + ' ' + (cx - half(yf)) + ',' + yf }, grp);
        }
        grp.addEventListener('click', function () { enter(i); });
        grp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(i); } });
        var fs = Math.round(11.5 + 2.5 * sm), op = (0.5 + 0.5 * Math.min(1, sm * 2.2)).toFixed(2), nt = s.tasks.length;
        if (hV >= 17 && !(items && mid < die.bottom + 12)) {                                   // (with words on the die, what lies behind it is named in the margin)
          fs = Math.max(10, Math.min(fs, Math.floor(hV * 0.62)));
          var room = half(mid) * 2 - 22, open = s.tasks.filter(function (x) { return !x.done; }), lines = 0;
          if (open.length && hV >= 74 && room >= 96) lines = Math.min(3, open.length, Math.floor((hV - fs - 36) / 14));      // a tall band shows what is next, in words
          var hasBar = nt > 0 && hV >= 46, blockH = fs + (lines ? 4 + lines * 14 : 0) + (hasBar ? 16 : 0), y0 = mid - blockH / 2;
          var ly = lines || hasBar ? y0 + fs * 0.82 : mid + fs * 0.35, ry = ly + 4;
          var tx = sv('text', { x: cx, y: ly, class: 'lbl in', 'text-anchor': 'middle', 'font-size': fs, opacity: op }, grp);
          fit(tx, s.label, room, fs, 600, famBody);
          for (var q = 0; q < lines; q++) {
            ry += 14;
            var tk = sv('text', { x: cx, y: ry - 3, class: 'lbl tk', 'text-anchor': 'middle', 'font-size': 11, opacity: op }, grp);
            fit(tk, '○ ' + open[q].t, room, 11, 500, famBody);
          }
          if (hasBar) {
            if (nt <= 8) {                                 // one pip per task, filled when done
              var pw = (nt - 1) * 11;
              s.tasks.forEach(function (x, j) { sv('circle', { cx: cx - pw / 2 + j * 11, cy: ry + 10, r: 3.2, class: 'pip' + (x.done ? ' on' : '') }, grp); });
            } else {                                       // too many for pips: a bar and a count
              var nd = s.tasks.filter(function (x) { return x.done; }).length, bw = Math.min(96, Math.max(30, room - 36)), bx = cx - (bw + 34) / 2;
              sv('rect', { x: bx, y: ry + 8, width: bw, height: 4, rx: 2, class: 'pbar' }, grp);
              if (nd) sv('rect', { x: bx, y: ry + 8, width: bw * nd / nt, height: 4, rx: 2, class: 'pbar on' }, grp);
              var ct = sv('text', { x: bx + bw + 6, y: ry + 12.5, class: 'lbl ct', 'font-size': 10, opacity: op }, grp); ct.textContent = nd + '/' + nt;
            }
          }
        } else {
          labels.push({ grp: grp, mid: mid, edge: half(mid), s: s, fs: fs, op: op, sm: sm });
        }
        if (cx - half(yaV) > 92 && hV >= 9) {              // the date this stage begins, in the left margin when there is room
          var dt = sv('text', { x: cx - half(yaV) - 8, y: yaV - 3, class: 'dt', 'text-anchor': 'end', 'font-size': 10.5 }, grp);
          fit(dt, fmtD(s.from), 90, 10.5, 400, famBody);
        }
      });
      // stages too thin to hold a label are named in the right-hand margin, nudged apart (and tappable)
      var prev = 1e9, evenly = Math.ceil(labels.length / 5);                      // at most about five names out here, spread along the road
      labels.sort(function (a, b) { return b.mid - a.mid; }).filter(function (L, i) { return i % evenly === 0; }).forEach(function (L) {
        var y = Math.min(L.mid, prev - 15); if (y < 12) return; prev = y;
        var x0 = cx + L.edge + 12;
        if (y > die.top && y < die.bottom) x0 = Math.max(x0, cx + die.r * 1.35 + 6);   // keep clear of the floating goal
        var room = W - x0 - 8; if (room < 44) return;
        sv('line', { x1: cx + half(L.mid), y1: L.mid, x2: x0 - 3, y2: y, class: 'lead' }, L.grp);
        var tx = sv('text', { x: x0, y: y + 4, class: 'lbl out', 'font-size': 12, opacity: L.op }, L.grp), tw = fit(tx, L.s.label, room, 12, 600, famBody);
        if (tw) L.grp.insertBefore(sv('rect', { class: 'lbl-hit', x: x0 - 4, y: y - 9, width: tw + 8, height: 18 }, L.grp), tx);
      });
    }

    // distance haze
    sv('rect', { x: 0, y: yHor, width: W, height: span * 0.62, fill: 'url(#fuFog)', 'pointer-events': 'none' }, svg);

    // time marks: how far away is each line (from where you stand)
    var lastY = 1e9;
    MARKS.forEach(function (m) {
      if (m[0] > (dMax - c) * 1.05) return;
      var y = yOf(c + m[0]); if (lastY - y < 13 || y < yHor + 6) return; lastY = y;
      sv('line', { x1: 0, y1: y, x2: W, y2: y, class: 'mark' }, svg);
      var tx = sv('text', { x: 8, y: y - 3, class: 'mk', 'font-size': 10.5 }, svg); tx.textContent = t(m[1]);
    });

    // the goals: floating dodecahedra
    function goalDie(x, ground, r, lit, label, ghost, phase, onClick, id, hue, cy) {
      if (cy == null) cy = ground - r * 1.05;
      sv('ellipse', { cx: x, cy: ground, rx: r * 1.25, ry: r * 0.28, fill: 'url(#fuShadow)' }, svg);
      sv('circle', { cx: x, cy: cy, r: r * 1.7, class: 'halo', opacity: ghost ? 0.25 : (0.35 + 0.65 * lit / 12).toFixed(2), fill: 'url(#fuGlow)' }, svg);
      var d = dieFor(id, ghost); placeDie(d, { x: x, y: cy, r: r, lit: lit, ghost: ghost, phase: phase, id: id, hue: hue }, label, onClick);
      return d;
    }
    if (md === 'goal') {
      var gd = goalDie(cx, yG0, rG, Math.round(pct(g) / 100 * 12), g.title, false, 0.6, items ? function (e) {                                  // a tap on a word opens that word's stage; from the keyboard, the one facing you
        var q = gd.front, r = e && e.clientX != null && dieCv ? dieCv.getBoundingClientRect() : null;
        if (r) { var h = Dodeca.hit(gd.pk, e.clientX - r.left, e.clientY - r.top); if (h >= 0) q = h; }
        var it = items[q]; if (it) enter(it.stage);
      } : null, 'g:' + g.id, g.hue, cyG);
      gd.labels = items ? items.map(function (z) { return z.text; }) : null;
      var tt = sv('text', { x: cx, y: Math.max(15, cyG - rG * 1.15 - 13), class: 'goal-t', 'text-anchor': 'middle', 'font-size': 14 }, svg);
      fit(tt, g.title, W - 28, 14, 700, famHead);
    } else if (md === 'all') {
      G.gs.slice().sort(function (a, b) { return daysTo(a.date) - daysTo(b.date); }).forEach(function (x, j) {
        var yG = yOf(daysTo(x.date)), r = 20 + 26 * sOf(yG), side = j % 2 ? 1 : -1, px = cx + side * half(yG) * 0.42;
        goalDie(px, yG, r, Math.round(pct(x) / 100 * 12), x.title, false, j * 1.3, function () { st.sel = x.id; save(); render(true); }, 'g:' + x.id, x.hue);
        var room = side > 0 ? W - (px + r * 1.5) - 8 : px - r * 1.5 - 44;      // on the left, stay clear of the time marks
        if (room > 48) {
          var tx = sv('text', { x: side > 0 ? px + r * 1.5 : px - r * 1.5, y: yG - r - 2, class: 'goal-t sm', 'text-anchor': side > 0 ? 'start' : 'end', 'font-size': 12 }, svg);
          fit(tx, x.title, room, 12, 700, famHead);
          var t2 = sv('text', { x: side > 0 ? px + r * 1.5 : px - r * 1.5, y: yG - r + 12, class: 'dt', 'text-anchor': side > 0 ? 'start' : 'end', 'font-size': 10.5 }, svg);
          fit(t2, fmtD(x.date, true), room, 10.5, 400, famBody);
        } else {                                       // a big, near die has no room beside it: name it underneath
          var t3 = sv('text', { x: px, y: yG + 15, class: 'goal-t sm', 'text-anchor': 'middle', 'font-size': 12 }, svg);
          fit(t3, x.title + ' · ' + fmtD(x.date, true), Math.min(W - 16, 220), 12, 700, famHead);
        }
      });
    } else {
      var yGh = yOf(dMax), rGh = Math.max(26, Math.min(44, (yGh - 30) / 2.3));
      goalDie(cx, yGh, rGh, 0, '', true, 0.6, null, 'ghost', roomHue());
      var gt = sv('text', { x: cx, y: Math.max(16, yGh - rGh * 2.2 - 13), class: 'goal-t', 'text-anchor': 'middle', 'font-size': 15 }, svg);
      gt.textContent = t('fu.ghost');
    }

    // you are here (and, once you have walked, where today is)
    var here = sv('g', { class: 'here' }, svg);
    if (md !== 'goal' || Math.abs(c) < 0.5) {
      sv('circle', { cx: cx, cy: yNow, r: 7, class: 'ping' }, here);
      sv('circle', { cx: cx, cy: yNow, r: 5.5, class: 'pt' }, here);
      var ht = sv('text', { x: cx, y: yNow + 20, class: 'here-t', 'text-anchor': 'middle', 'font-size': 11.5 }, svg); ht.textContent = t('fu.now');
    } else {
      sv('circle', { cx: cx, cy: yNow, r: 4, class: 'pt cam' }, here);
      var cd = sv('text', { x: cx, y: yNow + 20, class: 'here-t', 'text-anchor': 'middle', 'font-size': 11.5 }, svg); cd.textContent = fmtD(iso(addDays(startOfToday(), Math.round(c))), true);
      if (c < 0) {                                       // walked back among the past stages: today is a line ahead of you
        var yT = yOf(0);
        sv('line', { x1: cx - half(yT), y1: yT, x2: cx + half(yT), y2: yT, class: 'today' }, svg);
        var tn = sv('text', { x: 8, y: yT - 3, class: 'here-t', 'font-size': 11 }, svg); tn.textContent = t('fu.now');
      }
    }

    if (camBtn) {                                       // the corner chip: the way back to today, or (until you have moved) a hint
      var away = Math.abs(c) > 0.5, act = away ? 'today' : 'hint';
      if (camBtn.dataset.act !== act) { camBtn.dataset.act = act; camBtn.textContent = t(away ? 'fu.camToday' : 'fu.camHint'); camBtn.classList.toggle('hint', !away); camBtn.tabIndex = away ? 0 : -1; }
      camBtn.hidden = !away && (hintGone || G.cMax - G.cMin < 1);                     // (no hint where there is nowhere to walk)
    }
    if (refocus >= 0 && bandEl[refocus]) { try { bandEl[refocus].focus({ preventScroll: true }); } catch (e) {} }
  }
  function loop(tm) {
    var el = (tm - (lastTm || tm)) / 1000, dt = Math.min(0.05, el); lastTm = tm;
    if (geo && geo.md === 'goal') stepCam(Math.min(0.25, el));                      // the camera keeps real time even when frames come slowly
    drawDice(tm, dt); raf = requestAnimationFrame(loop);
  }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; lastTm = 0; }
  function startLoop() {
    stopLoop();
    if (!dice.length || panel.hidden) return;
    if (reduced) { drawDice(0, 0); return; }
    raf = requestAnimationFrame(loop);
  }

  /* ================= the part below the road ================= */
  var editing = null, toFocus = '', doneOpen = {};       // what is open for editing (a task or a stage), what to focus after the next draw, which "Done" groups the user opened (none of this is saved)
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

  function faceKey(g) {
    var faces = (window.TFApp && TFApp.faces()) || [];
    return g.face && faces.some(function (f) { return f.key === g.face; }) ? g.face : (window.TFApp && TFApp.cur());
  }
  function faceSelect(g) {
    var faces = (window.TFApp && TFApp.faces()) || [];
    var sel = el('select', 'fu-face'); sel.setAttribute('aria-label', t('fu.putTo'));
    var want = faceKey(g);
    faces.forEach(function (f) { var o = el('option', '', f.name); o.value = f.key; if (f.key === want) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', function () { g.face = sel.value; save(); });
    return sel;
  }

  /* what changed on the road or in the lists: the road and the sheet are drawn again (the sheet keeps its scroll place) */
  function refresh() { drawDyn(); if (reduced) drawDice(0, 0); renderSheet(true); }
  function byFrom(p, q) { return p.from < q.from ? -1 : p.from > q.from ? 1 : 0; }
  function addTasks(s, list) {
    list.forEach(function (z) { z = String(z || '').trim().slice(0, 100); if (z) s.tasks.push({ id: uid(), t: z, done: false, pushed: false }); });
    save(); toFocus = '#fuAdd'; refresh();
  }
  function putToday(g, list, after) {                     // to-dos for the subject that counts this goal's study time
    if (!window.TFApp || !list.length) return;
    var key = faceKey(g);
    Promise.all(list.map(function (x) { return TFApp.addTodo(key, x.t).then(function () { x.pushed = true; }); })).then(function () {
      save(); setMsg(t('fu.putDone', { n: list.length, name: TFApp.faceName(key) })); if (after) after(); refresh();
    });
  }

  function taskEditor(g, i, x) {
    var s = g.stages[i], li = el('li', 'edit'), inp = el('input', 'st-in'); inp.type = 'text'; inp.maxLength = 100; inp.value = x.t; inp.setAttribute('aria-label', t('fu.edit'));
    function keepText() { var v = inp.value.trim(); if (v) x.t = v.slice(0, 100); }
    function close() { editing = null; }
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); keepText(); close(); save(); refresh(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); renderSheet(true); }
    });
    li.appendChild(inp);
    var row = el('div', 'st-acts');
    function act(label, fn, cls) { var b = el('button', cls || 'btn alt sm', label); b.type = 'button'; b.addEventListener('click', fn); row.appendChild(b); return b; }
    act(t('fu.save'), function () { keepText(); close(); save(); refresh(); }, 'btn sm');
    if (!x.done && !x.pushed && window.TFApp) act(t('fu.taskToday'), function () { keepText(); close(); putToday(g, [x]); });
    if (g.stages[i + 1]) act(t('fu.taskNext'), function () { keepText(); close(); s.tasks = s.tasks.filter(function (y) { return y !== x; }); g.stages[i + 1].tasks.unshift(x); x.pushed = false; save(); refresh(); });
    act(t('fu.taskDel'), function () { close(); s.tasks = s.tasks.filter(function (y) { return y !== x; }); save(); refresh(); });
    act(t('fu.cancel'), function () { close(); renderSheet(true); });
    li.appendChild(row);
    toFocus = '.st-tasks li.edit .st-in';
    return li;
  }
  function taskRow(g, i, x) {
    if (editing && editing.kind === 'task' && editing.id === x.id) return taskEditor(g, i, x);
    var li = el('li', x.done ? 'done' : ''); li.setAttribute('data-id', x.id);
    var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!x.done; cb.setAttribute('aria-label', t('fu.doneAria', { t: x.t }));
    cb.addEventListener('change', function () {            // the list is drawn again, so the focus is put back: on the next open task (or on the task itself when it comes back)
      var s = g.stages[i], at = s.tasks.filter(function (y) { return !y.done; }).indexOf(x);
      x.done = cb.checked; save();
      var n = s.tasks.filter(function (y) { return !y.done; }).length;
      toFocus = x.done ? (n ? '.st-list > .st-tasks li:nth-child(' + (Math.min(at, n - 1) + 1) + ') input[type=checkbox]' : '#fuAdd') : '.st-list > .st-tasks li[data-id="' + x.id + '"] input[type=checkbox]';
      refresh();
    });
    li.appendChild(cb);
    var tx = el('button', 't', x.t); tx.type = 'button'; tx.title = t('fu.edit');
    tx.addEventListener('click', function () { editing = { kind: 'task', id: x.id }; renderSheet(true); });
    li.appendChild(tx);
    if (x.pushed) li.appendChild(el('em', 'st-pushed', t('fu.pushed')));
    return li;
  }
  function addForm(s) {
    var f = el('form', 'st-add'), inp = el('input'); inp.type = 'text'; inp.id = 'fuAdd'; inp.maxLength = 400; inp.placeholder = t('fu.addPh'); inp.setAttribute('aria-label', t('fu.addPh'));
    var b = el('button', 'btn sm', t('fu.add')); b.type = 'submit';
    f.appendChild(inp); f.appendChild(b);
    f.addEventListener('submit', function (e) { e.preventDefault(); var v = inp.value.trim(); if (v) addTasks(s, [v]); });
    inp.addEventListener('paste', function (e) {         // paste a list: every line becomes a task
      var txt = ((e.clipboardData || window.clipboardData).getData('text') || '').trim();
      if (!/[\r\n]/.test(txt)) return;
      e.preventDefault(); addTasks(s, txt.split(/\r?\n+/).slice(0, 60));
    });
    return f;
  }
  function taskList(g, i) {
    var s = g.stages[i], wrap = el('div', 'st-list');
    var open = s.tasks.filter(function (x) { return !x.done; }), dn = s.tasks.filter(function (x) { return x.done; });
    if (!s.tasks.length) wrap.appendChild(el('p', 'fs-note', t('fu.noTasks') + ' ' + t('fu.fuzzy')));
    if (open.length) { var ul = el('ul', 'st-tasks'); open.forEach(function (x) { ul.appendChild(taskRow(g, i, x)); }); wrap.appendChild(ul); }
    if (dn.length) {                                      // finished tasks fold away once the list gets long
      var det = el('details', 'st-done'), want = doneOpen[s.id], edit = editing && editing.kind === 'task' && dn.some(function (x) { return x.id === editing.id; });
      det.open = edit || (want == null ? s.tasks.length <= 8 : want);
      var sum = el('summary', '', t('fu.doneN', { n: dn.length }));
      sum.addEventListener('click', function () { doneOpen[s.id] = !det.open; });        // only what the person chooses is remembered, not the fold the list chose for itself
      det.appendChild(sum);
      var ul2 = el('ul', 'st-tasks'); dn.forEach(function (x) { ul2.appendChild(taskRow(g, i, x)); }); det.appendChild(ul2); wrap.appendChild(det);
    }
    wrap.appendChild(addForm(s));
    return wrap;
  }

  function stageEditor(g, i) {
    var s = g.stages[i], box = el('div', 'st-edit'), note = el('p', 'fu-msg bad', '');
    function field(label, inp, parent) { var l = el('label', 'fu-field'); l.appendChild(el('span', '', label)); l.appendChild(inp); (parent || box).appendChild(l); return inp; }
    var nm = el('input'); nm.type = 'text'; nm.maxLength = 80; nm.value = s.label; field(t('fu.st.name'), nm);
    var dates = el('div', 'st-dates'), a = el('input'), b = el('input'); a.type = b.type = 'date'; a.value = s.from; b.value = s.to;
    field(t('fu.st.from'), a, dates); field(t('fu.st.to'), b, dates); box.appendChild(dates); box.appendChild(note);
    var row = el('div', 'fu-btns');
    function btn(label, fn, cls) { var x = el('button', cls || 'btn alt sm', label); x.type = 'button'; x.addEventListener('click', fn); row.appendChild(x); return x; }
    btn(t('fu.save'), function () {
      var f = a.value, to = b.value;
      if (!parse(f) || !parse(to) || to < f) { note.textContent = t('fu.st.bad'); return; }
      s.label = nm.value.trim().slice(0, 80) || s.label; s.from = f; s.to = to; s.kind = kindFor(f, to);
      g.stages.sort(byFrom); picked[g.id] = g.stages.indexOf(s); editing = null; save(); render(false);
    }, 'btn sm');
    btn(t('fu.cancel'), function () { editing = null; renderSheet(true); });
    var del = btn(t('fu.st.del'), function () {
      if (s.tasks.length && !confirm(t('fu.st.delConfirm', { n: s.tasks.length }))) return;
      g.stages.splice(i, 1); delete picked[g.id]; editing = null; save(); render(false);
    });
    del.disabled = g.stages.length < 2;
    box.appendChild(row);
    toFocus = '.st-edit input[type=text]';
    return box;
  }
  function addStage(g, i) {                               // a stage of your own, after this one
    var from = iso(addDays(parse(g.stages[i].to), 1)), to = iso(addDays(parse(from), 29));
    var s = { id: uid(), kind: kindFor(from, to), from: from, to: to, label: t('fu.newStage'), tasks: [] };
    g.stages.push(s); g.stages.sort(byFrom); editing = { kind: 'stage', id: s.id }; save(); drawDyn(); enter(g.stages.indexOf(s));
  }

  function stageSheet(g, i) {
    var s = g.stages[i], ci = curIndex(g), box = el('div', 'fu-stage');
    box.appendChild(Countdown.pill({ icon: s.kind, label: s.label, sub: t('fu.kind.' + s.kind), days: daysTo(s.to),
      date: range(s), hue: Countdown.journeyHue(g.hue, i, g.stages.length), state: (i === ci ? 'cur ' : i < ci ? 'past ' : '') + 'sm', fill: fillOf(g, s) }));
    box.appendChild(el('p', 'fs-studied', t('fu.studied', { a: fmtMin(studied(g, s)), b: fmtMin(budget(g, s)) })));
    if (editing && editing.kind === 'stage' && editing.id === s.id) box.appendChild(stageEditor(g, i));
    box.appendChild(taskList(g, i));
    var todo = i === ci ? s.tasks.filter(function (x) { return !x.done && !x.pushed; }) : [];
    if (todo.length) {                                    // the next few at a time, so a long list does not bury Today
      var batch = todo.slice(0, 5), row = el('div', 'st-put'), sel = faceSelect(g);
      var b = el('button', 'btn sm fu-put', todo.length > batch.length ? t('fu.putN', { n: batch.length }) : t('fu.put')); b.type = 'button';
      b.addEventListener('click', function () { if (window.TFApp) { g.face = sel.value; putToday(g, batch); } });
      row.appendChild(sel); row.appendChild(b); box.appendChild(row);
    }
    var tools = el('div', 'st-tools');
    function tool(label, fn, off) { var x = el('button', 'btn alt sm', label); x.type = 'button'; x.disabled = !!off; x.addEventListener('click', fn); tools.appendChild(x); return x; }
    tool(t('fu.editStage'), function () { editing = { kind: 'stage', id: s.id }; renderSheet(true); });
    tool(t('fu.addStage'), function () { addStage(g, i); });
    tool(t('fu.aiMore'), function () { moreTasks(g, i); }, working).classList.add('fu-ai');
    box.appendChild(tools);
    return box;
  }

  function goalSheet(g) {
    var box = el('div', 'fu-goal'); box.style.setProperty('--gh', g.hue);
    if (!g.face && window.TFApp) { g.face = TFApp.cur(); save(); }
    box.appendChild(Countdown.pill({ icon: 'goal', label: g.title, sub: t('fu.progress', { p: pct(g) }), days: daysTo(g.date), date: fmtD(g.date, true),
      hue: Countdown.journeyHue(g.hue, 1, 1), state: 'goal', fill: progress(g) }));
    if (g.stages.length) { box.appendChild(el('i', 'fu-link')); box.appendChild(stageSheet(g, shownIndex(g))); }
    // earlier stages, the goal itself, the re-plan and delete buttons
    var ci = curIndex(g), passed = g.stages.slice(0, ci), missed = passed.reduce(function (a, s) { return a + s.tasks.filter(function (x) { return !x.done; }).length; }, 0);
    if (missed) box.appendChild(el('p', 'fu-miss', t('fu.missed', { n: missed })));
    var more = el('details', 'fu-more'); more.appendChild(el('summary', '', t('fu.manage')));
    if (g.summary) more.appendChild(el('p', 'fs-note', g.summary));
    var eg = el('div', 'fu-editgoal');
    function gf(label, inp) { var l = el('label', 'fu-field'); l.appendChild(el('span', '', label)); l.appendChild(inp); eg.appendChild(l); return inp; }
    var gt = el('input'); gt.type = 'text'; gt.maxLength = 80; gt.value = g.title; gf(t('fu.f.title'), gt);
    var gd = el('input'); gd.type = 'date'; gd.value = g.date; gd.min = iso(addDays(startOfToday(), 1)); gf(t('fu.f.date'), gd);
    var gh = el('input'); gh.type = 'number'; gh.min = 1; gh.max = 60; gh.value = g.hours; gh.inputMode = 'numeric'; gf(t('fu.f.hours'), gh);
    var sv2 = el('button', 'btn alt sm', t('fu.save')); sv2.type = 'button'; sv2.id = 'fuGoalSave';
    sv2.addEventListener('click', function () {
      var title = gt.value.trim(), d = parse(gd.value);
      if (!title || !d) { setMsg(t('fu.f.need'), true); renderSheet(true); return; }
      if (d <= startOfToday()) { setMsg(t('fu.f.past'), true); renderSheet(true); return; }
      var changed = gd.value !== g.date;
      g.title = title.slice(0, 80); g.date = gd.value; g.hours = Math.max(1, Math.min(60, parseInt(gh.value, 10) || g.hours));
      save(); setMsg(changed ? t('fu.dateChanged') : ''); render(false);
    });
    eg.appendChild(sv2); more.appendChild(eg);
    var cf = el('label', 'fu-field fu-count'); cf.appendChild(el('span', '', t('fu.countFrom'))); cf.appendChild(faceSelect(g)); more.appendChild(cf);
    if (passed.length) more.appendChild(el('p', 'fs-note', t('fu.passed', { n: passed.length })));
    var row = el('div', 'fu-btns');
    var rp = el('button', 'btn alt sm', t('fu.replan')); rp.type = 'button'; rp.disabled = working; rp.addEventListener('click', function () {            // a fresh plan swaps the tasks not yet done, so ask first when there are some
      var open = 0; g.stages.forEach(function (s) { open += s.tasks.filter(function (x) { return !x.done; }).length; });
      if (open && !confirm(t('fu.replanConfirm', { n: open }))) return;
      replan(g);
    });
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

  function renderSheet(keep) {
    var top = sheet.scrollTop, md = mode();
    sheet.textContent = '';
    sheet.appendChild(md === 'ghost' ? formView() : md === 'all' ? overviewSheet() : goalSheet(curGoal()));
    if (keep) sheet.scrollTop = top;
    if (toFocus) {
      var n = sheet.querySelector(toFocus); toFocus = '';
      if (n) {
        var ed = n.closest ? n.closest('li.edit, .st-edit') : null;                  // an editor is brought into view whole, clear of the add bar
        try { n.focus({ preventScroll: !!ed }); if (n.select) n.select(); } catch (e) {}
        if (ed) {
          var bar = sheet.querySelector('.st-add'), er = ed.getBoundingClientRect(), sr = sheet.getBoundingClientRect();
          var low = sr.bottom - (bar ? bar.offsetHeight : 0) - 8;                    // the add bar can sit on the sheet's bottom edge, so the editor must end above it
          if (er.bottom > low) sheet.scrollTop += er.bottom - low; else if (er.top < sr.top + 4) sheet.scrollTop -= sr.top + 4 - er.top;
        }
      }
    }
  }
  function render(intro) {
    if (st.sel !== 'all' && st.sel !== 'new' && !st.goals.some(function (g) { return g.id === st.sel; })) st.sel = st.goals.length > 1 ? 'all' : (st.goals[0] ? st.goals[0].id : 'new');
    if (st.goals.length === 1 && st.sel === 'all') st.sel = st.goals[0].id;
    if (!st.goals.length) st.sel = 'new';
    if (intro) editing = null;
    histMemo = null;
    renderTabs();
    var md = mode();
    panel.dataset.mode = md;
    scene.className = 'fu-scene' + (working ? ' working' : '');
    drawScene(intro);
    renderSheet(false);
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
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { mwid = {}; if (!panel.hidden && geo) drawDyn(); });   // the web font changes the text widths
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
