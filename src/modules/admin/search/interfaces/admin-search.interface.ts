export interface IAdminSearchResult {
  type: 'user';
  id: string;
  display_name: string;
  displayName: string;
  email: string;
  status: 'active' | 'inactive' | 'deleted';
  plan: string | null;
}

export interface IAdminSearchResponse {
  results: IAdminSearchResult[];
  query: string;
  total: number;
}