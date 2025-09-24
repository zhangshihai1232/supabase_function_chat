#!/usr/bin/env node

/**
 * Node.js SSE 客户端测试脚本
 * 用于测试与 Supabase Edge Function (chat) 的 SSE 通信
 */

const fs = require('fs');
const path = require('path');

// 简单的 .env 解析器
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env 文件不存在');
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
  
  return env;
}

class SSEClient {
  constructor(supabaseUrl, anonKey, useLocal = false) {
    this.supabaseUrl = supabaseUrl;
    this.anonKey = anonKey;
    this.useLocal = useLocal;
  }

  async sendChatRequest(messages) {
    // 根据 useLocal 参数选择使用本地服务器还是远程服务器
    const url = this.useLocal ? 
      'http://localhost:8000/chat' : 
      `${this.supabaseUrl}/functions/v1/chat`;
    
    console.log(`🚀 连接到: ${url}`);
    console.log(`📝 发送消息: ${JSON.stringify(messages, null, 2)}`);
    console.log('📡 等待流式响应...\n');

    // 根据服务器类型调整请求格式
    const request = this.useLocal ? 
      {
        // 本地服务器格式：单个消息字符串
        message: messages[0].content,
        stream: true
      } : 
      {
        // Supabase 服务器格式：也是单个消息字符串
        message: messages[0].content,
        stream: true
      };

    try {
      // 根据是否使用本地服务器调整请求头
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      };
      
      // 只有在使用远程服务器时才添加 Authorization 头
      if (!this.useLocal) {
        headers['Authorization'] = `Bearer ${this.anonKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('响应体为空');
      }

      // 处理 SSE 流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      console.log('🤖 AI 回复:');
      console.log('─'.repeat(50));

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('\n─'.repeat(50));
            console.log('✅ 流式响应完成');
            break;
          }

          // 解码数据块
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // 处理完整的 SSE 事件
          const events = buffer.split('\n\n');
          buffer = events.pop() || ''; // 保留不完整的事件

          for (const event of events) {
            if (event.trim()) {
              this.processSSEEvent(event);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      console.error('❌ 请求失败:', error.message);
      
      if (error.message.includes('HTTP 401')) {
        console.log('🔑 可能是认证问题，请检查 SUPABASE_ANON_KEY');
      } else if (error.message.includes('HTTP 404')) {
        console.log('🔍 函数未找到，请确认 chat 函数已正确部署');
      } else if (error.message.includes('Failed to fetch')) {
        console.log('🌐 网络连接问题，请检查 SUPABASE_URL 和网络连接');
      }
    }
  }

  processSSEEvent(event) {
    const lines = event.split('\n');
    let eventType = '';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        data += line.substring(5).trim();
      }
    }

    if (eventType === 'error') {
      console.error(`\n❌ 服务器错误: ${data}`);
      return;
    }

    if (eventType === 'done') {
      console.log(`\n\n✅ 流式响应完成`);
      return; // 流结束标记
    }

    if (eventType === 'start') {
      console.log(data);
      return;
    }

    if (data && eventType === 'data') {
      try {
        // 尝试解析为JSON
        const parsed = JSON.parse(data);
        
        if (parsed.content) {
          // 打印内容，不换行
          process.stdout.write(parsed.content);
        } else if (parsed.error) {
          console.error(`\n❌ 错误: ${parsed.error}`);
        } else {
          // 如果JSON中没有content字段，输出原始数据
          process.stdout.write(data);
        }
      } catch (e) {
        // 如果不是 JSON，直接输出原始数据
        process.stdout.write(data);
      }
    }
  }
}

async function main() {
  console.log('🔧 SSE 客户端测试工具 (Node.js)');
  console.log('=' .repeat(50));

  try {
    // 加载环境变量
    const env = loadEnv();
    
    const supabaseUrl = env.SUPABASE_URL;
    const anonKey = env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      console.error('❌ 缺少必要的环境变量:');
      console.error('   - SUPABASE_URL');
      console.error('   - SUPABASE_ANON_KEY');
      console.error('请检查 .env 文件');
      process.exit(1);
    }

    // 检查命令行参数是否包含 --local 标志
    const useLocal = process.argv.includes('--local');
    
    if (useLocal) {
      console.log('🏠 使用本地服务器模式');
      console.log('🔗 本地服务器: http://localhost:8000');
    } else {
      console.log(`🔗 Supabase URL: ${supabaseUrl}`);
      console.log(`🔑 使用匿名密钥: ${anonKey.substring(0, 20)}...`);
    }
    console.log('');

    const client = new SSEClient(supabaseUrl, anonKey, useLocal);

    // 获取命令行参数作为消息，过滤掉 --local 标志
    const args = process.argv.slice(2).filter(arg => arg !== '--local');
    const userMessage = args.length > 0 ? args.join(' ') : '你好，请简单介绍一下你自己';

    const messages = [
      {
        role: 'user',
        content: userMessage
      }
    ];

    await client.sendChatRequest(messages);

  } catch (error) {
    console.error('❌ 初始化失败:', error.message);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(console.error);
}
