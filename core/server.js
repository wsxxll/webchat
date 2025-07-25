/**
 * WebChat Server - Cloudflare Worker with Durable Objects
 * Handles WebSocket connections, room management, and message routing
 */

/**
 * ChatRoom Durable Object
 * Manages WebSocket connections and message routing for a single chat room
 */
export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    
    // Store active WebSocket connections
    this.sessions = new Map();
    
    // Store user information
    this.users = new Map();
    
    // Room metadata
    this.roomId = null;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
  }

  async fetch(request) {
    const url = new URL(request.url);
    
    // Handle WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      
      await this.handleSession(server, url);
      
      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }
    
    return new Response("Expected WebSocket", { status: 400 });
  }

  async handleSession(webSocket, url) {
    // Accept the WebSocket connection
    webSocket.accept();
    
    // Generate unique session ID
    const sessionId = crypto.randomUUID();
    
    // Extract room ID from URL
    const roomId = url.searchParams.get("room");
    if (!this.roomId) {
      this.roomId = roomId;
    }
    
    // Create session object
    const session = {
      id: sessionId,
      webSocket,
      userId: null,
      userInfo: null,
      joined: false,
      lastHeartbeat: Date.now()
    };
    
    this.sessions.set(sessionId, session);
    
    // Set up message handler
    webSocket.addEventListener("message", async (event) => {
      await this.handleMessage(sessionId, event.data);
    });
    
    // Set up close handler
    webSocket.addEventListener("close", async () => {
      await this.handleClose(sessionId);
    });
    
    // Set up error handler
    webSocket.addEventListener("error", async (error) => {
      console.error("WebSocket error:", error);
      await this.handleClose(sessionId);
    });
    
    // Send welcome message
    this.sendToSession(sessionId, {
      type: "connected",
      sessionId: sessionId,
      roomId: this.roomId
    });
  }

  async handleMessage(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    this.lastActivity = Date.now();
    
    let message;
    try {
      message = JSON.parse(data);
    } catch (error) {
      this.sendToSession(sessionId, {
        type: "error",
        message: "Invalid message format"
      });
      return;
    }
    
    // Handle different message types
    switch (message.type) {
      case "join":
        await this.handleJoin(sessionId, message);
        break;
        
      case "leave":
        await this.handleLeave(sessionId);
        break;
        
      case "offer":
      case "answer":
      case "ice-candidate":
        await this.handleWebRTC(sessionId, message);
        break;
        
      case "message":
        await this.handleChatMessage(sessionId, message);
        break;
        
      case "file-message":
        await this.handleFileMessage(sessionId, message);
        break;
        
      case "heartbeat":
        session.lastHeartbeat = Date.now();
        this.sendToSession(sessionId, { type: "heartbeat-ack" });
        break;
        
      default:
        this.sendToSession(sessionId, {
          type: "error",
          message: "Unknown message type"
        });
    }
  }

  async handleJoin(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    // Prevent double join
    if (session.joined) {
      this.sendToSession(sessionId, {
        type: "error",
        message: "Already joined"
      });
      return;
    }
    
    // Set user info
    const userId = message.userId || crypto.randomUUID();
    session.userId = userId;
    session.userInfo = message.userInfo || { id: userId };
    session.joined = true;
    
    // Store user info
    this.users.set(userId, {
      ...session.userInfo,
      id: userId,
      sessionId: sessionId
    });
    
    // Notify other users
    this.broadcast({
      type: "user-joined",
      userId: userId,
      userInfo: session.userInfo
    }, sessionId);
    
    // Send complete join response with user list
    this.sendToSession(sessionId, {
      type: "joined",
      roomId: this.roomId,
      userId: userId,
      userInfo: session.userInfo,
      users: Array.from(this.users.keys()),
      usersInfo: Object.fromEntries(this.users)
    });
  }

  async handleLeave(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.joined) return;
    
    const userId = session.userId;
    
    // Remove user
    this.users.delete(userId);
    session.joined = false;
    
    // Notify other users
    this.broadcast({
      type: "user-left",
      userId: userId
    }, sessionId);
  }

  async handleWebRTC(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.joined) return;
    
    const targetUserId = message.targetUserId;
    if (!targetUserId) {
      this.sendToSession(sessionId, {
        type: "error",
        message: "Target user ID required"
      });
      return;
    }
    
    // Find target user's session
    const targetUser = this.users.get(targetUserId);
    if (!targetUser) {
      this.sendToSession(sessionId, {
        type: "error",
        message: "Target user not found"
      });
      return;
    }
    
    // Forward WebRTC message to target user
    this.sendToSession(targetUser.sessionId, {
      ...message,
      userId: session.userId
    });
  }

  async handleChatMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.joined) return;
    
    // 添加发送者信息
    const forwardMessage = {
      ...message,
      userId: session.userId,
      userInfo: session.userInfo
    };
    
    // 广播消息给所有其他用户
    this.broadcast(forwardMessage, sessionId);
  }
  
  async handleFileMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.joined) return;
    
    // 文件大小限制检查（5MB）
    const maxFileSize = 5 * 1024 * 1024;
    if (message.data && message.data.length > maxFileSize * 1.37) { // base64编码约增加37%大小
      this.sendToSession(sessionId, {
        type: "error",
        message: "文件太大，最大支持 5MB"
      });
      return;
    }
    
    // 添加发送者信息
    const forwardMessage = {
      ...message,
      userId: session.userId,
      userInfo: session.userInfo
    };
    
    // 广播文件消息给所有其他用户
    this.broadcast(forwardMessage, sessionId);
  }

  async handleClose(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    // Handle leave if joined
    if (session.joined) {
      await this.handleLeave(sessionId);
    }
    
    // Remove session
    this.sessions.delete(sessionId);
    
    // Clean up if room is empty
    if (this.sessions.size === 0) {
      // Room will be automatically cleaned up by Cloudflare after inactivity
      console.log(`Room ${this.roomId} is now empty`);
    }
  }

  sendToSession(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session || session.webSocket.readyState !== WebSocket.OPEN) return;
    
    try {
      session.webSocket.send(JSON.stringify(message));
    } catch (error) {
      console.error(`Error sending to session ${sessionId}:`, error);
    }
  }

  broadcast(message, excludeSessionId = null) {
    const messageStr = JSON.stringify(message);
    
    for (const [sessionId, session] of this.sessions) {
      if (sessionId !== excludeSessionId && session.joined) {
        try {
          if (session.webSocket.readyState === WebSocket.OPEN) {
            session.webSocket.send(messageStr);
          }
        } catch (error) {
          console.error(`Error broadcasting to session ${sessionId}:`, error);
        }
      }
    }
  }
}

