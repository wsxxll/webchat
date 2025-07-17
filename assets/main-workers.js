/**
 * 模式选择器 - Cloudflare Workers版本
 * 修改了WebSocket连接逻辑以支持Durable Objects
 */
class ModeSelector {
    constructor() {
        // 模式状态
        this.currentMode = 'lan';
        this.chatModeInstance = null;
        this.isInitialized = false;
        
        // WebSocket连接状态
        this.websocket = null;
        this.isWebSocketConnected = false;
        this.reconnectionAttempts = 0;
        this.currentServerIndex = 0;
        this.availableServers = [];
        this.heartbeatTimer = null;
        this.currentRoomId = null;
        
        // 等待DOM加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    async init() {
        this.initializeElements();
        this.bindEvents();
        
        // 获取可用服务器列表
        this.availableServers = WS_CONFIG.servers.map((server, index) => {
            if (typeof server === 'string') {
                return { url: server, priority: index + 1 };
            }
            return server;
        });
        
        // 默认加载局域网模式
        await this.loadMode('lan');
        this.isInitialized = true;
    }
    
    /**
     * 初始化DOM元素引用
     */
    initializeElements() {
        this.elements = {
            lanModeButton: document.getElementById('lanMode'),
            internetModeButton: document.getElementById('internetMode'),
            internetRoomControls: document.getElementById('internetRoomControls'),
            lanStatus: document.getElementById('lanStatus')
        };
    }
    
    /**
     * 绑定事件监听器
     */
    bindEvents() {
        this.elements.lanModeButton.addEventListener('click', () => this.switchMode('lan'));
        this.elements.internetModeButton.addEventListener('click', () => this.switchMode('internet'));
    }
    
    // 连接到指定房间
    async connectToRoom(roomId) {
        if (this.currentRoomId === roomId && this.isWebSocketConnected) {
            console.log('已连接到房间:', roomId);
            return;
        }
        
        // 断开现有连接
        if (this.websocket) {
            this.disconnect();
        }
        
        this.currentRoomId = roomId;
        this.currentServerIndex = 0;
        this.tryNextServer();
    }
    
    tryNextServer() {
        if (this.currentServerIndex >= this.availableServers.length) {
            this.showNotification('❌ 所有服务器都不可用');
            this.currentServerIndex = 0;
            setTimeout(() => this.tryNextServer(), WS_CONFIG.reconnectDelay);
            return;
        }
        
        const server = this.availableServers[this.currentServerIndex];
        const serverUrl = server.url;
        console.log(`尝试连接服务器 ${this.currentServerIndex + 1}/${this.availableServers.length}: ${server.name || serverUrl}`);
        this.showNotification(`🔄 连接到 ${server.name || '服务器'}...`);
        this.connectWebSocket(serverUrl);
    }
    
    connectWebSocket(serverUrl) {
        try {
            // 构建包含房间ID的WebSocket URL
            const url = new URL(serverUrl);
            if (this.currentRoomId) {
                url.searchParams.set('room', this.currentRoomId);
            }
            
            this.websocket = new WebSocket(url.toString());
            
            this.websocket.onopen = () => {
                console.log('WebSocket已连接到:', url.toString());
                this.isWebSocketConnected = true;
                this.reconnectionAttempts = 0;
                this.showNotification('✅ 已连接到信令服务器');
                this.startHeartbeat();
                
                // 通知当前模式WebSocket已连接
                if (this.chatModeInstance && this.chatModeInstance.onWebSocketConnected) {
                    this.chatModeInstance.onWebSocketConnected();
                }
            };
            
            this.websocket.onmessage = (event) => {
                const message = JSON.parse(event.data);
                
                // 处理连接确认消息
                if (message.type === 'connected') {
                    console.log('收到连接确认:', message);
                    // 发送加入房间消息
                    if (this.chatModeInstance && this.currentRoomId) {
                        this.chatModeInstance.handleRoomConnection(this.currentRoomId);
                    }
                } else {
                    // 将消息转发给当前模式处理
                    if (this.chatModeInstance && this.chatModeInstance.handleWebSocketMessage) {
                        this.chatModeInstance.handleWebSocketMessage(message);
                    }
                }
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket错误:', error);
                this.showNotification('❌ 连接错误，尝试下一个服务器...');
            };
            
            this.websocket.onclose = (event) => {
                console.log('WebSocket已断开:', event.code, event.reason);
                this.isWebSocketConnected = false;
                this.stopHeartbeat();
                
                // 通知当前模式WebSocket已断开
                if (this.chatModeInstance && this.chatModeInstance.onWebSocketDisconnected) {
                    this.chatModeInstance.onWebSocketDisconnected();
                }
                
                // 尝试下一个服务器
                if (!event.wasClean) {
                    this.currentServerIndex++;
                    setTimeout(() => this.tryNextServer(), WS_CONFIG.serverSwitchDelay);
                }
            };
        } catch (error) {
            console.error('创建WebSocket连接失败:', error);
            this.currentServerIndex++;
            setTimeout(() => this.tryNextServer(), WS_CONFIG.serverSwitchDelay);
        }
    }
    
