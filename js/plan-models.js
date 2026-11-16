/* plan-models.js — methods ("models"): ways of studying and working, like the Feynman technique, spaced repetition, OKRs or a difficulty ladder.
 * The built-in library (js/plan-models-lib.js), the person's own methods (kept on this device), a parser that turns text pasted from a web page into a method,
 * and a guess at what kind of subject a plan is about, so the right methods come first. No page code here, so it can be tested on its own.
 * A method:  { id, name, sum, steps: [text], d: [domain ids], src: url, more: pasted text, by: 'lib'|'own'|'web'|'ai' }   (see PlanData.cleanModel)
 *   PlanModels.domains()          -> [{ id, name, sub: [{ id, name }] }]  in the page's language
 *   PlanModels.domainName(id)     -> 'Physics'
 *   PlanModels.lib()              -> the built-in methods in the page's language (Chinese, else English)
 *   PlanModels.mine() / save(m) / remove(id)     the person's own methods ("tf-methods")
 *   PlanModels.find(id)           -> a method from the library or from mine
 *   PlanModels.parse(text)        -> { name, sum, steps, more, src, d }   from text pasted from the web (a list becomes the steps; the first short line is the name)
 *   PlanModels.ordered(list, sel) -> the list with the methods made for exactly that subject first
 *   PlanModels.guess(text)        -> ['code', 'sci.math'…]  the kinds of subject the text is about, the likeliest first
 *   PlanModels.matches(m, sel)    -> does the method belong to the domain `sel` (a parent domain covers its children and the other way round)
 *   PlanModels.recommend(ids, n)  -> methods that fit those domains first, then general ones
 *   PlanModels.search(list, q)    -> the methods whose name, summary or steps contain q */
