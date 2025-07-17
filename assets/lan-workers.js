/**
 * 局域网模式 - Cloudflare Workers版本
 * 自动检测局域网环境并建立 P2P 连接
 */
class LANMode extends BaseChatMode {
    constructor(sendWebSocketMessage, isWebSocketConnected, connectToRoom) {
        super(sendWebSocketMessage, isWebSocketConnected, connectToRoom);
        
        this.initializeElements();
        this.bindEvents();
    }

    /**
     * 初始化DOM元素引用
     */
    initializeElements() {
        this.domElements = {
            ...this.initializeSharedElements(),
            lanStatus: document.getElementById('lanStatus')
        };
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        this.bindSharedEvents();
    }

    // 当WebSocket连接成功时调用
    onWebSocketConnected() {
        super.onWebSocketConnected();
        // 自动连接到局域网
        this.autoConnectToLAN();
    }

    async autoConnectToLAN() {
        const networkId = await this.getNetworkIdentifier();
        const defaultRoom = `lan_${networkId}`;
        
        console.log('自动连接到局域网房间:', defaultRoom);
        
        // 使用新的连接方法
        this.connectToRoom(defaultRoom);
    }

    async getNetworkIdentifier() {
        try {
            const [publicIP, localSegment] = await Promise.all([
                this.getPublicIP(),
                this.getLocalNetworkSegment()
            ]);
            
            if (publicIP && publicIP !== 'unknown') {
                const ipParts = publicIP.split('.');
                const publicId = ipParts.slice(0, 3).join('.');
                
                if (localSegment && localSegment !== 'default') {
                    return `${publicId}_${localSegment}`;
                } else {
                    return publicId;
                }
            }
            
            return localSegment || 'default';
        } catch (error) {
            console.error('获取网络标识符失败:', error);
            return 'default';
        }
    }
    
    async getPublicIP() {
        try {
            // 使用多个STUN服务器获取公网IP
            const stunServers = [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302'
            ];
            
            for (const server of stunServers) {
                try {
                    const ip = await this.getIPFromSTUN(server);
                    if (ip) return ip;
                } catch (error) {
                    continue;
                }
            }
            
            return 'unknown';
        } catch (error) {
            console.error('获取公网IP失败:', error);
            return 'unknown';
        }
    }
    
    async getIPFromSTUN(stunServer) {
        return new Promise((resolve, reject) => {
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: stunServer }]
            });
            
            const timeout = setTimeout(() => {
                pc.close();
                reject(new Error('STUN timeout'));
            }, 5000);
            
            pc.onicecandidate = (event) => {
                if (event.candidate && event.candidate.candidate) {
                    const parts = event.candidate.candidate.split(' ');
                    if (parts[7] === 'srflx') {
                        clearTimeout(timeout);
                        pc.close();
                        resolve(parts[4]);
                    }
                }
            };
            
            pc.createDataChannel('dummy');
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .catch(reject);
        });
    }
    
    async getLocalNetworkSegment() {
        try {
            const pc = new RTCPeerConnection({ iceServers: [] });
            pc.createDataChannel('dummy');
            
            await pc.createOffer().then(offer => pc.setLocalDescription(offer));
            
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    pc.close();
                    resolve('default');
                }, 2000);
                
                pc.onicecandidate = (event) => {
                    if (event.candidate && event.candidate.candidate) {
                        const parts = event.candidate.candidate.split(' ');
                        if (parts[7] === 'host') {
                            clearTimeout(timeout);
                            pc.close();
                            
                            const localIP = parts[4];
                            const segments = localIP.split('.');
                            resolve(segments.slice(0, 3).join('.'));
                        }
                    }
                };
            });
        } catch (error) {
            console.error('获取本地网段失败:', error);
            return 'default';
        }
    }
    
    // UI更新方法
    updateRoomUI() {
        if (this.domElements.lanStatus) {
            this.domElements.lanStatus.innerHTML = `
                <div class="lan-info">
                    <div class="info-item">
                        <span class="info-label">房间ID:</span>
                        <span class="info-value">${this.currentRoomId || '获取中...'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">在线用户:</span>
                        <span class="info-value">${this.roomUsers.size + 1}</span>
                    </div>
                </div>
            `;
        }
        
        // 启用聊天功能
        this.enableChat();
    }
    
    updateUserList() {
        console.log('更新用户列表:', this.roomUsers);
        
        // 显示在线用户数
        if (this.domElements.lanStatus) {
            const userCount = this.domElements.lanStatus.querySelector('.info-value:last-child');
            if (userCount) {
                userCount.textContent = this.roomUsers.size + 1;
            }
        }
        
        // 如果有用户，启用聊天
        if (this.roomUsers.size > 0) {
            this.enableChat();
            this.showNotification(`✅ 检测到 ${this.roomUsers.size} 个同网段用户`);
        } else {
            this.disableChat();
            this.showNotification('🔍 等待同网段用户加入...');
        }
    }
    
    enableChat() {
        this.domElements.messageInput.disabled = false;
        this.domElements.sendButton.disabled = false;
        this.domElements.attachButton.disabled = false;
        this.domElements.messageInput.placeholder = '输入消息...';
    }
    
    disableChat() {
        this.domElements.messageInput.disabled = true;
        this.domElements.sendButton.disabled = true;
        this.domElements.attachButton.disabled = true;
        this.domElements.messageInput.placeholder = '检测到同网段用户后即可开始聊天...';
    }
    
    showNotification(message) {
        console.log('局域网模式通知:', message);
        
        // 可以添加更丰富的通知UI
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    updateUserConnectionStatus(userId, isConnected) {
        const user = this.roomUsers.get(userId);
        if (user) {
            console.log(`用户 ${user.name} P2P连接状态:`, isConnected ? '已连接' : '已断开');
        }
    }
    
    cleanup() {
        super.cleanup();
        this.disableChat();
        
        if (this.domElements.lanStatus) {
            this.domElements.lanStatus.innerHTML = '';
        }
    }
}

// 导出到全局作用域
window.LANMode = LANMode;