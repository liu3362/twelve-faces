/* dodeca.js — a dodecahedron for canvas: 20 vertices, 12 pentagon faces (found from the vertices, so there is no face table to get wrong).
 * Dodeca.paint(ctx, {x, y, r, spin, tilt, lit, hue, sat, lum, alpha, glow, ghost,  round, axis, dwell, gloss, mode})
 *   x,y   centre in pixels            r     radius in pixels
 *   spin  turn about the vertical axis (radians)         tilt  lean towards the viewer (default 0.4)
 *   lit   how many of the 12 faces glow (0..12, fractions fade the last one in)      ghost 0..1: see-through, nothing lit
 *   hue/sat/lum  colour of a lit face (degrees, %, %)   alpha  overall opacity     glow 0..1  soft halo behind the die
 *  The next four are what makes the die look right while it turns (all optional; leave them out and you get the plain crystal):
 *   round 0..1   0 = a sharp crystal, 1 = a smooth ball with the twelve faces as curved patches; in between the edges swell like a gummy sweet
 *   axis         what it turns about: 'edge' (the old way, a 2-fold axis), 'face' (through two opposite faces: a 5-fold crown that always looks tidy), 'vertex' (3-fold)
 *   dwell 0..1   the turn lingers on the symmetric poses and sweeps through the awkward ones in between (0 = even speed)
 *   gloss 0..1   soft shading on every patch, a rim and a glint (default 1 when round > 0, else 0)
 *   mode         'stars' draws the twelve faces as twelve stars joined into a constellation instead */
