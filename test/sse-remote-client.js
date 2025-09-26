#!/usr/bin/env node

/**
 * 远端 SSE 客户端测试脚本
 * 专门用于测试与 Supabase Edge Function (chat) 的远程 SSE 通信
 */

const fs = require('fs');
const path = require('path');

// 简单的 .env 解析器
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    // 尝试从 docs/env 加载
    const docsEnvPath = path.join(__dirname, '..', 'docs', 'env');
    if (!fs.existsSync(docsEnvPath)) {
      throw new Error('环境配置文件不存在 (.env 或 docs/env)');
    }
    return loadEnvFromFile(docsEnvPath);
  }
  return loadEnvFromFile(envPath);
}

function loadEnvFromFile(filePath) {
  const envContent = fs.readFileSync(filePath, 'utf8');
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

class RemoteSSEClient {
  constructor(supabaseUrl, anonKey) {
    this.supabaseUrl = supabaseUrl;
    this.anonKey = anonKey;
  }

  async sendChatRequest(message) {
    const url = `${this.supabaseUrl}/functions/v1/chat`;
    
    console.log(`🚀 连接到远端服务器: ${url}`);
    console.log(`📝 发送消息: "${message}"`);
    console.log('📡 等待流式响应...\n');

    const request = {
      message: message,
      stream: true
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Authorization': `Bearer ${this.anonKey}`,
        },
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
            console.log('✅ 远端流式响应完成');
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
      console.error('❌ 远端请求失败:', error.message);
      
      if (error.message.includes('HTTP 401')) {
        console.log('🔑 认证失败，请检查 SUPABASE_ANON_KEY 是否正确');
      } else if (error.message.includes('HTTP 404')) {
        console.log('🔍 函数未找到，请确认 chat 函数已正确部署到 Supabase');
      } else if (error.message.includes('Failed to fetch')) {
        console.log('🌐 网络连接问题，请检查 SUPABASE_URL 和网络连接');
      } else if (error.message.includes('CORS')) {
        console.log('🚫 CORS 错误，请检查 Supabase Edge Function 的 CORS 配置');
      }
      
      console.log('\n🔧 调试信息:');
      console.log(`   URL: ${this.supabaseUrl}/functions/v1/chat`);
      console.log(`   Key: ${this.anonKey.substring(0, 20)}...`);
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
      return;
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
  console.log('🌐 远端 SSE 客户端测试工具');
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
      console.error('请检查 .env 或 docs/env 文件');
      process.exit(1);
    }

    console.log(`🔗 Supabase URL: ${supabaseUrl}`);
    console.log(`🔑 使用匿名密钥: ${anonKey.substring(0, 20)}...`);
    console.log('🌐 模式: 仅远端测试');
    console.log('');

    const client = new RemoteSSEClient(supabaseUrl, anonKey);

    // 获取命令行参数作为消息
    const args = process.argv.slice(2);
    const userMessage = args.length > 0 ? args.join(' ') : '你好，这是远端SSE测试，请简单介绍一下你自己';

    await client.sendChatRequest(userMessage);

  } catch (error) {
    console.error('❌ 初始化失败:', error.message);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { RemoteSSEClient };
