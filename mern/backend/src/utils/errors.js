/**
 * Application error type + express helpers.
 * Controllers/services throw AppError; the central handler renders it.
 * Stack traces are never sent to the client.
 */
class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
    this.expected = true;
  }

  static badRequest(message = 'Invalid request', details) {
    return new AppError(400, message, details);
  }
  static unauthorized(message = 'Not authenticated') {
    return new AppError(401, message);
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(403, message);
  }
  static notFound(message = 'Resource not found') {
    return new AppError(404, message);
  }
  static conflict(message = 'Resource conflict') {
    return new AppError(409, message);
  }
  static tooMany(message = 'Too many requests') {
    return new AppError(429, message);
  }
  static server(message = 'Something went wrong. Please try again.') {
    return new AppError(500, message);
  }
}

/** Wraps an async route handler so rejected promises reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { AppError, asyncHandler };
