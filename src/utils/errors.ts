/**
 * SHARED ERROR CLASS  (src/lib/errors.ts)
 *
 * WHY A CUSTOM ERROR CLASS?
 * JavaScript's built-in Error only has `message`. We need a `code` (machine-readable
 * string like 'NOT_FOUND') and an HTTP `statusCode` so the global error handler in
 * server.ts can turn any thrown AppError into a proper HTTP response automatically.
 *
 * Pattern used everywhere:
 *   throw new AppError('NOT_FOUND', 'Project not found', 404)
 *
 * The global error handler catches it → sends { error: { code, message } }
 * Routes never need try/catch for expected failures — just throw and let it bubble.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
