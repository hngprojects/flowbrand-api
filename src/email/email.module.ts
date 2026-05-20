import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailQueueModule } from './email-queue.module';
import { EmailProcessor } from './processors/email.processor';
import { EmailService } from './email.service';
import { TemplateService } from './template.service';

@Module({
  imports: [EmailQueueModule],
  providers: [
    TemplateService,
    EmailService,
    {
      provide: 'RESEND_CLIENT',
      useFactory: (config: ConfigService) => new Resend(config.get<string>('RESEND_API_KEY')),
      inject: [ConfigService],
    },
    EmailProcessor,
  ],
  exports: [EmailService],
})
export class EmailModule {}
