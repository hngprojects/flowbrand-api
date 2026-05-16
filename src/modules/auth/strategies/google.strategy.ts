import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { env } from '../../../config/env';
import type { GoogleOAuthProfile } from '../auth.service';
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
  constructor() {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      throw new Error(SYS_MSG.GOOGLE_OAUTH_CONFIGURATION_INVALID);
    }

    super({
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_REDIRECT_URI,
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