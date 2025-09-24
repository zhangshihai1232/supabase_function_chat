/**
 * 轻量级聊天服务入口文件
 * 
 * 使用原生Deno HTTP服务器，统一运行环境
 * 适用于Supabase Edge Functions和Deno环境
 */

import "https://deno.land/x/xhr@0.3.0/mod.ts";
import "https://deno.land/x/dotenv@v3.2.2/load.ts";

import { ChatService } from "./chat-service.ts";
import { 
  createCorsPreflightResponse,
  createStatusResponse,
  createMethodNotAllowedResponse,
  createServerErrorResponse 
} from "./http-responses.ts";

// 创建全局聊天服务实例，确保内存存储在请求之间持久化
const chatService = new ChatService();

// 使用固定端口8000，统一运行环境
const port = 8000;

/**
 * 简单的路由处理函数
 * @param request HTTP请求对象
 * @returns Promise<Response> HTTP响应对象
 */
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const pathname = url.pathname;

  console.log(`📨 收到请求: ${method} ${pathname}`);

  try {
    // 处理CORS预检请求
    if (method === 'OPTIONS') {
      return createCorsPreflightResponse();
    }

    // 路由处理
    switch (true) {
      // 状态查询路由
      case pathname === '/status' && method === 'GET':
      case pathname === '/chat/status' && method === 'GET':
      case pathname === '/chat' && method === 'GET':
        return createStatusResponse(chatService);

      // 聊天请求路由
      case pathname === '/chat' && method === 'POST':
        return await chatService.handleChatRequest(request);

      // 根路径重定向到状态页
      case pathname === '/' && method === 'GET':
        return createStatusResponse(chatService);

      // 不支持的路由
      default:
        console.log(`❌ 未找到匹配路由: ${method} ${pathname}`);
        return new Response(JSON.stringify({
          error: "Not Found",
          message: `Route ${method} ${pathname} not found`,
          timestamp: new Date().toISOString()
        }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
          }
        });
    }
  } catch (error) {
    console.error('💥 处理请求时发生错误:', error);
    return createServerErrorResponse(error);
  }
}

/**
 * 统一的服务入口点
 * 适用于Supabase Edge Functions和Deno环境
 */
export default async function handler(request: Request): Promise<Response> {
  return await handleRequest(request);
}

// 启动信息输出
console.log('🚀 聊天服务启动中...');
console.log('📁 使用轻量级架构（无Oak依赖）');
console.log('🤖 集成 Google Gemini AI');
console.log('📡 支持流式响应 (SSE)');
console.log('🔓 匿名用户模式 - 无需身份验证');
console.log('💾 内存存储对话记录（无需数据库）');
console.log('✅ 聊天服务已就绪');
console.log(`🚀 聊天服务启动，端口: ${port}`);
console.log('🌟 使用轻量级架构 - 简洁、高效、无依赖');

// 启动HTTP服务器（仅在直接运行时）
if (import.meta.main) {
  const server = Deno.serve({ port }, handleRequest);
  
  console.log(`📡 服务器运行在 http://localhost:${port}`);
  console.log('🔗 可用端点:');
  console.log(`   GET  http://localhost:${port}/status - 服务状态`);
  console.log(`   GET  http://localhost:${port}/chat - 聊天服务信息`);
  console.log(`   POST http://localhost:${port}/chat - 发送聊天消息`);

  // 等待服务器关闭
  await server.finished;
}

// 导出服务组件供测试使用
export { chatService, handleRequest };