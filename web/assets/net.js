/**
 * 公网模式 - 继承自BaseChatMode
 * 支持手动输入房间号连接到公网用户
 * 使用WebSocket进行所有通信，不使用P2P
 */
class InternetMode extends BaseChatMode {
    constructor(sendWebSocketMessage, isWebSocketConnected) {
        super(sendWebSocketMessage, isWebSocketConnected);
        
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
        // 只绑定基础事件，不绑定P2P相关事件
        this.domElements.sendButton.addEventListener('click', () => this.sendChatMessage());
        this.domElements.messageInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') this.sendChatMessage();
        });
        
        // 文件相关事件
        this.domElements.attachButton.addEventListener('click', () => {
            this.domElements.fileInput.click();
        });
        
        this.domElements.fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                this.handleFileSelection(file);
            }
        });
        
        // 房间相关事件
        this.domElements.joinButton.addEventListener('click', () => this.joinRoom());
        this.domElements.leaveButton.addEventListener('click', () => this.leaveRoom());
        
        this.domElements.roomInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
    }

    // 当WebSocket连接成功时调用
    onWebSocketConnected() {
        this.isWebSocketConnected = true;
        this.updateConnectionStatus('connected');
        this.showNotification('✅ 已连接到信令服务器');
        
        // 如果是通过房间ID重连的，自动发送join消息
        const roomId = this.domElements.roomInput.value.trim();
        if (roomId && !this.currentRoomId) {
            this.sendWebSocketMessage({
                type: 'join',
                room: roomId,
                userId: this.currentUserInfo?.id,
                userInfo: this.currentUserInfo
            });
        }
    }

    joinRoom() {
        const roomId = this.domElements.roomInput.value.trim();
        if (!roomId) {
            this.showNotification('请输入房间号');
            return;
        }
        
        if (this.currentRoomId) {
            this.leaveRoom();
        }
        
        this.currentUserInfo = this.generateUserInfo();
        
        // 对于Cloudflare Workers后端，需要重新连接WebSocket并在URL中包含房间ID
        if (window.modeSelector && window.modeSelector.reconnectWithRoom) {
            window.modeSelector.reconnectWithRoom(roomId);
        } else {
            // 兼容原有方式
            if (!this.isWebSocketConnected) {
                this.showNotification('WebSocket未连接，请稍后再试');
                return;
            }
            
            this.sendWebSocketMessage({
                type: 'join',
                roomId: roomId,
                userId: this.currentUserInfo.id,
                userInfo: this.currentUserInfo
            });
        }
    }

    leaveRoom() {
        if (!this.currentRoomId) return;
        
        this.sendWebSocketMessage({
            type: 'leave',
            room: this.currentRoomId
        });
        
        this.currentRoomId = null;
        this.roomUsers.clear();
        this.updateUserList();
        
        this.domElements.roomInput.style.display = 'inline-block';
        this.domElements.joinButton.style.display = 'inline-block';
        this.domElements.leaveButton.style.display = 'none';
        this.domElements.messageInput.disabled = true;
        this.domElements.sendButton.disabled = true;
        this.domElements.attachButton.disabled = true;
        
        this.showNotification('已离开房间');
        
        if (this.isWebSocketConnected) {
            this.updateConnectionStatus('connected');
        }
    }

    handleJoinedRoom(data) {
        this.currentRoomId = data.roomId || this.domElements.roomInput.value.trim();
        
        console.log('已加入房间:', this.currentRoomId);
        
        // 更新UI
        this.domElements.roomInput.style.display = 'none';
        this.domElements.joinButton.style.display = 'none';
        this.domElements.leaveButton.style.display = 'inline-block';
        this.domElements.messageInput.disabled = false;
        this.domElements.sendButton.disabled = false;
        this.domElements.attachButton.disabled = false;
        this.domElements.messageInput.placeholder = '输入消息...';
        
        this.updateConnectionStatus('connected');
    }

    // 覆盖基类的WebSocket消息处理
    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'joined':
                this.currentUserId = message.userId;
                this.currentUserInfo = message.userInfo || this.generateUserInfo();
                this.handleJoinedRoom(message);
                break;
            case 'user-joined':
                this.handleUserJoined(message);
                break;
            case 'user-left':
                this.handleUserLeft(message);
                break;
            case 'user-list':
                this.updateUserList(message.users);
                break;
            case 'message':
                // 处理文本消息
                this.displayMessage(message, false);
                break;
            case 'file-message':
                // 处理文件消息
                this.displayFileMessage(message, false);
                break;
            case 'heartbeat-ack':
                break;
            default:
                console.log('未知消息类型:', message.type);
        }
    }

    // 覆盖用户加入处理，不创建P2P连接
    handleUserJoined(data) {
        if (data.userInfo) {
            this.roomUsers.set(data.userId, data.userInfo);
        }
        
        const userInfo = this.roomUsers.get(data.userId);
        const userName = userInfo ? userInfo.name : '用户';
        this.showNotification(`👋 ${userName} 加入了房间`);
        this.updateUserList();
    }

    // 覆盖消息发送，使用WebSocket
    sendChatMessage() {
        const message = this.domElements.messageInput.value.trim();
        if (!message) return;
        
        if (!this.currentRoomId) {
            this.showNotification('请先加入房间');
            return;
        }
        
        const messageData = {
            type: 'message',
            text: message,
            userId: this.currentUserId,
            userInfo: this.currentUserInfo,
            timestamp: Date.now(),
            roomId: this.currentRoomId
        };
        
        // 通过WebSocket发送消息
        this.sendWebSocketMessage(messageData);
        
        // 显示自己的消息
        this.displayMessage(messageData, true);
        this.domElements.messageInput.value = '';
    }

    // 覆盖文件处理，通过WebSocket发送
    handleFileSelection(file) {
        if (!this.currentRoomId) {
            this.showNotification('请先加入房间');
            return;
        }
        
        // 对于小文件，可以直接通过WebSocket发送
        const maxFileSize = 5 * 1024 * 1024; // 5MB
        
        if (file.size > maxFileSize) {
            this.showNotification('❌ 文件太大，最大支持 5MB');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const fileData = {
                type: 'file-message',
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                data: e.target.result,
                userId: this.currentUserId,
                userInfo: this.currentUserInfo,
                timestamp: Date.now(),
                roomId: this.currentRoomId
            };
            
            // 通过WebSocket发送文件
            this.sendWebSocketMessage(fileData);
            
            // 显示自己发送的文件
            this.displayFileMessage(fileData, true);
        };
        
        reader.readAsDataURL(file);
        this.domElements.fileInput.value = '';
    }

    // 显示文件消息
    displayFileMessage(fileData, isOwn) {
        const messageWrapper = document.createElement('div');
        messageWrapper.className = `message-wrapper ${isOwn ? 'own' : 'other'}`;
        
        const messageHeader = document.createElement('div');
        messageHeader.className = 'message-header';
        
        const avatar = document.createElement('img');
        avatar.className = 'message-avatar';
        avatar.src = fileData.userInfo.avatar;
        avatar.alt = fileData.userInfo.name;
        
        const headerText = document.createElement('div');
        headerText.className = 'message-header-text';
        
        const name = document.createElement('span');
        name.className = 'message-name';
        name.textContent = fileData.userInfo.name;
        
        const time = document.createElement('span');
        time.className = 'message-time';
        time.textContent = new Date(fileData.timestamp).toLocaleTimeString();
        
        headerText.appendChild(name);
        headerText.appendChild(time);
        
        messageHeader.appendChild(avatar);
        messageHeader.appendChild(headerText);
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'message-own' : 'message-other'}`;
        
        // 如果是图片，直接显示
        if (fileData.fileType && fileData.fileType.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = fileData.data;
            img.alt = fileData.fileName;
            img.style.maxWidth = '300px';
            img.style.maxHeight = '300px';
            img.style.borderRadius = '8px';
            img.style.cursor = 'pointer';
            
            // 点击查看大图
            img.onclick = () => {
                const modal = document.createElement('div');
                modal.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    cursor: pointer;
                `;
                
                const fullImg = document.createElement('img');
                fullImg.src = fileData.data;
                fullImg.style.maxWidth = '90%';
                fullImg.style.maxHeight = '90%';
                fullImg.style.objectFit = 'contain';
                
                modal.appendChild(fullImg);
                modal.onclick = () => modal.remove();
                document.body.appendChild(modal);
            };
            
            messageDiv.appendChild(img);
        } else {
            // 其他文件显示下载链接
            const fileContainer = document.createElement('div');
            fileContainer.className = 'file-container';
            fileContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 15px;
                min-width: 250px;
            `;
            
            const fileIcon = document.createElement('div');
            fileIcon.style.cssText = `
                font-size: 48px;
                flex-shrink: 0;
            `;
            fileIcon.textContent = this.getFileIcon(fileData.fileType);
            
            const fileInfo = document.createElement('div');
            fileInfo.style.cssText = `
                flex: 1;
                overflow: hidden;
            `;
            
            const fileName = document.createElement('div');
            fileName.style.cssText = `
                font-weight: 600;
                color: ${isOwn ? 'rgba(255, 255, 255, 0.95)' : '#374151'};
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;
            fileName.textContent = fileData.fileName;
            
            const fileSize = document.createElement('div');
            fileSize.style.cssText = `
                font-size: 12px;
                color: ${isOwn ? 'rgba(255, 255, 255, 0.75)' : '#6b7280'};
                margin-top: 4px;
            `;
            fileSize.textContent = this.formatFileSize(fileData.fileSize);
            
            fileInfo.appendChild(fileName);
            fileInfo.appendChild(fileSize);
            
            const downloadBtn = document.createElement('a');
            downloadBtn.href = fileData.data;
            downloadBtn.download = fileData.fileName;
            downloadBtn.style.cssText = `
                padding: 8px 16px;
                background: ${isOwn ? 'rgba(255, 255, 255, 0.2)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'};
                color: white;
                border-radius: 20px;
                text-decoration: none;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.3s ease;
                border: ${isOwn ? '1px solid rgba(255, 255, 255, 0.3)' : 'none'};
            `;
            downloadBtn.textContent = '下载';
            
            fileContainer.appendChild(fileIcon);
            fileContainer.appendChild(fileInfo);
            fileContainer.appendChild(downloadBtn);
            
            messageDiv.appendChild(fileContainer);
        }
        
        messageWrapper.appendChild(messageHeader);
        messageWrapper.appendChild(messageDiv);
        
        this.domElements.chatMessages.appendChild(messageWrapper);
        this.domElements.chatMessages.scrollTop = this.domElements.chatMessages.scrollHeight;
    }

    // 覆盖P2P相关方法，使其不执行任何操作
    createPeerConnection(peerId, createOffer) {
        // 公网模式不使用P2P
        return null;
    }

    closePeerConnections() {
        // 公网模式不使用P2P
    }

    updateChannelStatus() {
        // 公网模式不需要更新P2P通道状态
        this.renderUserList();
    }

    // 覆盖渲染用户列表，不显示P2P连接状态
    renderUserList() {
        let userListContainer = document.getElementById('userListContainer');
        if (!userListContainer) {
            userListContainer = document.createElement('div');
            userListContainer.id = 'userListContainer';
            userListContainer.className = 'user-list-container';
            
            const roomSection = document.querySelector('.room-section');
            roomSection.appendChild(userListContainer);
        }
        
        const allUsers = Array.from(this.roomUsers.entries());
        const myself = allUsers.find(([userId]) => userId === this.currentUserId);
        const otherUsers = allUsers.filter(([userId]) => userId !== this.currentUserId);
        
        const sortedUsers = myself ? [myself, ...otherUsers] : otherUsers;
        
        const userItems = sortedUsers.map(([userId, userInfo]) => {
            const isSelf = userId === this.currentUserId;
            
            // 公网模式下，所有连接到服务器的用户都显示为已连接
            const statusDot = `<span class="status-dot connected"></span>`;
            
            return `
                <div class="user-item ${isSelf ? 'user-self' : ''}">
                    ${statusDot}
                    <img class="user-avatar-small" src="${userInfo.avatar}" alt="${userInfo.name}">
                    <span class="user-name">${userInfo.name}${isSelf ? ' (我)' : ''}</span>
                </div>
            `;
        }).join('');
        
        userListContainer.innerHTML = `<div class="user-list">${userItems}</div>`;
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
                            <span class="room-name">${this.currentRoomId}</span>
                            <span class="room-separator">·</span>
                            <span class="room-users">在线用户 ${userCount}</span>
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
    
    showNotification(text) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = text;
        
        const existingNotifications = document.querySelectorAll('.notification:not(.notification-exit)');
        const offset = existingNotifications.length * 60;
        notification.style.top = `${20 + offset}px`;
        
        document.body.appendChild(notification);
        
        setTimeout(() => notification.classList.add('notification-show'), 10);
        
        setTimeout(() => {
            notification.classList.add('notification-exit');
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    }
}

// 导出类供使用
window.InternetMode = InternetMode;