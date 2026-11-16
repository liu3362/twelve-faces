/* settings.js — Settings: language, the shelf of dice, feedback, AI keys (order, model, test) and backups. */
(function () {
  'use strict';
  var dlg = document.getElementById('settings');
  var list = document.getElementById('provList');
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function render() { AISetup.render(list); }                       // the list of platforms is shared with the plan pages (js/ai-setup.js)
  function changed() { AISetup.changed(); }

  /* ---------- 备份：只备份学习数据，不含密钥 ---------- */
  function backup() {
    var data = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (/^(ds[:-]|tf-(sets|names-|profile|goals|hist|uni))/.test(k)) data[k] = localStorage.getItem(k);
    }
    var blob = new Blob([JSON.stringify({ app: 'twelve-faces', v: 1, at: new Date().toISOString(), data: data }, null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = t('bk.file', { date: new Date().toLocaleDateString('sv') });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function restore(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var j = JSON.parse(r.result);
        if (!j || j.app !== 'twelve-faces' || !j.data) throw 0;
        if (!confirm(t('bk.confirm'))) return;
        Object.keys(j.data).forEach(function (k) { if (/^(ds[:-]|tf-(sets|names-|profile|goals|hist|uni))/.test(k)) localStorage.setItem(k, j.data[k]); });
        location.reload();
      } catch (e) { alert(t('bk.bad')); }
    };
    r.readAsText(file);
  }

  document.getElementById('setBtn').addEventListener('click', open);
  document.getElementById('bkOut').addEventListener('click', backup);
  document.getElementById('bkIn').addEventListener('change', function (e) { if (e.target.files[0]) restore(e.target.files[0]); e.target.value = ''; });
  document.getElementById('clrKeys').addEventListener('click', function () {
    if (!confirm(t('bk.clearConfirm'))) return;
    AI.clearKeys(); render(); changed();
  });
  /* ---------- 使用身份与面的名字：改完保存并刷新 ---------- */
  var pick = PROFILES.currentId(), draft = null;
  function renderWho() {
    var box = document.getElementById('whoPick'); box.textContent = '';
    PROFILES.all().forEach(function (p) {
      var lab = el('label', 'who-opt' + (p.id === pick ? ' on' : '') + (PROFILES.list.indexOf(p) < 0 ? ' mine' : ''));
      var r = el('input'); r.type = 'radio'; r.name = 'who'; r.value = p.id; r.checked = p.id === pick;
      r.addEventListener('change', function () { pick = p.id; draft = PROFILES.names(pick); renderWho(); dirty(); });
      lab.appendChild(r);
      lab.appendChild(el('b', '', p.label));
      lab.appendChild(el('small', '', p.faces.slice(0, 4).map(function (f) { return f.name; }).join(t('sep.list')) + t('more')));
      if (PROFILES.list.indexOf(p) < 0) {
        var del = el('button', 'mini who-del', t('who.del')); del.type = 'button';
        del.setAttribute('aria-label', t('who.delAria', { label: p.label }));
        del.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          if (!confirm(t('who.delConfirm', { label: p.label }))) return;
          var wasCur = p.id === PROFILES.currentId();
          PROFILES.removeSet(p.id);
          if (wasCur) { location.reload(); return; }
          if (pick === p.id) { pick = PROFILES.currentId(); draft = null; }
          renderWho(); dirty();
        });
        lab.appendChild(del);
      }
      box.appendChild(lab);
    });
    if (!draft) draft = PROFILES.names(pick);
    var list2 = document.getElementById('nameList'); list2.textContent = '';
    PROFILES.get(pick).faces.forEach(function (f) {
      var inp = el('input'); inp.type = 'text'; inp.maxLength = PROFILES.nameMax(); inp.placeholder = f.name;
      inp.value = draft[f.key] && draft[f.key] !== f.name ? draft[f.key] : '';
      inp.setAttribute('aria-label', t('names.aria', { name: f.name }));
      inp.addEventListener('input', function () { var v = inp.value.trim(); if (v) draft[f.key] = v; else delete draft[f.key]; dirty(); });
      list2.appendChild(inp);
    });
  }
  function dirty() {
    var same = pick === PROFILES.currentId() && JSON.stringify(draft || {}) === JSON.stringify(PROFILES.names(pick));
    document.getElementById('whoApply').hidden = same;
  }
  document.getElementById('nameReset').addEventListener('click', function () { draft = {}; renderWho(); dirty(); });
  document.getElementById('whoApply').addEventListener('click', function () {
    PROFILES.setNames(pick, draft || {});
    if (pick !== PROFILES.currentId() && window.switchDie) { window.switchDie(pick); return; }
    location.reload();
  });
  document.getElementById('mkOpen').addEventListener('click', function () { dlg.close(); window.openMaker(); });
  window.refreshShelf = function () { renderWho(); dirty(); };

  /* ---------- 意见反馈 ----------
   * 放到 GitHub Pages 上时，会自动指向这个仓库的 Issues 页面。
   * 想用别的地址（问卷、邮箱），把 FEEDBACK_URL 填上即可，例如 'https://wj.qq.com/s2/xxxx'。 */
  var FEEDBACK_URL = '';
  function feedbackUrl() {
    if (FEEDBACK_URL) return FEEDBACK_URL;
    var m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname);
    if (!m) return '';
    var seg = location.pathname.split('/').filter(Boolean)[0];
    var repo = seg && !/\.html?$/i.test(seg) ? seg : m[1] + '.github.io';
    var p = PROFILES.current(), renamed = p.faces.filter(function (f) { return f.defaultName; });
    var body = t('fb.body', { label: p.label,
      renamed: renamed.length ? t('fb.renamed', { list: renamed.map(function (f) { return f.defaultName + ' → ' + f.name; }).join(t('sep.list')) }) : '' });
    return 'https://github.com/' + m[1] + '/' + repo + '/issues/new?title=' + encodeURIComponent(t('fb.issueTitle')) + '&body=' + encodeURIComponent(body);
  }
  function renderFeedback() {
    var u = feedbackUrl(), a = document.getElementById('fbLink'), hint = document.getElementById('fbHint');
    if (u) { a.href = u; a.hidden = false; hint.hidden = true; }
    else { a.hidden = true; hint.hidden = false; }
  }

  /* ---------- language: every loaded language pack, each named in its own language ---------- */
  function renderLangs() {
    var box = document.getElementById('langPick'); box.textContent = '';
    I18N.langs().forEach(function (l) {
      var b = el('button', 'lang-opt', l.name); b.type = 'button';
      b.setAttribute('aria-pressed', l.id === I18N.lang() ? 'true' : 'false');
      b.addEventListener('click', function () { if (l.id !== I18N.lang()) window.switchLang(l.id); });
      box.appendChild(b);
    });
  }

  // the three-way background setting: follow the device, always light, always dark (js/theme.js does the work)
  function renderTheme() {
    var box = document.getElementById('themePick'); if (!box || !window.Theme) return; box.textContent = '';
    [['system', 'theme.system'], ['light', 'theme.light'], ['dark', 'theme.dark']].forEach(function (x) {
      var b = el('button', 'lang-opt', t(x[1])); b.type = 'button';
      b.setAttribute('aria-pressed', x[0] === Theme.get() ? 'true' : 'false');
      b.addEventListener('click', function () { Theme.set(x[0]); renderTheme(); });
      box.appendChild(b);
    });
  }

  function open() { renderLangs(); renderTheme(); renderFeedback(); pick = PROFILES.currentId(); draft = null; renderWho(); dirty(); render(); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
  window.openSettings = open;
})();
