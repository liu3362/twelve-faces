/* maker.js — 新建十二面体：AI 按“专业 + 学年”或“工作类型”现场生成十二个面，先预览、可改名，再放上书架。
 * 一个学年一个十二面体。生成结果存在本机，以后打开不再花 token。 */
(function () {
  'use strict';
  var dlg = document.getElementById('maker');
  var YEARS = t('mk.years');
  var ctl = null, results = [];
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function kind() { var r = dlg.querySelector('input[name="mkKind"]:checked'); return r ? r.value : 'major'; }

  YEARS.forEach(function (y, i) {
    var l = el('label'); var c = el('input'); c.type = 'checkbox'; c.value = y; c.checked = i === 0;
    l.appendChild(c); l.appendChild(document.createTextNode(' ' + y)); $('mkYears').appendChild(l);
  });
  function years() { return Array.prototype.map.call($('mkYears').querySelectorAll('input:checked'), function (c) { return c.value; }); }

  function note() {
    var n = kind() === 'major' ? years().length : 1;
    $('mkNote').textContent = kind() === 'major'
      ? t('mk.noteMajor', { n: n })
      : t('mk.noteJob');
  }
  dlg.addEventListener('change', function (e) {
    if (e.target.name === 'mkKind') { $('mkMajor').hidden = kind() !== 'major'; $('mkJob').hidden = kind() !== 'job'; }
    note();
  });

  /* ---------- 给 AI 的要求 ---------- */
  function majorPrompt(m, year) {
    var p = t('mk.pHead', { major: m.major, school: m.school || t('mk.schoolNone'), dept: m.dept || t('mk.deptNone'), year: year,
      who: t(m.self ? 'mk.whoSelf' : 'mk.whoStudent'), req: m.req || t('none') });
    p += m.plan ? t('mk.pPlan', { plan: m.plan.slice(0, 8000), year: year })
                : t('mk.pNoPlan', { year: year, selfExtra: m.self ? t('mk.pSelfExtra') : '' });
    return p + t('mk.format');
  }
  function jobPrompt(j) { return t('mk.pJob', { job: j.job, req: j.req || t('none') }) + t('mk.format'); }

  /* ---------- 生成 ---------- */
  function msg(t, bad) { var m = $('mkMsg'); m.textContent = t || ''; m.className = 'mk-msg' + (bad ? ' bad' : ''); }
  function busy(b) { $('mkGo').disabled = b; $('mkStop').hidden = !b; }
  function go() {
    var jobs = [];
    if (kind() === 'major') {
      var m = { school: $('mkSchool').value.trim(), dept: $('mkDept').value.trim(), major: $('mkMajorIn').value.trim(),
        self: (dlg.querySelector('input[name="mkSelf"]:checked') || {}).value === '1', plan: $('mkPlan').value.trim(), req: $('mkReq').value.trim() };
      if (!m.major) { msg(t('mk.needMajor'), true); $('mkMajorIn').focus(); return; }
      var ys = years();
      if (!ys.length) { msg(t('mk.needYear'), true); return; }
      ys.forEach(function (y) {
        jobs.push({
          title: y, prompt: majorPrompt(m, y),
          info: { base: 'college', label: t('mk.label', { major: m.major, year: y }),
            meta: { kind: 'major', school: m.school, dept: m.dept, major: m.major, year: y, self: m.self, source: m.plan ? 'plan' : 'ai' } }
        });
      });
    } else {
      var j = { job: $('mkJobIn').value.trim(), req: $('mkReq').value.trim() };
      if (!j.job) { msg(t('mk.needJob'), true); $('mkJobIn').focus(); return; }
      jobs.push({ title: j.job, prompt: jobPrompt(j), info: { base: 'work', label: j.job, meta: { kind: 'job', job: j.job, source: 'ai' } } });
    }
    results = []; renderOut();
    ctl = new AbortController(); busy(true);
    var i = 0;
    (function next() {
      if (i >= jobs.length || ctl.signal.aborted) { done(); return; }
      var job = jobs[i++];
      msg(t('mk.progress', { label: job.info.label, i: i, n: jobs.length }));
      run(job).then(function (r) { if (r) results.push(r); renderOut(); next(); });
    })();
  }
  /* 生成一个；格式不对或没写完，自动再试一次 */
  function run(job, again) {
    return AI.json({ system: SYS, messages: [{ role: 'user', content: job.prompt }], maxTokens: 6000, signal: ctl.signal, idleMs: 60000 })
      .then(function (raw) {
        var real = (raw && Array.isArray(raw.faces) ? raw.faces : []).length;
        if (real < 6 && !again) return run(job, true);
        if (!real) throw { code: 'bad_json' };
        return { set: PROFILES.build(job.info, raw), short: real < 12, job: job };
      }, function (e) {
        if (e && e.code === 'cancelled') return null;
        if (e && /^(bad_json|cut|empty)$/.test(e.code) && !again) return run(job, true);
        throw e;
      })
      .catch(function (e) {
        if (!e) return null;
        return { error: AI.explain(e), title: job.info.label, job: job, setup: e.code === 'no_key' || e.code === 'all_failed' };
      });
  }
  function retry(r) {
    if (ctl) return;
    ctl = new AbortController(); busy(true);
    msg(t('mk.redo', { label: r.job.info.label }));
    r.pending = true; renderOut();
    run(r.job).then(function (n) {
      var i = results.indexOf(r);
      if (i >= 0) { if (n) results[i] = n; else delete r.pending; }
      renderOut(); done();
    });
  }
  var SYS = t('mk.sys');
  function done() {
    busy(false); ctl = null;
    var ok = results.filter(function (r) { return r.set; }).length;
    msg(ok ? t('mk.done') : '');
  }

  /* ---------- 预览：每个十二面体一张卡片，名字可改 ---------- */
  function renderOut() {
    var out = $('mkOut'); out.textContent = '';
    results.forEach(function (r) {
      var card = el('div', 'mk-card');
      if (r.error) {
        card.classList.add('err');
        card.appendChild(el('b', '', r.title));
        card.appendChild(el('p', 'mk-err', r.pending ? t('mk.redoing') : r.error));
        if (!r.pending) {
          var again = el('button', 'btn sm', t('mk.retry')); again.type = 'button';
          again.addEventListener('click', function () { retry(r); });
          card.appendChild(again);
        }
        if (r.setup && !r.pending) {
          var s = el('button', 'btn alt sm', t('mk.setupAI')); s.type = 'button';
          s.addEventListener('click', function () { dlg.close(); window.openSettings(); });
          card.appendChild(s);
        }
        out.appendChild(card); return;
      }
      var set = r.set;
      var ttl = el('input', 'mk-title'); ttl.value = set.label; ttl.maxLength = 40; ttl.setAttribute('aria-label', t('mk.titleAria'));
      ttl.addEventListener('input', function () { set.label = ttl.value.trim() || set.label; });
      card.appendChild(ttl);
      var m = set.meta || {};
      card.appendChild(el('p', 'mk-src', t(m.source === 'plan' ? 'mk.srcPlan' : m.kind === 'job' ? 'mk.srcJob' : 'mk.srcAI')
        + (r.short ? t('mk.srcShort') : '')));
      var grid = el('div', 'mk-faces');
      set.faces.forEach(function (f) {
        var cell = el('label', 'mk-face');
        var inp = el('input'); inp.value = f.name; inp.maxLength = PROFILES.nameMax(); inp.setAttribute('aria-label', t('mk.faceAria', { n: set.faces.indexOf(f) + 1 }));
        inp.addEventListener('change', function () { rename(f, inp.value); inp.value = f.name; });
        cell.appendChild(inp);
        cell.appendChild(el('small', '', f.tag));
        cell.title = f.focus || '';
        grid.appendChild(cell);
      });
      card.appendChild(grid);
      var row = el('div', 'set-btns');
      if (r.saved) {
        var use = el('button', 'btn sm', t('mk.use')); use.type = 'button';
        use.addEventListener('click', function () { dlg.close(); window.switchDie(set.id); });
        row.appendChild(use);
        row.appendChild(el('span', 'mk-ok', t('mk.saved')));
      } else {
        var save = el('button', 'btn sm', t('mk.save')); save.type = 'button';
        save.addEventListener('click', function () { PROFILES.addSet(set); r.saved = true; renderOut(); if (window.refreshShelf) window.refreshShelf(); });
        var drop = el('button', 'btn alt sm', t('mk.drop')); drop.type = 'button';
        drop.addEventListener('click', function () { results.splice(results.indexOf(r), 1); renderOut(); });
        row.appendChild(save); row.appendChild(drop);
      }
      card.appendChild(row);
      out.appendChild(card);
    });
  }
  function rename(f, v) {
    v = String(v || '').replace(/\s+/g, ' ').trim().slice(0, PROFILES.nameMax());
    if (!v || v === f.name) return;
    var old = t('q', { n: f.name }), now = t('q', { n: v });
    f.persona = f.persona.split(old).join(now);
    f.ask = f.ask.split(old).join(now);
    f.quick = f.quick.map(function (q) { return q.split(old).join(now).split(f.name).join(v); });
    f.name = v;
  }


  $('mkGo').addEventListener('click', go);
  $('mkStop').addEventListener('click', function () { if (ctl) ctl.abort(); msg(t('mk.stopped')); });
  dlg.addEventListener('close', function () { if (ctl) ctl.abort(); });
  window.openMaker = function () { note(); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); };
})();
