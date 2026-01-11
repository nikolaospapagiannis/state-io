/**
 * Request Validation Middleware
 * Schema-based validation with input sanitization
 * Validates UUIDs, emails, usernames, and enforces max lengths
 */

import { Request, Response, NextFunction } from 'express';

// ============ TYPES ============

type ValidationRule = {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'uuid' | 'email';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: readonly string[];
  items?: ValidationSchema;
  properties?: ValidationSchema;
  sanitize?: boolean;
  custom?: (value: unknown) => { valid: boolean; message?: string };
};

export type ValidationSchema = {
  [key: string]: ValidationRule;
};

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  sanitized: Record<string, unknown>;
}

// ============ PATTERNS ============

const PATTERNS = {
  // RFC 5322 compliant email (simplified)
  email: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,

  // UUID v4
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

  // Username: alphanumeric, underscore, hyphen, 3-20 chars
  username: /^[a-zA-Z0-9_-]{3,20}$/,

  // Clan tag: 2-6 uppercase alphanumeric
  clanTag: /^[A-Z0-9]{2,6}$/,

  // Alphanumeric only
  alphanumeric: /^[a-zA-Z0-9]+$/,

  // No special HTML/script characters
  safeText: /^[^<>{}]*$/,
} as const;

// ============ SANITIZATION ============

/**
 * Sanitize string input to prevent XSS
 * Removes dangerous characters and trims whitespace
 */
export function sanitizeString(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    // Trim whitespace
    .trim()
    // Remove null bytes
    .replace(/\0/g, '')
    // Escape HTML entities
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    // Remove control characters (except newlines/tabs for textarea content)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Light sanitization that preserves more characters
 * Used for display names that may have some special chars
 */
export function sanitizeDisplayName(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .replace(/\0/g, '')
    .replace(/</g, '')
    .replace(/>/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .slice(0, 50);
}

/**
 * Sanitize for database queries (additional layer)
 */
export function sanitizeForDb(input: string): string {
  return input
    .replace(/'/g, "''")
    .replace(/\\/g, '\\\\');
}

// ============ VALIDATORS ============

function validateEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length > 254) return false;  // RFC 5321
  return PATTERNS.email.test(value);
}

function validateUuid(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return PATTERNS.uuid.test(value);
}

function validateUsername(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return PATTERNS.username.test(value);
}

// ============ CORE VALIDATION ============

function validateField(
  value: unknown,
  rule: ValidationRule,
  fieldName: string
): ValidationError | null {
  // Handle required
  if (value === undefined || value === null || value === '') {
    if (rule.required) {
      return { field: fieldName, message: `${fieldName} is required` };
    }
    return null;  // Not required and not provided = valid
  }

  // Type validation
  switch (rule.type) {
    case 'string':
      if (typeof value !== 'string') {
        return { field: fieldName, message: `${fieldName} must be a string`, value };
      }
      if (rule.minLength !== undefined && value.length < rule.minLength) {
        return { field: fieldName, message: `${fieldName} must be at least ${rule.minLength} characters`, value };
      }
      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        return { field: fieldName, message: `${fieldName} must not exceed ${rule.maxLength} characters`, value };
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        return { field: fieldName, message: `${fieldName} has invalid format`, value };
      }
      if (rule.enum && !rule.enum.includes(value)) {
        return { field: fieldName, message: `${fieldName} must be one of: ${rule.enum.join(', ')}`, value };
      }
      break;

    case 'email':
      if (!validateEmail(value)) {
        return { field: fieldName, message: `${fieldName} must be a valid email address`, value };
      }
      break;

    case 'uuid':
      if (!validateUuid(value)) {
        return { field: fieldName, message: `${fieldName} must be a valid UUID`, value };
      }
      break;

    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        return { field: fieldName, message: `${fieldName} must be a number`, value };
      }
      if (rule.min !== undefined && value < rule.min) {
        return { field: fieldName, message: `${fieldName} must be at least ${rule.min}`, value };
      }
      if (rule.max !== undefined && value > rule.max) {
        return { field: fieldName, message: `${fieldName} must not exceed ${rule.max}`, value };
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return { field: fieldName, message: `${fieldName} must be a boolean`, value };
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        return { field: fieldName, message: `${fieldName} must be an array`, value };
      }
      if (rule.minLength !== undefined && value.length < rule.minLength) {
        return { field: fieldName, message: `${fieldName} must have at least ${rule.minLength} items`, value };
      }
      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        return { field: fieldName, message: `${fieldName} must not have more than ${rule.maxLength} items`, value };
      }
      break;

    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { field: fieldName, message: `${fieldName} must be an object`, value };
      }
      break;
  }

  // Custom validation
  if (rule.custom) {
    const customResult = rule.custom(value);
    if (!customResult.valid) {
      return { field: fieldName, message: customResult.message || `${fieldName} is invalid`, value };
    }
  }

  return null;
}

