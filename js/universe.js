/* universe.js — "your universe": one soft, living ball that holds a jelly cell for every stage of your life, every study, every goal.
 *
 * How it works, in short
 *  - Every cell is a bubble (a disk) with a spinning dodecahedron inside. Bubbles push each other apart; where two overlap, the wall between them is
 *    the bubbles' radical axis, so crowded cells squeeze into flat-walled, round-cornered jelly shapes and lonely cells stay round (a soap-foam look).
 *  - Each outline is stored as 72 distances from the cell's centre and driven by springs, so walls wobble, overshoot and settle.
 *  - The ball's skin is a ring of 96 springs coupled to their neighbours: a bump travels around it like a ripple.
 *  - Time is the slider: the cell that covers the chosen day sits in the middle and glows; what is over turns amber and sinks to the left;
 *    what has not begun turns to a ghost and floats to the right.
 *
 * Universe.create(canvas, {mini, padding:{l,t,r,b}, onSelect(id), onHover(id, x, y)}) -> controller
 *   setCells([{id, title, hue, kind, start, end, w, lit, goal}])  start/end are day offsets from today (0 = today, -30 = a month ago); w = weight (size)
 *   setFocus(days) · select(id) · highlight(id) · playIntro() · resize() · setPadding({l,t,r,b}) · snapshot() · destroy() · cellAt(x, y)
 *   highlight(id) lights a cell from outside (the list beside the ball does this when you point at a card). */
