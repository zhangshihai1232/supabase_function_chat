/**
 * 聊天服务模块
 * 包含处理聊天请求的核心业务逻辑
 */

import { validateAuth } from '../_shared/auth-validator.ts';
import { createGeminiClient } from '../_shared/gemini-client.ts';
import { SSEStream, createSSEResponse, SSEMessageType } from '../_shared/sse-utils.ts';
import { getLogger, LogEventType } from '../_shared/logger.ts';
import type { 
  ChatRequest, 
  ChatResponse, 
  ChatMessage, 
  AuthUser 
} from '../_shared/types.ts';

/**
 * 聊天服务类
 * 负责处理完整的聊天请求流程，包括身份验证、AI调用等
 * 注意：此版本不依赖 Supabase 数据库，专为独立 Deno 运行设计
 */
export class ChatService {
  private conversationStore: Map<string, Array<{userMessage: string, aiResponse: string, timestamp: string}>>;

  constructor() {
    // 使用内存存储替代数据库（适用于开发和测试）
    this.conversationStore = new Map();
    console.log('🔧 ChatService 初始化完成 - 使用内存存储模式');
  }

  /**
   * 处理聊天请求的主入口方法
   * 
   * 完整流程：
   * 1. 验证用户身份
   * 2. 解析请求参数
   * 3. 创建 SSE 流（如果需要）
   * 4. 调用 AI 生成回复
   * 5. 保存对话记录到数据库
   * 6. 返回响应
   * 
   * @param request HTTP 请求对象
   * @param requestId 请求ID（用于日志关联）
   * @returns Promise<Response> HTTP 响应对象
   */
  async handleChatRequest(request: Request, requestId: string): Promise<Response> {
    const logger = getLogger();
    
    try {
      // 步骤1: 获取用户信息（无需验证）
      logger.info(requestId, LogEventType.AUTH_START, '开始用户认证流程', null, '用户认证');
      const user = await validateAuth(request);
      logger.info(requestId, LogEventType.AUTH_SKIP, '使用匿名用户模式', {
        user_id: user.user_id
      }, '匿名认证');
      
      // 步骤2: 解析请求体
      logger.info(requestId, LogEventType.REQUEST_PARSING, '开始解析请求体', null, '请求体解析');
      const body = await request.text();
      
      if (!body) {
        logger.error(requestId, LogEventType.ERROR_OCCURRED, '请求体为空', null, '请求验证');
        return new Response(JSON.stringify({
          error: '请求体不能为空',
          details: '请提供有效的聊天消息内容',
          requestId
        }), {
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      let chatRequest: ChatRequest;
      try {
        logger.info(requestId, LogEventType.REQUEST_PARSING, 'JSON解析请求体', {
          bodyLength: body.length,
          requestBody: body // 添加实际请求体内容
        }, 'JSON解析');
        chatRequest = JSON.parse(body);
      } catch (error) {
        logger.error(requestId, LogEventType.ERROR_OCCURRED, 'JSON 解析失败', {
          error: error instanceof Error ? error.message : error,
          bodyPreview: body.substring(0, 100)
        }, 'JSON解析错误');
        return new Response(JSON.stringify({
          error: 'JSON 格式无效',
          details: '请提供有效的 JSON 格式的请求体',
          requestId
        }), {
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // 验证请求参数
      logger.info(requestId, LogEventType.REQUEST_VALIDATION, '验证请求参数', null, '参数验证');
      if (!chatRequest.message || typeof chatRequest.message !== 'string') {
        logger.error(requestId, LogEventType.ERROR_OCCURRED, '消息参数无效', {
          message: chatRequest.message,
          messageType: typeof chatRequest.message
        }, '参数验证');
        return new Response(JSON.stringify({
          error: '消息参数无效',
          details: 'message 字段必须是非空字符串',
          requestId
        }), {
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      logger.success(requestId, LogEventType.REQUEST_VALIDATION, `请求解析成功，消息长度: ${chatRequest.message.length}`, {
        messageLength: chatRequest.message.length,
        hasConversationId: !!chatRequest.conversation_id,
        isStreaming: !!chatRequest.stream,
        parsedRequest: chatRequest // 添加解析后的完整请求参数
      }, '解析成功');

      // 检查是否需要 SSE 流式响应
      logger.info(requestId, LogEventType.CHAT_TYPE_DETECTION, '检测聊天类型', {
        stream: chatRequest.stream
      }, '类型检测');
      
      if (chatRequest.stream) {
        logger.info(requestId, LogEventType.CHAT_STREAMING, '启用 SSE 流式响应', null, '流式聊天');
        return await this.handleStreamingChat(chatRequest, user, requestId);
      } else {
        logger.info(requestId, LogEventType.CHAT_STANDARD, '使用标准聊天响应', null, '标准聊天');
        return await this.handleStandardChat(chatRequest, user, requestId);
      }

    } catch (error) {
      logger.error(requestId, LogEventType.ERROR_OCCURRED, '处理聊天请求时发生错误', {
        error: error instanceof Error ? error.stack : error
      }, '异常处理');
      
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      logger.info(requestId, LogEventType.ERROR_HANDLED, '生成错误响应', {
        errorMessage
      }, '错误响应');
      
      return new Response(JSON.stringify({
        error: '处理聊天请求失败',
        details: errorMessage,
        requestId
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }

  /**
   * 处理标准（非流式）聊天请求
   * 
   * @param chatRequest 聊天请求对象
   * @param user 用户信息
   * @param requestId 请求ID
   * @returns Promise<Response> 聊天响应
   */
  async handleStandardChat(chatRequest: ChatRequest, user: AuthUser, requestId: string): Promise<Response> {
    const logger = getLogger();
    
    try {
      logger.info(requestId, LogEventType.AI_CLIENT_CREATE, '创建 AI 客户端', null, 'AI客户端');
      
      // 创建 AI 客户端并生成回复
      const geminiClient = createGeminiClient();
      logger.info(requestId, LogEventType.AI_REQUEST_START, '开始生成 AI 回复', {
        messageLength: chatRequest.message.length,
        userMessage: chatRequest.message // 添加发送给AI的用户消息
      }, 'AI生成');
      
      const aiResponse = await geminiClient.generateResponse(chatRequest.message, undefined, requestId);
      
      logger.success(requestId, LogEventType.AI_RESPONSE_RECEIVED, `AI 回复生成完成，长度: ${aiResponse.length}`, {
        responseLength: aiResponse.length,
        responseContent: aiResponse // 添加实际响应内容
      }, 'AI完成');
      
      // 保存对话记录到内存存储
      const conversationId = chatRequest.conversation_id || this.generateConversationId();
      await this.saveChatHistory(
        user.user_id,
        conversationId,
        chatRequest.message,
        aiResponse,
        requestId
      );
      
      // 构建响应对象
      logger.info(requestId, LogEventType.RESPONSE_BUILD, '构建聊天响应', null, '响应构建');
      const response: ChatResponse = {
        message: aiResponse,
        timestamp: new Date().toISOString(),
        conversation_id: conversationId,
        user_id: user.user_id
      };

      logger.success(requestId, LogEventType.CHAT_STANDARD, '标准聊天请求处理完成', {
        responseSize: JSON.stringify(response).length,
        finalResponse: response // 添加最终响应JSON内容
      }, '聊天完成');
      
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      });

    } catch (error) {
      logger.error(requestId, LogEventType.ERROR_OCCURRED, '标准聊天处理失败', {
        error: error instanceof Error ? error.stack : error
      }, '标准聊天错误');
      throw error;
    }
  }

  /**
   * 处理流式聊天请求（SSE）
   * 
   * @param chatRequest 聊天请求对象
   * @param user 用户信息
   * @param requestId 请求ID
   * @returns Promise<Response> SSE 流响应
   */
  async handleStreamingChat(chatRequest: ChatRequest, user: AuthUser, requestId: string): Promise<Response> {
    const logger = getLogger();
    
    try {
      logger.info(requestId, LogEventType.SSE_STREAM_CREATE, '创建 SSE 流', null, 'SSE创建');
      
      // 创建 SSE 流
      const stream = new SSEStream(requestId);
      
      logger.info(requestId, LogEventType.SSE_STREAM_START, '启动流式响应', null, 'SSE启动');
      
      // 发送开始消息  
      await stream.sendMessage({
        type: SSEMessageType.START,
        data: `开始生成回复...`
      });

      // 异步处理 AI 响应（不要在这里清理上下文，让异步处理完成后再清理）
      this.processStreamingResponse(stream, chatRequest, user, requestId).catch(error => {
        logger.error(requestId, LogEventType.ERROR_OCCURRED, '流式响应处理失败', {
          error: error instanceof Error ? error.stack : error
        }, '流式错误');
        
        try {
          stream.sendMessage({
            type: SSEMessageType.ERROR,
            data: `处理流式响应时发生错误: ${error.message}`
          });
        } catch (err) {
          logger.error(requestId, LogEventType.ERROR_OCCURRED, 'SSE错误消息发送失败', {
            error: err instanceof Error ? err.stack : err
          }, 'SSE错误');
        }
      });

      logger.success(requestId, LogEventType.CHAT_STREAMING, '流式聊天请求处理完成', null, '流式完成');
      
      // 返回 SSE 响应
      return createSSEResponse(stream.createStream());

    } catch (error) {
      logger.error(requestId, LogEventType.ERROR_OCCURRED, '流式聊天处理失败', {
        error: error instanceof Error ? error.stack : error
      }, '流式聊天错误');
      throw error;
    }
  }

  /**
   * 异步处理流式响应
   * 
   * @param stream SSE 流对象
   * @param chatRequest 聊天请求对象
   * @param user 用户信息
   * @param requestId 请求ID
   */
  private async processStreamingResponse(
    stream: SSEStream, 
    chatRequest: ChatRequest, 
    user: AuthUser,
    requestId: string
  ): Promise<void> {
    const logger = getLogger();
    
    try {
      logger.info(requestId, LogEventType.AI_CLIENT_CREATE, '创建流式 AI 客户端', null, '流式AI客户端');
      
      // 创建 AI 客户端
      const geminiClient = createGeminiClient();
      
      logger.info(requestId, LogEventType.AI_STREAMING_START, '开始生成流式回复', {
        messageLength: chatRequest.message.length,
        userMessage: chatRequest.message // 添加发送给AI的用户消息
      }, '流式AI开始');
      
      // 生成流式回复
      const aiResponseStream = await geminiClient.generateStreamingResponse(chatRequest.message, undefined, requestId);
      
      let fullResponse = '';
      let chunkCount = 0;
      
      // 逐块发送响应
      for await (const chunk of aiResponseStream) {
        fullResponse += chunk;
        chunkCount++;
        
        logger.debug(requestId, LogEventType.AI_STREAMING_CHUNK, `接收AI数据块 ${chunkCount}`, {
          chunkLength: chunk.length,
          totalLength: fullResponse.length
        }, `数据块${chunkCount}`);
        
        await stream.sendMessage({
          type: SSEMessageType.DATA,
          data: chunk
        });
      }
      
      logger.success(requestId, LogEventType.AI_STREAMING_END, `流式回复生成完成，总长度: ${fullResponse.length}，块数: ${chunkCount}`, {
        totalLength: fullResponse.length,
        chunkCount,
        responseContent: fullResponse // 添加完整的流式响应内容
      }, '流式AI完成');
      
      // 保存完整的对话记录
      const conversationId = chatRequest.conversation_id || this.generateConversationId();
      await this.saveChatHistory(
        user.user_id,
        conversationId,
        chatRequest.message,
        fullResponse,
        requestId
      );
      
      // 发送完成消息
      logger.info(requestId, LogEventType.SSE_MESSAGE_SEND, '发送完成消息', null, 'SSE完成');
      await stream.sendMessage({
        type: SSEMessageType.DONE,
        data: `回复生成完成`
      });
      
    } catch (error) {
      logger.error(requestId, LogEventType.ERROR_OCCURRED, '处理流式响应时发生错误', {
        error: error instanceof Error ? error.stack : error
      }, '流式响应错误');
      
      await stream.sendMessage({
        type: SSEMessageType.ERROR,
        data: `生成回复失败: ${error instanceof Error ? error.message : '未知错误'}`
      });
    } finally {
      // 关闭流
      const logger = getLogger();
      logger.info(requestId, LogEventType.SSE_STREAM_CLOSE, '关闭 SSE 流', null, 'SSE关闭');
      await stream.close();
      
      // 在流式响应完成后清理请求上下文
      logger.cleanupRequestContext(requestId);
    }
  }

  /**
   * 保存聊天记录到内存存储（替代数据库）
   * 
   * @param userId 用户ID
   * @param conversationId 对话ID
   * @param userMessage 用户消息
   * @param aiResponse AI回复
   * @param requestId 请求ID
   */
  async saveChatHistory(
    userId: string,
    conversationId: string,
    userMessage: string,
    aiResponse: string,
    requestId: string
  ): Promise<void> {
    const logger = getLogger();
    
    try {
      logger.info(requestId, LogEventType.STORAGE_SAVE_START, '开始保存对话记录到内存存储', {
        conversationId,
        userId,
        userMessageLength: userMessage.length,
        aiResponseLength: aiResponse.length
      }, '存储保存');
      
      // 获取或创建对话记录
      if (!this.conversationStore.has(conversationId)) {
        this.conversationStore.set(conversationId, []);
      }
      
      const conversationHistory = this.conversationStore.get(conversationId)!;
      
      // 添加新的对话记录
      conversationHistory.push({
        userMessage,
        aiResponse,
        timestamp: new Date().toISOString()
      });
      
      // 统计信息
      const totalConversations = this.conversationStore.size;
      const totalMessages = conversationHistory.length;
      
      logger.success(requestId, LogEventType.STORAGE_SAVE_SUCCESS, `对话记录已保存`, {
        conversationId,
        totalConversations,
        messagesInConversation: totalMessages,
        storageType: 'in-memory'
      }, '存储完成');
      
    } catch (error) {
      logger.error(requestId, LogEventType.ERROR_OCCURRED, '内存存储保存失败', {
        error: error instanceof Error ? error.stack : error,
        conversationId
      }, '存储错误');
      // 内存存储失败不阻断主流程，只记录错误
    }
  }

  /**
   * 生成对话ID
   * 
   * @returns string 唯一的对话ID
   */
  private generateConversationId(): string {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 11);
    return `chat_${timestamp}_${randomStr}`;
  }

  /**
   * 获取内存存储统计信息
   * 
   * @returns Record<string, any> 存储统计信息
   */
  getStorageStats(): Record<string, any> {
    const totalConversations = this.conversationStore.size;
    let totalMessages = 0;
    let totalUsers = new Set<string>();
    
    for (const [conversationId, messages] of this.conversationStore.entries()) {
      totalMessages += messages.length;
    }
    
    return {
      total_conversations: totalConversations,
      total_messages: totalMessages,
      storage_type: 'in-memory',
      last_updated: new Date().toISOString()
    };
  }

  /**
   * 获取对话历史（用于调试和监控）
   * 
   * @param conversationId 对话ID
   * @returns Array 对话历史记录
   */
  getConversationHistory(conversationId: string): Array<{userMessage: string, aiResponse: string, timestamp: string}> {
    return this.conversationStore.get(conversationId) || [];
  }
}

// 为了向后兼容，暂时保留 ChatHandler 别名
export const ChatHandler = ChatService;
