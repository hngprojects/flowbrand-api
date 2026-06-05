import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { NextFunction, Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { env } from '../../config/env';
import { AuthMetadata } from '../../modules/auth/entities/auth-metadata.entity';

interface VerifiedJwt {
  sub: string;
}

@Injectable()
export class LastActiveMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    next();
    void this.updateLastActive(req).catch(() => {});
  }

  /** Verifies the bearer token signature and stamps last_login_at on auth_metadata. */
  private async updateLastActive(req: Request): Promise<void> {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) return;

    const token = authHeader.slice(7);

    let verified: VerifiedJwt;
    try {
      verified = await this.jwtService.verifyAsync<VerifiedJwt>(token, {
        secret: env.JWT_ACCESS_SECRET,
      });
    } catch {
      return;
    }

    if (!verified.sub) return;

    await this.dataSource
      .createQueryBuilder()
      .update(AuthMetadata)
      .set({ last_login_at: () => 'NOW()' })
      .where('user_id = :userId', { userId: verified.sub })
      .execute();
  }
}
