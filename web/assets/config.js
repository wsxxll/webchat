// WebSocket 信令服务器配置
const WS_CONFIG = {
  // 服务器列表，按优先级排序
  servers: [
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws`
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

