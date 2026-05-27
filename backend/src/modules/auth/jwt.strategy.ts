import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';

export interface CognitoJwtPayload {
  sub: string;
  email: string;
  'custom:tenant_id': string;
  'custom:role': string;
  token_use: string;
  iss: string;
  exp: number;
  iat: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly configService: ConfigService) {
    const jwksUri = configService.get<string>('aws.cognito.jwksUri')!;
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri,
      }),
      algorithms: ['RS256'],
    });
  }

  validate(payload: CognitoJwtPayload) {
    if (payload.token_use !== 'access') {
      throw new UnauthorizedException('Expected access token');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      tenantId: payload['custom:tenant_id'],
      role: payload['custom:role'],
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}
