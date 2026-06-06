import { UserPlan } from '../../../users/enums/user-plan.enum';
import { UserStatusFilter } from '../enums/admin-users-query.enum';

export interface AdminUserItem {
  id: string;
  full_name: string;
  email: string;
  plan: UserPlan;
  status: UserStatusFilter.ACTIVE | UserStatusFilter.INACTIVE;
  created_at: Date;
  last_active_at: Date | null;
  funnel_count: number;
}