(function (global) {
  'use strict';
  var PHI = (1 + Math.sqrt(5)) / 2, SQ3 = Math.sqrt(3), TAU = Math.PI * 2, DV = [], DF = [];
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
    [A, B].forEach(function (set) {                       // one of the two candidate sets is the real face normals: each has 5 vertices level at the top
      if (DF.length === 12) return;
      var out = [];
      set.forEach(function (n) {
        var d = DV.map(function (v, i) { return [vdot(v, n), i]; }).sort(function (p, q) { return q[0] - p[0]; });
        if (Math.abs(d[0][0] - d[4][0]) < 1e-6 && d[4][0] - d[5][0] > 1e-3) out.push({ n: vnorm(n), idx: d.slice(0, 5).map(function (p) { return p[1]; }) });
      });
      if (out.length === 12) DF = out;
    });
    DF.forEach(function (f) {                             // walk each face's corners in order
      var u = vcross(f.n, [0, 0, 1]); if (Math.abs(u[0]) + Math.abs(u[1]) + Math.abs(u[2]) < 1e-3) u = vcross(f.n, [0, 1, 0]);
      u = vnorm(u); var w = vcross(f.n, u);
      f.idx.sort(function (a, b) { return Math.atan2(vdot(DV[a], w), vdot(DV[a], u)) - Math.atan2(vdot(DV[b], w), vdot(DV[b], u)); });
    });
    var ord = DF.slice().sort(function (a, b) { return a.n[1] - b.n[1]; });   // faces light from the bottom of the die upward
    DF.forEach(function (f) { f.rank = ord.indexOf(f); });
  })();
  var INR = vdot(DF[0].n, DV[DF[0].idx[0]]);               // how far a face is from the centre (the corners are SQ3 away)
  var LIGHT = vnorm([-0.4, 0.7, 0.6]);

  /* ---------- which way it stands: the die is turned so that the axis it spins about is the vertical one ---------- */
  function mmul(a, b) { var o = [], i, j, k; for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) { var s = 0; for (k = 0; k < 3; k++) s += a[i * 3 + k] * b[k * 3 + j]; o.push(s); } return o; }
  function mapply(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
  function matY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function matTo(a, b) {                                   // the turn that carries unit vector a onto unit vector b
    var v = vcross(a, b), c = vdot(a, b), s2 = vdot(v, v);
    if (s2 < 1e-12) return c > 0 ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : [1, 0, 0, 0, -1, 0, 0, 0, -1];
    var k = (1 - c) / s2;
    return [1 - k * (v[1] * v[1] + v[2] * v[2]), -v[2] + k * v[0] * v[1], v[1] + k * v[0] * v[2],
            v[2] + k * v[0] * v[1], 1 - k * (v[0] * v[0] + v[2] * v[2]), -v[0] + k * v[1] * v[2],
            -v[1] + k * v[0] * v[2], v[0] + k * v[1] * v[2], 1 - k * (v[0] * v[0] + v[1] * v[1])];
  }
  function upright(m, v) {                                 // roll about the vertical so that v lies in the plane of the screen's depth: a mirror plane then faces us at spin 0
    var p = mapply(m, v); return mmul(matY(-Math.atan2(p[0], p[2])), m);
  }
  var FOLD = { edge: 2, face: 5, vertex: 3 }, ORI = {}, RANK = {};
  (function () {
    ORI.edge = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    var top = DF.slice().sort(function (a, b) { return b.n[1] - a.n[1] || b.n[0] - a.n[0] || b.n[2] - a.n[2]; })[0];
    ORI.face = upright(matTo(top.n, [0, 1, 0]), DV[top.idx[0]]);
    var v0 = DV[0], near = DV.map(function (v, i) { return [Math.pow(v[0] - v0[0], 2) + Math.pow(v[1] - v0[1], 2) + Math.pow(v[2] - v0[2], 2), i]; }).sort(function (a, b) { return a[0] - b[0]; })[1][1];
    ORI.vertex = upright(matTo(vnorm(v0), [0, 1, 0]), DV[near]);
    RANK.edge = DF.map(function (f) { return f.rank; });
    ['face', 'vertex'].forEach(function (ax) {
      var M = ORI[ax], key = DF.map(function (f, i) {
        var n = mapply(M, f.n), az = (Math.atan2(n[0], n[2]) + Math.PI) / TAU;
        var y = n[1]; if (ax === 'face') y = y < -0.99 ? 0.5 : y;   // the face underneath is hidden by the lean: let it light near the end, and the top one last
        return [y + 0.05 * az, i];
      }).sort(function (a, b) { return a[0] - b[0]; });
      RANK[ax] = []; key.forEach(function (k, rank) { RANK[ax][k[1]] = rank; });
    });
  })();

  /* ---------- the shape: for each face, its outline as points along the edges; the edges swell outwards towards the sphere by `round` ---------- */
  var SHAPES = {};
  function shapeFor(axis, m, N) {
    var key = axis + ':' + Math.round(m * 24) + ':' + N, sh = SHAPES[key]; if (sh) return sh;
    var M = ORI[axis], pts = new Float32Array(12 * 5 * N * 3), nrm = new Float32Array(36), rad = INR + m * (SQ3 - INR), q = 0, fi, j, s;
    for (fi = 0; fi < 12; fi++) {
      var f = DF[fi], n = mapply(M, f.n); nrm[fi * 3] = n[0]; nrm[fi * 3 + 1] = n[1]; nrm[fi * 3 + 2] = n[2];
      for (j = 0; j < 5; j++) {
        var va = DV[f.idx[j]], vb = DV[f.idx[(j + 1) % 5]];
        for (s = 0; s < N; s++) {
          var t = s / N, c = [va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t, va[2] + (vb[2] - va[2]) * t];
          var L = Math.sqrt(vdot(c, c)), g = 1 + m * (SQ3 / L - 1), p = mapply(M, [c[0] * g, c[1] * g, c[2] * g]);
          pts[q++] = p[0]; pts[q++] = p[1]; pts[q++] = p[2];
        }
      }
    }
    return (SHAPES[key] = { pts: pts, nrm: nrm, rad: rad, N: N });
  }
  function spinMap(a, axis, d) {                            // linger on the tidy poses (a mirror plane facing us, every pi/fold), hurry through the rest
    if (!(d > 0)) return a;
    var s = Math.PI / FOLD[axis]; return a - d * (s / TAU) * Math.sin(TAU * a / s);
  }

  /* ---------- drawing ---------- */
  var X = new Float32Array(300 * 2), Y = new Float32Array(300 * 2), Z = new Float32Array(300 * 2);
  var PROF = new Float32Array(48), HX = [], HY = [];
  function hull(n) {                                        // the outline of the projected points (monotone chain)
    var idx = [], i; for (i = 0; i < n; i++) idx.push(i);
    idx.sort(function (a, b) { return HX[a] - HX[b] || HY[a] - HY[b]; });
    function cross(o, a, b) { return (HX[a] - HX[o]) * (HY[b] - HY[o]) - (HY[a] - HY[o]) * (HX[b] - HX[o]); }
    var lo = [], up = [];
    for (i = 0; i < idx.length; i++) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], idx[i]) <= 0) lo.pop(); lo.push(idx[i]); }
    for (i = idx.length - 1; i >= 0; i--) { while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], idx[i]) <= 0) up.pop(); up.push(idx[i]); }
    lo.pop(); up.pop(); return lo.concat(up);
  }
  function profile(poly, m, R0) {                           // how far the outline reaches in each of 48 directions: the outline of the swollen crystal, and nearly a perfect circle when it is nearly a ball
    for (var b = 0; b < 48; b++) {
      var ang = b / 48 * TAU, dx = Math.cos(ang), dy = Math.sin(ang), best = 0;
      for (var i = 0; i < poly.length; i++) {                // where the ray from the centre leaves this edge of the outline
        var a = poly[i], c = poly[(i + 1) % poly.length], ex = HX[c] - HX[a], ey = HY[c] - HY[a], den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        var t = (HX[a] * ey - HY[a] * ex) / den, u = (HX[a] * dy - HY[a] * dx) / den;
        if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6 && t > best) best = t;
      }
      var w = m * m * m * m; PROF[b] = best + w * (R0 - best);
    }
  }
  function radiusAt(ang) { var f = (ang < 0 ? ang + TAU : ang) / TAU * 48, b0 = Math.floor(f) % 48, b1 = (b0 + 1) % 48, w = f - Math.floor(f); return PROF[b0] + (PROF[b1] - PROF[b0]) * w; }
  function smoothPath(cx, cy, pts) {                        // a closed curve through the 48 outline points
    var n = 48, p = new Path2D(), mx = (pts[2 * (n - 1)] + pts[0]) / 2, my = (pts[2 * (n - 1) + 1] + pts[1]) / 2;
    p.moveTo(cx + mx, cy + my);
    for (var i = 0; i < n; i++) { var j = (i + 1) % n; p.quadraticCurveTo(cx + pts[2 * i], cy + pts[2 * i + 1], cx + (pts[2 * i] + pts[2 * j]) / 2, cy + (pts[2 * i + 1] + pts[2 * j + 1]) / 2); }
    p.closePath(); return p;
  }
  var OUT = new Float32Array(96);

  function halo(ctx, o, hue, sat, lum) {
    var g = ctx.createRadialGradient(o.x, o.y, o.r * 0.4, o.x, o.y, o.r * 2.1);
    g.addColorStop(0, 'hsla(' + hue + ',' + Math.min(100, sat + 14) + '%,' + Math.min(88, lum + 12) + '%,' + (0.5 * o.glow).toFixed(3) + ')');
    g.addColorStop(1, 'hsla(' + hue + ',' + sat + '%,' + lum + '%,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 2.1, 0, TAU); ctx.fill();
  }

  function paint(ctx, o) {
    var r = o.r; if (!(r > 1)) return;
    if (o.mode === 'stars') return paintStars(ctx, o);
    var m = o.round > 0 ? Math.min(1, o.round) : 0, axis = FOLD[o.axis] ? o.axis : 'edge', gloss = o.gloss == null ? (m > 0 ? 1 : 0) : o.gloss;
    var N = m > 0.01 ? (r < 9 ? 2 : r < 24 ? 3 : 4) : 1, sh = shapeFor(axis, m < 0.01 ? 0 : m, N), rank = RANK[axis];
    var a = spinMap(o.spin || 0, axis, o.dwell || 0), ca = Math.cos(a), sa = Math.sin(a), tilt = o.tilt == null ? 0.4 : o.tilt, cx = Math.cos(tilt), sx = Math.sin(tilt), k = r / 1.5;
    var hue = o.hue == null ? 215 : o.hue, sat = o.sat == null ? 78 : o.sat, lum = o.lum == null ? 62 : o.lum;
    var lit = o.lit || 0, ghost = o.ghost || 0, al = o.alpha == null ? 1 : o.alpha, soft = m > 0.01 || gloss > 0, i, j, fi;
    ctx.save();
    ctx.globalAlpha = al;
    if (o.glow > 0.02) halo(ctx, o, hue, sat, lum);
    var P = sh.pts, per = 5 * N, np = 12 * per;
    for (i = 0; i < np; i++) {                              // turn and project every outline point
      var x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
      X[i] = k * x1; Y[i] = -k * (y * cx - z1 * sx); Z[i] = y * sx + z1 * cx;
    }
    // which faces face us, and in what order to paint them
    var vis = [], thr = 0.02 - 0.62 * m, nz = [], shade = [];
    for (fi = 0; fi < 12; fi++) {
      var nx0 = sh.nrm[fi * 3], ny0 = sh.nrm[fi * 3 + 1], nz0 = sh.nrm[fi * 3 + 2], nx = nx0 * ca + nz0 * sa, zz = -nx0 * sa + nz0 * ca, ny = ny0 * cx - zz * sx, nzz = ny0 * sx + zz * cx;
      nz[fi] = nzz; shade[fi] = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nzz * LIGHT[2]);
      if (nzz > thr) vis.push(fi);
    }
    if (m > 0.01) vis.sort(function (p, q) { return nz[p] - nz[q]; });
    var sil = null;
    if (soft) {                                             // the outline of the whole die, so the round parts have something to be round against
      for (j = 0; j < np; j++) { HX[j] = X[j]; HY[j] = Y[j]; }
      profile(hull(np), m, SQ3 * k);
      for (j = 0; j < 48; j++) { var an = j / 48 * TAU; OUT[2 * j] = Math.cos(an) * PROF[j]; OUT[2 * j + 1] = Math.sin(an) * PROF[j]; }
      sil = smoothPath(o.x, o.y, OUT);
      ctx.fillStyle = ghost > 0.5 ? 'hsla(' + hue + ',50%,88%,0.07)' : 'hsla(' + hue + ',' + Math.round(sat * 0.5) + '%,13%,' + (0.3 + 0.1 * gloss).toFixed(2) + ')';
      ctx.fill(sil);
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.8, r * 0.035);
    for (var vi = 0; vi < vis.length; vi++) {
      fi = vis[vi];
      var on = Math.max(0, Math.min(1, lit - rank[fi])) * (1 - ghost), sd = shade[fi], base = fi * per, fx = 0, fy = 0, rf = 0;
      ctx.beginPath();
      for (j = 0; j < per; j++) {
        var px = X[base + j], py = Y[base + j];
        if (m > 0.01) {                                      // a point that is round the back of the swelling part is pressed against the die's outline instead
          var vz2 = (1 - m) * nz[fi] + m * Z[base + j] / SQ3;
          if (vz2 < 0) { var rho = Math.sqrt(px * px + py * py) || 1, edge = radiusAt(Math.atan2(py, px)) * 0.985; px *= edge / rho; py *= edge / rho; }
        }
        px += o.x; py += o.y; X[np + j] = px; Y[np + j] = py;   // (kept in the spare half of the arrays for the shading below)
        if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        fx += px; fy += py;
      }
      ctx.closePath(); fx /= per; fy /= per;
      for (j = 0; j < per; j++) { var dd = Math.hypot(X[np + j] - fx, Y[np + j] - fy); if (dd > rf) rf = dd; }
      // a face is smoked glass when it is dim and a lamp when it is lit
      if (ghost > 0.5) ctx.fillStyle = 'hsla(' + hue + ',50%,88%,' + (0.1 + 0.1 * sd).toFixed(3) + ')';
      else if (gloss > 0 && r > 7) {
        var gd = ctx.createRadialGradient(fx - rf * 0.2, fy - rf * 0.25, 0, fx, fy, rf * 1.05);
        gd.addColorStop(0, 'hsla(' + hue + ',' + Math.round(sat * 0.55) + '%,' + Math.round(20 + 14 * sd) + '%,' + (0.30 + 0.18 * sd).toFixed(3) + ')');
        gd.addColorStop(1, 'hsla(' + hue + ',' + Math.round(sat * 0.55) + '%,' + Math.round(8 + 6 * sd) + '%,' + (0.42 + 0.14 * sd).toFixed(3) + ')');
        ctx.fillStyle = gd;
      } else ctx.fillStyle = 'hsla(' + hue + ',' + Math.round(sat * 0.55) + '%,' + Math.round(11 + 9 * sd) + '%,' + (0.34 + 0.14 * sd).toFixed(3) + ')';
      ctx.fill();
      if (on > 0.01) {
        if (gloss > 0 && r > 7) {
          var gl = ctx.createRadialGradient(fx - rf * 0.2, fy - rf * 0.3, 0, fx, fy, rf * 1.05);
          gl.addColorStop(0, 'hsla(' + hue + ',' + Math.min(100, sat + 8) + '%,' + Math.min(95, Math.round(lum + 22 + 12 * sd)) + '%,' + (on * 0.96).toFixed(3) + ')');
          gl.addColorStop(1, 'hsla(' + hue + ',' + Math.min(100, sat + 14) + '%,' + Math.min(90, Math.round(lum + 4 + 8 * sd)) + '%,' + (on * 0.8).toFixed(3) + ')');
          ctx.fillStyle = gl;
        } else ctx.fillStyle = 'hsla(' + hue + ',' + Math.min(100, sat + 12) + '%,' + Math.min(93, Math.round(lum + 12 + 14 * sd)) + '%,' + (on * (0.88 + 0.12 * sd)).toFixed(3) + ')';
        ctx.fill();
      }
      ctx.strokeStyle = 'hsla(' + hue + ',' + Math.round(sat * 0.5) + '%,94%,' + (0.45 + 0.4 * sd - 0.2 * ghost).toFixed(3) + ')';
      ctx.stroke();
    }
    if (soft && gloss > 0 && sil) {                         // volume: light from the upper left, a darker rim, a bright thin edge and a glint
      var R0 = SQ3 * k;
      ctx.save(); ctx.clip(sil);
      var vg = ctx.createRadialGradient(o.x - R0 * 0.34, o.y - R0 * 0.4, 0, o.x - R0 * 0.1, o.y - R0 * 0.12, R0 * 1.02);
      vg.addColorStop(0, 'rgba(255,255,255,' + (0.30 * gloss * (1 - ghost)).toFixed(3) + ')'); vg.addColorStop(0.45, 'rgba(255,255,255,0)');
      vg.addColorStop(0.78, 'rgba(8,10,40,0)'); vg.addColorStop(1, 'rgba(8,10,40,' + (0.34 * gloss).toFixed(3) + ')');
      ctx.fillStyle = vg; ctx.fillRect(o.x - R0 * 1.2, o.y - R0 * 1.2, R0 * 2.4, R0 * 2.4);
      ctx.restore();
      ctx.lineWidth = Math.max(0.8, r * 0.03); ctx.strokeStyle = 'hsla(' + hue + ',' + Math.round(sat * 0.6) + '%,92%,' + (0.5 * gloss * (1 - 0.5 * ghost)).toFixed(3) + ')'; ctx.stroke(sil);
      if (r > 9 && ghost < 0.8) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.38 * gloss).toFixed(3) + ')'; ctx.beginPath();
        ctx.ellipse(o.x - R0 * 0.42, o.y - R0 * 0.5, R0 * 0.15, R0 * 0.065, -0.7, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  /* twelve stars, one for each face, joined to their five nearest neighbours: a constellation that turns */
  var LINKS = [];
  (function () { for (var i = 0; i < 12; i++) for (var j = i + 1; j < 12; j++) if (vdot(DF[i].n, DF[j].n) > 0.4) LINKS.push([i, j]); })();
  function paintStars(ctx, o) {
    var r = o.r, axis = FOLD[o.axis] ? o.axis : 'face', M = ORI[axis], rank = RANK[axis];
    var a = spinMap(o.spin || 0, axis, o.dwell || 0), ca = Math.cos(a), sa = Math.sin(a), tilt = o.tilt == null ? 0.4 : o.tilt, cx = Math.cos(tilt), sx = Math.sin(tilt), k = r / 1.5;
    var hue = o.hue == null ? 215 : o.hue, sat = o.sat == null ? 78 : o.sat, lum = o.lum == null ? 62 : o.lum, lit = o.lit || 0, ghost = o.ghost || 0, al = o.alpha == null ? 1 : o.alpha;
    var R0 = SQ3 * k * 0.98, S = [], i, j;
    ctx.save(); ctx.globalAlpha = al;
    if (o.glow > 0.02) halo(ctx, o, hue, sat, lum);
    var bg = ctx.createRadialGradient(o.x - R0 * 0.3, o.y - R0 * 0.35, 0, o.x, o.y, R0);
    bg.addColorStop(0, 'hsla(' + hue + ',60%,70%,' + (0.14 * (1 - ghost * 0.6)).toFixed(3) + ')'); bg.addColorStop(1, 'hsla(' + hue + ',60%,40%,' + (0.03).toFixed(3) + ')');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(o.x, o.y, R0, 0, TAU); ctx.fill();
    for (i = 0; i < 12; i++) {
      var n = mapply(M, DF[i].n), x1 = n[0] * ca + n[2] * sa, z1 = -n[0] * sa + n[2] * ca;
      S.push({ i: i, x: o.x + R0 * x1, y: o.y - R0 * (n[1] * cx - z1 * sx), z: n[1] * sx + z1 * cx, on: Math.max(0, Math.min(1, lit - rank[i])) * (1 - ghost) });
    }
    ctx.lineCap = 'round';
    for (j = 0; j < LINKS.length; j++) {                    // the lines, fainter at the back
      var p = S[LINKS[j][0]], q = S[LINKS[j][1]], depth = (Math.min(p.z, q.z) + 1) / 2, both = Math.min(p.on, q.on);
      ctx.lineWidth = Math.max(0.6, r * (0.02 + 0.02 * both));
      ctx.strokeStyle = 'hsla(' + hue + ',' + Math.round(40 + 40 * both) + '%,' + Math.round(82 + 8 * both) + '%,' + ((0.07 + 0.3 * depth * depth + 0.4 * both * depth) * (1 - ghost * 0.5)).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    S.sort(function (p, q) { return p.z - q.z; });
    for (i = 0; i < 12; i++) {                              // the stars: big and bright at the front
      var s = S[i], d = (s.z + 1) / 2, sz = r * (0.07 + 0.1 * d) * (1 + 0.5 * s.on);
      if (s.on > 0.02 || d > 0.3) {
        var g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, sz * (s.on > 0.02 ? 4.2 : 2.6));
        g.addColorStop(0, 'hsla(' + (s.on > 0.02 ? hue : 215) + ',' + (s.on > 0.02 ? Math.min(100, sat + 14) : 30) + '%,' + (s.on > 0.02 ? Math.min(92, lum + 24) : 90) + '%,' + ((s.on > 0.02 ? 0.55 * s.on : 0.18) * (0.4 + 0.6 * d)).toFixed(3) + ')');
        g.addColorStop(1, 'hsla(' + hue + ',80%,70%,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, sz * (s.on > 0.02 ? 4.2 : 2.6), 0, TAU); ctx.fill();
      }
      ctx.fillStyle = s.on > 0.02 ? 'hsla(' + hue + ',' + Math.min(100, sat + 10) + '%,' + Math.min(96, lum + 28) + '%,' + ((0.5 + 0.5 * s.on) * (0.5 + 0.5 * d)).toFixed(3) + ')' : 'hsla(215,40%,88%,' + (0.28 + 0.4 * d).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.8, sz * (s.on > 0.02 ? 0.62 : 0.5)), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  global.Dodeca = { paint: paint, vertices: DV, faces: DF, orientations: ORI };
})(window);
