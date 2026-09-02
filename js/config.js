/* =====================================================================
 * 728 H5 × qp 棋牌后端 —— 对接配置
 * ---------------------------------------------------------------------
 * qp 后端（openinggame/qp）为 Golang 微服务，docker-compose 中：
 *   web    容器 80 端口（H5 站点）
 *   server 容器 81 端口（游戏网关 / API）
 * 请把下方地址改成你实际部署的 qp 网关地址，并把 enabled 置为 true。
 * 说明：目前 qp 仓库内仅有 DB + compose，接口契约以部署后实测为准，
 *       api.js / ws.js 中已用「假设契约 + TODO」标出需核对点。
 * ===================================================================== */
window.QP_CONFIG = {
  enabled: false,          // true = 对接 qp 真实后端；false = 保持本地模拟（演示不中断）

  env: 'dev',              // 'dev'（内网） | 'online'（线上）
  gateways: {
    dev:    'http://192.168.1.6:81',   // 内网 qp server 网关（改成本机/服务器 IP）
    online: 'https://api.example.com'  // 线上网关（经 nginx 反代到 qp server:81）
  },
  baseUrl: null,           // 运行时按 env 自动取，可在此手动覆盖
  wsUrl:   null,           // WebSocket 地址；默认 baseUrl 的 http->ws 并追加 /ws

  tokenKey: 'qp_token',    // 本地存储键
  userKey:  'qp_user',

  timeouts: { api: 10000, connect: 8000 },
  heartbeat: 30000         // WS 心跳间隔（毫秒）

  /* TODO(按 qp 实测核对)：
   *  - API 路由前缀（/api/user/login? /api/game/enter?）
   *  - 返回包格式：{code,msg,data} / {code:0} 兼容已内置
   *  - WS 路径与消息协议（心跳包、资产/房间推送字段）
   */
};
(function () {
  var c = window.QP_CONFIG;
  c.baseUrl = c.baseUrl || c.gateways[c.env];
  if (!c.wsUrl && c.baseUrl) c.wsUrl = c.baseUrl.replace(/^http/, 'ws') + '/ws';
})();
