#!/bin/bash

# 使用 Deno 直接运行 Edge Functions（无需 Docker）
# 适用于无法安装 Docker Desktop 的环境

echo "🚀 使用 Deno 直接启动聊天服务..."

# 检查是否安装了 Deno
if ! command -v deno &> /dev/null; then
    echo "❌ 未找到 Deno，正在安装..."
    # 安装 Deno
    curl -fsSL https://deno.land/x/install/install.sh | sh
    echo "✅ Deno 安装完成"
    echo "💡 请将 ~/.deno/bin 添加到你的 PATH 环境变量中"
    echo "   可以运行: export PATH=\"\$HOME/.deno/bin:\$PATH\""
    exit 1
fi

# 确保在正确的目录
cd "$(dirname "$0")"

echo "📁 工作目录: $(pwd)"
echo "🔍 加载环境变量..."

# 加载环境变量（如果.env文件存在）
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
    echo "✅ 已加载 .env 文件"
fi

# 使用固定端口8000，与远端环境保持一致
PORT=8000
echo "📝 使用固定端口: $PORT（与远端环境一致）"

echo "🔍 检查端口 $PORT 是否被占用..."

# 检查端口是否被占用的函数
check_port_in_use() {
    local port=$1
    lsof -i :$port >/dev/null 2>&1
    return $?
}

# 杀死占用端口的进程函数
kill_port_process() {
    local port=$1
    echo "🔧 正在杀死占用端口 $port 的进程..."
    
    # 获取占用端口的进程信息
    local process_info=$(lsof -i :$port 2>/dev/null)
    
    if [ -n "$process_info" ]; then
        echo "📋 找到占用端口 $port 的进程:"
        echo "$process_info" | awk 'NR>1 {printf "   PID: %s, 进程: %s\n", $2, $1}'
        
        # 获取PID列表
        local pids=$(echo "$process_info" | awk 'NR>1 {print $2}' | sort -u)
        
        # 尝试优雅关闭
        echo "🛑 尝试优雅关闭进程..."
        for pid in $pids; do
            kill "$pid" 2>/dev/null && echo "   发送 TERM 信号给 PID: $pid"
        done
        sleep 2
        
        # 检查是否还有进程占用端口
        local remaining_pids=$(lsof -ti :$port 2>/dev/null)
        if [ -n "$remaining_pids" ]; then
            echo "⚠️ 优雅关闭失败，强制杀死进程..."
            for pid in $remaining_pids; do
                kill -9 "$pid" 2>/dev/null && echo "   强制杀死 PID: $pid"
            done
            sleep 1
        fi
        
        echo "✅ 已清理端口 $port"
    else
        echo "ℹ️ 端口 $port 未被占用"
    fi
}

# 检查并清理端口
if check_port_in_use $PORT; then
    echo "⚠️ 端口 $PORT 被占用，正在自动清理..."
    kill_port_process $PORT
    
    # 再次检查端口是否已清理
    if check_port_in_use $PORT; then
        echo "❌ 无法清理端口 $PORT，请手动检查并关闭占用该端口的进程"
        echo "💡 您可以运行: lsof -i :$PORT 来查看占用进程"
        exit 1
    fi
else
    echo "✅ 端口 $PORT 可用"
fi

echo "🏃 启动 Deno 服务器..."

# 使用 Deno 直接运行
deno run \
    --allow-net \
    --allow-env \
    --allow-read \
    --watch \
    supabase/functions/chat/index.ts
