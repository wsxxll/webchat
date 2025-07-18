import { ChatRoom } from './chatroom.js';

// Export Durable Object class
export { ChatRoom };

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
    
    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        timestamp: new Date().toISOString(),
        service: "webchat-api"
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": allowedOrigins,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }
    
    
    // Default response for unknown endpoints
    return new Response(JSON.stringify({
      error: "Not Found",
      message: "This is the WebChat API. Available endpoints: /ws, /health"
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
  const url = new URL(request.url);
  const roomId = url.searchParams.get("room");
  
  if (!roomId) {
    return new Response("Room ID required", { 
      status: 400,
      headers: corsHeaders({}, allowedOrigins)
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
        headers: corsHeaders({}, allowedOrigins)
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
  
  // Add CORS headers to WebSocket response
  const headers = new Headers(response.headers);
  const corsOrigin = origin || "*";
  headers.set("Access-Control-Allow-Origin", corsOrigin);
  headers.set("Access-Control-Allow-Credentials", "true");
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers,
    webSocket: response.webSocket
  });
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