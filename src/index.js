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
    
    // Serve static files from GitHub
    return handleStaticAssets(url.pathname, env);
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

async function handleStaticAssets(pathname, env) {
  // GitHub repository information
  const GITHUB_OWNER = env.GITHUB_OWNER || "wsxxll";
  const GITHUB_REPO = env.GITHUB_REPO || "webchat";
  const GITHUB_BRANCH = env.GITHUB_BRANCH || "main";
  
  // Map paths to files
  let filePath = pathname;
  if (pathname === "/" || pathname === "") {
    filePath = "/index.html";
  }
  
  // Construct GitHub raw content URL
  const githubUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}${filePath}`;
  
  try {
    // Fetch from GitHub
    const response = await fetch(githubUrl);
    
    if (!response.ok) {
      return new Response("Not Found", { status: 404 });
    }
    
    // Get content
    const content = await response.text();
    
    // Determine content type
    const contentType = getContentType(filePath);
    
    // Return response with appropriate headers
    return new Response(content, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        ...corsHeaders()
      }
    });
  } catch (error) {
    console.error("Error fetching from GitHub:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

function getContentType(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const mimeTypes = {
    'html': 'text/html; charset=utf-8',
    'css': 'text/css; charset=utf-8',
    'js': 'application/javascript; charset=utf-8',
    'json': 'application/json; charset=utf-8',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'otf': 'font/otf'
  };
  return mimeTypes[ext] || 'text/plain; charset=utf-8';
}