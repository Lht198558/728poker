/* =====================================================================
 * 728 H5 × qp 业务桥（bridge）
 * 负责把 728 前端的登录态 / 余额 / 游戏入口 与 qp 后端打通。
 * 依赖：config.js / api.js / ws.js 与页面内联脚本中的 $ / state / toast 等
 *       （仅在方法被调用时引用，加载阶段不执行任何页面逻辑）。
 * 未启用 qp 或未登录时，所有方法自动回退到 728 本地模拟，不影响演示。
 * ===================================================================== */
(function () {
  window.QP = window.QP || {};

  function api()  { return window.QP.api || null; }
  function auth() { return window.QP.auth || null; }
  function cfg()  { return window.QP_CONFIG || null; }
  function isLive() {
    var a = api(); var t = auth();
    return !!(a && a.isConfigured && a.isConfigured() && t && t.token());
  }

  window.QP.bridge = {
    /* 把 qp 登录返回的 user 落到 728 的 state */
    applyAuth: function (data) {
      var u = (data && (data.user || data)) || {};
      if (!u) return;
      if (u.id || u.uid)  state.id   = u.id || u.uid;
      if (u.nick || u.nickname || u.account) state.nick = u.nick || u.nickname || u.account;
      if (u.phone)        state.phone = u.phone;
      if (u.coins !== undefined) state.beans = u.coins;
      if (u.gems  !== undefined) state.gems  = u.gems;
      if (u.cards !== undefined) state.cards = u.cards;
    },

    /* 登录成功后：连 WS → 关弹窗 → 进大厅 → 拉余额 */
    afterLogin: function () {
      var w = window.QP.ws; if (w) w.connect();
      if (typeof closeModal === 'function') closeModal('modal-login');
      toast('登录成功，欢迎回来', '🎉');
      Sound.success();
      goHome();
      this.refreshBalance();
    },

    /* 拉取并刷新 金币/元宝 显示 */
    refreshBalance: function () {
      if (!isLive()) return;
      api().balance().then(function (b) {
        var d = (b && (b.data || b)) || {};
        if (d.coins !== undefined) state.beans = d.coins;
        if (d.gems  !== undefined) state.gems  = d.gems;
        if (d.cards !== undefined) state.cards = d.cards;
        var bn = document.getElementById('home-beans'); if (bn) bn.textContent = state.beans;
        var gm = document.getElementById('home-gems');  if (gm) gm.textContent = state.gems;
      }).catch(function () {});
    },

    /* 大厅游戏入口统一接管：game-fish / game-poker / game-slot */
    handleGame: function (action) {
      var map = {
        'game-fish':  { id: 'fish',  label: '全民捕鱼', mock: '全民捕鱼：正在进入渔场…',    icon: '🐟' },
        'game-poker': { id: 'poker', label: '棋牌',     mock: '棋牌：房间列表开发中…',      icon: '🃏' },
        'game-slot':  { id: 'slot',  label: '街机',     mock: '街机：JACKPOT 777 即将开启…', icon: '🎰' }
      };
      var m = map[action];
      if (!m) return;
      if (isLive()) {
        Sound.coin();
        toast('正在进入「' + m.label + '」…', '⏳');
        api().enterGame(m.id).then(function (res) {
          window.QP.bridge.openGame(res, m.label);
        }).catch(function (err) {
          toast('进入失败：' + ((err && err.message) || '网络错误'), '⚠️');
          Sound.error();
        });
      } else {
        // 本地模拟（未对接 / 未登录 / 后端不可达）
        toast(m.mock, m.icon);
        Sound.coin();
      }
    },

    /* 打开 qp 子游戏：iframe 嵌入；后端标记 redirect 则整页跳转 */
    openGame: function (res, label) {
      if (!res || !res.url) { toast('未获取到游戏地址', '⚠️'); return; }
      if (res.mode === 'redirect') { location.href = res.url; return; }
      var wrap = document.getElementById('qp-frame');
      var ifr  = document.getElementById('qp-frame-iframe');
      var t    = document.getElementById('qp-frame-title');
      if (t) t.textContent = label || '游戏';
      if (ifr) { ifr.src = res.url; }
      if (wrap) wrap.classList.add('open');
      if (window.Sound) Sound.whoosh();
    },

    closeGame: function () {
      var wrap = document.getElementById('qp-frame');
      var ifr  = document.getElementById('qp-frame-iframe');
      if (ifr) ifr.src = 'about:blank';
      if (wrap) wrap.classList.remove('open');
    },

    /* 退出登录 */
    logout: function () {
      var a = auth(); if (a) a.clear();
      var w = window.QP.ws; if (w) w.close();
    },

    /* 页面启动：若已有登录态则恢复连接并刷新资产 */
    boot: function () {
      if (!isLive()) return;
      var w = window.QP.ws; if (w) w.connect();
      this.refreshBalance();
    }
  };

  /* 子游戏浮层「返回大厅」 */
  document.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el !== document) {
      if (el.getAttribute && el.getAttribute('data-qp-close') !== null) {
        if (window.QP && window.QP.bridge) window.QP.bridge.closeGame();
        return;
      }
      el = el.parentNode;
    }
  });
})();
