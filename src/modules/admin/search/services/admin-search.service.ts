import { Injectable } from '@nestjs/common';
import { AdminSearchModelAction } from '../actions/admin-search.action';
import { IAdminSearchResponse, IAdminSearchResult } from '../interfaces/admin-search.interface';

@Injectable()
export class AdminSearchService {
  constructor(private readonly searchAction: AdminSearchModelAction) {}

  async search(query: string): Promise<IAdminSearchResponse> {
    const users = await this.searchAction.searchUsers(query);
    const queryLower = query.toLowerCase();

    const sorted = [...users].sort((a, b) => {
      const aEmailExact = a.email.toLowerCase() === queryLower;
      const bEmailExact = b.email.toLowerCase() === queryLower;

      if (aEmailExact && !bEmailExact) return -1;
      if (!aEmailExact && bEmailExact) return 1;

      const aNameExact = a.full_name.toLowerCase() === queryLower;
      const bNameExact = b.full_name.toLowerCase() === queryLower;

      if (aNameExact && !bNameExact) return -1;
      if (!aNameExact && bNameExact) return 1;

      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return bTime - aTime;
    });

    const total = sorted.length;
    const paginated = sorted.slice(0, 10);

    const results: IAdminSearchResult[] = paginated.map((user) => {
      let status: 'active' | 'inactive' | 'deleted';
      if (user.deleted_at !== null) {
        status = 'deleted';
      } else if (!user.is_active) {
        status = 'inactive';
      } else {
        status = 'active';
      }

      // Safe check for plan if added to User entity later
      const plan = 'plan' in user ? (user as unknown as { plan: string | null }).plan : null;

      return {
        type: 'user',
        id: user.id,
        display_name: user.full_name,
        displayName: user.full_name,
        email: user.email,
        status,
        plan,
      };
    });

    return {
      results,
      query,
      total,
    };
  }
}