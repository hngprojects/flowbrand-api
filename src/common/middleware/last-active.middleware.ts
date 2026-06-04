import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { NextFunction, Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { AuthMetadata } from '../../modules/auth/entities/auth-metadata.entity';

interface DecodedJwt {
  sub?: string;
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

  /** Decodes the bearer token and stamps last_login_at on auth_metadata. */
  private async updateLastActive(req: Request): Promise<void> {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) return;

    const token = authHeader.slice(7);
    const decoded = this.jwtService.decode<DecodedJwt>(token);
    if (!decoded?.sub) return;

    await this.dataSource
      .createQueryBuilder()
      .update(AuthMetadata)
      .set({ last_login_at: () => 'NOW()' })
      .where('user_id = :userId', { userId: decoded.sub })
      .execute();
  }
}