    // 发送消息到WebSocket
    sendWebSocketMessage(message) {
        if (!this.isWebSocketConnected || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            console.warn('WebSocket未连接，无法发送消息');
            return false;
        }
        
        try {
            this.websocket.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('发送WebSocket消息失败:', error);
            return false;
        }
    }
    
    // 心跳机制
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.isWebSocketConnected) {
                this.sendWebSocketMessage({ type: 'heartbeat' });
            }
        }, WS_CONFIG.heartbeatInterval);
    }
    
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    
    // 断开WebSocket连接
    disconnect() {
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        this.isWebSocketConnected = false;
        this.stopHeartbeat();
        this.currentRoomId = null;
    }
    
    // 切换模式
    async switchMode(mode) {
        if (mode === this.currentMode) return;
        
        console.log(`切换模式: ${this.currentMode} -> ${mode}`);
        
        // 清理当前模式
        if (this.chatModeInstance && this.chatModeInstance.cleanup) {
            this.chatModeInstance.cleanup();
        }
        
        // 更新UI
        this.updateModeUI(mode);
        
        // 加载新模式
        this.currentMode = mode;
        await this.loadMode(mode);
    }
    
    // 加载指定模式
    async loadMode(mode) {
        try {
            // 动态加载模式文件
            if (!window.LANMode || !window.InternetMode) {
                await this.loadModeScripts();
            }
            
            // 创建模式实例
            if (mode === 'lan') {
                this.chatModeInstance = new window.LANMode(
                    (msg) => this.sendWebSocketMessage(msg),
                    this.isWebSocketConnected,
                    (roomId) => this.connectToRoom(roomId)
                );
            } else {
                this.chatModeInstance = new window.InternetMode(
                    (msg) => this.sendWebSocketMessage(msg),
                    this.isWebSocketConnected,
                    (roomId) => this.connectToRoom(roomId)
                );
            }
            
            // 如果已连接，通知新模式
            if (this.isWebSocketConnected && this.chatModeInstance.onWebSocketConnected) {
                this.chatModeInstance.onWebSocketConnected();
            }
        } catch (error) {
            console.error(`加载${mode}模式失败:`, error);
            this.showNotification(`❌ 加载${mode}模式失败`);
        }
    }
    
    // 动态加载模式脚本
    async loadModeScripts() {
        const scripts = ['lan.js', 'net.js'];
        
        for (const script of scripts) {
            await new Promise((resolve, reject) => {
                const scriptElement = document.createElement('script');
                scriptElement.src = `assets/${script}`;
                scriptElement.onload = resolve;
                scriptElement.onerror = reject;
                document.head.appendChild(scriptElement);
            });
        }
    }
    
    // 更新模式UI
    updateModeUI(mode) {
        // 更新按钮状态
        this.elements.lanModeButton.classList.toggle('active', mode === 'lan');
        this.elements.internetModeButton.classList.toggle('active', mode === 'internet');
        
        // 显示/隐藏相应的控制区域
        this.elements.internetRoomControls.style.display = mode === 'internet' ? 'block' : 'none';
        this.elements.lanStatus.style.display = mode === 'lan' ? 'block' : 'none';
        
        // 更新输入框提示
        const messageInput = document.getElementById('messageInput');
        if (mode === 'lan') {
            messageInput.placeholder = '检测到同网段用户后即可开始聊天...';
        } else {
            messageInput.placeholder = '加入房间后即可开始聊天...';
        }
    }
    
    // 显示通知
    showNotification(message) {
        console.log('通知:', message);
        
        // 更新连接状态显示
        const statusElement = document.getElementById('connectionStatus');
        const statusText = statusElement.querySelector('.status-text');
        const statusDetails = statusElement.querySelector('.status-details');
        
        if (statusText) {
            if (message.includes('✅')) {
                statusElement.className = 'connection-status status-connected';
                statusText.textContent = '已连接';
            } else if (message.includes('🔄')) {
                statusElement.className = 'connection-status status-connecting';
                statusText.textContent = '连接中';
            } else if (message.includes('❌')) {
                statusElement.className = 'connection-status status-disconnected';
                statusText.textContent = '未连接';
            }
        }
        
        if (statusDetails) {
            statusDetails.textContent = message.replace(/[✅🔄❌]/g, '').trim();
        }
    }
}

