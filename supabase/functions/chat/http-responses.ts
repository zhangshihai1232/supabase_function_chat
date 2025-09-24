/**
 * HTTP 响应处理工具
 * 
 * 提供标准化的 HTTP 响应处理函数
 * 处理 CORS、错误响应、状态查询等通用 HTTP 场景
 */

import type { ChatService } from "./chat-service.ts";

/**
 * 处理 CORS 预检请求
 * 返回允许跨域访问的响应头
 * 
 * @returns Response CORS 预检响应
 */
export function createCorsPreflightResponse(): Response {
  console.log('处理 CORS 预检请求');
  
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Max-Age': '86400', // 24小时
    },
  });
}

/**
 * 处理服务状态查询请求
 * 
 * @param chatService 聊天服务实例
 * @returns Response 服务状态响应
 */
export function createStatusResponse(chatService: ChatService): Response {
  console.log('收到服务状态查询请求');
  
  const stats = chatService.getStorageStats();
  const statusResponse = {
    status: 'running',
    service: 'LLM Chat Service (Standalone Deno)',
    version: '2.0.0',
    storage: 'In-Memory',
    statistics: stats,
    features: [
      'Google Gemini AI Integration',
      'In-Memory Conversation Storage',
      'Anonymous User Mode',
      'CORS Support',
      'Streaming Response (SSE)'
    ],
    timestamp: new Date().toISOString()
  };

  return new Response(JSON.stringify(statusResponse), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

/**
 * 处理不支持的 HTTP 方法
 * 
 * @param method HTTP 方法名
 * @returns Response 405 Method Not Allowed 响应
 */
export function createMethodNotAllowedResponse(method: string): Response {
  console.log(`收到不支持的 HTTP 方法: ${method}`);
  
  const errorResponse = {
    error: `不支持的 HTTP 方法: ${method}`,
    supported_methods: ['POST', 'GET', 'OPTIONS'],
    code: 'METHOD_NOT_ALLOWED',
    timestamp: new Date().toISOString()
  };

  return new Response(JSON.stringify(errorResponse), {
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Allow': 'POST, GET, OPTIONS',
    },
  });
}

/**
 * 处理服务器错误
 * 
 * @param error 错误对象
 * @returns Response 500 内部服务器错误响应
 */
export function createServerErrorResponse(error: unknown): Response {
  console.error('服务器内部错误:', error);
  
  const errorMessage = error instanceof Error ? error.message : '未知错误';
  const errorResponse = {
    error: '服务器内部错误',
    message: errorMessage,
    code: 'INTERNAL_SERVER_ERROR',
    timestamp: new Date().toISOString()
  };

  return new Response(JSON.stringify(errorResponse), {
    status: 500,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}