(function (global) {
  'use strict';
  var KEY = 'tf-methods', LIB = global.MethodLib || { DOMAINS: [], RAW: [] }, PD = global.PlanData;
  function isZh() { try { return /^zh/i.test(global.t('lang.html')); } catch (e) { return false; } }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function uid() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- the domains ---------- */
  function domains() {
    var zh = isZh();
    return LIB.DOMAINS.map(function (d) {
      return { id: d.id, name: zh ? d.zh : d.en, sub: arr(d.sub).map(function (s) { return { id: s[0], name: zh ? s[1] : s[2] }; }) };
    });
  }
  function domainName(id) {
    var out = id;
    domains().forEach(function (d) { if (d.id === id) out = d.name; d.sub.forEach(function (s) { if (s.id === id) out = s.name; }); });
    return out;
  }
  function parentOf(id) { var i = String(id).indexOf('.'); return i > 0 ? id.slice(0, i) : ''; }
  function matches(m, sel) {
    if (!sel || sel === 'all') return true;
    return arr(m.d).some(function (x) { return x === sel || x.indexOf(sel + '.') === 0 || sel.indexOf(x + '.') === 0; });
  }

  /* the methods that fit a subject, the ones made for exactly it first, then those for the whole field it belongs to, then those for one of its parts (the library's order inside each) */
  function ordered(list, sel) {
    function rank(m) { var best = 3; arr(m.d).forEach(function (x) { var r = x === sel ? 0 : sel.indexOf(x + '.') === 0 ? 1 : x.indexOf(sel + '.') === 0 ? 2 : 3; if (r < best) best = r; }); return best; }
    if (!sel || sel === 'all') return list.slice();
    return list.map(function (m, i) { return { m: m, r: rank(m), i: i }; }).sort(function (a, b) { return a.r - b.r || a.i - b.i; }).map(function (x) { return x.m; });
  }

  /* ---------- the library ---------- */
  var cache = null, cacheLang = null;
  function lib() {
    var zh = isZh(), k = zh ? 'zh' : 'en';
    if (cache && cacheLang === k) return cache;
    cache = LIB.RAW.map(function (r) {
      var v = zh ? r[2] : r[3];
      return { id: r[0], d: r[1].split(','), name: v[0], sum: v[1], steps: v[2].split('|'), src: '', more: '', by: 'lib' };
    });
    cacheLang = k; return cache;
  }

  /* ---------- my own ---------- */
  function readMine() {
    var o = null; try { o = JSON.parse(global.localStorage.getItem(KEY) || 'null'); } catch (e) {}
    return arr(o && o.items).map(PD.cleanModel).filter(function (m) { return m.name; });
  }
  var mineCache = null;
  function mine() { if (!mineCache) mineCache = readMine(); return mineCache.slice(); }
  function writeMine() { try { global.localStorage.setItem(KEY, JSON.stringify({ v: 1, items: mineCache })); return true; } catch (e) { return false; } }
  function save(m) {                                   // new (no id, or an id not kept yet) or changed; returns the cleaned method
    mine();
    var c = PD.cleanModel(m); if (!c.name) return null;
    if (c.by === 'lib') c.by = 'own';
    if (!m.id || /^[a-z]+$/.test(String(m.id)) && lib().some(function (x) { return x.id === m.id; })) c.id = uid();
    var at = -1; mineCache.forEach(function (x, i) { if (x.id === c.id) at = i; });
    if (at >= 0) mineCache[at] = c; else mineCache.unshift(c);
    mineCache = mineCache.slice(0, 200); writeMine(); return c;
  }
  function remove(id) { mine(); mineCache = mineCache.filter(function (m) { return m.id !== id; }); writeMine(); }
  function find(id) {
    var all = lib().concat(mine()), r = null; all.forEach(function (m) { if (!r && m.id === id) r = m; }); return r;
  }
  function reload() { mineCache = null; }

  /* ---------- finding methods ---------- */
  function search(list, q) {
    q = String(q || '').trim().toLowerCase(); if (!q) return list;
    return list.filter(function (m) { return (m.name + ' ' + m.sum + ' ' + m.steps.join(' ')).toLowerCase().indexOf(q) >= 0; });
  }
  function recommend(ids, n) {
    var all = lib().concat(mine()), seen = {}, out = [];
    function put(m) { if (!seen[m.id]) { seen[m.id] = 1; out.push(m); } }
    arr(ids).forEach(function (id) { all.forEach(function (m) { if (matches(m, id) && m.d.some(function (x) { return x !== 'gen'; })) put(m); }); });
    all.forEach(function (m) { if (m.d.indexOf('gen') >= 0) put(m); });
    return out.slice(0, n || 12);
  }

  /* ---------- what kind of subject is this? (a plan's title and stage names, or any text) ---------- */
  var KW = [
    ['sci.math', /数学|代数|几何|微积分|高数|概率|统计|线性代数|\b(maths?|algebra|geometry|calculus|probability|statistics|trigonometry|linear algebra)\b/gi],
    ['sci.phys', /物理|力学|电磁|光学|热学|量子|相对论|\b(physics|mechanics|electromagnetism|optics|thermodynamics|quantum)\b/gi],
    ['sci.chem', /化学|有机|无机|分子|\b(chemistry|organic|inorganic|molecules?|stoichiometry)\b/gi],
    ['sci.bio', /生物|细胞|遗传|基因|解剖|生态|医学|\b(biology|cells?|genetics|anatomy|ecology|medicine|physiology)\b/gi],
    ['sci', /理科|科学|实验|\b(science|stem|laboratory)\b/gi],
    ['hum.hist', /历史|朝代|战争|文明|\b(history|dynasty|civili[sz]ation)\b/gi],
    ['hum.lit', /文学|写作|作文|论文|小说|诗歌|\b(literature|essay|writing|novel|poetry|thesis)\b/gi],
    ['hum', /哲学|政治|经济学|社会学|心理学|法学|法律|人文|\b(philosophy|politics|economics|sociology|psychology|law|humanities)\b/gi],
    ['lang', /英语|日语|韩语|法语|德语|西班牙语|俄语|意大利语|雅思|托福|口语|听力|单词|词汇|语法|\b(english|japanese|korean|french|german|spanish|russian|italian|ielts|toefl|vocabulary|grammar|speaking|listening|language|hsk|jlpt|topik|delf|dele)\b/gi],
    ['code', /编程|代码|程序|算法|前端|后端|软件|开发|机器学习|数据分析|\b(coding|programming|python|java|javascript|typescript|rust|golang|sql|algorithms?|software|developer|frontend|backend|machine learning|data analysis)\b|c\+\+/gi],
    ['craft', /钢琴|吉他|小提琴|乐器|唱歌|声乐|绘画|画画|素描|书法|摄影|滑雪|游泳|跑步|马拉松|健身|瑜伽|篮球|足球|网球|羽毛球|烹饪|做饭|舞蹈|\b(piano|guitar|violin|music|singing|drawing|painting|photography|ski|skiing|swimming|running|marathon|fitness|yoga|basketball|football|soccer|tennis|cooking|dance|dancing|sport|sports)\b/gi],
    ['exam', /考试|考研|高考|中考|考公|考证|四级|六级|资格证|执业|司法考试|备考|真题|\b(exam|exams|gaokao|bar exam|cpa|gre|gmat|sat|certification|certificate)\b/gi],
    ['work.proj', /项目|产品|创业|\b(project|projects|startup|launch)\b/gi],
    ['work.write', /汇报|报告|文案|演讲|\b(presentation|report|copywriting)\b/gi],
    ['work.research', /研究|文献|科研|\b(research|literature review)\b/gi],
    ['work.design', /设计|产品经理|\b(design|ux|prototype)\b/gi],
    ['work.manage', /管理|团队|领导|效率|时间管理|\b(management|manager|team|leadership|productivity)\b/gi],
    ['work', /工作|职场|求职|面试|晋升|\b(career|job|interview|work)\b/gi]
  ];
  function hitsOf(text) {                               // [[id, how many times it is mentioned]], the most mentioned first
    text = String(text || ''); var hits = [];
    KW.forEach(function (k) { var m = text.match(k[1]); if (m && m.length) hits.push([k[0], m.length]); });
    hits.sort(function (a, b) { return b[1] - a[1]; });
    return hits;
  }
  function guess(text) { return hitsOf(text).map(function (h) { return h[0]; }); }

  /* ---------- text pasted from the web -> a method ---------- */
  var LIST_RE = /^\s*(?:[-*•·▪◦‣●○■□►▶➤]\s+|\d{1,2}\s*[.)、:：）]\s*|[（(]\s*\d{1,2}\s*[)）]\s*|[①②③④⑤⑥⑦⑧⑨⑩]\s*|(?:step|stage|phase)\s*\d{1,2}\s*[.):：-]?\s*|第\s*[一二三四五六七八九十\d]{1,3}\s*[步点条阶个]\s*[.:：、，,]?\s*)(\S.*)$/i;
  function clean(s) {
    return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+/, '').replace(/(\*\*|__)(.+?)\1/g, '$2').replace(/`([^`]+)`/g, '$1').replace(/\s+/g, ' ').trim();
  }
  function cut(s, n) {                                  // at most n characters, ending at a sentence if there is one near the end
    if (s.length <= n) return s;
    var head = s.slice(0, n), k = Math.max(head.lastIndexOf('。'), head.lastIndexOf('. '), head.lastIndexOf('！'), head.lastIndexOf('？'));
    return k > n * 0.5 ? head.slice(0, k + 1).trim() : head.trim() + '…';
  }
  function parse(text) {
    var raw = String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/[​‌‍﻿]/g, '').trim();
    var out = { name: '', sum: '', steps: [], more: '', src: '', d: ['gen'] };
    if (!raw) return out;
    var um = raw.match(/https?:\/\/[^\s<>"'）】，。]+/i); if (um) out.src = um[0].replace(/[.,;:!?)\]]+$/, '');
    var lines = raw.split('\n').map(clean).filter(function (l) { return l && !/^https?:\/\/\S+$/i.test(l); });
    if (!lines.length) return out;
    var i = 0, first = lines[0];
    if (lines.length === 1 && first.length <= 60 && !LIST_RE.test(first)) {             // just a name
      out.name = first.replace(/[：:]\s*$/, ''); out.d = pick(guess(out.name)); return out;
    }
    var colon = first.match(/^([^：:]{2,30})[：:]\s*(\S.*)$/);
    if (!LIST_RE.test(first) && first.length <= 40 && !/[。！？!?.]$/.test(first)) { out.name = first.replace(/[：:]\s*$/, ''); i = 1; }
    else if (colon && !LIST_RE.test(first) && lines.some(function (l) { return LIST_RE.test(l); })) { out.name = colon[1].trim(); lines[0] = colon[2].trim(); }
    var sum = [], rest = [];
    for (; i < lines.length; i++) {
      var l = lines[i], m = l.match(LIST_RE);
      if (m) out.steps.push(m[1].replace(/[；;，,]\s*$/, '').trim());
      else if (!out.steps.length && sum.join(' ').length < 240) sum.push(l);
      else rest.push(l);
    }
    var s = sum.join(' '); if (s.length > 400) { var c = cut(s, 400); rest.unshift(s.slice(c.length).trim()); s = c; }
    out.sum = s; out.steps = out.steps.filter(Boolean).slice(0, 15); out.more = rest.join('\n').trim().slice(0, 4000);
    /* a whole page mentions many things in passing (a physicist who taught it, a maths example): a subject is taken only when the text keeps coming back to it, or the name itself says it */
    var inName = guess(out.name);
    out.d = pick(hitsOf(out.name + ' ' + out.sum + ' ' + out.steps.join(' ')).filter(function (h) { return h[1] >= 3 || inName.indexOf(h[0]) >= 0; }).map(function (h) { return h[0]; }));
    return out;
  }
  function pick(ids) { return ids.length ? ids.slice(0, 2) : ['gen']; }

  global.PlanModels = { domains: domains, domainName: domainName, parentOf: parentOf, matches: matches, ordered: ordered, lib: lib, mine: mine, save: save, remove: remove, find: find, reload: reload,
    search: search, recommend: recommend, guess: guess, parse: parse };
})(typeof window !== 'undefined' ? window : globalThis);
