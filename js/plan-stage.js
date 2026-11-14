/* plan-stage.js — one stage of a plan: the page where it becomes real.
 * A stage is a few days to a couple of weeks of actual work, so this page holds what that takes: the goal, the steps, what to read or watch (with links),
 * exercises to try (the AI marks them), notes, what you made, a log of the time you spent, and a place to ask questions. The AI can draft any part; you change anything.
 * PlanStage.render(plan, index) draws it into the page and returns a function that cleans up. */
(function (global) {
  'use strict';
  var U = PlanUI, PD = PlanData, GM = GoalMath, el = U.el, btn = U.btn, ic = U.ic;
  var DAY = 864e5;

  function sec(id, title) {
    var box = el('section', 'pl-sec'); box.id = id;
    var h = el('h2'), ttl = el('span', '', title), cnt = el('span', 'cnt'), sp = el('span', 'sp'); cnt.hidden = true; h.append(ttl, cnt, sp);
    var body = el('div'); box.append(h, body);
    return { box: box, head: h, body: body, count: function (x) { cnt.textContent = x || ''; cnt.hidden = !x; } };
  }
  function field(label, node, id) { var d = el('div', 'pl-f'), l = el('label', 'pl-lbl', label); node.id = id; l.htmlFor = id; d.append(l, node); return d; }
  var KIND_NAME = { book: 'pl.k.book', video: 'pl.k.video', course: 'pl.k.course', web: 'pl.k.web', tool: 'pl.k.tool', other: 'pl.k.other' };

  /* where to look for a book, a video, a course: links the page builds itself (the AI is never trusted with web addresses) */
  function searchLinks(r) {
    var q = encodeURIComponent(r.q || r.title), zh = /^zh/i.test(t('lang.html')), L = [];
    var bing = { label: 'Bing', href: 'https://www.bing.com/search?q=' + q }, goog = { label: 'Google', href: 'https://www.google.com/search?q=' + q };
    if (r.kind === 'video') L = zh ? [{ label: 'Bilibili', href: 'https://search.bilibili.com/all?keyword=' + q }, { label: 'YouTube', href: 'https://www.youtube.com/results?search_query=' + q }]
      : [{ label: 'YouTube', href: 'https://www.youtube.com/results?search_query=' + q }, { label: 'Bing Videos', href: 'https://www.bing.com/videos/search?q=' + q }];
    else if (r.kind === 'book') L = zh ? [{ label: '豆瓣读书 · Douban', href: 'https://search.douban.com/book/subject_search?search_text=' + q }, bing]
      : [{ label: 'Open Library', href: 'https://openlibrary.org/search?q=' + q }, { label: 'Google Books', href: 'https://www.google.com/search?tbm=bks&q=' + q }];
    else if (r.kind === 'course') L = zh ? [{ label: '中国大学MOOC', href: 'https://www.icourse163.org/search.htm?search=' + q }, { label: 'Bilibili', href: 'https://search.bilibili.com/all?keyword=' + q }]
      : [{ label: 'Coursera', href: 'https://www.coursera.org/search?query=' + q }, { label: 'YouTube', href: 'https://www.youtube.com/results?search_query=' + q }];
    else if (r.kind === 'tool') L = [{ label: 'GitHub', href: 'https://github.com/search?q=' + q }, zh ? bing : goog];
    else L = zh ? [bing, goog] : [goog, bing];
    return L;
  }

  function render(plan, idx) {
    var main = U.main, s = plan.steps[idx], N = plan.steps.length, ds = PD.dates(plan);
    document.documentElement.style.setProperty('--h', plan.hue);
    U.setCrumb([{ text: t('pl.title'), href: '#/' }, { text: plan.title || t('pl.untitled'), href: '#/p/' + plan.id }, { text: (idx + 1) + '. ' + (s.title || t('pl.untitled')) }]);
    main.textContent = '';
    var S = { ctl: null, busy: false, chat: [], timers: [], dead: false };
    var saveSoon = U.debounce(function () { PD.save(); }, 500);
    function flush() { PD.save(); }
    document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', flush);
    function onHide() { if (document.visibilityState === 'hidden') flush(); }
    function hueOf(i) { return U.hue(plan, i); }

    /* ---------- the top: where you are among all the stages ---------- */
    var nav = el('nav', 'pl-snav'); nav.setAttribute('aria-label', t('pl.s.nav'));
    var whole = el('a', 'pl-btn sm'); whole.href = '#/p/' + plan.id; whole.append(ic('back', 14), document.createTextNode(t('pl.s.whole')));
    var prev = el('a', 'pl-btn sm'), next = el('a', 'pl-btn sm'), mid = el('span', 'mid', (idx + 1) + ' / ' + N);
    function lbl(txt) { var sp = el('span', 'lbl', txt); return sp; }                                           // the words can drop away on a narrow screen, the arrows stay
    prev.append(ic('back', 14), lbl(t('pl.s.prev'))); next.append(lbl(t('pl.s.next')), ic('chev', 14));
    prev.classList.add('tight'); next.classList.add('tight'); prev.setAttribute('aria-label', t('pl.s.prev')); next.setAttribute('aria-label', t('pl.s.next'));
    function lnk(a, i) { if (i < 0 || i >= N) { a.setAttribute('aria-disabled', 'true'); a.removeAttribute('href'); a.style.opacity = .45; a.style.pointerEvents = 'none'; } else { a.href = '#/p/' + plan.id + '/s/' + plan.steps[i].id; a.title = (i + 1) + '. ' + plan.steps[i].title; } }
    lnk(prev, idx - 1); lnk(next, idx + 1);
    nav.append(whole, mid, prev, next);
    var ribbon = el('div', 'pl-ribbon'); ribbon.setAttribute('role', 'navigation'); ribbon.setAttribute('aria-label', t('pl.s.ribbon'));
    plan.steps.forEach(function (x, i) {
      var b = el('button', (x.status === 'done' ? 'done ' : '') + (i === idx ? 'cur' : '')); b.type = 'button'; b.style.setProperty('--th', hueOf(i)); b.title = (i + 1) + '. ' + x.title; b.setAttribute('aria-label', (i + 1) + '. ' + x.title);
      if (i === idx) b.setAttribute('aria-current', 'step');
      b.addEventListener('click', function () { location.hash = '#/p/' + plan.id + '/s/' + x.id; }); ribbon.appendChild(b);
    });

    /* ---------- the head: title, dates, length, status ---------- */
    var head = el('header', 'pl-shead'); head.style.setProperty('--th', hueOf(idx));
    if (s.phase) head.appendChild(el('div', 'pl-sphase', s.phase));
    var ti = el('textarea', 'pl-stitle'); ti.rows = 1; ti.maxLength = 120; ti.value = s.title; ti.placeholder = t('pl.e.titlePh'); ti.setAttribute('aria-label', t('pl.e.title'));   // a textarea, so a long title wraps instead of being cut off
    function saveTitle() { var v = ti.value.replace(/\s+/g, ' ').trim(); if (v && v !== s.title) { s.title = v.slice(0, 120); PD.save(); } ti.value = s.title; fitTitle(); }
    function fitTitle() { ti.style.height = 'auto'; ti.style.height = (ti.scrollHeight + 2) + 'px'; }
    ti.addEventListener('input', fitTitle); ti.addEventListener('blur', saveTitle); ti.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ti.blur(); } });
    head.appendChild(ti); setTimeout(fitTitle, 0); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitle);
    window.addEventListener('resize', fitTitle);
    var meta = el('div', 'pl-smeta'), dateEl = el('span'), lenWrap = el('span'), stat = el('div', 'pl-seg');
    var lenIn = el('input', 'pl-in'), lenUnit = el('select', 'pl-sel');
    lenIn.type = 'number'; lenIn.min = 1; lenIn.max = 3650; lenIn.style.width = '72px'; lenIn.style.padding = '4px 8px'; lenIn.setAttribute('aria-label', t('pl.e.length')); lenUnit.style.width = 'auto'; lenUnit.style.padding = '4px 6px'; lenUnit.setAttribute('aria-label', t('pl.e.unit'));
    [['d', t('pl.u.days')], ['w', t('pl.u.weeks')]].forEach(function (u) { var o = el('option', '', u[1]); o.value = u[0]; lenUnit.appendChild(o); });
    var wk = s.days >= 14 && s.days % 7 === 0; lenUnit.value = wk ? 'w' : 'd'; lenIn.value = wk ? s.days / 7 : s.days;
    function setLen() { var d = U.clamp(Math.round((parseFloat(lenIn.value) || 1) * (lenUnit.value === 'w' ? 7 : 1)), 1, 3650); if (d !== s.days) { s.days = d; PD.save(); showDates(); } }
    lenIn.addEventListener('change', setLen); lenUnit.addEventListener('change', setLen);
    lenWrap.style.display = 'inline-flex'; lenWrap.style.gap = '6px'; lenWrap.style.alignItems = 'center'; lenWrap.append(el('span', '', t('pl.e.length') + ':'), lenIn, lenUnit);
    function showDates() { var d = PD.dates(plan)[idx]; dateEl.textContent = U.fmtRange(d.from, d.to) + ' · ' + U.fmtDur(s.days); }
    showDates();
    [['todo', 'pl.st.todo'], ['doing', 'pl.st.doing'], ['done', 'pl.st.done']].forEach(function (x) {
      var b = el('button', '', t(x[1])); b.type = 'button'; b.dataset.st = x[0]; b.setAttribute('aria-pressed', s.status === x[0] ? 'true' : 'false');
      b.addEventListener('click', function () {
        var was = s.status; PD.setStatus(plan, s.id, x[0]); showStatus();
        if (x[0] === 'done' && was !== 'done' && idx + 1 < N) U.toast(t('pl.s.doneMsg'), { label: t('pl.s.next') + ' ›', fn: function () { location.hash = '#/p/' + plan.id + '/s/' + plan.steps[idx + 1].id; } });
      }); stat.appendChild(b);
    });
    function showStatus() { [].forEach.call(stat.children, function (b) { b.setAttribute('aria-pressed', b.dataset.st === s.status ? 'true' : 'false'); }); ribbon.children[idx].className = (s.status === 'done' ? 'done ' : '') + 'cur'; }
    meta.append(dateEl, lenWrap, stat); head.appendChild(meta);
    var noAi = null;
    if (!U.aiReady()) { noAi = el('p', 'pl-note'); noAi.append(el('span', '', t('pl.s.noAi'))); var go = el('a', 'pl-btn sm'); go.href = 'index.html'; go.textContent = t('pl.s.noAiGo'); noAi.appendChild(go); }

    /* ---------- one place for every "ask the AI" ---------- */
    function runAI(host, label, start, onOk) {
      if (S.busy) { U.toast(t('pl.s.busy')); return; }
      S.busy = true; S.ctl = new AbortController(); host.textContent = ''; host.className = 'ai-msg';
      host.append(el('span', 'pl-spin'), document.createTextNode(' ' + label + ' '));
      var c = btn(t('pl.cancel'), 'sm ghost', function () { if (S.ctl) S.ctl.abort(); }); host.appendChild(c);
      start(S.ctl.signal).then(function (r) { S.busy = false; S.ctl = null; if (S.dead) return; host.textContent = ''; onOk(r); },
        function (e) { S.busy = false; S.ctl = null; if (S.dead) return; host.textContent = ''; if (e && e.code === 'cancelled') return; host.className = 'ai-msg bad'; host.textContent = U.aiFail(e); });
    }
    function aiBtn(label, cls, fn) { var b = btn(label, cls, fn, 'ai'); if (!U.aiReady()) { b.disabled = true; b.title = t('pl.s.noAi'); } return b; }

    /* ================= the goal ================= */
    var goalSec = sec('secGoal', t('pl.s.goal')), goalTa = el('textarea', 'pl-ta'), goalMsg = el('span', 'ai-msg');
    goalTa.rows = 2; goalTa.maxLength = 500; goalTa.value = s.goal; goalTa.placeholder = t('pl.e.goalPh'); goalTa.setAttribute('aria-label', t('pl.s.goal'));
    var fitGoal = U.autosize(goalTa); goalTa.addEventListener('input', function () { s.goal = goalTa.value; saveSoon(); });
    goalSec.body.appendChild(goalTa);
    function isEmpty() { return !s.tasks.length && !s.res.length && !s.practice.length; }
    var goalRow = el('div', 'ai-row'); goalSec.body.appendChild(goalRow);
    function drawGoalRow() {
      goalRow.textContent = '';
      if (isEmpty()) goalRow.appendChild(el('p', 'hint', t('pl.s.draftHint'))), goalRow.style.display = 'block';
      var b = aiBtn(t(isEmpty() ? 'pl.s.draft' : 'pl.s.fill'), isEmpty() ? 'main' : 'ghost', draftAll); goalRow.append(b, goalMsg);
    }
    function draftAll() {
      var want = { goal: !s.goal.trim(), tasks: !s.tasks.length, res: !s.res.length, practice: !s.practice.length };
      if (!want.goal && !want.tasks && !want.res && !want.practice) { U.toast(t('pl.s.nothingMissing')); return; }
      runAI(goalMsg, t('pl.s.drafting'), function (sig) { return PlanAI.draft(plan, idx, want, sig); }, function (r) { applyDraft(r); U.toast(t('pl.s.drafted')); });
    }
    function applyDraft(r) {
      var seen = {};
      if (r.goal && !s.goal.trim()) { s.goal = r.goal; goalTa.value = r.goal; fitGoal(); }
      seen = {}; s.tasks.forEach(function (x) { seen[x.t.toLowerCase()] = 1; });
      (r.tasks || []).forEach(function (x) { if (!seen[x.toLowerCase()]) { seen[x.toLowerCase()] = 1; s.tasks.push({ id: PD.uid('t'), t: x, done: false }); } });
      seen = {}; s.res.forEach(function (x) { seen[x.title.toLowerCase()] = 1; });
      (r.res || []).forEach(function (x) { if (!seen[x.title.toLowerCase()]) { seen[x.title.toLowerCase()] = 1; s.res.push({ id: PD.uid('r'), kind: x.kind, title: x.title, note: x.note, url: '', q: x.q }); } });
      seen = {}; s.practice.forEach(function (x) { seen[x.q.slice(0, 60).toLowerCase()] = 1; });
      (r.practice || []).forEach(function (x) { if (!seen[x.q.slice(0, 60).toLowerCase()]) { seen[x.q.slice(0, 60).toLowerCase()] = 1; s.practice.push({ id: PD.uid('q'), q: x.q, hint: x.hint, a: '', fb: '', model: '', v: '' }); } });
      PD.save(); renderTasks(); renderRes(); renderPrac(); drawGoalRow();
    }

    /* ================= the steps ================= */
    var tasksSec = sec('secTasks', t('pl.s.tasks')), tasksBody = tasksSec.body, tasksMsg = el('span', 'ai-msg');
    function maybeFinish() {
      if (s.tasks.length && s.tasks.every(function (x) { return x.done; }) && s.status !== 'done') {
        U.toast(t('pl.s.allDone'), { label: t('pl.s.markDone'), fn: function () { PD.setStatus(plan, s.id, 'done'); showStatus(); } });
      }
    }
    function moveTask(k, d) { var j = k + d; if (j < 0 || j >= s.tasks.length) return; var x = s.tasks[k]; s.tasks[k] = s.tasks[j]; s.tasks[j] = x; PD.save(); renderTasks(); }
    function renderTasks() {
      tasksBody.textContent = '';
      var done = s.tasks.filter(function (x) { return x.done; }).length; tasksSec.count(s.tasks.length ? done + '/' + s.tasks.length : '');
      if (!s.tasks.length) tasksBody.appendChild(el('p', 'hint', t('pl.s.tasksHint')));
      var ul = el('ul', 'pl-list');
      s.tasks.forEach(function (x, k) {
        var li = el('li', 'pl-item' + (x.done ? ' done' : ''));
        var cb = el('input'); cb.type = 'checkbox'; cb.checked = x.done; cb.setAttribute('aria-label', x.t);
        cb.addEventListener('change', function () { x.done = cb.checked; PD.save(); renderTasks(); if (x.done) maybeFinish(); });
        var tx = el('button', 'tx', x.t); tx.type = 'button'; tx.title = t('pl.s.editHint');
        tx.addEventListener('click', function () {
          var inp = el('input', 'pl-in'); inp.type = 'text'; inp.maxLength = 240; inp.value = x.t; inp.setAttribute('aria-label', t('pl.s.editHint')); li.replaceChild(inp, tx); inp.focus(); inp.select();
          var fin = function (ok) { if (ok && inp.value.trim()) { x.t = inp.value.trim().slice(0, 240); PD.save(); } renderTasks(); };
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.onblur = null; fin(true); } else if (e.key === 'Escape') { inp.onblur = null; fin(false); } });
          inp.onblur = function () { fin(true); };
        });
        var acts = el('div', 'pl-acts x');
        acts.append(btn('', 'ghost sm icon', function () { moveTask(k, -1); }, 'up', t('pl.row.up')), btn('', 'ghost sm icon', function () { moveTask(k, 1); }, 'down', t('pl.row.down')),
          btn('', 'ghost sm icon', function () { s.tasks.splice(k, 1); PD.save(); renderTasks(); drawGoalRow(); }, 'x', t('pl.s.remove')));
        li.append(cb, tx, acts); ul.appendChild(li);
      });
      tasksBody.appendChild(ul);
      var form = el('form', 'pl-addrow'), inp = el('input', 'pl-in'); inp.type = 'text'; inp.maxLength = 240; inp.placeholder = t('pl.s.taskPh'); inp.setAttribute('aria-label', t('pl.s.taskPh'));
      var add = el('button', 'pl-btn main'); add.type = 'submit'; add.appendChild(ic('plus', 15)); add.appendChild(document.createTextNode(t('pl.add2')));
      form.append(inp, add);
      form.addEventListener('submit', function (e) {
        e.preventDefault(); var lines = inp.value.split(/\r?\n/).map(function (z) { return z.trim(); }).filter(Boolean); if (!lines.length) return;
        lines.forEach(function (z) { s.tasks.push({ id: PD.uid('t'), t: z.slice(0, 240), done: false }); }); PD.save(); renderTasks(); drawGoalRow();
        var again = tasksBody.querySelector('.pl-addrow input'); if (again) again.focus();
      });
      inp.addEventListener('paste', function (e) {                         // a pasted list becomes several steps
        var tx = (e.clipboardData || window.clipboardData).getData('text'); if (!/\n/.test(tx.trim())) return;
        e.preventDefault(); tx.split(/\r?\n/).map(function (z) { return z.replace(/^\s*([-*•]|\d+[.)、])\s*/, '').trim(); }).filter(Boolean).forEach(function (z) { s.tasks.push({ id: PD.uid('t'), t: z.slice(0, 240), done: false }); });
        PD.save(); renderTasks(); drawGoalRow();
      });
      tasksBody.appendChild(form);
      var row = el('div', 'ai-row');
      row.appendChild(aiBtn(t('pl.s.moreTasks'), 'sm', function () { runAI(tasksMsg, t('pl.s.drafting'), function (sig) { return PlanAI.draft(plan, idx, { tasks: true }, sig); }, function (r) { var before = s.tasks.length; applyDraft(r); U.toast(t('pl.s.added', { n: s.tasks.length - before })); }); }));
      if (s.tasks.some(function (x) { return !x.done; })) row.appendChild(btn(t('pl.s.putToday'), 'sm', putToday, 'flag'));
      row.appendChild(tasksMsg); tasksBody.appendChild(row);
    }
    /* send the open steps to the to-do list of a subject in the study room */
    function putToday() {
      function go(key) {
        var k = 'ds:' + key, d = null; try { d = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) {}
        d = d || { todos: [], note: '', focus: null, plan: null }; if (!Array.isArray(d.todos)) d.todos = [];
        var have = {}, add = 0; d.todos.forEach(function (x) { have[String(x.t).toLowerCase()] = 1; });
        s.tasks.forEach(function (x) { if (!x.done && !have[x.t.toLowerCase()]) { d.todos.push({ id: PD.uid(''), t: x.t.slice(0, 120), done: false }); have[x.t.toLowerCase()] = 1; add++; } });
        try { localStorage.setItem(k, JSON.stringify(d)); } catch (e) {}
        var nm = key; try { var ff = PROFILES.findFace(key); if (ff) nm = ff.name; } catch (e) {}
        U.toast(add ? t('pl.s.putDone', { n: add, name: nm }) : t('pl.s.putNone', { name: nm }));
      }
      if (plan.face) { go(plan.face); return; }
      var f = el('form'); f.appendChild(el('h2', '', t('pl.s.putToday'))); f.appendChild(el('p', 'pl-dsub', t('pl.s.putPick')));
      var sel = el('select', 'pl-sel'); try { PROFILES.all().forEach(function (d) { var og = el('optgroup'); og.label = d.label; (d.faces || []).forEach(function (fc) { var o = el('option', '', fc.name); o.value = fc.key; og.appendChild(o); }); sel.appendChild(og); }); } catch (e) {}
      f.appendChild(sel);
      var foot = el('div', 'pl-dfoot'); foot.appendChild(btn(t('pl.cancel'), 'ghost', U.closeDialog)); var ok = el('button', 'pl-btn main', t('pl.s.putGo')); ok.type = 'submit'; foot.appendChild(ok); f.appendChild(foot);
      f.addEventListener('submit', function (e) { e.preventDefault(); plan.face = sel.value; PD.save(); U.closeDialog(); go(plan.face); });
      U.openDialog(f);
    }

    /* ================= what to read, watch and use ================= */
    var resSec = sec('secRes', t('pl.s.res')), resBody = resSec.body, resMsg = el('span', 'ai-msg'), resEdit = null;
    function resForm(r, done) {
      var f = el('form', 'pl-inline'), kind = el('select', 'pl-sel'), ti2 = el('input', 'pl-in'), nt = el('input', 'pl-in'), url = el('input', 'pl-in');
      PD.KINDS.forEach(function (k) { var o = el('option', '', t(KIND_NAME[k])); o.value = k; kind.appendChild(o); });
      kind.value = r ? r.kind : 'book'; ti2.type = 'text'; ti2.maxLength = 160; ti2.value = r ? r.title : ''; ti2.placeholder = t('pl.s.resTitlePh');
      nt.type = 'text'; nt.maxLength = 300; nt.value = r ? r.note : ''; nt.placeholder = t('pl.s.resNotePh'); url.type = 'url'; url.value = r ? r.url : ''; url.placeholder = t('pl.s.resUrlPh');
      f.append(field(t('pl.s.resKind'), kind, 'rk' + (r ? r.id : 'n')), field(t('pl.s.resTitle'), ti2, 'rt' + (r ? r.id : 'n')), field(t('pl.s.resNote'), nt, 'rn' + (r ? r.id : 'n')), field(t('pl.s.resUrl'), url, 'ru' + (r ? r.id : 'n')));
      var foot = el('div', 'qa'); var ok = el('button', 'pl-btn main sm', t('pl.save')); ok.type = 'submit'; foot.append(ok, btn(t('pl.cancel'), 'sm ghost', function () { resEdit = null; renderRes(); })); f.appendChild(foot);
      var err = el('p', 'pl-err'); f.appendChild(err);
      f.addEventListener('submit', function (e) {
        e.preventDefault(); var title = ti2.value.trim(), u = PD.url(url.value);
        if (!title && !u) { err.textContent = t('pl.s.resNeed'); return; }
        if (url.value.trim() && !u) { err.textContent = t('pl.s.resBadUrl'); return; }
        var o = r || { id: PD.uid('r'), q: '' };
        o.kind = kind.value; o.title = (title || u).slice(0, 160); o.note = nt.value.trim().slice(0, 300); o.url = u; if (!r) { o.q = o.title; s.res.push(o); } else if (!o.q) o.q = o.title;
        PD.save(); resEdit = null; renderRes();
      });
      setTimeout(function () { ti2.focus(); }, 20);
      return f;
    }
    function renderRes() {
      resBody.textContent = ''; resSec.count(s.res.length ? String(s.res.length) : '');
      if (!s.res.length && resEdit !== 'new') resBody.appendChild(el('p', 'hint', t('pl.s.resHint')));
      s.res.forEach(function (r, k) {
        if (resEdit === r.id) { resBody.appendChild(resForm(r)); return; }
        var row = el('div', 'pl-res'); row.style.setProperty('--th', hueOf(idx));
        var icon = el('span', 'ic'); icon.appendChild(ic(r.kind, 18));
        var c = el('div'); c.append(el('span', 'kd', t(KIND_NAME[r.kind])), el('b', '', r.title)); if (r.note) c.appendChild(el('span', 'nt', r.note));
        var go = el('div', 'go');
        if (r.url) { var a = el('a', 'pl-btn main sm'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.append(document.createTextNode(t('pl.s.open')), ic('ext', 13)); go.appendChild(a); }
        var find = btn(t('pl.s.find'), 'sm', null, null); find.setAttribute('aria-haspopup', 'menu'); find.setAttribute('aria-expanded', 'false');
        find.addEventListener('click', function () { U.menu(find, searchLinks(r).map(function (l) { return { label: l.label, icon: 'ext', href: l.href }; })); }); go.appendChild(find);
        go.appendChild(btn('', 'ghost sm icon', function () { resEdit = r.id; renderRes(); }, 'edit', t('pl.row.edit')));
        go.appendChild(btn('', 'ghost sm icon', function () { s.res.splice(k, 1); PD.save(); renderRes(); drawGoalRow(); }, 'x', t('pl.s.remove')));
        row.append(icon, c, go); resBody.appendChild(row);
      });
      if (resEdit === 'new') resBody.appendChild(resForm(null));
      var row2 = el('div', 'ai-row');
      row2.appendChild(btn(t('pl.s.resAdd'), 'sm', function () { resEdit = 'new'; renderRes(); }, 'plus'));
      row2.appendChild(aiBtn(t('pl.s.resAI'), 'sm', function () { runAI(resMsg, t('pl.s.drafting'), function (sig) { return PlanAI.draft(plan, idx, { res: true }, sig); }, function (r) { var before = s.res.length; applyDraft(r); U.toast(t('pl.s.added', { n: s.res.length - before })); }); }));
      row2.appendChild(resMsg); resBody.appendChild(row2);
      if (s.res.length) resBody.appendChild(el('p', 'pl-small', t('pl.s.resWarn')));
    }

    /* ================= practice ================= */
    var pracSec = sec('secPrac', t('pl.s.prac')), pracBody = pracSec.body, pracMsg = el('span', 'ai-msg'), pracEdit = null, adding = false;
    var VERD = { right: 'pl.v.right', partly: 'pl.v.partly', wrong: 'pl.v.wrong' };
    function renderPrac() {
      pracBody.textContent = ''; var good = s.practice.filter(function (x) { return x.v === 'right'; }).length; pracSec.count(s.practice.length ? good + '/' + s.practice.length : '');
      if (!s.practice.length && !adding) pracBody.appendChild(el('p', 'hint', t('pl.s.pracHint')));
      s.practice.forEach(function (q, k) {
        var box = el('div', 'pl-q');
        if (pracEdit === q.id) {
          var tq = el('textarea', 'pl-ta'), th = el('input', 'pl-in'); tq.rows = 3; tq.value = q.q; tq.setAttribute('aria-label', t('pl.s.q')); th.type = 'text'; th.value = q.hint; th.placeholder = t('pl.s.hintPh'); th.setAttribute('aria-label', t('pl.s.hint'));
          var qa = el('div', 'qa'), ok = btn(t('pl.save'), 'main sm', function () { if (!tq.value.trim()) return; q.q = tq.value.slice(0, 1000); q.hint = th.value.slice(0, 400); PD.save(); pracEdit = null; renderPrac(); });
          qa.append(ok, btn(t('pl.cancel'), 'sm ghost', function () { pracEdit = null; renderPrac(); })); box.append(tq, th, qa); pracBody.appendChild(box); setTimeout(function () { tq.focus(); }, 20); return;
        }
        var top = el('div'); top.style.display = 'flex'; top.style.alignItems = 'center'; top.style.gap = '8px';
        top.appendChild(el('span', 'qn', t('pl.s.exercise', { n: k + 1 })));
        if (q.v) { var vd = el('span', 'vd ' + q.v, t(VERD[q.v])); top.appendChild(vd); }
        box.appendChild(top); box.appendChild(el('div', 'qt', q.q));
        if (q.hint) { var det = el('details'); det.appendChild(el('summary', '', t('pl.s.hint'))); det.appendChild(el('div', 'nt', q.hint)); det.lastChild.style.margin = '6px 0 0'; box.appendChild(det); }
        var ta = el('textarea', 'pl-ta'); ta.rows = 3; ta.maxLength = 6000; ta.value = q.a; ta.placeholder = t('pl.s.answerPh'); ta.setAttribute('aria-label', t('pl.s.answer')); U.autosize(ta);
        ta.addEventListener('input', function () { q.a = ta.value; saveSoon(); }); box.appendChild(ta);
        var msg = el('span', 'ai-msg'), qa2 = el('div', 'qa');
        qa2.appendChild(aiBtn(t(q.fb ? 'pl.s.recheck' : 'pl.s.check'), 'main sm', function () {
          q.a = ta.value; PD.save();
          if (!q.a.trim()) { U.toast(t('pl.s.answerFirst')); ta.focus(); return; }
          runAI(msg, t('pl.s.checking'), function (sig) { return PlanAI.check(plan, idx, q, sig); }, function (r) { q.v = r.v; q.fb = r.fb; q.model = r.model; PD.save(); renderPrac(); });
        }));
        qa2.appendChild(btn(t(q.v === 'right' && !q.fb ? 'pl.s.unmark' : 'pl.s.mark'), 'sm', function () { if (q.v === 'right' && !q.fb) q.v = ''; else if (q.v !== 'right') { q.v = 'right'; } else { q.v = ''; q.fb = ''; q.model = ''; } PD.save(); renderPrac(); }, 'check'));
        qa2.appendChild(btn('', 'ghost sm icon', function () { pracEdit = q.id; renderPrac(); }, 'edit', t('pl.row.edit')));
        qa2.appendChild(btn('', 'ghost sm icon', function () { s.practice.splice(k, 1); PD.save(); renderPrac(); drawGoalRow(); }, 'x', t('pl.s.remove')));
        box.appendChild(qa2); box.appendChild(msg);
        if (q.fb) {
          var fb = el('div', 'fb ' + q.v); fb.appendChild(el('div', 'vd ' + q.v, t(VERD[q.v] || 'pl.v.partly'))); fb.appendChild(document.createTextNode(q.fb)); box.appendChild(fb);
          if (q.model) { var d2 = el('details'); d2.appendChild(el('summary', '', t('pl.s.model'))); d2.appendChild(el('div', 'model', q.model)); box.appendChild(d2); }
        }
        pracBody.appendChild(box);
      });
      if (adding) {
        var f = el('form', 'pl-inline'), tq2 = el('textarea', 'pl-ta'), th2 = el('input', 'pl-in'); tq2.rows = 3; tq2.placeholder = t('pl.s.qPh'); tq2.setAttribute('aria-label', t('pl.s.q')); th2.type = 'text'; th2.placeholder = t('pl.s.hintPh'); th2.setAttribute('aria-label', t('pl.s.hint'));
        var fo = el('div', 'qa'), ok2 = el('button', 'pl-btn main sm', t('pl.save')); ok2.type = 'submit'; fo.append(ok2, btn(t('pl.cancel'), 'sm ghost', function () { adding = false; renderPrac(); })); f.append(tq2, th2, fo);
        f.addEventListener('submit', function (e) { e.preventDefault(); if (!tq2.value.trim()) return; s.practice.push({ id: PD.uid('q'), q: tq2.value.slice(0, 1000), hint: th2.value.slice(0, 400), a: '', fb: '', model: '', v: '' }); PD.save(); adding = false; renderPrac(); drawGoalRow(); });
        pracBody.appendChild(f); setTimeout(function () { tq2.focus(); }, 20);
      }
      var row = el('div', 'ai-row');
      row.appendChild(btn(t('pl.s.pracAdd'), 'sm', function () { adding = true; renderPrac(); }, 'plus'));
      row.appendChild(aiBtn(t('pl.s.pracAI'), 'sm', function () { runAI(pracMsg, t('pl.s.drafting'), function (sig) { return PlanAI.draft(plan, idx, { practice: true }, sig); }, function (r) { var before = s.practice.length; applyDraft(r); U.toast(t('pl.s.added', { n: s.practice.length - before })); }); }));
      row.appendChild(pracMsg); pracBody.appendChild(row);
    }

    /* ================= notes ================= */
    var noteSec = sec('secNotes', t('pl.s.notes')), nta = el('textarea', 'pl-ta pl-notes'), saved = el('div', 'pl-saved');
    nta.value = s.notes; nta.placeholder = t('pl.s.notesPh'); nta.maxLength = 30000; nta.setAttribute('aria-label', t('pl.s.notes')); U.autosize(nta);
    nta.addEventListener('input', function () { s.notes = nta.value; saveSoon(); saved.textContent = t('pl.s.saving'); clearTimeout(S.sv); S.sv = setTimeout(function () { saved.textContent = t('pl.s.saved'); }, 700); });
    nta.addEventListener('blur', flush);
    noteSec.body.append(el('p', 'hint', t('pl.s.notesHint')), nta, saved);

    /* ================= what you made ================= */
    var resultSec = sec('secResults', t('pl.s.results')), resultBody = resultSec.body;
    function renderResults() {
      resultBody.textContent = ''; resultSec.count(s.results.length ? String(s.results.length) : '');
      resultBody.appendChild(el('p', 'hint', t('pl.s.resultsHint')));
      s.results.forEach(function (z, k) {
        var d = el('div', 'pl-result'); d.append(el('span', 'd', z.date ? U.fmtD(z.date, true) : ''));
        if (z.text) d.appendChild(el('div', 't', z.text));
        var row = el('div', 'qa');
        if (z.url) { var a = el('a', 'pl-btn sm'); a.href = z.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.append(document.createTextNode(t('pl.s.open')), ic('ext', 13)); row.appendChild(a); }
        row.appendChild(btn('', 'ghost sm icon', function () { s.results.splice(k, 1); PD.save(); renderResults(); }, 'x', t('pl.s.remove'))); d.appendChild(row); resultBody.appendChild(d);
      });
      var f = el('form', 'pl-inline'), tx = el('textarea', 'pl-ta'), u = el('input', 'pl-in'); tx.rows = 2; tx.maxLength = 1200; tx.placeholder = t('pl.s.resultPh'); tx.setAttribute('aria-label', t('pl.s.results')); u.type = 'url'; u.placeholder = t('pl.s.resUrlPh'); u.setAttribute('aria-label', t('pl.s.resUrl'));
      var ok = el('button', 'pl-btn main sm', t('pl.add2')); ok.type = 'submit'; var err = el('p', 'pl-err'); f.append(tx, u, ok, err); ok.style.justifySelf = 'start';
      f.addEventListener('submit', function (e) {
        e.preventDefault(); var link = PD.url(u.value); if (u.value.trim() && !link) { err.textContent = t('pl.s.resBadUrl'); return; }
        if (!tx.value.trim() && !link) return;
        s.results.unshift({ id: PD.uid('z'), text: tx.value.slice(0, 1200), url: link, date: PD.today() }); PD.save(); renderResults();
      });
      resultBody.appendChild(f);
    }

    /* ================= time spent ================= */
    var logSec = sec('secLog', t('pl.s.log')), logBody = logSec.body;
    function renderLog() {
      logBody.textContent = ''; var tot = PD.minutes(s); logSec.count(tot ? U.fmtMin(tot) : '');
      var bud = plan.hours * 60 * s.days / 7; logBody.appendChild(el('p', 'hint', t('pl.s.logHint', { budget: U.fmtMin(bud) })));
      if (tot) { var bar = el('div', 'pl-bar'), bi = el('i'); bi.style.width = Math.min(100, Math.round(tot / bud * 100)) + '%'; bar.appendChild(bi); bar.style.marginBottom = '10px'; logBody.appendChild(bar); }
      s.log.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (x) {
        var r = el('div', 'pl-log'); r.append(el('span', 'd', U.fmtD(x.date, true)), el('span', 'm', U.fmtMin(x.min)), el('span', '', x.text), btn('', 'ghost sm icon', function () { s.log = s.log.filter(function (y) { return y.id !== x.id; }); PD.save(); renderLog(); }, 'x', t('pl.s.remove')));
        logBody.appendChild(r);
      });
      var f = el('form', 'pl-addrow'), m = el('input', 'pl-in'), tx = el('input', 'pl-in'); m.type = 'number'; m.min = 1; m.max = 1440; m.value = 30; m.style.width = '84px'; m.style.flex = 'none'; m.setAttribute('aria-label', t('unit.min')); tx.type = 'text'; tx.maxLength = 300; tx.placeholder = t('pl.s.logPh'); tx.setAttribute('aria-label', t('pl.s.logPh'));
      var ok = el('button', 'pl-btn main'); ok.type = 'submit'; ok.appendChild(ic('plus', 15)); ok.appendChild(document.createTextNode(t('pl.s.logAdd')));
      f.append(m, el('span', 'pl-small', t('unit.min')), tx, ok); f.children[1].style.margin = '0'; f.children[1].style.alignSelf = 'center';
      f.addEventListener('submit', function (e) { e.preventDefault(); var n = parseInt(m.value, 10); if (!(n > 0)) return; s.log.push({ id: PD.uid('l'), date: PD.today(), min: Math.min(1440, n), text: tx.value.trim().slice(0, 300) }); PD.save(); renderLog(); });
      logBody.appendChild(f);
      var tm = 0; if (plan.face) { var H = GM.hist(), dd = H[PD.today()]; tm = dd && dd[plan.face] ? dd[plan.face] : 0; }
      if (tm) { var u = el('p', 'pl-small'); u.appendChild(document.createTextNode(t('pl.s.timerToday', { n: U.fmtMin(tm) }) + ' ')); u.appendChild(btn(t('pl.s.use'), 'sm ghost', function () { m.value = Math.round(tm); }, null)); logBody.appendChild(u); }
      var tl = el('a', 'pl-btn sm ghost'); tl.href = 'index.html'; tl.textContent = t('pl.s.openTimer'); tl.style.marginTop = '8px'; logBody.appendChild(tl);
    }

    /* ================= ask ================= */
    var askSec = sec('secAsk', t('pl.s.ask')), chat = el('div', 'pl-chat'), askForm = el('form', 'pl-addrow'), askTa = el('textarea', 'pl-ta'), askMsg = el('span', 'ai-msg');
    askTa.rows = 2; askTa.placeholder = t('pl.s.askPh'); askTa.maxLength = 1500; askTa.setAttribute('aria-label', t('pl.s.ask')); askTa.style.minHeight = '48px';
    var askGo = el('button', 'pl-btn main'); askGo.type = 'submit'; askGo.appendChild(ic('ai', 15)); askGo.appendChild(document.createTextNode(t('pl.s.askGo')));
    if (!U.aiReady()) { askGo.disabled = true; askGo.title = t('pl.s.noAi'); }
    askForm.append(askTa, askGo); askForm.style.alignItems = 'flex-end';
    var quick = el('div', 'pl-chips'); [1, 2, 3].forEach(function (k) { var c = el('button', 'pl-chip', t('pl.s.q' + k)); c.type = 'button'; c.addEventListener('click', function () { askTa.value = t('pl.s.q' + k); if (!askGo.disabled) askForm.requestSubmit(); }); quick.appendChild(c); });
    function drawChat() {
      chat.textContent = '';
      S.chat.forEach(function (m, k) {
        var d = el('div', 'pl-msg ' + (m.role === 'user' ? 'u' : 'a'), m.content);
        if (m.role !== 'user' && m.content && !m.live) {
          var qa = el('div', 'qa');
          qa.append(btn(t('pl.s.toNotes'), 'sm', function () { var q = S.chat[k - 1]; s.notes = (s.notes ? s.notes.replace(/\s+$/, '') + '\n\n' : '') + (q ? '▸ ' + q.content + '\n' : '') + m.content; nta.value = s.notes; PD.save(); noteSec.box.scrollIntoView({ behavior: U.reduced ? 'auto' : 'smooth', block: 'center' }); U.toast(t('pl.s.toNotesDone')); }, 'down2'),
            btn(t('pl.share.copy'), 'sm ghost', function () { try { navigator.clipboard.writeText(m.content); U.toast(t('pl.copied')); } catch (e) {} }, 'copy'));
          d.appendChild(qa);
        }
        chat.appendChild(d);
      });
    }
    askForm.addEventListener('submit', function (e) {
      e.preventDefault(); var q = askTa.value.trim(); if (!q || S.busy) return;
      S.chat.push({ role: 'user', content: q }); var a = { role: 'assistant', content: '', live: true }; S.chat.push(a); askTa.value = ''; drawChat();
      var hist = S.chat.slice(0, -1).map(function (m) { return { role: m.role, content: m.content }; });
      S.busy = true; S.ctl = new AbortController(); askMsg.textContent = ''; askMsg.className = 'ai-msg'; askMsg.append(el('span', 'pl-spin'), document.createTextNode(' ' + t('pl.s.thinking') + ' '), btn(t('pl.cancel'), 'sm ghost', function () { if (S.ctl) S.ctl.abort(); }));
      PlanAI.ask(plan, idx, hist, function (txt) { a.content = txt; var last = chat.lastChild; if (last) { last.firstChild.nodeValue = txt; } }, S.ctl.signal).then(function (txt) {
        S.busy = false; S.ctl = null; if (S.dead) return; a.content = txt; a.live = false; askMsg.textContent = ''; drawChat();
      }, function (er) {
        S.busy = false; S.ctl = null; if (S.dead) return; askMsg.textContent = ''; a.live = false;
        if (er && er.code === 'cancelled') { if (!a.content) S.chat.splice(S.chat.length - 2, 2); drawChat(); return; }
        S.chat.splice(S.chat.length - 1, 1); drawChat(); askMsg.className = 'ai-msg bad'; askMsg.textContent = U.aiFail(er);
      });
    });
    askTa.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); askForm.requestSubmit(); } });
    askSec.body.append(el('p', 'hint', t('pl.s.askHint')), chat, askForm, quick, askMsg);
    askMsg.style.display = 'block'; askMsg.style.marginTop = '8px';

    /* ================= the bottom ================= */
    var danger = el('div', 'pl-danger');
    danger.appendChild(btn(t('pl.row.dup'), 'sm', function () { var c = PD.dupStage(plan, s.id); if (c) location.hash = '#/p/' + plan.id + '/s/' + c.id; }, 'dup'));
    danger.appendChild(btn(t('pl.s.delete'), 'sm danger', function () {
      var snap = PD.snapshot(plan), title = s.title || t('pl.untitled'); PD.removeStage(plan, s.id);
      U.goTo('#/p/' + plan.id, t('pl.deleted', { title: title }), { label: t('pl.undo'), fn: function () { PD.restore(plan, snap); U.refresh(); } });
    }, 'trash'));

    /* ---------- put the page together ---------- */
    var cols = el('div', 'pl-cols'), a = el('div', 'pl-col'), b = el('div', 'pl-col');
    [goalSec, tasksSec, pracSec, noteSec].forEach(function (x) { a.appendChild(x.box); });
    [resSec, resultSec, logSec, askSec].forEach(function (x) { b.appendChild(x.box); });
    goalSec.box.style.order = 1; tasksSec.box.style.order = 2; resSec.box.style.order = 3; pracSec.box.style.order = 4; noteSec.box.style.order = 5; resultSec.box.style.order = 6; logSec.box.style.order = 7; askSec.box.style.order = 8;
    cols.append(a, b);
    main.append(nav, ribbon, head); if (noAi) main.appendChild(noAi); main.append(cols, danger);
    drawGoalRow(); renderTasks(); renderRes(); renderPrac(); renderResults(); renderLog(); drawChat();
    // coming from a link such as #/p/<id>/s/<id>, the page starts at the top

    return function () {
      S.dead = true; if (S.ctl) S.ctl.abort(); clearTimeout(S.sv); saveSoon.cancel(); flush();
      document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush); window.removeEventListener('resize', fitTitle);
    };
  }

  global.PlanStage = { render: render, searchLinks: searchLinks };
})(window);
