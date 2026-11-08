/* universe-page.js — the universe page: the ball, the time slider, the panel with the countdown cards, and the add / edit form. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  I18N.apply(document);

  var canvas = $('unCanvas'), panel = $('unPanel'), bodyEl = $('unBody'), tip = $('unTip');
  var uni = null, data = { cells: [], mode: 'mine', mineCount: 0 }, selId = null, focus = 0, Lp = 60, Lf = 60, editing = null, introWatch = 0;
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

  /* ---------- the slider: the middle is today, the left is the past, the right the future; near today it is finer ---------- */
  function extents() {
    var lp = 60, lf = 60;
    data.cells.forEach(function (c) { lp = Math.max(lp, -c.start); lf = Math.max(lf, c.end); });
    Lp = lp * 1.04; Lf = lf * 1.04;
  }
  function posToDays(p) { var a = Math.abs(p) / 1000, L = p < 0 ? Lp : Lf; return Math.round((p < 0 ? -1 : 1) * (Math.exp(a * Math.log(1 + L)) - 1)); }
  function daysToPos(d) { var L = d < 0 ? Lp : Lf; return Math.round((d < 0 ? -1 : 1) * Math.log(1 + Math.abs(d)) / Math.log(1 + L) * 1000); }
  function readout() {
    var w = $('unWhen'); w.textContent = '';
    w.appendChild(document.createTextNode(focus === 0 ? t('un.today') : fmtOff(focus)));
    w.appendChild(el('small', '', focus === 0 ? fmtOff(0) : away(focus)));
  }
  function setFocus(d, fromSlider) {
    focus = d; uni.setFocus(d); readout();
    if (!fromSlider) $('unFocus').value = String(daysToPos(d));
  }

  /* ---------- the panel ---------- */
  function iconOf(c) { return c.kind === 'goal' ? 'goal' : c.kind === 'study' ? 'study' : 'life'; }
  function pillFor(c, days, what, date) {
    return Countdown.pill({ icon: iconOf(c), label: c.title, sub: kindName(c) + (what ? ' · ' + t('un.' + what) : ''), days: days, date: date, hue: c.hue,
      state: c.end < 0 ? 'past' : '', fill: c.lit != null ? c.lit : (c.end > c.start ? Math.max(0, Math.min(1, (0 - c.start) / (c.end - c.start))) : 1) });
  }
  function statusPill(c) {                               // the one big card for a cell: what is the next thing about it, counted from today
    if (c.start > 0) return pillFor(c, c.start, 'starts', fmtOff(c.start));
    if (c.open) return pillFor(c, c.start, 'started', fmtOff(c.start));
    if (c.end >= 0) return pillFor(c, c.end, 'ends', fmtOff(c.end));
    return pillFor(c, c.end, 'ended', fmtOff(c.end));
  }
  function byId(id) { for (var i = 0; i < data.cells.length; i++) if (data.cells[i].id === id) return data.cells[i]; return null; }

  function comingPanel() {
    var f = document.createDocumentFragment();
    f.appendChild(el('h2', '', t('un.coming')));
    var evs = [];
    data.cells.forEach(function (c) {                    // one card per cell: the next thing about it
      if (c.start > 0) evs.push({ days: c.start, c: c, what: 'starts' });
      else if (!c.open && c.end >= 0 && c.end > c.start) evs.push({ days: c.end, c: c, what: 'ends' });
    });
    evs.sort(function (a, b) { return a.days - b.days; });
    evs = evs.slice(0, 5);
    if (!evs.length) f.appendChild(el('p', 'un-empty', t('un.comingNone')));
    else {
      var lad = Countdown.ladder(evs.map(function (e) { return { icon: iconOf(e.c), label: e.c.title, sub: kindName(e.c) + ' · ' + t('un.' + e.what), days: e.days, date: fmtOff(e.days), hue: e.c.hue, fill: e.c.lit != null ? e.c.lit : null }; }));
      Array.prototype.forEach.call(lad.querySelectorAll('.cd-item'), function (it, i) {
        var cell = evs[i].c; it.addEventListener('click', function () { select(cell.id); });
      });
      f.appendChild(lad);
    }
    f.appendChild(el('p', 'un-count', t('un.count', { n: data.cells.length })));
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
    bodyEl.textContent = '';
    var c = selId ? byId(selId) : null;
    if (selId && !c) selId = null;
    var close = el('button', 'un-btn un-close', t('un.close')); close.type = 'button'; close.addEventListener('click', function () { panel.classList.remove('open'); $('unGrab').setAttribute('aria-expanded', 'false'); layout(); });
    bodyEl.appendChild(close);
    bodyEl.appendChild(c ? cellPanel(c) : comingPanel());
    bodyEl.scrollTop = 0;
  }
  function select(id) {
    selId = id || null; uni.select(selId); renderPanel();
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
    data = UniData.load(); extents();
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
    $('unFocus').value = String(daysToPos(focus)); readout();
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
  function playIntro() { selId = null; uni.select(null); renderPanel(); uni.playIntro(); if (uni.introRunning()) watchIntro(); }
  function skip() { if (uni.introRunning()) uni.skipIntro(); }

  /* ---------- start ---------- */
  function hover(id, x, y) {
    if (!id || mobile.matches || 'ontouchstart' in window && !window.matchMedia('(hover: hover)').matches) { tip.hidden = true; return; }
    var c = byId(id); if (!c) { tip.hidden = true; return; }
    tip.textContent = ''; tip.appendChild(el('b', '', c.title)); tip.appendChild(el('span', '', kindName(c) + ' · ' + fmtIso(c.from) + (c.open ? ' → ' + t('un.ongoing') : ' → ' + fmtIso(c.to))));
    tip.hidden = false; var w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 8, x + 16) + 'px'; tip.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, y + 18)) + 'px';
  }
  uni = Universe.create(canvas, { onSelect: function (id) { selId = id || null; renderPanel(); if (mobile.matches && selId) openSheet(); }, onHover: hover });
  canvas.addEventListener('pointerdown', skip);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { skip(); if (selId && !dlg.open) { select(null); uni.select(null); } } });
  $('unFocus').addEventListener('input', function (e) { setFocus(posToDays(parseInt(e.target.value, 10) || 0), true); });
  $('unNow').addEventListener('click', function () { setFocus(0); });
  $('unAdd').addEventListener('click', function () { openForm(null); });
  $('unEx').addEventListener('click', function () { UniData.setExample(data.mode !== 'example'); selId = null; uni.select(null); refresh(false); });
  $('unReplay').addEventListener('click', playIntro);
  $('unGrab').addEventListener('click', openSheet);
  $('unSave').addEventListener('click', function () {
    var a = el('a'); a.download = 'universe-' + GoalMath.iso(new Date()) + '.png'; a.href = uni.snapshot(); document.body.appendChild(a); a.click(); a.remove();
  });
  window.addEventListener('resize', layout);
  if (mobile.addEventListener) mobile.addEventListener('change', layout);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(false); });
  window.addEventListener('storage', function (e) { if (/^tf-(goals|uni|hist)$/.test(e.key || '')) refresh(false); });

  layout();
  refresh(true);
  if (!UniData.seen()) { UniData.markSeen(); playIntro(); }
  window.TFUniverse = { ball: uni, select: select, setFocus: setFocus };      // handy for tests and for the corner orb
})();
