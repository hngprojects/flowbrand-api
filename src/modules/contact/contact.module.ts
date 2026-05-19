import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../../email/email.module';
import { ContactModelAction } from './actions/contact.action';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { Contact } from './entities/contact.entity';
import { SpamDetectionService } from './spam-detection.service';

@Module({
  imports: [TypeOrmModule.forFeature([Contact]), EmailModule],
  controllers: [ContactController],
  providers: [ContactService, ContactModelAction, SpamDetectionService],
})
export class ContactModule {}
