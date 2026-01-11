/**
 * Security Middleware
 * Helmet-like security headers, CORS, XSS protection, and request limits
 * Production-grade security without external dependencies
 */

import { Request, Response, NextFunction } from 'express';

// ============ TYPES ============

export interface SecurityConfig {
  // CORS settings
  cors: {
    enabled: boolean;
    origins: string[];
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    credentials: boolean;
    maxAge: number;
  };
  // Content Security Policy
  csp: {
    enabled: boolean;
    directives: Record<string, string[]>;
  };
  // Request limits
  limits: {
    maxBodySize: number;         // Max body size in bytes
    maxUrlLength: number;        // Max URL length
    maxHeaderSize: number;       // Max single header size
    maxHeaderCount: number;      // Max number of headers
  };
  // Other settings
  hideServerHeader: boolean;
  hidePoweredBy: boolean;
  hstsEnabled: boolean;
  hstsMaxAge: number;
  noSniff: boolean;
  xssFilter: boolean;
  frameOptions: 'DENY' | 'SAMEORIGIN' | false;
  referrerPolicy: string;
}

// ============ DEFAULT CONFIGURATION ============

const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  cors: {
    enabled: true,
    origins: [
      'http://localhost:8700',
      'http://localhost:3000',
      'http://localhost:5173',
      'capacitor://localhost',
      'ionic://localhost',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'X-Request-ID',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Request-ID',
      'X-Response-Time',
    ],
    credentials: true,
    maxAge: 86400,  // 24 hours
  },
  csp: {
    enabled: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],  // Needed for game
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'", 'ws:', 'wss:'],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
    },
  },
  limits: {
    maxBodySize: 1024 * 1024,      // 1MB
    maxUrlLength: 2048,             // 2KB
    maxHeaderSize: 8192,            // 8KB
    maxHeaderCount: 50,
  },
  hideServerHeader: true,
  hidePoweredBy: true,
  hstsEnabled: true,
  hstsMaxAge: 31536000,  // 1 year
  noSniff: true,
  xssFilter: true,
  frameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
};

// Runtime config (can be modified)
let securityConfig: SecurityConfig = { ...DEFAULT_SECURITY_CONFIG };

// ============ CONFIGURATION ============

export function configureSecurityMiddleware(config: Partial<SecurityConfig>): void {
  securityConfig = {
    ...DEFAULT_SECURITY_CONFIG,
    ...config,
    cors: { ...DEFAULT_SECURITY_CONFIG.cors, ...config.cors },
    csp: { ...DEFAULT_SECURITY_CONFIG.csp, ...config.csp },
    limits: { ...DEFAULT_SECURITY_CONFIG.limits, ...config.limits },
  };
}

export function getSecurityConfig(): SecurityConfig {
  return { ...securityConfig };
}

// ============ CORS MIDDLEWARE ============

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;

  const { origins } = securityConfig.cors;

  // Check for wildcard
  if (origins.includes('*')) return true;

  // Check exact match
  if (origins.includes(origin)) return true;

  // Check pattern matching (supports wildcards like *.example.com)
  for (const allowed of origins) {
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      if (origin.endsWith(domain)) return true;
    }
  }

  return false;
}

export function corsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!securityConfig.cors.enabled) {
    return next();
  }

  const origin = req.headers.origin;
  const { cors } = securityConfig;

  // Handle preflight
  if (req.method === 'OPTIONS') {
    if (isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin!);
    }

    res.setHeader('Access-Control-Allow-Methods', cors.methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', cors.allowedHeaders.join(', '));
    res.setHeader('Access-Control-Max-Age', cors.maxAge.toString());

    if (cors.credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (cors.exposedHeaders.length > 0) {
      res.setHeader('Access-Control-Expose-Headers', cors.exposedHeaders.join(', '));
    }

    res.status(204).end();
    return;
  }

  // Handle actual request
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin!);

    if (cors.credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (cors.exposedHeaders.length > 0) {
      res.setHeader('Access-Control-Expose-Headers', cors.exposedHeaders.join(', '));
    }
  }

  next();
}

// ============ SECURITY HEADERS MIDDLEWARE ============

function buildCspHeader(): string {
  const { directives } = securityConfig.csp;
  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

export function securityHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Remove unsafe headers
  if (securityConfig.hideServerHeader) {
    res.removeHeader('Server');
  }

  if (securityConfig.hidePoweredBy) {
    res.removeHeader('X-Powered-By');
  }

  // X-Content-Type-Options
  if (securityConfig.noSniff) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }

  // X-XSS-Protection (deprecated but still useful for older browsers)
  if (securityConfig.xssFilter) {
    res.setHeader('X-XSS-Protection', '1; mode=block');
  }

  // X-Frame-Options
  if (securityConfig.frameOptions) {
    res.setHeader('X-Frame-Options', securityConfig.frameOptions);
  }

  // Referrer-Policy
  res.setHeader('Referrer-Policy', securityConfig.referrerPolicy);

  // Strict-Transport-Security (HSTS)
  if (securityConfig.hstsEnabled) {
    res.setHeader(
      'Strict-Transport-Security',
      `max-age=${securityConfig.hstsMaxAge}; includeSubDomains; preload`
    );
  }

  // Content-Security-Policy
  if (securityConfig.csp.enabled) {
    res.setHeader('Content-Security-Policy', buildCspHeader());
  }

  // Additional security headers
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // Permissions-Policy (formerly Feature-Policy)
  res.setHeader('Permissions-Policy', [
    'accelerometer=()',
    'camera=()',
    'geolocation=()',
    'gyroscope=()',
    'magnetometer=()',
    'microphone=()',
    'payment=()',
    'usb=()',
  ].join(', '));

  next();
}

