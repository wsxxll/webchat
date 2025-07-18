// WebSocket endpoint for Cloudflare Pages Functions
export async function onRequest(context) {
  const { request, env } = context;
  
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
    // Create new request with proper WebSocket handling
    const url = new URL(request.url);
    const workerUrl = new URL(url.pathname + url.search, 'https://webchat-core.wsxxll.workers.dev');
    
    const workerRequest = new Request(workerUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      // Important: Support WebSocket upgrade
      duplex: 'half'
    });
    
    // Forward request to Worker
    return await workerBinding.fetch(workerRequest);
  } catch (error) {
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