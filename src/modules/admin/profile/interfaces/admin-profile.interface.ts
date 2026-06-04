import { UserRole } from '../../../users/enums/user-role.enum';

export interface IAdminProfile {
  id: string;
  full_name: string;
  email: string;
  country: string | null;
  avatar_url: string | null;
  role: UserRole | null;
  created_at: Date;
}
