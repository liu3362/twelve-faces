/* plan.js — the page: your plans, one plan (the road and its outline), and the shared pieces (menus, dialogs, undo).
 * #/            the plans
 * #/p/<id>      one plan: the whole journey as a road on top, every stage as a row below
 * #/p/<id>/s/<stageId>   one stage (plan-stage.js)  */
(function (global) {
  'use strict';
  var PD = PlanData, GM = GoalMath, DAY = 864e5;
  var main = document.getElementById('plMain'), crumbEl = document.getElementById('plCrumb'), toastEl = document.getElementById('plToast'), dlg = document.getElementById('plDlg');
  var reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  I18N.apply(document);

  /* ================= small tools ================= */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var ICON = {
    plus: 'M8 3v10M3 8h10', up: 'M4 10l4-4 4 4', down: 'M4 6l4 4 4-4', chev: 'M6 3l5 5-5 5', back: 'M10 3L5 8l5 5', x: 'M4 4l8 8M12 4l-8 8',
    edit: 'M3 13l1-3.5 7-7 2.5 2.5-7 7zM9.5 4l2.5 2.5', trash: 'M3.5 5h9M6 5V3.500h4V5M5 5l.5 8h5l.5-8', dup: 'M5.500 5.500h7v7h-7zM3.500 10.500v-7h7', check: 'M3 8.500l3.200 3.200L13 4.800',
    more: 'M3.500 8h.01M8 8h.01M12.500 8h.01', ai: 'M8 2l1.400 3.600L13 7l-3.600 1.400L8 12l-1.400-3.600L3 7l3.600-1.400zM12.500 11.500v3M11 13h3', split: 'M8 2v5M8 7L4 13M8 7l4 6',
    ext: 'M9 3h4v4M13 3L7.500 8.500M6 4H3.500v8.500H12V10', copy: 'M5.500 5.500h7v8h-7zM3.500 10.500v-8h7', down2: 'M8 3v8M4.500 8L8 11.500 11.500 8M3 13.500h10',
    book: 'M3 3.500c2-.8 3.700-.6 5 .6 1.300-1.200 3-1.400 5-.6v9c-2-.8-3.700-.6-5 .6-1.300-1.200-3-1.400-5-.6zM8 4.100v9',
    video: 'M2 4.500h8.500v7H2zM10.500 7l3.500-2v6l-3.500-2', course: 'M8 3L1.500 6 8 9l6.500-3zM4 7.600v3.400c1 1 2.500 1.500 4 1.500s3-.5 4-1.500V7.600',
    web: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM2 8h12M8 2c2.300 2.200 2.300 9.800 0 12M8 2c-2.300 2.200-2.300 9.800 0 12', tool: 'M10 2.500a3.200 3.200 0 0 0-3 4.300L2.500 11.300l2.200 2.200 4.500-4.500a3.200 3.200 0 0 0 4.300-3l-2 1.500-1.800-1.800z',
    other: 'M4 2.500h5.500L12.500 5.500v8H4zM9.500 2.500v3h3', flag: 'M4 14V2.500M4 3h8l-2 3 2 3H4', fold: 'M4 6l4 4 4-4'
  };
  function ic(name, size) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('width', size || 15); s.setAttribute('height', size || 15); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ICON[name] || ICON.other); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', name === 'more' ? 2.6 : 1.6);
    p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); s.appendChild(p);
    return s;
  }
  function btn(label, cls, fn, icon, title) {
    var b = el('button', 'pl-btn' + (cls ? ' ' + cls : '')); b.type = 'button';
    if (icon) b.appendChild(ic(icon, cls && /\bsm\b/.test(cls) ? 14 : 15));
    if (label) b.appendChild(document.createTextNode(label));
    if (title) { b.title = title; if (!label) b.setAttribute('aria-label', title); }
    if (fn) b.addEventListener('click', fn);
    return b;
  }
  function debounce(fn, ms) { var h = 0; var f = function () { var a = arguments, me = this; clearTimeout(h); h = setTimeout(function () { fn.apply(me, a); }, ms); }; f.flush = function () { }; f.cancel = function () { clearTimeout(h); }; return f; }
  function autosize(ta) { var f = function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 600) + 'px'; }; ta.addEventListener('input', f); setTimeout(f, 0); return f; }

  /* ---------- dates and lengths ---------- */
  function fmtD(iso, withYear) {
    var d = GM.parse(iso); if (!d) return iso || '';
    try { return d.toLocaleDateString(t('lang.html'), withYear ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }); } catch (e) { return iso; }
  }
  function fmtRange(a, b) { return a === b ? fmtD(a) : fmtD(a) + ' – ' + fmtD(b); }
  function fmtDur(n) {
    if (n < 14) return t(n === 1 ? 'pl.dur.d1' : 'pl.dur.d', { n: n });
    if (n < 70) return t('pl.dur.w', { n: Math.round(n / 7) });
    if (n < 540) { var m = Math.round(n / 30.4); return t(m === 1 ? 'pl.dur.m1' : 'pl.dur.m', { n: m }); }
    var y = Math.round(n / 36.5) / 10; return t('pl.dur.y', { n: y.toLocaleString(t('lang.html'), { maximumFractionDigits: 1 }) });
  }
  function fmtMin(m) { m = Math.round(m); if (m < 60) return t('dur', { n: m, u: t('unit.min') }); var h = Math.floor(m / 60), r = m % 60; return t('dur', { n: h, u: t('unit.hour') }) + (r ? ' ' + t('dur', { n: r, u: t('unit.min') }) : ''); }
  function hue(plan, i) { return Countdown.journeyHue(plan.hue, i, Math.max(1, plan.steps.length)); }

  /* ---------- the toast, with an undo ---------- */
  var toastTimer = 0;
  function hideToast() { clearTimeout(toastTimer); toastEl.hidden = true; }
  function toast(msg, act) {
    toastEl.textContent = '';
    toastEl.appendChild(el('span', '', msg));
    if (act) { var b = el('button', '', act.label); b.type = 'button'; b.addEventListener('click', function () { hideToast(); act.fn(); }); toastEl.appendChild(b); }
    toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, act ? 10000 : 5000);
  }
  /* run an edit and offer to take it back */
  function withUndo(plan, label, fn, after) {
    var snap = PD.snapshot(plan); fn();
    toast(label, { label: t('pl.undo'), fn: function () { PD.restore(plan, snap); if (after) after(); } });
  }

  /* ---------- a small pop-up menu ---------- */
  var openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.node.remove(); document.removeEventListener('pointerdown', openMenu.off, true); document.removeEventListener('keydown', openMenu.key, true); window.removeEventListener('scroll', openMenu.sc, true); var a = openMenu.anchor; openMenu = null; if (a && a.isConnected) a.setAttribute('aria-expanded', 'false'); } }
  function menu(anchor, items) {
    closeMenu();
    var node = el('div', 'pl-menu'); node.setAttribute('role', 'menu');
    items.forEach(function (it) {
      if (it.sep) { node.appendChild(el('hr')); return; }
      var b = it.href ? el('a') : el('button'); if (!it.href) b.type = 'button'; else { b.href = it.href; b.target = '_blank'; b.rel = 'noopener noreferrer'; }
      b.setAttribute('role', 'menuitem'); if (it.danger) b.className = 'danger';
      if (it.icon) b.appendChild(ic(it.icon, 15)); b.appendChild(document.createTextNode(it.label));
      if (it.off) b.disabled = true;
      b.addEventListener('click', function () { closeMenu(); if (it.fn) it.fn(); });
      node.appendChild(b);
    });
    document.body.appendChild(node);
    var r = anchor.getBoundingClientRect(), w = node.offsetWidth, h = node.offsetHeight;
    var left = clamp(r.right - w, 8, window.innerWidth - w - 8), top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    node.style.left = left + 'px'; node.style.top = top + 'px';
    anchor.setAttribute('aria-expanded', 'true');
    var m = { node: node, anchor: anchor, t0: Date.now() };
    m.off = function (e) { if (!node.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeMenu(); };
    m.key = function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); if (anchor.isConnected) anchor.focus(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); var bs = [].slice.call(node.querySelectorAll('button:not([disabled]),a')), k = bs.indexOf(document.activeElement);
        bs[(k + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
      }
    };
    m.sc = function (e) { if (Date.now() - m.t0 < 300) return; if (!node.contains(e.target)) closeMenu(); };      // the scroll that brought the button into view arrives a moment after the click
    document.addEventListener('pointerdown', m.off, true); document.addEventListener('keydown', m.key, true); window.addEventListener('scroll', m.sc, true);
    openMenu = m;
    var first = node.querySelector('button:not([disabled]),a'); if (first) first.focus();
  }

  /* ---------- dialogs ---------- */
  function openDialog(node, opt) {
    dlg.textContent = ''; dlg.appendChild(node); dlg._onClose = opt && opt.onClose || null;
    if (!dlg.open) dlg.showModal();
  }
  function closeDialog() { if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', function () { var f = dlg._onClose; dlg._onClose = null; dlg.textContent = ''; if (f) f(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg && !dlg._locked) closeDialog(); });
  /* a one-line question */
  function askText(title, label, value, done, extra) {
    var f = el('form'); f.method = 'dialog';
    f.appendChild(el('h2', '', title));
    var p = el('div', 'pl-f'); var l = el('label', 'pl-lbl', label); var inp = el('input', 'pl-in'); inp.type = 'text'; inp.maxLength = 60; inp.value = value || ''; l.htmlFor = inp.id = 'plAsk' + Date.now(); p.append(l, inp); f.appendChild(p);
    if (extra) f.appendChild(el('p', 'pl-small', extra));
    var foot = el('div', 'pl-dfoot'); foot.append(btn(t('pl.cancel'), 'ghost', closeDialog)); var ok = el('button', 'pl-btn main', t('pl.save')); ok.type = 'submit'; foot.appendChild(ok); f.appendChild(foot);
    f.addEventListener('submit', function (e) { e.preventDefault(); var v = inp.value.trim(); closeDialog(); done(v); });
    openDialog(f); setTimeout(function () { inp.focus(); inp.select(); }, 30);
  }

  /* ================= the AI, in short ================= */
  function aiReady() { return AI.ready().length > 0; }
  function aiFail(e) { return e && /^(bad_json|cut|empty)$/.test(e.code) ? t('pl.ai.fail') : AI.explain(e); }

  /* ---------- the road's model ---------- */
  function timeMarks(plan) {
    var n = PD.totalDays(plan), out = [], start = GM.parse(plan.start); if (!n || !start) return out;
    var end = GM.addDays(start, n), unit = n <= 220 ? 'month' : n <= 800 ? 'quarter' : 'year';
    var d = new Date(start.getFullYear(), start.getMonth(), 1), guard = 0;
    function next() { if (unit === 'month') d = new Date(d.getFullYear(), d.getMonth() + 1, 1); else if (unit === 'quarter') d = new Date(d.getFullYear(), (Math.floor(d.getMonth() / 3) + 1) * 3, 1); else d = new Date(d.getFullYear() + 1, 0, 1); }
    next();
    while (d < end && guard++ < 200) {
      if (d > start) {
        var jan = d.getMonth() === 0, text;
        if (unit === 'year') text = String(d.getFullYear());
        else if (unit === 'quarter') text = jan ? String(d.getFullYear()) : t('pl.road.q', { n: d.getMonth() / 3 + 1 });
        else { try { text = d.toLocaleDateString(t('lang.html'), jan ? { month: 'short', year: 'numeric' } : { month: 'short' }); } catch (e) { text = String(d.getMonth() + 1); } }
        out.push({ x: PD.pos(plan, GM.iso(d)), text: text, major: unit === 'year' || jan });
      }
      next();
    }
    return out;
  }
  function roadModel(plan) {
    var n = plan.steps.length, here = PD.hereIndex(plan), ds = PD.dates(plan), end = PD.endDate(plan), left = GM.nDays(GM.startOfToday(), GM.parse(end));
    return {
      stages: plan.steps.map(function (s, i) { return { title: s.title || t('pl.untitled'), status: s.status === 'done' ? 'done' : (i === here ? 'doing' : 'todo'), fill: PD.stageFill(plan, i), hue: hue(plan, i), from: ds[i].from, to: ds[i].to }; }),
      phases: PD.phases(plan).filter(function (p) { return p.name; }), marks: timeMarks(plan), here: here, hue: plan.hue, seed: plan.id,
      goal: { lit: PD.progress(plan), text: fmtD(end, true), sub: left > 0 ? fmtDur(left) : t('pl.pastEnd') }
    };
  }

  /* ---------- the breadcrumb at the top ---------- */
  function setCrumb(list) {
    crumbEl.textContent = '';
    list.forEach(function (c, i) {
      if (i) crumbEl.appendChild(el('span', 'sep', '›'));
      if (c.href) { var a = el('a', '', c.text); a.href = c.href; crumbEl.appendChild(a); } else crumbEl.appendChild(el('span', 'cur', c.text));
    });
  }

  /* ---------- small persistent view settings (which phases are folded) ---------- */
  function uiGet() { try { return JSON.parse(localStorage.getItem('tf-plans-ui') || '{}') || {}; } catch (e) { return {}; } }
  function uiSet(o) { try { localStorage.setItem('tf-plans-ui', JSON.stringify(o)); } catch (e) {} }

  /* ================= routing ================= */
  var leave = null, scrollMemo = {}, currentRefresh = null, pendingToast = null;
  function goTo(hash, msg, act) { pendingToast = msg ? { msg: msg, act: act } : null; if (location.hash === hash) route(); else location.hash = hash; }      // a message (with an optional action) to show once the next page is up
  function route() {
    closeMenu(); if (dlg.open) dlg.close();
    if (leave) { var f = leave; leave = null; f(); }
    hideToast();
    var h = location.hash || '#/', m = /^#\/p\/([\w-]+)(?:\/s\/([\w-]+))?$/.exec(h);
    var plan = m ? PD.get(m[1]) : null;
    if (m && !plan) { location.replace('#/'); return; }
    window.scrollTo(0, 0);
    if (plan && m[2]) {
      var idx = PD.indexOf(plan, m[2]);
      if (idx < 0) { location.replace('#/p/' + plan.id); return; }
      leave = global.PlanStage.render(plan, idx) || null;
    } else if (plan) leave = renderPlan(plan);
    else leave = renderHome();
    I18N.apply(main);
    document.title = (plan ? plan.title + ' · ' : '') + t('pl.title');
    if (pendingToast) { var pm = pendingToast; pendingToast = null; toast(pm.msg, pm.act); }
  }
  window.addEventListener('hashchange', route);

  /* ================= the plans (home) ================= */
  function countsLine(plan) {
    var c = PD.counts(plan), h = PD.hereIndex(plan);
    return h >= plan.steps.length && plan.steps.length ? t('pl.card.complete', { n: plan.steps.length }) : t('pl.card.at', { i: Math.min(h + 1, plan.steps.length), n: plan.steps.length });
  }
  function renderHome() {
    document.documentElement.style.setProperty('--h', 215);
    setCrumb([]); main.textContent = '';
    var plans = PD.list();
    var hero = el('div', 'pl-hero'); hero.append(el('h1', '', t('pl.title')), el('p', '', t('pl.slogan'))); main.appendChild(hero);
    var cards = el('div', 'pl-cards'), minis = [];
    plans.forEach(function (p) {
      var a = el('a', 'pl-card'); a.href = '#/p/' + p.id;
      var mini = el('div', 'pl-mini'); a.appendChild(mini);
      var b = el('div', 'pl-cb'); b.appendChild(el('h3', '', p.title || t('pl.untitled')));
      var end = PD.endDate(p), left = GM.nDays(GM.startOfToday(), GM.parse(end)), pc = Math.round(PD.progress(p) * 100);
      b.appendChild(el('div', 'pl-cm', countsLine(p) + ' · ' + t('pl.card.pct', { n: pc })));
      var bar = el('div', 'pl-bar'); var bi = el('i'); bi.style.width = pc + '%'; bar.appendChild(bi); b.appendChild(bar);
      var fin = p.steps.length && p.steps.every(function (x) { return x.status === 'done'; });
      if (!fin) b.appendChild(el('div', 'pl-cm', !p.steps.length ? t('pl.card.empty') : left > 0 ? t('pl.card.ends', { date: fmtD(end, true), left: fmtDur(left) }) : t('pl.card.endsPast', { date: fmtD(end, true) })));
      a.appendChild(b); cards.appendChild(a); minis.push([p, mini]);
    });
    var nb = el('button', 'pl-card new'); nb.type = 'button';
    var plus = el('span', 'plus'); plus.appendChild(ic('plus', 22)); nb.append(plus, el('b', '', t('pl.new')), el('span', '', t('pl.new.sub')));
    nb.addEventListener('click', function () { openCreate(); });
    cards.appendChild(nb); main.appendChild(cards);
    var bar2 = el('div', 'pl-hbar');
    bar2.appendChild(btn(t('pl.import'), '', function () { openCreate('paste'); }, 'down2'));
    bar2.appendChild(btn(t('pl.example'), '', function () { var p = PD.example(); location.hash = '#/p/' + p.id; }, 'flag'));
    var goals = []; try { goals = (JSON.parse(localStorage.getItem('tf-goals') || '{}') || {}).goals || []; } catch (e) {}
    if (goals.length) bar2.appendChild(btn(t('pl.fromGoals'), '', function () { openFromGoals(goals); }, 'chev'));
    main.appendChild(bar2);
    if (!plans.length) {
      var how = el('div', 'pl-how');
      [['pl.how1', 'pl.how1d'], ['pl.how2', 'pl.how2d'], ['pl.how3', 'pl.how3d']].forEach(function (k) { var d = el('div'); d.append(el('b', '', t(k[0])), el('span', '', t(k[1]))); how.appendChild(d); });
      main.appendChild(how);
    }
    var roads = [], gone = false;
    requestAnimationFrame(function () {
      if (gone) return;
      roads = minis.map(function (x) { var r = PlanRoad.create(x[1], { mini: true }); r.update(roadModel(x[0])); r.setFocus(Math.min(PD.hereIndex(x[0]), Math.max(0, x[0].steps.length - 1)), true); return r; });
    });
    return function () { gone = true; roads.forEach(function (r) { r.destroy(); }); roads = []; };
  }

  function openFromGoals(goals) {
    var box = el('div', 'pl-dbody'); box.appendChild(el('h2', '', t('pl.fromGoals')));
    box.appendChild(el('p', 'pl-dsub', t('pl.fromGoals.sub')));
    goals.forEach(function (g) {
      var row = el('div', 'pl-res'); row.style.gridTemplateColumns = 'minmax(0,1fr) auto';
      var c = el('div'); c.append(el('b', '', g.title), el('div', 'nt', t('pl.fromGoals.n', { n: (g.stages || []).length }))); row.appendChild(c);
      row.appendChild(btn(t('pl.fromGoals.make'), 'main sm', function () { var p = PD.fromGoal(g); closeDialog(); location.hash = '#/p/' + p.id; }));
      box.appendChild(row);
    });
    var foot = el('div', 'pl-dfoot'); foot.appendChild(btn(t('pl.close'), '', closeDialog)); box.appendChild(foot);
    openDialog(box);
  }

  /* ================= making a plan ================= */
  var draft = { title: '', end: '', hours: '8', level: '', note: '', text: '', how: 'ai' };
  function isoPlus(days) { return GM.iso(GM.addDays(GM.startOfToday(), days)); }
  function openCreate(how) {
    if (how) draft.how = how; else if (!aiReady() && draft.how === 'ai') draft.how = 'blank';
    var ctl = null;
    var f = el('form'); f.noValidate = true;
    f.appendChild(el('h2', '', t('pl.new.title')));
    f.appendChild(el('p', 'pl-dsub', t('pl.new.sub2')));
    var seg = el('div', 'pl-seg'); seg.setAttribute('role', 'group');
    [['ai', 'pl.how.ai'], ['paste', 'pl.how.paste'], ['blank', 'pl.how.blank']].forEach(function (x) {
      var b = el('button', '', t(x[1])); b.type = 'button'; b.setAttribute('aria-pressed', draft.how === x[0] ? 'true' : 'false');
      b.addEventListener('click', function () { draft.how = x[0]; sync(); }); b.dataset.how = x[0]; seg.appendChild(b);
    });
    f.appendChild(seg);
    var fTitle = el('div', 'pl-f'), lT = el('label', 'pl-lbl', t('pl.f.title')), iT = el('input', 'pl-in'); iT.type = 'text'; iT.maxLength = 100; iT.id = 'plfTitle'; lT.htmlFor = 'plfTitle'; iT.placeholder = t('pl.f.titlePh'); iT.value = draft.title;
    fTitle.append(lT, iT); fTitle.style.marginTop = '14px'; f.appendChild(fTitle);
    var fEnd = el('div', 'pl-f'), lE = el('label', 'pl-lbl', t('pl.f.end')), iE = el('input', 'pl-in'); iE.type = 'date'; iE.id = 'plfEnd'; lE.htmlFor = 'plfEnd'; iE.value = draft.end;
    var chips = el('div', 'pl-chips');
    [[182, 'pl.c.6m'], [365, 'pl.c.1y'], [730, 'pl.c.2y'], [1095, 'pl.c.3y'], [1825, 'pl.c.5y']].forEach(function (c) {
      var b = el('button', 'pl-chip', t(c[1])); b.type = 'button'; b.addEventListener('click', function () { iE.value = isoPlus(c[0]); draft.end = iE.value; }); chips.appendChild(b);
    });
    fEnd.append(lE, iE, chips);
    var fHrs = el('div', 'pl-f'), lH = el('label', 'pl-lbl', t('pl.f.hours')), iH = el('input', 'pl-in'); iH.type = 'number'; iH.min = 1; iH.max = 80; iH.inputMode = 'numeric'; iH.id = 'plfHours'; lH.htmlFor = 'plfHours'; iH.value = draft.hours; fHrs.append(lH, iH);
    var row2 = el('div', 'pl-f2'); row2.append(fEnd, fHrs); f.appendChild(row2);
    var fLvl = el('div', 'pl-f'), lL = el('label', 'pl-lbl', t('pl.f.level')), iL = el('input', 'pl-in'); iL.type = 'text'; iL.maxLength = 300; iL.id = 'plfLevel'; lL.htmlFor = 'plfLevel'; iL.placeholder = t('pl.f.levelPh'); iL.value = draft.level; fLvl.append(lL, iL); f.appendChild(fLvl);
    var fNote = el('div', 'pl-f'), lN = el('label', 'pl-lbl', t('pl.f.note')), iN = el('textarea', 'pl-ta'); iN.rows = 2; iN.maxLength = 700; iN.id = 'plfNote'; lN.htmlFor = 'plfNote'; iN.placeholder = t('pl.f.notePh'); iN.value = draft.note; fNote.append(lN, iN); f.appendChild(fNote);
    var fText = el('div', 'pl-f'), lX = el('label', 'pl-lbl', t('pl.f.text')), iX = el('textarea', 'pl-ta'); iX.rows = 8; iX.id = 'plfText'; lX.htmlFor = 'plfText'; iX.placeholder = t('pl.f.textPh'); iX.value = draft.text; iX.style.fontFamily = 'var(--f-mono)'; iX.style.fontSize = '13px';
    var file = el('input'); file.type = 'file'; file.accept = '.json,.txt,.md,text/plain,application/json'; file.hidden = true;
    var fb = btn(t('pl.f.file'), 'sm ghost', function () { file.click(); }, 'down2'); fb.style.marginTop = '8px';
    file.addEventListener('change', function () { var fl = file.files && file.files[0]; if (!fl) return; var r = new FileReader(); r.onload = function () { iX.value = String(r.result || ''); draft.text = iX.value; }; r.readAsText(fl); });
    fText.append(lX, iX, el('p', 'pl-small', t('pl.f.textHelp')), fb, file); f.appendChild(fText);
    var err = el('p', 'pl-err'); err.setAttribute('role', 'alert'); f.appendChild(err);
    var noAi = el('p', 'pl-small', t('pl.noAi')); f.appendChild(noAi);
    var foot = el('div', 'pl-dfoot'); foot.appendChild(btn(t('pl.cancel'), 'ghost', closeDialog));
    var go = el('button', 'pl-btn main'); go.type = 'submit'; foot.appendChild(go); f.appendChild(foot);
    function sync() {
      [].forEach.call(seg.children, function (b) { b.setAttribute('aria-pressed', b.dataset.how === draft.how ? 'true' : 'false'); });
      var ai = draft.how === 'ai', paste = draft.how === 'paste';
      fText.hidden = !paste; fLvl.hidden = !ai; fNote.hidden = !ai; noAi.hidden = aiReady() || !ai;
      go.textContent = ai ? t('pl.go.ai') : paste ? t('pl.go.paste') : t('pl.go.blank');
      lE.textContent = t(ai ? 'pl.f.end' : 'pl.f.endOpt');
    }
    function grab() { draft.title = iT.value; draft.end = iE.value; draft.hours = iH.value; draft.level = iL.value; draft.note = iN.value; draft.text = iX.value; err.textContent = ''; }
    [iT, iE, iH, iL, iN, iX].forEach(function (i) { i.addEventListener('input', grab); });
    f.addEventListener('submit', function (e) {
      e.preventDefault(); grab(); err.textContent = '';
      var title = draft.title.trim(), hours = clamp(parseInt(draft.hours, 10) || 8, 1, 80), end = GM.parse(draft.end), today = GM.startOfToday();
      if (draft.how === 'paste') {
        var plan = PD.importPlan(draft.text, { title: title, hours: hours, total: end && end > today ? GM.nDays(today, end) + 1 : 0 });
        if (!plan) { err.textContent = t('pl.err.paste'); return; }
        if (title && !/^\s*\{/.test(draft.text)) plan.title = title.slice(0, 100); else if (!plan.title) plan.title = t('pl.untitled');
        if (end && end > today) plan.target = draft.end;
        PD.save(); draft = { title: '', end: '', hours: '8', level: '', note: '', text: '', how: 'ai' }; closeDialog(); goTo('#/p/' + plan.id, t('pl.made', { n: plan.steps.length })); return;
      }
      if (!title) { err.textContent = t('pl.err.title'); iT.focus(); return; }
      if (draft.how === 'blank') {
        var p0 = PD.create({ title: title, hours: hours, target: end && end > today ? draft.end : '' });
        PD.addStage(p0, 0, { title: '', days: 14 });
        draft = { title: '', end: '', hours: '8', level: '', note: '', text: '', how: 'ai' }; closeDialog(); location.hash = '#/p/' + p0.id; return;
      }
      if (!end || end <= today) { err.textContent = t('pl.err.date'); iE.focus(); return; }
      if (!aiReady()) { err.textContent = t('pl.noAi'); return; }
      var days = GM.nDays(today, end) + 1;
      // working: the dialog turns into a progress panel
      var box = el('div', 'pl-dbody'); dlg._locked = true;
      box.appendChild(el('h2', '', t('pl.ai.working')));
      var line = el('p', 'pl-dsub'); line.append(el('span', 'pl-spin'), document.createTextNode(' ' + t('pl.ai.workingSub'))); box.appendChild(line);
      var msg = el('p', 'pl-err'); box.appendChild(msg);
      var foot2 = el('div', 'pl-dfoot'); var cancel = btn(t('pl.cancel'), 'ghost', function () { if (ctl) ctl.abort(); dlg._locked = false; openCreate(); }); foot2.appendChild(cancel); box.appendChild(foot2);
      openDialog(box, { onClose: function () { dlg._locked = false; if (ctl) ctl.abort(); } });
      ctl = new AbortController();
      PlanAI.outline({ title: title, end: draft.end, days: days, hours: hours, level: draft.level.trim(), note: draft.note.trim() }, ctl.signal).then(function (r) {
        dlg._locked = false;
        if (!r.ok) { box.querySelector('h2').textContent = t('pl.ai.nope'); line.textContent = r.reason || t('pl.notScope'); cancel.textContent = t('pl.back2form'); return; }
        var plan = PD.create({ title: title, hours: hours, level: draft.level.trim(), note: draft.note.trim(), target: draft.end });
        PD.applyOutline(plan, r, { fit: days });
        draft = { title: '', end: '', hours: '8', level: '', note: '', text: '', how: 'ai' };
        closeDialog(); goTo('#/p/' + plan.id, r.partial ? t('pl.made.partial', { n: plan.steps.length }) : t('pl.made', { n: plan.steps.length }));
      }, function (e) {
        dlg._locked = false;
        if (e && e.code === 'cancelled') return;
        box.querySelector('h2').textContent = t('pl.ai.failed'); line.textContent = ''; msg.textContent = aiFail(e);
        cancel.textContent = t('pl.back2form');
        var retry = btn(t('pl.retry'), 'main', function () { dlg._locked = false; openCreate(); setTimeout(function () { var s = dlg.querySelector('form'); if (s) s.requestSubmit(); }, 40); }); foot2.appendChild(retry);
      });
    });
    openDialog(f, { onClose: function () { dlg._locked = false; if (ctl) { ctl.abort(); } } });
    sync(); setTimeout(function () { iT.focus(); }, 40);
  }

  /* ================= one plan ================= */
  function renderPlan(plan) {
    document.documentElement.style.setProperty('--h', plan.hue);
    setCrumb([{ text: t('pl.title'), href: '#/' }, { text: plan.title || t('pl.untitled') }]);
    main.textContent = '';
    var V = { plan: plan, road: null, anchors: [], rowEls: [], folded: (uiGet()[plan.id] || {}), editing: null, readIdx: -1, raf: 0, busy: null, ctl: null };
    if (plan.steps.length === 1 && !plan.steps[0].title) { V.editing = plan.steps[0].id; V.newId = plan.steps[0].id; }        // a blank plan: name the first stage right away
    var head = el('header', 'pl-phead'), outline = el('div', 'pl-outline'), wrap = el('div', 'pl-roadwrap'), roadEl = el('div', 'pl-road');
    var notes = el('div'), cap = el('div', 'pl-cap'), capN = el('b'), capT = el('span', 't'), capD = el('span', 'd'), capGo = el('a', 'pl-btn main sm');
    cap.append(capN, capT, capD, capGo);
    var rb = el('a', 'pl-rback'); rb.href = '#/'; rb.append(ic('back', 14), el('span', '', plan.title || t('pl.untitled'))); rb.title = t('pl.title');
    var rt = el('div', 'pl-rtools');
    wrap.append(roadEl, rb, rt, cap);
    main.append(head, notes, wrap, outline, el('div', 'pl-spacer'));

    /* ---------- the top: title, numbers, and what you can do with the whole plan ---------- */
    function buildHead() {
      head.textContent = '';
      head.appendChild(el('h1', 'pl-ptitle', plan.title || t('pl.untitled')));
      var n = plan.steps.length, end = PD.endDate(plan);
      head.appendChild(el('p', 'pl-pmeta', n ? t('pl.meta', { n: n, from: fmtD(plan.start, true), to: fmtD(end, true), h: plan.hours }) : t('pl.meta0', { h: plan.hours })));
      if (n) {
        var st = el('div', 'pl-pstat'), bar = el('div', 'pl-bar'), bi = el('i'), pc = Math.round(PD.progress(plan) * 100); bi.style.width = pc + '%'; bar.appendChild(bi);
        var c = PD.counts(plan); st.append(bar, el('b', '', pc + '%'), el('span', 'pl-small', t('pl.counts', { done: c.done, all: n }))); st.lastChild.style.margin = '0';
        head.appendChild(st);
      }
      if (plan.summary) head.appendChild(el('p', 'pl-psum', plan.summary));
      var act = el('div', 'pl-pact');
      act.appendChild(btn(t('pl.editPlan'), '', function () { openEditPlan(plan, refreshAll); }, 'edit'));
      act.appendChild(btn(t('pl.share'), '', function () { openShare(plan); }, 'down2'));
      var more = btn('', 'icon', null, 'more', t('pl.more')); more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-expanded', 'false');
      more.addEventListener('click', function () {
        menu(more, [
          { label: t('pl.m.today'), icon: 'flag', fn: function () { withUndo(plan, t('pl.rescheduled'), function () { PD.reschedule(plan); refreshAll(); }, refreshAll); } },
          { label: t('pl.m.rebuild'), icon: 'ai', fn: function () { rebuild(); }, off: !aiReady() },
          { sep: true },
          { label: t('pl.m.delete'), icon: 'trash', danger: true, fn: function () { if (confirm(t('pl.delConfirm', { title: plan.title }))) { PD.remove(plan.id); location.hash = '#/'; } } }
        ]);
      });
      act.appendChild(more);
      head.appendChild(act);
      /* what the plan needs to say: you are behind, or the outline runs past your target date */
      notes.textContent = ''; notes.className = '';
      var here = PD.hereIndex(plan), cal = PD.calendarIndex(plan), nn = n;
      if (nn && here < nn && cal > here && GM.parse(plan.start) <= GM.startOfToday()) {
        var b1 = el('div', 'pl-note warn'); b1.appendChild(el('span', '', t('pl.behind', { cal: cal + 1, here: here + 1 })));
        b1.appendChild(btn(t('pl.behind.fix'), 'sm main', function () { withUndo(plan, t('pl.rescheduled'), function () { PD.reschedule(plan); refreshAll(); }, refreshAll); })); notes.appendChild(b1);
      }
      if (nn && plan.target) {
        var over = PD.dayOf(plan, end) - PD.dayOf(plan, plan.target);
        if (Math.abs(over) > 14) {
          var b2 = el('div', 'pl-note'); b2.appendChild(el('span', '', t(over > 0 ? 'pl.over' : 'pl.under', { n: fmtDur(Math.abs(over)), target: fmtD(plan.target, true) })));
          b2.appendChild(btn(t('pl.fit'), 'sm', function () { withUndo(plan, t('pl.fitted'), function () { PD.fitToTarget(plan); refreshAll(); }, refreshAll); })); notes.appendChild(b2);
        }
      }
      notes.style.margin = notes.children.length ? '0 0 14px' : '0';
    }
    function rebuild() {
      if (V.busy || !aiReady()) return;
      var has = plan.steps.some(function (s) { return s.status !== 'todo' || s.tasks.length || s.notes || s.results.length; });
      if (has && !confirm(t('pl.rebuildConfirm'))) return;
      var end = plan.target || PD.endDate(plan), days = Math.max(14, PD.dayOf(plan, end) + 1);
      busy(t('pl.ai.working'));
      V.ctl = new AbortController();
      PlanAI.outline({ title: plan.title, end: end, days: days, hours: plan.hours, level: plan.level, note: plan.note }, V.ctl.signal).then(function (r) {
        busy(null);
        if (!r.ok) { toast(r.reason || t('pl.notScope')); return; }
        withUndo(plan, t('pl.made', { n: r.stages.length }), function () { plan.start = PD.today(); PD.applyOutline(plan, r, { fit: days }); refreshAll(); }, refreshAll);
      }, function (e) { busy(null); if (!e || e.code !== 'cancelled') toast(aiFail(e)); });
    }
    function busy(msg) {
      V.busy = msg; rt.textContent = '';
      if (msg) { var s = el('span', 'pl-btn sm'); s.append(el('span', 'pl-spin'), document.createTextNode(' ' + msg)); rt.append(s, btn(t('pl.cancel'), 'sm', function () { if (V.ctl) V.ctl.abort(); })); }
    }

    /* ---------- the outline: phases and rows ---------- */
    function foldedKey(name) { return name || '·'; }
    function saveFold() { var o = uiGet(); o[plan.id] = V.folded; uiSet(o); }
    function phaseHead(g, gi) {
      var ds = V.ds, done = 0, k;
      for (k = g.from; k <= g.to; k++) if (plan.steps[k].status === 'done') done++;
      var open = !V.folded[foldedKey(g.name)];
      var h = el('div', 'pl-phase'); h.style.setProperty('--th', hue(plan, g.from)); h.dataset.from = g.from;
      var fold = el('button', 'pl-fold'); fold.type = 'button'; fold.setAttribute('aria-expanded', open ? 'true' : 'false'); fold.setAttribute('aria-label', t(open ? 'pl.phase.fold' : 'pl.phase.unfold', { name: g.name })); fold.appendChild(ic('fold', 14));
      fold.addEventListener('click', function () { if (open) V.folded[foldedKey(g.name)] = 1; else delete V.folded[foldedKey(g.name)]; saveFold(); renderOutline(); syncFocus(true); });
      h.append(fold, el('h2', '', g.name), el('span', 'm', t('pl.phase.meta', { n: g.n, done: done, range: fmtRange(ds[g.from].from, ds[g.to].to) })));
      var acts = el('div', 'acts');
      acts.appendChild(btn('', 'ghost sm icon', function () { askText(t('pl.phase.rename'), t('pl.phase.name'), g.name, function (v) { PD.renamePhase(plan, g.from, g.to, v); refreshAll(); }); }, 'edit', t('pl.phase.rename')));
      acts.appendChild(btn('', 'ghost sm icon', function () { addAfter(g.to); }, 'plus', t('pl.phase.add', { name: g.name })));
      h.appendChild(acts);
      return h;
    }
    function stageRow(i) {
      var s = plan.steps[i], ds = V.ds[i], here = V.here, isHere = i === here;
      var row = el('article', 'pl-row' + (s.status === 'done' ? ' done' : '') + (isHere ? ' here' : '')); row.dataset.i = i; row.dataset.id = s.id; row.style.setProperty('--th', hue(plan, i));
      var n = el('button', 'pl-n'); n.type = 'button'; n.setAttribute('aria-pressed', s.status === 'done' ? 'true' : 'false'); n.setAttribute('aria-label', t('pl.row.toggle', { n: i + 1 })); n.title = t(s.status === 'done' ? 'pl.row.undone' : 'pl.row.done');
      if (s.status === 'done') n.appendChild(ic('check', 15)); else n.textContent = String(i + 1);
      n.addEventListener('click', function () { PD.setStatus(plan, s.id, s.status === 'done' ? 'todo' : 'done'); refreshAll(); });
      var c = el('div', 'pl-main-c'), a = el('a', 'pl-st', s.title || t('pl.untitled')); a.href = '#/p/' + plan.id + '/s/' + s.id; c.appendChild(a);
      if (s.goal) c.appendChild(el('p', 'pl-sg', s.goal));
      var meta = el('div', 'pl-meta'); meta.appendChild(el('span', '', fmtRange(ds.from, ds.to))); meta.appendChild(el('span', '', fmtDur(s.days)));
      if (s.tasks.length) meta.appendChild(el('span', '', t('pl.row.tasks', { done: s.tasks.filter(function (x) { return x.done; }).length, all: s.tasks.length })));
      if (s.res.length) meta.appendChild(el('span', '', t('pl.row.res', { n: s.res.length })));
      if (isHere) meta.insertBefore(el('span', 'here-tag', t('pl.here')), meta.firstChild);
      c.appendChild(meta);
      var acts = el('div', 'pl-acts');
      var e = btn('', 'ghost sm icon hov', function () { openEditor(i); }, 'edit', t('pl.row.edit')); var ins = btn('', 'ghost sm icon hov', function () { insertAt(i + 1, s.phase); }, 'plus', t('pl.row.insBelow'));
      var mo = btn('', 'ghost sm icon', null, 'more', t('pl.more')); mo.setAttribute('aria-haspopup', 'menu'); mo.setAttribute('aria-expanded', 'false');
      mo.addEventListener('click', function () { rowMenu(mo, i); });
      var go = el('a', 'pl-btn ghost sm icon'); go.href = a.href; go.setAttribute('aria-label', t('pl.row.open')); go.title = t('pl.row.open'); go.appendChild(ic('chev', 15));
      acts.append(e, ins, mo, go);
      row.append(n, c, acts);
      return row;
    }
    function rowMenu(anchor, i) {
      var s = plan.steps[i], last = plan.steps.length - 1;
      menu(anchor, [
        { label: t('pl.row.open'), icon: 'chev', fn: function () { location.hash = '#/p/' + plan.id + '/s/' + s.id; } },
        { label: t('pl.row.edit'), icon: 'edit', fn: function () { openEditor(i); } },
        { sep: true },
        { label: t('pl.row.insAbove'), icon: 'plus', fn: function () { insertAt(i, s.phase); } },
        { label: t('pl.row.insBelow'), icon: 'plus', fn: function () { insertAt(i + 1, s.phase); } },
        { label: t('pl.row.up'), icon: 'up', off: i === 0, fn: function () { PD.nudge(plan, s.id, -1); refreshAll(); } },
        { label: t('pl.row.down'), icon: 'down', off: i === last, fn: function () { PD.nudge(plan, s.id, 1); refreshAll(); } },
        { label: t('pl.row.dup'), icon: 'dup', fn: function () { PD.dupStage(plan, s.id); refreshAll(); toast(t('pl.dupDone')); } },
        { label: t('pl.row.split'), icon: 'split', off: !aiReady(), fn: function () { split(i); } },
        { label: t('pl.row.newPhase'), icon: 'flag', fn: function () { askText(t('pl.phase.new'), t('pl.phase.name'), '', function (v) { if (v) { PD.startPhaseAt(plan, i, v); refreshAll(); } }, t('pl.phase.newHelp')); } },
        { sep: true },
        { label: t('pl.row.delete'), icon: 'trash', danger: true, fn: function () { removeStage(i); } }
      ]);
    }
    function removeStage(i) {
      var s = plan.steps[i]; if (!s) return;
      withUndo(plan, t('pl.deleted', { title: s.title || t('pl.untitled') }), function () { PD.removeStage(plan, s.id); refreshAll(); }, refreshAll);
    }
    function split(i) {
      if (V.busy) return;
      var s = plan.steps[i], k = s.days >= 42 ? 4 : s.days >= 14 ? 3 : 2;
      busy(t('pl.splitting')); V.ctl = new AbortController();
      PlanAI.split(plan, i, k, V.ctl.signal).then(function (parts) {
        busy(null);
        withUndo(plan, t('pl.splitDone', { n: parts.length }), function () { PD.replaceStage(plan, s.id, parts); refreshAll(); }, refreshAll);
      }, function (e) { busy(null); if (!e || e.code !== 'cancelled') toast(aiFail(e)); });
    }
    function insertAt(at, phase) {
      var s = PD.addStage(plan, at, { title: '', days: 14, phase: phase });
      V.editing = s.id; V.newId = s.id; refreshAll(); scrollRowIntoView(PD.indexOf(plan, s.id));
    }
    function addAfter(i) { insertAt(i + 1, plan.steps[i] ? plan.steps[i].phase : ''); }

    /* the inline editor replaces a row's contents */
    function dropEmptyNew() {                                // a stage added a moment ago and never named is not kept
      if (V.newId) { var k = PD.indexOf(plan, V.newId); if (k >= 0 && !plan.steps[k].title) PD.removeStage(plan, V.newId); V.newId = null; }
    }
    function openEditor(i) {
      var s0 = plan.steps[i]; if (!s0) return;
      if (V.newId && V.newId !== s0.id) { dropEmptyNew(); i = PD.indexOf(plan, s0.id); }
      V.editing = s0.id; refreshAll(); scrollRowIntoView(PD.indexOf(plan, s0.id));
    }
    function editorIn(row, i) {
      var s = plan.steps[i], isNew = V.newId === s.id;
      row.textContent = ''; row.classList.add('editing'); row.appendChild(el('span'));   // keeps the grid's first column
      var n = row.firstChild; n.className = 'pl-n'; n.textContent = String(i + 1); n.style.cursor = 'default';
      var f = el('form', 'pl-edit'); f.noValidate = true; f.style.gridColumn = '2 / -1'; f.style.padding = '0';
      var fT = el('div', 'pl-f'), lT = el('label', 'pl-lbl', t('pl.e.title')), iT = el('input', 'pl-in'); iT.type = 'text'; iT.maxLength = 120; iT.value = s.title; iT.placeholder = t('pl.e.titlePh'); iT.id = 'ed' + s.id; lT.htmlFor = iT.id; fT.append(lT, iT);
      var fG = el('div', 'pl-f'), lG = el('label', 'pl-lbl', t('pl.e.goal')), iG = el('textarea', 'pl-ta'); iG.rows = 2; iG.maxLength = 500; iG.value = s.goal; iG.placeholder = t('pl.e.goalPh'); iG.id = 'eg' + s.id; lG.htmlFor = iG.id; fG.append(lG, iG);
      var r1 = el('div', 'row');
      var fD = el('div', 'pl-f'), lD = el('label', 'pl-lbl', t('pl.e.length')), dur = el('div', 'dur'), iD = el('input', 'pl-in'), uD = el('select', 'pl-sel');
      iD.type = 'number'; iD.min = 1; iD.max = 3650; iD.inputMode = 'numeric'; iD.id = 'ed2' + s.id; lD.htmlFor = iD.id;
      var wk = s.days >= 14 && s.days % 7 === 0;
      [['d', t('pl.u.days')], ['w', t('pl.u.weeks')]].forEach(function (u) { var o = el('option', '', u[1]); o.value = u[0]; uD.appendChild(o); });
      uD.value = wk ? 'w' : 'd'; iD.value = wk ? s.days / 7 : s.days; uD.setAttribute('aria-label', t('pl.e.unit'));
      dur.append(iD, uD); fD.append(lD, dur);
      var fP = el('div', 'pl-f'), lP = el('label', 'pl-lbl', t('pl.e.phase')), iP = el('input', 'pl-in'), dl = el('datalist'); iP.type = 'text'; iP.maxLength = 60; iP.value = s.phase; iP.setAttribute('list', 'phl' + s.id); iP.id = 'ep' + s.id; lP.htmlFor = iP.id; dl.id = 'phl' + s.id;
      PD.phases(plan).forEach(function (g) { if (g.name) { var o = el('option'); o.value = g.name; dl.appendChild(o); } });
      iP.placeholder = t('pl.e.phasePh'); fP.append(lP, iP, dl);
      r1.append(fD, fP); r1.style.alignItems = 'flex-start'; fP.style.flex = '1 1 180px';
      var shift = el('p', 'pl-small');
      function days() { return clamp(Math.round((parseFloat(iD.value) || 1) * (uD.value === 'w' ? 7 : 1)), 1, 3650); }
      function showShift() { var d = days() - s.days; shift.textContent = d === 0 ? t('pl.e.shift0') : t(d > 0 ? 'pl.e.shiftP' : 'pl.e.shiftM', { n: fmtDur(Math.abs(d)) }); }
      iD.addEventListener('input', showShift); uD.addEventListener('change', showShift); showShift();
      var foot = el('div', 'row');
      var ok = el('button', 'pl-btn main sm', t('pl.save')); ok.type = 'submit';
      var cancel = btn(t('pl.cancel'), 'sm ghost', function () { cancelEdit(); });
      var del = btn(t('pl.row.delete'), 'sm danger ghost', function () { V.editing = null; V.newId = null; removeStage(i); });
      foot.append(ok, cancel, del);
      f.append(fT, fG, r1, shift, foot); row.appendChild(f);
      function cancelEdit() { if (isNew && !s.title) { PD.removeStage(plan, s.id); } V.editing = null; V.newId = null; refreshAll(); }
      f.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); } });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var title = iT.value.trim(); if (!title) { iT.focus(); iT.style.borderColor = 'var(--bad)'; return; }
        s.title = title.slice(0, 120); s.goal = iG.value.slice(0, 500); s.days = days(); s.phase = iP.value.trim().slice(0, 60);
        PD.save(); V.editing = null; V.newId = null; refreshAll();
      });
      setTimeout(function () { iT.focus(); }, 20);
    }

    function renderOutline() {
      V.anchors = []; V.rowEls = []; outline.textContent = ''; V.ds = PD.dates(plan); V.here = PD.hereIndex(plan);
      var n = plan.steps.length;
      if (!n) {
        var e = el('div', 'pl-note'); e.appendChild(el('span', '', t('pl.empty')));
        e.appendChild(btn(t('pl.empty.add'), 'sm main', function () { insertAt(0, ''); }, 'plus'));
        if (aiReady()) e.appendChild(btn(t('pl.m.rebuild'), 'sm', function () { rebuild(); }, 'ai'));
        outline.appendChild(e); return;
      }
      var groups = PD.phases(plan), named = groups.some(function (g) { return g.name; });
      groups.forEach(function (g, gi) {
        var folded = g.name && V.folded[foldedKey(g.name)];
        if (g.name) { var h = phaseHead(g, gi); outline.appendChild(h); if (folded) V.anchors.push({ from: g.from, to: g.to, el: h }); }
        if (!folded) for (var i = g.from; i <= g.to; i++) {
          var row = stageRow(i); outline.appendChild(row); V.rowEls[i] = row; V.anchors.push({ from: i, to: i, el: row });
          if (V.editing === plan.steps[i].id) editorIn(row, i);
        }
        if (g.name && !folded) { var add = el('div', 'pl-add'); add.appendChild(btn(t('pl.phase.add', { name: g.name }), 'sm ghost', function () { addAfter(g.to); }, 'plus')); outline.appendChild(add); }
      });
      var end = el('div', 'pl-add'); end.style.marginTop = '18px';
      end.appendChild(btn(t('pl.add'), 'sm', function () { addAfter(n - 1); }, 'plus'));
      end.appendChild(btn(t('pl.phase.new'), 'sm ghost', function () { askText(t('pl.phase.new'), t('pl.phase.name'), '', function (v) { if (!v) return; var s = PD.addStage(plan, n, { title: '', days: 14, phase: v }); V.editing = s.id; V.newId = s.id; refreshAll(); scrollRowIntoView(n); }, t('pl.phase.newHelp2')); }, 'flag'));
      outline.appendChild(end);
      if (named === false && n > 6) outline.appendChild(el('p', 'pl-endnote', t('pl.tipPhases')));
      outline.appendChild(el('p', 'pl-endnote', t('pl.endnote', { date: fmtD(PD.endDate(plan), true) })));
    }

    /* ---------- the road follows the list ---------- */
    function roadBottom() { return wrap.getBoundingClientRect().bottom; }
    function syncFocus(jump) {
      var n = plan.steps.length; if (!n || !V.road) return;
      var line = roadBottom() + 24, f = n, found = false;
      for (var k = 0; k < V.anchors.length; k++) {
        var a = V.anchors[k], r = a.el.getBoundingClientRect();
        if (line < r.top) { f = a.from; found = true; break; }
        if (line <= r.bottom) { f = a.from + clamp((line - r.top) / Math.max(1, r.height), 0, 0.999) * (a.to - a.from + 1); found = true; break; }
      }
      if (!found) f = n;
      V.road.setFocus(f, jump);
      var fi = clamp(Math.floor(f), 0, n - 1);
      if (fi !== V.readIdx || jump) { V.readIdx = fi; showCap(fi); [].forEach.call(outline.querySelectorAll('.pl-row.read'), function (e) { e.classList.remove('read'); }); if (V.rowEls[fi]) V.rowEls[fi].classList.add('read'); }
    }
    function showCap(i) {
      var s = plan.steps[i]; if (!s) { cap.hidden = true; return; }
      cap.hidden = false; var ds = PD.dates(plan)[i];
      capN.textContent = (i + 1) + '/' + plan.steps.length; capT.textContent = s.title || t('pl.untitled'); capD.textContent = fmtRange(ds.from, ds.to) + ' · ' + fmtDur(s.days);
      capGo.href = '#/p/' + plan.id + '/s/' + s.id; capGo.textContent = ''; capGo.append(document.createTextNode(t('pl.cap.open')), ic('chev', 13));
    }
    function scrollRowIntoView(i, pulse, instant) {
      var row = V.rowEls[i];
      if (!row) {                                           // it sits in a folded phase: open the phase first
        var g = PD.phases(plan).filter(function (p) { return i >= p.from && i <= p.to; })[0];
        if (g && g.name && V.folded[foldedKey(g.name)]) { delete V.folded[foldedKey(g.name)]; saveFold(); renderOutline(); syncFocus(true); row = V.rowEls[i]; }
        if (!row) return;
      }
      var y = row.getBoundingClientRect().top + window.scrollY - wrap.offsetHeight - 22;
      window.scrollTo({ top: Math.max(0, y), behavior: (reduced || instant) ? 'auto' : 'smooth' });
      if (pulse) { setTimeout(function () { row.classList.remove('pulse'); void row.offsetWidth; row.classList.add('pulse'); }, reduced ? 0 : 350); }
    }
    function onScroll() { if (V.raf) return; V.raf = requestAnimationFrame(function () { V.raf = 0; syncFocus(false); }); }
    function onResize() { if (V.road) V.road.resize(); syncFocus(true); }
    window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onResize); currentRefresh = refreshAll;

    function refreshAll(keepNear) {
      closeMenu(); buildHead(); renderOutline();
      if (V.road) { V.road.update(roadModel(plan)); }
      syncFocus(true);
    }

    buildHead(); renderOutline();
    V.road = PlanRoad.create(roadEl, {
      onPick: function (i) { scrollRowIntoView(i, true); },
      onDrag: function (d) { var n = plan.steps.length || 1; window.scrollBy(0, d * outline.offsetHeight / n); }
    });
    V.road.update(roadModel(plan));
    var back = scrollMemo[plan.id]; if (back != null) { window.scrollTo(0, back); }
    requestAnimationFrame(function () {
      V.road.resize(); syncFocus(true);
      var hi = PD.hereIndex(plan);                                                  // open at where you are, not at the very first stage
      if (back == null && hi > 0 && hi < plan.steps.length) { scrollRowIntoView(hi, false, true); syncFocus(true); }
    });
    if (!plan.steps.length) showCap(-1);

    return function () {
      scrollMemo[plan.id] = window.scrollY; currentRefresh = null;
      window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize);
      if (V.raf) cancelAnimationFrame(V.raf); if (V.ctl) V.ctl.abort();
      if (V.road) V.road.destroy();
      PD.save();
    };
  }

  /* ================= editing the plan itself, and sharing it ================= */
  function openEditPlan(plan, done) {
    var f = el('form'); f.noValidate = true;
    f.appendChild(el('h2', '', t('pl.editPlan')));
    function field(label, node, id) { var d = el('div', 'pl-f'), l = el('label', 'pl-lbl', label); node.id = id; l.htmlFor = id; d.append(l, node); return d; }
    var iT = el('input', 'pl-in'); iT.type = 'text'; iT.maxLength = 100; iT.value = plan.title;
    var iS = el('input', 'pl-in'); iS.type = 'date'; iS.value = plan.start;
    var iE = el('input', 'pl-in'); iE.type = 'date'; iE.value = plan.target;
    var iH = el('input', 'pl-in'); iH.type = 'number'; iH.min = 1; iH.max = 80; iH.value = plan.hours;
    var iL = el('input', 'pl-in'); iL.type = 'text'; iL.maxLength = 300; iL.value = plan.level;
    var iN = el('textarea', 'pl-ta'); iN.rows = 2; iN.maxLength = 700; iN.value = plan.note;
    var iF = el('select', 'pl-sel'); var o0 = el('option', '', t('pl.f.faceNone')); o0.value = ''; iF.appendChild(o0);
    var faces = []; try { PROFILES.all().forEach(function (d) { (d.faces || []).forEach(function (fc) { faces.push({ key: fc.key, name: fc.name, die: d.label }); }); }); } catch (e) {}
    faces.forEach(function (fc) { var o = el('option', '', fc.name + ' · ' + fc.die); o.value = fc.key; iF.appendChild(o); }); iF.value = plan.face;
    f.appendChild(field(t('pl.f.title'), iT, 'epT'));
    var r1 = el('div', 'pl-f2'); r1.append(field(t('pl.f.start'), iS, 'epS'), field(t('pl.f.end'), iE, 'epE')); f.appendChild(r1);
    var r2 = el('div', 'pl-f2'); r2.append(field(t('pl.f.hours'), iH, 'epH'), field(t('pl.f.face'), iF, 'epF')); f.appendChild(r2);
    f.appendChild(el('p', 'pl-small', t('pl.f.faceHelp')));
    f.appendChild(field(t('pl.f.level'), iL, 'epL')); f.appendChild(field(t('pl.f.note'), iN, 'epN'));
    var hs = el('div', 'pl-f'); hs.appendChild(el('span', 'pl-lbl', t('pl.f.color')));
    var sw = el('div', 'pl-chips'); var hv = plan.hue;
    PD.HUES.concat([95, 320, 55]).forEach(function (h) { var b = el('button', 'pl-chip'); b.type = 'button'; b.style.background = 'hsl(' + h + ' 62% 60%)'; b.style.width = b.style.height = '30px'; b.style.padding = 0; b.setAttribute('aria-label', String(h)); b.setAttribute('aria-pressed', h === hv ? 'true' : 'false'); b.style.borderWidth = h === hv ? '3px' : '1px';
      b.addEventListener('click', function () { hv = h; [].forEach.call(sw.children, function (x) { x.setAttribute('aria-pressed', 'false'); x.style.borderWidth = '1px'; }); b.setAttribute('aria-pressed', 'true'); b.style.borderWidth = '3px'; }); sw.appendChild(b); });
    hs.appendChild(sw); f.appendChild(hs);
    var err = el('p', 'pl-err'); f.appendChild(err);
    var foot = el('div', 'pl-dfoot'); foot.appendChild(btn(t('pl.cancel'), 'ghost', closeDialog));
    var ok = el('button', 'pl-btn main', t('pl.save')); ok.type = 'submit'; foot.appendChild(ok); f.appendChild(foot);
    f.addEventListener('submit', function (e) {
      e.preventDefault(); if (!iT.value.trim()) { err.textContent = t('pl.err.title'); return; }
      plan.title = iT.value.trim().slice(0, 100); if (GM.parse(iS.value)) plan.start = iS.value; plan.target = GM.parse(iE.value) ? iE.value : '';
      plan.hours = clamp(parseInt(iH.value, 10) || plan.hours, 1, 80); plan.level = iL.value.slice(0, 400); plan.note = iN.value.slice(0, 800); plan.face = iF.value; plan.hue = hv;
      PD.save(); closeDialog(); document.documentElement.style.setProperty('--h', plan.hue); setCrumb([{ text: t('pl.title'), href: '#/' }, { text: plan.title }]); if (done) done();
    });
    openDialog(f);
  }
  function openShare(plan) {
    var box = el('div', 'pl-dbody'); box.appendChild(el('h2', '', t('pl.share')));
    box.appendChild(el('p', 'pl-dsub', t('pl.share.sub')));
    var full = false, ta = el('textarea', 'pl-ta'); ta.rows = 10; ta.readOnly = true; ta.style.fontFamily = 'var(--f-mono)'; ta.style.fontSize = '12px';
    var seg = el('div', 'pl-seg'); var b1 = el('button', '', t('pl.share.outline')), b2 = el('button', '', t('pl.share.full')); b1.type = b2.type = 'button'; seg.append(b1, b2);
    function fill() { ta.value = PD.exportPlan(plan, full); b1.setAttribute('aria-pressed', full ? 'false' : 'true'); b2.setAttribute('aria-pressed', full ? 'true' : 'false'); hint.textContent = t(full ? 'pl.share.fullHelp' : 'pl.share.outlineHelp'); }
    b1.addEventListener('click', function () { full = false; fill(); }); b2.addEventListener('click', function () { full = true; fill(); });
    var hint = el('p', 'pl-small'); box.appendChild(seg); box.appendChild(hint); ta.style.marginTop = '10px'; box.appendChild(ta);
    var foot = el('div', 'pl-dfoot');
    foot.appendChild(btn(t('pl.share.copy'), '', function () { try { navigator.clipboard.writeText(ta.value).then(function () { toast(t('pl.copied')); }, function () { ta.select(); }); } catch (e) { ta.select(); } }, 'copy'));
    foot.appendChild(btn(t('pl.share.save'), '', function () {
      var a = el('a'); a.href = URL.createObjectURL(new Blob([ta.value], { type: 'application/json' })); a.download = (plan.title || 'plan').replace(/[^\w一-鿿-]+/g, '-').slice(0, 40) + (full ? '-backup' : '-outline') + '.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }, 'down2'));
    foot.appendChild(btn(t('pl.close'), 'main', closeDialog)); box.appendChild(foot);
    fill(); openDialog(box);
  }

  global.PlanUI = { el: el, ic: ic, btn: btn, clamp: clamp, debounce: debounce, autosize: autosize, fmtD: fmtD, fmtRange: fmtRange, fmtDur: fmtDur, fmtMin: fmtMin, hue: hue, toast: toast, withUndo: withUndo, menu: menu, closeMenu: closeMenu,
    openDialog: openDialog, closeDialog: closeDialog, askText: askText, aiReady: aiReady, aiFail: aiFail, setCrumb: setCrumb, roadModel: roadModel, main: main, openEditPlan: openEditPlan, reduced: reduced, goTo: goTo, refresh: function () { if (currentRefresh) currentRefresh(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', route); else route();     // (plan-stage.js is loaded after this file, so wait for every script)
})(window);
