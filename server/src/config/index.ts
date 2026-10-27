import { z } from 'zod';

const booleanFromEnv = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(8080),
    WEBSITE_URL: z.string().url().default('https://bulkskart.com'),
    WEB_DIST_DIR: z.string().optional(),

    STORE_DRIVER: z.enum(['postgres', 'memory']).default('memory'),
    DATABASE_URL: z.string().optional(),

    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD_HASH: z.string().optional(),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters').optional(),
    SESSION_TTL_HOURS: z.coerce.number().positive().default(8),

    VOICE_PROVIDER: z.enum(['mock', 'sarvam']).default('mock'),
    SARVAM_API_KEY: z.string().optional(),

    TELEPHONY_PROVIDER: z.enum(['mock', 'exotel']).default('mock'),
    TELEPHONY_WEBHOOK_SECRET: z.string().min(16).optional(),
    EXOTEL_ACCOUNT_SID: z.string().optional(),
    EXOTEL_API_KEY: z.string().optional(),
    EXOTEL_API_TOKEN: z.string().optional(),
    EXOTEL_SUBDOMAIN: z.string().optional(),

    // Kill switch: live (real telephone) campaigns cannot launch unless this is true.
    LIVE_CALLING_ENABLED: booleanFromEnv,
    SCHEDULER_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
    SCHEDULER_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(30),
  })
  .superRefine((env, ctx) => {
    if (env.STORE_DRIVER === 'postgres' && !env.DATABASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Required when STORE_DRIVER=postgres' });
    }
    if (env.NODE_ENV === 'production' && env.STORE_DRIVER !== 'postgres') {
      ctx.addIssue({ code: 'custom', path: ['STORE_DRIVER'], message: 'Production must use postgres' });
    }
    if (env.NODE_ENV === 'production' && env.VOICE_PROVIDER === 'mock') {
      ctx.addIssue({ code: 'custom', path: ['VOICE_PROVIDER'], message: 'Production must use a real voice provider' });
    }
    if (env.TELEPHONY_PROVIDER === 'exotel') {
      for (const key of ['EXOTEL_ACCOUNT_SID', 'EXOTEL_API_KEY', 'EXOTEL_API_TOKEN', 'EXOTEL_SUBDOMAIN'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'Required when TELEPHONY_PROVIDER=exotel' });
      }
    }
    if (env.NODE_ENV === 'production' && env.TELEPHONY_PROVIDER === 'mock' && env.LIVE_CALLING_ENABLED) {
      ctx.addIssue({ code: 'custom', path: ['LIVE_CALLING_ENABLED'], message: 'Cannot enable live calling with the mock telephony provider' });
    }
  });

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  // A variable that is set but empty (for example "TELEPHONY_WEBHOOK_SECRET=" in a copied
  // .env file) means "not configured", not an invalid value.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value !== ''));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${details}`);
  }
  return parsed.data;
}
