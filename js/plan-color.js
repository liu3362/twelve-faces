/* plan-color.js: colours that stay in tune, whichever hue a plan has.
 * One number goes in (the plan's hue, the same 0-359 that css hsl() takes) and a whole family comes out. The family is built the way Material You and Radix build theirs:
 * pages and panels are near-neutral (css/plan.css gives them only a whisper of the hue), and the hue lives in a few places (the buttons, the lit stage, the road) where it
 * is given the SAME lightness and about the same strength whatever the hue is, so blue, green, yellow and pink plans feel like one product and not nine.
 * Lightness is measured in OKLCH (a space where equal numbers look equally light) and every colour is checked against WCAG: white text on a fill needs 4.5:1.
 *
 *   PlanColor.apply(h)    make h the page's colour: sets --h and the accent tokens (--accent, --accent-hi, --accent-fg, --accent-ink, --accent-glow, --sel) for the scheme showing now,
 *                         and again by itself when the scheme changes (js/theme.js)
 *   PlanColor.slab(h)     {a, b}: the two colours of a lit stage (white writing sits on them)
 *   PlanColor.swatch(h)   one colour that stands for the hue (the dots in the colour picker)
 *   PlanColor.setHue(node, h)  put a stage's colour on an element: --th (hsl hue) and --tk (OKLCH hue); css then writes oklch(L C var(--tk)) for colours of equal lightness
 *   PlanColor.tone(h, L, C)  the colour of OKLCH lightness L and chroma C (as much as fits) in hue h, as #rrggbb
 *   PlanColor.contrast(a, b) WCAG contrast of two #rrggbb colours */
