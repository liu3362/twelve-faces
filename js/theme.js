/* Theme: the three-way background setting. Follow the system, always light, or always dark.
 *
 *   Theme.get()         'system' | 'light' | 'dark'   what the person chose
 *   Theme.set(v)        choose and remember it (localStorage 'tf-theme')
 *   Theme.scheme()      'light' | 'dark'              what is showing right now
 *   Theme.isDark()      scheme() === 'dark'
 *   Theme.onChange(fn)  fn(scheme) whenever the scheme that is showing changes: a new choice, or the system
 *                       switching while the choice is 'system'. Canvases (the dice) repaint from this.
 *                       Returns a function that stops listening.
 *
 * What it writes on <html>:
 *   data-theme    "light" | "dark", only for an explicit choice. css/app.css keys its palettes off this,
 *                 and off prefers-color-scheme while the attribute is absent.
 *   data-scheme   always the scheme in effect. css/plan.css keys off this.
 * and it keeps <meta name="color-scheme"> and <meta name="theme-color"> in step, so form controls, scrollbars and the
 * browser's own bars match too.
 *
 * Load it from <head>, before the stylesheets paint, so the first frame is already in the right colours. */
(function (global) {
  'use strict';
  var KEY = 'tf-theme', root = document.documentElement;
  var mq = null;
  try { mq = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null; } catch (e) { mq = null; }
  var BAR = { light: '#eef2f6', dark: '#12161c' };         // the page colour, close enough for the browser's bar
  var listeners = [], choice = 'system', shown = '';

  function read() {
    try { var v = global.localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch (e) { return 'system'; }
  }
  function scheme() { return choice === 'system' ? (mq && mq.matches ? 'dark' : 'light') : choice; }
  function meta(name) {
    var m = document.head && document.head.querySelector('meta[name="' + name + '"]');
    if (!m && document.head) { m = document.createElement('meta'); m.setAttribute('name', name); document.head.appendChild(m); }
    return m;
  }
  function apply() {
    var s = scheme();
    if (choice === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', choice);
    root.setAttribute('data-scheme', s);
    var cs = meta('color-scheme'); if (cs) cs.setAttribute('content', choice === 'system' ? 'light dark' : choice);
    var tc = meta('theme-color'); if (tc) tc.setAttribute('content', BAR[s]);
    if (s !== shown) {
      shown = s;
      listeners.slice().forEach(function (f) { try { f(s); } catch (e) { /* a listener must not stop the others */ } });
    }
  }

  choice = read();
  apply();

  // "system" follows the device while the page is open; another tab changing the choice reaches this one too
  if (mq) {
    var onMq = function () { if (choice === 'system') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  }
  global.addEventListener('storage', function (e) { if (e.key === KEY) { choice = read(); apply(); } });

  global.Theme = {
    get: function () { return choice; },
    set: function (v) {
      v = v === 'light' || v === 'dark' ? v : 'system';
      choice = v;
      try { if (v === 'system') global.localStorage.removeItem(KEY); else global.localStorage.setItem(KEY, v); } catch (e) { /* private mode: it still applies for this visit */ }
      apply();
    },
    scheme: function () { return scheme(); },
    isDark: function () { return scheme() === 'dark'; },
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };      // call it to stop listening
    }
  };
})(window);
