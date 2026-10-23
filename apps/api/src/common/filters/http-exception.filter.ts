import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ErrorCode } from '@simply/api-contracts';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const requestId = request?.requestId || request?.headers?.['x-request-id'] || 'req_unknown';
    const tenantId = (request as any)?.tenantContext?.tenantId || (request as any)?.user?.tenantId || 'none';
    const storeId = (request as any)?.tenantContext?.storeId || (request as any)?.user?.storeId || 'none';
    const method = request?.method || 'UNKNOWN';
    const url = String(request?.url || request?.raw?.url || 'unknown_url').split('?')[0];
    const safeIdentifier = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(value) ? value : undefined;
    const context = {
      requestId: safeIdentifier(requestId), endpoint: url, operation: `${method} ${request?.routeOptions?.url || url}`,
      tenantId: safeIdentifier(tenantId), storeId: safeIdentifier(storeId) || safeIdentifier(request?.body?.storeId),
      merchantId: safeIdentifier(request?.user?.userId), orderId: safeIdentifier(request?.body?.orderId || request?.params?.id),
    };

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected internal error occurred.';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as any;
        message = resObj.message || exception.message;
        code = resObj.code || this.mapStatusToErrorCode(status);
        details = resObj.details || (Array.isArray(resObj.message) ? resObj.message : undefined);
        if (Array.isArray(resObj.message)) {
          message = resObj.message[0] || 'Validation failed for the submitted data.';
        }
      }
    } else if (exception && typeof exception === 'object' && 'code' in exception && typeof (exception as any).code === 'string' && (exception as any).code.startsWith('P')) {
      // Prisma known request error mapping
      const pCode = (exception as any).code;
      const meta = (exception as any).meta || {};
      this.logger.warn(JSON.stringify({ ...context, errorCode: pCode, model: safeIdentifier(meta.modelName) }));

      if (pCode === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = ErrorCode.IDEMPOTENCY_CONFLICT;
        const target = Array.isArray(meta.target) ? meta.target.join(', ') : meta.target || 'field';
        message = `A record with this ${target} already exists. Please choose a unique value.`;
      } else if (pCode === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        code = ErrorCode.VALIDATION_FAILED;
        message = 'A referenced resource (such as category, variant, or media) does not exist.';
      } else if (pCode === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = ErrorCode.PRODUCT_NOT_FOUND;
        message = 'The requested resource was not found.';
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        code = ErrorCode.INTERNAL_SERVER_ERROR;
        message = 'The operation could not be completed. Please retry or contact support with the request ID.';
      }
    } else if (exception instanceof Error) {
      // Internal unhandled errors - never leak database or stack details to client
      this.logger.error(JSON.stringify({ ...context, errorType: exception.name, errorCode: 'UNHANDLED' }));
      message = 'An unexpected server error occurred. Please contact support.';
      code = ErrorCode.INTERNAL_SERVER_ERROR;
    }

    const errorPayload = {
      error: {
        code,
        message,
        requestId,
        ...(details ? { details } : {}),
      },
    };

    if (response.status) {
      response.status(status).send(errorPayload);
    } else {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(errorPayload));
    }
  }

  private mapStatusToErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.PRODUCT_NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.IDEMPOTENCY_CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMIT_EXCEEDED;
      default:
        return ErrorCode.INTERNAL_SERVER_ERROR;
    }
  }
}
