import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { env } from './env';

export const databaseConfig = registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    username: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    synchronize: env.DATABASE_SYNC,
    logging: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : env.DATABASE_LOGGING,
    maxQueryExecutionTime: env.NODE_ENV === 'development' ? 250 : undefined,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
    autoLoadEntities: true,
  }),
);
