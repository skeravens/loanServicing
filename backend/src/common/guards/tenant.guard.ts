import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { UserRole } from '../enums';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user: { tenantId: string; role: string };
      tenantId: string;
      params: { tenantId?: string };
    }>();

    const jwtTenantId = request.user?.tenantId;

    if (!jwtTenantId) {
      throw new BadRequestException('Missing tenant context in token');
    }

    // Set on request for downstream use
    request.tenantId = jwtTenantId;

    // If the route includes a :tenantId path param, ensure it matches (unless ADMIN)
    const paramTenantId = request.params?.tenantId;
    if (paramTenantId && paramTenantId !== jwtTenantId) {
      if (request.user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Tenant ID mismatch');
      }
    }

    return true;
  }
}
