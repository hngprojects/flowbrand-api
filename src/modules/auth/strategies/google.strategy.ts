import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { env } from '../../../config/env';
import { GoogleOAuthProfile } from '../dto/google-oauth.dto';
import * as SYS_MSG from '../../../constants/system.messages';

interface PassportGoogleProfile {
  id: string;
  displayName?: string;
  emails?: Array<{ value: string; verified?: boolean }>;
  photos?: Array<{ value: string }>;
  name?: { givenName?: string; familyName?: string };
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private static readonly logger = new Logger(GoogleStrategy.name);

  constructor() {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      GoogleStrategy.logger.warn(
        'Google OAuth is not configured: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must be set for OAuth to work.',
      );
    }

    super({
      clientID: env.GOOGLE_CLIENT_ID || 'GOOGLE_CLIENT_ID_NOT_SET',
      clientSecret: env.GOOGLE_CLIENT_SECRET || 'GOOGLE_CLIENT_SECRET_NOT_SET',
      callbackURL: env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: PassportGoogleProfile,
    done: VerifyCallback
  ): void {
    if (!profile || !profile.emails || !profile.emails.length) {
      return done(new UnauthorizedException(SYS_MSG.GOOGLE_ACCOUNT_NO_EMAIL), false);
    }

    const email = profile.emails[0].value;
    const user: GoogleOAuthProfile = {
      provider: 'google',
      providerId: profile.id,
      email,
      full_name: profile.displayName || `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim(),
      avatar_url: profile.photos && profile.photos.length ? profile.photos[0].value : null,
    };

    return done(null, user);
  }
}