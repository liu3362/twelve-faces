/* ai.js — 统一调用多家 AI 平台；排在前面的先用，额度用完或出错就自动换下一家。
 * 密钥只保存在本机浏览器（localStorage），只发给对应的平台。
 * 对外：window.AI = { presets, config, set, move, ready, chat, json, test, explain, clearKeys, current } */
(function (global) {
  'use strict';

  /* 默认的平台列表。模型名和免费政策变化很快，这里只是起点，用户可以在设置里改。 */
  var PRESETS = [
    { id: 'claude', kind: 'anthropic', base: 'https://api.anthropic.com', think: { thinking: { type: 'enabled', budget_tokens: 3000 } },
      models: ['claude-haiku-5-5'], keyUrl: 'https://platform.claude.com/settings/keys' },
    { id: 'deepseek', kind: 'openai', base: 'https://api.deepseek.com', noThink: { thinking: { type: 'disabled' } }, think: { thinking: { type: 'enabled' } },
      models: ['deepseek-flash', 'deepseek-v4-pro'], keyUrl: 'https://platform.deepseek.com/api_keys' },
    { id: 'zhipu', kind: 'openai', base: 'https://open.bigmodel.cn/api/paas/v4', noThink: { thinking: { type: 'disabled' } }, think: { thinking: { type: 'enabled' } },
      models: ['glm-4.7-flash', 'glm-4.5-flash', 'glm-4-flash-250414'], keyUrl: 'https://open.bigmodel.cn/' },
    { id: 'volc', kind: 'openai', base: 'https://ark.cn-beijing.volces.com/api/v3', noThink: { thinking: { type: 'disabled' } }, think: { thinking: { type: 'enabled' } },
      models: ['doubao-seed-2-0-lite'], keyUrl: 'https://console.volcengine.com/ark' },
    { id: 'silicon', kind: 'openai', base: 'https://api.siliconflow.cn/v1',
      models: ['Qwen/Qwen2.5-7B-Instruct'], keyUrl: 'https://cloud.siliconflow.cn/account/ak' },
    { id: 'gemini', kind: 'openai', base: 'https://generativelanguage.googleapis.com/v1beta/openai',
      models: ['gemini-3.8-flash'], keyUrl: 'https://aistudio.google.com/apikey' },
    { id: 'openrouter', kind: 'openai', base: 'https://openrouter.ai/api/v1',
      models: [], keyUrl: 'https://openrouter.ai/keys' },
    { id: 'custom', kind: 'openai', base: '', models: [], custom: true, keyUrl: '' }
  ];
  var byId = {};
  PRESETS.forEach(function (p) { p.name = t('prov.' + p.id + '.name'); p.free = t('prov.' + p.id + '.free'); byId[p.id] = p; });

  var STORE = 'tf-ai-v1';
  var cfg = load();
  var cool = {};      // id -> { until: ms, code, msg }  只在内存里，刷新页面就清空
  var lastUsed = null;
  var plainOnly = {};  // 不接受 thinking 参数的平台，记下来以后不再发

  function load() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) {}
    var c = { order: [], p: {} };
    PRESETS.forEach(function (p) { c.p[p.id] = { on: false, key: '', model: p.models[0] || '', base: p.base }; });
    if (saved && saved.p) {
      Object.keys(saved.p).forEach(function (id) {
        if (!c.p[id]) return;
        var s = saved.p[id] || {};
        c.p[id] = { on: !!s.on, key: String(s.key || ''), model: String(s.model == null ? c.p[id].model : s.model), base: String(s.base || byId[id].base || '') };
      });
    }
    var order = saved && Array.isArray(saved.order) ? saved.order.filter(function (id) { return byId[id]; }) : [];
    PRESETS.forEach(function (p) { if (order.indexOf(p.id) < 0) order.push(p.id); });
    c.order = order;
    return c;
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch (e) {} }

  function set(id, patch) {
    var c = cfg.p[id]; if (!c) return;
    var changed = false;
    ['on', 'key', 'model', 'base'].forEach(function (k) {
      if (patch[k] === undefined) return;
      var v = k === 'on' ? !!patch[k] : String(patch[k]).trim();
      if (c[k] !== v) { c[k] = v; changed = true; }
    });
    if (patch.key !== undefined && c.key && patch.on === undefined) c.on = true; // 填了密钥就默认启用
    if (changed) delete cool[id];  // 改了设置，之前的错误不算数了
    save();
  }
  function move(id, dir) {
    var i = cfg.order.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= cfg.order.length) return;
    cfg.order[i] = cfg.order[j]; cfg.order[j] = id; save();
  }
  function usable(id) { var c = cfg.p[id]; return c && c.on && c.key && c.model && c.base; }
  function ready() { return cfg.order.filter(usable); }
  function clearKeys() { Object.keys(cfg.p).forEach(function (id) { cfg.p[id].key = ''; cfg.p[id].on = false; }); cool = {}; save(); }

  /* ---------- 错误分类：决定是换下一家，还是冷却多久 ---------- */
  var MIN = 60000;
  function mkErr(code, msg, status) { var e = new Error(msg || code); e.code = code; e.status = status || 0; return e; }
  function fromHttp(status, body) {
    var m = '';
    try { var j = JSON.parse(body); m = (j.error && (j.error.message || j.error.code)) || j.message || j.msg || ''; } catch (e) { m = String(body || '').slice(0, 200); }
    m = String(m);
    // matches providers' own error messages (some reply in Chinese); not interface text
    var quota = /quota|insufficient|balance|余额|额度|欠费|exceeded|limit/i.test(m);
    if (status === 401 || status === 403) return mkErr('auth', m, status);
    if (status === 402) return mkErr('quota', m, status);
    if (status === 429) return mkErr(quota ? 'quota' : 'rate', m, status);
    if (status === 404 || (status === 400 && /model/i.test(m))) return mkErr('model', m, status);
    if (status >= 500) return mkErr('server', m, status);
    return mkErr('bad_request', m, status);
  }
  var COOL_MS = { quota: 60 * MIN, rate: 2 * MIN, server: MIN, network: 2 * MIN, timeout: MIN, bad_request: 5 * MIN, empty: MIN, cut: 1, auth: Infinity, model: Infinity };
  function markCool(id, e) { cool[id] = { until: Date.now() + (COOL_MS[e.code] || MIN), code: e.code, msg: e.message }; }
  function cooling(id) { var c = cool[id]; if (c && c.until <= Date.now()) { delete cool[id]; c = null; } return c; }

  function why(code) { return I18N.has('err.' + code) ? t('err.' + code) : code; }
  function explain(e) {
    if (!e) return t('err.generic');
    if (e.code === 'no_key') return t('err.noKey');
    if (e.code === 'cancelled') return t('ask.stopped');
    if (e.code === 'bad_json') return t('err.badJson');
    if (e.code === 'all_failed' && e.items && e.items.length) {
      return t('err.allHead') + '\n' + e.items.map(function (x) { return t('err.allItem', { name: x.name, why: why(x.code) }); }).join('\n')
        + '\n' + t('err.allTail');
    }
    return I18N.has('err.' + (e && e.code)) ? why(e.code) : t('err.generic');
  }


  /* ---------- 消息整理：去掉空消息，合并连续同角色，第一条必须是 user ---------- */
  function tidy(msgs) {
    var out = [];
    (msgs || []).forEach(function (m) {
      if (!m || !m.content) return;
      var role = m.role === 'assistant' ? 'assistant' : 'user';
      if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n\n' + m.content;
      else out.push({ role: role, content: String(m.content) });
    });
    while (out.length && out[0].role !== 'user') out.shift();
    return out;
  }

  /* ---------- 读流式返回（SSE） ---------- */
  function readSSE(res, onData, onChunk) {
    var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
    function line(l) {
      l = l.replace(/\r$/, '');
      if (l.indexOf('data:') !== 0) return;
      var d = l.slice(5).trim();
      if (!d || d === '[DONE]') return;
      try { onData(JSON.parse(d)); } catch (e) { if (e && e.code) throw e; }
    }
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) { if (buf) line(buf); return; }
        onChunk();
        buf += dec.decode(r.value, { stream: true });
        var i;
        while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); }
        return pump();
      });
    }
    return pump();
  }

  /* ---------- 调一家 ---------- */
  function attempt(id, req, userSignal, onText) {
    var p = byId[id], c = cfg.p[id];
    var ac = new AbortController(), timedOut = false, timer = null;
    function arm(ms) { clearTimeout(timer); timer = setTimeout(function () { timedOut = true; ac.abort(); }, ms); }
    function onUserAbort() { ac.abort(); }
    if (userSignal) { if (userSignal.aborted) return Promise.reject(mkErr('cancelled')); userSignal.addEventListener('abort', onUserAbort); }
    arm(req.firstByteMs || 30000);

    var text = '', truncated = false;
    var base = c.base.replace(/\/+$/, '');
    var msgs = tidy(req.messages);
    var url, headers, body;
    if (p.kind === 'anthropic') {
      url = base + '/v1/messages';
      headers = { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
      body = { model: c.model, max_tokens: req.maxTokens || 1000, messages: msgs, stream: true };
      if (req.system) body.system = req.system;
    } else {
      url = base + '/chat/completions';
      headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key };
      body = { model: c.model, messages: (req.system ? [{ role: 'system', content: req.system }] : []).concat(msgs), stream: true, max_tokens: req.maxTokens || 1000 };
    }
    // 新一代模型可以先“思考”再回答。思考更周全，但慢，而且占字数上限。
    // req.think 为真（提问时打开“深度思考”）就明确打开；否则能关就关（生成十二面体、排计划用不着）。
    var extra = req.think ? p.think : p.noThink, usedExtra = false;
    if (extra && !req._plain && !plainOnly[id]) { for (var nk in extra) body[nk] = extra[nk]; usedExtra = true; }
    function add(t) { if (!t) return; text += t; if (onText) onText(text); }
    function data(j) {
      if (p.kind === 'anthropic') {
        if (j.type === 'content_block_delta' && j.delta) { if (j.delta.type === 'thinking_delta' && req.onThink) req.onThink(); add(j.delta.text); }
        else if (j.type === 'message_delta' && j.delta && j.delta.stop_reason === 'max_tokens') truncated = true;
        else if (j.type === 'error') throw fromHttp(j.error && /overload/i.test(j.error.type || '') ? 503 : 400, JSON.stringify(j));
      } else {
        if (j.error) throw fromHttp(Number(j.error.code) || 400, JSON.stringify(j));
        var ch = j.choices && j.choices[0];
        if (!ch) return;
        if (ch.delta) { if (ch.delta.reasoning_content && req.onThink) req.onThink(); add(ch.delta.content); }
        else if (ch.message) add(ch.message.content);
        if (ch.finish_reason === 'length') truncated = true;
      }
    }
    return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ac.signal }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw fromHttp(res.status, t); });
      arm(req.idleMs || 45000);
      var ct = res.headers.get('content-type') || '';
      if (res.body && /event-stream/i.test(ct)) return readSSE(res, data, function () { arm(req.idleMs || 45000); });
      return res.json().then(function (j) {            // 有的平台不支持流式，就直接给整段
        if (p.kind === 'anthropic') add((j.content || []).map(function (b) { return b.text || ''; }).join(''));
        else data(j);
      });
    }).then(function () {
      if (!text.trim()) throw mkErr(truncated ? 'cut' : 'empty');
      return { text: text, truncated: truncated, via: { id: id, name: p.name, model: c.model } };
    }, function (e) {
      if (userSignal && userSignal.aborted) { var x = mkErr('cancelled'); x.text = text; throw x; }
      if (usedExtra && e && e.code === 'bad_request' && !text) {   // 平台不认 thinking 参数：去掉再试一次
        plainOnly[id] = true; cleanup();
        var r2 = {}; for (var k in req) r2[k] = req[k]; r2._plain = true;
        return attempt(id, r2, userSignal, onText);
      }
      if (timedOut) throw mkErr('timeout');
      if (e && e.code) throw e;
      throw mkErr('network', e && e.message);
    }).then(function (r) { cleanup(); return r; }, function (e) { cleanup(); throw e; });
    function cleanup() { clearTimeout(timer); if (userSignal) userSignal.removeEventListener('abort', onUserAbort); }
  }

  /* ---------- 对外：问一次，失败就按顺序换 ---------- */
  // req: { system, messages, maxTokens, signal, onText(fullText), onSwitch(fromName, toName, why) }
  function chat(req) {
    var list = ready();
    if (!list.length) return Promise.reject(mkErr('no_key'));
    var fresh = [], soft = [], items = [];
    list.forEach(function (id) {
      var c = cooling(id);
      if (!c) fresh.push(id);
      else if (c.until !== Infinity) soft.push(id);    // 冷却中的放到最后再试
      else items.push({ id: id, name: byId[id].name, code: c.code });
    });
    var queue = fresh.concat(soft);
    function next(i, prev) {
      if (i >= queue.length) { var e = mkErr('all_failed'); e.items = items; return Promise.reject(e); }
      var id = queue[i];
      if (prev && req.onSwitch) req.onSwitch(byId[prev.id].name, byId[id].name, why(prev.code));
      return attempt(id, req, req.signal, req.onText).then(function (r) {
        delete cool[id]; lastUsed = id; return r;
      }, function (e) {
        if (e.code === 'cancelled') throw e;
        markCool(id, e);
        items.push({ id: id, name: byId[id].name, code: e.code, msg: e.message });
        return next(i + 1, { id: id, code: e.code });
      });
    }
    return next(0, null);
  }

  /* 要 JSON 的场合（比如排今天的计划） */
  function json(req) {
    return chat(req).then(function (r) {
      var o = parseLoose(r.text);
      if (!o) throw mkErr(r.truncated ? 'cut' : 'bad_json');
      if (r.truncated) o._partial = true;
      return o;
    });
  }
  /* 宽松地解析 AI 给的 JSON：去掉代码块标记和多余逗号；写到一半被截断时，把已经写完整的条目救回来 */
  function parseLoose(t) {
    t = String(t || '').replace(/```(?:json)?/gi, '');
    var s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s >= 0 && e > s) {
      var b = t.slice(s, e + 1);
      try { return JSON.parse(b); } catch (x) {}
      try { return JSON.parse(b.replace(/,\s*([}\]])/g, '$1')); } catch (x) {}
    }
    var a = t.indexOf('[');
    if (a < 0) return null;
    var items = [], depth = 0, start = -1, inStr = false, esc = false;
    for (var i = a + 1; i < t.length; i++) {
      var ch = t[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') { if (depth === 0) start = i; depth++; }
      else if (ch === '}') { depth--; if (depth === 0 && start >= 0) { try { items.push(JSON.parse(t.slice(start, i + 1))); } catch (x) {} start = -1; } }
      else if (ch === ']' && depth === 0) break;
    }
    if (!items.length) return null;
    var m = /"(\w+)"\s*:\s*\[$/.exec(t.slice(0, a + 1).replace(/\s+$/, ''));
    var o = {}; o[m ? m[1] : 'items'] = items; o._partial = true;
    return o;
  }

  /* 设置页的“测试”按钮：只测这一家 */
  function test(id) {
    var c = cfg.p[id];
    if (!c || !c.key) return Promise.resolve({ ok: false, msg: t('test.needKey') });
    if (!c.model) return Promise.resolve({ ok: false, msg: t('test.needModel') });
    if (!c.base) return Promise.resolve({ ok: false, msg: t('test.needBase') });
    var t0 = Date.now();
    return attempt(id, { messages: [{ role: 'user', content: t('ai.testPrompt') }], maxTokens: 800, firstByteMs: 20000 }, null, null)
      .then(function (r) { delete cool[id]; return { ok: true, ms: Date.now() - t0, text: r.text.trim().slice(0, 20) }; },
            function (e) { markCool(id, e); return { ok: false, code: e.code, msg: why(e.code) + (e.message && e.message !== e.code ? t('err.detail', { msg: String(e.message).slice(0, 80) }) : '') }; });
  }

  function current() {
    var list = ready();
    for (var i = 0; i < list.length; i++) if (!cooling(list[i])) return { id: list[i], name: byId[list[i]].name, model: cfg.p[list[i]].model };
    return list.length ? { id: list[0], name: byId[list[0]].name, model: cfg.p[list[0]].model, cooling: true } : null;
  }

  global.AI = {
    presets: PRESETS, byId: byId,
    config: function () { return cfg; },
    set: set, move: move, ready: ready, clearKeys: clearKeys,
    chat: chat, json: json, parseLoose: parseLoose, test: test, explain: explain, current: current,
    _cool: cool
  };
})(window);
