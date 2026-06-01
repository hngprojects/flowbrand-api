import { Request } from 'express';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';

export interface AdminRequest extends Request {
  user?: JwtPayload;
}
