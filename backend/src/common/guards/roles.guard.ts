import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../enums';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator — route is accessible by all authenticated users
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('User not authenticated');

    const userRole = user.role as UserRole;

    // ADMIN can do everything
    if (userRole === UserRole.ADMIN) return true;

    if (!requiredRoles.includes(userRole)) {
      throw new ForbiddenException(
        `Role '${userRole}' is not authorised for this action. Required: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
