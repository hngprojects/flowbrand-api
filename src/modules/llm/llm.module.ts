import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { llmConfig } from '../../config/llm.config';
import { LlmService } from '../../queue/interfaces/llm.service.interface';
import { LlmServiceImpl } from './llm.service';

@Module({
  imports: [ConfigModule.forFeature(llmConfig)],
  providers: [
    {
      provide: LlmService,
      useClass: LlmServiceImpl,
    },
  ],
  exports: [LlmService],
})
export class LlmModule {}
