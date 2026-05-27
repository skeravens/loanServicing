import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { Logger } from './common/logger/logger.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Security
  app.use(helmet());
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3001'],
    credentials: true,
  });

  // Logging
  app.useLogger(app.get(Logger));

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Filters & interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Loan Servicing Platform API')
    .setDescription('Multi-tenant SaaS loan servicing REST API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'cognito-jwt')
    .addServer(process.env.API_BASE_URL ?? 'http://localhost:3000')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Loan Platform API running on port ${port}`);
  console.log(`Swagger UI: http://localhost:${port}/api/docs`);
}

bootstrap();
