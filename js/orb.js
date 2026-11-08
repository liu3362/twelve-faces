/* orb.js — the little universe in the corner of the study room: the same ball as on the universe page, only small.
 * It starts after the page has finished loading, so it never slows the first paint. Tap it to open the whole universe.
 * It follows your goals and your study time: when either changes, the ball ripples and the dice inside update. */
(function () {
  'use strict';
  var link = document.getElementById('orb'), cv = document.getElementById('orbCv');
  if (!link || !cv || !cv.getContext) return;
  var ball = null, SRC = ['js/dodeca.js', 'js/universe.js', 'js/universe-data.js'], timer = 0;

  function add(i, done) {
    if (i >= SRC.length) return done();
    var s = document.createElement('script');
    s.src = SRC[i]; s.onload = function () { add(i + 1, done); };
    s.onerror = function () { /* the link still works without the little picture */ };
    document.body.appendChild(s);
  }
  function feed(instant) {
    if (!ball) return;
    try { ball.setCells(UniData.load().cells, { instant: !!instant }); } catch (e) {}
  }
  function soon() { clearTimeout(timer); timer = setTimeout(function () { feed(false); }, 250); }   // several saves in a row become one update

  function start() {
    if (!window.Universe || !window.UniData || !window.Dodeca) return;
    try { ball = Universe.create(cv, { mini: true }); } catch (e) { return; }
    feed(true);
    link.classList.add('on');
    document.addEventListener('tf-goals', soon);                                   // future.js and app.js say so when goals or study time change
    window.addEventListener('storage', function (e) { if (!e.key || /^tf-(goals|hist|uni)$/.test(e.key)) soon(); });
    window.addEventListener('pageshow', function (e) { if (e.persisted) feed(true); });    // back from the universe page
    link.addEventListener('pointerenter', function () { ball.ripple(-2.2, 24); });
    window.TFOrb = { ball: ball, refresh: soon };                                   // handy for tests
  }
  function go() { add(0, start); }
  function idle() { (window.requestIdleCallback ? window.requestIdleCallback(go, { timeout: 1200 }) : setTimeout(go, 400)); }
  if (document.readyState === 'complete') idle(); else window.addEventListener('load', idle);
})();
