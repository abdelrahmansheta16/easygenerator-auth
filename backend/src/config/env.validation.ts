import * as Joi from 'joi';

/**
 * Fail-fast environment validation. The app refuses to boot with a
 * missing or weak configuration instead of failing obscurely at runtime.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),

  // HS256 signing secret. Long, random, and never committed (see .env.example).
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_ISSUER: Joi.string().default('easygenerator-auth'),
  JWT_AUDIENCE: Joi.string().default('easygenerator-auth-web'),

  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).max(90).default(7),

  // Exact origin(s) allowed to call the API with credentials. Comma-separated.
  CORS_ORIGINS: Joi.string().default('http://localhost:5173'),

  COOKIE_SAMESITE: Joi.string().valid('lax', 'strict', 'none').default('lax'),
  // Cookies are Secure automatically in production; this allows forcing it off
  // only for local http development.
  COOKIE_SECURE: Joi.boolean().default(false),

  THROTTLE_TTL_MS: Joi.number().integer().min(1000).default(60_000),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),
  AUTH_THROTTLE_LIMIT: Joi.number().integer().min(1).default(10),

  MAX_FAILED_LOGINS: Joi.number().integer().min(1).default(5),
  LOCK_MINUTES: Joi.number().integer().min(1).default(15),

  SWAGGER_ENABLED: Joi.boolean().default(true),
});
