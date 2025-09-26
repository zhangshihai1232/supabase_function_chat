/**
 * 缓存日志系统测试脚本
 * 验证日志按请求收集并一次性输出的功能
 */

const BASE_URL = 'http://localhost:8000';

async function testBufferedLogging() {
  console.log('🧪 开始测试缓存日志系统');
  console.log('📝 此测试将验证日志按请求收集并批量输出的功能');
  console.log('=' .repeat(60));

  // 测试1: 状态查询
  console.log('\n📊 测试 1: 状态查询请求');
  try {
    const response = await fetch(`${BASE_URL}/status`);
    const result = await response.json();
    console.log('✅ 状态查询成功');
    console.log('💡 检查服务器日志 - 应该看到完整的请求处理日志块');
  } catch (error) {
    console.error('❌ 状态查询失败:', error.message);
  }

  // 等待一下，让日志输出
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 测试2: 标准聊天
  console.log('\n💬 测试 2: 标准聊天请求');
  try {
    const response = await fetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: '简短回复测试',
        stream: false
      })
    });

    const result = await response.json();
    console.log('✅ 标准聊天成功');
    console.log('💡 检查服务器日志 - 应该看到从请求接收到响应发送的完整日志块');
  } catch (error) {
    console.error('❌ 标准聊天失败:', error.message);
  }

  // 等待一下，让日志输出
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 测试3: 流式聊天
  console.log('\n🌊 测试 3: 流式聊天请求');
  try {
    const response = await fetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: '测试流式',
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

        chunkCount++;
        if (chunkCount > 3) break; // 只读取前几个块
      }
    } finally {
      reader.releaseLock();
    }

    console.log('✅ 流式聊天成功');
    console.log('💡 检查服务器日志 - 应该看到流式处理的完整日志块');
  } catch (error) {
    console.error('❌ 流式聊天失败:', error.message);
  }

  // 等待一下，让流式日志输出
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 测试4: 错误请求
  console.log('\n❌ 测试 4: 错误请求处理');
  try {
    const response = await fetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invalidField: 'test'
      })
    });

    const result = await response.json();
    console.log('✅ 错误处理成功');
    console.log('💡 检查服务器日志 - 应该看到错误处理的完整日志块');
  } catch (error) {
    console.error('❌ 错误处理测试失败:', error.message);
  }

  console.log('\n🎉 缓存日志系统测试完成！');
  console.log('📋 预期效果:');
  console.log('   1. 每个请求的日志应该集中在一个块中');
  console.log('   2. 日志块以分隔线和标题开始');
  console.log('   3. 包含请求方法、路径、开始时间、事件总数');
  console.log('   4. 所有步骤按顺序显示，带有事件编号');
  console.log('   5. 日志块以完成信息结束');
  console.log('   6. 不同请求的日志块清晰分离');
}

// 运行测试
testBufferedLogging().catch(console.error);
