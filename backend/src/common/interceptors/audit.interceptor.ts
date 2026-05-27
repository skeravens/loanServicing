import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { DataSource } from 'typeorm';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user?: { sub: string; tenantId: string };
  tenantId?: string;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly dataSource: DataSource) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const method = request.method;

    // Only audit mutation methods
    const mutationMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!mutationMethods.includes(method)) {
      return next.handle();
    }

    const startedAt = Date.now();
    const userId = request.user?.sub ?? 'anonymous';
    const tenantId = request.tenantId ?? request.user?.tenantId ?? 'unknown';
    const ip = request.ip;
    const path = request.path;
    const body = request.body as Record<string, unknown>;

    return next.handle().pipe(
      tap(async (responseBody) => {
        try {
          const durationMs = Date.now() - startedAt;
          // Extract entity info from path segments: e.g. /loans/:id -> loans
          const segments = path.split('/').filter(Boolean);
          const entityType = segments[0] ?? 'unknown';
          const entityId = (responseBody as Record<string, unknown>)?.['id'] as string ?? segments[1] ?? null;

          await this.dataSource.query(
            `INSERT INTO audit_logs
               (tenant_id, user_id, action, entity_type, entity_id, changes, ip_address, duration_ms, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [
              tenantId,
              userId,
              method,
              entityType,
              entityId,
              JSON.stringify({ path, requestBody: body }),
              ip,
              durationMs,
            ],
          );
        } catch (_err) {
          // Audit failures must never break the main response
        }
      }),
    );
  }
}
