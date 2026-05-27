import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3001'],
  jwtSecret: process.env.JWT_SECRET,
}));
