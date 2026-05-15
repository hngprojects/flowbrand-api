import { Module } from '@nestjs/common';
import { EmailQueueModule } from './email-queue.module';
import { EmailProcessor } from './processors/email.processor';
import { EmailService } from './email.service';
import { TemplateService } from './template.service';

@Module({
  imports: [EmailQueueModule],
  providers: [TemplateService, EmailService, EmailProcessor],
  exports: [EmailService],
})
export class EmailModule {}
