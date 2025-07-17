/**
 * 公网模式 - Cloudflare Workers版本
 * 支持手动输入房间号连接到公网用户
 */
class InternetMode extends BaseChatMode {
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
            roomInput: document.getElementById('roomInput'),
            joinButton: document.getElementById('joinBtn'),
            leaveButton: document.getElementById('leaveBtn')
        };
    }

    bindEvents() {
        this.bindSharedEvents();
        
        this.domElements.joinButton.addEventListener('click', () => this.joinRoom());
        this.domElements.leaveButton.addEventListener('click', () => this.leaveRoom());
        
        this.domElements.roomInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
    }

    // 当WebSocket连接成功时调用
    onWebSocketConnected() {
        super.onWebSocketConnected();
        this.showNotification('✅ 已连接到信令服务器');
    }

    joinRoom() {
        const roomId = this.domElements.roomInput.value.trim();
        if (!roomId) {
            this.showNotification('请输入房间号');
            return;
        }
        
        // 使用新的连接方法
        this.connectToRoom(roomId);
    }

    leaveRoom() {
        if (!this.currentRoomId) return;
        
        this.sendWebSocketMessage({
            type: 'leave',
            room: this.currentRoomId
        });
        
        // 断开WebSocket连接
        this.cleanup();
        
        // 重置UI
        this.domElements.roomInput.style.display = 'inline-block';
        this.domElements.joinButton.style.display = 'inline-block';
        this.domElements.leaveButton.style.display = 'none';
        this.domElements.roomInput.disabled = false;
        
        this.disableChat();
        this.showNotification('已离开房间');
    }

    // 处理房间连接确认后的UI更新
    handleRoomConnection(roomId) {
        super.handleRoomConnection(roomId);
        
        // 更新UI显示已加入房间
        this.domElements.roomInput.style.display = 'none';
        this.domElements.joinButton.style.display = 'none';
        this.domElements.leaveButton.style.display = 'inline-block';
    }

    updateRoomUI() {
        // 显示房间信息
        const roomInfo = document.createElement('div');
        roomInfo.className = 'room-info';
        roomInfo.innerHTML = `
            <span class="room-label">房间:</span>
            <span class="room-value">${this.currentRoomId}</span>
            <span class="user-count">(${this.roomUsers.size + 1} 人在线)</span>
        `;
        
        // 插入到房间控制区域
        const controls = this.domElements.leaveButton.parentElement;
        const existingInfo = controls.querySelector('.room-info');
        if (existingInfo) {
            existingInfo.replaceWith(roomInfo);
        } else {
            controls.insertBefore(roomInfo, this.domElements.leaveButton);
        }
        
        // 启用聊天功能
        this.enableChat();
    }

    updateUserList() {
        console.log('更新用户列表:', this.roomUsers);
        
        // 更新在线人数显示
        const userCount = document.querySelector('.user-count');
        if (userCount) {
            userCount.textContent = `(${this.roomUsers.size + 1} 人在线)`;
        }
        
        // 如果有用户，确保聊天功能启用
        if (this.currentRoomId) {
            this.enableChat();
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
        this.domElements.messageInput.placeholder = '加入房间后即可开始聊天...';
    }

    showNotification(message) {
        console.log('公网模式通知:', message);
        
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
        
        // 重置UI
        const roomInfo = document.querySelector('.room-info');
        if (roomInfo) {
            roomInfo.remove();
        }
        
        this.domElements.roomInput.value = '';
        this.domElements.roomInput.style.display = 'inline-block';
        this.domElements.joinButton.style.display = 'inline-block';
        this.domElements.leaveButton.style.display = 'none';
        this.domElements.roomInput.disabled = false;
        
        this.disableChat();
    }
}

// 导出到全局作用域
window.InternetMode = InternetMode;