/* i18n.js — interface text lives in language packs (locales/*.js), never in the code.
 * Code asks for a key:            t('timer.start')            → "Start" / "开始"
 * with values filled in:          t('todo.count', {done: 2, all: 5})
 * Static HTML marks its text:     <span data-i18n="timer.sound"></span>
 *                                 data-i18n-placeholder / -aria-label / -title / -content work the same way.
 * Default language is English; the choice is remembered on this device. Switching reloads the page. */
(function (global) {
  'use strict';
  var packs = {}, order = [], KEY = 'tf-lang', DEFAULT = 'en', cur = null, missing = {};

  function add(lang, table) {
    if (!packs[lang]) { packs[lang] = {}; order.push(lang); }
    for (var k in table) packs[lang][k] = table[k];
  }
  function lang() {
    if (cur) return cur;
    var v = null;
    try { v = localStorage.getItem(KEY); } catch (e) {}
    cur = v && packs[v] ? v : DEFAULT;
    return cur;
  }
  function raw(key) {
    var l = lang();
    if (packs[l] && Object.prototype.hasOwnProperty.call(packs[l], key)) return packs[l][key];
    if (packs[DEFAULT] && Object.prototype.hasOwnProperty.call(packs[DEFAULT], key)) return packs[DEFAULT][key];
    if (!missing[key]) { missing[key] = 1; if (global.console) console.warn('[i18n] missing key: ' + key); }
    return undefined;
  }
  function fill(s, vars) {
    return !vars ? s : s.replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m; });
  }
  /* t(key, vars): a string (with {name} placeholders filled), or the array/number stored under the key */
  function t(key, vars) {
    var v = raw(key);
    if (v === undefined) return key;
    if (typeof v === 'string') return fill(v, vars);
    if (Array.isArray(v)) return v.map(function (x) { return typeof x === 'string' ? fill(x, vars) : x; });
    return v;
  }
  function has(key) { return raw(key) !== undefined; }

  var ATTRS = [['data-i18n-placeholder', 'placeholder'], ['data-i18n-aria-label', 'aria-label'], ['data-i18n-title', 'title'], ['data-i18n-content', 'content']];
  function apply(root) {
    root = root || document;
    Array.prototype.forEach.call(root.querySelectorAll('[data-i18n]'), function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    ATTRS.forEach(function (a) {
      Array.prototype.forEach.call(root.querySelectorAll('[' + a[0] + ']'), function (el) { el.setAttribute(a[1], t(el.getAttribute(a[0]))); });
    });
    document.documentElement.lang = t('lang.html');
  }
  function setLang(l) { if (packs[l]) try { localStorage.setItem(KEY, l); } catch (e) {} }
  /* every loaded language, named in its own language (from that pack's 'lang.name') */
  function langs() { return order.map(function (l) { return { id: l, name: packs[l]['lang.name'] || l }; }); }

  global.I18N = { add: add, t: t, has: has, apply: apply, lang: lang, setLang: setLang, langs: langs };
  global.t = t;
})(window);
