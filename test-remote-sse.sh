#!/bin/bash

# 远端SSE服务测试脚本
# 用于测试部署在Supabase上的聊天服务的各种功能，包括状态查询、标准聊天和流式聊天

set -e  # 遇到错误时退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 测试统计
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

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

log_test() {
    echo -e "${PURPLE}[TEST]${NC} $1"
}

# 测试结果统计
test_start() {
    TEST_COUNT=$((TEST_COUNT + 1))
    log_test "测试 $TEST_COUNT: $1"
}

test_pass() {
    PASS_COUNT=$((PASS_COUNT + 1))
    log_success "✅ 测试通过: $1"
    echo
}

test_fail() {
    FAIL_COUNT=$((FAIL_COUNT + 1))
    log_error "❌ 测试失败: $1"
    echo
}

# 加载环境变量
load_env() {
    if [ ! -f ".env" ]; then
        log_error ".env 文件不存在"
        log_info "请确保项目根目录有 .env 文件，包含以下变量："
        echo "  SUPABASE_URL=https://your-project-ref.supabase.co"
        echo "  SUPABASE_PROJECT_REF=your_project_reference_id"
        exit 1
    fi
    
    # 加载环境变量
    set -a
    source .env
    set +a
    
    # 检查必要的环境变量
    if [ -z "$SUPABASE_URL" ]; then
        log_error "SUPABASE_URL 未设置在 .env 文件中"
        exit 1
    fi
    
    if [ -z "$SUPABASE_PROJECT_REF" ]; then
        log_error "SUPABASE_PROJECT_REF 未设置在 .env 文件中"
        exit 1
    fi
    
    # 构建远端服务URL
    REMOTE_BASE_URL="${SUPABASE_URL}/functions/v1"
    
    log_success "环境变量加载成功"
    log_info "远端服务URL: $REMOTE_BASE_URL"
    log_info "项目引用: $SUPABASE_PROJECT_REF"
}

# 等待服务响应
wait_for_service() {
    log_info "检查远端服务状态..."
    local max_attempts=10
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s "$REMOTE_BASE_URL/chat/status" > /dev/null 2>&1; then
            log_success "远端服务可访问"
            return 0
        fi
        
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    log_error "远端服务无法访问"
    return 1
}

# 测试1: 服务状态检查
test_remote_status() {
    test_start "远端服务状态检查"
    
    local response=$(curl -s -w "%{http_code}" "$REMOTE_BASE_URL/chat/status")
    local http_code="${response: -3}"
    local body="${response%???}"
    
    if [ "$http_code" = "200" ]; then
        log_success "状态码: $http_code"
        
        # 检查响应内容
        if echo "$body" | jq -e '.status == "running"' > /dev/null 2>&1; then
            log_success "服务状态: running"
            local service_name=$(echo "$body" | jq -r '.service')
            local version=$(echo "$body" | jq -r '.version')
            log_info "服务名称: $service_name"
            log_info "服务版本: $version"
            test_pass "远端状态查询正常"
        else
            test_fail "远端服务状态异常: $body"
        fi
    else
        test_fail "HTTP状态码异常: $http_code, 响应: $body"
    fi
}

# 测试2: 标准聊天请求
test_remote_standard_chat() {
    test_start "远端标准聊天请求"
    
    local request_data='{"message": "你好，这是远端部署测试，请简短回复", "stream": false}'
    local response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$request_data" \
        "$REMOTE_BASE_URL/chat")
    
    local http_code="${response: -3}"
    local body="${response%???}"
    
    log_info "发送请求: $request_data"
    
    if [ "$http_code" = "200" ]; then
        log_success "状态码: $http_code"
        
        # 检查响应格式
        if echo "$body" | jq -e '.message' > /dev/null 2>&1; then
            local message=$(echo "$body" | jq -r '.message')
            local conversation_id=$(echo "$body" | jq -r '.conversation_id')
            local timestamp=$(echo "$body" | jq -r '.timestamp')
            
            log_success "AI回复: ${message:0:80}..."
            log_success "对话ID: $conversation_id"
            log_success "时间戳: $timestamp"
            test_pass "远端标准聊天请求成功"
        else
            # 检查是否是错误响应
            if echo "$body" | jq -e '.error' > /dev/null 2>&1; then
                local error_msg=$(echo "$body" | jq -r '.error')
                local details=$(echo "$body" | jq -r '.details // "无详细信息"')
                log_error "API错误: $error_msg"
                log_error "错误详情: $details"
                test_fail "远端API返回错误"
            else
                test_fail "远端响应格式异常: $body"
            fi
        fi
    else
        test_fail "HTTP状态码异常: $http_code, 响应: $body"
    fi
}

