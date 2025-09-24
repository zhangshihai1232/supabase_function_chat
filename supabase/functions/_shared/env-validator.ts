/**
 * 环境变量验证工具
 * 确保所有必需的环境变量都已正确加载
 */

const REQUIRED_ENV_VARS = [
  'GEMINI_API_KEY'
] as const;

const OPTIONAL_ENV_VARS = [
  'GEMINI_MODEL',
  'GEMINI_TEMPERATURE', 
  'GEMINI_MAX_TOKENS',
  'PORT',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY'
] as const;

export interface EnvValidationResult {
  isValid: boolean;
  missing: string[];
  present: string[];
  warnings: string[];
}

/**
 * 验证环境变量是否完整
 * 
 * @returns EnvValidationResult 验证结果
 */
export function validateEnvironment(): EnvValidationResult {
  const missing: string[] = [];
  const present: string[] = [];
  const warnings: string[] = [];

  // 检查必需的环境变量
  for (const envVar of REQUIRED_ENV_VARS) {
    const value = Deno.env.get(envVar);
    if (!value || value.trim() === '') {
      missing.push(envVar);
    } else {
      present.push(envVar);
    }
  }

  // 检查可选的环境变量
  for (const envVar of OPTIONAL_ENV_VARS) {
    const value = Deno.env.get(envVar);
    if (value && value.trim() !== '') {
      present.push(envVar);
    } else {
      warnings.push(`可选环境变量 ${envVar} 未设置，将使用默认值`);
    }
  }

  return {
    isValid: missing.length === 0,
    missing,
    present,
    warnings
  };
}

/**
 * 打印环境变量验证结果
 * 
 * @param result 验证结果
 */
export function printValidationResult(result: EnvValidationResult): void {
  console.log('🔍 环境变量验证结果:');
  
  if (result.isValid) {
    console.log('✅ 所有必需的环境变量都已正确加载');
  } else {
    console.log('❌ 缺少必需的环境变量:');
    result.missing.forEach(envVar => {
      console.log(`   - ${envVar}`);
    });
  }

  console.log('📋 已加载的环境变量:');
  result.present.forEach(envVar => {
    const value = Deno.env.get(envVar);
    const maskedValue = envVar.includes('KEY') || envVar.includes('SECRET') 
      ? `${value?.substring(0, 8)}...` 
      : value;
    console.log(`   ✓ ${envVar} = ${maskedValue}`);
  });

  if (result.warnings.length > 0) {
    console.log('⚠️  警告:');
    result.warnings.forEach(warning => {
      console.log(`   - ${warning}`);
    });
  }
}

/**
 * 验证并打印环境变量，如果验证失败则抛出错误
 */
export function validateAndPrintEnvironment(): void {
  const result = validateEnvironment();
  printValidationResult(result);
  
  if (!result.isValid) {
    throw new Error(`环境变量验证失败，缺少: ${result.missing.join(', ')}`);
  }
}
