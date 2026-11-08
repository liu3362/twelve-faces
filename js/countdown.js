/* countdown.js — the big colour-block "N days to go" cards used by the future road and the universe page.
 * Countdown.pill({icon, label, sub, days, date, hue, state, fill}) -> element
 * Countdown.ladder([pill options...]) -> a column of cards joined by a centre line (first = top)
 * Countdown.journeyHue(goalHue, k, count) -> the card colour k steps along a journey: it starts at the goal's own colour and warms toward a celebratory red-gold at the end */
(function (global) {
  'use strict';
  var ICON = {
    week: '<rect x="4" y="6" width="20" height="18" rx="3.5"/><path d="M4 12.5h20M10 3.5v5M18 3.5v5"/><circle cx="10" cy="18" r="1.3" fill="currentColor"/><circle cx="14" cy="18" r="1.3" fill="currentColor"/>',
    month: '<path d="M21 18.2A9.5 9.5 0 1 1 10.3 5.6a7.5 7.5 0 0 0 10.7 12.6z"/>',
    quarter: '<path d="M5 23C5 12 11 5 23 5c0 11-6 17-16 17"/><path d="M5 23c4-6 8-9.500 13-12"/>',
    half: '<circle cx="14" cy="14" r="5"/><path d="M14 3v3M14 22v3M3 14h3M22 14h3M6.200 6.200l2.100 2.100M19.700 19.700l2.100 2.100M6.200 21.800l2.100-2.100M19.700 8.300l2.100-2.100"/>',
    goal: '<path d="M6 25V4"/><path d="M6 5.500h15l-3.500 5 3.500 5H6"/>',
    die: '<path d="M14 3l10.500 7.500-4 12.500H7.500l-4-12.500z"/><path d="M14 9.500l5.500 4-2.100 6.500h-6.800L8.500 13.500z"/>',
    study: '<path d="M5 6.500c3-1.500 6-1.500 9 .8 3-2.300 6-2.300 9-.8V21c-3-1.300-6-1.300-9 .8-3-2.100-6-2.100-9-.8z"/><path d="M14 7.300v14.500"/>',
    life: '<path d="M14 24V13"/><path d="M14 14c0-4.500-3-7-8-7 0 4.500 2.500 7.500 8 7z"/><path d="M14 17.500c0-3.500 2.500-6 8-6 0 4-2.500 6.500-8 6z"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 28 28" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[name] || ICON.goal) + '</svg>';
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  /* days: whole days from today (negative = already past) */
  function words(days) {
    if (days === 0) return { today: t('cd.today') };
    var a = Math.abs(days), past = days < 0;
    return { pre: t(past ? 'cd.prePast' : 'cd.pre'), num: String(a), unit: t((past ? 'cd.unitPast' : 'cd.unit') + (a === 1 ? '1' : '')) };
  }
  function hueMix(a, b, k) { var d = ((b - a + 540) % 360) - 180; return Math.round((a + d * k + 360) % 360); }
  function journeyHue(goalHue, k, count) {
    var f = count > 1 ? Math.max(0, Math.min(1, k / (count - 1))) : 1;
    return hueMix(goalHue, 18, Math.pow(f, 1.3) * 0.88);
  }
  /* A card has two equal halves with the coin in the middle, so a long "N days ago" has to shrink rather than spill out.
   * Once a card is on screen we measure it: narrow cards drop the icon (more room for the title), and a number that is too wide is scaled down (--cs). */
  function fit(d) {
    var w = d.clientWidth; if (!w) return;
    d.classList.toggle('nar', w < 350);
    d.style.setProperty('--cs', '1');
    var r = d.querySelector('.cd-r'), row = d.querySelector('.cd-row, .cd-big'); if (!r || !row) return;
    var room = r.clientWidth - (parseFloat(getComputedStyle(r).paddingLeft) || 0) + 4;    // may borrow a little of the right padding
    var need = row.offsetWidth;
    if (need > room && room > 0) d.style.setProperty('--cs', Math.max(0.5, room / need).toFixed(3));
  }
  var RO = typeof ResizeObserver === 'function' ? new ResizeObserver(function (es) { es.forEach(function (e) { if (e.target.isConnected) fit(e.target); else RO.unobserve(e.target); }); }) : null;
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { [].forEach.call(document.querySelectorAll('.cd'), fit); });   // the web font changes the text widths
  function pill(o) {
    var d = el('div', 'cd' + (o.state ? ' ' + o.state : ''));
    if (RO) RO.observe(d);
    d.style.setProperty('--ch', o.hue == null ? 215 : o.hue);
    if (o.fill != null) d.style.setProperty('--cf', Math.round(Math.max(0, Math.min(1, o.fill)) * 100) + '%');
    var w = words(o.days);
    d.setAttribute('role', 'group');
    d.setAttribute('aria-label', o.label + ', ' + (w.today || (w.pre + ' ' + w.num + ' ' + w.unit)) + (o.date ? ', ' + o.date : ''));
    var l = el('div', 'cd-l');
    var ic = el('span', 'cd-ic'); ic.innerHTML = icon(o.icon); l.appendChild(ic);
    var tx = el('div', 'cd-t'); tx.appendChild(el('b', '', o.label)); if (o.sub) tx.appendChild(el('small', '', o.sub)); l.appendChild(tx);
    d.appendChild(l);
    var coin = el('i', 'cd-coin'); coin.setAttribute('aria-hidden', 'true'); d.appendChild(coin);
    var r = el('div', 'cd-r');
    if (w.today) { r.appendChild(el('span', 'cd-big', w.today)); }
    else {
      var row = el('span', 'cd-row');
      if (w.pre) row.appendChild(el('span', 'cd-pre', w.pre));
      row.appendChild(el('span', 'cd-num', w.num));
      row.appendChild(el('span', 'cd-unit', w.unit));
      r.appendChild(row);
    }
    if (o.date) r.appendChild(el('small', 'cd-date', o.date));
    d.appendChild(r);
    return d;
  }
  function ladder(list) {
    var box = el('div', 'cd-ladder');
    list.forEach(function (o) { var it = el('div', 'cd-item'); it.style.setProperty('--ch', o.hue == null ? 215 : o.hue); it.appendChild(pill(o)); box.appendChild(it); });
    return box;
  }
  global.Countdown = { pill: pill, ladder: ladder, journeyHue: journeyHue, hueMix: hueMix, icon: icon };
})(window);
