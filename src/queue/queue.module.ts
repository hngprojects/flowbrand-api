import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

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
          username: config.get<string>('redis.username') || undefined,
          ...(config.get<boolean>('redis.tls') && { tls: {} }),
          enableReadyCheck: false,
          maxRetriesPerRequest: null,
          retryStrategy: (times: number) => {
            if (times <= 5) {
              return 5000;
            }
            // slow phase: cap at 30 s + jitter so workers don't thunderherd on recovery
            const jitter = Math.floor(Math.random() * 5000);
            return Math.min(times * 1000, 30_000) + jitter;
          },
        },
        prefix: `seil:bull:${config.get<string>('NODE_ENV') || 'development'}`,
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
