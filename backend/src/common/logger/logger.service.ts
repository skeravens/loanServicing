import { Injectable, LoggerService, Scope } from '@nestjs/common';
import * as winston from 'winston';

@Injectable({ scope: Scope.DEFAULT })
export class Logger implements LoggerService {
  private readonly logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL ?? 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      defaultMeta: {
        service: 'loan-platform-backend',
        environment: process.env.NODE_ENV ?? 'development',
      },
      transports: [
        new winston.transports.Console({
          format:
            process.env.NODE_ENV === 'development'
              ? winston.format.combine(winston.format.colorize(), winston.format.simple())
              : winston.format.json(),
        }),
      ],
    });
  }

  log(message: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.info(message, { context, ...meta });
  }

  error(message: string, trace?: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.error(message, { context, trace, ...meta });
  }

  warn(message: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.warn(message, { context, ...meta });
  }

  debug(message: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.debug(message, { context, ...meta });
  }

  verbose(message: string, context?: string) {
    this.logger.verbose(message, { context });
  }

  /** Structured audit log entry */
  audit(event: {
    action: string;
    tenantId: string;
    userId: string;
    entityType: string;
    entityId: string;
    changes?: unknown;
    ip?: string;
  }) {
    this.logger.info('AUDIT', { ...event, type: 'audit' });
  }
}
