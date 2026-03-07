import { config } from 'dotenv';
import { z } from 'zod';

config();

const EnvironmentSchema = z.object({
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DEBUG: z.string().default('false'),
  BYPASS_AUTH: z.string().default('false'),
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string(),
  SUPABASE_DB_PASSWORD: z.string().optional(),
  REDIS_URL: z.url().optional().default('redis://localhost:6379'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  ANTHROPIC_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.url().optional(),
  ADMIN_EMAILS: z.string().optional().default(''),
  INTERNAL_API_KEY: z.string().optional(),
});

let environment: z.infer<typeof EnvironmentSchema> | null = null;

export const getEnvironment = () => {
  if (environment) {
    return environment;
  }

  const result = EnvironmentSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Environment validation failed:');
    result.error.issues.forEach((issue) => {
      console.error(`  ${issue.path.join('.')} — ${issue.code}: ${issue.message}`);
    });
    process.exit(1);
  }

  environment = result.data;
  return environment;
};

export const getCorsOrigins = () => {
  const env = getEnvironment();
  if (env.CORS_ORIGINS === '*') {
    return '*';
  }
  return env.CORS_ORIGINS.split(',').map((origin) => origin.trim());
};

export const getAdminEmails = (): string[] => {
  const env = getEnvironment();
  if (!env.ADMIN_EMAILS) return [];
  return env.ADMIN_EMAILS.split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
};

export const getInternalApiKey = (): string | undefined => {
  return getEnvironment().INTERNAL_API_KEY || undefined;
};

export default getEnvironment();
