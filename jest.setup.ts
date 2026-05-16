// jest.setup.ts
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DATABASE_HOST = 'localhost';
process.env.DATABASE_PORT = '5432';
process.env.DATABASE_USER = 'postgres';
process.env.DATABASE_PASSWORD = 'postgres';
process.env.DATABASE_NAME = 'nestjs_starter';
process.env.DATABASE_SYNC = 'false';
process.env.DATABASE_LOGGING = 'false';
process.env.DATABASE_SSL = 'false';
process.env.JWT_ACCESS_SECRET =
  'change-me-to-a-long-random-string-min-32-chars';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_SECRET =
  'change-me-too-to-a-different-long-random-string';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.CORS_ORIGIN = '*';
process.env.SWAGGER_ENABLED = 'true';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PASSWORD = '';
process.env.REDIS_USERNAME = '';
