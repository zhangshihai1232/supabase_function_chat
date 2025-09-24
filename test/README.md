# SSE 客户端测试工具

这个测试工具用于测试与 Supabase Edge Function (chat) 的 Server-Sent Events (SSE) 通信。

## 📁 文件说明

- `sse-client.js` - Node.js 版本的 SSE 客户端  
- `run-test.sh` - 便捷的运行脚本
- `README.md` - 使用说明

## 🚀 使用方法

```bash
# 进入 test 目录
cd test

# 使用默认消息测试
node sse-client.js

# 或者自定义消息
node sse-client.js "请解释一下人工智能的发展历程"

# 使用运行脚本
./run-test.sh "你好，请介绍一下你自己"
```

## 🔧 环境要求

- 需要 Node.js 18+ (支持 fetch API)
- 无需额外依赖

## 📋 功能特性

- ✅ 自动加载 `.env` 配置
- ✅ 支持流式 SSE 响应
- ✅ 实时在控制台显示 AI 回复
- ✅ 错误处理和诊断提示
- ✅ 支持自定义消息内容
- ✅ 彩色输出和进度指示

## 🔍 测试输出示例

```
🔧 SSE 客户端测试工具
==================================================
🔗 Supabase URL: https://gxjawkhxtaijigdchtxs.supabase.co
🔑 使用匿名密钥: eyJhbGciOiJIUzI1NiIs...
🚀 连接到: https://gxjawkhxtaijigdchtxs.supabase.co/functions/v1/chat
📝 发送消息: [
  {
    "role": "user",
    "content": "你好，请简单介绍一下你自己"
  }
]
📡 等待流式响应...

🤖 AI 回复:
──────────────────────────────────────────────────
你好！我是一个AI助手，基于Google的Gemini模型...
──────────────────────────────────────────────────
✅ 流式响应完成
```

## 🐛 故障排除

### 常见错误及解决方案

1. **HTTP 401 错误**
   - 检查 `SUPABASE_ANON_KEY` 是否正确
   - 确认 `.env` 文件存在且格式正确

2. **HTTP 404 错误**  
   - 确认 chat 函数已正确部署
   - 检查 `SUPABASE_URL` 是否正确

3. **网络连接错误**
   - 检查网络连接
   - 确认防火墙设置
   - 验证 Supabase 服务状态

4. **Node.js 版本问题**
   - 确保使用 Node.js 18+ 版本
   - 检查是否支持原生 fetch API

## 🔗 相关链接

- [Supabase Dashboard](https://supabase.com/dashboard/project/gxjawkhxtaijigdchtxs/functions)
- [Edge Function URL](https://gxjawkhxtaijigdchtxs.supabase.co/functions/v1/chat)
