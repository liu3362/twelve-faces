/* future.js — "Beyond today": a vertical timeline on the side, from the future down to now.
 * The top is a goal (learning, skill or career only) on a future date; below it the AI lays stages along the way:
 * weeks close to now, months further out, quarters and half-years far away. Near stages are concrete, far ones stay broad.
 * Goals are kept on this device (tf-goals). A stage's tasks can be put into Today's to-dos with one tap. */
(function () {
  'use strict';
  var KEY = 'tf-goals', DAY = 86400000, HUES = [215, 5, 155, 35, 275, 185];
  var panel = document.getElementById('future'), tabsEl = document.getElementById('fuTabs'), bodyEl = document.getElementById('fuBody');
  var msgText = '', msgBad = false, ctl = null, working = false;
  var draft = { title: '', date: '', level: '', hours: '5' };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- storage ---------- */
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (o && Array.isArray(o.goals)) return { goals: o.goals.filter(function (g) { return g && g.id && Array.isArray(g.stages); }), sel: o.sel || 'all' };
    } catch (e) {}
    return { goals: [], sel: 'all' };
  }
  var st = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  /* ---------- dates ---------- */
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function parse(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s)); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function startOfToday() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function nDays(a, b) { return Math.round((b - a) / DAY); }
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

  /* ---------- the AI ---------- */
  function done(g) { return g.stages.reduce(function (a, s) { return a + s.tasks.filter(function (x) { return x.done; }).length; }, 0) + (g.doneBefore || 0); }
  function total(g) { return g.stages.reduce(function (a, s) { return a + s.tasks.length; }, 0) + (g.doneBefore || 0); }
  function pct(g) { var n = total(g); return n ? Math.round(done(g) / n * 100) : 0; }

  function ask(g, sl, doneTexts) {
    var lines = sl.map(function (s, i) { return i + ' | ' + t('fu.kind.' + s.kind) + ' | ' + s.from + ' → ' + s.to; }).join('\n');
    var days = nDays(startOfToday(), parse(g.date));
    var prompt = t('fu.prompt', {
      today: iso(startOfToday()), goal: g.title, date: g.date, days: days, level: g.level || t('none'), hours: g.hours,
      redo: doneTexts && doneTexts.length ? t('fu.redo', { done: doneTexts.slice(0, 15).join('; ') }) : '', stages: lines
    });
    ctl = new AbortController();
    return AI.json({ system: t('fu.sys'), messages: [{ role: 'user', content: prompt }], maxTokens: 4000, signal: ctl.signal, idleMs: 60000 });
  }
  function apply(g, sl, raw) {
    var by = {}; (raw && Array.isArray(raw.stages) ? raw.stages : []).forEach(function (x) { if (x && x.i != null) by[x.i] = x; });
    g.stages = sl.map(function (s, i) {
      var x = by[i] || {};
      var tasks = (Array.isArray(x.tasks) ? x.tasks : []).slice(0, s.kind === 'week' ? 4 : s.kind === 'month' ? 3 : 2)
        .map(function (z) { return String(z || '').trim().slice(0, 100); }).filter(Boolean)
        .map(function (z) { return { id: uid(), t: z, done: false, pushed: false }; });
      if (s.kind === 'quarter' || s.kind === 'half') tasks = [];
      return { id: uid(), kind: s.kind, from: s.from, to: s.to, label: String(x.label || '').trim().slice(0, 80) || t('fu.noLabel'), tasks: tasks };
    });
    g.summary = String(raw.summary || '').trim().slice(0, 160);
  }
  function setMsg(m, bad) { msgText = m || ''; msgBad = !!bad; var n = document.getElementById('fuMsg'); if (n) { n.textContent = msgText; n.className = 'fu-msg' + (bad ? ' bad' : ''); } }

  function create() {
    if (working) return;
    var d = parse(draft.date), title = draft.title.trim();
    if (!title || !d) { setMsg(t('fu.f.need'), true); return; }
    if (d <= startOfToday()) { setMsg(t('fu.f.past'), true); return; }
    var g = { id: uid(), title: title.slice(0, 80), date: draft.date, level: draft.level.trim().slice(0, 200),
      hours: Math.max(1, Math.min(60, parseInt(draft.hours, 10) || 5)), hue: HUES[st.goals.length % HUES.length], created: iso(startOfToday()), stages: [], doneBefore: 0 };
    var sl = slices(g.date);
    working = true; setMsg(t('fu.working')); render();
    ask(g, sl, null).then(function (raw) {
      if (raw && raw.ok === false) { working = false; setMsg(String(raw.reason || '').slice(0, 200) || t('fu.notScope'), true); render(); return; }
      apply(g, sl, raw);
      st.goals.push(g); st.sel = g.id; draft = { title: '', date: '', level: '', hours: '5' };
      working = false; ctl = null; setMsg(''); save(); render();
    }, function (e) {
      working = false; ctl = null;
      if (e && e.code === 'cancelled') { setMsg(''); } else setMsg(e && e.code && /^(bad_json|cut|empty)$/.test(e.code) ? t('fu.fail') : AI.explain(e), true);
      render();
    });
  }
  /* plan the rest again from today; finished tasks are remembered, unfinished ones are planned afresh */
  function replan(g) {
    if (working) return;
    var sl = slices(g.date);
    if (!sl.length) { setMsg(t('fu.f.past'), true); render(); return; }
    var texts = []; g.stages.forEach(function (s) { s.tasks.forEach(function (x) { if (x.done) texts.push(x.t); }); });
    working = true; setMsg(t('fu.working')); render();
    ask(g, sl, texts).then(function (raw) {
      if (raw && raw.ok === false) { working = false; setMsg(String(raw.reason || '').slice(0, 200) || t('fu.notScope'), true); render(); return; }
      g.doneBefore = done(g); apply(g, sl, raw);
      working = false; ctl = null; setMsg(''); save(); render();
    }, function (e) {
      working = false; ctl = null;
      setMsg(e && e.code === 'cancelled' ? '' : (e && /^(bad_json|cut|empty)$/.test(e.code) ? t('fu.fail') : AI.explain(e)), true);
      render();
    });
  }

  /* ---------- drawing ---------- */
  function daysLeft(g) {
    var n = nDays(startOfToday(), parse(g.date));
    return n > 0 ? t('fu.daysLeft', { n: n }) : n === 0 ? t('fu.dayToday') : t('fu.daysPast', { n: -n });
  }
  function curIndex(g) {
    var td = iso(startOfToday());
    for (var i = 0; i < g.stages.length; i++) if (g.stages[i].to >= td) return i;
    return g.stages.length;                  // everything is behind us
  }
  function renderTabs() {
    tabsEl.textContent = '';
    function chip(label, on, fn, hue) {
      var b = el('button', 'fu-chip', label); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (hue != null) b.style.setProperty('--gh', hue);
      b.addEventListener('click', fn); tabsEl.appendChild(b);
    }
    if (st.goals.length > 1) chip(t('fu.all'), st.sel === 'all', function () { st.sel = 'all'; save(); render(); });
    st.goals.forEach(function (g) { chip(g.title, st.sel === g.id, function () { st.sel = g.id; save(); render(); }, g.hue); });
    chip(t('fu.new'), st.sel === 'new' || !st.goals.length, function () { st.sel = 'new'; save(); render(); });
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
    var m = el('p', 'fu-msg' + (msgBad ? ' bad' : ''), msgText); m.id = 'fuMsg'; m.setAttribute('aria-live', 'polite'); box.appendChild(m);
    return box;
  }

  /* all goals on one axis: the farthest on top, now at the bottom */
  function overview() {
    var wrap = el('div', 'axis');
    var gs = st.goals.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    gs.forEach(function (g) {
      var n = el('div', 'ax-node goal'); n.style.setProperty('--gh', g.hue);
      n.appendChild(el('i', 'ax-dot flag'));
      var card = el('button', 'ax-card'); card.type = 'button';
      card.appendChild(el('b', '', g.title));
      card.appendChild(el('small', '', fmtD(g.date, true) + ' · ' + daysLeft(g) + ' · ' + t('fu.progress', { p: pct(g) })));
      var ci = curIndex(g), cs = g.stages[ci];
      if (cs) card.appendChild(el('span', 'ax-now', t('fu.ov.next', { label: cs.label })));
      card.addEventListener('click', function () { st.sel = g.id; save(); render(); });
      n.appendChild(card); wrap.appendChild(n);
    });
    var now = el('div', 'ax-node now'); now.appendChild(el('i', 'ax-dot')); now.appendChild(el('div', 'ax-card plain', t('fu.now'))); wrap.appendChild(now);
    return wrap;
  }

  function faceSelect(g) {
    var faces = (window.TFApp && TFApp.faces()) || [];
    var sel = el('select', 'fu-face'); sel.setAttribute('aria-label', t('fu.putTo'));
    var want = g.face && faces.some(function (f) { return f.key === g.face; }) ? g.face : (window.TFApp && TFApp.cur());
    faces.forEach(function (f) { var o = el('option', '', f.name); o.value = f.key; if (f.key === want) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', function () { g.face = sel.value; save(); });
    return sel;
  }

  function stageEl(g, s, idx, ci) {
    var dist = idx - ci, isCur = dist === 0;
    var n = el('div', 'ax-node stage' + (isCur ? ' cur' : '') + (dist < 0 ? ' past' : ''));
    n.dataset.far = String(Math.min(3, Math.max(0, dist - 1)));
    var full = s.tasks.length && s.tasks.every(function (x) { return x.done; });
    n.appendChild(el('i', 'ax-dot' + (full ? ' full' : '')));
    var card = el('div', 'ax-card');
    var h = el('div', 'st-h');
    h.appendChild(el('b', '', s.label));
    h.appendChild(el('small', '', range(s) + ' · ' + t('fu.kind.' + s.kind)));
    card.appendChild(h);
    if (s.tasks.length) {
      var ul = el('ul', 'st-tasks');
      s.tasks.forEach(function (x) {
        var li = el('li', x.done ? 'done' : '');
        var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!x.done; cb.setAttribute('aria-label', t('fu.doneAria', { t: x.t }));
        cb.addEventListener('change', function () { x.done = cb.checked; save(); render(); });
        li.appendChild(cb); li.appendChild(el('span', 't', x.t));
        if (x.pushed) li.appendChild(el('em', 'st-pushed', t('fu.pushed')));
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }
    if (isCur && s.tasks.some(function (x) { return !x.done && !x.pushed; })) {
      var row = el('div', 'st-put');
      var sel = faceSelect(g);
      var b = el('button', 'btn sm', t('fu.put')); b.type = 'button'; b.className += ' fu-put';
      b.addEventListener('click', function () {
        if (!window.TFApp) return;
        var key = sel.value, todo = s.tasks.filter(function (x) { return !x.done && !x.pushed; });
        Promise.all(todo.map(function (x) { return TFApp.addTodo(key, x.t).then(function () { x.pushed = true; }); })).then(function () {
          save(); setMsg(t('fu.putDone', { n: todo.length, name: TFApp.faceName(key) })); render();
        });
      });
      row.appendChild(sel); row.appendChild(b); card.appendChild(row);
    }
    n.appendChild(card);
    return n;
  }

  function goalView(g) {
    var box = el('div', 'fu-goal'); box.style.setProperty('--gh', g.hue);
    var wrap = el('div', 'axis');
    var ci = curIndex(g);
    // top: the goal
    var top = el('div', 'ax-node goal'); top.appendChild(el('i', 'ax-dot flag'));
    var tc = el('div', 'ax-card goal-card');
    tc.appendChild(el('small', 'ax-kicker', t('fu.goal')));
    tc.appendChild(el('b', '', g.title));
    tc.appendChild(el('small', '', fmtD(g.date, true) + ' · ' + daysLeft(g) + ' · ' + t('fu.progress', { p: pct(g) })));
    if (g.summary) tc.appendChild(el('p', 'ax-sum', g.summary));
    top.appendChild(tc); wrap.appendChild(top);
    // far to near
    var upcoming = g.stages.slice(ci);
    if (upcoming.length > 2) wrap.appendChild(el('p', 'ax-hint', t('fu.fuzzy')));
    for (var i = g.stages.length - 1; i >= ci; i--) wrap.appendChild(stageEl(g, g.stages[i], i, ci));
    // bottom: now
    var now = el('div', 'ax-node now'); now.appendChild(el('i', 'ax-dot')); now.appendChild(el('div', 'ax-card plain', t('fu.now'))); wrap.appendChild(now);
    box.appendChild(wrap);
    // stages already behind us
    var passed = g.stages.slice(0, ci), missed = passed.reduce(function (a, s) { return a + s.tasks.filter(function (x) { return !x.done; }).length; }, 0);
    if (passed.length) {
      var d = el('details', 'fu-passed'); d.appendChild(el('summary', '', t('fu.passed', { n: passed.length })));
      var w2 = el('div', 'axis'); passed.slice().reverse().forEach(function (s) { w2.appendChild(stageEl(g, s, g.stages.indexOf(s), ci)); });
      d.appendChild(w2); box.appendChild(d);
    }
    if (missed) box.appendChild(el('p', 'fu-miss', t('fu.missed', { n: missed })));
    var row = el('div', 'fu-btns');
    var rp = el('button', 'btn alt sm', t('fu.replan')); rp.type = 'button'; rp.disabled = working; rp.addEventListener('click', function () { replan(g); });
    var del = el('button', 'btn alt sm', t('fu.delete')); del.type = 'button';
    del.addEventListener('click', function () {
      if (!confirm(t('fu.deleteConfirm', { title: g.title }))) return;
      st.goals = st.goals.filter(function (x) { return x !== g; }); st.sel = st.goals.length > 1 ? 'all' : (st.goals[0] ? st.goals[0].id : 'new'); save(); render();
    });
    row.appendChild(rp); row.appendChild(del); box.appendChild(row);
    var m = el('p', 'fu-msg' + (msgBad ? ' bad' : ''), msgText); m.id = 'fuMsg'; m.setAttribute('aria-live', 'polite'); box.appendChild(m);
    return box;
  }

  function render() {
    if (st.sel !== 'all' && st.sel !== 'new' && !st.goals.some(function (g) { return g.id === st.sel; })) st.sel = st.goals.length > 1 ? 'all' : (st.goals[0] ? st.goals[0].id : 'new');
    if (st.goals.length === 1 && st.sel === 'all') st.sel = st.goals[0].id;
    if (!st.goals.length) st.sel = 'new';
    renderTabs();
    bodyEl.textContent = '';
    var g = st.goals.filter(function (x) { return x.id === st.sel; })[0];
    bodyEl.appendChild(st.sel === 'new' ? formView() : st.sel === 'all' ? overview() : goalView(g));
  }

  /* ---------- open / close ---------- */
  var btn = document.getElementById('fuBtn');
  function open() { panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); document.body.classList.add('fu-open'); render(); var c = document.getElementById('fuClose'); if (c) c.focus(); }
  function close() { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.body.classList.remove('fu-open'); btn.focus(); }
  btn.addEventListener('click', function () { panel.hidden ? open() : close(); });
  document.getElementById('fuClose').addEventListener('click', close);
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  window.openFuture = open;
})();
