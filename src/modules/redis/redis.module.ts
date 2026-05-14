import { Module } from '@nestjs/common';
import { RedisController } from './redis.controller';
import { RedisService } from './redis.service';

@Module({
  providers: [RedisService],
  controllers: [RedisController],
})
export class RedisModule {}