export function validateBody(body: unknown, schema: ValidationSchema): ValidationResult {
  const errors: ValidationError[] = [];
  const sanitized: Record<string, unknown> = {};

  if (typeof body !== 'object' || body === null) {
    return {
      valid: false,
      errors: [{ field: 'body', message: 'Request body must be an object' }],
      sanitized: {},
    };
  }

  const bodyObj = body as Record<string, unknown>;

  for (const [fieldName, rule] of Object.entries(schema)) {
    let value = bodyObj[fieldName];

    // Sanitize strings if enabled
    if (rule.sanitize !== false && (rule.type === 'string' || rule.type === 'email')) {
      if (typeof value === 'string') {
        value = sanitizeString(value);
      }
    }

    const error = validateField(value, rule, fieldName);
    if (error) {
      errors.push(error);
    } else if (value !== undefined) {
      sanitized[fieldName] = value;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

// ============ MIDDLEWARE FACTORY ============

export function validateRequest(schema: ValidationSchema) {
  return function validationMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const result = validateBody(req.body, schema);

    if (!result.valid) {
      res.status(400).json({
        error: 'Validation Error',
        message: 'Request validation failed',
        details: result.errors.map(e => ({
          field: e.field,
          message: e.message,
        })),
      });
      return;
    }

    // Replace body with sanitized version
    req.body = result.sanitized;
    next();
  };
}

// Validate URL params
export function validateParams(schema: ValidationSchema) {
  return function paramValidationMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const result = validateBody(req.params, schema);

    if (!result.valid) {
      res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid URL parameters',
        details: result.errors.map(e => ({
          field: e.field,
          message: e.message,
        })),
      });
      return;
    }

    next();
  };
}

// Validate query params
export function validateQuery(schema: ValidationSchema) {
  return function queryValidationMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const result = validateBody(req.query, schema);

    if (!result.valid) {
      res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid query parameters',
        details: result.errors.map(e => ({
          field: e.field,
          message: e.message,
        })),
      });
      return;
    }

    next();
  };
}

// ============ PRE-DEFINED SCHEMAS ============

export const SCHEMAS = {
  // Auth schemas
  register: {
    username: {
      type: 'string',
      required: true,
      minLength: 3,
      maxLength: 20,
      pattern: PATTERNS.username,
      sanitize: true,
    },
    email: {
      type: 'email',
      required: true,
      maxLength: 254,
    },
    password: {
      type: 'string',
      required: true,
      minLength: 6,
      maxLength: 128,
      sanitize: false,  // Don't sanitize passwords
    },
  } as ValidationSchema,

  login: {
    email: {
      type: 'email',
      required: true,
      maxLength: 254,
    },
    password: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 128,
      sanitize: false,
    },
  } as ValidationSchema,

  // Clan schemas
  createClan: {
    name: {
      type: 'string',
      required: true,
      minLength: 3,
      maxLength: 30,
      pattern: PATTERNS.safeText,
      sanitize: true,
    },
    tag: {
      type: 'string',
      required: true,
      minLength: 2,
      maxLength: 6,
      pattern: PATTERNS.clanTag,
      sanitize: true,
    },
    description: {
      type: 'string',
      required: false,
      maxLength: 500,
      sanitize: true,
    },
  } as ValidationSchema,

  // UUID param schema
  uuidParam: {
    id: {
      type: 'uuid',
      required: true,
    },
  } as ValidationSchema,

  // Pagination query schema
  pagination: {
    page: {
      type: 'number',
      required: false,
      min: 1,
      max: 1000,
    },
    limit: {
      type: 'number',
      required: false,
      min: 1,
      max: 100,
    },
  } as ValidationSchema,

  // Store purchase schema
  purchase: {
    itemId: {
      type: 'uuid',
      required: true,
    },
    quantity: {
      type: 'number',
      required: false,
      min: 1,
      max: 100,
    },
  } as ValidationSchema,

  // Chat message schema
  chatMessage: {
    message: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 500,
      sanitize: true,
    },
    roomId: {
      type: 'uuid',
      required: false,
    },
  } as ValidationSchema,

  // Game action schema
  gameAction: {
    actionType: {
      type: 'string',
      required: true,
      enum: ['attack', 'defend', 'boost', 'special'] as const,
    },
    sourceId: {
      type: 'string',
      required: true,
      maxLength: 50,
    },
    targetId: {
      type: 'string',
      required: true,
      maxLength: 50,
    },
    data: {
      type: 'object',
      required: false,
    },
  } as ValidationSchema,

  // Profile update schema
  updateProfile: {
    avatar: {
      type: 'string',
      required: false,
      maxLength: 200,
      pattern: PATTERNS.alphanumeric,
    },
    title: {
      type: 'string',
      required: false,
      maxLength: 50,
      sanitize: true,
    },
  } as ValidationSchema,

  // Friend request schema
  friendRequest: {
    targetUserId: {
      type: 'uuid',
      required: true,
    },
    message: {
      type: 'string',
      required: false,
      maxLength: 200,
      sanitize: true,
    },
  } as ValidationSchema,
} as const;

// ============ UTILITY VALIDATORS ============

export function isValidUuid(value: string): boolean {
  return validateUuid(value);
}

export function isValidEmail(value: string): boolean {
  return validateEmail(value);
}

export function isValidUsername(value: string): boolean {
  return validateUsername(value);
}

// ============ SOCKET VALIDATION ============

export function validateSocketPayload<T extends Record<string, unknown>>(
  payload: unknown,
  schema: ValidationSchema
): { valid: true; data: T } | { valid: false; errors: ValidationError[] } {
  const result = validateBody(payload, schema);

  if (!result.valid) {
    return { valid: false, errors: result.errors };
  }

  return { valid: true, data: result.sanitized as T };
}
