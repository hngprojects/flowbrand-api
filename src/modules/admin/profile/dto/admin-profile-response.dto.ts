import { Exclude } from 'class-transformer';
import { UserRole } from '../../../users/enums/user-role.enum';

export class AdminProfileResponseDto {
  id: string;
  full_name: string;
  email: string;
  country: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: Date;

  @Exclude()
  password_hash?: string | null;
}
