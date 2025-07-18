// Cloudflare Pages _worker.js for better WebSocket handling
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle WebSocket requests through the API route
    if (url.pathname.startsWith('/api/ws')) {
      // Import and use the WebSocket handler
      const { onRequest } = await import('./functions/api/ws.js');
      return onRequest({ request, env, ctx });
    }
    
    // Handle other API routes
    if (url.pathname.startsWith('/api/')) {
      // Let Pages Functions handle it normally
      return env.ASSETS.fetch(request);
    }
    
    // Serve static assets
    return env.ASSETS.fetch(request);
  }
}