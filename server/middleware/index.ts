/**
 * Middleware Index
 * Exports all middleware for easy importing
 */

// Rate Limiting
export {
  createRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  storeRateLimiter,
  strictRateLimiter,
  checkSocketRateLimit,
  getRateLimitStats,
  clearRateLimitForKey,
  clearAllRateLimits,
  RATE_LIMIT_CONFIGS,
  type RateLimitResult,
  type RateLimitStats,
} from './rateLimiter';

// Validation
export {
  validateRequest,
  validateParams,
  validateQuery,
  validateBody,
  validateSocketPayload,
  sanitizeString,
  sanitizeDisplayName,
  sanitizeForDb,
  isValidUuid,
  isValidEmail,
  isValidUsername,
  SCHEMAS,
  type ValidationSchema,
  type ValidationError,
  type ValidationResult,
} from './validation';

// Security
export {
  securityMiddleware,
  createSecurityMiddleware,
  corsMiddleware,
  securityHeadersMiddleware,
  requestLimitsMiddleware,
  contentTypeMiddleware,
  xssProtectionMiddleware,
  sqlInjectionProtectionMiddleware,
  requestIdMiddleware,
  configureSecurityMiddleware,
  getSecurityConfig,
  type SecurityConfig,
} from './security';

// Error Handling
export {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  createError,
  throwIf,
  assert,
  setupProcessErrorHandlers,
  getRecentErrors,
  getErrorStats,
  sanitizeErrorMessage,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  BadRequestError,
  InternalServerError,
  ServiceUnavailableError,
  type AppError,
  type ErrorResponse,
  type ErrorLogEntry,
} from './errorHandler';
