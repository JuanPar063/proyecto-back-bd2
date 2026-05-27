import { plainToInstance, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min, validateSync } from 'class-validator';

enum NodeEnv {
  development = 'development',
  production = 'production',
  test = 'test',
}

enum LlmProvider {
  stub = 'stub',
  openai = 'openai',
  anthropic = 'anthropic',
  ollama = 'ollama',
}

class EnvVars {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PORT = 3000;

  @IsString()
  API_PREFIX = 'api';

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_HOST = 'redis';

  @Type(() => Number)
  @IsInt()
  REDIS_PORT = 6379;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsString()
  JWT_SECRET!: string;

  @IsString()
  JWT_EXPIRES_IN = '1h';

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN = '7d';

  @Type(() => Number)
  @IsInt()
  @Min(4)
  BCRYPT_ROUNDS = 10;

  // ==========================================================
  // Asistente IA (Pardo, Entrega 2)
  // El proveedor real se cablea cambiando LLM_PROVIDER + las
  // credenciales correspondientes. Mientras tanto, "stub" mantiene
  // el pipeline funcionando sin red ni API keys.
  // ==========================================================
  @IsOptional()
  @IsEnum(LlmProvider)
  LLM_PROVIDER: LlmProvider = LlmProvider.stub;

  @IsOptional()
  @IsString()
  LLM_API_KEY?: string;

  @IsOptional()
  @IsString()
  LLM_MODEL?: string;

  @IsOptional()
  @IsString()
  LLM_BASE_URL?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  AI_SLOW_QUERY_THRESHOLD_MS = 800;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvVars, config, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    forbidUnknownValues: false,
  });
  if (errors.length) {
    throw new Error(`Configuración de entorno inválida:\n${errors.toString()}`);
  }
  return validated;
}