(function (global) {
  'use strict';
  var RAD = Math.PI / 180;
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function toLin(x) { return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
  function toSrgb(x) { return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; }
  function lchToLin(L, C, h) {
    var a = C * Math.cos(h * RAD), b = C * Math.sin(h * RAD);
    var l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  function fits(c) { for (var i = 0; i < 3; i++) if (c[i] < -0.0004 || c[i] > 1.0004) return false; return true; }
  function rgbOf(L, C, h) {                                      // [r,g,b] 0-255: that lightness and hue, and as much chroma as the screen can show (up to C)
    var c = lchToLin(L, C, h);
    if (!fits(c)) { var lo = 0, hi = C; for (var i = 0; i < 20; i++) { var mid = (lo + hi) / 2; if (fits(lchToLin(L, mid, h))) lo = mid; else hi = mid; } c = lchToLin(L, lo, h); }
    return c.map(function (x) { return Math.round(clamp01(toSrgb(clamp01(x))) * 255); });
  }
  function hex(rgb) { return '#' + rgb.map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function rgbaOf(rgb, a) { return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + a + ')'; }
  function lum(rgb) { return 0.2126 * toLin(rgb[0] / 255) + 0.7152 * toLin(rgb[1] / 255) + 0.0722 * toLin(rgb[2] / 255); }
  function parseHex(s) { var m = /^#?([0-9a-f]{6})$/i.exec(s); var n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function contrast(a, b) {
    var x = lum(typeof a === 'string' ? parseHex(a) : a), y = lum(typeof b === 'string' ? parseHex(b) : b);
    if (x < y) { var t = x; x = y; y = t; } return (x + 0.05) / (y + 0.05);
  }

  /* the plan's hue is an hsl() hue; OKLCH has its own hue angle, so look up where the pure colour of that hsl() hue sits */
  var okMemo = {};
  function okHue(h) {
    h = ((Math.round(h) % 360) + 360) % 360; if (okMemo[h] != null) return okMemo[h];
    var k = function (n) { var q = (n + h / 30) % 12; return 0.5 - 0.5 * Math.max(-1, Math.min(q - 3, 9 - q, 1)); };
    var r = toLin(k(0)), g = toLin(k(8)), b = toLin(k(4));
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    var A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    var o = (Math.atan2(B, A) / RAD + 360) % 360;
    o -= 13 * Math.max(0, 1 - Math.abs(o - 103) / 20);            // pure yellow (OKLCH 103) turns to olive mud once it is dark enough for white writing; lean it toward gold (90) so deep yellow reads as mustard
    return (okMemo[h] = o);
  }
  function tone(h, L, C) { return hex(rgbOf(L, C, okHue(h))); }
  function toneRgb(h, L, C) { return rgbOf(L, C, okHue(h)); }
  var WHITE = [255, 255, 255];
  function deepEnough(h, L, C, min) { var rgb = toneRgb(h, L, C); while (contrast(rgb, WHITE) < min && L > 0.2) { L -= 0.01; rgb = toneRgb(h, L, C); } return rgb; }   // dark enough for white writing

  /* ---------- the accent family, for the scheme showing now ---------- */
  var cur = 185, root = document.documentElement;
  function isDark() { return !!(global.Theme && global.Theme.isDark()); }
  function setVars(o) { for (var k in o) root.style.setProperty(k, o[k]); }
  function surface(bgL, bgC, glowL, glowC) {                    // the page colour and the glow at the top of it: the same lightness and strength for every hue (hsl() would make purple and green stronger than blue)
    var bg = toneRgb(cur, bgL, bgC);
    setVars({ '--bg': hex(bg), '--bg96': rgbaOf(bg, 0.96), '--bg0': rgbaOf(bg, 0), '--sky-glow': rgbaOf(toneRgb(cur, glowL, glowC), 0.8) });
  }
  function apply(h) {
    cur = ((Math.round(h) % 360) + 360) % 360;
    root.style.setProperty('--h', cur);
    if (!isDark()) {
      var fill = deepEnough(cur, 0.5, 0.14, 4.7), hi = toneRgb(cur, 0.56, 0.14), ink = deepEnough(cur, 0.44, 0.13, 7);
      setVars({ '--accent': hex(fill), '--accent-hi': hex(hi), '--accent-fg': '#ffffff', '--accent-ink': hex(ink), '--accent-glow': rgbaOf(fill, 0.22), '--sel': rgbaOf(toneRgb(cur, 0.78, 0.1), 0.45) });
      surface(0.955, 0.009, 0.93, 0.04);
    } else {
      var f2 = toneRgb(cur, 0.8, 0.12), h2 = toneRgb(cur, 0.85, 0.11);
      setVars({ '--accent': hex(f2), '--accent-hi': hex(h2), '--accent-fg': tone(cur, 0.2, 0.04), '--accent-ink': hex(toneRgb(cur, 0.82, 0.11)), '--accent-glow': rgbaOf(f2, 0.22), '--sel': rgbaOf(toneRgb(cur, 0.55, 0.12), 0.5) });
      surface(0.2, 0.012, 0.28, 0.04);
    }
  }
  if (global.Theme) global.Theme.onChange(function () { apply(cur); });

  /* ---------- a lit stage: a colour block with white writing, the same lightness for every hue ---------- */
  var slabMemo = {};
  function slab(h) {
    h = ((Math.round(h) % 360) + 360) % 360; var c = slabMemo[h]; if (c) return c;
    var a = deepEnough(h, 0.56, 0.15, 4.6), b = toneRgb(h, 0.46, 0.13);
    return (slabMemo[h] = { a: hex(a), b: hex(b) });
  }
  function swatch(h) {                                           // the colour dot: equal lightness for all, except that yellow is lifted (a mid-light yellow looks like khaki, not yellow)
    var o = okHue(h); return tone(h, 0.68 + 0.11 * Math.max(0, 1 - Math.abs(o - 92) / 24), 0.15);
  }

  function setHue(node, h) {                                      // a stage's own colour on an element: --th (the hsl hue) and --tk (the same colour's OKLCH hue, for css oklch(L C var(--tk)))
    node.style.setProperty('--th', h); node.style.setProperty('--tk', okHue(h).toFixed(1));
  }

  global.PlanColor = { apply: apply, slab: slab, swatch: swatch, tone: tone, okHue: okHue, setHue: setHue, contrast: contrast, hue: function () { return cur; } };
})(window);
