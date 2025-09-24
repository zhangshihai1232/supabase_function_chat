# 轻量级架构迁移说明

## 概述

成功将聊天服务从Oak框架迁移到轻量级架构，去掉了所有外部Web框架依赖，使服务能够更好地适配Supabase Edge Functions和本地Deno环境。

## 主要变更

### 1. 架构简化
- **移除依赖**: 完全去掉Oak框架依赖
- **原生实现**: 使用Deno原生HTTP服务器
- **轻量级**: 减少了代码复杂度和运行时开销

### 2. 文件变更

#### 新增/修改文件:
- `supabase/functions/chat/index.ts` - 全新轻量级入口文件
- `supabase/functions/_shared/types.ts` - 更新类型定义，增加缺失字段

#### 已删除的废弃文件:
- `supabase/functions/chat/oak-router.ts` - Oak路由器（已删除）
- `supabase/functions/chat/server-startup.ts` - 启动工具（已删除）

#### 保持不变:
- `supabase/functions/chat/chat-service.ts` - 核心业务逻辑
- `supabase/functions/chat/http-responses.ts` - HTTP响应处理
- `supabase/functions/_shared/` - 所有共享工具和类型
- `start-deno.sh` - 启动脚本（无需修改）

### 3. 功能特性

#### ✅ 保持完整功能
- Google Gemini AI 集成
- 流式响应 (SSE)
- CORS 支持
- 匿名用户模式
- 内存存储对话记录
- 错误处理和日志记录

#### 🚀 新增特性
- 更好的Supabase Edge Functions兼容性
- 更快的启动时间
- 更低的内存占用
- 简化的路由处理

## 使用方法

### 本地开发
```bash
# 方法1: 使用启动脚本（推荐）
./start-deno.sh

# 方法2: 直接使用Deno
deno run --allow-net --allow-env --allow-read supabase/functions/chat/index.ts
```

### Supabase部署
新版本完全兼容Supabase Edge Functions，可以直接部署：
```bash
supabase functions deploy chat
```

## API端点

服务提供以下端点：

- `GET /` - 重定向到状态页面
- `GET /status` - 服务状态信息
- `GET /chat/status` - 聊天服务状态
- `GET /chat` - 聊天服务信息
- `POST /chat` - 发送聊天消息
- `OPTIONS *` - CORS预检请求

## 测试验证

### 状态查询测试
```bash
curl http://localhost:8000/status
```

### 标准聊天测试
```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}'
```

### 流式响应测试
```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "stream": true}' \
  --no-buffer
```

## 迁移优势

1. **性能提升**: 去掉框架开销，启动更快，内存占用更少
2. **兼容性**: 更好地支持Supabase Edge Functions
3. **维护性**: 代码更简洁，依赖更少
4. **可靠性**: 减少了潜在的依赖冲突问题
5. **灵活性**: 更容易定制和扩展

## 回滚方案

如果需要回滚到Oak版本：
1. 从Git历史中恢复 `oak-router.ts` 和 `server-startup.ts` 文件
2. 修改 `index.ts` 重新引入Oak依赖和路由器
3. 所有核心功能和共享模块保持不变

**注意**: 废弃文件已被删除，需要从版本控制历史中恢复

## 注意事项

- 环境变量设置保持不变
- 所有API接口保持完全兼容
- 测试用例无需修改
- 现有客户端代码无需更改
