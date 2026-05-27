import { Module } from '@nestjs/common';
import { AuditInterceptor } from '../../common/interceptors/audit.interceptor';

@Module({
  providers: [AuditInterceptor],
  exports: [AuditInterceptor],
})
export class AuditModule {}
