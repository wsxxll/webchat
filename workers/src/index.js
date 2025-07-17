import { ChatRoom } from './chatroom.js';

// Export Durable Object class
export { ChatRoom };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleCORS(request);
    }
    
    // WebSocket endpoint
    if (url.pathname.startsWith("/ws")) {
      return handleWebSocket(request, env);
    }
    
    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        timestamp: new Date().toISOString()
      }), {
        headers: corsHeaders({
          "Content-Type": "application/json"
        })
      });
    }
    
    // Room stats endpoint (for debugging)
    if (url.pathname.startsWith("/room/")) {
      const roomId = url.pathname.split("/")[2];
      if (!roomId) {
        return new Response("Room ID required", { status: 400 });
      }
      
      const roomIdHash = await sha256(roomId);
      const durableId = env.CHAT_ROOMS.idFromName(roomIdHash);
      const stub = env.CHAT_ROOMS.get(durableId);
      
      const response = await stub.fetch(new Request(`http://internal/stats`));
      const data = await response.text();
      
      return new Response(data, {
        headers: corsHeaders({
          "Content-Type": "application/json"
        })
      });
    }
    
    // Default response
    return new Response("WebChat API - Use /ws endpoint for WebSocket connections", {
      headers: corsHeaders({
        "Content-Type": "text/plain"
      })
    });
  }
};

async function handleWebSocket(request, env) {
  const url = new URL(request.url);
  const roomId = url.searchParams.get("room");
  
  if (!roomId) {
    return new Response("Room ID required", { status: 400 });
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
  headers.set("Access-Control-Allow-Origin", "*");
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers,
    webSocket: response.webSocket
  });
}

function handleCORS(request) {
  const headers = request.headers;
  const origin = headers.get("Origin");
  const method = headers.get("Access-Control-Request-Method");
  const requestHeaders = headers.get("Access-Control-Request-Headers");
  
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": method || "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": requestHeaders || "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Access-Control-Allow-Credentials": "true"
    }
  });
}

function corsHeaders(headers = {}) {
  return {
    ...headers,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}