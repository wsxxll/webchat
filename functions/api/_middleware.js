// 使用 Pages 绑定的 Worker 处理所有 /api/* 请求
export async function onRequest(context) {
  const { request, env } = context;
  
  // 检查是否有绑定的 Worker（支持多种命名）
  const workerBinding = env['webchat-worker'] || env.WEBCHAT_WORKER || env.webchat_worker;
  
  if (!workerBinding) {
    return new Response(JSON.stringify({
      error: 'Worker binding not found',
      message: 'The worker binding is not configured. Please add a Service binding in Pages settings.',
      details: {
        expectedNames: ['webchat-worker', 'WEBCHAT_WORKER', 'webchat_worker'],
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
    // 获取原始URL路径
    const url = new URL(request.url);
    
    // 创建新的请求URL，去掉 /api 前缀
    const workerPath = url.pathname.replace(/^\/api/, '') || '/';
    const workerUrl = new URL(workerPath, request.url);
    workerUrl.search = url.search;
    
    // 创建新的请求对象
    const workerRequest = new Request(workerUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      // 重要：支持 WebSocket 升级
      duplex: 'half'
    });
    
    // 直接调用绑定的 Worker
    return await workerBinding.fetch(workerRequest);
  } catch (error) {
    // 如果Worker调用失败，返回错误信息
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