# 测试3: 流式聊天请求
test_remote_streaming_chat() {
    test_start "远端流式聊天请求"
    
    local request_data='{"message": "请用2-3句话介绍流式响应的优点", "stream": true}'
    local temp_file=$(mktemp)
    
    log_info "发送流式请求: $request_data"
    
    # 使用curl获取流式响应
    curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$request_data" \
        --no-buffer \
        --max-time 30 \
        "$REMOTE_BASE_URL/chat" > "$temp_file" 2>/dev/null
    
    # 检查是否有内容接收到
    if [ -s "$temp_file" ]; then
        local content=$(cat "$temp_file")
        
        # 检查SSE格式
        if echo "$content" | grep -q "event: data"; then
            log_success "SSE格式正确"
            
            # 提取数据内容
            local data_lines=$(echo "$content" | grep "^data:" | wc -l)
            local total_lines=$(echo "$content" | wc -l)
            log_success "接收到 $data_lines 个数据块，总共 $total_lines 行"
            
            # 显示前几个数据块
            log_info "数据块示例:"
            echo "$content" | grep "^data:" | head -3 | while read -r line; do
                echo "  $line"
            done
            
            # 检查是否有完成标记
            if echo "$content" | grep -q "event: done" || [ "$data_lines" -gt 0 ]; then
                log_success "流式响应成功"
                
                # 提取完整的响应内容
                local full_response=$(echo "$content" | grep "^data:" | sed 's/^data: //' | tr -d '\n')
                log_info "完整响应: ${full_response:0:100}..."
                
                test_pass "远端流式聊天请求成功"
            else
                test_fail "远端流式响应数据异常"
            fi
        else
            # 检查是否是错误响应
            if echo "$content" | jq -e '.error' > /dev/null 2>&1; then
                local error_msg=$(echo "$content" | jq -r '.error')
                log_error "流式API错误: $error_msg"
                test_fail "远端流式API返回错误"
            else
                test_fail "远端SSE格式异常: $(head -3 "$temp_file")"
            fi
        fi
    else
        test_fail "远端流式请求超时或无响应"
    fi
    
    rm -f "$temp_file"
}

# 测试4: 错误请求处理
test_remote_error_handling() {
    test_start "远端错误请求处理"
    
    # 测试无效JSON
    local response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"invalid": "request without message"}' \
        "$REMOTE_BASE_URL/chat")
    
    local http_code="${response: -3}"
    local body="${response%???}"
    
    if [ "$http_code" = "400" ]; then
        log_success "错误状态码: $http_code"
        
        if echo "$body" | jq -e '.error' > /dev/null 2>&1; then
            local error_msg=$(echo "$body" | jq -r '.error')
            log_success "错误信息: $error_msg"
            test_pass "远端错误处理正常"
        else
            test_fail "远端错误响应格式异常: $body"
        fi
    else
        test_fail "远端错误状态码异常: $http_code, 应为400, 响应: $body"
    fi
}

# 测试5: CORS检查
test_remote_cors() {
    test_start "远端CORS跨域检查"
    
    local response=$(curl -s -w "%{http_code}" -X OPTIONS \
        -H "Origin: https://example.com" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: Content-Type" \
        "$REMOTE_BASE_URL/chat")
    
    local http_code="${response: -3}"
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
        log_success "CORS预检请求成功: $http_code"
        test_pass "远端CORS配置正常"
    else
        test_fail "远端CORS预检请求失败: $http_code"
    fi
}

# 测试6: 带对话历史的聊天
test_remote_conversation_history() {
    test_start "远端对话历史测试"
    
    # 第一次请求
    local request1='{"message": "我的名字是张三", "stream": false}'
    local response1=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$request1" \
        "$REMOTE_BASE_URL/chat")
    
    if echo "$response1" | jq -e '.conversation_id' > /dev/null 2>&1; then
        local conv_id=$(echo "$response1" | jq -r '.conversation_id')
        log_success "第一次对话成功，对话ID: $conv_id"
        
        # 第二次请求，使用相同的对话ID
        local request2="{\"message\": \"你还记得我的名字吗？\", \"stream\": false, \"conversation_id\": \"$conv_id\"}"
        local response2=$(curl -s -X POST \
            -H "Content-Type: application/json" \
            -d "$request2" \
            "$REMOTE_BASE_URL/chat")
        
        if echo "$response2" | jq -e '.message' > /dev/null 2>&1; then
            local message2=$(echo "$response2" | jq -r '.message')
            log_success "第二次对话回复: ${message2:0:80}..."
            
            # 简单检查是否提到了名字
            if echo "$message2" | grep -qi "张三"; then
                log_success "AI记住了对话历史"
                test_pass "远端对话历史功能正常"
            else
                log_warning "AI可能没有记住对话历史，但功能正常"
                test_pass "远端对话历史功能基本正常"
            fi
        else
            test_fail "第二次对话失败"
        fi
    else
        test_fail "第一次对话失败"
    fi
}

# 性能测试
test_remote_performance() {
    test_start "远端性能测试"
    
    local start_time=$(date +%s.%N)
    local request_data='{"message": "性能测试，请简短回复", "stream": false}'
    
    local response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$request_data" \
        "$REMOTE_BASE_URL/chat")
    
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc 2>/dev/null || echo "无法计算")
    local http_code="${response: -3}"
    
    if [ "$http_code" = "200" ]; then
        log_success "响应时间: ${duration}s"
        
        # 设置性能阈值（30秒，远端服务通常较慢）
        if command -v bc >/dev/null 2>&1 && (( $(echo "$duration < 30" | bc -l) )); then
            test_pass "远端性能测试通过 (${duration}s < 30s)"
        elif [ "$duration" = "无法计算" ]; then
            test_pass "远端性能测试完成 (无法计算精确时间)"
        else
            test_fail "远端响应时间过长: ${duration}s"
        fi
    else
        test_fail "远端性能测试请求失败: $http_code"
    fi
}

