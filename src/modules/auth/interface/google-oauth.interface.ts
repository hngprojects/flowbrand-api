export interface GoogleOAuthProfile {
  provider: 'google';
  providerId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface OAuthLoginResponse {
  statusCode: number;
  message: string;
  accessToken: string;
  refreshToken: string;
  data: {
    user: {
      id: string;
      fullName: string;
      email: string;
      avatarUrl: string | null;
    };
  };
}