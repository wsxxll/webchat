/**
 * 局域网模式 - 继承自BaseChatMode
 * 自动检测局域网环境并建立 P2P 连接
 */
class LANMode extends BaseChatMode {
    constructor(sendWebSocketMessage, isWebSocketConnected) {
        super(sendWebSocketMessage, isWebSocketConnected);
        
        this.initializeElements();
        this.bindEvents();
        
        // 初始化局域网模式
        this.initializeLANMode();
    }

    /**
     * 初始化DOM元素引用
     */
    initializeElements() {
        this.domElements = {
            ...this.initializeSharedElements()
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
        
        // 发送join消息
        if (this.currentRoomId && this.currentUserInfo) {
            this.sendWebSocketMessage({
                type: 'join',
                roomId: this.currentRoomId,
                userId: this.currentUserInfo.id,
                userInfo: this.currentUserInfo
            });
        }
    }

    // 在构造函数中调用，而不是等待WebSocket连接
    async initializeLANMode() {
        const networkId = await this.getNetworkIdentifier();
        const defaultRoom = `lan_${networkId}`;
        
        
        // 保存房间信息
        this.currentRoomId = defaultRoom;
        this.currentUserInfo = this.generateUserInfo();
        
        // 连接到WebSocket服务器（带房间ID）
        if (window.modeSelector) {
            window.modeSelector.connectToAvailableServer(defaultRoom);
        }
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
            const pc = new RTCPeerConnection(RTC_CONFIG);
            
            pc.createDataChannel('');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            return new Promise((resolve) => {
                let resolved = false;
                const timeout = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        pc.close();
                        resolve('unknown');
                    }
                }, 3000);
                
                pc.onicecandidate = (event) => {
                    if (!resolved && event.candidate) {
                        const candidate = event.candidate.candidate;
                        const ipMatch = candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
                        
                        if (ipMatch) {
                            const ip = ipMatch[0];
                            if (!this.isPrivateIP(ip)) {
                                resolved = true;
                                clearTimeout(timeout);
                                pc.close();
                                resolve(ip);
                            }
                        }
                    }
                };
            });
        } catch (error) {
            console.error('获取公网IP失败:', error);
            return 'unknown';
        }
    }
    
    async getLocalNetworkSegment() {
        try {
            const pc = new RTCPeerConnection(RTC_CONFIG);
            
            pc.createDataChannel('');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            return new Promise((resolve) => {
                let resolved = false;
                const timeout = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        pc.close();
                        resolve('default');
                    }
                }, 3000);
                
                pc.onicecandidate = (event) => {
                    if (!resolved && event.candidate) {
                        const candidate = event.candidate.candidate;
                        const ipMatch = candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
                        
                        if (ipMatch) {
                            const ip = ipMatch[0];
                            if (this.isPrivateIP(ip)) {
                                const parts = ip.split('.');
                                const segment = parts.slice(0, 3).join('.');
                                resolved = true;
                                clearTimeout(timeout);
                                pc.close();
                                resolve(segment);
                            }
                        }
                    }
                };
            });
        } catch (error) {
            console.error('获取本地网段失败:', error);
            return 'default';
        }
    }
    
    isPrivateIP(ip) {
        const parts = ip.split('.').map(Number);
        return (
            (parts[0] === 10) ||
            (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
            (parts[0] === 192 && parts[1] === 168) ||
            (parts[0] === 127)
        ) || ip.startsWith('::1') || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd');
    }

    handleJoinedRoom(data) {
        if (data.roomId) {
            this.currentRoomId = data.roomId;
        }
        
        const users = data.users || [];
        const usersInfo = data.usersInfo || {};
        
        
        this.roomUsers.clear();
        this.roomUsers.set(this.currentUserId, this.currentUserInfo);
        
        for (const [userId, userInfo] of Object.entries(usersInfo)) {
            if (userId !== this.currentUserId) {
                this.roomUsers.set(userId, userInfo);
            }
        }
        
        this.domElements.messageInput.disabled = false;
        this.domElements.sendButton.disabled = false;
        this.domElements.attachButton.disabled = false;
        this.domElements.messageInput.placeholder = '输入消息...';
        
        this.updateUserList();
        this.updateConnectionStatus('connected');
        
        users.forEach(userId => {
            if (userId !== this.currentUserId) {
                this.createPeerConnection(userId, true);
            }
        });
    }

    updateConnectionStatus(status) {
        const statusElement = this.domElements.connectionStatus;
        statusElement.className = 'connection-status';
        
        let statusHtml = '';
        
        switch (status) {
            case 'connected':
                statusElement.classList.add('status-connected');
                
                let roomInfo = '';
                
                if (this.currentRoomId) {
                    const userCount = this.roomUsers.size;
                    roomInfo = `
                        <div class="status-room-info">
                            <span class="room-name">局域网房间</span>
                            <span class="room-separator">·</span>
                            <span class="room-users">同网段用户 ${userCount}</span>
                        </div>
                    `;
                }
                
                statusHtml = `
                    <div class="status-content">
                        ${roomInfo}
                        <div class="status-indicator">
                            <span class="status-dot"></span>
                            <span class="status-text">已连接</span>
                        </div>
                    </div>
                `;
                break;
            case 'disconnected':
                statusElement.classList.add('status-disconnected');
                statusHtml = `
                    <div class="status-content">
                        <div class="status-indicator">
                            <span class="status-dot"></span>
                            <span class="status-text">未连接</span>
                        </div>
                    </div>
                `;
                break;
            case 'error':
                statusElement.classList.add('status-error');
                statusHtml = `
                    <div class="status-content">
                        <div class="status-indicator">
                            <span class="status-dot"></span>
                            <span class="status-text">连接错误</span>
                        </div>
                    </div>
                `;
                break;
        }
        
        statusElement.innerHTML = statusHtml;
    }

}

// 导出类供使用
window.LANMode = LANMode;