(function (global) {
  'use strict';
  var TAU = Math.PI * 2, MP = 72, MB = 96, GAP = 2.6;
  var COS = new Float32Array(MP), SIN = new Float32Array(MP), BC = new Float32Array(MB), BS = new Float32Array(MB);
  for (var q = 0; q < MP; q++) { COS[q] = Math.cos(q / MP * TAU); SIN[q] = Math.sin(q / MP * TAU); }
  for (q = 0; q < MB; q++) { BC[q] = Math.cos(q / MB * TAU); BS[q] = Math.sin(q / MB * TAU); }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smooth(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }
  function ease(k) { k = clamp(k, 0, 1); return 1 - Math.pow(1 - k, 3); }
  function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100003) / 100003; }
  function hueMix(a, b, k) { var d = ((b - a + 540) % 360) - 180; return (a + d * k + 360) % 360; }

  function create(canvas, opts) {
    opts = opts || {};
    var mini = !!opts.mini, ctx = canvas.getContext('2d'), dpr = 1, W = 0, H = 0;
    var pad = opts.padding || { l: 0, t: 0, r: 0, b: 0 };
    var cx = 0, cy = 0, cxT = 0, cyT = 0, ready = false, Rmax = 100, Rmin = 60, R = 60, Rv = 0, Rt = 60, WS = 1;   // WS: how big the skin's wobble may be (it is in pixels, so a small ball gets a small wobble)
    var cells = [], byId = {}, T = 0, last = 0, raf = 0, alive = true;
    var focusT = 0, focusS = 0, horizon = 90;
    var sel = null, hover = null, hi = null, drag = null, ptr = { x: -1e4, y: -1e4, in: false };
    var offS = 0, OFFK = 0.85;                               // the group of cells is re-centred in the ball: most of what you have is ahead of you, and the ball should not lean right
    var wave = new Float32Array(MB), wv = new Float32Array(MB), ballPts = new Float32Array(MB * 2);
    var introT = -1, INTRO = 8, zoom = 1, introBall = 1, introCell = 1, introSeen = false, introPop = false;
    var reduced = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var font = 'system-ui, sans-serif', stars = [], galaxies = [], ballPath = null;
    var cbSelect = opts.onSelect || function () {}, cbHover = opts.onHover || function () {};

    /* ---------- sizes ---------- */
    function measure() {
      var r = canvas.getBoundingClientRect();                // clientWidth, not the rect: a CSS transform (the little orb pops in with a scale) must not change what we think our size is
      W = Math.max(1, Math.round(canvas.clientWidth || r.width)); H = Math.max(1, Math.round(canvas.clientHeight || r.height));
      dpr = Math.min(global.devicePixelRatio || 1, mini ? 2 : 1.75);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      var aw = Math.max(40, W - pad.l - pad.r), ah = Math.max(40, H - pad.t - pad.b);
      cxT = pad.l + aw / 2; cyT = pad.t + ah / 2; if (!ready) { cx = cxT; cy = cyT; ready = true; }
      Rmax = Math.min(aw, ah) / 2 * (mini ? 0.84 : 0.93); Rmin = Rmax * (mini ? 0.7 : 0.56); WS = Math.max(0.1, Math.min(1, Rmax / 250));
      try { font = global.getComputedStyle(canvas).fontFamily || font; } catch (e) {}
      if (!stars.length && !mini) makeSky();
    }
    function makeSky() {
      var n = 150;
      for (var i = 0; i < n; i++) stars.push({ x: Math.random(), y: Math.random(), z: 0.25 + Math.random() * 0.75, p: Math.random() * TAU, s: 0.5 + Math.random() * 1.3, h: Math.random() < 0.2 ? 30 : Math.random() < 0.4 ? 210 : 0 });
      [[0.18, 0.2, 1.1, 0.25], [0.86, 0.74, 0.9, 0.2], [0.7, 0.1, 0.55, 0.16]].forEach(function (g, gi) {
        var c = document.createElement('canvas'); c.width = c.height = 240; var x = c.getContext('2d'), arms = 2 + (gi % 2);
        x.translate(120, 120);
        var core = x.createRadialGradient(0, 0, 0, 0, 0, 40); core.addColorStop(0, 'rgba(255,240,215,.9)'); core.addColorStop(1, 'rgba(255,240,215,0)'); x.fillStyle = core; x.beginPath(); x.arc(0, 0, 40, 0, TAU); x.fill();
        for (var k = 0; k < 900; k++) {
          var a = Math.random() * arms | 0, t = Math.pow(Math.random(), 0.7), ang = a * TAU / arms + t * 5.2 + (Math.random() - 0.5) * 0.5 * (1 - t * 0.4), rr = 6 + t * 106;
          x.fillStyle = 'hsla(' + (gi === 1 ? 280 : gi === 2 ? 190 : 225) + ',70%,' + (70 + Math.random() * 20) + '%,' + (0.5 * (1 - t * 0.7)).toFixed(2) + ')';
          x.beginPath(); x.arc(Math.cos(ang) * rr, Math.sin(ang) * rr * 0.55, 0.6 + Math.random() * 1.1, 0, TAU); x.fill();
        }
        galaxies.push({ img: c, x: g[0], y: g[1], s: g[2], a: g[3], rot: gi * 1.1, spd: 0.012 * (gi % 2 ? -1 : 1) });
      });
    }

    /* ---------- the cells ---------- */
    function spawn(d, instant) {
      var h1 = hashStr(d.id), h2 = hashStr(d.id + 'x'), h3 = hashStr(d.id + 'y');
      var c = { id: d.id, d: d, x: 0, y: 0, vx: 0, vy: 0, r0: 0, rt: 0, r: 0, s: 0, sv: 0, dying: false,
        rho: new Float32Array(MP), rv: new Float32Array(MP), tgt: new Float32Array(MP), tmp: new Float32Array(MP), pts: new Float32Array(MP * 2),
        qx: 0, qy: 0, minR: 0, pres: 1, past: 0, fut: 0, hl: 0, lit: 0, ghostA: 0,
        spin: h1 * TAU, spinV: (0.32 + 0.3 * h2) * (h3 < 0.5 ? 1 : -1), yoff: h3 * 2 - 1, wob: h2 * TAU, born: T, px: 0, py: 0 };
      // a new bubble opens in its own slot of time (past to the left, future to the right) and the others make room for it
      var dd = distDays(c, focusS), u = dd / horizon;
      c.x = Rt * 0.7 * Math.tanh(u * 1.25) - OFFK * offS + (h2 - 0.5) * Rt * 0.25; c.y = Rt * 0.46 * c.yoff;
      if (instant) { c.x *= 0.8; c.y *= 0.8; }
      return c;
    }
    function setCells(list, o) {
      var seen = {}, instant = !!(o && o.instant);
      horizonFor(list);
      list.forEach(function (d) {
        seen[d.id] = 1;
        var c = byId[d.id];
        if (!c) { c = spawn(d, instant || !cells.length); cells.push(c); byId[d.id] = c; if (instant) { c.s = 1; c.sv = 0; } else ripple(Math.atan2(c.y, c.x), 22); }
        else { c.d = d; c.dying = false; }
      });
      cells.forEach(function (c) { if (!seen[c.id]) c.dying = true; });
      if (instant) for (var i = 0; i < 40; i++) step(1 / 60, true);
    }
    function horizonFor(list) {                              // how far in time the middle of the road reaches: the 80th percentile of how far cells are from today
      var ds = list.map(function (d) { return Math.abs(Math.max(d.start, 0, -d.end)); }).sort(function (a, b) { return a - b; });
      horizon = ds.length ? Math.max(90, ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.8))] * 1.1) : 90;
    }
    function ripple(ang, force) {                            // a bump in the ball's skin at an angle
      var k0 = Math.round(((ang + TAU) % TAU) / TAU * MB);
      for (var d = -5; d <= 5; d++) wv[(k0 + d + MB) % MB] += force * WS * Math.exp(-d * d / 6);
    }

    /* the outline of one cell: how far, in each of 72 directions, the cell reaches before it meets its own limit, a neighbour's wall or the ball's skin */
    var cuts = [];
    function cast(c) {
      var px = c.x, py = c.y, rr = c.r, n = 0, i, m;
      for (i = 0; i < cells.length; i++) {
        var o = cells[i]; if (o === c || o.r < 2) continue;
        var dx = o.x - px, dy = o.y - py, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1e-3 || d >= rr + o.r) continue;             // not touching: nothing to cut
        var h = d / 2 + (rr * rr - o.r * o.r) / (2 * d);     // the wall between two bubbles
        if (h < 3) continue;                                 // swallowed by a much bigger neighbour: leave it alone
        if (!cuts[n]) cuts[n] = [0, 0, 0]; cuts[n][0] = dx / d; cuts[n][1] = dy / d; cuts[n][2] = h - GAP / 2; n++;
      }
      var Rw = R - GAP - 0.5, pp = px * px + py * py, tgt = c.tgt;
      for (m = 0; m < MP; m++) {
        var ux = COS[m], uy = SIN[m], t = rr - GAP * 0.25;
        for (i = 0; i < n; i++) { var nd = cuts[i][0] * ux + cuts[i][1] * uy; if (nd > 1e-4) { var tc = cuts[i][2] / nd; if (tc < t) t = tc; } }
        var b = ux * px + uy * py, tw = -b + Math.sqrt(Math.max(0, b * b - (pp - Rw * Rw)));   // the skin of the ball: a circle, bumped by the wave where the ray lands
        if (tw < t + 30) {
          var hx = px + ux * tw, hy = py + uy * tw, ang = Math.atan2(hy, hx); if (ang < 0) ang += TAU;
          var kf = ang / TAU * MB, k0 = Math.floor(kf) % MB, k1 = (k0 + 1) % MB, wf = kf - Math.floor(kf), rw2 = Rw + lerp(wave[k0], wave[k1], wf);
          tw = -b + Math.sqrt(Math.max(0, b * b - (pp - rw2 * rw2)));
          if (tw < t) t = tw;
        }
        tgt[m] = t < 2 ? 2 : t;
      }
      // round the corners where two walls meet
      var tmp = c.tmp;
      for (var pass = 0; pass < 3; pass++) {
        for (m = 0; m < MP; m++) tmp[m] = 0.25 * tgt[(m + MP - 1) % MP] + 0.5 * tgt[m] + 0.25 * tgt[(m + 1) % MP];
        for (m = 0; m < MP; m++) tgt[m] = tmp[m];
      }
    }

    /* ---------- physics ---------- */
    function distDays(c, f) { var s = c.d.start, e = c.d.end; return f < s ? s - f : f > e ? e - f : 0; }   // + still to come, - already over, 0 = it covers that day
    function litAt(c, f) {
      var s = c.d.start, e = c.d.end, span = Math.max(1, e - s), el = clamp((f - s) / span, 0, 1);
      if (c.d.lit == null) return el;
      var now = clamp((0 - s) / span, 0, 1);                 // a goal: its real progress today, scaled back when we look at the past
      return f >= 0 ? c.d.lit : (now > 0.001 ? c.d.lit * Math.min(1, el / now) : 0);
    }
    function step(dt, quiet) {
      T += dt;
      var k5 = 1 - Math.exp(-dt * 6), i, j, c;
      focusS += (focusT - focusS) * (1 - Math.exp(-dt * 5));
      var kc = 1 - Math.exp(-dt * 7); cx += (cxT - cx) * kc; cy += (cyT - cy) * kc;
      var live = 0; for (i = 0; i < cells.length; i++) if (!cells[i].dying) live++;
      var grow = smooth((live - 1) / 9);
      Rt = lerp(Rmin, Rmax, grow);
      Rv += ((Rt - R) * 26 - Rv * 6.5) * dt; R += Rv * dt;
      var K0 = lerp(0.40, 0.29, grow), A0 = 0, wRef = 1.5;
      for (i = 0; i < cells.length; i++) { c = cells[i]; c.r0 = Rt * K0 * Math.sqrt(c.d.w / wRef); if (!c.dying) A0 += Math.PI * c.r0 * c.r0; }
      var cap = Math.PI * Rt * Rt * 1.02, sc = A0 > cap ? Math.sqrt(cap / A0) : 1;
      var tau = Math.max(6, horizon * 0.05), mw = 0, mx = 0;
      for (i = cells.length - 1; i >= 0; i--) {
        c = cells[i];
        c.rt = c.r0 * sc;
        c.sv += (((c.dying ? 0 : 1) - c.s) * 70 - c.sv * (c.dying ? 12 : 8.5)) * dt; c.s += c.sv * dt; if (c.s < 0) { c.s = 0; c.sv = 0; }
        if (c.dying && c.s < 0.02) { cells.splice(i, 1); delete byId[c.id]; if (sel === c.id) { sel = null; cbSelect(null); } if (hover === c.id) hover = null; continue; }
        c.r = c.rt * c.s;
        var dd = distDays(c, focusS), pres = Math.exp(-Math.abs(dd) / tau);
        c.past += ((dd < 0 ? 0.5 + 0.5 * (1 - pres) : 0) - c.past) * k5; c.fut += ((dd > 0 ? 1 - pres : 0) - c.fut) * k5;
        c.lit += (litAt(c, focusS) - c.lit) * k5;
        c.hl += (((sel === c.id ? 1 : 0) * 0.9 + (hover === c.id || hi === c.id ? 0.55 : 0)) - c.hl) * k5;
        var u = dd / horizon;
        c.pb = Rt * 0.7 * Math.tanh(u * 1.25);                // its place on the road of time: the day we look at is 0, the future to the right, the past to the left
        c.px = c.pb + (dd === 0 ? (hashStr(c.id + 'p') - 0.5) * Rt * 0.22 : 0); c.py = Rt * 0.46 * c.yoff;
        if (!c.dying) { var aw = c.rt * c.rt * c.s; mw += aw; mx += aw * c.pb; }
      }
      offS += ((mw > 0 ? mx / mw : 0) - offS) * (1 - Math.exp(-dt * 2.4));   // the centre of all the cells, smoothed so the group glides when you move the slider
      for (i = 0; i < cells.length; i++) cells[i].px -= OFFK * offS;
      for (i = 0; i < cells.length; i++) {
        c = cells[i];
        if (drag && drag.c === c) { c.x += (drag.x - c.x) * Math.min(1, dt * 20); c.y += (drag.y - c.y) * Math.min(1, dt * 20); c.vx = c.vy = 0; continue; }
        var fx = (c.px - c.x) * 15 - c.x * 0.3, fy = (c.py - c.y) * 3.4 - c.y * 0.9;
        if (!reduced) { fx += Math.cos(T * 0.55 + c.wob) * 9; fy += Math.sin(T * 0.47 + c.wob * 1.7) * 9; }
        for (j = 0; j < cells.length; j++) {
          if (j === i) continue;
          var o = cells[j], dx = c.x - o.x, dy = c.y - o.y, d = Math.sqrt(dx * dx + dy * dy) || 0.001, min = (c.r + o.r) * 0.94;
          if (d < min) { var pu = (min - d) * 55 / d; fx += dx * pu; fy += dy * pu; }
        }
        var dist = Math.sqrt(c.x * c.x + c.y * c.y), lim = R - c.r * 0.9 - GAP;
        if (dist > lim && dist > 1e-3) { var wf = (dist - lim) * 80 / dist; fx -= c.x * wf; fy -= c.y * wf; }
        c.vx += fx * dt; c.vy += fy * dt;
        var damp = Math.exp(-5.2 * dt); c.vx *= damp; c.vy *= damp;
        c.x += c.vx * dt; c.y += c.vy * dt;
        if (dist > lim - 3 && !quiet) { var out = (c.vx * c.x + c.vy * c.y) / (dist || 1); if (out > 8) { var ang = Math.atan2(c.y, c.x); if (ang < 0) ang += TAU; wv[Math.round(ang / TAU * MB) % MB] += Math.min(out, 200) * 0.05 * WS; } }
        c.spin += c.spinV * dt * (reduced ? 0 : 1);
      }
      // the skin of the ball
      for (var k = 0; k < MB; k++) {
        var a = -24 * wave[k] + 480 * (wave[(k + MB - 1) % MB] + wave[(k + 1) % MB] - 2 * wave[k]) - 2.4 * wv[k];
        wv[k] += a * dt;
      }
      for (k = 0; k < MB; k++) { wave[k] += wv[k] * dt; if (wave[k] > 14 * WS) wave[k] = 14 * WS; else if (wave[k] < -14 * WS) wave[k] = -14 * WS; }
      // outlines: aim at the new shape, then spring after it
      for (i = 0; i < cells.length; i++) {
        c = cells[i]; if (c.r < 2) { for (j = 0; j < MP; j++) { c.rho[j] = c.r; c.rv[j] = 0; } c.minR = c.r; continue; }
        cast(c);
        var kj = reduced ? 220 : 150, dj = reduced ? 30 : 8.5, cj = 260, rho = c.rho, rv = c.rv, tg = c.tgt, ar = 0, ax = 0, ay = 0, mn = 1e9;
        for (j = 0; j < MP; j++) {
          var jm = (j + MP - 1) % MP, jp = (j + 1) % MP;
          var acc = (tg[j] - rho[j]) * kj - rv[j] * dj + (rho[jm] + rho[jp] - 2 * rho[j]) * cj + (rv[jm] + rv[jp] - 2 * rv[j]) * 14;
          rv[j] += acc * dt;
        }
        for (j = 0; j < MP; j++) {
          rho[j] += rv[j] * dt; var cap2 = tg[j] * 1.3 + 6; if (rho[j] > cap2) { rho[j] = cap2; rv[j] = 0; } else if (rho[j] < 1) { rho[j] = 1; rv[j] = 0; }
        }
        for (j = 0; j < MP; j++) {                            // centre of the outline (for the die) and its narrowest reach
          var r1 = rho[j], r2 = rho[(j + 1) % MP], tri = 0.5 * r1 * r2 * Math.sin(TAU / MP);
          ar += tri; ax += tri * (r1 * COS[j] + r2 * COS[(j + 1) % MP]) / 3; ay += tri * (r1 * SIN[j] + r2 * SIN[(j + 1) % MP]) / 3;
          if (r1 < mn) mn = r1;
        }
        var kq = 1 - Math.exp(-dt * 9); c.qx += ((ar > 1 ? ax / ar : 0) - c.qx) * kq; c.qy += ((ar > 1 ? ay / ar : 0) - c.qy) * kq; c.minR += (mn - c.minR) * kq;
      }
    }

    /* ---------- drawing ---------- */
    function drawSky() {
      var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#060818'); g.addColorStop(0.55, '#0a1030'); g.addColorStop(1, '#10163c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      galaxies.forEach(function (gx) {
        var s = Math.min(W, H) * 0.5 * gx.s / 1.1;
        ctx.save(); ctx.globalAlpha = gx.a; ctx.translate(gx.x * W - (cx - W / 2) * 0.04, gx.y * H); ctx.rotate(gx.rot + T * gx.spd); ctx.drawImage(gx.img, -s / 2, -s / 2, s, s); ctx.restore();
      });
      var ox = -(cx - W / 2) * 0.02;
      for (var i = 0; i < stars.length; i++) {
        var st = stars[i], tw = reduced ? 0.8 : 0.55 + 0.45 * Math.sin(T * (0.6 + st.z) + st.p);
        ctx.fillStyle = st.h === 30 ? 'rgba(255,225,180,' + (tw * st.z).toFixed(2) + ')' : st.h === 210 ? 'rgba(190,215,255,' + (tw * st.z).toFixed(2) + ')' : 'rgba(255,255,255,' + (tw * st.z).toFixed(2) + ')';
        var sz = st.s * st.z; ctx.fillRect((st.x * W + ox * st.z * 8 + W) % W, (st.y * H + T * 1.2 * st.z) % H, sz, sz);
      }
    }
    function curve(path, pts, n, closed) {                  // a smooth closed curve through points (flat array)
      var mx = (pts[2 * (n - 1)] + pts[0]) / 2, my = (pts[2 * (n - 1) + 1] + pts[1]) / 2;
      path.moveTo(mx, my);
      for (var i = 0; i < n; i++) {
        var j = (i + 1) % n; path.quadraticCurveTo(pts[2 * i], pts[2 * i + 1], (pts[2 * i] + pts[2 * j]) / 2, (pts[2 * i + 1] + pts[2 * j + 1]) / 2);
      }
      path.closePath();
    }
    function buildBall() {
      for (var k = 0; k < MB; k++) { var r = R + wave[k] + (reduced ? 0 : Math.sin(T * 0.8 + k * 0.17) * 0.9 * WS); ballPts[2 * k] = BC[k] * r; ballPts[2 * k + 1] = BS[k] * r; }
      ballPath = new Path2D(); curve(ballPath, ballPts, MB, true);
    }
    function drawBallBack(a) {
      var Rr = R;
      ctx.save(); ctx.globalAlpha = a;
      if (!mini) {                                           // (the little orb gets its glow from CSS; a halo here would be cut off square by the canvas)
        var halo = ctx.createRadialGradient(0, 0, Rr * 0.85, 0, 0, Rr * 1.5); halo.addColorStop(0, 'rgba(120,150,255,.20)'); halo.addColorStop(1, 'rgba(120,150,255,0)');
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, Rr * 1.5, 0, TAU); ctx.fill();
      }
      var body = ctx.createRadialGradient(-Rr * 0.25, -Rr * 0.3, Rr * 0.05, 0, 0, Rr * 1.02);
      if (mini) { body.addColorStop(0, '#2a3470'); body.addColorStop(1, '#0c1030'); }
      else { body.addColorStop(0, 'rgba(70,90,190,.34)'); body.addColorStop(0.7, 'rgba(26,36,96,.46)'); body.addColorStop(1, 'rgba(70,100,220,.34)'); }
      ctx.fillStyle = body; ctx.fill(ballPath);
      // the heart of "now": a soft warm light at the centre
      var gx = -OFFK * offS;                                 // ... which sits where the day we look at sits (left of the middle when most cells are still ahead)
      var hl = ctx.createRadialGradient(gx, 0, 0, gx, 0, Rr * 0.5); hl.addColorStop(0, 'rgba(255,214,150,' + (mini ? 0.35 : 0.22) + ')'); hl.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = hl; ctx.beginPath(); ctx.arc(gx, 0, Rr * 0.5, 0, TAU); ctx.fill();
      if (!mini) {                                           // dust floating in the unknown
        ctx.clip(ballPath);
        for (var i = 0; i < 46; i++) {
          var a1 = hashStr('d' + i) * TAU, r1 = Math.sqrt(hashStr('e' + i)) * Rr * 0.96, tw = 0.35 + 0.65 * Math.abs(Math.sin(T * 0.5 + i));
          ctx.fillStyle = 'rgba(200,215,255,' + (0.18 * tw).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(Math.cos(a1 + T * 0.01) * r1, Math.sin(a1 + T * 0.01) * r1, 0.8 + (i % 3) * 0.5, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }
    function blend(a, b, c2, wa, wb, wc) { return a * wa + b * wb + c2 * wc; }
    function paintCell(c, a) {
      var n = MP, pts = c.pts, i, sx = c.x, sy = c.y;
      for (i = 0; i < n; i++) { var rs = 0.25 * c.rho[(i + n - 1) % n] + 0.5 * c.rho[i] + 0.25 * c.rho[(i + 1) % n]; pts[2 * i] = sx + COS[i] * rs; pts[2 * i + 1] = sy + SIN[i] * rs; }
      var path = new Path2D(); curve(path, pts, n, true); c.path = path;
      var pa = c.past, fu = c.fut, pr = Math.max(0, 1 - pa - fu), hue = hueMix(c.d.hue, 36, pa * 0.5);
      var rr = Math.max(c.r, 4), ccx = sx + c.qx, ccy = sy + c.qy, hl = c.hl;
      ctx.save(); ctx.globalAlpha = a;
      if (!mini) {                                           // soft shadow under the jelly
        ctx.save(); ctx.shadowColor = 'rgba(0,0,10,' + (0.42 * (1 - fu * 0.8)).toFixed(2) + ')'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6; ctx.fillStyle = 'rgba(10,14,40,.5)'; ctx.fill(path); ctx.restore();
      }
      var g = ctx.createRadialGradient(ccx - rr * 0.22, ccy - rr * 0.32, rr * 0.08, ccx, ccy, rr * 1.15);
      var s1 = blend(76, 56, 80, pr, pa, fu), s2 = blend(58, 41, 66, pr, pa, fu), s3 = blend(42, 28, 58, pr, pa, fu);
      var sat = blend(86, 36, 70, pr, pa, fu);
      var a1 = blend(0.96, 0.94, 0.5, pr, pa, fu), a2 = blend(0.94, 0.92, 0.4, pr, pa, fu), a3 = blend(0.93, 0.92, 0.3, pr, pa, fu);
      var hh = Math.round(hue);
      g.addColorStop(0, 'hsla(' + hh + ',' + Math.round(sat) + '%,' + Math.round(s1 + hl * 6) + '%,' + a1.toFixed(2) + ')');
      g.addColorStop(0.55, 'hsla(' + hh + ',' + Math.round(sat) + '%,' + Math.round(s2 + hl * 5) + '%,' + a2.toFixed(2) + ')');
      g.addColorStop(1, 'hsla(' + hh + ',' + Math.round(sat * 0.95) + '%,' + Math.round(s3 + hl * 4) + '%,' + a3.toFixed(2) + ')');
      ctx.fillStyle = g; ctx.fill(path);
      ctx.save(); ctx.clip(path);
      // glassy rim light just inside the wall
      ctx.lineWidth = Math.max(3, rr * 0.16); ctx.strokeStyle = 'hsla(' + hh + ',90%,86%,' + (0.30 + 0.2 * hl - 0.18 * fu).toFixed(2) + ')'; ctx.stroke(path);
      if (!mini) {
        // a highlight on top, and warmth coming from below
        var hg = ctx.createRadialGradient(ccx - rr * 0.3, ccy - rr * 0.5, 0, ccx - rr * 0.3, ccy - rr * 0.5, rr * 0.75);
        hg.addColorStop(0, 'rgba(255,255,255,' + (0.38 * (1 - fu * 0.6)).toFixed(2) + ')'); hg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(ccx - rr * 0.3, ccy - rr * 0.5, rr * 0.7, rr * 0.38, -0.5, 0, TAU); ctx.fill();
        var wg = ctx.createRadialGradient(ccx + rr * 0.2, ccy + rr * 0.6, 0, ccx + rr * 0.2, ccy + rr * 0.6, rr * 0.8);
        wg.addColorStop(0, 'hsla(' + ((hh + 24) % 360) + ',100%,72%,' + (0.26 * pr + 0.1 * pa).toFixed(2) + ')'); wg.addColorStop(1, 'hsla(' + hh + ',100%,70%,0)');
        ctx.fillStyle = wg; ctx.fillRect(ccx - rr * 1.2, ccy - rr * 0.2, rr * 2.4, rr * 1.6);
      }
      ctx.restore();
      // the wall itself
      ctx.lineWidth = 1.3 + hl * 1.4; ctx.strokeStyle = 'hsla(' + hh + ',95%,' + Math.round(88 - 6 * fu) + '%,' + (0.78 * (1 - fu * 0.45) + 0.2 * hl).toFixed(2) + ')';
      if (fu > 0.35) ctx.setLineDash([5, 5]);
      ctx.stroke(path); ctx.setLineDash([]);
      if (hl > 0.05) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,' + (0.4 * hl).toFixed(2) + ')'; ctx.stroke(path); }
      // the die
      var dieR = clamp(c.minR * 0.62, 0, c.rt * 0.8), bob = reduced ? 0 : Math.sin(T * 1.1 + c.wob) * dieR * 0.05;
      if (dieR > (mini ? 2.2 : 6)) {
        Dodeca.paint(ctx, { x: ccx, y: ccy + bob - (mini ? 0 : rr * 0.02), r: dieR, spin: c.spin, lit: c.lit * 12, ghost: fu * 0.85, hue: hh, sat: Math.round(blend(86, 34, 70, pr, pa, fu)), lum: Math.round(blend(62, 54, 70, pr, pa, fu)),
          alpha: blend(1, 0.86, 0.8, pr, pa, fu), glow: pr * (0.4 + 0.6 * c.lit) * (mini ? 0.6 : 1) });
      } else if (mini || dieR > 1) {
        ctx.fillStyle = 'hsla(' + hh + ',90%,82%,' + (0.9 - 0.5 * fu).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(ccx, ccy, Math.max(1.2, dieR * 0.6), 0, TAU); ctx.fill();
      }
      // the name is written after every cell is painted, so no neighbour covers it
      c.lbl = null;
      if (!mini && c.minR > 30 && a > 0.5) {
        var fs = clamp(Math.round(c.minR * 0.26), 10, 15), ly = Math.min(ccy + dieR + fs * 1.15, ccy + c.minR * 0.86);
        c.lbl = { x: ccx, y: ly, fs: fs, maxW: Math.min(c.minR * 2.5, c.rt * 2.1), hh: hh, fu: fu, pa: pa };
      }
      ctx.restore();
    }
    var fitCache = {};
    function fitText(s, w) {
      var key = ctx.font + '|' + w.toFixed(0) + '|' + s; if (fitCache[key]) return fitCache[key];
      var out = s;
      if (ctx.measureText(s).width > w) {
        var lo = 0, hi = s.length; while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (ctx.measureText(s.slice(0, mid) + '…').width <= w) lo = mid; else hi = mid - 1; }
        out = lo > 0 ? s.slice(0, lo) + '…' : '';
      }
      if (Object.keys(fitCache).length > 400) fitCache = {};
      return (fitCache[key] = out);
    }
    function drawMembrane(a) {
      ctx.save(); ctx.globalAlpha = a; var Rr = R;
      if (!mini) { ctx.shadowColor = 'rgba(130,160,255,.55)'; ctx.shadowBlur = 22; }
      var rim;
      if (ctx.createConicGradient) {
        rim = ctx.createConicGradient(T * 0.1, 0, 0);
        rim.addColorStop(0, 'rgba(120,200,255,.85)'); rim.addColorStop(0.25, 'rgba(190,150,255,.75)'); rim.addColorStop(0.5, 'rgba(255,170,200,.7)'); rim.addColorStop(0.75, 'rgba(150,230,210,.75)'); rim.addColorStop(1, 'rgba(120,200,255,.85)');
      } else rim = 'rgba(160,190,255,.7)';
      ctx.lineWidth = mini ? 1.6 : 2.4; ctx.strokeStyle = rim; ctx.stroke(ballPath);
      ctx.shadowBlur = 0;
      // a crescent of light on the upper left
      var cg = ctx.createLinearGradient(-Rr * 0.8, -Rr * 0.8, -Rr * 0.1, -Rr * 0.95);
      cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(0.5, 'rgba(255,255,255,.5)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.lineCap = 'round'; ctx.lineWidth = mini ? 1.6 : 5; ctx.strokeStyle = cg; ctx.beginPath(); ctx.arc(0, 0, Rr * 0.955, Math.PI * 1.12, Math.PI * 1.58); ctx.stroke();
      ctx.restore();
    }
    function drawLabels(order, a) {
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      for (var i = 0; i < order.length; i++) {
        var c = order[i], L = c.lbl; if (!L) continue;
        ctx.font = '600 ' + L.fs + 'px ' + font;
        var txt = fitText(c.d.title, L.maxW);
        ctx.lineWidth = 3; ctx.strokeStyle = 'hsla(' + L.hh + ',60%,16%,' + (0.6 * (1 - L.fu * 0.6)).toFixed(2) + ')'; ctx.strokeText(txt, L.x, L.y);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.96 - 0.28 * L.fu - 0.1 * L.pa).toFixed(2) + ')'; ctx.fillText(txt, L.x, L.y);
      }
      ctx.restore();
    }
    function drawCells(a) {
      var order = cells.slice();
      order.sort(function (p, q) { var sp = (1 - p.fut - p.past * 0.6) + p.hl, sq = (1 - q.fut - q.past * 0.6) + q.hl; return sp - sq; });
      for (var i = 0; i < order.length; i++) if (order[i].r > 1.5) paintCell(order[i], a); else order[i].lbl = null;
      if (!mini) drawLabels(order, a);
    }

    /* ---------- the first time: a sun with planets, pulling back, condensing into the ball ---------- */
    function orbitOf(c, idx, n) {
      var S = Math.min(W, H) * 0.5, a = S * (0.2 + 0.62 * (idx + 0.6) / (n + 0.6)), w = 0.9 / Math.pow(a / (S * 0.3), 0.8), ph = hashStr(c.id + 'o') * TAU;
      return { a: a, w: w, ph: ph, tilt: -0.32 };
    }
    function drawIntro(p) {
      var live = cells.filter(function (c) { return !c.dying; }), n = live.length, S = Math.min(W, H) * 0.5;
      var B = smooth((p - 2.2) / 1.8), C = smooth((p - 3.7) / 2.8);
      zoom = lerp(1.5, 1.0, ease((p - 1.0) / 5.6));
      introBall = lerp(0.1, 1, C); introCell = C;
      var squash = lerp(0.42, 0.9, C), pull = lerp(1, 0.86, B);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(zoom, zoom);
      var alphaSys = 1 - smooth((p - 5.0) / 1.4);
      // the sun
      var sunR = S * lerp(0.075, 0.03, B) * (1 + 0.04 * Math.sin(T * 3)), sunA = (1 - C * 0.9) * (0.5 + 0.5 * smooth(p / 1.2));
      var sg = ctx.createRadialGradient(0, 0, 0, 0, 0, sunR * 4.2);
      sg.addColorStop(0, 'rgba(255,248,220,' + sunA + ')'); sg.addColorStop(0.18, 'rgba(255,205,110,' + (0.9 * sunA) + ')'); sg.addColorStop(0.45, 'rgba(255,140,60,' + (0.3 * sunA) + ')'); sg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, sunR * 4.2, 0, TAU); ctx.fill();
      ctx.save(); ctx.rotate(T * 0.25); ctx.fillStyle = 'rgba(255,230,170,' + (0.1 * sunA) + ')';
      for (var r = 0; r < 8; r++) { ctx.rotate(TAU / 8); ctx.beginPath(); ctx.moveTo(sunR * 0.8, -sunR * 0.12); ctx.lineTo(sunR * 3.6, 0); ctx.lineTo(sunR * 0.8, sunR * 0.12); ctx.fill(); }
      ctx.restore();
      // orbits and planets
      var targets = [];
      live.forEach(function (c, i) {
        var o = orbitOf(c, i, n), ang = o.ph + T * o.w * (1 + 0.2 * B), rad = o.a * pull;
        var ox = Math.cos(ang) * rad, oy = Math.sin(ang) * rad * squash;
        var ct = Math.cos(o.tilt), st = Math.sin(o.tilt), ex = ox * ct - oy * st, ey = ox * st + oy * ct;
        if (alphaSys > 0.02) {
          ctx.save(); ctx.rotate(o.tilt); ctx.strokeStyle = 'rgba(190,205,255,' + (0.16 * alphaSys * (1 - C)).toFixed(3) + ')'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(0, 0, rad, rad * squash, 0, 0, TAU); ctx.stroke(); ctx.restore();
        }
        var gx = lerp(ex, c.x + c.qx, C), gy = lerp(ey, c.y + c.qy, C);
        var dieR = lerp(S * 0.034 * (0.75 + 0.5 * c.d.w / 2), clamp(c.minR * 0.62, 6, 1e9), C);
        targets.push({ c: c, x: gx, y: gy, r: dieR });
      });
      targets.sort(function (a, b) { return a.y - b.y; });
      var pa = Math.max(0, 1 - C * 1.6);
      targets.forEach(function (t) {
        if (pa <= 0.02) return;
        var hh = t.c.d.hue;
        Dodeca.paint(ctx, { x: t.x, y: t.y, r: t.r, spin: t.c.spin * 2 + T * 0.8, lit: t.c.d.lit != null ? t.c.d.lit * 12 : 12 * clamp(-t.c.d.start / Math.max(1, t.c.d.end - t.c.d.start), 0, 1), hue: hh, sat: 80, lum: 62, alpha: pa, glow: 0.8 });
      });
      ctx.restore();
    }

    /* ---------- the frame ---------- */
    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (document.hidden) { last = 0; return; }
      if (mini && last && now - last < 30) return;           // the little orb only needs ~30 fps
      var dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      var sub = Math.max(1, Math.ceil(dt / (1 / 55))), i; for (i = 0; i < sub; i++) step(dt / sub);
      var ip = introT >= 0 ? T - introT : -1;
      if (ip >= INTRO) { introT = -1; ip = -1; zoom = 1; introBall = 1; introCell = 1; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (mini) ctx.clearRect(0, 0, W, H); else drawSky();
      if (ip >= 0) {
        if (ip > 5.9 && !introPop) { introPop = true; for (i = 0; i < MB; i++) wv[i] += 26 * WS; }     // the ball snaps shut
        drawIntro(ip);                                       // sets zoom / introBall / introCell for the ball below
        if (introCell > 0.01) {
          ctx.save(); ctx.translate(cx, cy); ctx.scale(zoom * introBall, zoom * introBall);
          buildBall(); drawBallBack(introCell); drawCells(introCell); drawMembrane(introCell);
          ctx.restore();
        }
      } else {
        ctx.save(); ctx.translate(cx, cy);
        buildBall(); drawBallBack(1); drawCells(1); drawMembrane(1);
        ctx.restore();
      }
    }

    /* ---------- the pointer ---------- */
    function toWorld(ev) { var r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left - cx, y: ev.clientY - r.top - cy, sx: ev.clientX - r.left, sy: ev.clientY - r.top }; }
    function inside(c, x, y) {                                // is a point inside this cell's outline?
      var dx = x - c.x, dy = y - c.y, d = Math.sqrt(dx * dx + dy * dy); if (d < 1e-6) return true;
      var a = Math.atan2(dy, dx); if (a < 0) a += TAU; var f = a / TAU * MP, m0 = Math.floor(f) % MP, m1 = (m0 + 1) % MP, k = f - Math.floor(f);
      return d <= lerp(c.rho[m0], c.rho[m1], k);
    }
    function cellAt(x, y) {                                   // x, y relative to the ball's centre
      var best = null, bs = -1e9;
      for (var i = 0; i < cells.length; i++) { var c = cells[i]; if (c.dying || c.r < 3) continue; if (inside(c, x, y)) { var s = (1 - c.fut - c.past * 0.6) + c.hl; if (s > bs) { bs = s; best = c; } } }
      return best;
    }
    function onMove(ev) {
      var p = toWorld(ev); ptr.x = p.x; ptr.y = p.y; ptr.in = true;
      if (drag) {
        drag.moved = drag.moved || Math.hypot(p.sx - drag.sx, p.sy - drag.sy) > 5;
        var lim = R - drag.c.r * 0.5, kx = p.x - drag.ox, ky = p.y - drag.oy, d = Math.hypot(kx, ky); if (d > lim) { kx *= lim / d; ky *= lim / d; }
        drag.x = kx; drag.y = ky; return;
      }
      var c = cellAt(p.x, p.y), id = c ? c.id : null;
      canvas.style.cursor = c ? 'pointer' : 'default';
      if (id !== hover) { hover = id; cbHover(id, p.sx, p.sy); } else if (id) cbHover(id, p.sx, p.sy);
    }
    function onDown(ev) {
      if (introT >= 0) return;
      var p = toWorld(ev), c = cellAt(p.x, p.y);
      if (c) { drag = { c: c, x: c.x, y: c.y, ox: p.x - c.x, oy: p.y - c.y, sx: p.sx, sy: p.sy, moved: false }; try { canvas.setPointerCapture(ev.pointerId); } catch (e) {} }
      else { var ang = Math.atan2(p.y, p.x), d = Math.hypot(p.x, p.y); if (d < R * 1.1) ripple(ang, 30); if (sel) { sel = null; cbSelect(null); } }
    }
    function onUp(ev) {
      if (!drag) return;
      var c = drag.c, moved = drag.moved; drag = null;
      try { canvas.releasePointerCapture(ev.pointerId); } catch (e) {}
      if (!moved) { sel = c.id; cbSelect(c.id); ripple(Math.atan2(c.y, c.x), 10); }
    }
    function onLeave() { ptr.in = false; if (hover) { hover = null; cbHover(null); } canvas.style.cursor = 'default'; }
    if (!mini) {
      canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp); canvas.addEventListener('pointerleave', onLeave);
    }
    var ro = null;
    if (global.ResizeObserver) { ro = new ResizeObserver(function () { measure(); }); ro.observe(canvas); }
    measure();
    raf = requestAnimationFrame(frame);

    return {
      setCells: setCells,
      setFocus: function (d) { focusT = d; },
      getFocus: function () { return focusT; },
      select: function (id) { sel = id || null; },
      highlight: function (id) { hi = id || null; },
      selected: function () { return sel; },
      playIntro: function () { if (reduced || mini) return; introT = T; introSeen = true; introPop = false; cells.forEach(function (c) { c.s = 1; c.sv = 0; }); },
      introRunning: function () { return introT >= 0; },
      skipIntro: function () { if (introT >= 0) { introT = -1; zoom = 1; introBall = 1; introCell = 1; } },
      resize: measure,
      setPadding: function (p) { pad = p; measure(); },
      cellAt: function (x, y) { var c = cellAt(x - cx, y - cy); return c ? c.id : null; },
      screenPos: function (id) { var c = byId[id]; return c ? { x: cx + c.x, y: cy + c.y, r: c.r } : null; },
      count: function () { return cells.length; },
      snapshot: function () { return canvas.toDataURL('image/png'); },
      ripple: function (a, f) { ripple(a, f); },
      destroy: function () { alive = false; cancelAnimationFrame(raf); if (ro) ro.disconnect(); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('pointerleave', onLeave); }
    };
  }
  global.Universe = { create: create };
})(window);
