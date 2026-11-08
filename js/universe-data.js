/* universe-data.js — what goes into the universe: your goals from the road (tf-goals), the stages and studies you add by hand (tf-uni), or a made-up example.
 * UniData.load() -> { cells: [engine cells], mode: 'mine' | 'example' }
 * An engine cell: { id, title, kind: 'goal'|'study'|'life', hue, start, end (day offsets from today), w (size), lit (0..1, goals only), from, to (ISO or ''), open, goalId, note, sample } */
(function (global) {
  'use strict';
  var KEY = 'tf-uni', DAY = 864e5;
  var HUES = [215, 155, 5, 48, 290, 330, 190, 100];
  function today0() { return GoalMath.startOfToday(); }
  function dayOff(s) { var d = GoalMath.parse(s); return d ? GoalMath.nDays(today0(), d) : null; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function weightFor(days) { return clamp(0.6 + Math.log10(1 + Math.max(1, days)) * 0.55, 0.7, 2.5); }

  function state() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && Array.isArray(v.cells)) return v; } catch (e) {}
    return { v: 1, cells: [], ex: false, seen: false };
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function uid() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function fromCustom(c) {
    var start = dayOff(c.from); if (start == null) return null;
    var end = c.to ? dayOff(c.to) : null, open = end == null;
    if (open) end = Math.max(start + 30, 30);
    if (end < start) end = start;
    return { id: c.id, title: c.title, kind: c.kind === 'study' ? 'study' : 'life', hue: c.hue == null ? 215 : c.hue, start: start, end: end, w: weightFor(end - start), from: c.from, to: c.to || '', open: open, note: c.note || '' };
  }
  function fromGoal(g) {
    var start = dayOff(g.created), end = dayOff(g.date); if (start == null || end == null) return null;
    if (end < start) end = start;
    return { id: 'g:' + g.id, title: g.title, kind: 'goal', hue: g.hue == null ? 215 : g.hue, start: start, end: end, w: weightFor(end - start),
      lit: GoalMath.progress(g), from: g.created, to: g.date, open: false, goalId: g.id, summary: g.summary || '', stage: currentStage(g) };
  }
  function currentStage(g) {
    var td = GoalMath.iso(today0());
    for (var i = 0; i < g.stages.length; i++) if (g.stages[i].to >= td) return { label: g.stages[i].label, to: g.stages[i].to, from: g.stages[i].from, kind: g.stages[i].kind };
    return null;
  }
  function goals() {
    try { var v = JSON.parse(localStorage.getItem('tf-goals') || 'null'); return v && Array.isArray(v.goals) ? v.goals : []; } catch (e) { return []; }
  }

  /* a made-up life, measured from today, so the example always has a past, a present and a future */
  var EX = [
    [-8200, -5600, 'life', 35, null], [-5500, -2400, 'life', 160, null], [-2300, -520, 'life', 265, null], [-2000, -1500, 'study', 195, null],
    [-500, 420, 'life', 330, null], [-130, 90, 'study', 12, 0.55], [-34, 110, 'goal', 215, 0.34], [-12, 700, 'goal', 155, 0.08],
    [60, 330, 'goal', 48, null], [420, 1250, 'life', 290, null], [800, 1100, 'life', 190, null], [1000, 1800, 'goal', 100, null]
  ];
  function sample() {
    return EX.map(function (e, i) {
      var from = GoalMath.iso(GoalMath.addDays(today0(), e[0])), to = GoalMath.iso(GoalMath.addDays(today0(), e[1]));
      var c = { id: 'ex' + i, title: t('un.ex.' + (i + 1)), kind: e[2], hue: e[3], start: e[0], end: e[1], w: weightFor(e[1] - e[0]), from: from, to: to, open: false, sample: true };
      if (e[4] != null) c.lit = e[4];
      return c;
    });
  }

  function load() {
    var s = state(), mine = [];
    goals().forEach(function (g) { var c = fromGoal(g); if (c) mine.push(c); });
    s.cells.forEach(function (c) { var x = fromCustom(c); if (x) mine.push(x); });
    var example = (s.ex || !mine.length);
    return { cells: example ? sample() : mine, mode: example ? 'example' : 'mine', mineCount: mine.length, wantsExample: !!s.ex };
  }
  function addCustom(c) { var s = state(); c.id = c.id || uid(); s.cells.push(c); s.ex = false; save(s); return c.id; }
  function updateCustom(c) { var s = state(); for (var i = 0; i < s.cells.length; i++) if (s.cells[i].id === c.id) { s.cells[i] = c; save(s); return true; } return false; }
  function removeCustom(id) { var s = state(); s.cells = s.cells.filter(function (c) { return c.id !== id; }); save(s); }
  function getCustom(id) { return state().cells.filter(function (c) { return c.id === id; })[0] || null; }
  function setExample(on) { var s = state(); s.ex = !!on; save(s); }
  function seen() { return !!state().seen; }
  function markSeen() { var s = state(); s.seen = true; save(s); }

  global.UniData = { load: load, addCustom: addCustom, updateCustom: updateCustom, removeCustom: removeCustom, getCustom: getCustom, setExample: setExample, seen: seen, markSeen: markSeen,
    dayOff: dayOff, HUES: HUES, weightFor: weightFor, uid: uid };
})(window);
