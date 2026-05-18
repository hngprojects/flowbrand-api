export interface GoogleOAuthProfile {
  provider: 'google';
  providerId: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
}

export interface OAuthLoginResponse {
  status_code: number;
  message: string;
  access_token: string;
  refresh_token: string;
  data: {
    user: {
      id: string;
      fullName: string;
      email: string;
      avatarUrl: string | null;
    };
  };
}