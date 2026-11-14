/* plan-ai.js — what the AI does for a long-range plan. Every call returns a Promise and takes an AbortSignal.
 *   PlanAI.outline({title, end, days, hours, level, note}, signal) -> { ok, reason, summary, stages: [{phase, title, goal, days}], partial }
 *   PlanAI.draft(plan, i, want, signal)   -> { goal, tasks: [text], res: [{kind, title, note, q}], practice: [{q, hint}] }   (only the parts asked for in `want`)
 *   PlanAI.check(plan, i, item, signal)   -> { v: 'right'|'partly'|'wrong', fb, model }
 *   PlanAI.split(plan, i, k, signal)      -> [{title, goal, days}]
 *   PlanAI.ask(plan, i, history, onText, signal) -> the answer text (streamed through onText)
 * The AI never gives web addresses: for books, videos and courses it names them, and the page builds the search links itself.
 * (Prompts live in the language packs as pl.sys and pl.p.*) */
(function (global) {
  'use strict';
  var PD = global.PlanData;

  function line(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function bad() { var e = new Error('bad_json'); e.code = 'bad_json'; return e; }
  function thinkOn() { try { return localStorage.getItem('tf-think') !== '0'; } catch (e) { return true; } }
  function lang() { return t('lang.name'); }
  function fmtD(iso) { var d = global.GoalMath.parse(iso); if (!d) return iso; try { return d.toLocaleDateString(t('lang.html'), { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return iso; } }

  /* how many stages a syllabus of this length should have: enough to see the path, few enough to see it all at once */
  function stageRange(days) {
    if (days <= 60) return [6, 10];
    if (days <= 180) return [10, 18];
    if (days <= 400) return [14, 26];
    if (days <= 800) return [20, 36];
    if (days <= 1500) return [26, 46];
    return [32, 60];
  }
  function outlineList(plan, mark) {
    return plan.steps.map(function (s, k) { return (k === mark ? '→ ' : '') + (k + 1) + '. ' + s.title + (s.phase ? ' [' + s.phase + ']' : ''); }).join('\n');
  }
  function run(prompt, opt) {
    return AI.json({ system: t('pl.sys'), messages: [{ role: 'user', content: prompt }], maxTokens: opt.max, signal: opt.signal, idleMs: opt.idle || 60000, think: !!opt.think });
  }

  /* ---------- the whole outline ---------- */
  function outline(o, signal) {
    var r = stageRange(o.days), th = thinkOn();
    var prompt = t('pl.p.outline', {
      today: PD.today(), goal: o.title, end: o.end, days: o.days, level: o.level || t('none'), hours: o.hours, min: r[0], max: r[1],
      note: o.note ? t('pl.p.note', { note: o.note }) : '', lang: lang()
    });
    return run(prompt, { max: th ? 14000 : 8000, signal: signal, idle: 90000, think: th }).then(function (raw) {
      if (raw && raw.ok === false) return { ok: false, reason: line(raw.reason, 240) };
      var src = arr(raw && raw.stages);
      if (!src.length && raw && Array.isArray(raw.phases)) {                          // some models nest the stages inside their phases
        raw.phases.forEach(function (p) { arr(p && p.stages).forEach(function (s) { s = s || {}; s.phase = s.phase || (p && (p.name || p.title)); src.push(s); }); });
      }
      var stages = src.map(function (x) {
        x = x || {}; var d = parseInt(x.days, 10);
        return { phase: line(x.phase, 60), title: line(x.title || x.label, 120), goal: line(x.goal, 300), days: isNaN(d) || d < 1 ? 14 : Math.min(d, 1000) };
      }).filter(function (x) { return x.title; });
      if (!stages.length) throw bad();
      return { ok: true, summary: line(raw && raw.summary, 300), stages: stages, partial: !!(raw && raw._partial) };
    });
  }

  /* ---------- one stage in detail ---------- */
  function draft(plan, i, want, signal) {
    var s = plan.steps[i], ds = PD.dates(plan)[i], parts = [], have = [];
    if (want.tasks && s.tasks.length) have.push(t('pl.p.haveTasks', { list: s.tasks.slice(0, 30).map(function (x) { return x.t; }).join('; ') }));
    if (want.res && s.res.length) have.push(t('pl.p.haveRes', { list: s.res.slice(0, 20).map(function (x) { return x.title; }).join('; ') }));
    if (want.practice && s.practice.length) have.push(t('pl.p.havePractice', { list: s.practice.slice(0, 20).map(function (x) { return x.q.replace(/\s+/g, ' ').slice(0, 80); }).join(' | ') }));
    ['goal', 'tasks', 'materials', 'practice'].forEach(function (k) {
      var key = k === 'materials' ? 'res' : k;
      if (want[key] || want[k]) parts.push(t('pl.p.part.' + k, { hours: plan.hours, days: s.days }));
    });
    var prompt = t('pl.p.draft', {
      today: PD.today(), goal: plan.title, level: plan.level || t('none'), hours: plan.hours, outline: outlineList(plan, i), n: i + 1, title: s.title, days: s.days,
      from: fmtD(ds.from), to: fmtD(ds.to), sgoal: s.goal ? t('pl.p.itsGoal', { goal: s.goal }) : '', parts: parts.join('\n'), have: have.length ? '\n' + have.join('\n') : '', lang: lang()
    });
    return run(prompt, { max: 3500, signal: signal }).then(function (raw) {
      raw = raw || {};
      var out = {};
      if (want.goal) out.goal = line(raw.goal, 500);
      if (want.tasks) out.tasks = arr(raw.tasks).map(function (x) { return line(x && x.t != null ? x.t : x, 240); }).filter(Boolean).slice(0, 14);
      if (want.res) out.res = arr(raw.materials || raw.res).map(function (x) {
        x = x || {}; return { kind: PD.KINDS.indexOf(x.kind) >= 0 ? x.kind : 'other', title: line(x.title, 160), note: line(x.note, 300), q: line(x.q || x.title, 120) };
      }).filter(function (x) { return x.title; }).slice(0, 8);
      if (want.practice) out.practice = arr(raw.practice).map(function (x) { x = x || {}; return { q: String(x.q == null ? '' : x.q).trim().slice(0, 1000), hint: line(x.hint, 400) }; }).filter(function (x) { return x.q; }).slice(0, 10);
      var any = (out.goal || '') || (out.tasks && out.tasks.length) || (out.res && out.res.length) || (out.practice && out.practice.length);
      if (!any) throw bad();
      return out;
    });
  }

  /* ---------- marking an answer ---------- */
  function check(plan, i, item, signal) {
    var s = plan.steps[i];
    var prompt = t('pl.p.check', { title: s.title, goal: plan.title, q: item.q, a: item.a || t('none'), lang: lang() });
    return run(prompt, { max: 1200, signal: signal }).then(function (raw) {
      raw = raw || {};
      var v = String(raw.verdict || '').toLowerCase();
      if (['right', 'partly', 'wrong'].indexOf(v) < 0) { if (!raw.feedback) throw bad(); v = 'partly'; }
      return { v: v, fb: String(raw.feedback || '').trim().slice(0, 2000), model: String(raw.model || '').trim().slice(0, 3000) };
    });
  }

  /* ---------- splitting a stage into smaller ones ---------- */
  function split(plan, i, k, signal) {
    var s = plan.steps[i];
    var prompt = t('pl.p.split', {
      goal: plan.title, level: plan.level || t('none'), hours: plan.hours, outline: outlineList(plan, i), n: i + 1, title: s.title, days: s.days,
      sgoal: s.goal ? t('pl.p.itsGoalIn', { goal: s.goal }) : '', k: k, lang: lang()
    });
    return run(prompt, { max: 2500, signal: signal, think: false }).then(function (raw) {
      var out = arr(raw && raw.stages).map(function (x) {
        x = x || {}; var d = parseInt(x.days, 10);
        return { title: line(x.title, 120), goal: line(x.goal, 300), days: isNaN(d) || d < 1 ? 1 : d };
      }).filter(function (x) { return x.title; }).slice(0, 12);
      if (out.length < 2) throw bad();
      return out;
    });
  }

  /* ---------- a question about the stage ---------- */
  function ask(plan, i, history, onText, signal) {
    var s = plan.steps[i];
    var sys = t('pl.p.askSys', {
      goal: plan.title, level: plan.level || t('none'), n: i + 1, total: plan.steps.length, title: s.title, days: s.days, sgoal: s.goal || t('none'),
      tasks: s.tasks.length ? s.tasks.slice(0, 12).map(function (x) { return x.t; }).join('; ') : t('none'), lang: lang()
    });
    return AI.chat({ system: sys, messages: history.slice(-8), maxTokens: 2000, signal: signal, idleMs: 60000, onText: onText }).then(function (r) { return r.text; });
  }

  global.PlanAI = { outline: outline, draft: draft, check: check, split: split, ask: ask, stageRange: stageRange };
})(window);
