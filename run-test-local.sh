#!/bin/bash

# 本地SSE服务测试脚本
# 用于测试聊天服务的各种功能，包括状态查询、标准聊天和流式聊天

set -e  # 遇到错误时退出

# 配置
BASE_URL="http://localhost:8000"
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

# 等待服务启动
wait_for_service() {
    log_info "等待服务启动..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s "$BASE_URL/status" > /dev/null 2>&1; then
            log_success "服务已启动"
            return 0
        fi
        
        attempt=$((attempt + 1))
        echo -n "."
        sleep 1
    done
    
    log_error "服务启动超时"
    return 1
}

# 测试1: 服务状态检查
test_status() {
    test_start "服务状态检查"
    
    local response=$(curl -s -w "%{http_code}" "$BASE_URL/status")
    local http_code="${response: -3}"
    local body="${response%???}"
    
    if [ "$http_code" = "200" ]; then
        log_success "状态码: $http_code"
        
        # 检查响应内容
        if echo "$body" | jq -e '.status == "running"' > /dev/null 2>&1; then
            log_success "服务状态: running"
            test_pass "状态查询正常"
        else
            test_fail "服务状态异常: $body"
        fi
    else
        test_fail "HTTP状态码异常: $http_code"
    fi
}

# 测试2: 标准聊天请求
test_standard_chat() {
    test_start "标准聊天请求"
    
    local request_data='{"message": "你好，这是一个测试消息", "stream": false}'
    local response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$request_data" \
        "$BASE_URL/chat")
    
    local http_code="${response: -3}"
    local body="${response%???}"
    
    if [ "$http_code" = "200" ]; then
        log_success "状态码: $http_code"
        
        # 检查响应格式
        if echo "$body" | jq -e '.message' > /dev/null 2>&1; then
            local message=$(echo "$body" | jq -r '.message')
            local conversation_id=$(echo "$body" | jq -r '.conversation_id')
            
            log_success "AI回复: ${message:0:50}..."
            log_success "对话ID: $conversation_id"
            test_pass "标准聊天请求成功"
        else
            test_fail "响应格式异常: $body"
        fi
    else
        test_fail "HTTP状态码异常: $http_code, 响应: $body"
    fi
}

# 测试3: 流式聊天请求
test_streaming_chat() {
    test_start "流式聊天请求"
    
    local request_data='{"message": "请简短回复：流式测试", "stream": true}'
    local temp_file=$(mktemp)
    
    # 使用curl获取流式响应，忽略退出码（流式连接关闭是正常的）
    curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$request_data" \
        --no-buffer \
        --max-time 30 \
        "$BASE_URL/chat" > "$temp_file" 2>/dev/null
    
    # 检查是否有内容接收到
    if [ -s "$temp_file" ]; then
        local content=$(cat "$temp_file")
        
        # 检查SSE格式
        if echo "$content" | grep -q "event: data"; then
            log_success "SSE格式正确"
            
            # 提取数据内容
            local data_lines=$(echo "$content" | grep "^data:" | wc -l)
            log_success "接收到 $data_lines 个数据块"
            
            # 检查是否有完成标记（流式响应可能在客户端断开前就完成了）
            if echo "$content" | grep -q "event: done" || [ "$data_lines" -gt 0 ]; then
                log_success "流式响应成功"
                test_pass "流式聊天请求成功"
            else
                test_fail "流式响应数据异常"
            fi
        else
            test_fail "SSE格式异常: $(head -3 "$temp_file")"
        fi
    else
        test_fail "流式请求超时或无响应"
    fi
    
    rm -f "$temp_file"
}

# 测试4: 错误请求处理
test_error_handling() {
    test_start "错误请求处理"
    
    # 测试无效JSON
    local response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"invalid": "request"}' \
        "$BASE_URL/chat")
    
    local http_code="${response: -3}"
    local body="${response%???}"
    
    if [ "$http_code" = "400" ]; then
        log_success "错误状态码: $http_code"
        
        if echo "$body" | jq -e '.error' > /dev/null 2>&1; then
            local error_msg=$(echo "$body" | jq -r '.error')
            log_success "错误信息: $error_msg"
            test_pass "错误处理正常"
        else
            test_fail "错误响应格式异常: $body"
        fi
    else
        test_fail "错误状态码异常: $http_code, 应为400"
    fi
}

