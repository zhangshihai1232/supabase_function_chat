#!/bin/bash

# Supabase Edge Functions 部署脚本
# 使用方法: ./deploy.sh 或 npm run deploy

set -e  # 遇到错误时退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 .env 文件
check_env_file() {
    if [ ! -f ".env" ]; then
        log_error ".env 文件不存在"
        log_info "请创建 .env 文件并填入以下配置:"
        echo ""
        echo "# Supabase 项目配置"
        echo "SUPABASE_PROJECT_REF=your_project_reference_id"
        echo "SUPABASE_URL=https://your-project-ref.supabase.co"
        echo "SUPABASE_ANON_KEY=your_anon_key"
        echo ""
        echo "# Gemini API 配置"  
        echo "GEMINI_API_KEY=your_gemini_api_key"
        echo ""
        echo "# 本地开发端口"
        echo "PORT=8000"
        echo ""
        log_info "从 'supabase projects list' 命令获取 REFERENCE ID"
        exit 1
    fi
    
    # 加载环境变量
    set -a
    source .env
    set +a
    
    # 检查必要的环境变量
    if [ -z "$SUPABASE_PROJECT_REF" ]; then
        log_error "SUPABASE_PROJECT_REF 未设置在 .env 文件中"
        log_info "请在 .env 文件中添加: SUPABASE_PROJECT_REF=your_project_reference_id"
        exit 1
    fi
    
    log_success "环境变量检查通过"
}

# 检查 Supabase CLI
check_supabase_cli() {
    log_info "检查 Supabase CLI..."
    
    if ! command -v supabase &> /dev/null; then
        log_error "Supabase CLI 未安装"
        log_info "请安装 Supabase CLI: https://supabase.com/docs/guides/cli"
        exit 1
    fi
    
    # 检查登录状态
    if ! supabase projects list &> /dev/null; then
        log_error "Supabase CLI 未登录"
        log_info "请先登录: supabase login"
        exit 1
    fi
    
    log_success "Supabase CLI 检查通过"
}

# 链接项目
link_project() {
    log_info "链接 Supabase 项目 (ref: $SUPABASE_PROJECT_REF)..."
    
    # 检查是否已链接
    if supabase status &> /dev/null; then
        log_warning "项目已链接，跳过链接步骤"
        return
    fi
    
    # 链接项目
    if supabase link --project-ref "$SUPABASE_PROJECT_REF"; then
        log_success "项目链接成功"
    else
        log_error "项目链接失败"
        log_info "请检查 SUPABASE_PROJECT_REF 是否正确"
        exit 1
    fi
}

# 部署 Edge Functions
deploy_functions() {
    log_info "开始部署 Edge Functions..."
    
    # 检查 functions 目录
    if [ ! -d "supabase/functions" ]; then
        log_error "supabase/functions 目录不存在"
        exit 1
    fi
    
    # 显示将要部署的函数
    log_info "发现以下函数:"
    find supabase/functions -name "index.ts" -type f | while read -r func; do
        func_name=$(dirname "$func" | sed 's|supabase/functions/||')
        if [ "$func_name" != "_shared" ]; then
            echo "  - $func_name"
        fi
    done
    
    log_info "以及共享模块:"
    if [ -d "supabase/functions/_shared" ]; then
        echo "  - _shared (共享代码)"
    fi
    
    # 部署所有函数
    log_info "执行部署命令..."
    if supabase functions deploy --no-verify-jwt; then
        log_success "所有 Edge Functions 部署成功!"
        
        # 设置环境变量
        log_info "设置远端环境变量..."
        if [ -f ".env" ]; then
            while IFS='=' read -r key value; do
                # 跳过空行和注释
                if [[ -n "$key" && ! "$key" =~ ^[[:space:]]*# ]]; then
                    # 移除可能的引号
                    value=$(echo "$value" | sed 's/^["'\'']//' | sed 's/["'\'']$//')
                    if supabase secrets set "$key=$value" --project-ref "$SUPABASE_PROJECT_REF" 2>/dev/null; then
                        log_success "设置环境变量: $key"
                    else
                        log_warning "设置环境变量失败: $key"
                    fi
                fi
            done < .env
        fi
    else
        log_error "部署失败"
        exit 1
    fi
}

# 显示部署后信息
show_deployment_info() {
    log_success "=== 部署完成 ==="
    log_info "项目地址: $SUPABASE_URL"
    log_info "函数 URL 格式: $SUPABASE_URL/functions/v1/{function_name}"
    log_info ""
    log_info "例如, chat 函数的 URL:"
    log_info "$SUPABASE_URL/functions/v1/chat"
    log_info ""
    log_info "你可以在 Supabase Dashboard 中查看和监控你的函数:"
    log_info "https://supabase.com/dashboard/project/$SUPABASE_PROJECT_REF/functions"
}

# 主函数
main() {
    log_info "🚀 开始 Supabase Edge Functions 部署流程..."
    echo ""
    
    check_env_file
    check_supabase_cli
    link_project
    deploy_functions
    show_deployment_info
    
    echo ""
    log_success "🎉 部署流程完成!"
}

# 运行主函数
main "$@"
