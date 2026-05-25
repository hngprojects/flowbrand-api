import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

export interface ApiResponse<T> {
  success: true;
  statusCode: number;
  message?: string;
  data: T;
  meta?: Record<string, unknown>;
}

/** Shape returned by controllers that need an explicit message at the top level. */
interface StructuredPayload {
  statusCode: number;
  message: string;
  data?: unknown;
  [key: string]: unknown;
}

function isStructuredPayload(value: unknown): value is StructuredPayload {
  return (
    value !== null && typeof value === 'object' && 'statusCode' in (value) && 'message' in (value)
  );
}

function defaultMessageFor(statusCode: HttpStatus): string {
  switch (statusCode) {
    case HttpStatus.CREATED:
      return 'Resource created successfully';
    case HttpStatus.NO_CONTENT:
      return 'No content';
    default:
      return 'Operation successful';
  }
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const httpResponse = _context.switchToHttp().getResponse<{ statusCode?: number }>();

    return next.handle().pipe(
      map((payload) => {
        const defaultStatusCode = httpResponse?.statusCode ?? HttpStatus.OK;

        // Case 1: { statusCode, message, data?, ...rest }
        // Controller explicitly shapes the response — interceptor lifts fields to the
        // top level and never produces body.data.data nesting.
        if (isStructuredPayload(payload)) {
          const { statusCode, message, data, ...rest } = payload;
          return {
            success: true as const,
            statusCode: statusCode ?? defaultStatusCode,
            message,
            data: (data === undefined ? null : data) as T,
            ...(Object.keys(rest).length > 0 ? { meta: rest } : {}),
          };
        }

        // Case 2: { paginationMeta, payload, ...rest } — paginated list
        if (payload !== null && typeof payload === 'object' && 'paginationMeta' in (payload as object)) {
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
            success: true as const,
            statusCode: defaultStatusCode,
            message: defaultMessageFor(defaultStatusCode),
            data,
            meta: { ...rest, ...paginationMeta },
          };
        }

        // Case 3: raw service result or primitive — wrapped as-is
        return {
          success: true as const,
          statusCode: defaultStatusCode,
          message: defaultMessageFor(defaultStatusCode),
          data: payload,
        };
      }),
    );
  }
}
