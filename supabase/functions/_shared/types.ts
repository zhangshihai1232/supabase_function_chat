/**
 * 共享类型定义文件
 * 包含整个应用中使用的所有 TypeScript 类型定义
 */

/**
 * 聊天消息接口
 * 定义单条聊天消息的结构
 */
export interface ChatMessage {
  /** 消息角色：用户、助手或系统 */
  role: 'user' | 'assistant' | 'system';
  /** 消息内容 */
  content: string;
  /** 消息时间戳（可选） */
  timestamp?: string;
}

/**
 * 聊天请求接口
 * 定义客户端发送给服务器的聊天请求结构
 */
export interface ChatRequest {
  /** 用户发送的消息内容 */
  message: string;
  /** 对话历史记录（可选），用于上下文理解 */
  conversation_history?: ChatMessage[];
  /** 用户ID（可选），用于身份识别 */
  user_id?: string;
  /** 会话ID（可选），用于区分不同的对话会话 */
  session_id?: string;
  /** 对话ID（可选），用于标识对话会话 */
  conversation_id?: string;
  /** 是否启用流式响应（可选） */
  stream?: boolean;
}

/**
 * 聊天响应接口
 * 定义服务器返回给客户端的响应结构
 */
export interface ChatResponse {
  /** AI助手回复的消息内容 */
  message: string;
  /** 对话ID（可选），用于标识这次对话 */
  conversation_id?: string;
  /** 响应时间戳 */
  timestamp: string;
  /** 用户ID（可选） */
  user_id?: string;
}

/**
 * Gemini AI 配置接口
 * 定义调用 Google Gemini API 所需的配置参数
 */
export interface GeminiConfig {
  /** Gemini API 密钥 */
  apiKey: string;
  /** 使用的模型名称（可选），默认为 gemini-pro */
  model?: string;
  /** 生成温度（可选），控制回复的创造性，0-1之间 */
  temperature?: number;
  /** 最大生成token数（可选） */
  maxTokens?: number;
}

/**
 * 认证用户接口
 * 定义通过身份验证后的用户信息结构
 */
export interface AuthUser {
  /** 用户唯一标识符 */
  id: string;
  /** 用户唯一标识符（兼容字段） */
  user_id: string;
  /** 用户邮箱（可选） */
  email?: string;
  /** 用户角色（可选），如 admin、user 等 */
  role?: string;
}

/**
 * 数据库记录接口
 * 定义存储在 Supabase 数据库中的对话记录结构
 */
export interface DatabaseRow {
  /** 记录唯一标识符 */
  id: string;
  /** 用户ID，关联到具体用户 */
  user_id: string;
  /** 对话ID，用于将多条消息归类到同一对话 */
  conversation_id: string;
  /** 消息类型：用户消息或助手回复 */
  message_type: 'user' | 'assistant';
  /** 消息内容 */
  content: string;
  /** 创建时间 */
  created_at: string;
  /** 额外的元数据（可选），JSON格式存储其他信息 */
  metadata?: Record<string, any>;
}

/**
 * HTTP 请求处理器接口
 * 定义标准的 HTTP 处理函数签名
 */
export interface HttpHandler {
  (req: Request): Promise<Response>;
}

/**
 * 路由处理器接口
 * 定义路由系统中处理器的标准接口
 */
export interface RouteHandler {
  /** HTTP 方法 */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';
  /** 路径模式 */
  path: string;
  /** 处理函数 */
  handler: HttpHandler;
}

/**
 * 标准 API 响应接口
 * 定义统一的 API 响应格式
 */
export interface ApiResponse<T = any> {
  /** 是否成功 */
  success: boolean;
  /** 响应数据（成功时） */
  data?: T;
  /** 错误信息（失败时） */
  error?: {
    /** 错误代码 */
    code: string;
    /** 错误消息 */
    message: string;
    /** 详细信息（可选） */
    details?: any;
  };
  /** 响应时间戳 */
  timestamp: string;
  /** 请求ID（用于追踪） */
  request_id?: string;
}

/**
 * 服务状态响应接口
 * 定义服务状态查询的响应格式
 */
export interface ServiceStatusResponse {
  /** 服务状态 */
  status: 'running' | 'stopped' | 'error';
  /** 服务名称 */
  service: string;
  /** 版本号 */
  version: string;
  /** 存储类型 */
  storage: string;
  /** 统计信息 */
  statistics?: Record<string, any>;
  /** 功能列表 */
  features?: string[];
  /** 时间戳 */
  timestamp: string;
}
