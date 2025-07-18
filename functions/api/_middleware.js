// 使用 Pages 绑定的 Worker 处理所有 /api/* 请求
export async function onRequest(context) {
  const { request, env } = context;
  
  // 检查是否有绑定的 Worker
  if (!env.WEBCHAT_WORKER) {
    return new Response('Worker binding not found', { status: 500 });
  }
  
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
  return env.WEBCHAT_WORKER.fetch(workerRequest);
}