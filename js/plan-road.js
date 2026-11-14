/* plan-road.js — the whole journey on one road.
 * A road in perspective (wide at the bottom, narrow at the top) carries EVERY stage of a plan, so dozens of stages fit and none is lost.
 * Where you are looking (the "reading line", a position f along the stages: 3.5 = halfway through the fourth) is magnified: the stages just ahead of it are big
 * enough to read, those far away shrink toward the horizon, and the ones already behind it are squeezed into a thin trail at the bottom. Move f and the road
 * re-focuses (a fisheye over time). The goal floats at the horizon as a dodecahedron that lights up with progress.
 *
 *   var road = PlanRoad.create(hostElement, { mini: false, onPick: function (i) {}, onDrag: function (dyStages) {} })
 *   road.update({ stages: [{title, status, fill, from, to}], phases: [{name, from, to}], marks: [{x, text, major}], here: index, hue, seed, goal: {lit, text} })
 *   road.setFocus(f, jump)   road.resize()   road.destroy()   road.indexAt(clientY) -> stage index under that height (or -1)
 * Colours and light/dark come from css/plan.css (classes pr-*). */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var reduced = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var darkMq = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;
  function isLight() { var th = document.documentElement.getAttribute('data-theme'); return th === 'light' || (th !== 'dark' && !(darkMq && darkMq.matches)); }
  function sv(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rng(seed) { var s = 0; for (var i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* text widths are measured on a canvas, so redrawing the road while it moves never forces a layout */
  var mctx = null, mwid = {}, mcount = 0;
  function textW(str, fs, wt, fam) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    var k = wt + '|' + fs + '|' + fam + '|' + str, w = mwid[k];
    if (w == null) { mctx.font = wt + ' ' + fs + 'px ' + fam; w = mwid[k] = mctx.measureText(str).width; if (++mcount > 4000) { mwid = {}; mcount = 0; } }
    return w;
  }
  function fitText(str, maxW, fs, wt, fam) {                     // the text shortened with … to fit; '' when not even a few letters fit
    if (textW(str, fs, wt, fam) <= maxW) return str;
    var lo = 0, hi = str.length;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (textW(str.slice(0, mid) + '…', fs, wt, fam) <= maxW) lo = mid; else hi = mid - 1; }
    return lo < 2 ? '' : str.slice(0, lo) + '…';
  }

  function create(host, opt) {
    opt = opt || {};
    var mini = !!opt.mini;
    host.classList.add('pr');
    var svg = sv('svg', { 'class': 'pr-svg' }); host.appendChild(svg);
    var gBack = sv('g', { 'class': 'pr-back' }, svg), gTiles = sv('g', { 'class': 'pr-tiles' }, svg), gMargin = sv('g', { 'class': 'pr-margin' }, svg), gMark = sv('g', { 'class': 'pr-mark' }, svg);
    var dieCv = null, dieCtx = null;
    if (!mini) { dieCv = document.createElement('canvas'); dieCv.className = 'pr-die'; dieCv.setAttribute('aria-hidden', 'true'); host.appendChild(dieCv); dieCtx = dieCv.getContext('2d'); }

    var W = 0, H = 0, cx = 0, yTop = 0, yBot = 0, R = 0, hwB = 0, hwT = 0, dieR = 0, dieY = 0, dpr = 1;
    var model = { stages: [], phases: [], marks: [], here: 0, hue: 215, seed: 'x', goal: { lit: 0, text: '' } };
    var tiles = [], cur = 0, tgt = 0, raf = 0, dieRaf = 0, tPrev = 0, dead = false, drawn = false;
    var famBody = 'system-ui, sans-serif', famHead = famBody;
    var drag = null, ro = null;

    /* ---------- the size of things ---------- */
    function measure() {
      var r = host.getBoundingClientRect(); W = Math.round(r.width); H = Math.round(r.height);
      var cs = getComputedStyle(document.body); famBody = cs.getPropertyValue('--f-body').trim() || 'system-ui, sans-serif'; famHead = cs.getPropertyValue('--f-head').trim() || famBody;
    }
    function layout() {
      measure();
      if (W < 20 || H < 20) return false;
      var phone = W < 520;
      cx = W / 2;
      dieR = mini ? 0 : clamp(H * 0.075, 15, 27);
      yTop = mini ? Math.max(5, H * 0.06) : Math.round(dieR * 2.1 + 14);
      yBot = H - (mini ? 3 : 9);
      R = yBot - yTop;
      hwB = mini ? W * 0.46 : Math.min(W * (phone ? 0.475 : 0.42), 400);
      hwT = mini ? W * 0.07 : clamp(W * 0.05, 14, 36);
      svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      if (dieCv) { dpr = Math.min(2, global.devicePixelRatio || 1); dieCv.width = Math.round(W * dpr); dieCv.height = Math.round((yTop + dieR * 1.2) * dpr); dieCv.style.height = Math.round(yTop + dieR * 1.2) + 'px'; }
      backdrop();
      return true;
    }
    function hw(y) { return hwT + (hwB - hwT) * clamp((y - yTop) / R, 0, 1); }

    /* sky, stars, the ground and the lines running to the horizon; they only change with the size */
    function backdrop() {
      gBack.textContent = '';
      var defs = sv('defs', {}, gBack);
      var g1 = sv('linearGradient', { id: 'prSky' + uidn, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      sv('stop', { offset: '0', 'class': 'pr-sky0' }, g1); sv('stop', { offset: '1', 'class': 'pr-sky1' }, g1);
      var g2 = sv('linearGradient', { id: 'prGnd' + uidn, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      sv('stop', { offset: '0', 'class': 'pr-gnd0' }, g2); sv('stop', { offset: '1', 'class': 'pr-gnd1' }, g2);
      var g3 = sv('radialGradient', { id: 'prGlow' + uidn }, defs);
      sv('stop', { offset: '0', 'class': 'pr-glow0' }, g3); sv('stop', { offset: '1', 'class': 'pr-glow1' }, g3);
      sv('rect', { x: 0, y: 0, width: W, height: yTop + 1, fill: 'url(#prSky' + uidn + ')' }, gBack);
      sv('rect', { x: 0, y: yTop, width: W, height: H - yTop, fill: 'url(#prGnd' + uidn + ')' }, gBack);
      if (!mini) {
        var rnd = rng(String(model.seed)), n = Math.round(W / 26);
        for (var i = 0; i < n; i++) sv('circle', { cx: (rnd() * W).toFixed(1), cy: (rnd() * (yTop - 4)).toFixed(1), r: (0.5 + rnd() * 1.1).toFixed(2), 'class': 'pr-star', style: 'animation-delay:' + (rnd() * 4).toFixed(2) + 's' }, gBack);
        sv('circle', { cx: cx, cy: yTop - dieR * 0.5, r: dieR * 3.2, fill: 'url(#prGlow' + uidn + ')' }, gBack);
      }
      for (var j = -6; j <= 6; j++) {                      // lines running off to the horizon, to give the ground some depth
        if (Math.abs(j) < 2 && mini) continue;
        var x2 = cx + j * (W * 0.22);
        sv('line', { x1: cx + j * hwT * 0.55, y1: yTop, x2: x2, y2: H, 'class': 'pr-ray' }, gBack);
      }
      sv('line', { x1: 0, y1: yTop, x2: W, y2: yTop, 'class': 'pr-horizon' }, gBack);
      sv('polygon', { points: (cx - hwT) + ',' + yTop + ' ' + (cx + hwT) + ',' + yTop + ' ' + (cx + hwB) + ',' + yBot + ' ' + (cx - hwB) + ',' + yBot, 'class': 'pr-bed' }, gBack);
    }
    var uidn = Math.random().toString(36).slice(2, 7);

    /* ---------- where each stage goes ---------- */
    function mapFor(N, f) {
      var fut = Math.max(1e-4, N - f);
      var Bmin = f > 0 ? Math.min(R * 0.16, f * 4) : 0;
      var B = f > 0 ? Math.min(Math.max(Bmin, R - fut * R * 0.28), f * R * 0.28) : 0;     // the trail behind you: thin, but longer the nearer you are to the end
      var rest = R - B;
      var minH = Math.min(clamp(0.5 * rest / fut, 2.6, 11), 0.9 * rest / fut);              // even the farthest stage keeps a sliver
      var Bp = Math.max(0, rest - minH * fut);
      var kappa = clamp(0.5 * fut, 2.2, 6);                                                  // how fast stages shrink away from the reading line
      var den = 1 - 1 / (1 + fut / kappa);
      return function (x) {
        if (x <= f) return f > 0 ? B * x / f : 0;
        var u = x - f;
        return B + minH * u + Bp * (1 - 1 / (1 + u / kappa)) / den;
      };
    }
    function indexAt(clientY) {
      var N = model.stages.length; if (!N || !R) return -1;
      var y = clientY - svg.getBoundingClientRect().top, s = yBot - y;
      if (s < -4 || s > R + 4) return -1;
      var m = mapFor(N, cur), lo = 0, hi = N;
      for (var i = 0; i < 24; i++) { var mid = (lo + hi) / 2; if (m(mid) < s) lo = mid; else hi = mid; }
      return clamp(Math.floor((lo + hi) / 2), 0, N - 1);
    }

    /* ---------- tiles: one per stage, made once and moved on every frame ---------- */
    function build() {
      gTiles.textContent = ''; tiles = [];
      model.stages.forEach(function (s, k) {
        var g = sv('g', { 'class': 'pr-tg' }, gTiles), p = sv('polygon', { 'class': 'pr-t' }, g), ti = sv('title', {}, p), tx = sv('text', { 'class': 'pr-tx' }, g);
        ti.textContent = (k + 1) + '. ' + s.title;
        tx.setAttribute('text-anchor', 'middle');
        tiles.push({ g: g, p: p, tx: tx, cls: '', txt: null, on: true });
      });
      drawn = false;
    }

    function draw() {
      if (!R) return;
      var N = model.stages.length, f = clamp(cur, 0, Math.max(0, N));
      gMargin.textContent = ''; gMark.textContent = '';
      var hr = model.here, fi = clamp(Math.floor(f), 0, Math.max(0, N - 1));
      if (!N) return;
      var m = mapFor(N, f), ys = new Array(N + 1), k;
      for (k = 0; k <= N; k++) ys[k] = yBot - m(k);
      var fsMax = mini ? 0 : 14;
      for (k = 0; k < N; k++) {
        var tl = tiles[k], st = model.stages[k], y0 = ys[k], y1 = ys[k + 1], h = y0 - y1;
        if (h < 0.7) { if (tl.on) { tl.g.style.display = 'none'; tl.on = false; } continue; }
        if (!tl.on) { tl.g.style.display = ''; tl.on = true; }
        var gap = h > 12 ? 1.1 : h > 5 ? 0.7 : 0.35, a = y0 - gap / 2, b = y1 + gap / 2, wa = hw(a), wb = hw(b);
        tl.p.setAttribute('points', (cx - wa).toFixed(1) + ',' + a.toFixed(1) + ' ' + (cx + wa).toFixed(1) + ',' + a.toFixed(1) + ' ' + (cx + wb).toFixed(1) + ',' + b.toFixed(1) + ' ' + (cx - wb).toFixed(1) + ',' + b.toFixed(1));
        var cls = 'pr-tg ' + st.status + (k === hr ? ' here' : '') + (k === fi && !mini ? ' foc' : '') + (k < f - 1 ? ' past' : '');
        if (cls !== tl.cls) { tl.g.setAttribute('class', cls); tl.cls = cls; tl.p.style.setProperty('--th', st.hue); }
        else if (tl.th !== st.hue) { tl.p.style.setProperty('--th', st.hue); }
        tl.th = st.hue;
        var ym = (y0 + y1) / 2, fs = Math.min(fsMax, h * 0.52);
        if (fs >= 9.5) {
          var room = 2 * Math.min(wa, wb) - 18, tx = fitText((k + 1) + '  ' + st.title, room, fs, 600, famBody);
          if (tx) { tl.tx.setAttribute('x', cx.toFixed(1)); tl.tx.setAttribute('y', (ym + fs * 0.36).toFixed(1)); tl.tx.setAttribute('font-size', fs.toFixed(1)); if (tl.txt !== tx) { tl.tx.textContent = tx; tl.txt = tx; } tl.tx.style.display = ''; }
          else { tl.tx.style.display = 'none'; tl.txt = null; }
        } else if (tl.txt !== null || tl.tx.style.display !== 'none') { tl.tx.style.display = 'none'; tl.txt = null; }
      }
      if (mini) { markHere(ys); return; }

      /* phase names stand on the left, at the line where the phase begins */
      var lastY = 1e9, ph = model.phases.slice().sort(function (a, b) { return b.from - a.from; });
      ph.forEach(function (p) {
        if (!p.name) return;
        var y = ys[p.from], x = cx - hw(y);
        sv('line', { x1: x - 3, y1: y, x2: x - 15, y2: y, 'class': 'pr-tick' }, gMargin);
        var yy = Math.min(y - 3, lastY - 13); if (yy < yTop + 4) return;
        var room = x - 20 - 8, s = fitText(p.name, room, 11.5, 700, famHead);
        if (!s) return;
        lastY = yy; sv('text', { x: x - 18, y: yy, 'class': 'pr-ph', 'text-anchor': 'end', 'font-size': 11.5 }, gMargin).textContent = s;
      });
      /* time marks on the right: where each year (or quarter, or month) begins */
      lastY = 1e9;
      model.marks.slice().sort(function (a, b) { return a.x - b.x; }).forEach(function (mk) {
        if (mk.x <= 0.02 || mk.x >= N) return;
        var y = yBot - m(mk.x), x = cx + hw(y);
        if (y < yTop + 6 || lastY - y < 13) return;
        var room = W - (x + 18) - 4; if (room < 22) return;
        lastY = y;
        sv('line', { x1: x + 3, y1: y, x2: x + 15, y2: y, 'class': 'pr-tick' + (mk.major ? ' major' : '') }, gMargin);
        sv('text', { x: x + 18, y: y + 4, 'class': 'pr-tm' + (mk.major ? ' major' : ''), 'font-size': mk.major ? 11.5 : 10.5 }, gMargin).textContent = mk.text;
      });
      /* the goal's date, beside the die */
      if (model.goal && (model.goal.text || model.goal.sub)) {
        var gx = cx + dieR * 1.35 + 8, groom = W - gx - 10;
        if (groom > 44) {
          var g1 = fitText(model.goal.text || '', groom, 12.5, 700, famHead), g2 = fitText(model.goal.sub || '', groom, 11.5, 600, famBody);
          if (g1) sv('text', { x: gx, y: yTop - 18, 'class': 'pr-gt', 'font-size': 12.5 }, gMargin).textContent = g1;
          if (g2) sv('text', { x: gx, y: yTop - 5, 'class': 'pr-gs', 'font-size': 11.5 }, gMargin).textContent = g2;
        }
      }
      markHere(ys);
      /* the reading line: two small arrows at the edges of the stage you are looking at */
      if (N > 0) {
        var ymid = clamp((yBot - m(f) + ys[fi + 1]) / 2, yTop + 6, yBot - 6);          // the part of that stage that is on or beyond the reading line
        var xl = cx - hw(ymid) - 3, xr = cx + hw(ymid) + 3;
        sv('path', { d: 'M' + (xl - 9) + ',' + (ymid - 5.5) + 'L' + xl + ',' + ymid + 'L' + (xl - 9) + ',' + (ymid + 5.5) + 'Z', 'class': 'pr-arrow' }, gMark);
        sv('path', { d: 'M' + (xr + 9) + ',' + (ymid - 5.5) + 'L' + xr + ',' + ymid + 'L' + (xr + 9) + ',' + (ymid + 5.5) + 'Z', 'class': 'pr-arrow' }, gMark);
      }
    }
    function markHere(ys) {
      var N = model.stages.length, hr = model.here;
      if (hr >= N || mini && hr < 0) return;
      var y = (ys[hr] + ys[hr + 1]) / 2, x = mini ? cx : cx - hw(y) + 15;       // on the full road it sits at the left end of the stage, out of the way of its name
      sv('circle', { cx: x, cy: y, r: mini ? 3 : 7, 'class': 'pr-ping' }, gMark);
      sv('circle', { cx: x, cy: y, r: mini ? 2.2 : 4.4, 'class': 'pr-pt' }, gMark);
    }

    /* ---------- moving the reading line ---------- */
    function loop(ts) {
      raf = 0; if (dead) return;
      var dt = tPrev ? Math.min(0.25, (ts - tPrev) / 1000) : 0.016; tPrev = ts;
      var d = tgt - cur;
      if (Math.abs(d) < 0.0008) cur = tgt; else cur += d * (1 - Math.exp(-dt * 12));
      draw();
      if (cur !== tgt) raf = requestAnimationFrame(loop); else tPrev = 0;
    }
    function setFocus(f, jump) {
      var N = model.stages.length; f = clamp(isNaN(f) ? 0 : f, 0, Math.max(0, N));
      tgt = f;
      if (jump || reduced || mini || !drawn) { cur = f; drawn = true; if (!raf) draw(); return; }
      if (!raf) { tPrev = 0; raf = requestAnimationFrame(loop); }
    }

    /* ---------- the goal at the horizon ---------- */
    function paintDie(tm) {
      if (!dieCtx || !global.Dodeca || !dieCv.width) return;
      var light = isLight();
      dieCtx.setTransform(dpr, 0, 0, dpr, 0, 0); dieCtx.clearRect(0, 0, W, dieCv.height / dpr);
      var bob = reduced ? 0 : Math.sin(tm / 900) * 2.2;
      Dodeca.paint(dieCtx, { x: cx, y: yTop - dieR * 0.15 + bob, r: dieR, spin: reduced ? 0.5 : tm * 0.00032, style: Dodeca.styleOf('p:' + model.seed), hl: 0, lit: Math.round(clamp(model.goal.lit, 0, 1) * 12), ghost: model.stages.length ? 0 : 1,
        hue: model.hue, sat: light ? 78 : 75, lum: light ? 62 : 66, light: light, alpha: 1, labels: null, font: famBody, labelOut: null });
    }
    function dieLoop(tm) {
      dieRaf = 0; if (dead || mini) return;
      if (!document.hidden && host.isConnected && H) paintDie(tm);
      if (!reduced) dieRaf = requestAnimationFrame(dieLoop);
    }

    /* ---------- the model ---------- */
    function update(m) {
      var rebuild = !model.stages.length || m.stages.length !== model.stages.length || m.stages.some(function (s, i) { return model.stages[i] && model.stages[i].title !== s.title; });
      var reseed = String(m.seed) !== String(model.seed);
      model = { stages: m.stages || [], phases: m.phases || [], marks: m.marks || [], here: m.here == null ? 0 : m.here, hue: m.hue == null ? 215 : m.hue, seed: m.seed || 'x', goal: m.goal || { lit: 0, text: '' } };
      host.style.setProperty('--h', model.hue);
      if (reseed && R) backdrop();
      if (rebuild || tiles.length !== model.stages.length) build();
      tiles.forEach(function (tl) { tl.cls = ''; });
      cur = clamp(cur, 0, Math.max(0, model.stages.length)); tgt = clamp(tgt, 0, Math.max(0, model.stages.length));
      if (R) draw();
      svg.setAttribute('aria-label', t('pl.road.aria', { n: model.stages.length, here: Math.min(model.here + 1, model.stages.length) }));
      svg.setAttribute('role', 'img');
      if (!reduced && !mini && !dieRaf) dieRaf = requestAnimationFrame(dieLoop); else if (dieCv) paintDie(0);
    }
    function resize() { if (layout()) { build(); drawn = false; draw(); if (dieCv && (reduced || mini)) paintDie(0); } }

    /* ---------- the mouse: a click picks a stage; dragging the road scrolls along it (touch scrolls the page by itself) ---------- */
    if (!mini) {
      svg.addEventListener('click', function (e) {
        if (drag && drag.moved) return;
        var i = indexAt(e.clientY); if (i >= 0 && opt.onPick) opt.onPick(i);
      });
      svg.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        drag = { y: e.clientY, moved: false, id: e.pointerId };
      });
      svg.addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        var dy = e.clientY - drag.y;
        if (!drag.moved && Math.abs(dy) < 5) return;
        if (!drag.moved) { drag.moved = true; try { svg.setPointerCapture(e.pointerId); } catch (x) {} svg.classList.add('drag'); }
        drag.y = e.clientY;
        if (opt.onDrag) opt.onDrag(-dy * model.stages.length / Math.max(1, R));    // dragging up goes on toward the goal
      });
      var end = function (e) { if (!drag) return; var moved = drag.moved; svg.classList.remove('drag'); setTimeout(function () { drag = null; }, 0); if (moved) e.preventDefault(); };
      svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    }
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(function () { if (dead) return; var r = host.getBoundingClientRect(); if (Math.round(r.width) !== W || Math.round(r.height) !== H) resize(); }); ro.observe(host); }
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { if (!dead) { measure(); drawn = false; draw(); } });
    layout();

    return {
      update: update, setFocus: setFocus, resize: resize, indexAt: indexAt,
      focus: function () { return cur; },
      destroy: function () { dead = true; if (raf) cancelAnimationFrame(raf); if (dieRaf) cancelAnimationFrame(dieRaf); if (ro) ro.disconnect(); host.textContent = ''; host.classList.remove('pr'); }
    };
  }

  global.PlanRoad = { create: create };
})(window);
