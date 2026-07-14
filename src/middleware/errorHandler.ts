import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../utils/errors.js';

/**
 * ERROR HANDLER MIDDLEWARE  (src/middleware/errorHandler.ts)
 *
 * A centralized error handler registered on the Fastify instance.
 * Any AppError thrown in a service or controller bubbles up here.
 * Routes do NOT need try/catch for expected failures — just throw.
 */
export function errorHandler(
  err: FastifyError | AppError | Error,
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  // Domain errors thrown by services (NOT_FOUND, VERSION_CONFLICT, etc.)
  if (err instanceof AppError) {
    return reply.status(err.statusCode).send({
      error: { code: err.code, message: err.message },
    });
  }

  // Fastify's built-in errors (e.g. 400 Bad Request from route parsing)
  const httpErr = err as { statusCode?: number; message: string };
  if (httpErr.statusCode && httpErr.statusCode < 500) {
    return reply.status(httpErr.statusCode).send({
      error: { code: 'BAD_REQUEST', message: httpErr.message },
    });
  }

  // Unexpected errors — log and return 500
  console.error(err);
  return reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
