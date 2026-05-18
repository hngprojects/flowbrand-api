import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../../email/email.module';
import { WaitlistModelAction } from './actions/waitlist.action';
import { Waitlist } from './entities/waitlist.entity';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';

@Module({
  imports: [TypeOrmModule.forFeature([Waitlist]), EmailModule],
  controllers: [WaitlistController],
  providers: [WaitlistModelAction, WaitlistService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
