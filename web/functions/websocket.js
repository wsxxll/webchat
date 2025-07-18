// WebSocket and Health check endpoint for Cloudflare Pages Functions
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Check for Worker binding
  const workerBinding = env['webchat-core'];
  
  if (!workerBinding) {
    return new Response(JSON.stringify({
      error: 'Worker binding not found',
      message: 'The worker binding is not configured. Please add a Service binding in Pages settings.',
      details: {
        expectedName: 'webchat-core',
        availableBindings: Object.keys(env).filter(key => !key.startsWith('CF_'))
      }
    }), { 
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  try {
    // Handle health check requests
    if (url.pathname.endsWith('/health')) {
      const healthUrl = new URL('/health', url.origin);
      
      const workerRequest = new Request(healthUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      return await workerBinding.fetch(workerRequest);
    }
    
    // Handle WebSocket requests
    // Map /websocket to /ws for the worker
    const workerPath = url.pathname.replace('/websocket', '/ws');
    const workerUrl = new URL(workerPath + url.search, request.url);
    
    // Create request with all original headers preserved
    const workerRequest = new Request(workerUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      // Important for WebSocket upgrade
      duplex: request.body ? 'half' : undefined
    });
    
    // Forward directly to worker
    return await workerBinding.fetch(workerRequest);
    
  } catch (error) {
    console.error('Worker request failed:', error);
    return new Response(JSON.stringify({
      error: 'Worker request failed',
      message: error.message,
      stack: error.stack
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}