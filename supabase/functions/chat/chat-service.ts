/**
 * 聊天服务模块
 * 包含处理聊天请求的核心业务逻辑
 */

import { validateAuth } from '../_shared/auth-validator.ts';
import { createGeminiClient } from '../_shared/gemini-client.ts';
import { SSEStream, createSSEResponse, SSEMessageType } from '../_shared/sse-utils.ts';
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
   * @returns Promise<Response> HTTP 响应对象
   */
  async handleChatRequest(request: Request): Promise<Response> {
    try {
      console.log('开始处理聊天请求');
      
      // 步骤1: 获取用户信息（无需验证）
      const user = await validateAuth(request);
      console.log('使用匿名用户模式');
      
      // 步骤2: 解析请求体
      const body = await request.text();
      
      if (!body) {
        console.error('请求体为空');
        return new Response(JSON.stringify({
          error: '请求体不能为空',
          details: '请提供有效的聊天消息内容'
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
        chatRequest = JSON.parse(body);
      } catch (error) {
        console.error('JSON 解析失败:', error);
        return new Response(JSON.stringify({
          error: 'JSON 格式无效',
          details: '请提供有效的 JSON 格式的请求体'
        }), {
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // 验证请求参数
      if (!chatRequest.message || typeof chatRequest.message !== 'string') {
        console.error('消息参数无效');
        return new Response(JSON.stringify({
          error: '消息参数无效',
          details: 'message 字段必须是非空字符串'
        }), {
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      console.log(`请求解析成功，消息长度: ${chatRequest.message.length}`);

      // 检查是否需要 SSE 流式响应
      if (chatRequest.stream) {
        console.log('检测到 stream 字段，启用 SSE 流式响应');
        return await this.handleStreamingChat(chatRequest, user);
      } else {
        console.log('未检测到 stream 字段，使用标准聊天响应');
        return await this.handleStandardChat(chatRequest, user);
      }

    } catch (error) {
      console.error('处理聊天请求时发生错误:', error);
      
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      return new Response(JSON.stringify({
        error: '处理聊天请求失败',
        details: errorMessage
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
   * @returns Promise<Response> 聊天响应
   */
  async handleStandardChat(chatRequest: ChatRequest, user: AuthUser): Promise<Response> {
    try {
      console.log('处理标准聊天请求');
      
      // 创建 AI 客户端并生成回复
      const geminiClient = createGeminiClient();
      const aiResponse = await geminiClient.generateResponse(chatRequest.message);
      
      // 保存对话记录到内存存储
      await this.saveChatHistory(
        user.user_id,
        chatRequest.conversation_id || this.generateConversationId(),
        chatRequest.message,
        aiResponse
      );
      
      // 构建响应对象
      const response: ChatResponse = {
        message: aiResponse,
        timestamp: new Date().toISOString(),
        conversation_id: chatRequest.conversation_id || this.generateConversationId(),
        user_id: user.user_id
      };

      console.log('标准聊天请求处理完成');
      
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      });

    } catch (error) {
      console.error('标准聊天处理失败:', error);
      throw error;
    }
  }

  /**
   * 处理流式聊天请求（SSE）
   * 
   * @param chatRequest 聊天请求对象
   * @param user 用户信息
   * @returns Promise<Response> SSE 流响应
   */
  async handleStreamingChat(chatRequest: ChatRequest, user: AuthUser): Promise<Response> {
    try {
      console.log('处理流式聊天请求 (SSE)');
      
      // 创建 SSE 流
      const stream = new SSEStream();
      
      // 发送开始消息  
      await stream.sendMessage({
        type: SSEMessageType.START,
        data: `开始生成回复...`
      });

      // 异步处理 AI 响应
      this.processStreamingResponse(stream, chatRequest, user).catch(error => {
        console.error('流式响应处理失败:', error);
        stream.sendMessage({
          type: SSEMessageType.ERROR,
          data: `处理流式响应时发生错误: ${error.message}`
        }).catch(console.error);
      });

      console.log('流式聊天请求处理完成');
      
      // 返回 SSE 响应
      return createSSEResponse(stream.createStream());

    } catch (error) {
      console.error('流式聊天处理失败:', error);
      throw error;
    }
  }

  /**
   * 异步处理流式响应
   * 
   * @param stream SSE 流对象
   * @param chatRequest 聊天请求对象
   * @param user 用户信息
   */
  private async processStreamingResponse(
    stream: SSEStream, 
    chatRequest: ChatRequest, 
    user: AuthUser
  ): Promise<void> {
    try {
      // 创建 AI 客户端
      const geminiClient = createGeminiClient();
      
      // 生成流式回复
      const aiResponseStream = await geminiClient.generateStreamingResponse(chatRequest.message);
      
      let fullResponse = '';
      
      // 逐块发送响应
      for await (const chunk of aiResponseStream) {
        fullResponse += chunk;
        
        await stream.sendMessage({
          type: SSEMessageType.DATA,
          data: chunk
        });
      }
      
      // 保存完整的对话记录
      await this.saveChatHistory(
        user.user_id,
        chatRequest.conversation_id || this.generateConversationId(),
        chatRequest.message,
        fullResponse
      );
      
      // 发送完成消息
      await stream.sendMessage({
        type: SSEMessageType.DONE,
        data: `回复生成完成`
      });
      
    } catch (error) {
      console.error('处理流式响应时发生错误:', error);
      
      await stream.sendMessage({
        type: SSEMessageType.ERROR,
        data: `生成回复失败: ${error.message}`
      });
    } finally {
      // 关闭流
      await stream.close();
    }
  }

  /**
   * 保存聊天记录到内存存储（替代数据库）
   * 
   * @param userId 用户ID
   * @param conversationId 对话ID
   * @param userMessage 用户消息
   * @param aiResponse AI回复
   */
  async saveChatHistory(
    userId: string,
    conversationId: string,
    userMessage: string,
    aiResponse: string
  ): Promise<void> {
    try {
      console.log('💾 保存对话记录到内存存储');
      
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
      
      console.log(`✅ 对话记录已保存，对话 ID: ${conversationId}，总记录数: ${totalMessages}`);
      
    } catch (error) {
      console.error('内存存储保存失败:', error);
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
