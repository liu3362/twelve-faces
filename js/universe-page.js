/* universe-page.js — the universe page: the ball, the time slider, the panel with the countdown cards, and the add / edit form. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  I18N.apply(document);

  var canvas = $('unCanvas'), panel = $('unPanel'), bodyEl = $('unBody'), tip = $('unTip');
  var uni = null, data = { cells: [], mode: 'mine', mineCount: 0 }, selId = null, focus = 0, Lp = 36, Lf = 60, editing = null, introWatch = 0, shown = '', backTo = null;
  var mobile = window.matchMedia('(max-width: 760px)');
  var today0 = GoalMath.startOfToday();

  /* ---------- dates ---------- */
  function fmtOff(off, noYear) {
    var d = GoalMath.addDays(today0, off);
    try { return d.toLocaleDateString(t('lang.html'), noYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return GoalMath.iso(d); }
  }
  function fmtIso(s) { var d = GoalMath.parse(s); if (!d) return s; try { return d.toLocaleDateString(t('lang.html'), { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return s; } }
  function yearsText(y) {                                // 1.5 -> "1.5" or "1,5" (and 2.0 -> "2"), whichever the language writes
    var v = Math.round(y * 10) / 10;
    try { return v.toLocaleString(t('lang.html'), { maximumFractionDigits: 1 }); } catch (e) { return String(v); }
  }
  function away(n) {                                     // "in 3 days", "12 days ago", "yesterday"
    var a = Math.abs(n), fut = n > 0;
    if (a === 1) return t(fut ? 'un.in1' : 'un.ago1');
    if (a >= 540) return t(fut ? 'un.inY' : 'un.agoY', { n: yearsText(a / 365) });
    return t(fut ? 'un.in' : 'un.ago', { n: a });
  }
  function kindName(c) { return t('un.kind.' + c.kind); }

  /* ---------- the slider: today sits near the left end and the future stretches away to the right.
   * Only a short stretch of past hangs off the left (a few weeks); it grows by itself as your history grows. Near today one step is about a day, further away it is many. ---------- */
  var inp = $('unFocus'), Pl = 70, Pf = 930, cvP = null, cvF = null;
  function extents() {
    var lp = 35, lf = 60;
    data.cells.forEach(function (c) { lp = Math.max(lp, -c.start); lf = Math.max(lf, c.end); });
    Lp = lp * 1.04; Lf = lf * 1.04;
  }
  function makeCurve(K, L) {                             // K steps of the slider cover L days; day(step) and step(day), both counted away from today
    if (L <= K) return { day: function (p) { return Math.round(p * L / K); }, step: function (d) { return Math.round(d * K / L); } };
    var lo = 1e-7, hi = 1, b = 0, i;                      // day = (e^(b·step) − 1) / b has a slope of 1 day per step at today; find the b that reaches L at step K
    for (i = 0; i < 60; i++) { b = (lo + hi) / 2; if ((Math.exp(b * K) - 1) / b > L) hi = b; else lo = b; }
    b = (lo + hi) / 2;
    return { day: function (p) { return Math.round((Math.exp(b * p) - 1) / b); }, step: function (d) { return Math.round(Math.log(1 + d * b) / b); } };
  }
  function smooth01(k) { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); }
  function setupSlider() {
    var w = Math.max(120, (inp.clientWidth || 400) - 30);   // the thumb is 30px wide, so it only travels the width minus that
    var frac = 0.07 + 0.30 * smooth01(Math.log(1 + Lp / 365) / Math.log(31));   // a little for the past now; more and more as you have more past
    frac = Math.min(0.4, Math.max(frac, 44 / w));          // never so short that the thumb cannot be moved into it
    Pl = Math.round(frac * 1000); Pf = 1000 - Pl;
    cvP = makeCurve(Pl, Lp); cvF = makeCurve(Pf, Lf);
    inp.min = String(-Pl); inp.max = String(Pf);
    inp.style.setProperty('--p0', frac.toFixed(4));
  }
  function posToDays(p) { return p < 0 ? -cvP.day(-p) : cvF.day(p); }
  function daysToPos(d) { return Math.max(-Pl, Math.min(Pf, d < 0 ? -cvP.step(-d) : cvF.step(d))); }
  function readout() {
    var w = $('unWhen'); w.textContent = '';
    w.appendChild(document.createTextNode(focus === 0 ? t('un.today') : fmtOff(focus)));
    w.appendChild(el('small', '', focus === 0 ? fmtOff(0) : away(focus)));
  }
  function setFocus(d, fromSlider) {
    focus = d; uni.setFocus(d); readout(); markCurrent();
    if (!fromSlider) inp.value = String(daysToPos(d));
  }

  /* ---------- the panel ---------- */
  function iconOf(c) { return c.kind === 'goal' ? 'goal' : c.kind === 'study' ? 'study' : 'life'; }
  function pillOpts(c) {                                 // the one big card for a cell: what is the next thing about it, counted from today
    var what, days;
    if (c.start > 0) { what = 'starts'; days = c.start; }
    else if (c.open) { what = 'started'; days = c.start; }
    else if (c.end >= 0) { what = 'ends'; days = c.end; }
    else { what = 'ended'; days = c.end; }
    return { icon: iconOf(c), label: c.title, sub: kindName(c) + ' · ' + t('un.' + what), days: days, date: fmtOff(days), hue: c.hue, state: c.end < 0 ? 'past' : '',
      fill: c.lit != null ? c.lit : (c.end > c.start ? Math.max(0, Math.min(1, (0 - c.start) / (c.end - c.start))) : 1) };
  }
  function statusPill(c) { return Countdown.pill(pillOpts(c)); }
  function byId(id) { for (var i = 0; i < data.cells.length; i++) if (data.cells[i].id === id) return data.cells[i]; return null; }
  function cardOf(id) { var all = bodyEl.querySelectorAll('.cd-item'); for (var i = 0; i < all.length; i++) if (all[i].dataset.id === id) return all[i]; return null; }

  /* the list beside the ball: every cell has a card. Pointing at a card lights its cell in the ball and the other way round; the cards that cover the day on the slider get a ring. */
  function setCardHl(id) {
    Array.prototype.forEach.call(bodyEl.querySelectorAll('.cd-item.hl'), function (n) { if (n.dataset.id !== id) n.classList.remove('hl'); });
    var it = id ? cardOf(id) : null; if (it) it.classList.add('hl');
  }
  function markCurrent() {
    Array.prototype.forEach.call(bodyEl.querySelectorAll('.cd-item'), function (it) {
      var c = byId(it.dataset.id), on = focus !== 0 && !!c && c.start <= focus && (c.open || c.end >= focus);
      if (it.firstChild) it.firstChild.classList.toggle('cur', on);
    });
  }
  function reveal(id) {                                  // coming back from a cell: scroll its card to the middle and let it pulse once
    var it = cardOf(id); if (!it) return;
    var r = it.getBoundingClientRect(), b = bodyEl.getBoundingClientRect();
    bodyEl.scrollTop += (r.top - b.top) - (b.height - r.height) / 2;
    it.classList.remove('flash'); void it.offsetWidth; it.classList.add('flash');
    setTimeout(function () { it.classList.remove('flash'); }, 1600);
  }
  function section(f, key, list, none) {
    var h = el('h2', '', t(key)); h.appendChild(el('span', 'un-n', String(list.length))); f.appendChild(h);
    if (!list.length) { if (none) f.appendChild(el('p', 'un-empty', none)); return; }
    var lad = Countdown.ladder(list.map(pillOpts));
    Array.prototype.forEach.call(lad.querySelectorAll('.cd-item'), function (it, i) {
      var cell = list[i];
      it.dataset.id = cell.id; it.tabIndex = 0; it.setAttribute('role', 'button');
      it.addEventListener('click', function () { select(cell.id); });
      it.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(cell.id); } });
      function on() { setCardHl(cell.id); uni.highlight(cell.id); }
      function off() { setCardHl(null); uni.highlight(null); }
      it.addEventListener('pointerenter', on); it.addEventListener('pointerleave', off);
      it.addEventListener('focus', on); it.addEventListener('blur', off);
    });
    f.appendChild(lad);
  }
  function listPanel() {
    var f = document.createDocumentFragment(), now = [], soon = [], gone = [];
    data.cells.forEach(function (c) { if (c.start > 0) soon.push(c); else if (c.open || c.end >= 0) now.push(c); else gone.push(c); });
    now.sort(function (a, b) { return (a.open ? 1e9 : a.end) - (b.open ? 1e9 : b.end); });   // the one that ends first, first
    soon.sort(function (a, b) { return a.start - b.start; });
    gone.sort(function (a, b) { return b.end - a.end; });                                     // the most recent first
    if (now.length) section(f, 'un.now', now);
    section(f, 'un.coming', soon, t('un.comingNone'));
    if (gone.length) section(f, 'un.behind', gone);
    f.appendChild(el('p', 'un-hint', t('un.hint')));
    return f;
  }
  function cellPanel(c) {
    var f = document.createDocumentFragment();
    var back = el('button', 'un-btn un-back2', '← ' + t('un.all')); back.type = 'button'; back.addEventListener('click', function () { select(null); }); f.appendChild(back);
    f.appendChild(statusPill(c));
    var when = c.open ? fmtIso(c.from) + ' → ' + t('un.ongoing') : fmtIso(c.from) + ' → ' + fmtIso(c.to);
    var meta = el('p', 'un-meta'); meta.appendChild(el('b', '', kindName(c))); meta.appendChild(document.createTextNode(' · ' + when)); f.appendChild(meta);
    if (c.kind === 'goal') {
      var pr = el('div', 'un-prog'); var bar = el('i'); bar.style.width = Math.round((c.lit || 0) * 100) + '%'; pr.appendChild(bar); f.appendChild(pr);
      f.appendChild(el('p', 'un-meta', t('un.progress', { p: Math.round((c.lit || 0) * 100) })));
      if (c.stage) f.appendChild(el('p', 'un-meta', t('un.nowStage', { label: c.stage.label, date: fmtIso(c.stage.to) })));
      if (c.summary) f.appendChild(el('p', 'un-note', c.summary));
    }
    if (c.note) f.appendChild(el('p', 'un-note', c.note));
    var lk = Dodeca.styleOf(c.id), lkName = Dodeca.styles[lk][/^zh/i.test(t('lang.html')) ? 'zh' : 'en'];
    f.appendChild(el('p', 'un-meta un-look', t('un.dieLook', { s: lk + ' · ' + lkName })));   // (for choosing a look: says which of the six this die has)
    var acts = el('div', 'un-acts');
    if (c.kind === 'goal' && c.goalId) { var a = el('a', 'un-btn main', t('un.openRoad')); a.href = 'index.html#future/' + encodeURIComponent(c.goalId); acts.appendChild(a); }
    else if (!c.sample) {
      var ed = el('button', 'un-btn', t('un.edit')); ed.type = 'button'; ed.addEventListener('click', function () { openForm(UniData.getCustom(c.id)); }); acts.appendChild(ed);
      var del = el('button', 'un-btn danger', t('un.delete')); del.type = 'button';
      del.addEventListener('click', function () { if (!confirm(t('un.deleteConfirm', { title: c.title }))) return; UniData.removeCustom(c.id); selId = null; refresh(false); });
      acts.appendChild(del);
    } else acts.appendChild(el('p', 'un-hint', t('un.exampleCell')));
    f.appendChild(acts);
    return f;
  }
  function renderPanel() {
    var c = selId ? byId(selId) : null;
    if (selId && !c) selId = null;
    var mode = c ? 'cell' : 'list', keep = mode === 'list' && shown === 'list' ? bodyEl.scrollTop : 0;   // refreshing the list must not throw you back to the top
    bodyEl.textContent = '';
    var close = el('button', 'un-btn un-close', t('un.close')); close.type = 'button'; close.addEventListener('click', function () { panel.classList.remove('open'); $('unGrab').setAttribute('aria-expanded', 'false'); layout(); });
    bodyEl.appendChild(close);
    bodyEl.appendChild(c ? cellPanel(c) : listPanel());
    shown = mode; bodyEl.scrollTop = keep; markCurrent();
    if (mode === 'list' && backTo) { var id = backTo; backTo = null; reveal(id); }
  }
  function setSel(id) { if (!id && selId) backTo = selId; selId = id || null; }
  function select(id) {
    setSel(id); uni.select(selId); renderPanel();
    if (mobile.matches && selId) openSheet();
  }
  function openSheet() { panel.classList.add('open'); $('unGrab').setAttribute('aria-expanded', 'true'); layout(); }

  /* ---------- the add / edit form ---------- */
  var dlg = $('unForm'), swatchHue = UniData.HUES[0];
  function buildSwatches() {
    var box = $('unFHue'); box.textContent = '';
    UniData.HUES.forEach(function (h) {
      var b = el('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.style.setProperty('--sw', h); b.setAttribute('aria-checked', h === swatchHue ? 'true' : 'false'); b.setAttribute('aria-label', String(h));
      b.addEventListener('click', function () { swatchHue = h; buildSwatches(); }); box.appendChild(b);
    });
  }
  function kindValue() { var r = dlg.querySelector('input[name="unKind"]:checked'); return r ? r.value : 'study'; }
  function syncKind() { var g = kindValue() === 'goal'; $('unGoalHint').hidden = !g; $('unFields').hidden = g; $('unFSave').hidden = g; }
  function openForm(cell) {
    editing = cell ? cell.id : null;
    $('unFormTitle').textContent = t(cell ? 'un.f.editTitle' : 'un.f.newTitle');
    $('unFName').value = cell ? cell.title : ''; $('unFFrom').value = cell ? cell.from : GoalMath.iso(today0); $('unFTo').value = cell ? cell.to || '' : ''; $('unFNote').value = cell ? cell.note || '' : '';
    swatchHue = cell && cell.hue != null ? cell.hue : UniData.HUES[(data.cells.length + 1) % UniData.HUES.length]; buildSwatches();
    Array.prototype.forEach.call(dlg.querySelectorAll('input[name="unKind"]'), function (r) { r.checked = r.value === (cell ? cell.kind : 'study'); r.disabled = !!cell && r.value === 'goal'; });
    Array.prototype.forEach.call(dlg.querySelectorAll('.un-kinds label'), function (l) { l.hidden = !!cell && l.querySelector('input').value === 'goal'; });
    $('unFErr').textContent = ''; syncKind();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    setTimeout(function () { try { $((kindValue() === 'goal') ? 'unGoalHint' : 'unFName').focus(); } catch (e) {} }, 30);
  }
  dlg.addEventListener('change', function (e) { if (e.target.name === 'unKind') syncKind(); });
  $('unFCancel').addEventListener('click', function () { dlg.close ? dlg.close() : dlg.removeAttribute('open'); });
  $('unFormEl').addEventListener('submit', function (e) {
    e.preventDefault();
    var title = $('unFName').value.trim(), from = $('unFFrom').value, to = $('unFTo').value;
    if (!title || !GoalMath.parse(from)) { $('unFErr').textContent = t('un.f.need'); return; }
    if (to && (!GoalMath.parse(to) || to < from)) { $('unFErr').textContent = t('un.f.order'); return; }
    var rec = { id: editing || undefined, title: title.slice(0, 60), kind: kindValue() === 'life' ? 'life' : 'study', from: from, to: to || '', hue: swatchHue, note: $('unFNote').value.trim().slice(0, 200) };
    var id;
    if (editing) { UniData.updateCustom(rec); id = editing; } else id = UniData.addCustom(rec);
    dlg.close ? dlg.close() : dlg.removeAttribute('open');
    selId = id; refresh(false); uni.select(id); renderPanel();
    if (mobile.matches) openSheet();
  });

  /* ---------- data in, ball updated ---------- */
  function refresh(instant) {
    data = UniData.load(); extents(); setupSlider();
    focus = Math.max(-Math.round(Lp), Math.min(Math.round(Lf), focus)); uni.setFocus(focus);
    uni.setCells(data.cells, { instant: !!instant });
    var ex = $('unEx'); ex.hidden = data.mineCount === 0; ex.setAttribute('aria-pressed', data.wantsExample ? 'true' : 'false');
    var bn = $('unBanner'); bn.textContent = '';
    if (data.mode === 'example') { bn.appendChild(el('span', '', t(data.mineCount ? 'un.exampleOn' : 'un.exampleBanner'))); bn.hidden = false; } else bn.hidden = true;
    layout();
    var list = $('unList'); list.textContent = '';
    data.cells.forEach(function (c) {
      var li = el('li'), b = el('button', '', c.title + ', ' + kindName(c) + ', ' + fmtIso(c.from) + (c.to ? ' → ' + fmtIso(c.to) : '')); b.type = 'button';
      b.addEventListener('click', function () { select(c.id); uni.select(c.id); }); li.appendChild(b); list.appendChild(li);
    });
    inp.value = String(daysToPos(focus)); readout();
    renderPanel();
  }

  /* ---------- layout: the ball lives in whatever space the panel and the slider leave ---------- */
  function layout() {
    var top = mobile.matches ? 58 : 64, bot = mobile.matches ? 96 : 100, right = 0;
    if (!$('unBanner').hidden) top += mobile.matches ? 52 : 34;
    if (!mobile.matches) right = Math.max(0, window.innerWidth - panel.getBoundingClientRect().left + 8);
    else if (panel.classList.contains('open')) bot += Math.min(window.innerHeight * 0.5, panel.offsetHeight) + 6;
    uni.setPadding({ l: 0, t: top, r: right, b: bot });
  }

  /* ---------- the intro ---------- */
  function watchIntro() {
    if (introWatch) return;
    document.body.classList.add('un-intro'); $('unSkip').hidden = false;
    (function tick() {
      if (uni.introRunning()) { introWatch = requestAnimationFrame(tick); return; }
      introWatch = 0; document.body.classList.remove('un-intro'); $('unSkip').hidden = true;
    })();
  }
  function playIntro() { selId = null; backTo = null; uni.select(null); renderPanel(); uni.playIntro(); if (uni.introRunning()) watchIntro(); }
  function skip() { if (uni.introRunning()) uni.skipIntro(); }

  /* ---------- start ---------- */
  function hover(id, x, y) {
    setCardHl(id);                                       // the card of the cell under the pointer lights up in the list
    if (!id || mobile.matches || 'ontouchstart' in window && !window.matchMedia('(hover: hover)').matches) { tip.hidden = true; return; }
    var c = byId(id); if (!c) { tip.hidden = true; return; }
    tip.textContent = ''; tip.appendChild(el('b', '', c.title)); tip.appendChild(el('span', '', kindName(c) + ' · ' + fmtIso(c.from) + (c.open ? ' → ' + t('un.ongoing') : ' → ' + fmtIso(c.to))));
    tip.hidden = false; var w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 8, x + 16) + 'px'; tip.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, y + 18)) + 'px';
  }
  uni = Universe.create(canvas, { onSelect: function (id) { setSel(id); renderPanel(); if (mobile.matches && selId) openSheet(); }, onHover: hover });
  canvas.addEventListener('pointerdown', skip);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { skip(); if (selId && !dlg.open) { select(null); uni.select(null); } } });
  inp.addEventListener('input', function (e) { setFocus(posToDays(parseInt(e.target.value, 10) || 0), true); });
  $('unNow').addEventListener('click', function () { setFocus(0); });
  $('unAdd').addEventListener('click', function () { openForm(null); });
  $('unEx').addEventListener('click', function () { UniData.setExample(data.mode !== 'example'); selId = null; uni.select(null); refresh(false); });
  $('unReplay').addEventListener('click', playIntro);
  $('unGrab').addEventListener('click', openSheet);
  $('unSave').addEventListener('click', function () {
    var a = el('a'); a.download = 'universe-' + GoalMath.iso(new Date()) + '.png'; a.href = uni.snapshot(); document.body.appendChild(a); a.click(); a.remove();
  });
  window.addEventListener('resize', function () { layout(); setupSlider(); inp.value = String(daysToPos(focus)); });
  if (mobile.addEventListener) mobile.addEventListener('change', layout);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(false); });
  window.addEventListener('storage', function (e) { if (/^tf-(goals|uni|hist)$/.test(e.key || '')) refresh(false); });

  layout();
  refresh(true);
  if (!UniData.seen()) { UniData.markSeen(); playIntro(); }
  window.TFUniverse = { ball: uni, select: select, setFocus: setFocus };      // handy for tests and for the corner orb
})();
