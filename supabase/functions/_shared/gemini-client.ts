/**
 * Google Gemini AI 客户端模块
 * 负责与 Google Gemini API 进行交互，处理聊天请求和响应
 */

import type { ChatMessage, GeminiConfig } from './types.ts';

/**
 * Gemini API 响应接口
 * 定义从 Gemini API 返回的原始响应结构
 */
interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
      role: string;
    };
    finishReason: string;
    index: number;
    safetyRatings: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  promptFeedback?: {
    safetyRatings: Array<{
      category: string;
      probability: string;
    }>;
  };
}

/**
 * Gemini 客户端类
 * 封装了与 Google Gemini API 交互的所有方法
 */
export class GeminiClient {
  private config: GeminiConfig;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

  /**
   * 构造函数
   * @param config Gemini API 配置对象
   */
  constructor(config: GeminiConfig) {
    this.config = {
      model: 'gemini-pro',      // 默认使用 gemini-pro 模型
      temperature: 0.7,         // 默认温度为 0.7，平衡创造性和准确性
      maxTokens: 2048,          // 默认最大 token 数
      ...config                 // 覆盖默认配置
    };
  }

  /**
   * 发送聊天消息到 Gemini API
   * 
   * 工作流程：
   * 1. 构建请求体，包含消息历史和配置参数
   * 2. 发送 HTTP POST 请求到 Gemini API
   * 3. 解析响应并提取生成的文本
   * 4. 返回处理后的响应文本
   * 
   * @param message 用户输入的消息
   * @param conversationHistory 对话历史记录（可选）
   * @returns Promise<string> AI 生成的回复文本
   */
  async chat(message: string, conversationHistory?: ChatMessage[]): Promise<string> {
    try {
      console.log('开始调用 Gemini API...');
      console.log('用户消息:', message);
      
      // 步骤1: 构建请求体
      const requestBody = this.buildRequestBody(message, conversationHistory);
      
      // 步骤2: 构建 API 请求 URL
      const apiUrl = `${this.baseUrl}/${this.config.model}:generateContent?key=${this.config.apiKey}`;
      
      // 步骤3: 发送 HTTP 请求
      console.log('发送请求到 Gemini API...');
      console.log('Request URL:', apiUrl);
      console.log('Request Body:', JSON.stringify(requestBody, null, 2));
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      // 步骤4: 检查响应状态
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API 请求失败:', response.status, errorText);
        throw new Error(`Gemini API 错误 (${response.status}): ${errorText}`);
      }

      // 步骤5: 解析响应 JSON
      const data: GeminiResponse = await response.json();
      console.log('收到 Gemini API 响应');

      // 步骤6: 提取生成的文本
      const generatedText = this.extractTextFromResponse(data);
      
      console.log('AI 回复:', generatedText);
      return generatedText;

    } catch (error) {
      console.error('Gemini API 调用失败:', error);
      
      // 返回友好的错误消息
      if (error instanceof Error) {
        throw new Error(`AI 服务暂时不可用: ${error.message}`);
      } else {
        throw new Error('AI 服务暂时不可用，请稍后重试');
      }
    }
  }

  /**
   * 构建发送给 Gemini API 的请求体
   * 
   * @param message 用户当前消息
   * @param conversationHistory 对话历史记录
   * @returns 格式化的请求体对象
   */
  private buildRequestBody(message: string, conversationHistory?: ChatMessage[]) {
    // 构建对话内容数组
    const contents: { role: string; parts: { text: string }[] }[] = [];
    
    // 如果有对话历史，先添加历史消息
    if (conversationHistory && conversationHistory.length > 0) {
      for (const historyMessage of conversationHistory) {
        // 跳过系统消息，Gemini API 不直接支持
        if (historyMessage.role === 'system') continue;
        
        contents.push({
          role: historyMessage.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: historyMessage.content }]
        });
      }
    }
    
    // 添加当前用户消息
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    // 构建完整的请求体
    const requestBody = {
      contents: contents,
      generationConfig: {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxTokens,
        topP: 0.8,              // 控制词汇多样性
        topK: 40,               // 限制候选词汇数量
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        }
      ]
    };

    return requestBody;
  }

  /**
   * 从 Gemini API 响应中提取生成的文本
   * 
   * @param response Gemini API 原始响应对象
   * @returns 提取的文本内容
   */
  private extractTextFromResponse(response: GeminiResponse): string {
    // 检查响应是否包含候选结果
    if (!response.candidates || response.candidates.length === 0) {
      console.error('Gemini API 响应中没有候选结果');
      throw new Error('AI 没有生成有效的回复');
    }

    const candidate = response.candidates[0];
    
    // 检查是否因安全原因被阻止
    if (candidate.finishReason === 'SAFETY') {
      console.warn('响应因安全原因被阻止');
      throw new Error('抱歉，您的请求涉及敏感内容，无法生成回复');
    }

    // 检查是否包含内容
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      console.error('候选结果中没有内容部分');
      throw new Error('AI 没有生成有效的回复内容');
    }

    // 提取并组合所有文本部分
    const textParts = candidate.content.parts
      .filter(part => part.text)  // 过滤掉空文本
      .map(part => part.text);

    if (textParts.length === 0) {
      console.error('没有找到有效的文本内容');
      throw new Error('AI 没有生成有效的文本回复');
    }

    // 合并所有文本部分
    return textParts.join('').trim();
  }

  /**
   * 生成响应（标准方法别名）
   * 
   * @param message 用户消息
   * @param conversationHistory 对话历史
   * @returns Promise<string> AI 回复
   */
  async generateResponse(message: string, conversationHistory?: ChatMessage[]): Promise<string> {
    return this.chat(message, conversationHistory);
  }

  /**
   * 生成流式响应
   * 
   * @param message 用户消息
   * @param conversationHistory 对话历史
   * @returns AsyncGenerator<string> 流式响应生成器
   */
  async* generateStreamingResponse(message: string, conversationHistory?: ChatMessage[]): AsyncGenerator<string> {
    try {
      console.log('开始流式调用 Gemini API...');
      console.log('用户消息:', message);
      
      // 构建请求体
      const requestBody = this.buildRequestBody(message, conversationHistory);
      
      // 构建流式 API 请求 URL
      const apiUrl = `${this.baseUrl}/${this.config.model}:streamGenerateContent?key=${this.config.apiKey}`;
      
      console.log('发送流式请求到 Gemini API...');
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API 流式请求失败:', response.status, errorText);
        throw new Error(`Gemini API 错误 (${response.status}): ${errorText}`);
      }

      if (!response.body) {
        throw new Error('响应体为空');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          
          // Gemini API 返回格式可能是逗号分隔的JSON对象
          // 处理类似 ",\n{...}\n,\n{...}" 的格式
          
          // 移除开头的逗号和空白字符
          buffer = buffer.replace(/^[\s,]+/, '');
          
          // 寻找完整的JSON对象
          let processedAny = false;
          
          while (buffer.length > 0) {
            // 跳过开头的逗号和空白字符
            let startIndex = 0;
            while (startIndex < buffer.length && /[\s,]/.test(buffer[startIndex])) {
              startIndex++;
            }
            
            if (startIndex >= buffer.length) {
              break;
            }
            
            // 从第一个 { 开始寻找完整的JSON对象
            if (buffer[startIndex] !== '{') {
              // 如果不是以{开头，寻找下一个{
              const nextBraceIndex = buffer.indexOf('{', startIndex);
              if (nextBraceIndex === -1) {
                break;
              }
              startIndex = nextBraceIndex;
            }
            
            // 寻找匹配的 }
            let braceCount = 0;
            let inString = false;
            let escaped = false;
            let endIndex = -1;
            
            for (let i = startIndex; i < buffer.length; i++) {
              const char = buffer[i];
              
              if (escaped) {
                escaped = false;
                continue;
              }
              
              if (char === '\\') {
                escaped = true;
                continue;
              }
              
              if (char === '"') {
                inString = !inString;
                continue;
              }
              
              if (!inString) {
                if (char === '{') {
                  braceCount++;
                } else if (char === '}') {
                  braceCount--;
                  if (braceCount === 0) {
                    endIndex = i;
                    break;
                  }
                }
              }
            }
            
            if (endIndex !== -1) {
              // 找到完整的JSON对象
              const jsonStr = buffer.substring(startIndex, endIndex + 1);
              
              try {
                const data = JSON.parse(jsonStr);
                console.log('✅ 成功解析JSON响应');
                
                if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                  const parts = data.candidates[0].content.parts;
                  if (parts && parts[0] && parts[0].text) {
                    yield parts[0].text;
                  }
                }
                
                processedAny = true;
              } catch (parseError) {
                console.warn('JSON解析失败:', parseError);
                console.warn('尝试解析的JSON:', jsonStr);
              }
              
              // 移除已处理的部分
              buffer = buffer.substring(endIndex + 1);
            } else {
              // 没有找到完整的JSON对象，等待更多数据
              break;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('Gemini API 流式调用失败:', error);
      throw new Error(`AI 流式服务暂时不可用: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 验证 API 密钥是否有效
   * 通过发送一个简单的测试请求来验证
   * 
   * @returns Promise<boolean> API 密钥是否有效
   */
  async validateApiKey(): Promise<boolean> {
    try {
      console.log('验证 Gemini API 密钥...');
      
      const testMessage = 'Hello';
      const response = await this.chat(testMessage);
      
      console.log('API 密钥验证成功');
      return response.length > 0;
    } catch (error) {
      console.error('API 密钥验证失败:', error);
      return false;
    }
  }
}

/**
 * 创建 Gemini 客户端实例的工厂函数
 * 从环境变量中读取配置并创建客户端
 * 
 * @returns GeminiClient 配置好的 Gemini 客户端实例
 */
export function createGeminiClient(): GeminiClient {
  // 从环境变量获取 API 密钥
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  
  if (!apiKey) {
    throw new Error('缺少必要的环境变量: GEMINI_API_KEY');
  }

  // 创建配置对象
  const config: GeminiConfig = {
    apiKey: apiKey,
    model: Deno.env.get('GEMINI_MODEL')?.toLowerCase() || 'gemini-pro',
    temperature: parseFloat(Deno.env.get('GEMINI_TEMPERATURE') || '0.7'),
    maxTokens: parseInt(Deno.env.get('GEMINI_MAX_TOKENS') || '2048'),
  };

  console.log('创建 Gemini 客户端，模型:', config.model);
  return new GeminiClient(config);
}
