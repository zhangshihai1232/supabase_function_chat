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
import { getLogger, createRequestLogger, LogEventType } from "../_shared/logger.ts";

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
  // 创建请求日志上下文
  const requestId = createRequestLogger(request);
  const logger = getLogger();
  
  const url = new URL(request.url);
  const method = request.method;
  const pathname = url.pathname;

  try {
    // 解析请求参数
    logger.info(requestId, LogEventType.REQUEST_PARSING, `解析请求参数`, {
      method,
      pathname,
      headers: Object.fromEntries(request.headers.entries())
    }, '请求解析');

    // 处理CORS预检请求
    if (method === 'OPTIONS') {
      logger.info(requestId, LogEventType.REQUEST_ROUTING, 'CORS预检请求处理', null, 'CORS处理');
      const response = createCorsPreflightResponse();
      logger.success(requestId, LogEventType.RESPONSE_SEND, 'CORS预检响应已发送', null, '响应发送');
      logger.cleanupRequestContext(requestId);
      return response;
    }

    // 请求路由匹配
    logger.info(requestId, LogEventType.REQUEST_ROUTING, `路由匹配: ${method} ${pathname}`, null, '路由匹配');

    let response: Response;

    // 路由处理
    switch (true) {
      // 状态查询路由
      case pathname === '/status' && method === 'GET':
      case pathname === '/chat/status' && method === 'GET':
      case pathname === '/chat' && method === 'GET':
        logger.info(requestId, LogEventType.REQUEST_ROUTING, '匹配到状态查询路由', null, '状态查询');
        logger.info(requestId, LogEventType.RESPONSE_BUILD, '构建状态响应', null, '响应构建');
        response = createStatusResponse(chatService);
        break;

      // 聊天请求路由
      case pathname === '/chat' && method === 'POST':
        logger.info(requestId, LogEventType.REQUEST_ROUTING, '匹配到聊天请求路由', null, '聊天路由');
        logger.info(requestId, LogEventType.CHAT_START, '开始处理聊天请求', null, '聊天开始');
        
        // 检查是否为流式请求
        const body = await request.text();
        const isStreamingRequest = body.includes('"stream":true') || body.includes('"stream": true');
        
        // 重新创建请求对象（因为body已经被读取）
        const newRequest = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: body
        });
        
        response = await chatService.handleChatRequest(newRequest, requestId);
        
        // 对于流式请求，不在这里清理上下文（由流式处理完成后清理）
        if (isStreamingRequest) {
          logger.success(requestId, LogEventType.RESPONSE_SEND, '流式响应已启动', {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries())
          }, '响应发送');
          return response; // 直接返回，不清理上下文
        }
        break;

      // 根路径重定向到状态页
      case pathname === '/' && method === 'GET':
        logger.info(requestId, LogEventType.REQUEST_ROUTING, '根路径重定向到状态页', null, '根路径');
        response = createStatusResponse(chatService);
        break;

      // 不支持的路由
      default:
        logger.warn(requestId, LogEventType.ERROR_OCCURRED, `未找到匹配路由: ${method} ${pathname}`, {
          method,
          pathname
        }, '路由错误');
        response = new Response(JSON.stringify({
          error: "Not Found",
          message: `Route ${method} ${pathname} not found`,
          timestamp: new Date().toISOString(),
          requestId: requestId
        }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
          }
        });
    }

    logger.success(requestId, LogEventType.RESPONSE_SEND, '响应已发送', {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries())
    }, '响应发送');

    // 清理请求上下文
    logger.cleanupRequestContext(requestId);
    return response;

  } catch (error) {
    logger.error(requestId, LogEventType.ERROR_OCCURRED, `处理请求时发生错误: ${error instanceof Error ? error.message : '未知错误'}`, {
      error: error instanceof Error ? error.stack : error,
      method,
      pathname
    }, '错误处理');

    const errorResponse = createServerErrorResponse(error);
    logger.info(requestId, LogEventType.ERROR_HANDLED, '错误响应已生成', null, '错误响应');
    
    // 清理请求上下文
    logger.cleanupRequestContext(requestId);
    return errorResponse;
  }
}

/**
 * 统一的服务入口点
 * 适用于Supabase Edge Functions和Deno环境
 */
export default async function handler(request: Request): Promise<Response> {
  return await handleRequest(request);
}

// 初始化日志系统并输出启动信息
const logger = getLogger();
logger.logSystemStart();

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