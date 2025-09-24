/**
 * Server-Sent Events (SSE) 工具模块
 * 提供流式响应功能，让客户端可以实时接收 AI 生成的内容
 */

/**
 * SSE 消息类型枚举
 * 定义不同类型的服务器推送消息
 */
export enum SSEMessageType {
  /** 开始生成响应 */
  START = 'start',
  /** 部分内容数据 */
  DATA = 'data',
  /** 响应生成完成 */
  DONE = 'done',
  /** 发生错误 */
  ERROR = 'error',
  /** 保持连接活跃 */
  PING = 'ping'
}

/**
 * SSE 消息接口
 * 定义服务器发送事件的消息结构
 */
export interface SSEMessage {
  /** 消息类型 */
  type: SSEMessageType;
  /** 消息数据内容 */
  data?: any;
  /** 消息ID（可选） */
  id?: string;
  /** 重试间隔（毫秒，可选） */
  retry?: number;
}

/**
 * SSE 流管理器类
 * 负责管理服务器发送事件的流式传输
 */
export class SSEStream {
  private encoder = new TextEncoder();
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private isClosed = false;

  /**
   * 创建可读流对象
   * 返回一个可以被 Response 对象使用的流
   * 
   * @returns ReadableStream<Uint8Array> 可读的字节流
   */
  createStream(): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start: (controller) => {
        this.controller = controller;
        console.log('SSE 流已启动');
        
        // 发送初始连接消息
        this.sendMessage({
          type: SSEMessageType.START,
          data: '连接已建立，开始处理请求...',
          id: Date.now().toString()
        });
      },
      
      cancel: () => {
        console.log('SSE 流被客户端取消');
        this.close();
      }
    });
  }

  /**
   * 发送 SSE 消息到客户端
   * 
   * @param message SSE 消息对象
   */
  sendMessage(message: SSEMessage): void {
    if (this.isClosed || !this.controller) {
      console.warn('尝试向已关闭的 SSE 流发送消息');
      return;
    }

    try {
      // 构建 SSE 格式的消息字符串
      let sseData = '';
      
      // 添加消息ID（如果提供）
      if (message.id) {
        sseData += `id: ${message.id}\n`;
      }
      
      // 添加事件类型
      sseData += `event: ${message.type}\n`;
      
      // 添加数据内容
      if (message.data !== undefined) {
        console.log(`🔍 SSE发送消息类型: ${message.type}, 数据类型: ${typeof message.data}, 数据值:`, message.data);
        
        const dataString = typeof message.data === 'string' 
          ? message.data 
          : JSON.stringify(message.data);
        
        console.log(`🔍 SSE最终发送的字符串:`, dataString);
        
        // 处理多行数据，每行都需要 "data: " 前缀
        const lines = dataString.split('\n');
        for (const line of lines) {
          sseData += `data: ${line}\n`;
        }
      }
      
      // 添加重试间隔（如果提供）
      if (message.retry) {
        sseData += `retry: ${message.retry}\n`;
      }
      
      // SSE 消息以双换行结束
      sseData += '\n';

      // 编码并发送消息
      const encodedData = this.encoder.encode(sseData);
      this.controller.enqueue(encodedData);
      
      console.log(`发送 SSE 消息: ${message.type}`);
      
    } catch (error) {
      console.error('发送 SSE 消息时出错:', error);
      this.sendError('消息发送失败');
    }
  }

  /**
   * 发送文本数据块
   * 便捷方法，用于发送部分生成的内容
   * 
   * @param text 要发送的文本内容
   * @param messageId 消息ID（可选）
   */
  sendData(text: string, messageId?: string): void {
    this.sendMessage({
      type: SSEMessageType.DATA,
      data: { content: text, timestamp: new Date().toISOString() },
      id: messageId
    });
  }

  /**
   * 发送错误消息
   * 
   * @param error 错误信息或错误对象
   */
  sendError(error: string | Error): void {
    const errorMessage = error instanceof Error ? error.message : error;
    
    this.sendMessage({
      type: SSEMessageType.ERROR,
      data: { 
        error: errorMessage,
        timestamp: new Date().toISOString()
      },
      id: Date.now().toString()
    });
    
    console.error('SSE 流发送错误:', errorMessage);
  }

  /**
   * 发送完成消息并关闭流
   * 
   * @param finalData 最终数据（可选）
   */
  sendDone(finalData?: any): void {
    this.sendMessage({
      type: SSEMessageType.DONE,
      data: finalData || { message: '响应生成完成' },
      id: Date.now().toString()
    });
    
    // 延迟关闭流，确保最后的消息被发送
    setTimeout(() => {
      this.close();
    }, 100);
  }

  /**
   * 发送心跳消息
   * 用于保持连接活跃，防止超时
   */
  sendPing(): void {
    this.sendMessage({
      type: SSEMessageType.PING,
      data: { timestamp: new Date().toISOString() },
      id: Date.now().toString()
    });
  }

  /**
   * 关闭 SSE 流
   */
  close(): void {
    if (!this.isClosed && this.controller) {
      try {
        this.controller.close();
        this.isClosed = true;
        console.log('SSE 流已关闭');
      } catch (error) {
        console.error('关闭 SSE 流时出错:', error);
      }
    }
  }

  /**
   * 检查流是否已关闭
   * 
   * @returns boolean 流是否已关闭
   */
  get closed(): boolean {
    return this.isClosed;
  }
}

/**
 * 创建 SSE 响应对象
 * 工厂函数，用于创建带有适当头部的 SSE 响应
 * 
 * @param stream SSE 流对象
 * @returns Response 配置好的 HTTP 响应对象
 */
export function createSSEResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      // SSE 必需的头部
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      
      // CORS 头部，支持跨域访问
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Expose-Headers': 'content-length, content-type',
      
      // 防止代理服务器缓存
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * 模拟流式文本生成
 * 用于测试 SSE 功能的工具函数
 * 
 * @param text 要流式发送的完整文本
 * @param sseStream SSE 流对象
 * @param delayMs 每个字符之间的延迟（毫秒）
 */
export async function simulateStreamingText(
  text: string, 
  sseStream: SSEStream, 
  delayMs: number = 50
): Promise<void> {
  try {
    console.log('开始模拟流式文本生成');
    
    // 逐字符发送文本
    for (let i = 0; i < text.length; i++) {
      if (sseStream.closed) {
        console.log('流已关闭，停止发送');
        break;
      }
      
      const char = text[i];
      sseStream.sendData(char, `char-${i}`);
      
      // 添加延迟以模拟真实的生成过程
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    
    // 发送完成消息
    sseStream.sendDone({
      message: '文本生成完成',
      totalChars: text.length
    });
    
  } catch (error) {
    console.error('模拟流式文本生成时出错:', error);
    sseStream.sendError(error instanceof Error ? error : '生成过程中发生错误');
  }
}
