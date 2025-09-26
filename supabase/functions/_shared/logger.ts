/**
 * 统一日志管理器
 * 提供全程串联的日志输出，每个事件有编号和步骤顺序
 * 
 * 重要修改：
 * - 移除全局事件计数器，每个请求独立编号
 * - 每个请求的事件编号从1开始
 * - 日志按请求收集，完成后一次性输出
 */

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS'
}

/**
 * 日志事件类型
 */
export enum LogEventType {
  // 系统启动相关
  SYSTEM_START = 'SYSTEM_START',
  SYSTEM_READY = 'SYSTEM_READY',
  
  // 请求处理相关
  REQUEST_RECEIVED = 'REQUEST_RECEIVED',
  REQUEST_PARSING = 'REQUEST_PARSING',
  REQUEST_VALIDATION = 'REQUEST_VALIDATION',
  REQUEST_ROUTING = 'REQUEST_ROUTING',
  
  // 认证相关
  AUTH_START = 'AUTH_START',
  AUTH_SUCCESS = 'AUTH_SUCCESS',
  AUTH_SKIP = 'AUTH_SKIP',
  
  // 聊天服务相关
  CHAT_START = 'CHAT_START',
  CHAT_TYPE_DETECTION = 'CHAT_TYPE_DETECTION',
  CHAT_STANDARD = 'CHAT_STANDARD',
  CHAT_STREAMING = 'CHAT_STREAMING',
  
  // SSE流相关
  SSE_STREAM_CREATE = 'SSE_STREAM_CREATE',
  SSE_STREAM_START = 'SSE_STREAM_START',
  SSE_MESSAGE_SEND = 'SSE_MESSAGE_SEND',
  SSE_STREAM_CLOSE = 'SSE_STREAM_CLOSE',
  
  // AI服务相关
  AI_CLIENT_CREATE = 'AI_CLIENT_CREATE',
  AI_REQUEST_START = 'AI_REQUEST_START',
  AI_REQUEST_SEND = 'AI_REQUEST_SEND',
  AI_RESPONSE_RECEIVED = 'AI_RESPONSE_RECEIVED',
  AI_RESPONSE_PARSE = 'AI_RESPONSE_PARSE',
  AI_STREAMING_START = 'AI_STREAMING_START',
  AI_STREAMING_CHUNK = 'AI_STREAMING_CHUNK',
  AI_STREAMING_END = 'AI_STREAMING_END',
  
  // 数据存储相关
  STORAGE_SAVE_START = 'STORAGE_SAVE_START',
  STORAGE_SAVE_SUCCESS = 'STORAGE_SAVE_SUCCESS',
  
  // 响应相关
  RESPONSE_BUILD = 'RESPONSE_BUILD',
  RESPONSE_SEND = 'RESPONSE_SEND',
  
  // 错误相关
  ERROR_OCCURRED = 'ERROR_OCCURRED',
  ERROR_HANDLED = 'ERROR_HANDLED',
  
  // 其他
  OPERATION_COMPLETE = 'OPERATION_COMPLETE'
}

/**
 * 日志条目接口
 */
interface LogEntry {
  /** 请求内事件序号（从1开始） */
  eventNumber: number;
  /** 请求ID */
  requestId: string;
  /** 时间戳 */
  timestamp: string;
  /** 日志级别 */
  level: LogLevel;
  /** 事件类型 */
  eventType: LogEventType;
  /** 日志消息 */
  message: string;
  /** 附加数据 */
  data?: any;
  /** 执行耗时(ms) */
  duration?: number;
  /** 步骤描述 */
  step?: string;
}

/**
 * 请求上下文接口
 */
interface RequestContext {
  requestId: string;
  startTime: number;
  eventCounter: number; // 请求内事件计数器（从1开始）
  method?: string;
  path?: string;
  userAgent?: string;
  logBuffer: LogEntry[]; // 日志缓冲区，收集本轮请求的所有日志
}

/**
 * 日志管理器类
 */
export class Logger {
  private static instance: Logger;
  private requestContexts: Map<string, RequestContext> = new Map();

  private constructor() {}

