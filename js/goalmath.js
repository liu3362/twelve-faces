/* goalmath.js — how far along is a goal? Shared by the road (future.js) and the universe page.
 * Each stage has a time budget (hours a week x the stage's length). A stage is filled by the minutes studied on the goal's subject
 * (tf-hist, written by the timer) or by its ticked tasks, whichever is further along. A goal's progress is the filled share of all planned time,
 * plus the credit it kept from earlier plans (g.credit, written when a goal is re-planned). */
(function (global) {
  'use strict';
  var DAY = 864e5;
  function startOfToday() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function parse(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function nDays(a, b) { return Math.round((b - a) / DAY); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function hist() { try { return JSON.parse(localStorage.getItem('tf-hist') || '{}') || {}; } catch (e) { return {}; } }
  function budget(g, s) { return (g.hours || 5) * 60 * (nDays(parse(s.from), parse(s.to)) + 1) / 7; }
  function studied(g, s, H) {
    if (!g.face) return 0;
    H = H || hist(); var m = 0;
    for (var d in H) if (d >= s.from && d <= s.to && H[d][g.face]) m += H[d][g.face];
    return m;
  }
  function fillOf(g, s, H) {
    var b = budget(g, s), tf = b ? Math.min(1, studied(g, s, H) / b) : 0;
    var tk = s.tasks.length ? s.tasks.filter(function (x) { return x.done; }).length / s.tasks.length : 0;
    return Math.max(tf, tk);
  }
  function progress(g, H) {
    H = H || hist();
    var num = g.credit ? g.credit.m : 0, den = g.credit ? g.credit.b : 0;
    g.stages.forEach(function (s) { var b = budget(g, s); num += fillOf(g, s, H) * b; den += b; });
    return den ? Math.min(1, num / den) : 0;
  }
  global.GoalMath = { hist: hist, budget: budget, studied: studied, fillOf: fillOf, progress: progress, parse: parse, iso: iso, nDays: nDays, addDays: addDays, startOfToday: startOfToday };
})(window);
