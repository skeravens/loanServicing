import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
  sub: string;          // Cognito user ID
  email: string;
  tenantId: string;
  role: string;
  iat: number;
  exp: number;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as JwtPayload;
  },
);