  /**
   * 获取日志管理器单例
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 创建新的请求上下文
   * @param request HTTP请求对象
   * @returns 请求ID
   */
  createRequestContext(request?: Request): string {
    const requestId = this.generateRequestId();
    const url = request ? new URL(request.url) : null;
    
    const context: RequestContext = {
      requestId,
      startTime: Date.now(),
      eventCounter: 0, // 从0开始，第一个日志将是1
      method: request?.method,
      path: url?.pathname,
      userAgent: request?.headers.get('user-agent') || undefined,
      logBuffer: [] // 初始化日志缓冲区
    };
    
    this.requestContexts.set(requestId, context);
    
    // 记录请求开始日志
    if (request) {
      this.log(requestId, LogLevel.INFO, LogEventType.REQUEST_RECEIVED, 
        `收到请求: ${request.method} ${url?.pathname}`, {
          method: request.method,
          path: url?.pathname,
          userAgent: context.userAgent
        }, '请求接收');
    }
    
    return requestId;
  }

  /**
   * 记录日志
   * @param requestId 请求ID
   * @param level 日志级别
   * @param eventType 事件类型
   * @param message 日志消息
   * @param data 额外数据
   * @param step 步骤描述
   */
  log(requestId: string, level: LogLevel, eventType: LogEventType, message: string, data?: any, step?: string): void {
    const context = this.requestContexts.get(requestId);
    if (!context) {
      // 对于找不到请求上下文的情况，创建一个临时上下文来记录日志
      // 这通常发生在异步操作中，如流式响应或后台任务
      this.logWithoutContext(requestId, level, eventType, message, data, step);
      return;
    }

    // 递增事件计数器（每个请求独立从1开始）
    context.eventCounter++;

    // 计算执行时长
    const duration = Date.now() - context.startTime;

    // 创建日志条目（使用请求内的事件编号）
    const logEntry: LogEntry = {
      eventNumber: context.eventCounter, // 请求内独立编号
      requestId,
      timestamp: new Date().toISOString(),
      level,
      eventType,
      message,
      data,
      duration,
      step
    };

    // 将日志添加到缓冲区，而不是立即输出
    context.logBuffer.push(logEntry);
  }

  /**
   * 记录没有请求上下文的日志（用于异步操作）
   * @param requestId 请求ID
   * @param level 日志级别
   * @param eventType 事件类型
   * @param message 日志消息
   * @param data 额外数据
   * @param step 步骤描述
   */
  private logWithoutContext(requestId: string, level: LogLevel, eventType: LogEventType, message: string, data?: any, step?: string): void {
    // 创建临时日志条目
    const logEntry: LogEntry = {
      eventNumber: 0, // 异步日志无法确定序号
      requestId,
      timestamp: new Date().toISOString(),
      level,
      eventType,
      message,
      data,
      duration: 0, // 无法计算耗时
      step
    };

    // 创建临时上下文用于格式化
    const tempContext: RequestContext = {
      requestId,
      startTime: Date.now(),
      eventCounter: 0, // 无法确定在请求中的序号
      logBuffer: [] // 异步日志不使用缓冲区
    };

    // 格式化并输出日志，但标记为异步操作
    this.outputLogAsync(logEntry, tempContext);
  }

