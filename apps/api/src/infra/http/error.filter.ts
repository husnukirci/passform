// Every error leaves the API as an `ErrorResponse` (ADR 13). A domain rule
// violation and a failed zod parse are both the caller's fault, so both are
// 400; Nest's own HTTP exceptions keep their status; anything else is a 500
// whose details stay in the log.

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { ErrorResponse } from "@passform/contracts";
import { DomainError } from "@passform/domain";
import type { Response } from "express";
import { ZodValidationException } from "nestjs-zod";
import { ZodError } from "zod";

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = this.toResponse(exception);
    host.switchToHttp().getResponse<Response>().status(body.statusCode).json(body);
  }

  private toResponse(exception: unknown): ErrorResponse {
    if (exception instanceof ZodValidationException) {
      const error = exception.getZodError();
      const issues =
        error instanceof ZodError
          ? error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))
          : [];
      return { statusCode: 400, message: "Validation failed", issues };
    }
    if (exception instanceof DomainError) {
      return { statusCode: 400, message: exception.message };
    }
    if (exception instanceof HttpException) {
      return { statusCode: exception.getStatus(), message: exception.message };
    }
    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : exception,
    );
    return { statusCode: 500, message: "Internal server error" };
  }
}
