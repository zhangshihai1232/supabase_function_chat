/**
 * 身份验证模块
 * 提供简化的身份验证功能，无需JWT验证
 */

import type { AuthUser } from './types.ts';

/**
 * 获取匿名用户信息
 * 
 * 直接返回匿名用户信息，无需JWT验证
 * 
 * @param request HTTP 请求对象（保留参数以保持接口兼容性）
 * @returns Promise<AuthUser> 匿名用户信息
 */
export async function validateAuth(request: Request): Promise<AuthUser> {
  console.log('🔓 使用匿名用户模式 - 无需身份验证');
  
  return {
    id: 'anonymous-user-id',
    email: 'anonymous@example.com',
    role: 'user'
  };
}


/**
 * 检查用户是否具有特定角色
 * 
 * @param user 已认证的用户对象
 * @param requiredRole 需要的角色名称
 * @returns boolean 用户是否具有所需角色
 */
export function hasRole(user: AuthUser, requiredRole: string): boolean {
  return user.role === requiredRole || user.role === 'admin';  // admin 拥有所有权限
}

/**
 * 创建权限不足的错误响应
 * 
 * @param requiredRole 所需的角色
 * @returns Response HTTP 403 权限不足响应
 */
export function createPermissionErrorResponse(requiredRole: string): Response {
  const errorResponse = {
    error: `需要 ${requiredRole} 权限才能访问此资源`,
    code: 'INSUFFICIENT_PERMISSIONS',
    required_role: requiredRole,
    timestamp: new Date().toISOString()
  };

  return new Response(
    JSON.stringify(errorResponse),
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    }
  );
}
