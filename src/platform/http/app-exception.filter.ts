import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const responseBody =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const normalized =
      typeof responseBody === 'string'
        ? { message: responseBody }
        : responseBody && typeof responseBody === 'object'
          ? (responseBody as Record<string, unknown>)
          : {};

    const messageSource = normalized.message;
    const message = Array.isArray(messageSource)
      ? messageSource.join('; ')
      : typeof messageSource === 'string'
        ? messageSource
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    const code =
      typeof normalized.code === 'string'
        ? normalized.code
        : exception instanceof HttpException
          ? exception.name
          : 'InternalServerError';

    response.status(statusCode).json({
      ok: false,
      error: {
        code,
        message,
        statusCode,
      },
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