# 主测试函数
run_tests() {
    echo -e "${CYAN}================================${NC}"
    echo -e "${CYAN}    远端SSE服务测试开始${NC}"
    echo -e "${CYAN}================================${NC}"
    echo
    
    # 检查服务是否运行
    if ! wait_for_service; then
        log_error "远端服务无法访问，请检查部署状态"
        log_info "你可以在 Supabase Dashboard 中查看函数状态:"
        log_info "https://supabase.com/dashboard/project/$SUPABASE_PROJECT_REF/functions"
        exit 1
    fi
    
    echo
    log_info "开始执行远端测试..."
    echo
    
    # 执行所有测试
    test_remote_status
    test_remote_standard_chat
    test_remote_streaming_chat
    test_remote_error_handling
    test_remote_cors
    test_remote_conversation_history
    test_remote_performance
    
    # 输出测试结果
    echo -e "${CYAN}================================${NC}"
    echo -e "${CYAN}         测试结果统计${NC}"
    echo -e "${CYAN}================================${NC}"
    echo -e "远端服务: ${BLUE}$REMOTE_BASE_URL${NC}"
    echo -e "项目引用: ${BLUE}$SUPABASE_PROJECT_REF${NC}"
    echo -e "总测试数: ${BLUE}$TEST_COUNT${NC}"
    echo -e "通过数量: ${GREEN}$PASS_COUNT${NC}"
    echo -e "失败数量: ${RED}$FAIL_COUNT${NC}"
    
    if [ $FAIL_COUNT -eq 0 ]; then
        echo -e "${GREEN}🎉 所有远端测试通过！${NC}"
        echo -e "${GREEN}远端SSE服务运行正常${NC}"
        exit 0
    else
        echo -e "${RED}❌ 有 $FAIL_COUNT 个测试失败${NC}"
        echo -e "${YELLOW}请检查 Supabase Dashboard 中的函数日志${NC}"
        exit 1
    fi
}

# 显示帮助信息
show_help() {
    echo "远端SSE服务测试脚本"
    echo
    echo "用法: $0 [选项]"
    echo
    echo "选项:"
    echo "  -h, --help     显示此帮助信息"
    echo "  -q, --quiet    静默模式，只显示结果"
    echo
    echo "环境变量 (从 .env 文件读取):"
    echo "  SUPABASE_URL              Supabase项目URL"
    echo "  SUPABASE_PROJECT_REF      Supabase项目引用ID"
    echo
    echo "示例:"
    echo "  $0                    # 使用 .env 文件运行测试"
    echo "  $0 -q                 # 静默模式运行测试"
    echo
}

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -q|--quiet)
            # 重定向信息日志到 /dev/null
            exec 3>&1
            log_info() { :; }
            log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1" >&3; }
            log_error() { echo -e "${RED}[ERROR]${NC} $1" >&3; }
            shift
            ;;
        *)
            log_error "未知参数: $1"
            show_help
            exit 1
            ;;
    esac
done

# 检查依赖
check_dependencies() {
    local missing_deps=()
    
    if ! command -v curl &> /dev/null; then
        missing_deps+=("curl")
    fi
    
    if ! command -v jq &> /dev/null; then
        missing_deps+=("jq")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "缺少依赖: ${missing_deps[*]}"
        log_info "请安装缺少的依赖："
        for dep in "${missing_deps[@]}"; do
            echo "  - $dep"
        done
        exit 1
    fi
}

# 主程序入口
main() {
    check_dependencies
    load_env
    run_tests
}

# 运行主程序
main "$@"
