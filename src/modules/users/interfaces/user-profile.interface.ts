export interface IUserProfile {
  id: string;
  fullName: string;
  email: string;
  country: string | null;
  businessName: string | null;
  avatarUrl: string | null;
  authProvider: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}