// 基础聊天模式类
class BaseChatMode {
    constructor(sendWebSocketMessage, isWebSocketConnected, connectToRoom) {
        this.sendWebSocketMessage = sendWebSocketMessage;
        this.isWebSocketConnected = isWebSocketConnected;
        this.connectToRoom = connectToRoom;
        
        // 用户和连接管理
        this.currentUserInfo = null;
        this.currentRoomId = null;
        this.roomUsers = new Map();
        this.peerConnections = new Map();
        this.messageQueue = [];
        
        // 事件处理器缓存
        this.eventHandlers = new Map();
    }
    
    // 处理房间连接确认
    handleRoomConnection(roomId) {
        this.currentRoomId = roomId;
        
        // 生成用户信息
        this.currentUserInfo = this.generateUserInfo();
        
        // 发送加入消息
        this.sendWebSocketMessage({
            type: 'join',
            room: roomId,
            userId: this.currentUserInfo.id,
            userInfo: this.currentUserInfo
        });
    }
    
    // 子类需要实现的方法
    onWebSocketConnected() {
        console.log('WebSocket已连接');
    }
    
    onWebSocketDisconnected() {
        console.log('WebSocket已断开');
        this.cleanup();
    }
    
    cleanup() {
        // 关闭所有P2P连接
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
        this.roomUsers.clear();
        this.currentRoomId = null;
    }
    
