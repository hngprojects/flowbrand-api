import { BullModule } from '@nestjs/bull';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

const logger = new Logger('QueueModule');

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('redis.host') || 'localhost',
          port: config.get<number>('redis.port') ?? 6379,
          password: config.get<string>('redis.password') || undefined,
          ...(config.get<boolean>('redis.tls') && { tls: {} }),
          enableReadyCheck: false,
          maxRetriesPerRequest: null,
          retryStrategy: (times: number) => {
            if (times > 5) {
              logger.warn('Bull Redis: retry limit reached, entering degraded mode');
              return null;
            }
            return 5000;
          },
        },
        prefix: 'seil:bull',
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
