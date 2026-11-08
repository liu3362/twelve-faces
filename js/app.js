(function () {
  'use strict';

  I18N.apply(document);
  var PROF = PROFILES.current();
  var CAP_TXT = t('cap.hours', { n: PROF.dayCap / 60 });
  var SEP = t('sep.list'), SEP_ITEMS = t('sep.items');
  var COMMON = PROF.common;
  var SUBJECTS = PROF.faces;
  var byKey = {};
  SUBJECTS.forEach(function (s) { byKey[s.key] = s; });
  function faceIndex(key) { for (var i = 0; i < SUBJECTS.length; i++) if (SUBJECTS[i].key === key) return i; return 0; }
  var START = byKey.math ? 'math' : SUBJECTS[0].key;
  try { var last = localStorage.getItem('ds-last'); if (last && byKey[last]) START = last; } catch (e) {}

  var TDURS = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 90, 120]; // minutes, one per timer face
  var T_START = 4;                                              // 25 minutes

  // the die faces are drawn on a canvas, so they take the same language-specific CJK fonts as the page (css --f-cjk)
  var CJK = (getComputedStyle(document.documentElement).getPropertyValue('--f-cjk').trim() || '"PingFang SC","Microsoft YaHei","Noto Sans SC"') + ',sans-serif';
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(id) { return document.getElementById(id); }
  function isDark() {
    var th = document.documentElement.getAttribute('data-theme');
    if (th) return th === 'dark';
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmt(sec) {
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }
  function durLabel(m) { return m >= 60 && m % 60 === 0 ? { n: String(m / 60), u: t('unit.hour') } : { n: String(m), u: t('unit.min') }; }
  function durText(m) { var l = durLabel(m); return t('dur', { n: l.n, u: l.u }); }

  /* ================= reusable die engine ================= */
  // o: canvas, host, items(12), tex, draw(ctx,item,i,TS,dark), start, wob, onPreview(i), onSettle(i,changed), onTouch(), onTapFront()
  function createDie(o) {
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true, alpha: true }); } catch (e) { return null; }
    var TS = o.tex || 512;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 0.5));
    var dl = new THREE.DirectionalLight(0xffffff, 0.6);
    dl.position.set(2, 3, 4);
    scene.add(dl);
    var cube = new THREE.Group();
    scene.add(cube);

    var base = new THREE.DodecahedronGeometry(1, 0);
    var pos = base.attributes.position;
    var clusters = [];
    for (var i = 0; i < pos.count; i += 3) {
      var a = new THREE.Vector3().fromBufferAttribute(pos, i);
      var b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
      var c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
      var n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
      var cl = null;
      for (var k = 0; k < clusters.length; k++) { if (clusters[k].n.dot(n) > 0.999) { cl = clusters[k]; break; } }
      if (!cl) { cl = { n: n, pts: [] }; clusters.push(cl); }
      cl.pts.push(a, b, c);
    }
    var raw = clusters.map(function (cl) {
      var uniq = [], seen = {};
      cl.pts.forEach(function (p) {
        var key = p.x.toFixed(3) + ',' + p.y.toFixed(3) + ',' + p.z.toFixed(3);
        if (!seen[key]) { seen[key] = 1; uniq.push(p.clone()); }
      });
      var ctr = new THREE.Vector3();
      uniq.forEach(function (p) { ctr.add(p); });
      ctr.divideScalar(uniq.length);
      var nrm = ctr.clone().normalize();
      var up = uniq[0].clone().sub(ctr);
      var R = up.length();
      up.normalize();
      var right = new THREE.Vector3().crossVectors(up, nrm);
      uniq.sort(function (p, q) {
        var pa = Math.atan2(p.clone().sub(ctr).dot(up), p.clone().sub(ctr).dot(right));
        var qa = Math.atan2(q.clone().sub(ctr).dot(up), q.clone().sub(ctr).dot(right));
        return pa - qa;
      });
      return { c: ctr, n: nrm, u: up, r: right, R: R, v: uniq };
    });
    // neighbour walk: consecutive items land on adjacent faces
    var left = raw.slice(), path = [], curF = left.shift();
    path.push(curF);
    while (left.length) {
      var bi = 0, bd = -2;
      for (var j = 0; j < left.length; j++) { var d = left[j].n.dot(curF.n); if (d > bd) { bd = d; bi = j; } }
      curF = left.splice(bi, 1)[0];
      path.push(curF);
    }
    var faces = [], tiles = [];
    path.forEach(function (f, idx) {
      var cv = document.createElement('canvas');
      cv.width = cv.height = TS;
      var tex = new THREE.CanvasTexture(cv);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      var mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.6, metalness: 0 });
      var verts = [], uvs = [];
      f.v.forEach(function (p) {
        var dd = p.clone().sub(f.c);
        var q = f.c.clone().add(dd.clone().multiplyScalar(0.94));
        verts.push(q.x, q.y, q.z);
        uvs.push(0.5 + dd.dot(f.r) / (2 * f.R), 0.5 + dd.dot(f.u) / (2 * f.R));
      });
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4]);
      g.computeVertexNormals();
      var mesh = new THREE.Mesh(g, mat);
      mesh.userData.k = idx;
      cube.add(mesh);
      tiles.push(mesh);
      var m4 = new THREE.Matrix4().set(f.r.x, f.r.y, f.r.z, 0, f.u.x, f.u.y, f.u.z, 0, f.n.x, f.n.y, f.n.z, 0, 0, 0, 0, 1);
      faces.push({ k: idx, n: f.n, mat: mat, tex: tex, ctx: cv.getContext('2d'), target: new THREE.Quaternion().setFromRotationMatrix(m4) });
    });
    var core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.985, 0), new THREE.MeshStandardMaterial({ color: 0x2b303b, roughness: 0.8, metalness: 0 }));
    cube.add(core);

    function drawFace(f) {
      o.draw(f.ctx, o.items[f.k], f.k, TS, isDark());
      f.tex.needsUpdate = true;
    }
    function redraw(i) { if (i === undefined) faces.forEach(drawFace); else drawFace(faces[i]); }
    function refresh() { core.material.color.set(isDark() ? 0x0a0c10 : 0x2b303b); redraw(); }
    refresh();

    var mode = 'settled', baseQ = faces[o.start || 0].target.clone(), snapTarget = null, snapFace = o.start || 0;
    var moved = false, pending = false, vx = 0, vy = 0, cubePx = 120, prevK = -1;
    var down = false, lastX = 0, lastY = 0, lastT = 0, startT = 0, dist = 0;
    var wob = new THREE.Quaternion(), wobE = new THREE.Euler(), wa = 0, prev = 0, wobAmp = o.wob === undefined ? 1 : o.wob;
    var AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);
    var qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tv = new THREE.Vector3();

    function rotate(rx, ry) {
      qa.setFromAxisAngle(AY, ry); qb.setFromAxisAngle(AX, rx);
      baseQ.premultiply(qa).premultiply(qb);
    }
    function nearest() {
      var best = 0, bz = -2;
      faces.forEach(function (f, i) { tv.copy(f.n).applyQuaternion(baseQ); if (tv.z > bz) { bz = tv.z; best = i; } });
      return best;
    }
    function startSnap() { snapFace = nearest(); snapTarget = faces[snapFace].target; mode = 'snap'; }
    function pick(e) {
      var r = o.canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      var hits = ray.intersectObjects(tiles, false);
      return hits.length ? hits[0].object.userData.k : -1;
    }
    function resize() {
      var w = o.host.clientWidth, h = o.host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      var fh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.position.set(0, 0, 2.75 / (fh * Math.min(1, camera.aspect)));
      camera.updateProjectionMatrix();
      cubePx = Math.min(w, h) * 0.42;
    }
    new ResizeObserver(resize).observe(o.host);
    resize();

    o.canvas.addEventListener('pointerdown', function (e) {
      if (o.onTouch) o.onTouch();
      down = true; mode = 'drag'; pending = false; vx = vy = 0; dist = 0;
      lastX = e.clientX; lastY = e.clientY; lastT = startT = performance.now();
      try { o.canvas.setPointerCapture(e.pointerId); } catch (err) {}
      o.canvas.classList.add('grabbing');
    });
    o.canvas.addEventListener('pointermove', function (e) {
      if (!down) return;
      var now = performance.now(), dt = Math.max(0.001, (now - lastT) / 1000);
      var dx = e.clientX - lastX, dy = e.clientY - lastY, k = 1 / cubePx;
      rotate(dy * k, dx * k);
      vy += (dx * k / dt - vy) * 0.5; vx += (dy * k / dt - vx) * 0.5;
      dist += Math.hypot(dx, dy);
      lastX = e.clientX; lastY = e.clientY; lastT = now;
    });
    function release(e) {
      if (!down) return;
      down = false; o.canvas.classList.remove('grabbing');
      var now = performance.now();
      if (dist < 6 && now - startT < 350) {
        vx = vy = 0;
        var front = nearest();
        var k = e.type === 'pointerup' ? pick(e) : -1;
        if (k >= 0 && k !== front) { snapFace = k; snapTarget = faces[k].target; mode = 'snap'; moved = true; }
        else { startSnap(); if (k === front && o.onTapFront) o.onTapFront(); }
      } else {
        if (now - lastT > 90) { vx = vy = 0; }
        moved = true; mode = 'coast';
      }
    }
    o.canvas.addEventListener('pointerup', release);
    o.canvas.addEventListener('pointercancel', release);

    function frame(t) {
      var dt = Math.min(0.05, (t - (prev || t)) / 1000); prev = t;
      if (mode === 'coast') {
        rotate(vx * dt, vy * dt);
        var decay = Math.exp(-dt * 3);
        vx *= decay; vy *= decay;
        if (Math.hypot(vx, vy) < 0.7) startSnap();
      }
      if (mode === 'snap') {
        baseQ.slerp(snapTarget, 1 - Math.exp(-dt * (reduced ? 30 : 11)));
        if (baseQ.angleTo(snapTarget) < 0.002) {
          baseQ.copy(snapTarget); mode = 'settled';
          var changed = moved || pending; moved = false; pending = false; prevK = -1;
          if (o.onSettle) o.onSettle(snapFace, changed);
        }
      }
      if (mode !== 'settled') {
        var nk = nearest();
        if (nk !== prevK) { prevK = nk; if (o.onPreview) o.onPreview(nk); }
      }
      var wTarget = (mode === 'settled' && !reduced) ? wobAmp : 0;
      wa += (wTarget - wa) * (1 - Math.exp(-dt * 3));
      wobE.set(Math.sin(t * 0.0009) * 0.045 * wa, Math.cos(t * 0.0007) * 0.06 * wa, 0);
      wob.setFromEuler(wobE);
      cube.quaternion.copy(wob).multiply(baseQ);
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      goTo: function (i) { vx = vy = 0; pending = true; snapFace = i; snapTarget = faces[i].target; mode = 'snap'; },
      redraw: redraw, refresh: refresh, nearest: nearest
    };
  }

  /* ================= state ================= */
  var cur = null;
  var elWork = $('work'), elAtmos = $('atmos');
  var chats = {};  SUBJECTS.forEach(function (s) { chats[s.key] = []; });
  var mem = {}, noteTimer = null;
  var ctl = null, busy = false, botEl = null;
  var sdie = null, tdie = null;
  var dirty = {}, busyPlan = false;

  function setHue(h) { document.documentElement.style.setProperty('--h', h); }
  function curHue() { return cur ? byKey[cur].hue : byKey[START].hue; }
  function today() { try { return new Date().toLocaleDateString('sv'); } catch (e) { return ''; } }
  function planMin(key) { var d = mem[key]; return d && d.plan && d.plan.d === today() ? d.plan.m : 0; }
  function focusMin(key) { var d = mem[key]; return d && d.focus && d.focus.d === today() ? d.focus.m : 0; }
  /* today's timeline: completed study and rest segments, in order */
  var dayLog = { d: '', items: [] };
  try { var dl0 = JSON.parse(localStorage.getItem('ds-log') || 'null'); if (dl0 && dl0.d && Array.isArray(dl0.items)) dayLog = dl0; } catch (e) {}
  function logItems() { return dayLog.d === today() ? dayLog.items : []; }
  function logAdd(kind, key, mins) {
    if (!mins || mins < 1) return;
    if (dayLog.d !== today()) dayLog = { d: today(), items: [] };
    dayLog.items.push({ k: kind, s: key || '', m: mins });
    if (dayLog.items.length > 200) dayLog.items.shift();
    try { localStorage.setItem('ds-log', JSON.stringify(dayLog)); } catch (e) {}
    if (kind !== 'rest' && key) histAdd(key, mins);
    renderTimeline();
  }
  /* every day's focus minutes per face, kept for about three years: the goals and the universe read it to see how far you have walked */
  function histAdd(key, mins) {
    try {
      var h = JSON.parse(localStorage.getItem('tf-hist') || '{}') || {}, d = today();
      h[d] = h[d] || {}; h[d][key] = Math.round(((h[d][key] || 0) + mins) * 10) / 10;
      var ks = Object.keys(h).sort(); while (ks.length > 1100) delete h[ks.shift()];
      localStorage.setItem('tf-hist', JSON.stringify(h));
      document.dispatchEvent(new Event('tf-goals'));     // the little universe in the corner follows your study time
    } catch (e) {}
  }
  /* a face may belong to another die on the shelf: look it up there so its colour and name still show */
  var faceMemo = {};
  function faceInfo(key) {
    if (byKey[key]) return { name: byKey[key].name, hue: byKey[key].hue, die: '' };
    if (!(key in faceMemo)) { var f = PROFILES.findFace(key); faceMemo[key] = f && f.dieId !== PROF.id ? f : null; }
    return faceMemo[key];
  }
  function renderTimeline() {
    var items = logItems().slice();
    if ((T.status === 'running' || T.status === 'paused') && T.space) {
      var left = T.status === 'running' ? Math.max(0, T.endAt - Date.now()) : T.remain;
      var el = Math.max(0, (T.total * 1000 - left) / 60000);
      if (el > 0.05) items.push({ k: T.kind === 'break' ? 'rest' : 'study', s: T.space, m: el, live: true });
    }
    var study = 0, rest = 0, total = 0;
    items.forEach(function (it) { total += it.m; if (it.k === 'rest') rest += it.m; else study += it.m; });
    var DAY_CAP = PROF.dayCap; // the daily axis (2 h for school students); study time past it is drawn in a different colour
    var scale = Math.max(DAY_CAP, Math.ceil(total / 5) * 5);
    var tl = $('tl'); tl.textContent = '';
    var acc = 0, over = 0;
    function add(cls, mins, it, tip) {
      var seg = document.createElement('span');
      seg.className = 'seg ' + cls;
      seg.style.width = 'calc(' + (mins / scale * 100) + '% - 2px)';
      var fi = it.k !== 'rest' && faceInfo(it.s);
      if (fi) seg.style.setProperty('--rh', fi.hue);
      seg.title = tip;
      tl.appendChild(seg);
    }
    items.forEach(function (it) {
      var fn = faceInfo(it.s), name = fn ? fn.name + (fn.die ? t('tl.otherDie', { die: fn.die }) : '') + ' · ' : '';
      var tip = (it.k === 'rest' ? t('tl.tipRest', { m: Math.round(it.m) }) : name + t('tl.tipStudy', { m: Math.round(it.m) })) + (it.live ? t('tl.live') : '');
      if (it.k === 'rest') { add('rest', it.m, it, tip); }
      else {
        var before = Math.max(0, Math.min(it.m, DAY_CAP - acc)), after = it.m - before;
        if (before > 0) add('study', before, it, tip);
        if (after > 0.001) { add('study over', after, it, tip + t('tl.overTip', { cap: CAP_TXT })); over += after; }
      }
      acc += it.m;
    });
    if (scale > DAY_CAP) {
      var mark = document.createElement('i');
      mark.className = 'tl-mark';
      mark.style.left = 'calc(2px + (100% - 4px) * ' + (DAY_CAP / scale) + ')';
      mark.title = CAP_TXT;
      tl.appendChild(mark);
    }
    $('tlStudy').textContent = Math.round(study);
    $('tlRest').textContent = Math.round(rest);
    $('tlOverKey').hidden = over < 0.5;
    $('tlNote').hidden = over < 0.5;
    $('tlScale').textContent = scale > DAY_CAP ? t('tl.markAt', { cap: CAP_TXT }) : t('tl.range', { n: DAY_CAP });
  }
  var pomoCache = { d: '', n: 0 };
  try { var po = JSON.parse(localStorage.getItem('ds-pomo') || 'null'); if (po && po.d) pomoCache = po; } catch (e) {}
  function pomoGet() { return pomoCache.d === today() ? pomoCache.n : 0; }
  function pomoInc() { var n = pomoGet() + 1; pomoCache = { d: today(), n: n }; try { localStorage.setItem('ds-pomo', JSON.stringify(pomoCache)); } catch (e) {} return n; }

  /* ---- subject die faces ---- */
  function drawSubject(ctx, s, i, TS, dk) {
    var fill = dk ? 'hsl(' + s.hue + ',50%,52%)' : 'hsl(' + s.hue + ',62%,70%)';
    ctx.clearRect(0, 0, TS, TS);
    ctx.fillStyle = fill; ctx.fillRect(0, 0, TS, TS);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = dk ? 'hsl(' + s.hue + ',45%,8%)' : '#14171C';
    var fs = TS * 0.30;
    ctx.font = '800 ' + Math.round(fs) + 'px "Bricolage Grotesque",' + CJK;
    var w = ctx.measureText(s.name).width;
    if (w > TS * 0.62) { fs = fs * TS * 0.62 / w; ctx.font = '800 ' + Math.round(fs) + 'px "Bricolage Grotesque",' + CJK; }
    ctx.fillText(s.name, TS / 2, TS * 0.57);
    ctx.fillStyle = dk ? 'hsl(' + s.hue + ',40%,16%)' : 'hsl(' + s.hue + ',40%,22%)';
    ctx.font = '600 ' + Math.round(TS * 0.075) + 'px "Bricolage Grotesque",' + CJK;
    ctx.fillText(s.cap, TS / 2, TS * 0.72);
  }

  /* ---- timer die faces: tints of the room's hue, with a level that drains ---- */
  var T = { face: T_START, status: 'idle', total: TDURS[T_START] * 60, endAt: 0, remain: TDURS[T_START] * 60000, lastLevel: -1, lastSec: -1, space: null, kind: 'focus' };
  function tFrac() {
    if (T.status === 'done') return 0;
    if (T.status === 'idle') return 1;
    return Math.max(0, Math.min(1, T.remain / (T.total * 1000)));
  }
  function drawTimer(ctx, dur, i, TS, dk) {
    var brk = T.kind === 'break' && i === T.face;
    var h = brk ? 210 : curHue(), k = i / 11;
    var L = dk ? 62 - 22 * k : 80 - 24 * k;
    var fill = 'hsl(' + h + ',' + (brk ? 10 : dk ? 45 : 55) + '%,' + L + '%)';
    var empty = dk ? 'hsl(' + h + ',18%,19%)' : 'hsl(' + h + ',28%,93%)';
    var tEmpty = dk ? 'hsl(' + h + ',20%,74%)' : 'hsl(' + h + ',26%,34%)';
    var tFill = (dk ? L >= 48 : L >= 60) ? '#14171C' : '#F6F7FA';
    var line = dk ? 'hsl(' + h + ',60%,72%)' : 'hsl(' + h + ',62%,36%)';
    var fr = i === T.face ? tFrac() : 1;
    var lab = brk ? { n: t('timer.rest'), u: durText(Math.round(T.total / 60)) } : durLabel(dur), cx = TS / 2;
    var top = 0, bottom = TS * 0.905, y = bottom - (bottom - top) * fr;
    function text(color) {
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      var big = brk ? 0.27 : lab.n.length >= 3 ? 0.36 : 0.48;
      ctx.font = '800 ' + Math.round(TS * big) + 'px "Bricolage Grotesque",' + CJK;
      ctx.fillText(lab.n, cx, TS * 0.58);
      ctx.font = '600 ' + Math.round(TS * 0.095) + 'px "Bricolage Grotesque",' + CJK;
      ctx.fillText(lab.u, cx, TS * 0.72);
    }
    ctx.clearRect(0, 0, TS, TS);
    ctx.fillStyle = empty; ctx.fillRect(0, 0, TS, TS);
    text(tEmpty);
    if (fr > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, y, TS, TS - y); ctx.clip();
      ctx.fillStyle = fill; ctx.fillRect(0, 0, TS, TS);
      text(tFill);
      ctx.restore();
      if (fr < 1) { ctx.fillStyle = line; ctx.fillRect(0, y - 1.5, TS, 3); }
    }
  }

  /* ---- build both dice ---- */
  sdie = createDie({
    canvas: $('gl'), host: $('die'), items: SUBJECTS, tex: 512, draw: drawSubject, start: faceIndex(START),
    onTouch: function () { $('dlHint').classList.add('off'); },
    onPreview: function (i) { setHue(SUBJECTS[i].hue); $('dlName').textContent = SUBJECTS[i].name; },
    onSettle: function (i) { enter(SUBJECTS[i].key); }
  });
  tdie = createDie({
    canvas: $('tgl'), host: $('tdie'), items: TDURS, tex: 256, draw: drawTimer, start: T_START, wob: 0.6,
    onSettle: function (i, changed) { if (changed && i !== T.face) tStart(i); },
    onTapFront: function () { tPrimary(); }
  });
  if (!sdie) { $('nogl').style.display = 'flex'; $('gl').style.display = 'none'; $('dlHint').style.display = 'none'; $('all').open = true; }
  if (!tdie) {
    $('tdie').style.display = 'none';
    $('tChips').style.display = 'flex';
    $('tdie').parentNode.style.gridTemplateColumns = 'minmax(0,1fr)';
    TDURS.forEach(function (m, i) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = m;
      b.setAttribute('aria-label', t('timer.chipAria', { len: durText(m) }));
      b.addEventListener('click', function () { tStart(i); });
      $('tChips').appendChild(b);
    });
  }
  function applyThemeAll() { if (sdie) sdie.refresh(); if (tdie) tdie.refresh(); }
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', applyThemeAll);
  }
  new MutationObserver(applyThemeAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('800 80px "Bricolage Grotesque"', '0123456789ADNHFmaπΣ'),
      document.fonts.load('600 40px "Bricolage Grotesque"', t('unit.min') + t('unit.hour'))
    ]).then(applyThemeAll).catch(function () {});
  }

  /* ================= entering a room ================= */
  var allBtns = [];
  PROF.menu.forEach(function (s) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = s.name; b.dataset.key = s.key;
    b.addEventListener('click', function () { $('all').open = false; goTo(s.key); });
    $('allList').appendChild(b); allBtns.push(b);
  });
  /* bookshelf: every die (the three built-in identities plus ones the AI generated); switching reloads the page */
  window.switchDie = function (pid) {
    if (pid === PROF.id) return;
    if ((T.status === 'running' || T.status === 'paused') && T.kind === 'focus') {
      if (!confirm(t('shelf.switchConfirm'))) return;
    }
    closeBreak(); closeFocus(); flushNote();
    PROFILES.setProfile(pid);
    setTimeout(function () { location.reload(); }, 60);
  };
  /* small hooks for the "Beyond today" panel (js/future.js) */
  window.TFApp = {
    faces: function () { return SUBJECTS.map(function (s) { return { key: s.key, name: s.name }; }); },
    cur: function () { return cur || SUBJECTS[0].key; },
    faceName: function (key) { return byKey[key] ? byKey[key].name : key; },
    addTodo: function (key, text) {
      return loadSpace(key).then(function (d) {
        d.todos.push({ id: uid(), t: String(text).slice(0, 120), done: false }); persist(key);
        if (key === cur) renderTodos();
      });
    }
  };
  /* language: switching reloads the page so every text comes from the new language pack */
  window.switchLang = function (lang) {
    if (lang === I18N.lang()) return;
    if ((T.status === 'running' || T.status === 'paused') && T.kind === 'focus') {
      if (!confirm(t('lang.switchConfirm'))) return;
    }
    closeBreak(); closeFocus(); flushNote();
    I18N.setLang(lang);
    setTimeout(function () { location.reload(); }, 60);
  };
  (function shelf() {
    var dice = PROFILES.all();
    var box = document.createElement('div'); box.className = 'shelf';
    var h = document.createElement('div'); h.className = 'shelf-h'; h.textContent = t('shelf.title'); box.appendChild(h);
    dice.forEach(function (d) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = d.label;
      b.setAttribute('aria-current', d.id === PROF.id ? 'true' : 'false');
      b.addEventListener('click', function () { $('all').open = false; window.switchDie(d.id); });
      box.appendChild(b);
    });
    var add = document.createElement('button'); add.type = 'button'; add.className = 'shelf-add'; add.textContent = t('shelf.new');
    add.addEventListener('click', function () { $('all').open = false; window.openMaker(); });
    box.appendChild(add);
    $('allList').appendChild(box);
  })();
  function goTo(key) {
    $('dlHint').classList.add('off');
    if (sdie) sdie.goTo(faceIndex(key)); else enter(key);
  }

  function enter(key) {
    var s = byKey[key];
    setHue(s.hue); $('dlName').textContent = s.name;
    if (key === cur) return;
    flushNote();
    if (ctl) ctl.abort();
    var first = cur === null;
    cur = key;
    if (first) document.body.setAttribute('data-space', s.look);
    else {
      elAtmos.classList.add('swap');
      setTimeout(function () { document.body.setAttribute('data-space', s.look); elAtmos.classList.remove('swap'); }, reduced ? 0 : 180);
    }
    $('spName').textContent = s.name;
    $('spTag').textContent = t('space.tag', { tag: s.tag });
    $('askStyle').textContent = s.tag;
    $('q').placeholder = s.ask;
    $('todoIn').placeholder = s.todo;
    $('note').placeholder = s.note;
    renderQuick(s); renderChat();
    $('todos').textContent = ''; $('note').value = ''; $('todoCount').textContent = ''; $('focusToday').textContent = ''; $('goalIn').value = '';
    loadSpace(key).then(function () { renderSpace(key); });
    try { localStorage.setItem('ds-last', key); } catch (e) {}
    allBtns.forEach(function (b) { b.setAttribute('aria-current', b.dataset.key === key ? 'true' : 'false'); });
    if (tdie) tdie.refresh();
    tUI();
    elWork.classList.remove('enter'); void elWork.offsetWidth; elWork.classList.add('enter');
    elWork.scrollTop = 0;
  }

  /* ================= todos, notes, focus minutes ================= */
  function blank() { return { todos: [], note: '', focus: null, plan: null }; }
  function loadSpace(key) {
    if (mem[key]) return Promise.resolve(mem[key]);
    function fromLocal() {
      try { var raw = localStorage.getItem('ds:' + key); if (raw) return JSON.parse(raw); } catch (e) {}
      return null;
    }
    var p = Promise.resolve(null);
    return p.then(function (d) {
      d = d || fromLocal() || blank();
      mem[key] = { todos: Array.isArray(d.todos) ? d.todos : [], note: String(d.note || ''), focus: d.focus && d.focus.d ? { d: String(d.focus.d), m: Number(d.focus.m) || 0 } : null, plan: d.plan && d.plan.d ? { d: String(d.plan.d), m: Number(d.plan.m) || 0 } : null };
      return mem[key];
    });
  }
  function saveNoteText() { $('saveNote').textContent = t('note.saved'); }
  function payload(key) { var d = mem[key]; return { todos: d.todos, note: d.note, focus: d.focus, plan: d.plan }; }
  function persist(key) {
    if (!mem[key]) return;
    dirty[key] = true;
    var data = payload(key);
    try { localStorage.setItem('ds:' + key, JSON.stringify(data)); } catch (e) {}
  }
  function flushNote() {
    if (noteTimer) { clearTimeout(noteTimer); noteTimer = null; if (cur && mem[cur]) persist(cur); }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function renderTodos() {
    var d = mem[cur]; if (!d) return;
    var ul = $('todos'); ul.textContent = '';
    var done = 0;
    d.todos.forEach(function (td) {
      if (td.done) done++;
      var li = document.createElement('li'); if (td.done) li.className = 'done';
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!td.done;
      cb.setAttribute('aria-label', t('todo.doneAria', { t: td.t }));
      cb.addEventListener('change', function () { td.done = cb.checked; persist(cur); renderTodos(); });
      var sp = document.createElement('span'); sp.className = 't'; sp.textContent = td.t;
      var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', t('todo.delAria', { t: td.t }));
      x.addEventListener('click', function () { d.todos = d.todos.filter(function (o) { return o.id !== td.id; }); persist(cur); renderTodos(); });
      li.appendChild(cb); li.appendChild(sp); li.appendChild(x); ul.appendChild(li);
    });
    $('todoEmpty').hidden = d.todos.length > 0;
    $('todoCount').textContent = d.todos.length ? t('todo.count', { done: done, all: d.todos.length }) : '';
  }
  function renderFocus() {
    var m = cur ? focusMin(cur) : 0, g = cur ? planMin(cur) : 0;
    $('focusToday').textContent = g ? t('focus.ofGoal', { m: m, g: g }) : (m ? t('focus.today', { m: m }) : '');
  }
  function renderGoal() { var m = cur ? planMin(cur) : 0; $('goalIn').value = m ? m : ''; }
  function renderToday() {
    var rows = $('trows'); rows.textContent = '';
    var total = 0, any = false;
    SUBJECTS.forEach(function (s) {
      var f = focusMin(s.key), g = planMin(s.key);
      total += f;
      if (!f && !g) return;
      any = true;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'trow';
      b.style.setProperty('--rh', s.hue);
      b.setAttribute('aria-current', s.key === cur ? 'true' : 'false');
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = s.name; nm.title = s.name;
      var bar = document.createElement('span'); bar.className = 'meter';
      var fill = document.createElement('i');
      fill.style.width = (g ? Math.min(100, Math.round(f / g * 100)) : (f ? 100 : 0)) + '%';
      bar.appendChild(fill);
      var num = document.createElement('span'); num.className = 'num'; num.textContent = g ? f + '/' + g : String(f);
      b.appendChild(nm); b.appendChild(bar); b.appendChild(num);
      b.addEventListener('click', function () { goTo(s.key); });
      rows.appendChild(b);
    });
    var n = pomoGet();
    // the day's total counts every die on the shelf, same as the timeline below
    var logged = Math.round(logItems().reduce(function (a, it) { return it.k === 'rest' ? a : a + it.m; }, 0));
    total = Math.max(total, logged);
    $('todaySum').textContent = any || n || total
      ? t('today.sum', { total: total, n: n })
      : t('today.empty', { unit: PROF.unit });
    renderTimeline();
  }
  function renderSpace(key) {
    if (cur !== key || !mem[key]) return;
    renderTodos(); $('note').value = mem[key].note; renderFocus(); renderGoal(); renderToday();
  }
  $('goalIn').addEventListener('change', function () {
    if (!cur || !mem[cur]) return;
    var v = Math.max(0, Math.min(600, parseInt($('goalIn').value, 10) || 0));
    mem[cur].plan = v ? { d: today(), m: v } : null;
    $('goalIn').value = v ? v : '';
    persist(cur); renderFocus(); renderToday();
  });

  /* ask the AI to arrange today: the page asks for JSON, shows it, and only applies it when the student agrees */
  function planToday() {
    if (busyPlan) return;
    var avail = Math.max(15, Math.min(600, parseInt($('availIn').value, 10) || 120));
    var out = $('planOut');
    busyPlan = true; $('planBtn').disabled = true; out.textContent = t('ai.thinking');
    Promise.all(SUBJECTS.map(function (s) { return loadSpace(s.key); })).then(function () {
      var lines = SUBJECTS.map(function (s) {
        var open = mem[s.key].todos.filter(function (t) { return !t.done; }).slice(0, 5).map(function (t) { return t.t; });
        return t('plan.line', { key: s.key, name: s.name, todos: open.length ? open.join(SEP_ITEMS) : t('none') });
      }).join('\n');
      var prompt = t('plan.prompt', { who: PROF.who, avail: avail, lines: lines });
      return AI.json({ messages: [{ role: 'user', content: prompt }], maxTokens: 1500 });
    }).then(function (res) {
      var plan = [], sum = 0;
      (res && Array.isArray(res.plan) ? res.plan : []).forEach(function (p) {
        if (!p || !byKey[p.key] || plan.length >= 5) return;
        if (plan.some(function (q) { return q.key === p.key; })) return;
        var m = Math.max(15, Math.min(90, Math.round((Number(p.minutes) || 0) / 5) * 5));
        if (sum + m > avail) return;
        sum += m; plan.push({ key: p.key, minutes: m, why: String(p.why || '').slice(0, 40) });
      });
      if (!plan.length) { out.textContent = t('plan.fail'); return; }
      showPlan(plan, sum, String((res && res.tip) || '').slice(0, 60));
    }).catch(function (e) {
      aiProblem(out, e);
    }).then(function () { busyPlan = false; $('planBtn').disabled = false; });
  }
  function showPlan(plan, sum, tip) {
    var out = $('planOut'); out.textContent = '';
    plan.forEach(function (p) {
      var d = document.createElement('div');
      d.textContent = t('plan.item', { name: byKey[p.key].name, m: p.minutes });
      if (p.why) { var w = document.createElement('span'); w.className = 'why'; w.textContent = ' · ' + p.why; d.appendChild(w); }
      out.appendChild(d);
    });
    if (tip) { var tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.textContent = tip; out.appendChild(tipEl); }
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.style.alignSelf = 'flex-start';
    b.textContent = t('plan.apply', { sum: sum });
    b.addEventListener('click', function () {
      var keep = {}; plan.forEach(function (p) { keep[p.key] = p.minutes; });
      Promise.all(SUBJECTS.map(function (s) { return loadSpace(s.key); })).then(function () {
        SUBJECTS.forEach(function (s) {
          if (keep[s.key]) { mem[s.key].plan = { d: today(), m: keep[s.key] }; persist(s.key); }
          else if (planMin(s.key)) { mem[s.key].plan = null; persist(s.key); }
        });
        renderGoal(); renderFocus(); renderToday();
        out.textContent = t('plan.applied');
      });
    });
    out.appendChild(b);
  }
  $('planBtn').addEventListener('click', planToday);
  $('todoForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('todoIn').value.trim(); if (!v || !cur || !mem[cur]) return;
    mem[cur].todos.push({ id: uid(), t: v, done: false });
    $('todoIn').value = ''; persist(cur); renderTodos();
  });
  $('note').addEventListener('input', function () {
    if (!cur || !mem[cur]) return;
    mem[cur].note = $('note').value; dirty[cur] = true;
    try { localStorage.setItem('ds:' + cur, JSON.stringify(payload(cur))); } catch (e) {}
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { noteTimer = null; persist(cur); }, 900);
  });
  $('note').addEventListener('blur', flushNote);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushNote(); });
  saveNoteText();

  /* ================= focus timer ================= */
  var muted = false;
  try { muted = localStorage.getItem('ds-muted') === '1'; } catch (e) {}
  $('snd').checked = !muted;
  var ac = null, wl = null, alarmUntil = 0;
  function unlock() {
    try {
      if (!ac) { var C = window.AudioContext || window.webkitAudioContext; if (C) ac = new C(); }
      if (ac && ac.state === 'suspended') ac.resume();
    } catch (e) {}
  }
  $('snd').addEventListener('change', function () {
    unlock(); muted = !$('snd').checked;
    try { localStorage.setItem('ds-muted', muted ? '1' : '0'); } catch (e) {}
  });
  function chime(kind) {
    if (muted) return;
    unlock();
    if (!ac) return;
    var stamp = Date.now();
    if (ac.state === 'running') ring(kind, stamp);
    else { try { ac.resume().then(function () { ring(kind, stamp); }, function () {}); } catch (e) {} }
  }
  function ring(kind, stamp) {
    // a chime that could not start in time stays silent: queued in a suspended audio context it would sound later, during another countdown
    if (Date.now() - stamp > 2500) return;
    try {
      var soft = kind === 'rest', t0 = ac.currentTime + 0.05;
      (soft ? [0] : [0, 0.9]).forEach(function (off) {
        (soft ? [784, 659.3] : [880, 1108.7, 1318.5]).forEach(function (fr, i) {
          var os = ac.createOscillator(), g = ac.createGain(), s = t0 + off + i * 0.16;
          os.type = 'sine'; os.frequency.value = fr;
          g.gain.setValueAtTime(0.0001, s);
          g.gain.exponentialRampToValueAtTime(soft ? 0.16 : 0.25, s + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, s + 0.7);
          os.connect(g); g.connect(ac.destination);
          os.start(s); os.stop(s + 0.75);
        });
      });
    } catch (e) {}
  }
  function wake() {
    try {
      if (navigator.wakeLock && document.visibilityState === 'visible' && !wl) {
        navigator.wakeLock.request('screen').then(function (l) { wl = l; l.addEventListener('release', function () { wl = null; }); }).catch(function () {});
      }
    } catch (e) {}
  }
  function unwake() { try { if (wl) wl.release(); } catch (e) {} wl = null; }
  document.addEventListener('visibilitychange', function () { if (T.status === 'running') wake(); tick(); });

  function closeBreak() {
    if (T.kind === 'break' && (T.status === 'running' || T.status === 'paused')) {
      var left = T.status === 'running' ? Math.max(0, T.endAt - Date.now()) : T.remain;
      logAdd('rest', T.space, Math.round((T.total * 1000 - left) / 60000));
    }
  }
  function closeFocus() {
    // switching faces or resetting mid-run: keep the minutes already studied instead of dropping them
    if (T.kind === 'focus' && (T.status === 'running' || T.status === 'paused') && T.space) {
      var left = T.status === 'running' ? Math.max(0, T.endAt - Date.now()) : T.remain;
      var mins = Math.round((T.total * 1000 - left) / 60000), key = T.space;
      if (mins >= 1) {
        logAdd('study', key, mins);
        loadSpace(key).then(function (d) {
          var day = today();
          if (!d.focus || d.focus.d !== day) d.focus = { d: day, m: 0 };
          d.focus.m += mins;
          persist(key);
          if (cur === key) renderFocus();
          renderToday();
        });
      }
    }
  }
  function tStart(i) {
    closeBreak(); closeFocus();
    var old = T.face;
    T.face = i; T.space = cur; T.kind = 'focus';
    T.total = TDURS[i] * 60; T.remain = T.total * 1000; T.endAt = Date.now() + T.remain;
    T.status = 'running'; T.lastLevel = -1; T.lastSec = -1; alarmUntil = 0;
    unlock(); wake();
    if (tdie) { if (old !== i) tdie.redraw(old); tdie.redraw(i); }
    tUI();
  }
  function tPause() { T.remain = Math.max(0, T.endAt - Date.now()); T.status = 'paused'; unwake(); tUI(); }
  function tResume() { T.endAt = Date.now() + T.remain; T.status = 'running'; wake(); tUI(); }
  function tReset() {
    closeBreak(); closeFocus();
    T.kind = 'focus'; T.total = TDURS[T.face] * 60;
    T.status = 'idle'; T.remain = T.total * 1000; T.lastLevel = -1; T.lastSec = -1; alarmUntil = 0; unwake();
    if (tdie) tdie.redraw(T.face);
    tUI();
  }
  function tFinish() {
    var wasFocus = T.kind === 'focus';
    unwake(); chime(wasFocus ? 'focus' : 'rest');
    try { if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 500]); } catch (e) {}
    if (wasFocus) {
      var key = T.space, mins = Math.round(T.total / 60), n = pomoInc();
      logAdd('study', key, mins);
      if (key) {
        loadSpace(key).then(function (d) {
          var day = today();
          if (!d.focus || d.focus.d !== day) d.focus = { d: day, m: 0 };
          d.focus.m += mins;
          persist(key);
          if (cur === key) renderFocus();
          renderToday();
        });
      }
      if ($('pomo').checked) {
        T.kind = 'break'; T.noticeUntil = Date.now() + 8000;
        T.total = (n % 4 === 0 ? 15 : 5) * 60; T.remain = T.total * 1000; T.endAt = Date.now() + T.remain;
        T.status = 'running'; T.lastLevel = -1; T.lastSec = -1;
        wake();
        if (tdie) tdie.redraw(T.face);
        tUI(); renderToday();
        return;
      }
    }
    if (!wasFocus) logAdd('rest', T.space, Math.round(T.total / 60));
    T.status = 'done'; T.remain = 0;
    if (tdie) tdie.redraw(T.face);
    tUI(); renderToday();
  }
  function tick() {
    if (T.status !== 'running') return;
    var rem = T.endAt - Date.now();
    if (rem <= 0) { tFinish(); return; }
    T.remain = rem;
    var sec = Math.ceil(rem / 1000);
    if (sec !== T.lastSec) { T.lastSec = sec; tUI(); }
    var level = Math.round(rem / (T.total * 1000) * 192);
    if (level !== T.lastLevel) { T.lastLevel = level; if (tdie) tdie.redraw(T.face); }
  }
  setInterval(tick, 250);
  // a worker keeps ticking when the tab is in the background, where page timers are slowed down
  try {
    var tw = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(1)},250)'], { type: 'text/javascript' })));
    tw.onmessage = function () { tick(); };
  } catch (e) {}
  function tPrimary() {
    unlock();
    if (T.status === 'idle' || T.status === 'done') tStart(T.face);
    else if (T.status === 'running') tPause();
    else tResume();
  }
  /* render a translated template into an element, with each value in its own <span> so CSS can style it
     (the timer pill shortens the subject name but never hides the time) */
  function tplInto(el, key, vars, cls) {
    var marks = {}, tv = {};
    Object.keys(vars).forEach(function (k, i) { tv[k] = '\u0001' + i + '\u0002'; marks[i] = k; });
    el.textContent = '';
    t(key, tv).split(/(\u0001\d+\u0002)/).forEach(function (part) {
      if (!part) return;
      var m = /^\u0001(\d+)\u0002$/.exec(part), sp = document.createElement('span');
      if (m) { var k = marks[m[1]]; sp.textContent = vars[k]; if (cls[k]) sp.className = cls[k]; } else sp.textContent = part;
      el.appendChild(sp);
    });
  }
  function tUI() {
    var shown = T.status === 'idle' ? T.total : Math.ceil(T.remain / 1000);
    var where = T.space && byKey[T.space] ? byKey[T.space].name : '';
    $('tTime').textContent = fmt(shown);
    $('tTime').classList.toggle('done', T.status === 'done');
    var brk = T.kind === 'break', lenTxt = durText(Math.round(T.total / 60));
    $('tStatus').textContent = T.status === 'idle' ? t('timer.idle')
      : brk ? (T.status === 'running' ? (Date.now() < (T.noticeUntil || 0) ? t('timer.breakNotice', { len: lenTxt }) : t('timer.breakRunning')) : T.status === 'paused' ? t('timer.breakPaused') : t('timer.breakDone'))
      : T.status === 'running' ? t('timer.running', { where: where, len: lenTxt })
      : T.status === 'paused' ? t('timer.paused', { where: where, len: lenTxt })
      : t('timer.done', { where: where });
    $('tGo').textContent = t(T.status === 'idle' ? 'timer.start' : T.status === 'running' ? 'timer.pause' : T.status === 'paused' ? 'timer.resume' : 'timer.again');
    $('tReset').textContent = t(brk && T.status !== 'done' ? 'timer.skipBreak' : 'timer.reset');
    $('tReset').disabled = T.status === 'idle';
    var pill = $('pill');
    pill.hidden = T.status === 'idle';
    pill.classList.toggle('done', T.status === 'done');
    var pw = brk ? t('timer.rest') : where, app = t('app.name');
    tplInto(pill, T.status === 'done' ? 'pill.done' : T.status === 'paused' ? 'pill.paused' : 'pill.running', { w: pw, time: fmt(shown) }, { w: 'pw', time: 'pt' });
    document.title = T.status === 'running' ? t('title.running', { time: fmt(shown), w: pw, app: app })
      : T.status === 'done' ? t('title.done', { app: app })
      : (cur ? byKey[cur].name + ' · ' : '') + app;
    renderTimeline();
  }
  try { if (localStorage.getItem('ds-pomo-on') === '0') $('pomo').checked = false; } catch (e) {}
  $('pomo').addEventListener('change', function () { try { localStorage.setItem('ds-pomo-on', $('pomo').checked ? '1' : '0'); } catch (e) {} });
  $('tGo').addEventListener('click', tPrimary);
  $('tReset').addEventListener('click', tReset);
  $('pill').addEventListener('click', function () { if (T.space) goTo(T.space); });

  /* ================= ask the AI, in this room's voice; it can also operate the app ================= */
  var AGENT = t('agent.rules', { durs: TDURS.join(SEP), subjects: SUBJECTS.map(function (s) { return s.name; }).join(SEP) });
  function stateLine(key) {
    var d = mem[key], s = byKey[key];
    var open = d ? d.todos.filter(function (t) { return !t.done; }).slice(0, 6).map(function (t) { return t.t; }) : [];
    var g = planMin(key), f = focusMin(key);
    var tm = T.status === 'running' ? t('agent.tmRunning', { kind: t(T.kind === 'break' ? 'agent.kindRest' : 'agent.kindFocus'), left: fmt(Math.ceil(Math.max(0, T.endAt - Date.now()) / 1000)) })
      : t(T.status === 'paused' ? 'agent.tmPaused' : 'agent.tmIdle');
    return t('agent.state', { date: today(), name: s.name, goal: g ? t('agent.goalSet', { g: g }) : t('agent.goalNone'), f: f,
      todos: open.length ? open.join(SEP_ITEMS) : t('none'), timer: tm });
  }
  function rules(key) { var s = byKey[key]; return t('agent.head', { name: s.name }) + s.persona + ' ' + COMMON + AGENT + stateLine(key); }

  /* split the model's reply into the text the student sees and the actions it asked for */
  function splitActs(t) {
    var acts = [];
    var shown = String(t || '').replace(/<do>([\s\S]*?)<\/do>/g, function (_, j) {
      try { var o = JSON.parse(j.trim()); if (o && typeof o.a === 'string') acts.push(o); } catch (e) {}
      return '';
    });
    shown = shown.replace(/<do>[\s\S]*$/, '').replace(/<(d|do)?$/, '');   // a tag still streaming in
    return { text: shown.replace(/\n{3,}/g, '\n\n').trim(), acts: acts.slice(0, 3) };
  }
  function subjectOf(v) {
    if (!v) return cur;
    v = String(v).trim();
    if (byKey[v]) return v;
    for (var i = 0; i < SUBJECTS.length; i++) if (SUBJECTS[i].name === v || v.indexOf(SUBJECTS[i].name) >= 0) return SUBJECTS[i].key;
    return null;
  }
  function nearestDur(m) {
    var best = T_START;
    TDURS.forEach(function (d, i) { if (Math.abs(d - m) < Math.abs(TDURS[best] - m)) best = i; });
    return best;
  }
  function switchTo(key) {
    if (key === cur) return;
    enter(key);
    if (sdie) sdie.goTo(faceIndex(key));
  }
  function runAct(a) {
    var key = subjectOf(a.subject);
    if (!key) return Promise.resolve(t('act.noSubject', { s: String(a.subject).slice(0, 20) }));
    var name = byKey[key].name;
    var text = String(a.text || '').trim();
    return loadSpace(key).then(function (d) {
      if (a.a === 'addTodo') {
        if (!text) return null;
        text = text.slice(0, 120);
        d.todos.push({ id: uid(), t: text, done: false }); persist(key);
        if (key === cur) renderTodos();
        return t('act.todo', { name: name, text: text });
      }
      if (a.a === 'addNote') {
        if (!text) return null;
        if (key === cur) flushNote();
        d.note = (d.note ? d.note.replace(/\s+$/, '') + '\n' : '') + text.slice(0, 1000); persist(key);
        if (key === cur) $('note').value = d.note;
        return t('act.note', { name: name });
      }
      if (a.a === 'setGoal') {
        var g = Math.max(5, Math.min(600, Math.round((Number(a.minutes) || 0) / 5) * 5));
        d.plan = { d: today(), m: g }; persist(key);
        renderGoal(); renderFocus(); renderToday();
        return t('act.goal', { name: name, g: g });
      }
      if (a.a === 'startTimer') {
        var i = nearestDur(Number(a.minutes) || 25);
        switchTo(key);
        tStart(i);
        if (tdie) tdie.goTo(i);
        return t('act.timer', { name: name, m: TDURS[i] });
      }
      if (a.a === 'goTo') { switchTo(key); return t('act.goTo', { name: name }); }
      return null;
    }).catch(function () { return null; });
  }

  function renderQuick(s) {
    var q = $('quick'); q.textContent = '';
    s.quick.forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = t;
      b.addEventListener('click', function () { ask(t); });
      q.appendChild(b);
    });
  }
  function renderChat() {
    var box = $('chat'); box.textContent = ''; botEl = null;
    chats[cur].forEach(function (m) {
      var d = document.createElement('div');
      d.className = 'msg ' + (m.role === 'user' ? 'user' : 'bot') + (m.err ? ' err' : '') + (m.role !== 'user' && !m.content ? ' wait' : '');
      if (m.via) d.setAttribute('data-via', m.via);
      d.textContent = m.role !== 'user' && !m.content ? waitText(m) : m.content;
      if (m.acts && m.acts.length) {
        var ul = document.createElement('div'); ul.className = 'acts';
        m.acts.forEach(function (t) { var li = document.createElement('div'); li.textContent = '✓ ' + t; ul.appendChild(li); });
        d.appendChild(ul);
      }
      if (m.note && m.content) { var n = document.createElement('div'); n.className = 'via-note'; n.textContent = m.note; d.appendChild(n); }
      if (m.needSetup) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.textContent = t('ask.setup');
        b.addEventListener('click', function () { window.openSettings(); });
        d.appendChild(document.createElement('br')); d.appendChild(b);
      }
      box.appendChild(d);
      if (m.role !== 'user') botEl = d;
    });
  }
  function waitText(m) {
    if (m.thinkAt) return t('ask.thinkingFor', { s: Math.max(1, Math.round((Date.now() - m.thinkAt) / 1000)) });
    return m.note || t('ai.thinking');
  }
  /* “深度思考”开关：难题想得更周全，但慢一些、多用一些 token。记在本机，默认打开。 */
  function thinkOn() { try { return localStorage.getItem('tf-think') !== '0'; } catch (e) { return true; } }
  function thinkUI() {
    var on = thinkOn();
    $('think').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('thinkHint').textContent = t(on ? 'ask.thinkOn' : 'ask.thinkOff');
  }
  $('think').addEventListener('click', function () {
    try { localStorage.setItem('tf-think', thinkOn() ? '0' : '1'); } catch (e) {}
    thinkUI();
  });
  thinkUI();
  function aiProblem(el, e) {
    el.textContent = AI.explain(e);
    if (e && (e.code === 'no_key' || e.code === 'all_failed')) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn alt sm'; b.textContent = t('ask.setup');
      b.style.marginTop = '6px'; b.style.display = 'block';
      b.addEventListener('click', function () { window.openSettings(); });
      el.appendChild(b);
    }
  }
  function setBusy(b) { busy = b; $('send').disabled = b; $('stop').hidden = !b; }
  function ask(text) {
    if (busy) return;
    text = (text || $('q').value).trim();
    if (!text) return;
    var key = cur, turns = chats[key];
    var user = { role: 'user', content: text }, bot = { role: 'assistant', content: '' };
    turns.push(user, bot);
    $('q').value = '';
    renderChat(); setBusy(true);
    var history = turns.filter(function (m) { return m !== bot && !m.err && m.content; }).slice(-12)
      .map(function (m) { return { role: m.role, content: m.content }; });
    ctl = new AbortController();
    var raw = '', deep = thinkOn(), thinkTick = null;
    loadSpace(key).then(function () {
      return AI.chat({
        system: rules(key), messages: history, signal: ctl.signal,
        think: deep, maxTokens: deep ? 8000 : 1500, idleMs: deep ? 90000 : 45000,
        onThink: function () {
          if (bot.thinkAt) return;
          bot.thinkAt = Date.now();
          thinkTick = setInterval(function () {
            if (bot.content || !bot.thinkAt) { clearInterval(thinkTick); return; }
            if (cur === key && botEl) botEl.firstChild.textContent = waitText(bot);
          }, 1000);
          if (cur === key) renderChat();
        },
        onSwitch: function (from, to, why) {
          bot.thinkAt = 0;
          bot.note = t('ask.switched', { from: from, why: why, to: to });
          bot.content = ''; if (cur === key) renderChat();
        },
        onText: function (t) {
          raw = t; bot.content = splitActs(t).text;
          if (cur === key && botEl) { botEl.classList.remove('wait'); botEl.textContent = bot.content; }
        }
      });
    }).then(function (r) {
      var sp = splitActs(r.text);
      bot.content = sp.text || (sp.acts.length ? t('ask.ok') : '');
      if (r.truncated) bot.content += t('ask.truncated');
      bot.via = r.via.name;
      return sp.acts.reduce(function (p, a) {
        return p.then(function (done) { return runAct(a).then(function (t) { if (t) done.push(t); return done; }); });
      }, Promise.resolve([])).then(function (done) { bot.acts = done; });
    }).catch(function (e) {
      if (e && e.code === 'cancelled') { bot.content = splitActs(raw).text || t('ask.stopped'); }
      else {
        var partial = splitActs(raw).text;
        bot.content = (partial ? partial + '\n\n' : '') + AI.explain(e); bot.err = !partial; bot.note = '';
        bot.needSetup = e && (e.code === 'no_key' || e.code === 'all_failed');
      }
    }).then(function () {
      ctl = null; setBusy(false); clearInterval(thinkTick); bot.thinkAt = 0;
      if (cur === key) renderChat();
      aiLine();
    });
  }
  function aiLine() {
    var c = AI.current(), elL = $('aiLine');
    elL.textContent = '';
    var b = document.createElement('button'); b.type = 'button'; b.className = 'linkish';
    b.textContent = c ? c.name + (c.cooling ? t('ask.cooling') : '') : t('ask.noAI');
    b.addEventListener('click', function () { window.openSettings(); });
    elL.appendChild(b);
  }
  document.addEventListener('ai-config', aiLine);
  $('askForm').addEventListener('submit', function (e) { e.preventDefault(); ask(); });
  $('q').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(); }
  });
  $('stop').addEventListener('click', function () { if (ctl) ctl.abort(); });

  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    var i = faceIndex(cur);
    if (e.key === 'ArrowRight') goTo(SUBJECTS[(i + 1) % SUBJECTS.length].key);
    else if (e.key === 'ArrowLeft') goTo(SUBJECTS[(i + SUBJECTS.length - 1) % SUBJECTS.length].key);
  });

  /* ================= start ================= */
  enter(START);
  tUI();
  Promise.all(SUBJECTS.map(function (s) { return loadSpace(s.key); })).then(renderToday);

  saveNoteText();
  aiLine();
  (function profileTexts() {
    $('all').querySelector('summary').textContent = t('all.title', { unit: PROF.unit });
    $('nogl').textContent = t('die.nogl', { unit: PROF.unit });
    $('tlOverTxt').textContent = t('tl.over', { cap: CAP_TXT });
    $('tlNote').textContent = t('tl.note', { cap: CAP_TXT });
  })();
})();
