import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * One consistent error shape for the whole API. Unknown errors are logged
 * with their stack server-side but returned as a generic 500 — internals,
 * stack traces and database messages never reach the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!isHttp) {
      this.logger.error(
        { event: 'http.unhandled_error', path: request.url },
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    let message: string | string[] =
      'Something went wrong. Please try again later.';
    let error = 'Internal Server Error';
    if (isHttp) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const record = body as { message?: string | string[]; error?: string };
        message = record.message ?? message;
        error = record.error ?? exception.name;
      }
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
