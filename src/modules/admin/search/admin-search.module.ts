import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../users/entities/user.entity';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminSearchController } from './controllers/admin-search.controller';
import { AdminSearchService } from './services/admin-search.service';
import { AdminSearchModelAction } from './actions/admin-search.action';
import { RolesGuard } from '../../auth/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    AdminAuthModule,
  ],
  controllers: [AdminSearchController],
  providers: [AdminSearchService, AdminSearchModelAction, RolesGuard],
  exports: [AdminSearchService],
})
export class AdminSearchModule {}