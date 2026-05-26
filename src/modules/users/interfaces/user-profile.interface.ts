export interface IUserProfile {
  id: string;
  fullName: string;
  email: string;
  country: string | null;
  avatarUrl: string | null;
  authProvider: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUpdateUserProfilePayload {
  fullName?: string;
  country?: string;
}

export interface IProfileUpdateAudit {
  changedFields: Array<'full_name' | 'country'>;
}