/* profiles.js — the dice on the shelf.
 * Three built-in identities (school, college, work), each with twelve faces, plus dice the AI generated (stored on this device).
 * This file holds only structure: each face's key (used to store data, never change it), hue and paper texture ("look").
 * All text — face names, teaching styles, quick questions, prompts — comes from the language packs:
 *   prof.<id>.label|unit|who|common      face.<key>.name|cap|tag|persona|ask|todo|note|quick
 * Faces can be renamed in Settings; a renamed face keeps its key, so its to-dos and notes stay. */
(function (global) {
  'use strict';
  function F(key, hue, look) { return { key: key, hue: hue, look: look || key }; }
  var P = {
    // menu: order of the buttons in the All-subjects list (the die itself keeps the faces order)
    school: { id: 'school', dayCap: 120,
      menu: ['math', 'physics', 'coding', 'chinese', 'history', 'geography', 'study', 'biology', 'chemistry', 'english', 'art', 'pe'],
      faces: [
      F('chinese', 5), F('history', 35), F('geography', 65), F('study', 95), F('biology', 125), F('chemistry', 155),
      F('physics', 185), F('math', 215), F('coding', 245), F('english', 275), F('art', 315), F('pe', 345)] },
    college: { id: 'college', dayCap: 240, faces: [
      F('c-math', 215, 'math'), F('c-eng', 275, 'english'), F('c-major1', 5, 'chinese'), F('c-major2', 35, 'history'),
      F('c-major3', 65, 'geography'), F('c-code', 245, 'coding'), F('c-paper', 155, 'chinese'), F('c-exam', 185, 'physics'),
      F('c-read', 125, 'biology'), F('c-lab', 95, 'chemistry'), F('c-pe', 345, 'pe'), F('c-study', 315, 'study')] },
    work: { id: 'work', dayCap: 240, faces: [
      F('w-focus', 215, 'math'), F('w-comm', 185, 'physics'), F('w-write', 5, 'chinese'), F('w-learn', 125, 'biology'),
      F('w-plan', 95, 'study'), F('w-proj1', 35, 'history'), F('w-proj2', 65, 'geography'), F('w-data', 155, 'chemistry'),
      F('w-code', 245, 'coding'), F('w-lang', 275, 'english'), F('w-read', 315, 'art'), F('w-move', 345, 'pe')] }
  };
  var FIELDS = ['name', 'cap', 'tag', 'persona', 'ask', 'todo', 'note', 'quick'];
  /* fill in the text for the current language (the page reloads when the language changes) */
  Object.keys(P).forEach(function (pid) {
    var p = P[pid];
    ['label', 'unit', 'who', 'common'].forEach(function (k) { p[k] = t('prof.' + pid + '.' + k); });
    p.faces.forEach(function (f) { FIELDS.forEach(function (k) { f[k] = t('face.' + f.key + '.' + k); }); });
  });
  function nameMax() { return Number(t('limit.name')) || 6; }

  var KEY = 'tf-profile', SETS = 'tf-sets';
  /* dice the AI generated (by major and year, or by job), kept on this device */
  function sets() { try { var o = JSON.parse(localStorage.getItem(SETS) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function saveSets(o) { try { localStorage.setItem(SETS, JSON.stringify(o)); } catch (e) {} }
  function get(pid) { return P[pid] || sets()[pid] || null; }
  function id() { try { var v = localStorage.getItem(KEY); if (get(v)) return v; } catch (e) {} return 'school'; }
  function names(pid) { try { return JSON.parse(localStorage.getItem('tf-names-' + pid) || '{}') || {}; } catch (e) { return {}; } }

  /* teaching rules for a generated die: the college or work rules, plus what this die is about */
  function commonOf(p) {
    if (P[p.id]) return p.common;
    var base = P[p.base] || P.college, m = p.meta || {};
    var extra;
    if (p.base === 'college') {
      var where = m.school ? t('cs.where', { school: m.school, dept: m.dept ? t('cs.whereDept', { dept: m.dept }) : '' }) : '';
      extra = t('cs.commonCollege', { major: m.major || p.label, year: m.year || '', where: where }) + t(m.self ? 'cs.commonSelf' : 'cs.commonStudent');
    } else {
      extra = t('cs.commonJob', { job: m.job || p.label });
    }
    return base.common + extra;
  }

  /* the die in use, with any faces the user renamed */
  function current() {
    var p = get(id()), custom = names(p.id);
    var faces = p.faces.map(function (f) {
      var o = {}; for (var k in f) o[k] = f[k];
      o.look = f.look || f.key;
      var n = custom[f.key] && String(custom[f.key]).trim();
      if (n && n !== f.name) {
        o.defaultName = f.name; o.name = n.slice(0, nameMax());
        o.persona = t('rn.persona', { name: o.name }) + f.persona;
        o.tag = t('rn.tag');
      }
      return o;
    });
    // a generated die keeps its own faces, but its unit word and audience follow the current language
    var base = P[p.id] ? p : P[p.base === 'work' ? 'work' : 'college'];
    var who = P[p.id] || p.base === 'work' || !(p.meta && p.meta.self) ? base.who : t('cs.whoSelf');
    var menu = (p.menu || []).map(function (k) { return faces.filter(function (f) { return f.key === k; })[0]; }).filter(Boolean);
    faces.forEach(function (f) { if (menu.indexOf(f) < 0) menu.push(f); });
    return { id: p.id, label: p.label, unit: base.unit, who: who, dayCap: p.dayCap, common: commonOf(p), faces: faces, menu: menu, custom: !P[p.id] };
  }

  /* turn the twelve faces the AI wrote into a usable die. raw.faces items: name cap tag focus todo quick[] */
  function build(info, raw) {
    var tpl = (info.base === 'work' ? P.work : P.college).faces, max = nameMax();
    var sid = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    var list = (raw && Array.isArray(raw.faces) ? raw.faces : []).filter(function (f) { return f && f.name; });
    var seen = {}, faces = [];
    list.forEach(function (f) {
      var n = String(f.name).replace(/\s+/g, ' ').trim().slice(0, max);
      if (!n || seen[n] || faces.length >= 12) return;
      seen[n] = 1; faces.push({ f: f, n: n });
    });
    var fill = t(info.base === 'work' ? 'cs.fillWork' : 'cs.fillCollege');
    for (var k = 0; faces.length < 12 && k < 40; k++) {
      var n2 = fill[k % fill.length] + (k >= fill.length ? ' ' + (Math.floor(k / fill.length) + 1) : '');
      var low = n2.toLowerCase();
      var clash = Object.keys(seen).some(function (x) { x = x.toLowerCase(); return x.indexOf(low) >= 0 || low.indexOf(x) >= 0; });
      if (!clash) { seen[n2] = 1; faces.push({ f: { tag: t('cs.tagFill') }, n: n2 }); }
    }
    var what = t(info.base === 'work' ? 'cs.whatSkill' : 'cs.whatCourse');
    return {
      id: sid, base: info.base, label: String(info.label || t('cs.label')).slice(0, 40),
      unit: P[info.base === 'work' ? 'work' : 'college'].unit,
      who: info.base === 'work' ? P.work.who : (info.meta && info.meta.self ? t('cs.whoSelf') : P.college.who),
      dayCap: 240, meta: info.meta || {}, created: new Date().toISOString(),
      faces: faces.map(function (x, i) {
        var f = x.f, tp = tpl[i], q = t('q', { n: x.n });
        var focus = String(f.focus || '').slice(0, 120);
        var quick = (Array.isArray(f.quick) ? f.quick : []).map(function (s) { return String(s).slice(0, 80); }).filter(Boolean).slice(0, 3);
        if (!quick.length) quick = t('cs.quick', { q: q });
        return {
          key: sid + '-' + i, name: x.n, cap: String(f.cap || '').slice(0, 8), hue: tp.hue, look: tp.look,
          tag: String(f.tag || '').slice(0, 30) || tp.tag,
          focus: focus,
          persona: t('cs.persona', { q: q, focus: focus ? t('cs.focus', { what: what, focus: focus }) : '' }),
          ask: t('cs.ask', { q: q }), todo: f.todo ? t('cs.todo', { todo: String(f.todo).slice(0, 60) }) : tp.todo, note: t('cs.note'),
          quick: quick
        };
      })
    };
  }
  function addSet(set) { var o = sets(); o[set.id] = set; saveSets(o); return set.id; }
  function removeSet(sid) {
    var o = sets(); delete o[sid]; saveSets(o);
    try { localStorage.removeItem('tf-names-' + sid); if (localStorage.getItem(KEY) === sid) localStorage.setItem(KEY, 'school'); } catch (e) {}
  }
  function all() {
    var o = sets();
    return [P.school, P.college, P.work].concat(Object.keys(o).map(function (k) { return o[k]; }).sort(function (a, b) { return a.created < b.created ? -1 : 1; }));
  }

  /* find a face on any die on the shelf (the timeline colours and names blocks studied on another die) */
  function findFace(key) {
    var dice = all();
    for (var i = 0; i < dice.length; i++) {
      var fs = dice[i].faces || [];
      for (var j = 0; j < fs.length; j++) if (fs[j].key === key) {
        var n = names(dice[i].id)[key];
        return { name: (n && String(n).trim()) || fs[j].name, hue: fs[j].hue, die: dice[i].label, dieId: dice[i].id };
      }
    }
    return null;
  }

  global.PROFILES = {
    list: [P.school, P.college, P.work],
    findFace: findFace, nameMax: nameMax,
    all: all, get: get, build: build, addSet: addSet, removeSet: removeSet,
    currentId: id,
    current: current,
    names: names,
    setProfile: function (pid) { if (get(pid)) try { localStorage.setItem(KEY, pid); } catch (e) {} },
    setNames: function (pid, obj) { try { localStorage.setItem('tf-names-' + pid, JSON.stringify(obj || {})); } catch (e) {} }
  };
})(window);
