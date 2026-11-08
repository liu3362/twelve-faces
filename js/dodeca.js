/* dodeca.js — a dodecahedron for canvas: 20 vertices, 12 pentagon faces (found from the vertices, so there is no face table to get wrong).
 * Dodeca.paint(ctx, {x, y, r, spin, tilt, lit, hue, sat, lum, alpha, glow, ghost})
 *   x,y   centre in pixels            r     radius in pixels
 *   spin  turn about the vertical axis (radians)         tilt  lean towards the viewer (default 0.4)
 *   lit   how many of the 12 faces glow (0..12, fractions fade the last one in)      ghost 0..1: see-through, nothing lit
 *   hue/sat/lum  colour of a lit face (degrees, %, %)   alpha  overall opacity     glow 0..1  soft halo behind the die */
(function (global) {
  'use strict';
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
  var LIGHT = vnorm([-0.4, 0.7, 0.6]);
  var P = [], Q = [];
  for (var i = 0; i < 20; i++) { P.push([0, 0]); }

  function paint(ctx, o) {
    var r = o.r; if (!(r > 1)) return;
    var a = o.spin || 0, ca = Math.cos(a), sa = Math.sin(a), tilt = o.tilt == null ? 0.4 : o.tilt, cx = Math.cos(tilt), sx = Math.sin(tilt), k = r / 1.5;
    var hue = o.hue == null ? 215 : o.hue, sat = o.sat == null ? 78 : o.sat, lum = o.lum == null ? 62 : o.lum;
    var lit = o.lit || 0, ghost = o.ghost || 0, al = o.alpha == null ? 1 : o.alpha;
    ctx.save();
    ctx.globalAlpha = al;
    if (o.glow > 0.02) {                                   // halo
      var g = ctx.createRadialGradient(o.x, o.y, r * 0.4, o.x, o.y, r * 2.1);
      g.addColorStop(0, 'hsla(' + hue + ',' + Math.min(100, sat + 14) + '%,' + Math.min(88, lum + 12) + '%,' + (0.5 * o.glow).toFixed(3) + ')');
      g.addColorStop(1, 'hsla(' + hue + ',' + sat + '%,' + lum + '%,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, r * 2.1, 0, 6.2832); ctx.fill();
    }
    for (var i = 0; i < 20; i++) {
      var v = DV[i], x1 = v[0] * ca + v[2] * sa, z1 = -v[0] * sa + v[2] * ca;
      P[i][0] = o.x + k * x1; P[i][1] = o.y - k * (v[1] * cx - z1 * sx);
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.8, r * 0.035);
    for (var fi = 0; fi < 12; fi++) {
      var f = DF[fi], n = f.n, nx = n[0] * ca + n[2] * sa, zz = -n[0] * sa + n[2] * ca, ny = n[1] * cx - zz * sx, nz = n[1] * sx + zz * cx;
      if (nz < 0.02) continue;                             // facing away
      var shade = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      var on = Math.max(0, Math.min(1, lit - f.rank)) * (1 - ghost);
      ctx.beginPath();
      for (var j = 0; j < 5; j++) { var p = P[f.idx[j]]; if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
      ctx.closePath();
      // a face is smoked glass when it is dim and a lamp when it is lit
      var gl = ghost > 0.5 ? 'hsla(' + hue + ',50%,88%,' + (0.1 + 0.1 * shade).toFixed(3) + ')'
                           : 'hsla(' + hue + ',' + Math.round(sat * 0.55) + '%,' + Math.round(11 + 9 * shade) + '%,' + (0.34 + 0.14 * shade).toFixed(3) + ')';
      ctx.fillStyle = gl; ctx.fill();
      if (on > 0.01) {
        ctx.fillStyle = 'hsla(' + hue + ',' + Math.min(100, sat + 12) + '%,' + Math.min(93, Math.round(lum + 12 + 14 * shade)) + '%,' + (on * (0.88 + 0.12 * shade)).toFixed(3) + ')';
        ctx.fill();
      }
      ctx.strokeStyle = 'hsla(' + hue + ',' + Math.round(sat * 0.5) + '%,94%,' + (0.45 + 0.4 * shade - 0.2 * ghost).toFixed(3) + ')';
      ctx.stroke();
    }
    ctx.restore();
  }
  global.Dodeca = { paint: paint, vertices: DV, faces: DF };
})(window);
