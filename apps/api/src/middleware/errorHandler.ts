import type { ErrorRequestHandler } from 'express';
import { isHttpError } from 'http-errors';
import { ZodError } from 'zod';
import { getEnvironment } from '@/config/environment.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const env = getEnvironment();

  // Handle HTTP errors from http-errors package
  if (isHttpError(err)) {
    return res.status(err.status).json({
      error: err.message,
      status: err.status,
    });
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation error',
      status: 400,
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    });
  }

  // Handle generic errors
  const isDevelopment = env.NODE_ENV === 'development';
  console.error('[errorHandler] Unhandled error:', err);

  return res.status(500).json({
    error: err instanceof Error ? err.message : 'Internal server error',
    status: 500,
    ...(isDevelopment && err instanceof Error && { stack: err.stack }),
  });
};
