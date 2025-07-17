// WebSocket 信令服务器配置
const WS_CONFIG = {
  // 服务器列表，按优先级排序
  servers: [
    // Cloudflare Workers 后端
    'wss://webchat.wsxxll.workers.dev/ws',
    // 备用服务器
    'wss://chat.canghai.org'
  ],
  
  // 连接设置
  heartbeatInterval: 30000,  // 心跳间隔：30秒
  reconnectDelay: 3000,      // 重连延迟：3秒
  maxReconnectAttempts: 5,   // 最大重连次数
  serverSwitchDelay: 2000    // 服务器切换延迟：2秒
};

// WebRTC 配置
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// 房间设置
const ROOM_CONFIG = {
  maxUsersLan: 50,        // 局域网最大用户数
  maxUsersInternet: 20    // 公网最大用户数
};