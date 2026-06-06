import { Injectable } from '@nestjs/common';
import { AdminSearchModelAction } from '../actions/admin-search.action';
import { IAdminSearchResponse, IAdminSearchResult } from '../interfaces/admin-search.interface';

@Injectable()
export class AdminSearchService {
  constructor(private readonly searchAction: AdminSearchModelAction) {}

  /** Searches users by full name or email, ranks exact matches first, and returns the top 10 results. */
  async search(query: string): Promise<IAdminSearchResponse> {
    const users = await this.searchAction.searchUsers(query);

    const results: IAdminSearchResult[] = users.map((user) => {
      let status: 'active' | 'inactive' | 'deleted';
      if (user.deleted_at) {
        status = 'deleted';
      } else if (!user.is_active) {
        status = 'inactive';
      } else {
        status = 'active';
      }

      return {
        type: 'user',
        id: user.id,
        display_name: user.full_name,
        email: user.email,
        status,
        plan: null,
      };
    });

    return {
      results,
      query,
      total: results.length,
    };
  }
}