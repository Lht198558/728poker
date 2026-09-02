/* =====================================================================
 * 728 H5 × qp 后端 —— WebSocket 长连接管理
 * 暴露：window.QP.ws（connect / send / request / close / on）
 * 特性：带 token 连接、心跳保活、断线指数退避重连、reqId 请求-响应、
 *       事件总线（业务侧 QP.on('assets'|'room'|'match'|..., fn) 订阅）
 * 协议按 qp 实测核对：消息统一 {type, data, reqId?}；心跳 type='ping'/'pong'
 * ===================================================================== */
(function () {
  var CFG = window.QP_CONFIG;
  var listeners = {};
  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
  function emit(ev, data) {
    var arr = listeners[ev];
    if (!arr) return;
    for (var i = 0; i < arr.length; i++) { try { arr[i](data); } catch (e) {} }
  }

  var ws = {
    sock: null,
    status: 'idle',        // idle | connecting | open | closed | error
    retry: 0,
    maxRetry: 12,
    alive: false,
    _ping: null,
    _reconnect: null,
    _pending: {},

    connect: function () {
      if (!CFG.enabled || !CFG.wsUrl) return;
      if (this.sock && (this.sock.readyState === 0 || this.sock.readyState === 1)) return;
      var url = CFG.wsUrl + (CFG.wsUrl.indexOf('?') >= 0 ? '&' : '?') +
                'token=' + encodeURIComponent((window.QP.auth && window.QP.auth.token()) || '');
      this.status = 'connecting';
      var self = this;
      var s;
      try { s = new WebSocket(url); } catch (e) { this.status = 'error'; this.scheduleReconnect(); return; }
      this.sock = s;

      s.onopen = function () { self.status = 'open'; self.retry = 0; self.startPing(); emit('open'); };
      s.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (e) { m = { type: 'raw', data: ev.data }; }
        self.dispatch(m);
      };
      s.onclose = function () { self.stopPing(); self.status = 'closed'; emit('close'); self.scheduleReconnect(); };
      s.onerror = function () { self.status = 'error'; };
    },

    /* 收到消息分发：reqId 响应 / 事件广播 / pong 保活 */
    dispatch: function (m) {
      if (!m || !m.type) return;
      if (m.reqId && this._pending[m.reqId]) {
        var p = this._pending[m.reqId]; delete this._pending[m.reqId];
        if (m.code === 0 || m.code === 200) p.resolve(m.data); else p.reject(new Error(m.msg || ('ws code ' + m.code)));
        return;
      }
      if (m.type === 'pong') { this.alive = true; return; }
      emit(m.type, ('data' in m) ? m.data : m);
    },

    send: function (type, data, reqId) {
      if (!this.sock || this.sock.readyState !== 1) return false;
      var p = { type: type };
      if (data) for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) p[k] = data[k];
      if (reqId) p.reqId = reqId;
      this.sock.send(JSON.stringify(p));
      return true;
    },

    /* 发请求并等响应 */
    request: function (type, data, timeout) {
      var self = this;
      return new Promise(function (resolve, reject) {
        var id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        self._pending[id] = { resolve: resolve, reject: reject };
        var ok = self.send(type, data, id);
        if (!ok) { delete self._pending[id]; reject(new Error('ws 未连接: ' + type)); return; }
        setTimeout(function () {
          if (self._pending[id]) { delete self._pending[id]; reject(new Error('ws 超时: ' + type)); }
        }, timeout || 8000);
      });
    },

    startPing: function () {
      var self = this;
      this.alive = true;
      this._ping = setInterval(function () {
        if (self.status !== 'open') return;
        if (!self.alive) { try { self.sock && self.sock.close(); } catch (e) {} return; }
        self.alive = false;
        self.send('ping', {});
      }, CFG.heartbeat || 30000);
    },
    stopPing: function () { clearInterval(this._ping); this._ping = null; },

    scheduleReconnect: function () {
      var self = this;
      clearTimeout(this._reconnect);
      if (this.retry >= this.maxRetry) return;
      var d = Math.min(30000, 1000 * Math.pow(2, this.retry++));
      this._reconnect = setTimeout(function () { self.connect(); }, d);
    },

    close: function () {
      this.stopPing();
      clearTimeout(this._reconnect);
      if (this.sock) { try { this.sock.onclose = null; this.sock.close(); } catch (e) {} }
      this.sock = null; this.status = 'closed';
    }
  };

  window.QP = window.QP || {};
  window.QP.ws = ws;
  window.QP.on = on;
})();
