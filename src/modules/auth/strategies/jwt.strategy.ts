import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as SYS_MSG from '../../../constants/system.messages';
import { env } from '../../../config/env';
import { UserSessionModelAction } from '../../users/actions/user-session.action';

export interface JwtPayload {
  userId: string;
  sub: string;
  email: string;
  sessionId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly userSessionAction: UserSessionModelAction,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.JWT_ACCESS_SECRET,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload.sessionId) {
      throw new UnauthorizedException(SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE);
    }

    const session = await this.userSessionAction.findById(payload.sessionId);

    if (
      !session ||
      session.user_id !== payload.sub ||
      session.is_revoked ||
      session.expires_at <= new Date()
    ) {
      throw new UnauthorizedException(SYS_MSG.AUTH_UNAUTHENTICATED_MESSAGE);
    }

    return payload;
  }
}