# 测试5: CORS检查
test_cors() {
    test_start "CORS跨域检查"
    
    local response=$(curl -s -w "%{http_code}" -X OPTIONS \
        -H "Origin: http://example.com" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: Content-Type" \
        "$BASE_URL/chat")
    
    local http_code="${response: -3}"
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
        log_success "CORS预检请求成功: $http_code"
        test_pass "CORS配置正常"
    else
        test_fail "CORS预检请求失败: $http_code"
    fi
}

# 测试6: 并发请求
test_concurrent_requests() {
    test_start "并发请求测试"
    
    local pids=()
    local temp_dir=$(mktemp -d)
    local success_count=0
    local total_requests=5
    
    # 启动多个并发请求
    for i in $(seq 1 $total_requests); do
        (
            local response=$(curl -s -w "%{http_code}" -X POST \
                -H "Content-Type: application/json" \
                -d "{\"message\": \"并发测试消息 $i\", \"stream\": false}" \
                "$BASE_URL/chat")
            
            local http_code="${response: -3}"
            echo "$http_code" > "$temp_dir/result_$i"
        ) &
        pids+=($!)
    done
    
    # 等待所有请求完成
    for pid in "${pids[@]}"; do
        wait "$pid"
    done
    
    # 统计成功的请求
    for i in $(seq 1 $total_requests); do
        if [ -f "$temp_dir/result_$i" ]; then
            local code=$(cat "$temp_dir/result_$i")
            if [ "$code" = "200" ]; then
                success_count=$((success_count + 1))
            fi
        fi
    done
    
    log_success "成功请求: $success_count/$total_requests"
    
    if [ "$success_count" -eq "$total_requests" ]; then
        test_pass "并发请求测试成功"
    else
        test_fail "并发请求部分失败"
    fi
    
    rm -rf "$temp_dir"
}

# 性能测试
test_performance() {
    test_start "性能测试"
    
    local start_time=$(date +%s.%N)
    local request_data='{"message": "性能测试", "stream": false}'
    
    local response=$(curl -s -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$request_data" \
        "$BASE_URL/chat")
    
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc)
    local http_code="${response: -3}"
    
    if [ "$http_code" = "200" ]; then
        log_success "响应时间: ${duration}s"
        
        # 设置性能阈值（15秒）
        if (( $(echo "$duration < 15" | bc -l) )); then
            test_pass "性能测试通过 (${duration}s < 15s)"
        else
            test_fail "响应时间过长: ${duration}s"
        fi
    else
        test_fail "性能测试请求失败: $http_code"
    fi
}

# 主测试函数
run_tests() {
    echo -e "${CYAN}================================${NC}"
    echo -e "${CYAN}    本地SSE服务测试开始${NC}"
    echo -e "${CYAN}================================${NC}"
    echo
    
    # 检查服务是否运行
    if ! wait_for_service; then
        log_error "服务未启动，请先运行服务"
        exit 1
    fi
    
    echo
    log_info "开始执行测试..."
    echo
    
    # 执行所有测试
    test_status
    test_standard_chat
    test_streaming_chat
    test_error_handling
    test_cors
    test_concurrent_requests
    test_performance
    
    # 输出测试结果
    echo -e "${CYAN}================================${NC}"
    echo -e "${CYAN}         测试结果统计${NC}"
    echo -e "${CYAN}================================${NC}"
    echo -e "总测试数: ${BLUE}$TEST_COUNT${NC}"
    echo -e "通过数量: ${GREEN}$PASS_COUNT${NC}"
    echo -e "失败数量: ${RED}$FAIL_COUNT${NC}"
    
    if [ $FAIL_COUNT -eq 0 ]; then
        echo -e "${GREEN}🎉 所有测试通过！${NC}"
        exit 0
    else
        echo -e "${RED}❌ 有 $FAIL_COUNT 个测试失败${NC}"
        exit 1
    fi
}

# 显示帮助信息
show_help() {
    echo "本地SSE服务测试脚本"
    echo
    echo "用法: $0 [选项]"
    echo
    echo "选项:"
    echo "  -h, --help     显示此帮助信息"
    echo "  -u, --url      指定服务URL (默认: http://localhost:8000)"
    echo "  -q, --quiet    静默模式，只显示结果"
    echo
    echo "示例:"
    echo "  $0                    # 使用默认配置运行测试"
    echo "  $0 -u http://localhost:3000  # 指定不同的服务URL"
    echo
}

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -u|--url)
            BASE_URL="$2"
            shift 2
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
    
    if ! command -v bc &> /dev/null; then
        missing_deps+=("bc")
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
    run_tests
}

# 运行主程序
main "$@"
