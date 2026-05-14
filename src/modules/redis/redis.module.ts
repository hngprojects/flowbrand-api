import { Module } from '@nestjs/common';
import { RedisServiceTsService } from './redis.service.ts/redis.service.ts.service';
import { RedisController } from './redis.controller';
import { RedisService } from './redis.service';
import { RedisServiceTsService } from './redis.service.ts/redis.service.ts.service';

@Module({
  providers: [RedisServiceTsService, RedisService],
  controllers: [RedisController]
})
export class RedisModule {}
