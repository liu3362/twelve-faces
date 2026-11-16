/* ai-setup.js — the list of AI platforms (switch on, order, key, model, test), drawn into any element.
 * The study room's Settings uses it, and so do the plan pages: where an AI button is pressed with no AI set up, the same list opens right there,
 * so nobody has to go back to the study room to find it.
 *   AISetup.render(listElement, { ns: 'prov', btn: 'mini', fold: false })   one card per platform. `ns` is the class prefix, `btn` the class of the small buttons;
 *                                                                           with `fold`, a card shows only its name until you open it (the ones already in use start open)
 *   AISetup.changed()                                                        tells every page that the keys changed (the event "ai-config")
 * Needs ai.js and the language packs. */
(function (global) {
  'use strict';
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function changed() { document.dispatchEvent(new CustomEvent('ai-config')); }

  function render(list, o) {
    o = o || {};
    var ns = o.ns || 'prov', bcls = o.btn || 'mini', cfg = AI.config(), opened = o.opened || (o.opened = {});
    function again() { render(list, o); }
    list.textContent = '';
    cfg.order.forEach(function (id, idx) {
      var p = AI.byId[id], c = cfg.p[id];
      var inUse = !!(c.on && c.key), open = !o.fold || opened[id] === true || (opened[id] === undefined && inUse);
      var card = el('div', ns + (inUse ? ' on' : '') + (o.fold && !open ? ' closed' : ''));
      card.dataset.id = id;

      var head = el('div', ns + '-head');
      var lab = el('label', ns + '-name');
      var cb = el('input'); cb.type = 'checkbox'; cb.checked = c.on; cb.setAttribute('aria-label', p.name);
      cb.addEventListener('change', function () { AI.set(id, { on: cb.checked }); again(); changed(); });
      lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + (idx + 1) + '. ' + p.name));
      head.appendChild(lab);
      var mv = el('span', ns + '-move');
      var up = el('button', bcls, '↑'); up.type = 'button'; up.disabled = idx === 0; up.setAttribute('aria-label', t('prov.up'));
      var dn = el('button', bcls, '↓'); dn.type = 'button'; dn.disabled = idx === cfg.order.length - 1; dn.setAttribute('aria-label', t('prov.down'));
      up.addEventListener('click', function () { AI.move(id, -1); again(); changed(); });
      dn.addEventListener('click', function () { AI.move(id, 1); again(); changed(); });
      mv.appendChild(up); mv.appendChild(dn);
      if (o.fold) {                                      // a folded card: the name stays, the key, model and test open on a click
        var tg = el('button', bcls + ' ' + ns + '-open', t(open ? 'pl.ai.fold' : 'pl.ai.unfold')); tg.type = 'button'; tg.setAttribute('aria-expanded', open ? 'true' : 'false');
        tg.addEventListener('click', function () { opened[id] = !open; again(); setTimeout(function () { var k = list.querySelector('[data-id="' + id + '"] input[type=password], [data-id="' + id + '"] input[type=text]'); if (!open && k) k.focus(); }, 0); });
        head.appendChild(tg);
      }
      head.appendChild(mv);
      card.appendChild(head);
      if (o.fold && !open) { list.appendChild(card); return; }

      var info = el('p', ns + '-info', p.free + t('prov.official'));
      if (p.keyUrl) { info.appendChild(document.createTextNode(' · ')); var a = el('a', '', t('prov.getKey')); a.href = p.keyUrl; a.target = '_blank'; a.rel = 'noopener'; info.appendChild(a); }
      card.appendChild(info);

      function field(label, value, type, onSet, listId) {
        var row = el('label', ns + '-row');
        row.appendChild(el('span', '', label));
        var inp = el('input'); inp.type = type; inp.value = value; inp.autocomplete = 'off'; inp.spellcheck = false;
        if (listId) inp.setAttribute('list', listId);
        inp.addEventListener('change', function () { onSet(inp.value); changed(); card.classList.toggle('on', AI.config().p[id].on && !!AI.config().p[id].key); cb.checked = AI.config().p[id].on; });
        row.appendChild(inp);
        card.appendChild(row);
        return inp;
      }
      if (p.custom) field(t('prov.base'), c.base, 'url', function (v) { AI.set(id, { base: v }); }).placeholder = t('prov.basePh');
      var key = field(t('prov.key'), c.key, 'password', function (v) { AI.set(id, { key: v }); });
      key.placeholder = t('prov.keyPh');
      var dl = el('datalist'); dl.id = ns + '-models-' + id;
      p.models.forEach(function (m) { var op = el('option'); op.value = m; dl.appendChild(op); });
      card.appendChild(dl);
      var model = field(t('prov.model'), c.model, 'text', function (v) { AI.set(id, { model: v }); }, dl.id);
      model.placeholder = t(p.id === 'openrouter' ? 'prov.modelPhFree' : 'prov.modelPh');

      var foot = el('div', ns + '-foot');
      var show = el('button', bcls, t('prov.show')); show.type = 'button';
      show.addEventListener('click', function () { key.type = key.type === 'password' ? 'text' : 'password'; show.textContent = t(key.type === 'password' ? 'prov.show' : 'prov.hide'); });
      var tb = el('button', bcls, t('prov.test')); tb.type = 'button';
      var res = el('span', ns + '-res');
      tb.addEventListener('click', function () {
        AI.set(id, { key: key.value, model: model.value });
        cb.checked = AI.config().p[id].on;                                                                      // (a key that is filled in switches its platform on)
        tb.disabled = true; res.className = ns + '-res'; res.textContent = t('prov.testing');
        AI.test(id).then(function (r) {
          tb.disabled = false;
          res.className = ns + '-res ' + (r.ok ? 'ok' : 'bad');
          res.textContent = r.ok ? t('prov.ok', { s: (r.ms / 1000).toFixed(1) }) : r.msg;
          card.classList.toggle('on', AI.config().p[id].on && !!AI.config().p[id].key);
          changed();
        });
      });
      foot.appendChild(show); foot.appendChild(tb); foot.appendChild(res);
      card.appendChild(foot);
      list.appendChild(card);
    });
  }

  global.AISetup = { render: render, changed: changed };
})(window);