// ============ REQUEST LIMITS MIDDLEWARE ============

export function requestLimitsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { limits } = securityConfig;

  // Check URL length
  if (req.url.length > limits.maxUrlLength) {
    res.status(414).json({
      error: 'URI Too Long',
      message: `Request URL exceeds maximum length of ${limits.maxUrlLength} characters`,
    });
    return;
  }

  // Check header count
  const headerCount = Object.keys(req.headers).length;
  if (headerCount > limits.maxHeaderCount) {
    res.status(431).json({
      error: 'Request Header Fields Too Large',
      message: `Too many headers (${headerCount} > ${limits.maxHeaderCount})`,
    });
    return;
  }

  // Check individual header sizes
  for (const [key, value] of Object.entries(req.headers)) {
    const headerValue = Array.isArray(value) ? value.join(', ') : value || '';
    if (headerValue.length > limits.maxHeaderSize) {
      res.status(431).json({
        error: 'Request Header Fields Too Large',
        message: `Header '${key}' exceeds maximum size`,
      });
      return;
    }
  }

  next();
}

// ============ CONTENT TYPE VALIDATION ============

const ALLOWED_CONTENT_TYPES = [
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
];

export function contentTypeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip for GET, HEAD, OPTIONS, DELETE (typically no body)
  if (['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(req.method)) {
    return next();
  }

  const contentType = req.headers['content-type'];

  // If there's no body, skip
  if (!contentType && !req.body) {
    return next();
  }

  // If there's a body, we need a content-type
  if (!contentType) {
    res.status(415).json({
      error: 'Unsupported Media Type',
      message: 'Content-Type header is required for requests with a body',
    });
    return;
  }

  // Check if content type is allowed
  const baseContentType = contentType.split(';')[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.includes(baseContentType)) {
    res.status(415).json({
      error: 'Unsupported Media Type',
      message: `Content-Type '${baseContentType}' is not supported`,
      allowedTypes: ALLOWED_CONTENT_TYPES,
    });
    return;
  }

  next();
}

// ============ XSS PROTECTION ============

// Patterns for potential XSS attacks
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /data:\s*text\/html/gi,
  /<\s*iframe/gi,
  /<\s*object/gi,
  /<\s*embed/gi,
  /<\s*link/gi,
  /<\s*meta/gi,
];

function containsXss(value: unknown): boolean {
  if (typeof value === 'string') {
    for (const pattern of XSS_PATTERNS) {
      if (pattern.test(value)) {
        return true;
      }
      // Reset regex lastIndex
      pattern.lastIndex = 0;
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const val of Object.values(value)) {
      if (containsXss(val)) {
        return true;
      }
    }
  }
  return false;
}

export function xssProtectionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Check URL
  if (containsXss(req.url)) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Potential XSS detected in URL',
    });
    return;
  }

  // Check query params
  if (containsXss(req.query)) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Potential XSS detected in query parameters',
    });
    return;
  }

  // Check body
  if (req.body && containsXss(req.body)) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Potential XSS detected in request body',
    });
    return;
  }

  next();
}

// ============ SQL INJECTION PROTECTION ============

const SQL_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|UNION|DECLARE)\b)/gi,
  /(--)|(\/\*)|(\*\/)/g,
  /(\bOR\b|\bAND\b)\s*\d+\s*=\s*\d+/gi,
  /'\s*(OR|AND)\s*'.*'=/gi,
];

function containsSqlInjection(value: unknown): boolean {
  if (typeof value === 'string') {
    for (const pattern of SQL_PATTERNS) {
      if (pattern.test(value)) {
        return true;
      }
      pattern.lastIndex = 0;
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const val of Object.values(value)) {
      if (containsSqlInjection(val)) {
        return true;
      }
    }
  }
  return false;
}

export function sqlInjectionProtectionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip for paths that might legitimately contain SQL-like content
  const skipPaths = ['/api/admin/query', '/api/analytics/query'];
  if (skipPaths.some(p => req.path.startsWith(p))) {
    return next();
  }

  if (req.body && containsSqlInjection(req.body)) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Potentially malicious content detected',
    });
    return;
  }

  next();
}

// ============ REQUEST ID MIDDLEWARE ============

let requestCounter = 0;

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Use existing request ID or generate new one
  const existingId = req.headers['x-request-id'];
  const requestId = typeof existingId === 'string'
    ? existingId
    : `req_${Date.now()}_${++requestCounter}`;

  // Attach to request and response
  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  next();
}

// ============ COMBINED SECURITY MIDDLEWARE ============

export function createSecurityMiddleware(customConfig?: Partial<SecurityConfig>) {
  if (customConfig) {
    configureSecurityMiddleware(customConfig);
  }

  return [
    requestIdMiddleware,
    requestLimitsMiddleware,
    corsMiddleware,
    securityHeadersMiddleware,
    contentTypeMiddleware,
    xssProtectionMiddleware,
    sqlInjectionProtectionMiddleware,
  ];
}

// ============ EXPRESS CONFIGURATION ============

export const securityMiddleware = createSecurityMiddleware();