    // 生成用户信息
    generateUserInfo() {
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const names = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank', 'Grace', 'Henry'];
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#DDA0DD', '#98D8C8', '#F7DC6F'];
        
        return {
            id: userId,
            name: names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 1000),
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`,
            color: colors[Math.floor(Math.random() * colors.length)]
        };
    }
    
    // 处理WebSocket消息
    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'joined':
                this.handleJoined(message);
                break;
            case 'user-joined':
                this.handleUserJoined(message);
                break;
            case 'user-left':
                this.handleUserLeft(message);
                break;
            case 'user-list':
                this.handleUserList(message);
                break;
            case 'offer':
            case 'answer':
            case 'ice-candidate':
                this.handleWebRTC(message);
                break;
            case 'error':
                this.handleError(message);
                break;
            case 'heartbeat-ack':
                // 心跳响应，忽略
                break;
            default:
                console.warn('未知消息类型:', message.type);
        }
    }
    
    handleJoined(message) {
        console.log('成功加入房间:', message);
        this.showNotification(`✅ 已加入房间: ${message.roomId}`);
        this.updateRoomUI();
    }
    
    handleUserJoined(message) {
        console.log('用户加入:', message);
        const userInfo = message.userInfo;
        this.roomUsers.set(userInfo.id, userInfo);
        this.updateUserList();
        this.showNotification(`👤 ${userInfo.name} 加入了房间`);
        
        // 主动发起P2P连接
        if (userInfo.id !== this.currentUserInfo.id) {
            this.createPeerConnection(userInfo.id, true);
        }
    }
    
    handleUserLeft(message) {
        const user = this.roomUsers.get(message.userId);
        if (user) {
            this.showNotification(`👤 ${user.name} 离开了房间`);
            this.roomUsers.delete(message.userId);
            this.closePeerConnection(message.userId);
            this.updateUserList();
        }
    }
    
    handleUserList(message) {
        this.roomUsers.clear();
        Object.entries(message.users).forEach(([userId, userInfo]) => {
            if (userId !== this.currentUserInfo?.id) {
                this.roomUsers.set(userId, userInfo);
            }
        });
        this.updateUserList();
    }
    
    handleError(message) {
        console.error('服务器错误:', message);
        this.showNotification(`❌ ${message.message}`);
    }
    
    // WebRTC相关方法
    async createPeerConnection(targetUserId, isInitiator) {
        if (this.peerConnections.has(targetUserId)) {
            return this.peerConnections.get(targetUserId);
        }
        
        const pc = new RTCPeerConnection(RTC_CONFIG);
        this.peerConnections.set(targetUserId, pc);
        
        // 设置事件处理器
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendWebSocketMessage({
                    type: 'ice-candidate',
                    targetUserId: targetUserId,
                    candidate: event.candidate
                });
            }
        };
        
        pc.ondatachannel = (event) => {
            this.setupDataChannel(event.channel, targetUserId);
        };
        
        if (isInitiator) {
            const channel = pc.createDataChannel('chat');
            this.setupDataChannel(channel, targetUserId);
            
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            this.sendWebSocketMessage({
                type: 'offer',
                targetUserId: targetUserId,
                offer: offer
            });
        }
        
        return pc;
    }
    
    setupDataChannel(channel, userId) {
        channel.onopen = () => {
            console.log('数据通道已打开:', userId);
            this.updateUserConnectionStatus(userId, true);
        };
        
        channel.onclose = () => {
            console.log('数据通道已关闭:', userId);
            this.updateUserConnectionStatus(userId, false);
        };
        
        channel.onmessage = (event) => {
            this.handleDataChannelMessage(event.data, userId);
        };
        
        // 保存数据通道引用
        const pc = this.peerConnections.get(userId);
        if (pc) {
            pc.dataChannel = channel;
        }
    }
    
    async handleWebRTC(message) {
        const { userId, targetUserId } = message;
        
        // 确保消息是发给我们的
        if (targetUserId && targetUserId !== this.currentUserInfo.id) {
            return;
        }
        
        let pc = this.peerConnections.get(userId);
        
        if (message.type === 'offer') {
            if (!pc) {
                pc = await this.createPeerConnection(userId, false);
            }
            
            await pc.setRemoteDescription(message.offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            this.sendWebSocketMessage({
                type: 'answer',
                targetUserId: userId,
                answer: answer
            });
        } else if (message.type === 'answer') {
            if (pc) {
                await pc.setRemoteDescription(message.answer);
            }
        } else if (message.type === 'ice-candidate') {
            if (pc) {
                await pc.addIceCandidate(message.candidate);
            }
        }
    }
    
    closePeerConnection(userId) {
        const pc = this.peerConnections.get(userId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(userId);
        }
    }
    
    // UI更新方法
    updateUserList() {
        // 子类实现
    }
    
    updateRoomUI() {
        // 子类实现
    }
    
    updateUserConnectionStatus(userId, isConnected) {
        // 子类实现
    }
    
    showNotification(message) {
        // 子类实现
    }
    
    handleDataChannelMessage(data, userId) {
        // 子类实现
    }
    
    // 共享的DOM元素初始化
    initializeSharedElements() {
        return {
            chatMessages: document.getElementById('chatMessages'),
            messageInput: document.getElementById('messageInput'),
            sendButton: document.getElementById('sendBtn'),
            attachButton: document.getElementById('attachBtn'),
            fileInput: document.getElementById('fileInput')
        };
    }
    
    // 共享的事件绑定
    bindSharedEvents() {
        if (this.domElements.sendButton) {
            this.domElements.sendButton.addEventListener('click', () => this.sendMessage());
        }
        
        if (this.domElements.messageInput) {
            this.domElements.messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
        
        if (this.domElements.attachButton) {
            this.domElements.attachButton.addEventListener('click', () => {
                this.domElements.fileInput.click();
            });
        }
        
        if (this.domElements.fileInput) {
            this.domElements.fileInput.addEventListener('change', (e) => {
                this.handleFileSelect(e);
            });
        }
    }
    
    sendMessage() {
        const input = this.domElements.messageInput;
        const message = input.value.trim();
        
        if (!message) return;
        
        // 显示自己的消息
        this.displayMessage({
            type: 'text',
            content: message,
            userId: this.currentUserInfo.id,
            userInfo: this.currentUserInfo,
            timestamp: Date.now()
        });
        
        // 发送给所有连接的用户
        this.broadcast({
            type: 'text',
            content: message,
            userId: this.currentUserInfo.id,
            userInfo: this.currentUserInfo,
            timestamp: Date.now()
        });
        
        input.value = '';
    }
    
    broadcast(data) {
        const message = JSON.stringify(data);
        
        this.peerConnections.forEach((pc, userId) => {
            if (pc.dataChannel && pc.dataChannel.readyState === 'open') {
                try {
                    pc.dataChannel.send(message);
                } catch (error) {
                    console.error(`发送消息给 ${userId} 失败:`, error);
                }
            }
        });
    }
    
    handleDataChannelMessage(data, userId) {
        try {
            const message = JSON.parse(data);
            this.displayMessage(message);
        } catch (error) {
            console.error('解析消息失败:', error);
        }
    }
    
    displayMessage(message) {
        const messagesContainer = this.domElements.chatMessages;
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${message.userId === this.currentUserInfo.id ? 'own-message' : ''}`;
        
        const time = new Date(message.timestamp).toLocaleTimeString();
        
        messageElement.innerHTML = `
            <div class="message-header">
                <img class="user-avatar" src="${message.userInfo.avatar}" alt="${message.userInfo.name}">
                <span class="user-name" style="color: ${message.userInfo.color}">${message.userInfo.name}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-content">${this.escapeHtml(message.content)}</div>
        `;
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    handleFileSelect(event) {
        // 文件处理逻辑
        console.log('文件选择:', event.target.files);
    }
}

// 初始化
const modeSelector = new ModeSelector();