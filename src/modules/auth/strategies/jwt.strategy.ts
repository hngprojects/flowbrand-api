import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { env } from '../../../config/env';

export interface JwtPayload {
  userId: string;
  sub: string;
  email: string;
  sessionId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.JWT_ACCESS_SECRET,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return {
      userId: payload.userId,
      sub: payload.sub,
      email: payload.email,
      sessionId: payload.sessionId,
    };
  }
}
