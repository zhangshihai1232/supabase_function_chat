/**
 * 日志系统测试脚本
 * 用于验证全程串联的日志输出功能
 */

const BASE_URL = 'http://localhost:8000';

async function testStandardChat() {
  console.log('\n=== 测试标准聊天请求 ===');
  
  try {
    const response = await fetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: '请简短回复：你好',
        stream: false
      })
    });

    const result = await response.json();
    console.log('✅ 标准聊天测试成功');
    console.log(`响应长度: ${JSON.stringify(result).length} 字符`);
    
  } catch (error) {
    console.error('❌ 标准聊天测试失败:', error.message);
  }
}

async function testStreamingChat() {
  console.log('\n=== 测试流式聊天请求 ===');
  
  try {
    const response = await fetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: '请用流式方式简短回复：测试流式响应',
        stream: true
      })
    });

    if (!response.body) {
      throw new Error('响应体为空');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let chunkCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        const chunk = decoder.decode(value);
        chunkCount++;
        
        // 只显示前几个数据块
        if (chunkCount <= 3) {
          console.log(`数据块 ${chunkCount}:`, chunk.substring(0, 100));
        }
      }
    } finally {
      reader.releaseLock();
    }

    console.log(`✅ 流式聊天测试成功，接收到 ${chunkCount} 个数据块`);
    
  } catch (error) {
    console.error('❌ 流式聊天测试失败:', error.message);
  }
}

async function testStatusEndpoint() {
  console.log('\n=== 测试状态查询 ===');
  
  try {
    const response = await fetch(`${BASE_URL}/status`);
    const result = await response.json();
    
    console.log('✅ 状态查询测试成功');
    console.log(`服务状态: ${result.status}`);
    console.log(`存储类型: ${result.storage}`);
    console.log(`对话数量: ${result.statistics.total_conversations}`);
    
  } catch (error) {
    console.error('❌ 状态查询测试失败:', error.message);
  }
}

async function testErrorHandling() {
  console.log('\n=== 测试错误处理 ===');
  
  try {
    const response = await fetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // 故意发送无效数据
        invalidField: 'test'
      })
    });

    const result = await response.json();
    
    if (response.status === 400) {
      console.log('✅ 错误处理测试成功，正确返回400错误');
      console.log(`错误信息: ${result.error}`);
    } else {
      console.log('⚠️ 错误处理测试异常，未返回预期错误状态');
    }
    
  } catch (error) {
    console.error('❌ 错误处理测试失败:', error.message);
  }
}

async function runAllTests() {
  console.log('🚀 开始日志系统测试');
  console.log('📊 测试将验证日志的事件编号、步骤跟踪和全程串联功能');
  
  await testStatusEndpoint();
  await testStandardChat();
  await testStreamingChat();
  await testErrorHandling();
  
  console.log('\n🎉 所有测试完成！');
  console.log('💡 请检查服务器日志，验证以下功能：');
  console.log('   1. 每个事件都有唯一编号');
  console.log('   2. 同一请求的事件有相同的请求ID');
  console.log('   3. 事件按时间顺序排列');
  console.log('   4. 每个步骤都有清晰的描述');
  console.log('   5. 错误事件被正确记录和处理');
}

// 运行测试
runAllTests().catch(console.error);
