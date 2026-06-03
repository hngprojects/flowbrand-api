import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../users/entities/user.entity';
import { UserRoleEntity } from '../../users/entities/user-role.entity';
import { UsersModule } from '../../users/users.module';
import { AdminSearchController } from './controllers//admin-search.controller';
import { AdminSearchService } from './services/admin-search.service';
import { AdminSearchModelAction } from './actions/admin-search.action';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserRoleEntity]),
    UsersModule,
  ],
  controllers: [AdminSearchController],
  providers: [AdminSearchService, AdminSearchModelAction],
  exports: [AdminSearchService],
})
export class AdminSearchModule {}