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
    // Forward request to Worker
    return await workerBinding.fetch(request);
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