/* plan-models-ui.js — methods on the plan pages: one card for a method, and the window where methods are chosen, written, or pasted in from the web.
 *   PlanModelsUI.card(m, { actions: [node], open: false })      -> the element for one method (name, subjects, one line, its steps folded away)
 *   PlanModelsUI.openLibrary({ scope: 'stage'|'plan', name, context, have: function () -> [method], onAdd: function (m), onRemove: function (id) }[, state])
 * The window has four parts: the library (for you first: matched to what the plan is about, or by subject), what is already added, my own methods, and a new one.
 * A new one can be written, or pasted from a web page: "Tidy up" turns the text into a name, a line and steps without any AI, and the AI can do the same
 * (or write the method from just its name). Needs plan.js (PlanUI), plan-models.js and plan-ai.js. */
(function (global) {
  'use strict';
  var U = global.PlanUI, PM = global.PlanModels, PD = global.PlanData, el = U.el, btn = U.btn, ic = U.ic;
  function zh() { return /^zh/i.test(t('lang.html')); }

  /* ---------- one method ---------- */
  function card(m, o) {
    o = o || {};
    var c = el('div', 'pl-mc'), head = el('div', 'pl-mc-head'), tags = el('span', 'pl-mc-tags');
    m.d.slice(0, 3).forEach(function (id) { tags.appendChild(el('i', '', PM.domainName(id))); });
    head.append(el('b', 'pl-mc-name', m.name), tags);
    var acts = el('span', 'pl-mc-act'); (o.actions || []).forEach(function (a) { acts.appendChild(a); }); head.appendChild(acts);
    c.appendChild(head);
    if (m.sum) c.appendChild(el('p', 'pl-mc-sum', m.sum));
    var d = el('details', 'pl-mc-more'); if (o.open) d.open = true;
    d.appendChild(el('summary', '', m.steps.length ? t('pl.me.steps', { n: m.steps.length }) : t('pl.me.details')));
    if (m.steps.length) { var ol = el('ol', 'pl-mc-steps'); m.steps.forEach(function (x) { ol.appendChild(el('li', '', x)); }); d.appendChild(ol); }
    if (m.more) { var mo = el('details', 'pl-mc-orig'); mo.appendChild(el('summary', '', t('pl.me.more'))); mo.appendChild(el('p', '', m.more)); d.appendChild(mo); }
    var links = el('p', 'pl-mc-links');
    if (m.src) { var a = el('a', '', t('pl.me.source')); a.href = m.src; a.target = '_blank'; a.rel = 'noopener noreferrer'; links.appendChild(a); }
    else if (m.by === 'lib' && global.PlanStage && global.PlanStage.searchLinks) {                                  // a built-in one: where to read more, as search links the page builds itself
      global.PlanStage.searchLinks({ kind: 'web', title: m.name, q: m.name + (zh() ? ' 方法' : ' method') }).slice(0, 2).forEach(function (l) {
        var a2 = el('a', '', t('pl.me.readMore', { site: l.label })); a2.href = l.href; a2.target = '_blank'; a2.rel = 'noopener noreferrer'; links.appendChild(a2);
      });
    }
    if (links.firstChild) d.appendChild(links);
    c.appendChild(d);
    return c;
  }

  /* ---------- the window ---------- */
  function blank() { return { name: '', sum: '', steps: '', d: [], more: '', src: '', by: 'own' }; }
  function openLibrary(o, st) {
    st = st || { tab: 'lib', dom: 'rec', sub: '', q: '', paste: '', src: '', f: null, ed: null, msg: '', bad: false, auto: '' };
    var guessed = PM.guess(o.context || ''), ctl = null, lastTab = null, dead = false;
    var box = el('div', 'pl-dbody pl-mlib');
    box.appendChild(el('h2', '', t('pl.me.title')));
    box.appendChild(el('p', 'pl-dsub', t(o.scope === 'plan' ? 'pl.me.sub.plan' : 'pl.me.sub.stage', { name: o.name })));
    var tabs = el('div', 'pl-seg pl-mtabs'), view = el('div', 'pl-mview');
    function haveIds() { return o.have().map(function (m) { return m.id; }); }
    function numbered(k, n) { return n ? t('pl.me.tab.' + k + 'N', { n: n }) : t('pl.me.tab.' + k); }           // "Added" / "Added · 2" (the number only when there is one, so the four tabs fit on a phone)
    function drawTabs() {
      tabs.textContent = '';
      [['lib', t('pl.me.tab.lib')], ['have', numbered('have', o.have().length)], ['mine', numbered('mine', PM.mine().length)], ['new', t(st.ed ? 'pl.me.tab.edit' : 'pl.me.tab.new')]].forEach(function (x) {
        var b = el('button', '', x[1]); b.type = 'button'; b.setAttribute('aria-pressed', st.tab === x[0] ? 'true' : 'false'); b.dataset.tab = x[0];
        b.addEventListener('click', function () { st.tab = x[0]; draw(); }); tabs.appendChild(b);
      });
    }
    function draw() {
      var list = view.querySelector('.pl-mlist'), keep = list && lastTab === st.tab ? list.scrollTop : 0;
      lastTab = st.tab; drawTabs(); view.textContent = '';
      if (st.tab === 'lib') libView(); else if (st.tab === 'have') haveView(); else if (st.tab === 'mine') mineView(); else newView();
      list = view.querySelector('.pl-mlist'); if (list) list.scrollTop = keep;
    }
    /* add / added: pressing again takes it away */
    function toggle(m) {
      var on = haveIds().indexOf(m.id) >= 0;
      var b = btn(t(on ? 'pl.me.added' : 'pl.me.add'), 'sm' + (on ? '' : ' main'), function () {
        if (on) o.onRemove(m.id); else o.onAdd(PD.cleanModel(m));                        // (no toast: the button turning to "Added" is the answer, and a toast would sit behind the window)
        draw();
      }, on ? 'check' : 'plus');
      b.setAttribute('aria-pressed', on ? 'true' : 'false'); if (on) b.title = t('pl.me.remove');
      return b;
    }
    function cards(list, host, extra) {
      host.textContent = '';
      if (!list.length) { host.appendChild(el('p', 'pl-mempty', t('pl.me.empty'))); return; }
      list.forEach(function (m) { host.appendChild(card(m, { actions: (extra ? extra(m) : []).concat([toggle(m)]) })); });
    }

    /* the library */
    function libView() {
      var q = el('input', 'pl-in'); q.type = 'search'; q.placeholder = t('pl.me.search'); q.value = st.q; q.setAttribute('aria-label', t('pl.me.search')); q.autocomplete = 'off';
      view.appendChild(q);
      var chips = el('div', 'pl-chips pl-mchips'); chips.setAttribute('role', 'group');
      var top = [['rec', t('pl.me.f.rec')], ['all', t('pl.me.f.all')]];
      PM.domains().forEach(function (d) { top.push([d.id, d.name]); });
      top.forEach(function (x) {
        var b = el('button', 'pl-chip', x[1]); b.type = 'button'; b.dataset.dom = x[0]; b.setAttribute('aria-pressed', st.dom === x[0] ? 'true' : 'false');
        b.addEventListener('click', function () { st.dom = x[0]; st.sub = ''; st.q = ''; draw(); }); chips.appendChild(b);
      });
      view.appendChild(chips);
      var cur = PM.domains().filter(function (d) { return d.id === st.dom; })[0];
      if (cur && cur.sub.length) {
        var subs = el('div', 'pl-chips pl-msub'); subs.setAttribute('role', 'group');
        [{ id: '', name: t('pl.me.f.every', { name: cur.name }) }].concat(cur.sub).forEach(function (s) {
          var b = el('button', 'pl-chip', s.name); b.type = 'button'; b.dataset.sub = s.id; b.setAttribute('aria-pressed', st.sub === s.id ? 'true' : 'false');
          b.addEventListener('click', function () { st.sub = s.id; draw(); }); subs.appendChild(b);
        });
        view.appendChild(subs);
      }
      var note = el('p', 'pl-small pl-mnote'), list = el('div', 'pl-mlist');
      view.append(note, list);
      function fill() {
        var all = PM.lib().concat(PM.mine()), qq = st.q.trim(), sel = st.sub || st.dom, items, gen = [];
        if (qq) { items = PM.search(all, qq); note.textContent = ''; }
        else if (st.dom === 'rec') {
          items = PM.recommend(guessed, 14);
          note.textContent = guessed.length ? t('pl.me.recNote', { what: guessed.slice(0, 2).map(PM.domainName).join(' · ') }) : t('pl.me.recNone');
        } else if (st.dom === 'all') { items = all; note.textContent = ''; }
        else {
          items = PM.ordered(all.filter(function (m) { return PM.matches(m, sel); }), sel); note.textContent = '';
          if (st.dom !== 'gen') { var seen = {}; items.forEach(function (m) { seen[m.id] = 1; }); gen = all.filter(function (m) { return !seen[m.id] && m.d.indexOf('gen') >= 0; }); }
        }
        cards(items, list);
        if (gen.length) {
          list.appendChild(el('h3', 'pl-mh', t('pl.me.general')));
          gen.forEach(function (m) { list.appendChild(card(m, { actions: [toggle(m)] })); });
        }
      }
      q.addEventListener('input', function () { st.q = q.value; fill(); });
      fill();
    }

    /* what is already added here */
    function haveView() {
      var list = el('div', 'pl-mlist'); view.appendChild(list);
      var cur = o.have();
      if (!cur.length) { list.appendChild(el('p', 'pl-mempty', t('pl.me.haveNone'))); return; }
      cur.forEach(function (m) { list.appendChild(card(m, { actions: [toggle(m)] })); });
    }

    /* my own */
    function mineView() {
      var list = el('div', 'pl-mlist'); view.appendChild(list);
      var mine = PM.mine();
      if (!mine.length) { list.appendChild(el('p', 'pl-mempty', t('pl.me.mineNone'))); }
      mine.forEach(function (m) {
        var ed = btn('', 'ghost sm icon', function () { st.f = { name: m.name, sum: m.sum, steps: m.steps.join('\n'), d: m.d.slice(), more: m.more, src: m.src, by: m.by }; st.ed = m.id; st.paste = ''; st.msg = ''; st.tab = 'new'; draw(); }, 'edit', t('pl.me.edit'));
        var del = btn('', 'ghost sm icon', function () {
          if (!confirm(t('pl.me.delConfirm', { name: m.name }))) return; PM.remove(m.id); draw();
        }, 'trash', t('pl.me.delete'));
        list.appendChild(card(m, { actions: [ed, del, toggle(m)] }));
      });
      var go = btn(t('pl.me.write'), 'sm', function () { st.f = blank(); st.ed = null; st.tab = 'new'; draw(); }, 'plus'); go.style.marginTop = '10px'; view.appendChild(go);
    }

    /* a new one: paste from the web, or write it */
    function newView() {
      var f = st.f || (st.f = blank());
      var msg = el('p', 'pl-small pl-mmsg' + (st.bad ? ' bad' : '')); msg.setAttribute('role', 'status'); msg.textContent = st.msg || '';
      function say(text, bad) { st.msg = text || ''; st.bad = !!bad; msg.textContent = st.msg; msg.classList.toggle('bad', !!bad); }
      var pasteBox = el('div', 'pl-mpaste');
      if (!st.ed) {
        pasteBox.appendChild(el('p', 'pl-dsub', t('pl.me.pasteHelp')));
        var ta = el('textarea', 'pl-ta'); ta.rows = 4; ta.maxLength = 12000; ta.placeholder = t('pl.me.pastePh'); ta.value = st.paste; ta.setAttribute('aria-label', t('pl.me.paste')); ta.id = 'plmPaste';
        ta.addEventListener('input', function () { st.paste = ta.value; });
        var srcRow = el('div', 'pl-f'), srcI = el('input', 'pl-in'); srcI.type = 'url'; srcI.placeholder = t('pl.me.srcPh'); srcI.value = st.src || ''; srcI.setAttribute('aria-label', t('pl.me.src')); srcI.id = 'plmSrc';
        srcI.addEventListener('input', function () { st.src = srcI.value; }); srcRow.appendChild(srcI); srcRow.style.margin = '8px 0 0';
        var row = el('div', 'pl-mtidy');
        var tb = btn(t('pl.me.tidy'), 'sm', tidy, 'steps'), ab = btn(t('pl.me.tidyAi'), 'sm', function () { tidyAi(); }, 'ai'); if (!U.aiReady()) ab.title = t('pl.s.noAiTip');
        row.append(tb, ab);
        pasteBox.append(ta, srcRow, row);
      } else pasteBox.appendChild(el('p', 'pl-dsub', t('pl.me.editing', { name: f.name })));
      view.appendChild(pasteBox); view.appendChild(msg);

      var form = el('form', 'pl-mform'); form.noValidate = true;
      function field(label, node, id) { var d = el('div', 'pl-f'), l = el('label', 'pl-lbl', label); node.id = id; l.htmlFor = id; d.append(l, node); return d; }
      var nm = el('input', 'pl-in'); nm.type = 'text'; nm.maxLength = 80; nm.value = f.name; nm.addEventListener('input', function () { f.name = nm.value; });
      var sm = el('textarea', 'pl-ta'); sm.rows = 2; sm.maxLength = 400; sm.value = f.sum; sm.addEventListener('input', function () { f.sum = sm.value; });
      var sp = el('textarea', 'pl-ta'); sp.rows = 6; sp.maxLength = 3600; sp.value = f.steps; sp.addEventListener('input', function () { f.steps = sp.value; }); sp.placeholder = t('pl.me.stepsPh');
      form.append(field(t('pl.me.f.name'), nm, 'plmName'), field(t('pl.me.f.sum'), sm, 'plmSum'), field(t('pl.me.f.steps'), sp, 'plmSteps'));
      /* which subjects it fits: the main ones, and under a main one with parts, its parts */
      var kind = el('div', 'pl-f'); kind.appendChild(el('span', 'pl-lbl', t('pl.me.f.kind')));
      var kc = el('div', 'pl-chips'); kc.setAttribute('role', 'group'); kc.style.marginTop = '0';
      function has(id) { return f.d.indexOf(id) >= 0; }
      function kids(d) { return f.d.filter(function (x) { return x.indexOf(d.id + '.') === 0; }); }
      function lit(d) { return has(d.id) || kids(d).length > 0; }                       // a main subject is lit when it, or one of its parts, is chosen
      PM.domains().forEach(function (d) {
        var b = el('button', 'pl-chip', d.name); b.type = 'button'; b.setAttribute('aria-pressed', lit(d) ? 'true' : 'false');
        b.addEventListener('click', function () { if (lit(d)) f.d = f.d.filter(function (x) { return x !== d.id && x.indexOf(d.id + '.') !== 0; }); else f.d.push(d.id); draw(); });
        kc.appendChild(b);
      });
      kind.appendChild(kc);
      PM.domains().forEach(function (d) {
        if (!d.sub.length || !lit(d)) return;
        var sc = el('div', 'pl-chips pl-msub');
        d.sub.forEach(function (x) {
          var b = el('button', 'pl-chip', x.name); b.type = 'button'; b.setAttribute('aria-pressed', has(x.id) ? 'true' : 'false');
          b.addEventListener('click', function () {
            if (has(x.id)) { f.d.splice(f.d.indexOf(x.id), 1); if (!kids(d).length) f.d.push(d.id); }           // the last part taken away: the whole subject stays
            else { f.d = f.d.filter(function (y) { return y !== d.id; }); f.d.push(x.id); }
            draw();
          });
          sc.appendChild(b);
        });
        kind.appendChild(sc);
      });
      form.appendChild(kind);
      var err = el('p', 'pl-err'); err.setAttribute('role', 'alert'); form.appendChild(err);
      var foot = el('div', 'pl-dfoot');
      if (st.ed) foot.appendChild(btn(t('pl.cancel'), 'ghost', function () { st.f = null; st.ed = null; st.msg = ''; st.tab = 'mine'; draw(); }));
      var ok = el('button', 'pl-btn main', t(st.ed ? 'pl.save' : 'pl.me.saveAdd')); ok.type = 'submit'; foot.appendChild(ok); form.appendChild(foot);
      form.addEventListener('submit', function (e) {
        e.preventDefault(); err.textContent = '';
        var steps = f.steps.split(/\r?\n/).map(function (x) { return x.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, '').trim(); }).filter(Boolean);
        if (!f.name.trim()) { err.textContent = t('pl.me.err.name'); nm.focus(); return; }
        if (!steps.length) { err.textContent = t('pl.me.err.steps'); sp.focus(); return; }
        var d = f.d.filter(function (x) { return x.indexOf('.') > 0 || !f.d.some(function (y) { return y.indexOf(x + '.') === 0; }); });
        var saved = PM.save({ id: st.ed || '', name: f.name, sum: f.sum, steps: steps, d: d.length ? d : ['gen'], src: f.src, more: f.more, by: st.ed ? f.by : (f.by === 'ai' || f.by === 'web' ? f.by : 'own') });
        if (!saved) { err.textContent = t('pl.me.err.name'); return; }
        if (st.ed) { st.f = null; st.ed = null; st.msg = t('pl.me.saved', { name: saved.name }); st.bad = false; st.tab = 'mine'; draw(); return; }
        o.onAdd(PD.cleanModel(saved)); U.toast(t('pl.me.addedTo', { name: saved.name })); U.closeDialog();
      });
      view.appendChild(form);

      function tidy() {
        var txt = st.paste.trim(); if (!txt) { say(t('pl.me.err.empty'), true); return; }
        var r = PM.parse(txt);
        st.f = { name: r.name, sum: r.sum, steps: r.steps.join('\n'), d: r.d.slice(), more: r.more, src: r.src || (/^https?:\/\//i.test(st.src.trim()) ? st.src.trim() : ''), by: 'web' };
        st.msg = r.steps.length ? t('pl.me.tidied') : t('pl.me.tidiedLess'); st.bad = false; draw();
      }
      function tidyAi() {
        if (!st.paste.trim()) { say(t('pl.me.err.empty'), true); return; }
        if (!U.aiReady()) { U.openAiSetup(function (ok) { st.auto = ok ? 'ai' : ''; openLibrary(o, st); }); return; }
        if (ctl) return;
        ctl = new AbortController(); msg.textContent = ''; msg.classList.remove('bad');
        msg.append(el('span', 'pl-spin'), document.createTextNode(' ' + t('pl.me.tidying') + ' '));
        msg.appendChild(btn(t('pl.cancel'), 'sm ghost', function () { if (ctl) ctl.abort(); }));
        var text = st.paste.trim(), oneLine = text.length <= 60 && text.indexOf('\n') < 0;
        global.PlanAI.method({ text: oneLine ? '' : text, name: oneLine ? text : '' }, ctl.signal).then(function (r) {
          ctl = null; if (dead) return;
          if (!r.ok) { st.msg = t('pl.me.err.notMethod', { reason: r.reason || '' }); st.bad = true; draw(); return; }
          var local = PM.parse(text);
          st.f = { name: r.name, sum: r.sum, steps: r.steps.join('\n'), d: r.d, more: oneLine ? '' : local.more, src: local.src || (/^https?:\/\//i.test(st.src.trim()) ? st.src.trim() : ''), by: 'ai' };
          st.msg = t('pl.me.tidiedAi'); st.bad = false; draw();
        }, function (e) {
          ctl = null; if (dead || (e && e.code === 'cancelled')) { if (!dead) { st.msg = ''; draw(); } return; }
          st.msg = U.aiFail(e); st.bad = true; draw();
        });
      }
      if (st.auto === 'ai') { st.auto = ''; setTimeout(tidyAi, 30); }
    }

    var foot = el('div', 'pl-dfoot'); foot.appendChild(btn(t('pl.me.done'), 'main', U.closeDialog));
    box.append(tabs, view, foot);
    draw();
    U.openDialog(box, { wide: true, onClose: function () { dead = true; if (ctl) ctl.abort(); if (o.onClose) o.onClose(); } });
  }

  global.PlanModelsUI = { card: card, openLibrary: openLibrary };
})(window);
