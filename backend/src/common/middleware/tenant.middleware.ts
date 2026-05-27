import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DataSource } from 'typeorm';

/**
 * For every inbound request, extract the tenant_id from the JWT payload
 * (already decoded by the Passport strategy and attached as req.user)
 * and store it on the request so downstream services can call
 * `SET LOCAL app.current_tenant_id` on their DB connections.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly dataSource: DataSource) {}

  use(req: Request & { user?: { tenantId?: string }; tenantId?: string }, _res: Response, next: NextFunction) {
    // req.user is populated after JWT validation; middleware runs before guards
    // so tenantId may be undefined at this point for unauthenticated routes.
    const tenantId = req.user?.tenantId ?? req.headers['x-tenant-id'] as string | undefined;
    if (tenantId) {
      req.tenantId = tenantId;
    }
    next();
  }
}
