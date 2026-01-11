/**
 * Global Error Handler Middleware
 * Structured error responses, logging, and error type handling
 * Hides stack traces in production
 */

import { Request, Response, NextFunction } from 'express';

// ============ TYPES ============

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
  details?: unknown;
  requestId?: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  requestId?: string;
  details?: unknown;
  stack?: string;
  timestamp: string;
}

export interface ErrorLogEntry {
  timestamp: string;
  requestId?: string;
  method: string;
  path: string;
  statusCode: number;
  error: string;
  message: string;
  stack?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

// ============ ERROR CLASSES ============

export class ValidationError extends Error implements AppError {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  isOperational = true;
  details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AuthenticationError extends Error implements AppError {
  statusCode = 401;
  code = 'AUTHENTICATION_ERROR';
  isOperational = true;

  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AuthorizationError extends Error implements AppError {
  statusCode = 403;
  code = 'AUTHORIZATION_ERROR';
  isOperational = true;

  constructor(message: string = 'Access denied') {
    super(message);
    this.name = 'AuthorizationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends Error implements AppError {
  statusCode = 404;
  code = 'NOT_FOUND';
  isOperational = true;

  constructor(resource: string = 'Resource') {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConflictError extends Error implements AppError {
  statusCode = 409;
  code = 'CONFLICT';
  isOperational = true;

  constructor(message: string = 'Resource already exists') {
    super(message);
    this.name = 'ConflictError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class RateLimitError extends Error implements AppError {
  statusCode = 429;
  code = 'RATE_LIMIT_EXCEEDED';
  isOperational = true;
  retryAfter: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter: number = 60) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends Error implements AppError {
  statusCode = 400;
  code = 'BAD_REQUEST';
  isOperational = true;
  details?: unknown;

  constructor(message: string = 'Bad request', details?: unknown) {
    super(message);
    this.name = 'BadRequestError';
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class InternalServerError extends Error implements AppError {
  statusCode = 500;
  code = 'INTERNAL_SERVER_ERROR';
  isOperational = false;

  constructor(message: string = 'Internal server error') {
    super(message);
    this.name = 'InternalServerError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ServiceUnavailableError extends Error implements AppError {
  statusCode = 503;
  code = 'SERVICE_UNAVAILABLE';
  isOperational = true;

  constructor(message: string = 'Service temporarily unavailable') {
    super(message);
    this.name = 'ServiceUnavailableError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============ ERROR LOGGING ============

const errorLog: ErrorLogEntry[] = [];
const MAX_LOG_SIZE = 1000;

function logError(entry: ErrorLogEntry): void {
  // Add to in-memory log (for debugging/admin)
  errorLog.unshift(entry);
  if (errorLog.length > MAX_LOG_SIZE) {
    errorLog.pop();
  }

  // Console logging
  const logLevel = entry.statusCode >= 500 ? 'error' : 'warn';
  const logMessage = `[${entry.timestamp}] ${entry.method} ${entry.path} - ${entry.statusCode} - ${entry.error}: ${entry.message}`;

  if (logLevel === 'error') {
    console.error(logMessage);
    if (entry.stack && process.env.NODE_ENV !== 'production') {
      console.error(entry.stack);
    }
  } else {
    console.warn(logMessage);
  }
}

export function getRecentErrors(count: number = 50): ErrorLogEntry[] {
  return errorLog.slice(0, count);
}

export function getErrorStats(): {
  total: number;
  byStatusCode: Record<number, number>;
  byCode: Record<string, number>;
} {
  const stats = {
    total: errorLog.length,
    byStatusCode: {} as Record<number, number>,
    byCode: {} as Record<string, number>,
  };

  for (const entry of errorLog) {
    stats.byStatusCode[entry.statusCode] = (stats.byStatusCode[entry.statusCode] || 0) + 1;
    if (entry.error) {
      stats.byCode[entry.error] = (stats.byCode[entry.error] || 0) + 1;
    }
  }

  return stats;
}

// ============ ENVIRONMENT ============

const isProduction = process.env.NODE_ENV === 'production';

// ============ HELPER FUNCTIONS ============

function getStatusCodeForError(error: Error): number {
  if ((error as AppError).statusCode) {
    return (error as AppError).statusCode!;
  }

  // Map common error types
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    return 401;
  }

  if (error.name === 'SyntaxError' && 'body' in error) {
    return 400;  // JSON parse error
  }

  if (error.message?.includes('ECONNREFUSED')) {
    return 503;
  }

  return 500;
}

function getErrorCode(error: Error): string {
  if ((error as AppError).code) {
    return (error as AppError).code!;
  }

  // Map error names to codes
  const codeMap: Record<string, string> = {
    JsonWebTokenError: 'INVALID_TOKEN',
    TokenExpiredError: 'TOKEN_EXPIRED',
    SyntaxError: 'PARSE_ERROR',
    TypeError: 'TYPE_ERROR',
    ReferenceError: 'REFERENCE_ERROR',
    RangeError: 'RANGE_ERROR',
  };

  return codeMap[error.name] || 'UNKNOWN_ERROR';
}

function sanitizeErrorMessage(message: string): string {
  // Remove sensitive information from error messages
  return message
    .replace(/password[:\s]*\S+/gi, 'password: [REDACTED]')
    .replace(/token[:\s]*\S+/gi, 'token: [REDACTED]')
    .replace(/key[:\s]*\S+/gi, 'key: [REDACTED]')
    .replace(/secret[:\s]*\S+/gi, 'secret: [REDACTED]')
    .replace(/(\d{1,3}\.){3}\d{1,3}/g, '[IP]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
}

function getUserFriendlyMessage(statusCode: number, error: Error): string {
  // Don't expose internal error details in production
  if (isProduction && statusCode >= 500) {
    return 'An unexpected error occurred. Please try again later.';
  }

  if ((error as AppError).isOperational) {
    return error.message;
  }

  // Generic messages for common status codes
  const genericMessages: Record<number, string> = {
    400: 'The request was invalid or malformed.',
    401: 'Authentication is required to access this resource.',
    403: 'You do not have permission to access this resource.',
    404: 'The requested resource was not found.',
    409: 'The request conflicts with the current state.',
    429: 'Too many requests. Please slow down.',
    500: 'An internal server error occurred.',
    502: 'Bad gateway error.',
    503: 'Service temporarily unavailable.',
    504: 'Gateway timeout.',
  };

  return genericMessages[statusCode] || error.message;
}

// ============ MIDDLEWARE ============

// 404 Handler - Must come before error handler
export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req as Request & { requestId?: string }).requestId;

  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    code: 'ROUTE_NOT_FOUND',
    requestId,
    timestamp: new Date().toISOString(),
  });
}

// Global error handler - Must be last middleware
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = getStatusCodeForError(err);
  const errorCode = getErrorCode(err);
  const requestId = (req as Request & { requestId?: string }).requestId;
  const authReq = req as Request & { user?: { id: string } };

  // Build error log entry
  const logEntry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    requestId,
    method: req.method,
    path: req.path,
    statusCode,
    error: errorCode,
    message: err.message,
    stack: err.stack,
    userId: authReq.user?.id,
    ip: req.ip || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
  };

  // Log the error
  logError(logEntry);

  // Build error response
  const response: ErrorResponse = {
    error: err.name || 'Error',
    message: getUserFriendlyMessage(statusCode, err),
    code: errorCode,
    requestId,
    timestamp: new Date().toISOString(),
  };

  // Add details if available and not production
  if ((err as AppError).details && !isProduction) {
    response.details = (err as AppError).details;
  }

  // Add stack trace in development
  if (!isProduction && err.stack) {
    response.stack = err.stack;
  }

  // Handle rate limit errors specially
  if (err instanceof RateLimitError) {
    res.setHeader('Retry-After', err.retryAfter.toString());
  }

  // Send response
  res.status(statusCode).json(response);
}

// Async error wrapper for route handlers
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ============ UTILITY FUNCTIONS ============

export function createError(
  statusCode: number,
  message: string,
  code?: string,
  details?: unknown
): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  error.isOperational = statusCode < 500;
  return error;
}

// Throw if condition is true
export function throwIf(
  condition: boolean,
  ErrorClass: new (message?: string) => Error,
  message?: string
): void {
  if (condition) {
    throw new ErrorClass(message);
  }
}

// Assert with custom error
export function assert(
  condition: unknown,
  message: string = 'Assertion failed',
  statusCode: number = 400
): asserts condition {
  if (!condition) {
    throw createError(statusCode, message, 'ASSERTION_FAILED');
  }
}

// ============ PROCESS ERROR HANDLERS ============

export function setupProcessErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    console.error('[FATAL] Uncaught Exception:', error);
    logError({
      timestamp: new Date().toISOString(),
      method: 'SYSTEM',
      path: 'uncaughtException',
      statusCode: 500,
      error: 'UNCAUGHT_EXCEPTION',
      message: error.message,
      stack: error.stack,
    });

    // In production, we should gracefully shutdown
    if (isProduction) {
      console.error('Shutting down due to uncaught exception...');
      process.exit(1);
    }
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;

    console.error('[WARNING] Unhandled Promise Rejection:', reason);
    logError({
      timestamp: new Date().toISOString(),
      method: 'SYSTEM',
      path: 'unhandledRejection',
      statusCode: 500,
      error: 'UNHANDLED_REJECTION',
      message,
      stack,
    });
  });

  // Handle SIGTERM
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    process.exit(0);
  });

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down...');
    process.exit(0);
  });
}

// Export all error classes and middleware
export {
  sanitizeErrorMessage,
};
