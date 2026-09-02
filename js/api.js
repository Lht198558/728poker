/* =====================================================================
 * 728 H5 × qp 后端 —— HTTP API 客户端（fetch + 轻封装）
 * 暴露：window.QP.api.*
 * 未启用或后端不可达时返回 null / 抛错，由上层回退本地模拟。
 * ===================================================================== */
(function () {
  var CFG = window.QP_CONFIG;

  function token() { try { return localStorage.getItem(CFG.tokenKey) || ''; } catch (e) { return ''; } }

  function jsonHeaders() {
    var h = { 'Content-Type': 'application/json' };
    var t = token();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  function request(path, method, body) {
    var url = CFG.baseUrl + path;
    var opt = { method: method || 'GET', headers: jsonHeaders() };
    if (body !== undefined && body !== null) opt.body = JSON.stringify(body);
    // 超时：AbortSignal.timeout 现代浏览器支持
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
      opt.signal = AbortSignal.timeout(CFG.timeouts.api || 10000);
    }
    return fetch(url, opt).then(function (r) {
      return r.text().then(function (text) {
        var data = null;
        try { data = JSON.parse(text); } catch (e) { data = { code: r.status, msg: text }; }
        if (!r.ok) { var e2 = new Error((data && (data.msg || data.message)) || ('HTTP ' + r.status)); e2.code = (data && data.code) || r.status; throw e2; }
        // 兼容 {code:0,data} / {code:200,data} / 直接返回体
        if (data && typeof data === 'object' && ('code' in data)) {
          if (data.code === 0 || data.code === 200) return ('data' in data) ? data.data : data;
          var e3 = new Error(data.msg || data.message || ('code ' + data.code)); e3.code = data.code; throw e3;
        }
        return data;
      });
    });
  }

  function isConfigured() { return !!(CFG.enabled && CFG.baseUrl); }

  window.QP = window.QP || {};
  window.QP.api = {
    isConfigured: isConfigured,

    /* ---- 账号 ---- */
    // 账号密码登录 -> {token, user:{id,nick,phone,icon}, assets:{coins,gems}}
    login: function (account, password) {
      // TODO: 路径与字段按 qp 实测核对
      return request('/api/user/login', 'POST', { account: account, password: password })
        .then(saveAuth);
    },
    // 注册 -> {token, user}
    register: function (payload) {
      return request('/api/user/register', 'POST', payload).then(saveAuth);
    },
    // 游客登录（若 qp 支持游客）-> {token, user}
    guestLogin: function (deviceId) {
      return request('/api/user/guest', 'POST', { deviceId: deviceId }).then(saveAuth);
    },

    /* ---- 资料 / 资产 ---- */
    profile: function () { return request('/api/user/profile', 'GET'); },
    // 金币/房卡余额 -> {coins:0, gems:0, cards:0}（字段按实测调整）
    balance: function () { return request('/api/user/assets', 'GET'); },

    /* ---- 进入游戏 ---- */
    // 点击捕鱼/棋牌/街机时调用 -> 归一化为 {mode:'iframe'|'redirect', url}
    enterGame: function (gameId, payload) {
      return request('/api/game/enter', 'POST', Object.assign({ gameId: gameId }, payload || {}))
        .then(resolveEnter);
    }
  };

  /* ---- 内部：登录态存取 / 进入结果归一化 ---- */
  function saveAuth(d) {
    if (!d) return d;
    var u = d.user || d;
    var tok = d.token || d.accessToken || (d.data && d.data.token);
    if (tok) { try { localStorage.setItem(CFG.tokenKey, tok); } catch (e) {} }
    if (u) { try { localStorage.setItem(CFG.userKey, JSON.stringify(u)); } catch (e) {} }
    return d;
  }
  function resolveEnter(d) {
    if (!d) return null;
    if (typeof d === 'string') return { mode: 'iframe', url: d };
    if (d.url) return { mode: d.mode || 'iframe', url: d.url };
    // 若只返回 roomId：拼装一个可替换的访问地址（按 qp 前端路由调整）
    if (d.roomId) {
      var host = String(CFG.baseUrl).replace(/:(\d+)\/?$/, '');
      return { mode: 'iframe', url: host + '/game/room?roomId=' + d.roomId + '&token=' + encodeURIComponent(token()) };
    }
    return null;
  }

  window.QP.auth = {
    token: token,
    user: function () { try { var s = localStorage.getItem(CFG.userKey); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
    clear: function () { try { localStorage.removeItem(CFG.tokenKey); localStorage.removeItem(CFG.userKey); } catch (e) {} }
  };
})();
