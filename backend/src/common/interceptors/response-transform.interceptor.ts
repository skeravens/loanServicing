import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * Wraps all successful responses in `{ data: T }` envelope.
 * Pagination meta (total, page, limit) is passed through when present.
 */
@Injectable()
export class ResponseTransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If the service already returned an envelope shape, pass through
        if (data && typeof data === 'object' && 'data' in (data as object)) {
          return data as unknown as ApiResponse<T>;
        }
        return { data };
      }),
    );
  }
}
