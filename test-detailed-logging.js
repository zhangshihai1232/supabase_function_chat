#!/usr/bin/env node

const https = require('http');

const BASE_URL = 'http://localhost:8000';

// 测试标准聊天请求
function testStandardChat() {
  return new Promise((resolve, reject) => {
    const requestData = JSON.stringify({
      message: "这是一个详细日志测试消息，请简短回复",
      stream: false,
      conversation_id: "test_conversation_123"
    });

    const options = {
      hostname: 'localhost',
      port: 8000,
      path: '/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    console.log('\n🧪 测试标准聊天请求');
    console.log('📤 发送请求:', JSON.stringify(JSON.parse(requestData), null, 2));

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log('📥 收到响应:', JSON.stringify(response, null, 2));
          console.log('✅ 标准聊天测试完成\n');
          resolve(response);
        } catch (error) {
          console.log('❌ 响应解析失败:', error.message);
          console.log('原始响应:', data);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.log('❌ 请求失败:', error.message);
      reject(error);
    });

    req.write(requestData);
    req.end();
  });
}

// 测试流式聊天请求
function testStreamingChat() {
  return new Promise((resolve, reject) => {
    const requestData = JSON.stringify({
      message: "这是流式测试消息，请用3-5句话回复",
      stream: true
    });

    const options = {
      hostname: 'localhost',
      port: 8000,
      path: '/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    console.log('\n🌊 测试流式聊天请求');
    console.log('📤 发送请求:', JSON.stringify(JSON.parse(requestData), null, 2));

    const req = https.request(options, (res) => {
      let chunks = [];
      let chunkCount = 0;

      res.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        chunks.push(chunkStr);
        chunkCount++;
        
        // 只显示前几个数据块
        if (chunkCount <= 3) {
          console.log(`📦 数据块 ${chunkCount}:`, chunkStr.substring(0, 100) + (chunkStr.length > 100 ? '...' : ''));
        }
      });

      res.on('end', () => {
        const fullResponse = chunks.join('');
        console.log(`📥 流式响应完成，共 ${chunkCount} 个数据块`);
        console.log('✅ 流式聊天测试完成\n');
        resolve({ chunkCount, fullResponse });
      });
    });

    req.on('error', (error) => {
      console.log('❌ 流式请求失败:', error.message);
      reject(error);
    });

    req.write(requestData);
    req.end();
  });
}

// 主测试函数
async function runTests() {
  console.log('🚀 开始详细日志测试');
  console.log('=' .repeat(50));

  try {
    // 测试标准聊天
    await testStandardChat();
    
    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 测试流式聊天
    await testStreamingChat();
    
    console.log('🎉 所有测试完成！');
    console.log('请检查服务器端日志，确认以下信息是否都有打印：');
    console.log('  ✓ 传入的JSON请求体内容');
    console.log('  ✓ 解析后的请求参数');
    console.log('  ✓ 发送给AI的用户消息');
    console.log('  ✓ 发送给AI的完整请求体');
    console.log('  ✓ AI返回的响应内容');
    console.log('  ✓ 最终返回的JSON响应');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

// 检查服务是否运行
function checkService() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8000,
      path: '/status',
      method: 'GET',
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 200) {
        console.log('✅ 服务运行正常');
        resolve();
      } else {
        reject(new Error(`服务状态异常: ${res.statusCode}`));
      }
    });

    req.on('error', (error) => {
      reject(new Error(`无法连接到服务: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('连接服务超时'));
    });

    req.end();
  });
}

// 启动测试
checkService()
  .then(() => runTests())
  .catch((error) => {
    console.error('❌ 服务检查失败:', error.message);
    console.log('请确保服务已启动: deno run --allow-net --allow-env --allow-read supabase/functions/chat/index.ts');
    process.exit(1);
  });
