#!/bin/bash

# SSE 客户端测试运行脚本

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🧪 SSE 客户端测试${NC}"
echo "=================================="

# 检查 .env 文件
if [ ! -f "../.env" ]; then
    echo -e "${YELLOW}⚠️  .env 文件不存在，请先配置环境变量${NC}"
    exit 1
fi

echo -e "${GREEN}🚀 启动 SSE 客户端测试...${NC}"
echo ""

# 运行测试，传递所有参数
node sse-client.js "$@"
