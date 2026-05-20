import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

export interface ApiResponse<T> {
  success: true;
  statusCode: number;
  data: T;
  meta?: Record<string, unknown>;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const httpResponse = _context.switchToHttp().getResponse<{ statusCode?: number }>();

    return next.handle().pipe(
      map((payload) => {
        const statusCode = httpResponse?.statusCode ?? 200;

        if (payload && typeof payload === 'object' && 'paginationMeta' in (payload as object)) {
          const {
            paginationMeta,
            payload: data,
            ...rest
          } = payload as unknown as {
            paginationMeta: Record<string, unknown>;
            payload: T;
            [key: string]: unknown;
          };
          return {
            success: true,
            statusCode,
            data: data,
            meta: { ...rest, ...paginationMeta },
          };
        }
        return { success: true, statusCode, data: payload };
      }),
    );
  }
}