  /**
   * 格式化并输出异步日志
   * @param entry 日志条目
   * @param context 临时请求上下文
   */
  private outputLogAsync(entry: LogEntry, context: RequestContext): void {
    // 构建异步日志前缀（与正常日志略有不同）
    const prefix = this.buildAsyncLogPrefix(entry, context);
    
    // 构建完整日志消息
    const fullMessage = `${prefix} ${entry.message}`;
    
    // 根据日志级别选择输出方法
    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(fullMessage, entry.data ? entry.data : '');
        break;
      case LogLevel.WARN:
        console.warn(fullMessage, entry.data ? entry.data : '');
        break;
      case LogLevel.SUCCESS:
        console.log(`✅ ${fullMessage}`, entry.data ? entry.data : '');
        break;
      case LogLevel.INFO:
        console.log(fullMessage, entry.data ? entry.data : '');
        break;
      case LogLevel.DEBUG:
        console.debug(fullMessage, entry.data ? entry.data : '');
        break;
      default:
        console.log(fullMessage, entry.data ? entry.data : '');
    }
  }

  /**
   * 构建异步日志前缀
   * @param entry 日志条目
   * @param context 临时请求上下文
   * @returns 格式化的异步日志前缀
   */
  private buildAsyncLogPrefix(entry: LogEntry, context: RequestContext): string {
    // 获取表情符号
    const emoji = this.getLogEmoji(entry.level, entry.eventType);
    
    // 构建基础前缀
    const basePrefix = `[async]`;
    
    // 构建请求信息（标记为异步）
    const requestInfo = `[${context.requestId.slice(-8)}*]`; // * 表示异步
    
    // 构建步骤信息
    const stepInfo = entry.step ? `[${entry.step}]` : '';
    
    // 异步日志没有准确的时长信息
    const durationInfo = `[async]`;
    
    // 异步日志的事件序号标记
    const eventSeq = `(async/async)`;
    
    return `${emoji} ${basePrefix}${requestInfo}${stepInfo}${durationInfo}${eventSeq}`;
  }

  /**
   * 格式化并输出日志
   * @param entry 日志条目
   * @param context 请求上下文
   */
  private outputLog(entry: LogEntry, context: RequestContext): void {
    try {
      // 构建日志前缀
      const prefix = this.buildLogPrefix(entry, context);
      
      // 构建完整日志消息
      const fullMessage = `${prefix} ${entry.message}`;
      
      // 安全地处理data对象，避免循环引用导致的栈溢出
      let dataToLog: any = '';
      if (entry.data) {
        try {
          // 限制数据对象的深度和大小，避免循环引用
          dataToLog = this.safeStringifyData(entry.data);
        } catch (stringifyError) {
          dataToLog = '[数据序列化失败]';
        }
      }
      
      // 根据日志级别选择输出方法
      switch (entry.level) {
        case LogLevel.ERROR:
          console.error(fullMessage, dataToLog);
          break;
        case LogLevel.WARN:
          console.warn(fullMessage, dataToLog);
          break;
        case LogLevel.SUCCESS:
          console.log(`✅ ${fullMessage}`, dataToLog);
          break;
        case LogLevel.INFO:
          console.log(fullMessage, dataToLog);
          break;
        case LogLevel.DEBUG:
          console.debug(fullMessage, dataToLog);
          break;
        default:
          console.log(fullMessage, dataToLog);
      }
    } catch (outputError) {
      // 如果日志输出本身出错，使用最简单的方式输出
      console.error(`日志输出失败: ${entry.message}`);
    }
  }

  /**
   * 安全地序列化数据，避免循环引用和栈溢出
   * @param data 要序列化的数据
   * @returns 安全的字符串表示
   */
  private safeStringifyData(data: any): string {
    try {
      // 限制对象深度和字符串长度
      const MAX_DEPTH = 3;
      const MAX_STRING_LENGTH = 1000;
      
      const seen = new WeakSet();
      
      const replacer = (key: string, value: any): any => {
        // 限制字符串长度
        if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
          return value.substring(0, MAX_STRING_LENGTH) + '...[截断]';
        }
        
        // 处理循环引用
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[循环引用]';
          }
          seen.add(value);
        }
        
        return value;
      };
      
      const result = JSON.stringify(data, replacer, 2);
      
      // 限制最终结果的长度
      if (result.length > MAX_STRING_LENGTH) {
        return result.substring(0, MAX_STRING_LENGTH) + '...[截断]';
      }
      
      return result;
    } catch (error) {
      return '[序列化失败: ' + (error instanceof Error ? error.message : '未知错误') + ']';
    }
  }

  /**
   * 构建日志前缀（使用请求内独立编号）
   * @param entry 日志条目
   * @param context 请求上下文
   * @returns 格式化的日志前缀
   */
  private buildLogPrefix(entry: LogEntry, context: RequestContext): string {
    // 获取表情符号
    const emoji = this.getLogEmoji(entry.level, entry.eventType);
    
    // 构建基础前缀（使用请求内编号，4位数字补零）
    const basePrefix = `[${entry.eventNumber.toString().padStart(4, '0')}]`;
    
    // 构建请求信息
    const requestInfo = `[${context.requestId.slice(-8)}]`;
    
    // 构建步骤信息
    const stepInfo = entry.step ? `[${entry.step}]` : '';
    
    // 构建时长信息
    const durationInfo = `[${entry.duration}ms]`;
    
    // 构建事件序号（请求内编号/总事件数）
    const eventSeq = `(${entry.eventNumber}/${context.logBuffer.length})`;
    
    return `${emoji} ${basePrefix}${requestInfo}${stepInfo}${durationInfo}${eventSeq}`;
  }

  /**
   * 获取日志表情符号
   * @param level 日志级别
   * @param eventType 事件类型
   * @returns 表情符号
   */
  private getLogEmoji(level: LogLevel, eventType: LogEventType): string {
    // 优先根据事件类型返回特定表情符号
    switch (eventType) {
      case LogEventType.SYSTEM_START:
        return '🚀';
      case LogEventType.SYSTEM_READY:
        return '✅';
      case LogEventType.REQUEST_RECEIVED:
        return '📨';
      case LogEventType.REQUEST_PARSING:
        return '🔍';
      case LogEventType.REQUEST_VALIDATION:
        return '✔️';
      case LogEventType.REQUEST_ROUTING:
        return '🎯';
      case LogEventType.AUTH_START:
        return '🔐';
      case LogEventType.AUTH_SUCCESS:
        return '🔓';
      case LogEventType.AUTH_SKIP:
        return '⏭️';
      case LogEventType.CHAT_START:
        return '💬';
      case LogEventType.CHAT_TYPE_DETECTION:
        return '🔍';
      case LogEventType.CHAT_STANDARD:
        return '💭';
      case LogEventType.CHAT_STREAMING:
        return '🌊';
      case LogEventType.SSE_STREAM_CREATE:
        return '🔄';
      case LogEventType.SSE_STREAM_START:
        return '📡';
      case LogEventType.SSE_MESSAGE_SEND:
        return '📤';
      case LogEventType.SSE_STREAM_CLOSE:
        return '🔒';
      case LogEventType.AI_CLIENT_CREATE:
        return '🤖';
      case LogEventType.AI_REQUEST_START:
        return '🧠';
      case LogEventType.AI_REQUEST_SEND:
        return '📤';
      case LogEventType.AI_RESPONSE_RECEIVED:
        return '📥';
      case LogEventType.AI_RESPONSE_PARSE:
        return '🔧';
      case LogEventType.AI_STREAMING_START:
        return '🌊';
      case LogEventType.AI_STREAMING_CHUNK:
        return '📦';
      case LogEventType.AI_STREAMING_END:
        return '🏁';
      case LogEventType.STORAGE_SAVE_START:
        return '💾';
      case LogEventType.STORAGE_SAVE_SUCCESS:
        return '✅';
      case LogEventType.RESPONSE_BUILD:
        return '🔨';
      case LogEventType.RESPONSE_SEND:
        return '📤';
      case LogEventType.ERROR_OCCURRED:
        return '💥';
      case LogEventType.ERROR_HANDLED:
        return '🛠️';
      case LogEventType.OPERATION_COMPLETE:
        return '🎉';
      default:
        // 根据日志级别返回通用表情符号
        switch (level) {
          case LogLevel.ERROR:
            return '❌';
          case LogLevel.WARN:
            return '⚠️';
          case LogLevel.SUCCESS:
            return '✅';
          case LogLevel.INFO:
            return 'ℹ️';
          case LogLevel.DEBUG:
            return '🔍';
          default:
            return '📝';
        }
    }
  }

  /**
   * 记录成功日志
   */
  success(requestId: string, eventType: LogEventType, message: string, data?: any, step?: string): void {
    this.log(requestId, LogLevel.SUCCESS, eventType, message, data, step);
  }

  /**
   * 记录信息日志
   */
  info(requestId: string, eventType: LogEventType, message: string, data?: any, step?: string): void {
    this.log(requestId, LogLevel.INFO, eventType, message, data, step);
  }

  /**
   * 记录警告日志
   */
  warn(requestId: string, eventType: LogEventType, message: string, data?: any, step?: string): void {
    this.log(requestId, LogLevel.WARN, eventType, message, data, step);
  }

  /**
   * 记录错误日志
   */
  error(requestId: string, eventType: LogEventType, message: string, data?: any, step?: string): void {
    this.log(requestId, LogLevel.ERROR, eventType, message, data, step);
  }

  /**
   * 记录调试日志
   */
  debug(requestId: string, eventType: LogEventType, message: string, data?: any, step?: string): void {
    this.log(requestId, LogLevel.DEBUG, eventType, message, data, step);
  }

  /**
   * 清理请求上下文并输出所有缓存的日志
   * @param requestId 请求ID
   */
  cleanupRequestContext(requestId: string): void {
    const context = this.requestContexts.get(requestId);
    if (context) {
      const totalDuration = Date.now() - context.startTime;
      
      // 递增计数器并添加最终的完成日志
      context.eventCounter++;
      const completionEntry: LogEntry = {
        eventNumber: context.eventCounter, // 使用递增后的计数器
        requestId,
        timestamp: new Date().toISOString(),
        level: LogLevel.SUCCESS,
        eventType: LogEventType.OPERATION_COMPLETE,
        message: `请求处理完成，总耗时: ${totalDuration}ms，事件数: ${context.eventCounter}`,
        data: {
          totalDuration,
          eventCount: context.eventCounter,
          method: context.method,
          path: context.path
        },
        duration: totalDuration,
        step: '请求完成'
      };
      
      context.logBuffer.push(completionEntry);
      
      // 一次性输出所有缓存的日志
      this.flushLogBuffer(context);
      
      this.requestContexts.delete(requestId);
    }
  }

  /**
   * 输出缓冲区中的所有日志
   * @param context 请求上下文
   */
  private flushLogBuffer(context: RequestContext): void {
    console.log(`\n=== 📋 请求处理日志 [${context.requestId.slice(-8)}] ===`);
    console.log(`🔗 ${context.method || 'UNKNOWN'} ${context.path || 'UNKNOWN'}`);
    console.log(`⏰ 开始时间: ${new Date(context.startTime).toISOString()}`);
    console.log(`📊 事件总数: ${context.logBuffer.length}`);
    console.log('─'.repeat(80));
    
    // 按顺序输出所有日志
    context.logBuffer.forEach((entry, index) => {
      this.outputLog(entry, context);
    });
    
    console.log('─'.repeat(80));
    console.log(`✅ 请求 [${context.requestId.slice(-8)}] 处理完成\n`);
  }

  /**
   * 生成请求ID
   * @returns 唯一的请求ID
   */
  private generateRequestId(): string {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `req_${timestamp}_${randomStr}`;
  }

  /**
   * 获取当前活跃的请求数量
   */
  getActiveRequestCount(): number {
    return this.requestContexts.size;
  }

  /**
   * 系统启动日志（立即输出，不缓存）
   */
  logSystemStart(): void {
    console.log('\n🚀 ═══════════════════════════════════════════════════════════════');
    console.log('🚀                     聊天服务启动中...                      🚀');
    console.log('🚀 ═══════════════════════════════════════════════════════════════');
    console.log('📁 架构: 轻量级 (无Oak依赖)');
    console.log('🤖 AI: Google Gemini');
    console.log('📡 流式响应: 支持 (SSE)');
    console.log('🔓 认证模式: 匿名用户');
    console.log('💾 存储: 内存存储');
    console.log('✅ 聊天服务已就绪');
    console.log('🚀 ═══════════════════════════════════════════════════════════════\n');
  }
}

/**
 * 获取日志管理器实例的便捷函数
 */
export function getLogger(): Logger {
  return Logger.getInstance();
}

/**
 * 创建请求日志上下文的便捷函数
 */
export function createRequestLogger(request?: Request): string {
  return getLogger().createRequestContext(request);
}