/**
 * Worker Main Entry Point
 * Handles HTTP requests and WebSocket upgrades
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Get allowed origins from environment
    const allowedOrigins = env.ALLOWED_ORIGINS || '*';
    
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleCORS(request, allowedOrigins);
    }
    
    // WebSocket endpoint
    if (url.pathname === "/ws" || url.pathname.startsWith("/ws")) {
      return handleWebSocket(request, env, allowedOrigins);
    }
    
    // Default response for unknown endpoints
    return new Response(JSON.stringify({
      error: "Not Found",
      message: "This is the WebChat API. Available endpoint: /ws"
    }), { 
      status: 404,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": allowedOrigins,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
};

async function handleWebSocket(request, env, allowedOrigins) {
  // Validate WebSocket upgrade headers
  const upgradeHeader = request.headers.get("Upgrade");
  const connectionHeader = request.headers.get("Connection");
  
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("WebSocket Upgrade header required", { 
      status: 400,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigins,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  
  if (!connectionHeader || !connectionHeader.toLowerCase().includes("upgrade")) {
    return new Response("Connection: Upgrade header required", { 
      status: 400,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigins,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  
  const url = new URL(request.url);
  const roomId = url.searchParams.get("room");
  
  if (!roomId) {
    return new Response("Room ID required", { 
      status: 400,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigins,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  
  // Check origin for WebSocket connections
  const origin = request.headers.get("Origin");
  if (origin && allowedOrigins !== "*") {
    const allowed = allowedOrigins.split(",").some(pattern => {
      if (pattern.includes("*")) {
        const regex = new RegExp(pattern.replace(/\*/g, ".*"));
        return regex.test(origin);
      }
      return pattern === origin;
    });
    
    if (!allowed) {
      return new Response("Origin not allowed", { 
        status: 403,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigins,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }
  }
  
  // Create consistent room ID hash
  const roomIdHash = await sha256(roomId);
  
  // Get or create Durable Object instance for this room
  const durableId = env.CHAT_ROOMS.idFromName(roomIdHash);
  const stub = env.CHAT_ROOMS.get(durableId);
  
  // Forward the WebSocket request to the Durable Object
  const response = await stub.fetch(request);
  
  // For WebSocket responses, don't modify headers as they may interfere with the upgrade
  return response;
}

function handleCORS(request, allowedOrigins) {
  const headers = request.headers;
  const origin = headers.get("Origin");
  const method = headers.get("Access-Control-Request-Method");
  const requestHeaders = headers.get("Access-Control-Request-Headers");
  
  const corsOrigin = origin && allowedOrigins !== "*" ? origin : allowedOrigins;
  
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": method || "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": requestHeaders || "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Access-Control-Allow-Credentials": "true"
    }
  });
}

async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}