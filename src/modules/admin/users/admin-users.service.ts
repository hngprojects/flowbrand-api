import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import * as SYS_MSG from '../../../constants/system.messages';
import { UserModelAction } from '../../users/actions/user.action';
import { UserRoleModelAction } from '../../users/actions/user-role.action';
import { UsersService } from '../../users/users.service';
import { CreateAdminDto } from './dto/create-admin.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly usersService: UsersService,
    private readonly userModelAction: UserModelAction,
    private readonly userRoleModelAction: UserRoleModelAction,
    private readonly dataSource: DataSource,
  ) {}

  /** Creates a new admin or super-admin account and assigns the specified role. */
  async createAdmin(dto: CreateAdminDto): Promise<{ message: string }> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(SYS_MSG.ADMIN_EMAIL_CONFLICT);
    }

    try {
      const passwordHash = await bcrypt.hash(dto.password, 12);
      await this.dataSource.transaction(async (manager) => {
        const user = await this.userModelAction.create({
          createPayload: {
            email: dto.email,
            full_name: dto.full_name,
            password_hash: passwordHash,
            is_verified: true,
            termsAccepted: true,
          },
          transactionOptions: { useTransaction: true, transaction: manager },
        });

        await this.userRoleModelAction.create({
          createPayload: { user_id: user.id, role: dto.role },
          transactionOptions: { useTransaction: true, transaction: manager },
        });
      });
    } catch (error: unknown) {
      if (this.isUniqueEmailConflict(error)) {
        throw new ConflictException(SYS_MSG.ADMIN_EMAIL_CONFLICT);
      }
      throw error;
    }

    return { message: SYS_MSG.ADMIN_CREATED_SUCCESSFULLY };
  }

  private isUniqueEmailConflict(error: unknown): boolean {
    return (
      error instanceof ConflictException ||
      Boolean(
        error &&
        typeof error === 'object' &&
        'driverError' in error &&
        (error as { driverError?: { code?: string } }).driverError?.code === '23505',
      )
    );
  }
}
